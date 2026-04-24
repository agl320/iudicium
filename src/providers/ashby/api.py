from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from src.api.errors import AshbyAPIError
from src.config import ASHBY_API_URL, DEFAULT_HEADERS


# GraphQL query for Ashby's API to fetch job board data with teams.
API_JOB_BOARD_WITH_TEAMS_QUERY = """query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
  jobBoard: jobBoardWithTeams(
    organizationHostedJobsPageName: $organizationHostedJobsPageName
  ) {
    teams {
      id
      name
      externalName
      parentTeamId
      __typename
    }
    jobPostings {
      id
      title
      teamId
      locationId
      locationName
      workplaceType
      employmentType
      secondaryLocations {
        ...JobPostingSecondaryLocationParts
        __typename
      }
      compensationTierSummary
      __typename
    }
    __typename
  }
}

fragment JobPostingSecondaryLocationParts on JobPostingSecondaryLocation {
  locationId
  locationName
  __typename
}
"""


class AshbyAPIClient:
    def __init__(
        self,
        api_url: str = ASHBY_API_URL,
        *,
        timeout_s: float = 30.0,
        headers: dict[str, str] | None = None,
        error_cls: type[RuntimeError] = AshbyAPIError,
    ) -> None:
        self.api_url = api_url
        self.timeout_s = timeout_s
        self.headers = dict(headers or DEFAULT_HEADERS)
        self.error_cls = error_cls

    def search_raw(self, *, organization_hosted_jobs_page_name: str) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "operationName": "ApiJobBoardWithTeams",
            "variables": {
                "organizationHostedJobsPageName": organization_hosted_jobs_page_name,
            },
            "query": API_JOB_BOARD_WITH_TEAMS_QUERY,
        }

        request_headers = dict(self.headers)
        request_headers.setdefault("Content-Type", "application/json")
        request_headers.setdefault("Accept", "application/json")
        request_headers.setdefault("User-Agent", "iudicium/0.1")

        data = json.dumps(payload).encode("utf-8")
        request = Request(
            self.api_url, data=data, headers=request_headers, method="POST"
        )

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
            raise self.error_cls(f"Ashby API request failed: {detail}") from exc
        except URLError as exc:
            raise self.error_cls(f"Ashby API request failed: {exc}") from exc

        try:
            decoded = json.loads(body)
        except json.JSONDecodeError as exc:
            raise self.error_cls(
                f"Ashby API request failed: Invalid JSON response: {exc}"
            ) from exc

        if not isinstance(decoded, dict):
            raise self.error_cls(
                "Ashby API request failed: Expected JSON object in response"
            )

        return decoded
