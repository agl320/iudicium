from __future__ import annotations

from typing import Any

from backend.providers.errors import NvidiaAPIError
from backend.config import (
    DEFAULT_HEADERS,
    DEFAULT_WORKDAY_PAYLOAD,
    NVIDIA_API_URL,
    NVIDIA_COMPANY_URL,
)

from .cxs import WorkdayCxsClient


class NvidiaAPIClient(WorkdayCxsClient):
    """NVIDIA Workday client."""

    def __init__(
        self,
        api_url: str = NVIDIA_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        company: str = "NVIDIA",
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_WORKDAY_PAYLOAD,
            error_cls=NvidiaAPIError,
            company=company,
            company_url=NVIDIA_COMPANY_URL,
        )
