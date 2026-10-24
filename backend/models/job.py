from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class JobPosting:
    source: str
    title: str
    company: str
    company_url: str
    location: str
    url: str
    # Provider-reported employment type, normalized to one of
    # "intern", "full_time", "part_time", "contract" or "" when unknown.
    employment_type: str = ""
    # Track key (see companies.toml) assigned by the classifier.
    category: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
