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
    # Salary as advertised, for display (e.g. "CA$92,900–129,200/yr").
    salary: str = ""
    # Advertised range, annualized, in `salary_currency` ("CAD" / "USD");
    # None when unknown.
    salary_min: float | None = None
    salary_max: float | None = None
    salary_currency: str = ""
    # True once the job's detail page was read (salary / full location list),
    # so it is not fetched again on every run.
    details_checked: bool = False
    # Provider id used to fetch the detail page. Not stored.
    external_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
