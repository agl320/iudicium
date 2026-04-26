from __future__ import annotations

from src.providers.errors import StripeGreenhouseAPIError
from src.config import DEFAULT_HEADERS, STRIPE_GREENHOUSE_API_URL

from .board import GreenhouseBoardClient


class StripeGreenhouseAPIClient(GreenhouseBoardClient):
    def __init__(
        self,
        api_url: str = STRIPE_GREENHOUSE_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        params: dict | None = None,
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            params=params,
            error_cls=StripeGreenhouseAPIError,
        )
