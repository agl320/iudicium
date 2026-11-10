"""Reads job detail pages for postings a track filter needs more facts about.

List APIs rarely include pay, and Workday only says "3 Locations", so when a
track filter (filters.toml) asks for a salary or a specific region, postings
that pass everything else get their detail page read here. Only those
candidates are fetched, and results are cached in the database, so this stays
at a handful of requests per company per run.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, replace
from typing import Callable
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from backend.config.loader import Company, Settings, Track
from backend.models import JobPosting
from backend.providers.eightfold import EightfoldClient
from backend.providers.oraclecloud import OracleCloudClient
from backend.providers.tesla import TeslaClient
from backend.services.classifier import needs_details
from backend.services.location import is_unknown_location
from backend.services.salary import with_salary

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
TIMEOUT_S = 30.0
CONCURRENCY = 4
DELAY_SECONDS = 0.3
# Providers whose list API already carries everything the detail page has.
NO_DETAILS = {"lever", "ashby"}


@dataclass(frozen=True)
class Details:
    text: str
    locations: tuple[str, ...] = ()


def _get(url: str, *, data: bytes | None = None, accept: str = "application/json") -> str:
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    if data is not None:
        headers["Content-Type"] = "application/json"
    with urlopen(Request(url, data=data, headers=headers), timeout=TIMEOUT_S) as response:
        return response.read().decode("utf-8", errors="replace")


def _workday(company: Company, posting: JobPosting) -> Details:
    host, site = company.option("host"), company.option("site")
    tenant = host.split(".")[0]
    path = posting.external_id or f"/job/x/{posting.url.rstrip('/').split('/')[-1]}"
    decoded = json.loads(
        _get(f"https://{host}.myworkdayjobs.com/wday/cxs/{tenant}/{site}{quote(path)}")
    )
    info = decoded.get("jobPostingInfo") or {}
    locations = [info.get("location"), *(info.get("additionalLocations") or [])]
    return Details(
        str(info.get("jobDescription") or ""),
        tuple(str(loc) for loc in locations if loc),
    )


def _eightfold(company: Company, posting: JobPosting) -> Details:
    client = EightfoldClient(
        company.option("host"),
        domain=company.option("domain_param"),
        company=company.name,
        company_url=company.domain,
        job_url_template="",
        api=str(company.options.get("api", "pcsx")),
    )
    text, locations = client.get_details(posting.external_id)
    return Details(text, tuple(locations))


def _oraclecloud(company: Company, posting: JobPosting) -> Details:
    client = OracleCloudClient(
        f"https://{company.option('host')}.oraclecloud.com/hcmRestApi/resources/"
        "latest/recruitingCEJobRequisitions",
        company=company.name,
        company_url=company.domain,
        site_number=company.option("site"),
    )
    text, locations = client.get_details(posting.external_id)
    return Details(text, tuple(locations))


def _greenhouse(company: Company, posting: JobPosting) -> Details:
    board = company.option("board")
    decoded = json.loads(
        _get(
            f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/"
            f"{posting.external_id}?" + urlencode({"pay_transparency": "true"})
        )
    )
    # Structured pay ranges first so they win over ranges in the prose.
    pay = []
    for pay_range in decoded.get("pay_input_ranges") or []:
        currency = str(pay_range.get("currency_type") or "")
        low = (pay_range.get("min_cents") or 0) / 100
        high = (pay_range.get("max_cents") or 0) / 100
        pay.append(f"{pay_range.get('title', '')} {currency} ${low:,.2f} - ${high:,.2f}")
    location = (decoded.get("location") or {}).get("name") or ""
    return Details("\n".join([*pay, str(decoded.get("content") or "")]), (location,) if location else ())


def _tesla(company: Company, posting: JobPosting) -> Details:
    text, locations = TeslaClient().get_details(posting.external_id)
    return Details(text, tuple(locations))


def _html(company: Company, posting: JobPosting) -> Details:
    """Server-rendered job pages (Apple, Google, SAP, TELUS, EA, lululemon...)."""
    return Details(_get(posting.url, accept="text/html,application/xhtml+xml"))


FETCHERS: dict[str, Callable[[Company, JobPosting], Details]] = {
    "workday": _workday,
    "eightfold": _eightfold,
    "oraclecloud": _oraclecloud,
    "greenhouse": _greenhouse,
    "tesla": _tesla,
}


def apply_details(posting: JobPosting, details: Details) -> JobPosting:
    locations = tuple(dict.fromkeys(loc.strip() for loc in details.locations if loc.strip()))
    location = posting.location
    if locations and (is_unknown_location(location) or len(locations) > 1):
        location = "; ".join(locations)
    return with_salary(
        replace(posting, location=location, details_checked=True), details.text
    )


def _fetch_one(company: Company, posting: JobPosting) -> JobPosting:
    fetch = FETCHERS.get(company.provider, _html)
    if fetch is not _html and not posting.external_id and company.provider != "workday":
        fetch = _html
    details = fetch(company, posting)
    time.sleep(DELAY_SECONDS)
    return apply_details(posting, details)


async def enrich(
    company: Company,
    postings: list[JobPosting],
    tracks: tuple[Track, ...],
    settings: Settings,
) -> list[JobPosting]:
    """Returns `postings` with detail pages read for the ones that need it.
    Failures leave a posting unchanged, so it is retried next run."""
    if company.provider in NO_DETAILS:
        return postings
    todo = [i for i, p in enumerate(postings) if needs_details(p, tracks)]
    limit = max(0, settings.max_detail_fetches_per_company)
    if len(todo) > limit:
        logger.info(
            "%s: %d postings need details, reading the first %d",
            company.name, len(todo), limit,
        )
        todo = todo[:limit]
    if not todo:
        return postings

    semaphore = asyncio.Semaphore(CONCURRENCY)
    result = list(postings)

    async def run(index: int) -> None:
        async with semaphore:
            try:
                result[index] = await asyncio.to_thread(_fetch_one, company, postings[index])
            except Exception as exc:  # one bad page must not stop the run
                logger.debug("%s: details for %s failed: %s", company.name, postings[index].url, exc)

    await asyncio.gather(*(run(i) for i in todo))
    return result
