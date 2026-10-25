from __future__ import annotations

import html
import re
from urllib.parse import quote

from backend.models import JobPosting
from backend.providers.errors import SuccessFactorsAPIError
from backend.providers.http import fetch

_ITEM = re.compile(r"<item>(.*?)</item>", re.S)
_TITLE = re.compile(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", re.S)
_LINK = re.compile(r"<link>(.*?)</link>", re.S)
# Titles look like "Payroll Manager (Vancouver, BC, CA, V6B 0M3)".
_TRAILING_LOCATION = re.compile(r"^(.*)\s+\(([^()]*)\)\s*$")


class SuccessFactorsRSSClient:
    """SAP SuccessFactors career sites expose a keyword RSS feed."""

    def __init__(self, host: str, *, company: str, company_url: str):
        self.host = host
        self.company = company
        self.company_url = company_url

    def search(self, *, query: str = "") -> list[JobPosting]:
        feed_url = (
            f"https://{self.host}/services/rss/job/"
            f"?locale=en_US&keywords=({quote(query)})"
        )
        body, _ = fetch(feed_url, error_cls=SuccessFactorsAPIError)

        postings: list[JobPosting] = []
        for item in _ITEM.findall(body):
            title_match = _TITLE.search(item)
            link_match = _LINK.search(item)
            if not title_match or not link_match:
                continue
            title = html.unescape(title_match.group(1)).strip()
            location = ""
            split = _TRAILING_LOCATION.match(title)
            if split:
                title, location = split.group(1).strip(), split.group(2).strip()
            postings.append(
                JobPosting(
                    source=feed_url,
                    title=title,
                    company=self.company,
                    company_url=self.company_url,
                    location=location,
                    url=html.unescape(link_match.group(1)).strip(),
                )
            )
        return postings
