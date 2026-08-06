from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.models import JobPosting

import re

STUDENT_ROLE_PATTERNS = [
    # Intern variations
    r"\bintern(ship)?\b",
    r"\binterns\b",
    r"\bintern[-\s]?co[-\s]?op\b",
    # Co-op variations
    r"\bco[-\s]?op\b",
    r"\bcoop\b",
    r"\bcooperative education\b",
    r"\bwork[-\s]?term\b",
    r"\bplacement\b",
    # Student roles
    r"\bstudent\b",
    r"\bundergraduate\b",
    r"\bgraduate student\b",
    r"\bcampus\b",
    r"\buniversity\b",
    r"\bcollege\b",
    # New grad / entry programs
    r"\bnew grad\b",
    r"\bnew graduate\b",
    r"\brecent graduate\b",
    r"\bentry[-\s]?level\b",
    r"\bearly career\b",
    r"\bearly[-\s]?career\b",
    r"\bassociate\b",
    # Explicit program naming
    r"\bapprentice(ship)?\b",
    r"\btrainee\b",
    r"\brotation(al)? program\b",
    r"\bgraduate program\b",
    r"\bgraduate scheme\b",
    # Common year-based postings
    r"\b20\d{2}\b.*\b(intern|graduate|student|co[-\s]?op)\b",
    r"\b(intern|graduate|student|co[-\s]?op)\b.*\b20\d{2}\b",
]


def is_student_role(title: str) -> bool:
    """Returns True if a job title appears to be a student/new grad role."""
    normalized = title.lower()

    return any(re.search(pattern, normalized) for pattern in STUDENT_ROLE_PATTERNS)


def get_company_logo_url(company_url: str | None) -> str | None:
    logo_dev_key = os.getenv("LOGO_DEV_PUBLIC_KEY")

    if not logo_dev_key or not company_url:
        return None

    company_domain = (
        company_url.replace("https://", "").replace("http://", "").rstrip("/")
    )

    return f"https://img.logo.dev/{company_domain}?token={logo_dev_key}"


def send_discord_notification(posting: JobPosting) -> None:
    """Sends a Discord embed notification for a new job posting."""

    if not is_student_role(posting.title):
        print(f"Skipping non-student role: {posting.title}")
        return

    url = os.getenv("DISCORD_WEBHOOK_URL")

    if not url:
        raise ValueError(
            "Discord webhook URL is missing. Set DISCORD_WEBHOOK_URL in your environment."
        )

    embed: dict[str, Any] = {
        "title": posting.title,
        "url": posting.url,
        "description": f"**{posting.company}**",
        "color": 0x0BBEFE,
        "fields": [
            {
                "name": "Company",
                "value": posting.company,
                "inline": True,
            },
            {
                "name": "Location",
                "value": posting.location,
                "inline": True,
            },
        ],
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    logo_url = get_company_logo_url(posting.company_url)

    if logo_url:
        embed["thumbnail"] = {
            "url": logo_url,
        }

    payload: dict[str, Any] = {
        "embeds": [embed],
    }

    data = json.dumps(payload).encode("utf-8")

    req = Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "Python-Discord-Webhook-Client",
        },
        method="POST",
    )

    try:
        with urlopen(req) as response:
            if response.status == 204:
                print("Discord notification sent successfully.")
            else:
                print(f"Webhook responded with status code: {response.status}")

    except HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        print(f"HTTPError: {e.code} - {e.reason}")
        print(f"Details: {error_body}")

    except URLError as e:
        print(f"URLError: Failed to reach Discord. Reason: {e.reason}")


if __name__ == "__main__":
    pass
