from __future__ import annotations

from typing import Any

from backend.config import (
    DEFAULT_HEADERS,
    DEFAULT_WORKDAY_PAYLOAD,
    INTEL_API_URL,
    INTEL_COMPANY_URL,
)
from backend.providers.errors import IntelAPIError, WorkdayAPIError

from .cxs import WorkdayCxsClient


class IntelAPIClient(WorkdayCxsClient):
    def __init__(
        self,
        api_url: str = INTEL_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        company: str = "Intel",
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_WORKDAY_PAYLOAD,
            error_cls=IntelAPIError,
            company=company,
            company_url=INTEL_COMPANY_URL,
        )
