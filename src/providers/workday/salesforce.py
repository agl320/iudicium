from __future__ import annotations

from typing import Any

from src.providers.errors import SalesforceAPIError
from src.config import (
    DEFAULT_HEADERS,
    DEFAULT_WORKDAY_PAYLOAD,
    SALESFORCE_API_URL,
    SALESFORCE_COMPANY_URL,
)

from .cxs import WorkdayCxsClient


class SalesforceAPIClient(WorkdayCxsClient):
    """Salesforce Workday CXS client."""

    def __init__(
        self,
        api_url: str = SALESFORCE_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        company: str = "Salesforce",
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_WORKDAY_PAYLOAD,
            error_cls=SalesforceAPIError,
            company=company,
            company_url=SALESFORCE_COMPANY_URL,
        )
