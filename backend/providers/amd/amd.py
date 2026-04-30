from __future__ import annotations

from backend.config import AMD_API_URL, AMD_COMPANY_URL
from backend.providers.amd.api import AMDClient


class AMDAPIClient(AMDClient):
    def __init__(
        self,
        api_url: str = AMD_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            api_url=api_url,
            company="AMD",
            company_url=AMD_COMPANY_URL,
            timeout_s=timeout_s,
            headers=headers,
        )
