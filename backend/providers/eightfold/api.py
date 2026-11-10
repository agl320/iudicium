from __future__ import annotations

import json
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from backend.config import DEFAULT_HEADERS
from backend.models import JobPosting
from backend.providers.errors import EightfoldAPIError

PAGE_SIZE = 10


class EightfoldClient:
    """Eightfold "PCSX" career site search API (Microsoft, Qualcomm, ...).

    The API returns 10 positions per page and rate limits aggressively, so
    requests are retried on HTTP 429 with a backoff.
    """

    def __init__(
        self,
        host: str,
        *,
        domain: str,
        company: str,
        company_url: str,
        job_url_template: str,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        max_attempts: int = 4,
        error_cls: type[RuntimeError] = EightfoldAPIError,
        api: str = "pcsx",
    ) -> None:
        # "pcsx" (Microsoft, Qualcomm) or the older "v2" API (Netflix).
        self.api = api
        self.host = host
        self.api_url = (
            f"https://{host}/api/apply/v2/jobs"
            if api == "v2"
            else f"https://{host}/api/pcsx/search"
        )
        self.domain = domain
        self.company = company
        self.company_url = company_url
        self.job_url_template = job_url_template
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.max_attempts = max_attempts
        self.error_cls = error_cls

    def search_raw(self, *, query: str = "", start: int = 0) -> dict[str, Any]:
        params = {
            "domain": self.domain,
            "query": query,
            "location": "",
            "start": start,
            "sort_by": "timestamp",
            "hl": "en",
        }
        if self.api == "v2":
            params["num"] = PAGE_SIZE
        request_headers = dict(self.headers)
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")
        request = Request(
            f"{self.api_url}?{urlencode(params)}",
            headers=request_headers,
            method="GET",
        )

        body = ""
        for attempt in range(1, self.max_attempts + 1):
            try:
                with urlopen(request, timeout=self.timeout_s) as response:
                    body = response.read().decode("utf-8")
                break
            except HTTPError as exc:
                if exc.code == 429 and attempt < self.max_attempts:
                    retry_after = exc.headers.get("Retry-After")
                    delay = (
                        float(retry_after)
                        if retry_after and retry_after.isdigit()
                        else 5.0 * attempt
                    )
                    time.sleep(min(delay, 60.0))
                    continue
                error_body = ""
                try:
                    error_body = exc.read().decode("utf-8", errors="replace")
                except Exception:
                    error_body = ""
                detail = f"HTTP {exc.code} {exc.reason}"
                if error_body:
                    detail += f": {error_body[:300]}"
                raise self.error_cls(
                    f"{self.company} Eightfold request failed: {detail}"
                ) from exc
            except URLError as exc:
                raise self.error_cls(
                    f"{self.company} Eightfold request failed: {exc}"
                ) from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls(
                f"{self.company} Eightfold API returned non-JSON response"
            ) from exc

        if not isinstance(decoded, dict):
            raise self.error_cls(
                f"{self.company} Eightfold API returned unexpected JSON shape"
            )

        status = decoded.get("status")
        if status is not None and status not in (200, "200"):
            raise self.error_cls(
                f"{self.company} Eightfold request failed: status={status!r}"
            )
        return decoded

    def search_job_postings_page(
        self, *, query: str = "", start: int = 0
    ) -> tuple[list[JobPosting], int | None]:
        decoded = self.search_raw(query=query, start=start)
        data = decoded if self.api == "v2" else decoded.get("data")
        if not isinstance(data, dict):
            return [], None

        count = data.get("count")
        positions = data.get("positions")
        if not isinstance(positions, list):
            return [], count if isinstance(count, int) else None

        postings: list[JobPosting] = []
        for item in positions:
            if not isinstance(item, dict):
                continue

            title = str(item.get("name") or "")
            position_id = item.get("id")
            if not title or position_id is None:
                continue

            location = ""
            for key in ("locations", "standardizedLocations"):
                values = item.get(key)
                if isinstance(values, list):
                    location = " | ".join(str(v).strip() for v in values if v)
                if location:
                    break

            postings.append(
                JobPosting(
                    source=self.api_url,
                    title=title,
                    company=self.company,
                    company_url=self.company_url,
                    location=location,
                    url=(
                        self.job_url_template.format(id=position_id)
                        if self.job_url_template
                        else str(item.get("canonicalPositionUrl") or "")
                    ),
                    external_id=str(position_id),
                )
            )

        return postings, count if isinstance(count, int) else None

    def get_details(self, position_id: str) -> tuple[str, list[str]]:
        """(description html, locations) for one position."""
        if self.api == "v2":
            url = f"https://{self.host}/api/apply/v2/jobs/{position_id}?" + urlencode(
                {"domain": self.domain}
            )
            description_key = "job_description"
        else:
            url = f"https://{self.host}/api/pcsx/position_details?" + urlencode(
                {"position_id": position_id, "domain": self.domain, "hl": "en"}
            )
            description_key = "jobDescription"
        request = Request(
            url,
            headers={"Accept": "application/json", "User-Agent": "iudicium/0.1"},
        )
        with urlopen(request, timeout=self.timeout_s) as response:
            decoded = json.loads(response.read().decode("utf-8"))
        data = decoded.get("data") if isinstance(decoded.get("data"), dict) else decoded
        locations = data.get("locations") or data.get("standardizedLocations") or []
        return str(data.get(description_key) or ""), [str(x) for x in locations if x]
