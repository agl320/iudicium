from __future__ import annotations

import html
import re
from urllib.parse import urlencode

from backend.models import JobPosting
from backend.providers.errors import AvatureAPIError
from backend.providers.http import fetch

PAGE_SIZE = 10

_TAGS = re.compile(r"<[^>]+>")


class AvatureClient:
    """Avature career sites (e.g. jobs.ea.com, careers.lululemon.com).

    The search page is server rendered, newest first, 10 results per page.
    `search_url` is the site's search page, e.g.
    https://jobs.ea.com/en_US/careers/SearchJobs
    """

    def __init__(self, search_url: str, *, company: str, company_url: str):
        self.search_url = search_url.rstrip("/")
        self.company = company
        self.company_url = company_url
        site_root = self.search_url.rsplit("/", 1)[0]
        self._detail_link = re.compile(
            r'<a[^>]+href="(' + re.escape(site_root) + r'/JobDetail/[^"]+)"[^>]*>(.*?)</a>',
            re.S,
        )

    def search_page(self, *, query: str = "", offset: int = 0) -> list[JobPosting]:
        params = {"jobRecordsPerPage": PAGE_SIZE, "jobOffset": offset}
        if query:
            params["search"] = query
        body, _ = fetch(
            f"{self.search_url}/?{urlencode(params)}", error_cls=AvatureAPIError
        )

        postings: list[JobPosting] = []
        seen: set[str] = set()
        matches = list(self._detail_link.finditer(body))
        for index, match in enumerate(matches):
            url = html.unescape(match.group(1))
            title = html.unescape(_TAGS.sub("", match.group(2))).strip()
            if not title or url in seen:
                continue
            seen.add(url)
            # The location is the first text after the title link, before the
            # next card.
            card_end = matches[index + 1].start() if index + 1 < len(matches) else None
            after = _TAGS.sub("|", body[match.end() : card_end][:1500])
            texts = [t.strip() for t in html.unescape(after).split("|") if t.strip()]
            location = next((t for t in texts if t.lower() not in ("apply", "save")), "")
            postings.append(
                JobPosting(
                    source=self.search_url,
                    title=title,
                    company=self.company,
                    company_url=self.company_url,
                    location=location,
                    url=url,
                )
            )
        return postings
