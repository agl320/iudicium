from __future__ import annotations

from backend.config import (
    DEFAULT_HEADERS,
    PHENOM_PALO_ALTO_NETWORKS_API_URL,
    PHENOM_PALO_ALTO_NETWORKS_COMPANY_URL,
)
from backend.providers.errors import PaloAltoNetworksPhenomAPIError

from .api import PhenomPeopleClient


class PaloAltoNetworksPhenomAPIClient(PhenomPeopleClient):
    def __init__(
        self,
        api_url: str = PHENOM_PALO_ALTO_NETWORKS_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            api_url=api_url,
            company="Palo Alto Networks",
            base_url=PHENOM_PALO_ALTO_NETWORKS_COMPANY_URL,
            timeout_s=timeout_s,
            headers=headers or DEFAULT_HEADERS,
            error_cls=PaloAltoNetworksPhenomAPIError,
        )
