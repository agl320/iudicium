from __future__ import annotations

from src.api.errors import PerplexityAPIError

from .api import AshbyAPIClient


class PerplexityAPIClient(AshbyAPIClient):
    def __init__(
        self,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            timeout_s=timeout_s, headers=headers, error_cls=PerplexityAPIError
        )

    def search_raw(self):
        return super().search_raw(organization_hosted_jobs_page_name="perplexity")
