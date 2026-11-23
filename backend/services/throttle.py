"""Being a polite client: per-host pacing, retry delays and request counting.

- Pacing: many companies share one host (dozens of Workday tenants live on
  wd1/wd5.myworkdayjobs.com). Requests to the same host go through one gate:
  at most `per_host` at a time, `min_interval` seconds apart. That is what
  keeps a whole run under a host's rate limit, instead of each company
  backing off on its own.
- Retry delays: HTTP 429/5xx and timeouts are worth another try; the server's
  Retry-After wins, else exponential backoff with jitter.
- Counting: every request made while polling a company is counted, so a dry
  run shows what each board actually costs (see `python -m backend --dry-run`).
"""

from __future__ import annotations

import asyncio
import contextvars
import random
import threading
import time
import urllib.request
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

RETRYABLE_STATUS = frozenset({408, 425, 429, 500, 502, 503, 504})
MAX_DELAY_SECONDS = 60.0


def retry_delay(attempt: int, retry_after: str | None = None, base: float = 2.0) -> float:
    """Seconds to wait before attempt `attempt + 1` (attempt starts at 1)."""
    if retry_after:
        value = retry_after.strip()
        if value.isdigit():
            return min(float(value), MAX_DELAY_SECONDS)
        try:  # HTTP-date
            seconds = parsedate_to_datetime(value).timestamp() - time.time()
            return max(0.0, min(seconds, MAX_DELAY_SECONDS))
        except (TypeError, ValueError):
            pass
    return min(base * (2 ** (attempt - 1)) + random.uniform(0, base), MAX_DELAY_SECONDS)


# --- Request counting -------------------------------------------------------------


@dataclass
class RequestLog:
    """Requests made for one company in one run (shared with worker threads)."""

    count: int = 0
    retries: int = 0
    hosts: dict[str, int] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def add(self, url: str, *, retry: bool = False) -> None:
        host = urlsplit(url).hostname or "?"
        with self.lock:
            self.count += 1
            self.retries += int(retry)
            self.hosts[host] = self.hosts.get(host, 0) + 1


current_log: contextvars.ContextVar[RequestLog | None] = contextvars.ContextVar("iudicium_request_log", default=None)


def count_request(url: str, *, retry: bool = False) -> None:
    log = current_log.get()
    if log is not None:
        log.add(url, retry=retry)


class _CountingHandler(urllib.request.BaseHandler):
    """Counts every urllib request (most provider clients use urlopen)."""

    handler_order = 100

    def http_request(self, request):
        count_request(request.full_url)
        return request

    https_request = http_request


_installed = False


def install_request_counter() -> None:
    """Route urlopen() through the counter. Idempotent."""
    global _installed
    if not _installed:
        urllib.request.install_opener(urllib.request.build_opener(_CountingHandler()))
        _installed = True


# --- Per-host pacing ----------------------------------------------------------------


@dataclass
class _Gate:
    semaphore: asyncio.Semaphore
    min_interval: float
    next_at: float = 0.0
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class HostThrottle:
    """At most `per_host` requests in flight per host, `min_interval` apart."""

    def __init__(self, per_host: int = 2, min_interval: float = 0.35) -> None:
        self.per_host = max(1, per_host)
        self.min_interval = max(0.0, min_interval)
        self._gates: dict[tuple[int, str], _Gate] = {}

    def _gate(self, host: str) -> _Gate:
        # Gates are tied to the running event loop (asyncio primitives are).
        key = (id(asyncio.get_running_loop()), host)
        gate = self._gates.get(key)
        if gate is None:
            gate = self._gates[key] = _Gate(asyncio.Semaphore(self.per_host), self.min_interval)
        return gate

    @asynccontextmanager
    async def slot(self, url: str):
        gate = self._gate(urlsplit(url).hostname or "?")
        async with gate.semaphore:
            async with gate.lock:
                wait = gate.next_at - time.monotonic()
                if wait > 0:
                    await asyncio.sleep(wait)
                gate.next_at = time.monotonic() + gate.min_interval
            yield

    def slow_down(self, url: str, seconds: float) -> None:
        """A 429 from this host: everyone waits, not just the request that got it."""
        try:
            gate = self._gate(urlsplit(url).hostname or "?")
        except RuntimeError:  # no running loop
            return
        gate.next_at = max(gate.next_at, time.monotonic() + seconds)


# Shared by every async client in the process.
throttle = HostThrottle()


def configure(per_host: int, min_interval: float) -> None:
    throttle.per_host = max(1, per_host)
    throttle.min_interval = max(0.0, min_interval)
    throttle._gates.clear()
