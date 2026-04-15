from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any


class JobTitle(str, Enum):
    SOFTWARE_ENGINEER = "software_engineer"
    DEVOPS_ENGINEER = "devops_engineer"
    DATA_ANALYST = "data_analyst"
    DATA_ENGINEER = "data_engineer"
    QA_ENGINEER = "qa_engineer"


class EmploymentType(str, Enum):
    INTERN = "intern"
    PART_TIME = "part_time"
    FULL_TIME = "full_time"


@dataclass(frozen=True, slots=True)
class JobPosting:
    source: str
    company: str
    title: JobTitle
    employment_type: EmploymentType
    location: str
    url: str
    posted_at: str

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["title"] = self.title.value
        data["employment_type"] = self.employment_type.value
        return data
