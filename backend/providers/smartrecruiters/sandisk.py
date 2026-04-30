from __future__ import annotations

from backend.config import SANDISK_API_URL, SANDISK_COMPANY_URL

from .api import SmartRecruitersClient


class SandiskAPIClient(SmartRecruitersClient):
    def __init__(
        self,
        api_url: str = SANDISK_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            api_url=api_url,
            company="Sandisk",
            company_url=SANDISK_COMPANY_URL,
            timeout_s=timeout_s,
            headers=headers,
        )
