"""Finds advertised pay ranges in job descriptions.

Handles the formats boards actually use, e.g.

    "$70,000-$120,000"                       (TELUS)
    "$59,800 - 78,500 annually"              (lululemon)
    "*$92,900 - $129,200 CAD"                (EA)
    "Canada: $174000 - $178000 (CAD)"        (Google)
    "USD $86,100 - $169,800 per year"        (Microsoft)
    "Hiring Range in USD from: $103,000 to $264,100 per annum"  (Oracle)
    "$207K – $285K • Offers Equity"          (Ashby)
    "$32.50 - $40.00 per hour"

Amounts are annualized (hourly x 2080, monthly x 12) and converted to CAD so
they can be compared against one threshold.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, replace

from backend.models import JobPosting
from backend.services.location import is_canada

HOURS_PER_YEAR = 2080
DEFAULT_USD_TO_CAD = 1.38

_CUR = r"(?:CA\$|C\$|CAD\s*\$?|US\$|USD\s*\$?|\$)"
_NUM = r"\d{1,3}(?:[,  ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?"
_RANGE = re.compile(
    rf"(?P<cur1>{_CUR})\s*(?P<a>{_NUM})\s*(?P<ak>[kK])?(?![\d])\s*(?P<acode>CAD|USD)?"
    r"\s*(?:-|–|—|to|and)\s*"
    rf"(?P<cur2>{_CUR})?\s*(?P<b>{_NUM})\s*(?P<bk>[kK])?(?![\d])",
)
_SINGLE = re.compile(rf"(?P<cur1>{_CUR})\s*(?P<a>{_NUM})\s*(?P<ak>[kK])?(?![\d])")
# A lone amount only counts when it is introduced as pay.
_PAY_WORDS = re.compile(
    r"salary|pay\b|pay range|compensation|wage|hiring range|base|rate|starting at",
    re.I,
)
_NOT_PAY = re.compile(r"^\s*(?:\+\s*)?(?:billion|million|bn\b|mm\b|m\b|b\b|in\s+(?:revenue|funding))", re.I)
_HOURLY = re.compile(r"^.{0,25}?(?:/\s*h(?:ou)?r|per\s+hour|an\s+hour|hourly|/\s*hour)", re.I | re.S)
_MONTHLY = re.compile(r"^.{0,25}?(?:/\s*mo(?:nth)?|per\s+month|monthly)", re.I | re.S)
_CAD_HINT = re.compile(r"CAD|CA\$|C\$|canad", re.I)
_USD_HINT = re.compile(r"USD|US\$|\bU\.S\.|\bUS\b|united states|\bUSA\b", re.I)


@dataclass(frozen=True)
class Salary:
    low: float  # annual, in `currency`
    high: float
    currency: str  # "CAD" or "USD"
    period: str  # "yr", "hr" or "mo" as advertised
    text: str  # display form

    def annual_cad(self, usd_to_cad: float = DEFAULT_USD_TO_CAD) -> tuple[float, float]:
        rate = usd_to_cad if self.currency == "USD" else 1.0
        return self.low * rate, self.high * rate


def _clean(text: str) -> str:
    text = html.unescape(html.unescape(text or ""))
    text = text.replace("\\u003c", "<").replace("\\u003e", ">")
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"[ \t\r\n  ]+", " ", text)


def _number(raw: str, k: str | None) -> float:
    value = float(re.sub(r"[,  ]", "", raw))
    return value * 1000 if k else value


def _currency(match: re.Match[str], text: str, default: str) -> str:
    inside = match.group(0)
    after = text[match.end() : match.end() + 12]
    # Closest marker wins: "...$129,200 CAD", "CA$80K", "USD $86,100".
    for chunk in (after, inside):
        cad, usd = _CAD_HINT.search(chunk), _USD_HINT.search(chunk)
        if cad and not usd:
            return "CAD"
        if usd and not cad:
            return "USD"
    before = text[max(0, match.start() - 60) : match.start()]
    hints = [(m.start(), "CAD") for m in _CAD_HINT.finditer(before)]
    hints += [(m.start(), "USD") for m in _USD_HINT.finditer(before)]
    if hints:
        return max(hints)[1]
    return default


def _period(text: str, end: int, low: float) -> str:
    after = text[end : end + 40]
    if _HOURLY.search(after):
        return "hr"
    if _MONTHLY.search(after):
        return "mo"
    return "hr" if low < 300 else "yr"


def _annualize(value: float, period: str) -> float:
    return value * HOURS_PER_YEAR if period == "hr" else value * 12 if period == "mo" else value


def _format(low: float, high: float, currency: str, period: str) -> str:
    symbol = "CA$" if currency == "CAD" else "US$"
    fmt = (lambda v: f"{v:,.2f}") if period == "hr" else (lambda v: f"{v:,.0f}")
    amount = fmt(low) if low == high else f"{fmt(low)}–{fmt(high)}"
    return f"{symbol}{amount}/{period}"


def find_salaries(text: str, default_currency: str = "USD") -> list[Salary]:
    """All plausible pay ranges in `text`, in order of appearance."""
    text = _clean(text)
    found: list[Salary] = []
    taken: list[tuple[int, int]] = []

    def add(match: re.Match[str], low: float, high: float) -> None:
        if _NOT_PAY.search(text[match.end() : match.end() + 20]):
            return
        if low > high:
            low, high = high, low
        period = _period(text, match.end(), low)
        annual_low, annual_high = _annualize(low, period), _annualize(high, period)
        if not (15_000 <= annual_low and annual_high <= 2_000_000):
            return
        if annual_high > annual_low * 4:  # "$5 - $500,000" is not a salary range
            return
        currency = _currency(match, text, default_currency)
        found.append(
            Salary(annual_low, annual_high, currency, period, _format(low, high, currency, period))
        )
        taken.append(match.span())

    for match in _RANGE.finditer(text):
        a_k, b_k = match.group("ak"), match.group("bk")
        a, b = _number(match.group("a"), None), _number(match.group("b"), None)
        # "$85 - $110K": a "k" on one side applies to a small number on the other.
        low = a * 1000 if (a_k or (b_k and a < 1000)) else a
        high = b * 1000 if (b_k or (a_k and b < 1000)) else b
        add(match, low, high)

    for match in _SINGLE.finditer(text):
        if any(start <= match.start() < end for start, end in taken):
            continue
        before = text[max(0, match.start() - 80) : match.start()]
        if not _PAY_WORDS.search(before):
            continue
        value = _number(match.group("a"), match.group("ak"))
        add(match, value, value)

    return found


def pick_salary(text: str, default_currency: str = "USD") -> Salary | None:
    """The range to show for a posting: the first CAD range when there is
    one (Canadian postings often list US ranges too), else the first range."""
    salaries = find_salaries(text, default_currency)
    if not salaries:
        return None
    return next((s for s in salaries if s.currency == "CAD"), salaries[0])


def with_salary(posting: JobPosting, text: str) -> JobPosting:
    """Attaches the salary found in `text` (a description, or a provider's
    pay summary) unless the posting already has one. A bare "$" counts as
    CAD for Canadian locations and USD otherwise."""
    if posting.salary_max is not None or not text:
        return posting
    default = "CAD" if is_canada(posting.location, allow_remote=False) else "USD"
    found = pick_salary(text, default)
    if found is None:
        return posting
    return replace(
        posting,
        salary=found.text,
        salary_min=found.low,
        salary_max=found.high,
        salary_currency=found.currency,
    )
