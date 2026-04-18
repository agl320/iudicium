from __future__ import annotations

from typing import Any

from src.api.errors import TDAPIError
from src.api.workday_cxs import WorkdayCxsClient
from src.config import DEFAULT_HEADERS, DEFAULT_PAYLOAD, TD_API_URL

TD_JOB_TYPE_FACET_IDS: dict[str, str] = {
    "full-time": "14c9322ea8e3014f4096d9d2dc025400",
    "part-time": "14c9322ea8e301e83781d9d2dc025300"
}

class TDAPIClient(WorkdayCxsClient):
    """TD Workday CXS client"""

    def __init__(
        self,
        api_url: str = TD_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_PAYLOAD,
            error_cls=TDAPIError,
        )