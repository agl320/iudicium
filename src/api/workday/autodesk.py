from __future__ import annotations

from typing import Any

from src.api.errors import AutodeskAPIError
from src.config import AUTODESK_API_URL, DEFAULT_HEADERS, DEFAULT_WORKDAY_PAYLOAD

from .cxs import WorkdayCxsClient


class AutodeskAPIClient(WorkdayCxsClient):
    """Autodesk Workday CXS client."""

    def __init__(
        self,
        api_url: str = AUTODESK_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_WORKDAY_PAYLOAD,
            error_cls=AutodeskAPIError,
        )
