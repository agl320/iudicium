from __future__ import annotations

from backend.config import MICROSOFT_API_URL, MICROSOFT_COMPANY_URL

from .api import MicrosoftClient


class MicrosoftAPIClient(MicrosoftClient):
    def __init__(
        self,
        api_url: str = MICROSOFT_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            api_url=api_url,
            company="Microsoft",
            company_url=MICROSOFT_COMPANY_URL,
            timeout_s=timeout_s,
            headers=headers,
        )
