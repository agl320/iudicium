from __future__ import annotations

from typing import Any

from src.providers.errors import CIBCAPIError
from src.config import (
    CIBC_API_URL,
    CIBC_COMPANY_URL,
    DEFAULT_HEADERS,
    DEFAULT_WORKDAY_PAYLOAD,
)

from .cxs import WorkdayCxsClient


class CIBCAPIClient(WorkdayCxsClient):
    def __init__(
        self,
        api_url: str = CIBC_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        company: str = "CIBC",
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_WORKDAY_PAYLOAD,
            error_cls=CIBCAPIError,
            company=company,
            company_url=CIBC_COMPANY_URL,
        )
