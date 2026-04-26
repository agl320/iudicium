from src.providers.errors import RipplingAPIError
from src.config.config import (
    DEFAULT_HEADERS,
    DEFAULT_RIPPLING_PAYLOAD,
    RIPPLING_API_URL,
)

from .v2 import RipplingBoardClient


class RipplingAPIClient(RipplingBoardClient):
    def __init__(
        self,
        api_url: str = RIPPLING_API_URL,
        *,
        timeout_s: float = 30.0,
        headers=None,
        payload=None,
    ):
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            payload=payload or DEFAULT_RIPPLING_PAYLOAD,
            error_cls=RipplingAPIError,
        )
