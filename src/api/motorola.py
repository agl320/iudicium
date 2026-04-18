import json
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from src.api.errors import MotorolaAPIError

from src.config import HEADERS as DEFAULT_HEADERS
from src.config import MOTOROLA_PAYLOAD as DEFAULT_PAYLOAD
from src.config import MOTOROLA_URL as MOTOROLA_API_URL


class MotorolaAPIClient:
    """Minimal Motorola Workday JSON API accessor.
    """

    def __init__(
        self,
        api_url: str = MOTOROLA_API_URL,
        *,
        timeout_s: float = 30.0,
    ) -> None:
        self.api_url = api_url
        self.headers = DEFAULT_HEADERS
        self.payload = DEFAULT_PAYLOAD
        self.timeout_s = timeout_s

    def search_raw(
        self,
        *,
        limit: int | None = None,
        offset: int | None = None,
        search_text: str | None = None,
        applied_facets: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        payload = dict(self.payload)
        if limit is not None:
            payload["limit"] = limit
        if offset is not None:
            payload["offset"] = offset
        if search_text is not None:
            payload["searchText"] = search_text
        if applied_facets is not None:
            payload["appliedFacets"] = applied_facets

        request_headers = dict(self.headers)
        request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        data = json.dumps(payload).encode("utf-8")
        request = Request(self.api_url, data=data, headers=request_headers, method="POST")

        try:
            with urlopen(request, timeout=self.timeout_s) as response: 
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = ""
            try:
                error_body = exc.read().decode("utf-8")
            except Exception:
                pass
            raise MotorolaAPIError(f"HTTP {exc.code} {exc.reason}: {error_body}") from exc
        
        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise MotorolaAPIError(f"Failed to decode JSON response: {exc.msg}") from exc
        
        if not isinstance(decoded, dict):
            raise MotorolaAPIError(f"Unexpected response format: expected a JSON object, got {type(decoded).__name__}")
        
        return decoded