import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

from src.providers.errors import WorkdayAPIError
from src.models import JobPosting


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
    ) -> None:
        self.api_url = api_url
        self.headers = dict(headers or {})
        self.payload = dict(payload or {})
        self.timeout_s = timeout_s
        self.error_cls = error_cls
        self.company = company
        self.company_url = company_url

    def search_raw(
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

        data = json.dumps(payload).encode("utf-8")
        request = Request(
            self.api_url, data=data, headers=request_headers, method="POST"
        )

        try:
            with urlopen(request, timeout=self.timeout_s) as response:
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = ""
            try:
                error_body = exc.read().decode("utf-8", errors="replace")
            except Exception:
                error_body = ""
            detail = f"HTTP {exc.code} {exc.reason}"
            if error_body:
                detail += f": {error_body}"
            raise self.error_cls(f"Workday API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Workday API request failed: {exc}") from exc

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

    def search_job_postings(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        search_text: str | None = None,
        applied_facets: dict[str, Any] | None = None,
    ) -> list[JobPosting]:
        decoded = self.search_raw(
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
                    location=location_str,
                    url=external_path_str,
                )
            )

        return results
