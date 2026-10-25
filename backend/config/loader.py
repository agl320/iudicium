"""Loads companies.toml into typed objects.

The TOML file is the single place to toggle companies and job tracks.
"""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_PATH = Path(__file__).with_name("companies.toml")

EMPLOYMENT_REQUIREMENTS = {"intern", "full_time", "any"}
PROVIDERS = {
    "workday",
    "greenhouse",
    "ashby",
    "smartrecruiters",
    "oraclecloud",
    "eightfold",
    "amd",
    "custom",
}


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class Settings:
    store_uncategorized: bool = False
    max_jobs_per_query: int = 200
    concurrency: int = 6
    seed_silently: bool = True
    max_notifications_per_company: int = 10


@dataclass(frozen=True)
class Track:
    key: str
    label: str
    color: int
    employment: str
    include_titles: tuple[re.Pattern[str], ...]
    exclude_titles: tuple[re.Pattern[str], ...]
    # Titles matching these are in the track even if they hit exclude_titles.
    priority_titles: tuple[re.Pattern[str], ...]
    # Titles matching these are never in the track, not even priority ones.
    block_titles: tuple[re.Pattern[str], ...]
    search_terms: tuple[str, ...]

    @property
    def color_hex(self) -> str:
        return f"#{self.color:06X}"


@dataclass(frozen=True)
class Company:
    name: str
    provider: str
    domain: str
    enabled: bool = True
    # Provider specific keys (host, site, board, ...).
    options: dict[str, Any] = field(default_factory=dict)

    def option(self, key: str) -> Any:
        try:
            return self.options[key]
        except KeyError:
            raise ConfigError(
                f"Company {self.name!r} ({self.provider}) is missing {key!r}"
            ) from None


@dataclass(frozen=True)
class AppConfig:
    settings: Settings
    # Only enabled tracks are kept, in file order.
    tracks: tuple[Track, ...]
    companies: tuple[Company, ...]

    @property
    def enabled_companies(self) -> tuple[Company, ...]:
        return tuple(company for company in self.companies if company.enabled)

    def track(self, key: str) -> Track | None:
        return next((track for track in self.tracks if track.key == key), None)


def _parse_color(value: Any, track_key: str) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str) and re.fullmatch(r"#?[0-9a-fA-F]{6}", value):
        return int(value.lstrip("#"), 16)
    raise ConfigError(f"Track {track_key!r} has invalid color {value!r}")


def _compile(patterns: list[str], where: str) -> tuple[re.Pattern[str], ...]:
    compiled = []
    for pattern in patterns:
        try:
            compiled.append(re.compile(pattern, re.IGNORECASE))
        except re.error as exc:
            raise ConfigError(f"Invalid regex {pattern!r} in {where}: {exc}") from exc
    return tuple(compiled)


def _parse_tracks(raw: dict[str, Any]) -> tuple[Track, ...]:
    tracks: list[Track] = []
    for key, data in raw.items():
        if not data.get("enabled", True):
            continue
        employment = data.get("employment", "any")
        if employment not in EMPLOYMENT_REQUIREMENTS:
            raise ConfigError(f"Track {key!r} has invalid employment {employment!r}")
        tracks.append(
            Track(
                key=key,
                label=str(data.get("label", key)),
                color=_parse_color(data.get("color", "#0BBEFE"), key),
                employment=employment,
                include_titles=_compile(
                    data.get("include_titles", []), f"tracks.{key}"
                ),
                exclude_titles=_compile(
                    data.get("exclude_titles", []), f"tracks.{key}"
                ),
                priority_titles=_compile(
                    data.get("priority_titles", []), f"tracks.{key}"
                ),
                block_titles=_compile(data.get("block_titles", []), f"tracks.{key}"),
                search_terms=tuple(data.get("search_terms", [])),
            )
        )
    return tuple(tracks)


def _parse_companies(raw: list[dict[str, Any]]) -> tuple[Company, ...]:
    companies: list[Company] = []
    seen: set[str] = set()
    for data in raw:
        data = dict(data)
        name = data.pop("name", None)
        provider = data.pop("provider", None)
        if not name or not provider:
            raise ConfigError(f"Company entry needs name and provider: {data}")
        if provider not in PROVIDERS:
            raise ConfigError(f"Company {name!r} has unknown provider {provider!r}")
        if name.lower() in seen:
            raise ConfigError(f"Company {name!r} is defined twice")
        seen.add(name.lower())
        companies.append(
            Company(
                name=name,
                provider=provider,
                domain=str(data.pop("domain", "")),
                enabled=bool(data.pop("enabled", True)),
                options=data,
            )
        )
    return tuple(companies)


def load_config(path: Path | str | None = None) -> AppConfig:
    config_path = Path(path) if path else DEFAULT_CONFIG_PATH
    with config_path.open("rb") as handle:
        raw = tomllib.load(handle)

    settings = Settings(**raw.get("settings", {}))
    return AppConfig(
        settings=settings,
        tracks=_parse_tracks(raw.get("tracks", {})),
        companies=_parse_companies(raw.get("companies", [])),
    )
