from __future__ import annotations

from typing import Any

from backend.config import (
    CAPITALONE_API_URL,
    CAPITALONE_COMPANY_URL,
    DEFAULT_HEADERS,
    DEFAULT_WORKDAY_PAYLOAD,
)
from backend.providers.errors import CapitalOneAPIError

from .cxs import WorkdayCxsClient


class CapitalOneAPIClient(WorkdayCxsClient):
    """Capital One Workday client."""

    def __init__(
        self,
        api_url: str = CAPITALONE_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        company: str = "Capital One",
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_WORKDAY_PAYLOAD,
            error_cls=CapitalOneAPIError,
            company=company,
            company_url=CAPITALONE_COMPANY_URL,
        )