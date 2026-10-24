"""Normalizes job types across providers and assigns postings to tracks.

Providers disagree on how (or whether) they expose employment type, so we
combine whatever hint the provider gives with title heuristics.
"""

from __future__ import annotations

import re
from dataclasses import replace

from backend.config.loader import Track
from backend.models import JobPosting

STUDENT_ROLE_PATTERNS = [
    # Intern variations
    r"\bintern(ships?)?\b",
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

# Narrower than STUDENT_ROLE_PATTERNS: words like "associate" or "university"
# appear in plenty of full-time titles ("HR Associate", "University Recruiter").
DEFINITELY_STUDENT_PATTERNS = [
    r"\bintern(s|ships?)?\b",
    r"\bco[-\s]?op\b",
    r"\bcoop\b",
    r"\bstudent\b",
    r"\bwerkstudent\b",
    r"\bapprentice(ship)?\b",
    r"\btrainee\b",
    r"\bwork[-\s]?term\b",
]

NOT_FULL_TIME_PATTERNS = [
    r"\bpart[-\s]?time\b",
    r"\btemp(orary)?\b",
    r"\bcontractor\b",
    r"\(contract\)",
    r"\bcontract (role|position|assignment)\b",
    r"\bfixed[-\s]?term\b",
    r"\bseasonal\b",
    r"\bcasual\b",
    r"\bfreelance\b",
]

_STUDENT = [re.compile(p) for p in STUDENT_ROLE_PATTERNS]
_DEFINITELY_STUDENT = [re.compile(p) for p in DEFINITELY_STUDENT_PATTERNS]
_NOT_FULL_TIME = [re.compile(p) for p in NOT_FULL_TIME_PATTERNS]

# Maps the many provider spellings onto our normalized employment types.
_EMPLOYMENT_HINTS = [
    ("intern", re.compile(r"intern|co-?op|student|trainee|apprentice")),
    ("part_time", re.compile(r"part[-\s_]?time")),
    ("contract", re.compile(r"contract|temp|fixed[-\s_]?term|freelance|seasonal")),
    ("full_time", re.compile(r"full[-\s_]?time|permanent|regular")),
]


def normalize_employment_type(value: str | None) -> str:
    """Maps provider employment labels ("FullTime", "Intern (Fixed Term)",
    "permanent", ...) onto intern / full_time / part_time / contract / ""."""
    if not value:
        return ""
    normalized = value.strip().lower()
    for employment_type, pattern in _EMPLOYMENT_HINTS:
        if pattern.search(normalized):
            return employment_type
    return ""


def is_student_role(title: str) -> bool:
    """Returns True if a job title appears to be a student/new grad role."""
    normalized = title.lower()
    return any(pattern.search(normalized) for pattern in _STUDENT)


def is_full_time_role(posting: JobPosting) -> bool:
    if posting.employment_type and posting.employment_type != "full_time":
        return False
    normalized = posting.title.lower()
    if any(pattern.search(normalized) for pattern in _DEFINITELY_STUDENT):
        return False
    return not any(pattern.search(normalized) for pattern in _NOT_FULL_TIME)


def is_intern_role(posting: JobPosting) -> bool:
    # Boards often file internships as fixed-term/temporary, so the title is
    # still checked when the provider hint says something else.
    return posting.employment_type == "intern" or is_student_role(posting.title)


def matches_track(posting: JobPosting, track: Track) -> bool:
    title = posting.title
    if track.include_titles and not any(p.search(title) for p in track.include_titles):
        return False
    if any(p.search(title) for p in track.exclude_titles):
        return False
    if track.employment == "intern":
        return is_intern_role(posting)
    if track.employment == "full_time":
        return is_full_time_role(posting)
    return True


def classify(posting: JobPosting, tracks: tuple[Track, ...]) -> str:
    """Returns the key of the first matching track, or "" if none match."""
    for track in tracks:
        if matches_track(posting, track):
            return track.key
    return ""


def categorize(postings: list[JobPosting], tracks: tuple[Track, ...]) -> list[JobPosting]:
    return [replace(posting, category=classify(posting, tracks)) for posting in postings]
