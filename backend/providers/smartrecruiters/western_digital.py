from __future__ import annotations

from backend.config import WESTERN_DIGITAL_API_URL, WESTERN_DIGITAL_COMPANY_URL

from .api import SmartRecruitersClient


class WesternDigitalAPIClient(SmartRecruitersClient):
    def __init__(
        self,
        api_url: str = WESTERN_DIGITAL_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            api_url=api_url,
            company="Western Digital",
            company_url=WESTERN_DIGITAL_COMPANY_URL,
            timeout_s=timeout_s,
            headers=headers,
        )
