"""Lever public postings API (Palantir, Spotify, Zoox, ...).

One request returns every posting with its full description and, where the
company publishes it, a structured salary range.
"""

from __future__ import annotations

import json
from dataclasses import replace
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.models import JobPosting
from backend.services.classifier import normalize_employment_type
from backend.services.salary import with_salary

API_URL = "https://api.lever.co/v0/postings/{board}?mode=json"
_PERIODS = {"hour": "per hour", "month": "per month", "year": "per year"}


class LeverAPIError(RuntimeError):
    pass


class LeverClient:
    def __init__(
        self, board: str, *, company: str, company_url: str, timeout_s: float = 30.0
    ) -> None:
        self.board = board
        self.api_url = API_URL.format(board=board)
        self.company = company
        self.company_url = company_url
        self.timeout_s = timeout_s

    def search_raw(self) -> list[dict[str, Any]]:
        request = Request(
            self.api_url,
            headers={"Accept": "application/json", "User-Agent": "iudicium/0.1"},
        )
        try:
            with urlopen(request, timeout=self.timeout_s) as response:
                decoded = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, json.JSONDecodeError) as exc:
            raise LeverAPIError(f"{self.company} Lever request failed: {exc}") from exc
        if not isinstance(decoded, list):
            raise LeverAPIError(f"{self.company} Lever returned unexpected JSON")
        return [item for item in decoded if isinstance(item, dict)]

    @staticmethod
    def _salary_text(item: dict[str, Any]) -> str:
        salary = item.get("salaryRange")
        if isinstance(salary, dict) and salary.get("min") is not None:
            currency = str(salary.get("currency") or "")
            interval = str(salary.get("interval") or "")
            period = next((v for k, v in _PERIODS.items() if k in interval), "")
            return (
                f"{currency} ${float(salary['min']):,.2f} - "
                f"${float(salary.get('max') or salary['min']):,.2f} {period}"
            )
        parts = [str(item.get("descriptionPlain") or ""), str(item.get("additionalPlain") or "")]
        for block in item.get("lists") or []:
            if isinstance(block, dict):
                parts.append(f"{block.get('text', '')} {block.get('content', '')}")
        return "\n".join(parts)

    def search_job_postings(self) -> list[JobPosting]:
        postings: list[JobPosting] = []
        for item in self.search_raw():
            categories = item.get("categories") or {}
            locations = categories.get("allLocations") or [categories.get("location")]
            location = "; ".join(str(loc) for loc in locations if loc)
            posting = JobPosting(
                source=self.api_url,
                title=str(item.get("text") or ""),
                company=self.company,
                company_url=self.company_url,
                location=location,
                url=str(item.get("hostedUrl") or ""),
                employment_type=normalize_employment_type(categories.get("commitment")),
                external_id=str(item.get("id") or ""),
            )
            # The full description is already here; no detail page needed.
            postings.append(
                replace(with_salary(posting, self._salary_text(item)), details_checked=True)
            )
        return postings
