from __future__ import annotations

from backend.config import DATABRICKS_API_URL, DEFAULT_HEADERS
from backend.providers.errors import DatabricksAPIError

from .api import DatabricksClient


class DatabricksAPIClient(DatabricksClient):
    def __init__(
        self,
        api_url: str = DATABRICKS_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            api_url=api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            error_cls=DatabricksAPIError,
        )
