from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class JobPosting:
    source: str
    title: str
    company: str
    location: str
    url: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
