from __future__ import annotations

from src.api.errors import SnowflakeAPIError

from .api import AshbyAPIClient


class SnowflakeAPIClient(AshbyAPIClient):
    def __init__(
        self,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            timeout_s=timeout_s, headers=headers, error_cls=SnowflakeAPIError
        )

    def search_raw(self):
        return super().search_raw(organization_hosted_jobs_page_name="snowflake")
