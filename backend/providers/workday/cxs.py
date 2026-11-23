import json
import re
import random
import asyncio
import logging
from typing import Any
from urllib.parse import urljoin, urlsplit

import aiohttp

from backend.providers.errors import WorkdayAPIError
from backend.models import JobPosting
from backend.config.config import COMPANY_URL_MAPPING
from backend.services.throttle import RETRYABLE_STATUS, count_request, retry_delay, throttle


class WorkdayCxsClient:
    """Generic Workday Careers (CXS) JSON API client.

    This is intentionally minimal: it POSTs a JSON payload to the configured CXS
    endpoint and returns the decoded JSON object.
    """

    def __init__(
        self,
        api_url: str,
        *,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        timeout_s: float = 30.0,
        error_cls: type[RuntimeError] = WorkdayAPIError,
        company: str = "",
        company_url: str | None = None,
        max_attempts: int = 5,
        backoff_base: float = 2.0,
    ) -> None:
        self.max_attempts = max(1, max_attempts)
        self.backoff_base = backoff_base
        self.api_url = api_url
        self.headers = dict(headers or {})
        self.payload = dict(payload or {})
        self.timeout_s = timeout_s
        self.error_cls = error_cls
        self.company = company
        self.company_url = company_url

    async def search_raw(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        search_text: str | None = None,
        applied_facets: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = dict(self.payload)
        if limit is not None:
            payload["limit"] = limit
        if offset is not None:
            payload["offset"] = offset
        if search_text is not None:
            payload["searchText"] = search_text

        if applied_facets is not None:
            base_facets: dict[str, Any] = {}
            existing_facets = payload.get("appliedFacets")
            if isinstance(existing_facets, dict):
                base_facets.update(existing_facets)
            base_facets.update(applied_facets)
            payload["appliedFacets"] = base_facets

        request_headers = dict(self.headers)
        request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        logger = logging.getLogger(__name__)
        # Workday rate limits per host (many tenants share wd1/wd5), so every
        # request waits its turn at that host's gate. HTTP 429/5xx and network
        # errors are retried, honouring Retry-After; other 4xx fail at once.
        body = None
        for attempt in range(1, self.max_attempts + 1):
            timeout = aiohttp.ClientTimeout(total=self.timeout_s)
            retry_after: str | None = None
            try:
                async with throttle.slot(self.api_url):
                    count_request(self.api_url, retry=attempt > 1)
                    async with aiohttp.ClientSession(timeout=timeout) as session:
                        async with session.post(
                            self.api_url,
                            json=payload,
                            headers=request_headers,
                        ) as response:
                            body = await response.text()
                            status = response.status
                            retry_after = response.headers.get("Retry-After")
                            reason = response.reason
                if status < 400:
                    break
                detail = f"HTTP {status} {reason}"
                if status not in RETRYABLE_STATUS or attempt >= self.max_attempts:
                    if body and status not in RETRYABLE_STATUS:
                        detail += f": {body[:300]}"
                    raise self.error_cls(f"Workday API request failed: {detail}")
                delay = retry_delay(attempt, retry_after, base=self.backoff_base)
                if status == 429:
                    throttle.slow_down(self.api_url, delay)
                logger.warning(
                    "Workday %s from %s (attempt %d/%d); retrying in %.1fs",
                    detail, self.api_url, attempt, self.max_attempts, delay,
                )
                await asyncio.sleep(delay)
            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                if attempt >= self.max_attempts:
                    raise self.error_cls(
                        f"Workday API request failed after {attempt} attempts: {exc or exc.__class__.__name__}"
                    ) from exc
                delay = retry_delay(attempt, base=self.backoff_base)
                logger.warning(
                    "Workday request to %s failed (%s, attempt %d/%d); retrying in %.1fs",
                    self.api_url, exc or exc.__class__.__name__, attempt, self.max_attempts, delay,
                )
                await asyncio.sleep(delay)

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls("Workday API returned non-JSON response") from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("Workday API returned unexpected JSON shape")
        return decoded

    def _build_job_url(self, external_path: Any) -> str:
        if external_path is None:
            return ""

        external_path_str = str(external_path).strip()
        if not external_path_str:
            return ""

        if external_path_str.startswith(("http://", "https://")):
            return external_path_str

        if self.company_url:
            company_url_parts = urlsplit(self.company_url)
            company_path = company_url_parts.path.strip("/")
            job_id = external_path_str.rstrip("/").split("/")[-1]
            if company_path and job_id:
                path_segments = company_path.split("/", 1)
                has_locale_prefix = bool(
                    path_segments
                    and re.fullmatch(r"[a-z]{2}-[A-Z]{2}", path_segments[0])
                )
                details_base_path = (
                    company_path if has_locale_prefix else f"en-US/{company_path}"
                )
                return (
                    f"{company_url_parts.scheme}://{company_url_parts.netloc}"
                    f"/{details_base_path}/details/{job_id}"
                )

        api_url_parts = urlsplit(self.api_url)
        site_base_url = f"{api_url_parts.scheme}://{api_url_parts.netloc}"
        return urljoin(site_base_url, external_path_str)

    async def search_job_postings(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        search_text: str | None = None,
        applied_facets: dict[str, Any] | None = None,
    ) -> list[JobPosting]:
        decoded = await self.search_raw(
            limit=limit,
            offset=offset,
            search_text=search_text,
            applied_facets=applied_facets,
        )

        job_postings = decoded.get("jobPostings")
        if not isinstance(job_postings, list):
            return []

        results: list[JobPosting] = []
        for job in job_postings:
            if not isinstance(job, dict):
                continue

            title = job.get("title")
            title_str = str(title) if title is not None else ""

            location = job.get("locationsText")
            location_str = str(location) if location is not None else ""

            external_path = job.get("externalPath")
            external_path_str = self._build_job_url(external_path)

            results.append(
                JobPosting(
                    source=self.api_url,
                    title=title_str,
                    company=self.company,
                    company_url=COMPANY_URL_MAPPING.get(self.company, ""),
                    location=location_str,
                    url=external_path_str,
                    external_id=str(external_path or ""),
                )
            )

        return results

    async def search_job_postings_page(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        search_text: str | None = None,
        applied_facets: dict[str, Any] | None = None,
    ) -> tuple[list[JobPosting], int | None]:
        decoded = await self.search_raw(
            limit=limit,
            offset=offset,
            search_text=search_text,
            applied_facets=applied_facets,
        )

        job_postings = decoded.get("jobPostings")
        total = decoded.get("total")

        if not isinstance(job_postings, list):
            return [], total if isinstance(total, int) else None

        results: list[JobPosting] = []
        for job in job_postings:
            if not isinstance(job, dict):
                continue

            title = job.get("title")
            title_str = str(title) if title is not None else ""

            location = job.get("locationsText")
            location_str = str(location) if location is not None else ""

            external_path = job.get("externalPath")
            external_path_str = self._build_job_url(external_path)

            results.append(
                JobPosting(
                    source=self.api_url,
                    title=title_str,
                    company=self.company,
                    company_url=COMPANY_URL_MAPPING.get(self.company, ""),
                    location=location_str,
                    url=external_path_str,
                    external_id=str(external_path or ""),
                )
            )

        return results, total if isinstance(total, int) else None
