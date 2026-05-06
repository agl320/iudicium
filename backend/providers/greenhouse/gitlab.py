from __future__ import annotations

from backend.config import DEFAULT_HEADERS, GITLAB_GREENHOUSE_API_URL
from backend.models import JobPosting
from backend.providers.errors import GreenhouseAPIError

from .board import GreenhouseBoardClient


class GitLabGreenhouseAPIClient(GreenhouseBoardClient):
    def __init__(
        self,
        api_url: str = GITLAB_GREENHOUSE_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        params: dict | None = None,
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            params=params,
            error_cls=GreenhouseAPIError,
        )

    def search_job_postings(
        self,
        *,
        page: int | None = 1,
        per_page: int | None = 20,
        params: dict | None = None,
    ) -> list[JobPosting]:
        decoded = self.search_raw(page=page, per_page=per_page, params=params)
        jobs = decoded.get("jobs")
        if not isinstance(jobs, list):
            return []

        results: list[JobPosting] = []
        seen_urls: set[str] = set()

        for job in jobs:
            if not isinstance(job, dict):
                continue

            title = str(job.get("title") or "")
            job_id = job.get("id")
            if job_id is None:
                continue

            url = f"https://job-boards.greenhouse.io/gitlab/jobs/{job_id}"
            location = ""
            location_value = job.get("location")
            if isinstance(location_value, dict):
                location = str(location_value.get("name") or "")
            elif location_value is not None:
                location = str(location_value)

            company_name = "GitLab"
            company_url = "gitlab.com"

            if not title or url in seen_urls:
                continue

            seen_urls.add(url)
            results.append(
                JobPosting(
                    source=self.api_url,
                    title=title,
                    company=company_name,
                    company_url=company_url,
                    location=location,
                    url=url,
                )
            )

        return results
