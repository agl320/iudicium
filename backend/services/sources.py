"""Turns a company entry from companies.toml into a list of job postings.

Each provider adapter knows how to ask its board for the postings each track
cares about (e.g. Workday: intern facet / full-time facet + keyword search),
so the poller does not need to know anything provider specific.
"""

from __future__ import annotations

import asyncio
import importlib
import logging
import re
import time
from dataclasses import replace
from typing import Any, Awaitable, Callable
from urllib.parse import urlencode

from backend.config import DEFAULT_HEADERS, DEFAULT_WORKDAY_PAYLOAD
from backend.config.loader import Company, ConfigError, Settings, Track
from backend.models import JobPosting
from backend.providers.amd.api import AMDClient
from backend.providers.ashby.api import AshbyAPIClient
from backend.providers.eightfold import EightfoldClient
from backend.providers.eightfold.api import PAGE_SIZE as EIGHTFOLD_PAGE_SIZE
from backend.providers.greenhouse.board import GreenhouseBoardClient
from backend.providers.oraclecloud import OracleCloudClient
from backend.providers.smartrecruiters import SmartRecruitersClient
from backend.providers.workday.cxs import WorkdayCxsClient

logger = logging.getLogger(__name__)

# Workday facet labels differ per tenant ("Intern (Fixed Term)",
# "Student / Intern", "Intern/Co-op", "Full time", ...), so match by label.
WORKDAY_INTERN_LABEL = re.compile(r"intern|co-?op|student|trainee|apprentice", re.I)
WORKDAY_FULL_TIME_LABEL = re.compile(r"full[\s-]?time", re.I)
WORKDAY_INTERN_FACETS = ("workerSubType", "jobFamilyGroup", "workerType")
WORKDAY_FULL_TIME_FACETS = ("timeType",)
WORKDAY_PAGE_SIZE = 20

AMD_API_URL = "https://careers.amd.com/api/jobs"
AMD_PAGE_SIZE = 10


# --- Workday ---------------------------------------------------------------


def _walk_workday_facets(facets: Any, parent: str = ""):
    """Yields (facetParameter, descriptor, id) including nested facet groups."""
    if not isinstance(facets, list):
        return
    for facet in facets:
        if not isinstance(facet, dict):
            continue
        parameter = str(facet.get("facetParameter") or parent)
        values = facet.get("values")
        if isinstance(values, list) and values and "facetParameter" in values[0]:
            yield from _walk_workday_facets(values, parameter)
            continue
        for value in values or []:
            if isinstance(value, dict) and value.get("id"):
                yield parameter, str(value.get("descriptor") or ""), str(value["id"])


def _resolve_workday_facet(
    facets: Any, parameters: tuple[str, ...], label: re.Pattern[str]
) -> dict[str, list[str]]:
    """Picks the first facet parameter (in priority order) that has values whose
    label matches. Workday ANDs separate parameters, so only one is used."""
    found: dict[str, list[str]] = {}
    for parameter, descriptor, value_id in _walk_workday_facets(facets):
        if parameter in parameters and label.search(descriptor):
            found.setdefault(parameter, []).append(value_id)
    for parameter in parameters:
        if parameter in found:
            return {parameter: found[parameter]}
    return {}


async def _collect_workday(
    client: WorkdayCxsClient,
    *,
    search_text: str,
    facets: dict[str, list[str]],
    max_jobs: int,
) -> list[JobPosting]:
    collected: list[JobPosting] = []
    offset = 0
    total: int | None = None

    while len(collected) < max_jobs:
        request_limit = min(WORKDAY_PAGE_SIZE, max_jobs - len(collected))
        page, reported_total = await client.search_job_postings_page(
            limit=request_limit,
            offset=offset,
            search_text=search_text,
            applied_facets=facets,
        )
        # Workday only reports the total on the first page.
        if total is None and isinstance(reported_total, int):
            total = reported_total
        if not page:
            break

        collected.extend(page)
        offset += WORKDAY_PAGE_SIZE
        if (total is not None and offset >= total) or len(page) < request_limit:
            break
        await asyncio.sleep(0.25)

    return collected


async def fetch_workday(
    company: Company, tracks: tuple[Track, ...], settings: Settings
) -> list[JobPosting]:
    host = company.option("host")
    site = company.option("site")
    tenant = host.split(".")[0]
    base_url = f"https://{host}.myworkdayjobs.com"
    client = WorkdayCxsClient(
        f"{base_url}/wday/cxs/{tenant}/{site}/jobs",
        headers=DEFAULT_HEADERS,
        payload={**DEFAULT_WORKDAY_PAYLOAD, "appliedFacets": {}},
        company=company.name,
        company_url=f"{base_url}/en-US/{site}",
    )

    overrides: dict[str, Any] = company.options.get("facets", {})
    available_facets = (await client.search_raw(limit=1, offset=0)).get("facets")

    postings: list[JobPosting] = []
    for track in tracks:
        if track.employment == "intern":
            facets = overrides.get(track.key) or _resolve_workday_facet(
                available_facets, WORKDAY_INTERN_FACETS, WORKDAY_INTERN_LABEL
            )
            hint = "intern" if facets else ""
            # The intern facet already narrows things down; no keywords needed.
            queries = [""] if facets else list(track.search_terms or [""])
        elif track.employment == "full_time":
            facets = overrides.get(track.key) or _resolve_workday_facet(
                available_facets, WORKDAY_FULL_TIME_FACETS, WORKDAY_FULL_TIME_LABEL
            )
            hint = "full_time" if facets else ""
            queries = list(track.search_terms or [""])
        else:
            facets, hint = overrides.get(track.key, {}), ""
            queries = list(track.search_terms or [""])

        for query in queries:
            results = await _collect_workday(
                client,
                search_text=query,
                facets=facets,
                max_jobs=settings.max_jobs_per_query,
            )
            postings.extend(replace(p, employment_type=hint) for p in results)

    return postings


# --- Keyword-search providers (sync clients, run in a thread) --------------


def _queries_for(tracks: tuple[Track, ...]) -> list[str]:
    queries: list[str] = []
    for track in tracks:
        for term in track.search_terms or [""]:
            if term not in queries:
                queries.append(term)
    return queries


def _fetch_eightfold(
    company: Company, tracks: tuple[Track, ...], settings: Settings
) -> list[JobPosting]:
    client = EightfoldClient(
        company.option("host"),
        domain=company.option("domain_param"),
        company=company.name,
        company_url=company.domain,
        job_url_template=company.option("job_url_template"),
    )
    # Results are sorted newest first and the API rate limits hard, so only
    # look at the first few pages of each query.
    max_pages = int(company.options.get("max_pages", 3))
    postings: list[JobPosting] = []
    for query in _queries_for(tracks):
        for page in range(max_pages):
            results, count = client.search_job_postings_page(
                query=query, start=page * EIGHTFOLD_PAGE_SIZE
            )
            postings.extend(results)
            time.sleep(1.0)
            if not results or (count is not None and (page + 1) * EIGHTFOLD_PAGE_SIZE >= count):
                break
    return postings


def _fetch_amd(
    company: Company, tracks: tuple[Track, ...], settings: Settings
) -> list[JobPosting]:
    client = AMDClient(AMD_API_URL, company=company.name)
    max_pages = max(1, settings.max_jobs_per_query // AMD_PAGE_SIZE)
    postings: list[JobPosting] = []
    for query in _queries_for(tracks):
        for page in range(1, max_pages + 1):
            params = {"sortBy": "posted_date", "internal": "false", "page": page}
            if query:
                params["keywords"] = query
            results = client.search_job_postings(f"{AMD_API_URL}?{urlencode(params)}")
            postings.extend(results)
            if len(results) < AMD_PAGE_SIZE:
                break
    return postings


def _fetch_oraclecloud(
    company: Company, tracks: tuple[Track, ...], settings: Settings
) -> list[JobPosting]:
    host = company.option("host")
    client = OracleCloudClient(
        f"https://{host}.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions",
        company=company.name,
        company_url=company.domain,
        site_number=company.option("site"),
        job_url_template=company.options.get("job_url_template", ""),
    )
    postings: list[JobPosting] = []
    for query in _queries_for(tracks):
        postings.extend(
            client.search_job_postings(keyword=query, max_jobs=settings.max_jobs_per_query)
        )
    return postings


# --- Full-listing providers: fetch everything, classify locally -----------


def _fetch_greenhouse(
    company: Company, tracks: tuple[Track, ...], settings: Settings
) -> list[JobPosting]:
    board = company.option("board")
    client = GreenhouseBoardClient(
        f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs",
        headers=DEFAULT_HEADERS,
    )
    # The boards API returns every job in one response.
    return client.search_job_postings(page=None, per_page=None)


def _fetch_ashby(
    company: Company, tracks: tuple[Track, ...], settings: Settings
) -> list[JobPosting]:
    board = company.option("board")
    client = AshbyAPIClient()
    decoded = client.search_raw(organization_hosted_jobs_page_name=board)
    return client._parse_job_postings(
        decoded, company=company.name, company_url=company.domain, board=board
    )


def _fetch_smartrecruiters(
    company: Company, tracks: tuple[Track, ...], settings: Settings
) -> list[JobPosting]:
    board = company.option("board")
    client = SmartRecruitersClient(
        f"https://api.smartrecruiters.com/v1/companies/{board}/postings",
        company=company.name,
        company_url=company.domain,
    )
    return client.search_job_postings()


def _fetch_custom(
    company: Company, tracks: tuple[Track, ...], settings: Settings
) -> list[JobPosting]:
    module_name, _, class_name = str(company.option("client")).partition(":")
    try:
        client_cls = getattr(importlib.import_module(module_name), class_name)
    except (ImportError, AttributeError) as exc:
        raise ConfigError(f"Company {company.name!r}: cannot load client: {exc}") from exc
    return client_cls().search_job_postings()


def _threaded(
    fetch: Callable[[Company, tuple[Track, ...], Settings], list[JobPosting]],
) -> Callable[[Company, tuple[Track, ...], Settings], Awaitable[list[JobPosting]]]:
    async def run(company: Company, tracks: tuple[Track, ...], settings: Settings):
        return await asyncio.to_thread(fetch, company, tracks, settings)

    return run


FETCHERS: dict[
    str, Callable[[Company, tuple[Track, ...], Settings], Awaitable[list[JobPosting]]]
] = {
    "workday": fetch_workday,
    "eightfold": _threaded(_fetch_eightfold),
    "amd": _threaded(_fetch_amd),
    "oraclecloud": _threaded(_fetch_oraclecloud),
    "greenhouse": _threaded(_fetch_greenhouse),
    "ashby": _threaded(_fetch_ashby),
    "smartrecruiters": _threaded(_fetch_smartrecruiters),
    "custom": _threaded(_fetch_custom),
}


async def fetch_company(
    company: Company, tracks: tuple[Track, ...], settings: Settings
) -> list[JobPosting]:
    """Fetches a company's postings with consistent company name/domain."""
    postings = await FETCHERS[company.provider](company, tracks, settings)
    return [
        replace(posting, company=company.name, company_url=company.domain)
        for posting in postings
        if posting.title and posting.url
    ]
