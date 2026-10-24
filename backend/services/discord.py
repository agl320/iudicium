from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
import os
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from backend.config.loader import Track
from backend.models import JobPosting

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 4


def get_company_logo_url(company_url: str | None) -> str | None:
    logo_dev_key = os.getenv("LOGO_DEV_PUBLIC_KEY")

    if not logo_dev_key or not company_url:
        return None

    company_domain = (
        company_url.replace("https://", "").replace("http://", "").rstrip("/")
    )

    return f"https://img.logo.dev/{company_domain}?token={logo_dev_key}"


def build_embed(posting: JobPosting, track: Track) -> dict[str, Any]:
    embed: dict[str, Any] = {
        "title": posting.title[:256],
        "url": posting.url,
        "description": f"**{posting.company}**",
        "color": track.color,
        "fields": [
            {
                "name": "Company",
                "value": posting.company or "—",
                "inline": True,
            },
            {
                "name": "Location",
                "value": (posting.location or "—")[:1024],
                "inline": True,
            },
            {
                "name": "Type",
                "value": track.label,
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

    return embed


def send_discord_notification(posting: JobPosting, track: Track) -> bool:
    """Sends a Discord embed notification for a new job posting.

    Returns True when Discord accepted the message.
    """

    url = os.getenv("DISCORD_WEBHOOK_URL")

    if not url:
        logger.warning("DISCORD_WEBHOOK_URL not set; skipping %s", posting.title)
        return False

    payload: dict[str, Any] = {
        "embeds": [build_embed(posting, track)],
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

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with urlopen(req) as response:
                if response.status in (200, 204):
                    return True
                logger.warning("Webhook responded with status %s", response.status)
                return False

        except HTTPError as e:
            error_body = e.read().decode("utf-8", errors="ignore")
            if e.code == 429 and attempt < MAX_ATTEMPTS:
                # Discord tells us how long to back off for.
                try:
                    retry_after = float(json.loads(error_body).get("retry_after", 1))
                except (ValueError, AttributeError):
                    retry_after = 1.0
                time.sleep(min(retry_after, 30.0) + 0.25)
                continue
            logger.error("Discord HTTPError %s %s: %s", e.code, e.reason, error_body)
            return False

        except URLError as e:
            logger.error("Failed to reach Discord: %s", e.reason)
            return False

    return False
