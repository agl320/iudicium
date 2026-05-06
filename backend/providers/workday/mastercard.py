from __future__ import annotations

from typing import Any

from backend.config import (
    DEFAULT_HEADERS,
    DEFAULT_WORKDAY_PAYLOAD,
    MASTERCARD_API_URL,
    MASTERCARD_COMPANY_URL,
)
from backend.providers.errors import WorkdayAPIError

from .cxs import WorkdayCxsClient


class MastercardAPIClient(WorkdayCxsClient):
    def __init__(
        self,
        api_url: str = MASTERCARD_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        company: str = "Mastercard",
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_WORKDAY_PAYLOAD,
            error_cls=WorkdayAPIError,
            company=company,
            company_url=MASTERCARD_COMPANY_URL,
        )
