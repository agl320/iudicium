from __future__ import annotations

from backend.config import (
    TEXAS_INSTRUMENTS_API_URL,
    TEXAS_INSTRUMENTS_COMPANY_URL,
)
from backend.providers.errors import TexasInstrumentsOracleCloudAPIError

from .api import OracleCloudClient


class TexasInstrumentsAPIClient(OracleCloudClient):
    def __init__(
        self,
        api_url: str = TEXAS_INSTRUMENTS_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        params: dict | None = None,
    ) -> None:
        super().__init__(
            api_url,
            company="Texas Instruments",
            company_url=TEXAS_INSTRUMENTS_COMPANY_URL,
            timeout_s=timeout_s,
            headers=headers,
            error_cls=TexasInstrumentsOracleCloudAPIError,
        )
