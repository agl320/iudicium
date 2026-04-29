from __future__ import annotations

import json
from html.parser import HTMLParser
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from backend.config import (
    DEFAULT_HEADERS,
    PHENOM_PALO_ALTO_NETWORKS_COMPANY_URL,
    COMPANY_URL_MAPPING,
)
from backend.models import JobPosting
from backend.providers.errors import PhenomPeopleAPIError


class _PhenomResultsHTMLParser(HTMLParser):
    def __init__(
        self, *, company: str, company_url: str, source: str, base_url: str
    ) -> None:
        super().__init__()
        self.company = company
        self.company_url = company_url
        self.source = source
        self.base_url = base_url
        self.jobs: list[JobPosting] = []

        self._in_list_item = False
        self._in_title = False
        self._in_location = False
        self._current_href = ""
        self._title_chunks: list[str] = []
        self._location_chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = {k: v or "" for k, v in attrs}
        class_name = attributes.get("class", "")

        if (
            tag == "li"
            and "section29__search-results-li" in class_name.split()
            and not self._in_list_item
        ):
            self._in_list_item = True
            self._in_title = False
            self._in_location = False
            self._current_href = ""
            self._title_chunks = []
            self._location_chunks = []
            return

        if not self._in_list_item:
            return

        if tag == "a" and "section29__search-results-link" in class_name.split():
            self._current_href = attributes.get("href", "")

        if tag == "h2":
            self._in_title = True

        if "location" in class_name or "subtitle" in class_name:
            self._in_location = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "h2":
            self._in_title = False

        if tag in {"p", "span", "div"}:
            self._in_location = False

        if tag == "li" and self._in_list_item:
            title = " ".join(
                part.strip() for part in self._title_chunks if part.strip()
            )
            location = " ".join(
                part.strip() for part in self._location_chunks if part.strip()
            )

            if title and self._current_href:
                self.jobs.append(
                    JobPosting(
                        source=self.source,
                        title=title,
                        company=self.company,
                        company_url=self.company_url,
                        location=location,
                        url=urljoin(self.base_url, self._current_href),
                    )
                )

            self._in_list_item = False
            self._in_title = False
            self._in_location = False

    def handle_data(self, data: str) -> None:
        if not self._in_list_item:
            return
        if self._in_title:
            self._title_chunks.append(data)
        elif self._in_location:
            self._location_chunks.append(data)


class PhenomPeopleClient:
    def __init__(
        self,
        api_url: str,
        *,
        company: str,
        company_url: str = "",
        base_url: str = PHENOM_PALO_ALTO_NETWORKS_COMPANY_URL,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = PhenomPeopleAPIError,
    ) -> None:
        self.api_url = api_url
        self.company = company
        self.company_url = company_url or COMPANY_URL_MAPPING.get(company, "")
        self.base_url = base_url
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.error_cls = error_cls

    def search_raw(self) -> dict[str, Any]:
        request_headers = dict(self.headers)
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        request = Request(self.api_url, headers=request_headers, method="GET")

        try:
            with urlopen(request, timeout=self.timeout_s) as response:
                body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = ""
            try:
                error_body = exc.read().decode("utf-8", errors="replace")
            except Exception:
                error_body = ""
            detail = f"HTTP {exc.code} {exc.reason}"
            if error_body:
                detail += f": {error_body}"
            raise self.error_cls(f"Phenom People API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Phenom People API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls(
                "Phenom People API returned non-JSON response"
            ) from exc

        if not isinstance(decoded, dict):
            raise self.error_cls("Phenom People API returned unexpected JSON shape")

        return decoded

    def search_job_postings(self) -> list[JobPosting]:
        decoded = self.search_raw()
        results_html = decoded.get("results")
        if not isinstance(results_html, str) or not results_html.strip():
            return []

        parser = _PhenomResultsHTMLParser(
            company=self.company,
            company_url=self.company_url,
            source=self.api_url,
            base_url=self.base_url,
        )
        parser.feed(results_html)
        parser.close()
        return parser.jobs
