from __future__ import annotations

from backend.config import IBM_API_URL, IBM_COMPANY_URL

from .api import IBMClient


class IBMAPIClient(IBMClient):
    def __init__(
        self,
        api_url: str = IBM_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            api_url=api_url,
            company="IBM",
            company_url=IBM_COMPANY_URL,
            timeout_s=timeout_s,
            headers=headers,
        )