from __future__ import annotations

from backend.config import (
    DATADOG_API_KEY,
    DATADOG_API_URL,
    DATADOG_PAYLOAD,
    DEFAULT_HEADERS,
)
from backend.providers.errors import DatadogAPIError

from .api import DatadogClient


class DatadogAPIClient(DatadogClient):
    def __init__(
        self,
        api_url: str = DATADOG_API_URL,
        *,
        api_key: str = DATADOG_API_KEY,
        payload: dict | None = None,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            api_url=api_url,
            api_key=api_key,
            payload=payload or DATADOG_PAYLOAD,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            error_cls=DatadogAPIError,
        )
