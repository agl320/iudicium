from __future__ import annotations

from typing import Any


class BaseScraper:
    def __init__(self, url: str, **kwargs: Any):
        self.url = url
        self.kwargs = kwargs

    def scrape(self) -> list[dict[str, Any]]:
        return []