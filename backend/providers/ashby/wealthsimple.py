from __future__ import annotations

from backend.providers.errors import WealthsimpleAPIError

from .api import AshbyAPIClient


class WealthsimpleAPIClient(AshbyAPIClient):
    def __init__(
        self,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            timeout_s=timeout_s, headers=headers, error_cls=WealthsimpleAPIError
        )

    def search_raw(self):
        return super().search_raw(organization_hosted_jobs_page_name="wealthsimple")

    def search_job_postings(self):
        decoded = self.search_raw()
        return self._parse_job_postings(
            decoded, company="WealthSimple", company_url="https://wealthsimple.com"
        )
