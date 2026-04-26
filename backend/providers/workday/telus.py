from __future__ import annotations

from typing import Any

from backend.providers.errors import TelusAPIError
from backend.config import (
    DEFAULT_HEADERS,
    DEFAULT_WORKDAY_PAYLOAD,
    TELUS_API_URL,
    TELUS_COMPANY_URL,
)

from .cxs import WorkdayCxsClient


class TelusAPIClient(WorkdayCxsClient):
    """Telus (LifeWorks) Workday CXS client."""

    def __init__(
        self,
        api_url: str = TELUS_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        company: str = "Telus",
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_WORKDAY_PAYLOAD,
            error_cls=TelusAPIError,
            company=company,
            company_url=TELUS_COMPANY_URL,
        )
