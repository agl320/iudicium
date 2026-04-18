from __future__ import annotations

from typing import Any

from src.api.errors import RBCAPIError
from src.config import DEFAULT_HEADERS, DEFAULT_PAYLOAD, RBC_API_URL

from .cxs import WorkdayCxsClient


class RBCAPIClient(WorkdayCxsClient):
    """RBC Workday client.

    Note: the provided RBC URL may be the careers site root (HTML) rather than
    the CXS JSON endpoint. If requests fail, confirm the correct `/wday/cxs/.../jobs`
    endpoint in the browser network tab.
    """

    def __init__(
        self,
        api_url: str = RBC_API_URL,
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
            error_cls=RBCAPIError,
        )
