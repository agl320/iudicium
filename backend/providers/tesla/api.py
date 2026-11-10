"""Tesla careers (tesla.com/careers).

Tesla's site sits behind Akamai bot protection, but its own JSON endpoints
answer ordinary requests that look like a browser:

  /cua-api/apps/careers/state   every open listing (~8k) in one ~1.5 MB response
  /cua-api/careers/job/{id}     one job's description, location and pay section

If Akamai starts refusing a host (e.g. a CI runner's IP range) the request
fails with HTTP 403 and the poller records it as that company's error; the
rest of the run is unaffected.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.models import JobPosting

BASE_URL = "https://www.tesla.com"
STATE_URL = f"{BASE_URL}/cua-api/apps/careers/state"
JOB_URL = f"{BASE_URL}/cua-api/careers/job/{{id}}"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": f"{BASE_URL}/careers/search/",
}
EMPLOYMENT_TYPES = {"fulltime": "full_time", "parttime": "part_time", "intern": "intern"}


class TeslaAPIError(RuntimeError):
    pass


def _slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")


def _location_ids(node: Any) -> set[str]:
    """Every location id under a node of the `geo` tree (its shape differs per
    country: states -> cities -> ids, or cities -> ids directly)."""
    if isinstance(node, str):
        return {node}
    if isinstance(node, list):
        return set().union(*(_location_ids(item) for item in node)) if node else set()
    if isinstance(node, dict):
        children = {k: v for k, v in node.items() if k not in ("id", "name")}
        return set().union(*(_location_ids(v) for v in children.values())) if children else set()
    return set()


class TeslaClient:
    def __init__(
        self,
        *,
        company: str = "Tesla",
        company_url: str = "tesla.com",
        timeout_s: float = 45.0,
        max_attempts: int = 3,
    ) -> None:
        self.company = company
        self.company_url = company_url
        self.timeout_s = timeout_s
        self.max_attempts = max_attempts

    def _get_json(self, url: str) -> Any:
        for attempt in range(1, self.max_attempts + 1):
            try:
                with urlopen(Request(url, headers=HEADERS), timeout=self.timeout_s) as response:
                    return json.loads(response.read().decode("utf-8"))
            except HTTPError as exc:
                # 403/429 = bot protection or rate limit; back off and retry.
                if exc.code in (403, 429) and attempt < self.max_attempts:
                    time.sleep(5.0 * attempt)
                    continue
                raise TeslaAPIError(f"Tesla request failed: HTTP {exc.code} {exc.reason}") from exc
            except (URLError, TimeoutError) as exc:
                if attempt < self.max_attempts:
                    time.sleep(5.0 * attempt)
                    continue
                raise TeslaAPIError(f"Tesla request failed: {exc}") from exc
            except json.JSONDecodeError as exc:
                raise TeslaAPIError("Tesla returned non-JSON (likely a bot challenge page)") from exc
        raise TeslaAPIError("Tesla request failed")

    def search_job_postings(self) -> list[JobPosting]:
        state = self._get_json(STATE_URL)
        if not isinstance(state, dict) or not isinstance(state.get("listings"), list):
            raise TeslaAPIError("Tesla careers state has an unexpected shape")
        lookup = state.get("lookup") or {}
        locations = lookup.get("locations") or {}
        site_names = lookup.get("sites") or {}
        types = lookup.get("types") or {}

        country_of: dict[str, str] = {}
        for region in state.get("geo") or []:
            for site in region.get("sites") or []:
                country = site_names.get(site.get("id"), site.get("id") or "")
                for location_id in _location_ids(site):
                    country_of.setdefault(location_id, country)

        postings: list[JobPosting] = []
        for item in state["listings"]:
            job_id, title = str(item.get("id") or ""), str(item.get("t") or "")
            if not job_id or not title:
                continue
            location_id = str(item.get("l") or "")
            place = str(locations.get(location_id) or "")
            country = country_of.get(location_id, "")
            parts = [place] if place else []
            if country and country not in place:
                parts.append(country)
            location = ", ".join(parts)
            postings.append(
                JobPosting(
                    source=STATE_URL,
                    title=title,
                    company=self.company,
                    company_url=self.company_url,
                    location=location,
                    url=f"{BASE_URL}/careers/search/job/{_slug(title)}-{job_id}",
                    employment_type=EMPLOYMENT_TYPES.get(str(types.get(str(item.get("y"))) or ""), ""),
                    external_id=job_id,
                )
            )
        return postings

    def get_details(self, job_id: str) -> tuple[str, list[str]]:
        """(description + pay section, [location]) for one job."""
        job = self._get_json(JOB_URL.format(id=job_id))
        if not isinstance(job, dict):
            return "", []
        text = "\n".join(
            str(job.get(key) or "")
            for key in (
                "jobCompensationAndBenefits",
                "jobDescription",
                "jobResponsibilities",
                "jobRequirements",
            )
        )
        location = ", ".join(
            str(job.get(key)) for key in ("location", "state", "country") if job.get(key)
        )
        return text, [location] if location else []
