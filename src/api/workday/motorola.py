from __future__ import annotations

from typing import Any

from src.api.errors import MotorolaAPIError
from src.config import DEFAULT_HEADERS, MOTOROLA_API_URL, MOTOROLA_PAYLOAD

from .cxs import WorkdayCxsClient


MOTOROLA_REGION_FACET_IDS: dict[str, str] = {
    "north-america": "436f05d7afa343d5a8c9f92ef3e8c71b",
    "asia-pacific": "14bb6aa2c25e4a218b2a3faaa951e44c",
    "emea": "e61d35cf9e484fa080984bec674f16ca",
    "latin-america": "d6565dafd0ce4473932b0ce1ce9a0307",
}


class MotorolaAPIClient(WorkdayCxsClient):
    """Motorola Workday CXS client."""

    def __init__(
        self,
        api_url: str = MOTOROLA_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or MOTOROLA_PAYLOAD,
            error_cls=MotorolaAPIError,
        )
