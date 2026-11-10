"""Loads companies.toml into typed objects.

The TOML file is the single place to toggle companies and job tracks.
"""

from __future__ import annotations

import re
import tomllib
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

DEFAULT_CONFIG_PATH = Path(__file__).with_name("companies.toml")
# Optional per-track filters (stricter titles, region, salary). When the file
# or a track's section is missing, that track uses its broad rules from
# companies.toml and is limited to North America.
DEFAULT_FILTERS_PATH = Path(__file__).with_name("filters.toml")
_USE_DEFAULT: Any = object()

EMPLOYMENT_REQUIREMENTS = {"intern", "full_time", "any"}
REGIONS = {"north_america", "canada", "british_columbia", "australia"}
SALARY_BASES = {"min", "mid", "max"}
PROVIDERS = {
    "workday",
    "greenhouse",
    "ashby",
    "smartrecruiters",
    "oraclecloud",
    "eightfold",
    "amd",
    "amazon",
    "apple",
    "google",
    "sap",
    "successfactors",
    "avature",
    "lever",
    "tesla",
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
    # Detail pages (salary, full location list) read per company per run.
    max_detail_fetches_per_company: int = 40


@dataclass(frozen=True)
class TrackFilter:
    """Extra conditions a posting must meet to be shown in a track, on top of
    the track's own title/employment rules (see filters.toml)."""

    # When set, the title must also match one of these...
    titles: tuple[re.Pattern[str], ...] = ()
    # ...and none of these (e.g. seniority that is not wanted).
    exclude_titles: tuple[re.Pattern[str], ...] = ()
    regions: tuple[str, ...] = ("north_america",)
    # Count "Remote" / "Remote - Canada" postings as inside the region.
    allow_remote: bool = True
    # Only show postings that advertise a salary.
    require_salary: bool = False
    # Minimum annual salary (in `salary_currency`), compared against the
    # advertised range's "min" (floor), "mid" or "max" (ceiling).
    min_salary: float | None = None
    salary_currency: str = "CAD"
    salary_basis: str = "max"
    usd_to_cad: float = 1.38
    # Read job detail pages to find salaries / full location lists.
    fetch_details: bool = True
    # The raw section, used to notice when the rules change.
    raw: dict[str, Any] = field(default_factory=dict, compare=False)

    @property
    def needs_salary(self) -> bool:
        return self.require_salary or self.min_salary is not None

    @property
    def min_salary_cad(self) -> float | None:
        if self.min_salary is None:
            return None
        rate = self.usd_to_cad if self.salary_currency == "USD" else 1.0
        return self.min_salary * rate


DEFAULT_FILTER = TrackFilter()


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
    # Stricter conditions from filters.toml; None = broad search (North America).
    filter: TrackFilter | None = None

    @property
    def active_filter(self) -> TrackFilter:
        return self.filter or DEFAULT_FILTER

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


def _parse_filter(key: str, data: dict[str, Any]) -> TrackFilter:
    where = f"filters.{key}"
    known = {name for name in TrackFilter.__dataclass_fields__ if name != "raw"}
    unknown = set(data) - known
    if unknown:
        raise ConfigError(f"Unknown option(s) in [{where}]: {', '.join(sorted(unknown))}")

    regions = tuple(data.get("regions", DEFAULT_FILTER.regions))
    if not regions or any(region not in REGIONS for region in regions):
        raise ConfigError(
            f"[{where}] regions must be some of {sorted(REGIONS)}, got {list(regions)}"
        )
    basis = data.get("salary_basis", DEFAULT_FILTER.salary_basis)
    if basis not in SALARY_BASES:
        raise ConfigError(f"[{where}] salary_basis must be one of {sorted(SALARY_BASES)}")
    currency = str(data.get("salary_currency", DEFAULT_FILTER.salary_currency)).upper()
    if currency not in {"CAD", "USD"}:
        raise ConfigError(f"[{where}] salary_currency must be CAD or USD")
    min_salary = data.get("min_salary")
    if min_salary is not None and not isinstance(min_salary, (int, float)):
        raise ConfigError(f"[{where}] min_salary must be a number")

    return TrackFilter(
        titles=_compile(data.get("titles", []), where),
        exclude_titles=_compile(data.get("exclude_titles", []), where),
        regions=regions,
        allow_remote=bool(data.get("allow_remote", DEFAULT_FILTER.allow_remote)),
        require_salary=bool(data.get("require_salary", False)),
        min_salary=float(min_salary) if min_salary is not None else None,
        salary_currency=currency,
        salary_basis=basis,
        usd_to_cad=float(data.get("usd_to_cad", DEFAULT_FILTER.usd_to_cad)),
        fetch_details=bool(data.get("fetch_details", True)),
        raw=dict(data),
    )


def load_filters(path: Path | str | None) -> dict[str, TrackFilter]:
    """Reads filters.toml. A missing file means no filters (broad search)."""
    if path is None or not Path(path).exists():
        return {}
    with Path(path).open("rb") as handle:
        raw = tomllib.load(handle)
    filters: dict[str, TrackFilter] = {}
    for key, data in raw.items():
        if not isinstance(data, dict):
            raise ConfigError(f"filters.toml: [{key}] must be a table")
        if data.get("enabled", True):
            options = {k: v for k, v in data.items() if k != "enabled"}
            filters[key] = _parse_filter(key, options)
    return filters


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


def load_config(
    path: Path | str | None = None, *, filters_path: Any = _USE_DEFAULT
) -> AppConfig:
    """Loads companies.toml plus the filters.toml next to it. Pass
    `filters_path=None` to ignore filters (broad search for every track)."""
    config_path = Path(path) if path else DEFAULT_CONFIG_PATH
    with config_path.open("rb") as handle:
        raw = tomllib.load(handle)

    if filters_path is _USE_DEFAULT:
        filters_path = config_path.with_name(DEFAULT_FILTERS_PATH.name)
    filters = load_filters(filters_path)
    tracks = _parse_tracks(raw.get("tracks", {}))
    unknown = set(filters) - {track.key for track in tracks}
    if unknown:
        raise ConfigError(
            f"filters.toml has sections for unknown or disabled tracks: {sorted(unknown)}"
        )
    tracks = tuple(replace(track, filter=filters.get(track.key)) for track in tracks)

    return AppConfig(
        settings=Settings(**raw.get("settings", {})),
        tracks=tracks,
        companies=_parse_companies(raw.get("companies", [])),
    )
