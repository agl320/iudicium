from typing import Any

from src.providers.errors import AnacondaAPIError
from src.config.config import ANACONDA_API_URL, DEFAULT_HEADERS

from .v1 import RipplingAtsV1BoardClient


class AnacondaAPIClient(RipplingAtsV1BoardClient):
    def __init__(
        self,
        api_url: str = ANACONDA_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        params: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(
            api_url,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            params=params,
            error_cls=AnacondaAPIError,
        )
