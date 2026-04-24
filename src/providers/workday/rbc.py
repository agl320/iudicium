from __future__ import annotations

from typing import Any

from src.api.errors import RBCAPIError
from src.config import (
    DEFAULT_HEADERS,
    DEFAULT_WORKDAY_PAYLOAD,
    RBC_API_URL,
    RBC_COMPANY_URL,
)

from .cxs import WorkdayCxsClient


class RBCAPIClient(WorkdayCxsClient):
    def __init__(
        self,
        api_url: str = RBC_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        company: str = "RBC",
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_WORKDAY_PAYLOAD,
            error_cls=RBCAPIError,
            company=company,
            company_url=RBC_COMPANY_URL,
        )
