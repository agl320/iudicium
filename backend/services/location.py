"""Decides whether a posting's free-text location is in North America.

Boards report locations inconsistently ("US-CA-Menlo Park", "Toronto, ON, CAN",
"2 Locations", "Remote - India", ...), so a location is only rejected when it
positively points somewhere else. Anything ambiguous (empty, "Remote",
"Hybrid", a bare "Austin") and any "multiple locations" variant is kept.

North America here means the United States, Canada and Mexico.
"""

from __future__ import annotations

import re

_US_STATES = [
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
    "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
    "missouri", "montana", "nebraska", "nevada", r"new\s+hampshire",
    r"new\s+jersey", r"new\s+mexico", r"new\s+york", r"north\s+carolina",
    r"north\s+dakota", "ohio", "oklahoma", "oregon", "pennsylvania",
    r"rhode\s+island", r"south\s+carolina", r"south\s+dakota", "tennessee",
    "texas", "utah", "vermont", "virginia", "washington", r"west\s+virginia",
    "wisconsin", "wyoming", r"district\s+of\s+columbia", r"puerto\s+rico",
]
_CA_PROVINCES = [
    "alberta", r"british\s+columbia", "manitoba", r"new\s+brunswick",
    "newfoundland", r"nova\s+scotia", "ontario", r"prince\s+edward\s+island",
    "quebec", "saskatchewan", "yukon", "nunavut", r"northwest\s+territories",
]
# Feeds sometimes mangle accents ("Qu�bec"), so those letters are wildcards.
_NA_NAMES = re.compile(
    r"\b("
    + "|".join(
        _US_STATES
        + _CA_PROVINCES
        + [
            r"united\s+states(\s+of\s+america)?",
            "usa",
            "canada",
            "canadian",
            "mexico",
            "mexican",
            r"qu.bec",
            r"montr.al",
        ]
    )
    + r")\b|\bu\.s\.a?\b|\bd\.c\.",
    re.IGNORECASE,
)
# Uppercase country tokens: "Remote - US", "Toronto, ON, CAN", "US-CA-Menlo Park".
_NA_COUNTRY_CODES = re.compile(r"(?<![A-Za-z])(?:US|USA|CAN|CA|MEX|MX)(?![A-Za-z])")

_STATE_CODES = (
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO "
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC"
).split()
_PROVINCE_CODES = "AB BC MB NB NL NS NT NU ON PE QC SK YT".split()
# Region codes that are also ISO country codes (IN = India, DE = Germany, ...).
# A foreign city next to one of these wins ("Pune, IN").
_AMBIGUOUS_CODES = {"IN", "DE", "IL", "ID", "CO", "AR", "PE", "PA", "MA", "AL", "MD", "NL", "SK"}
# Region codes only count where they read like one: after a comma, semicolon or
# dash ("Plano, TX", "US-CA-Menlo Park"), or leading with " - " ("CA - San
# Francisco"). A leading "IN-Pune" / "DE-Munich" is an ISO country prefix.
_REGION_CODE = re.compile(
    r"(?:[,;:]\s*|-|^|\s-\s)(" + "|".join(_STATE_CODES + _PROVINCE_CODES) + r")(?![A-Za-z])"
)

_FOREIGN_COUNTRY_NAMES = re.compile(
    r"\b("
    + "|".join(
        [
            "india", "china", "prc", r"hong\s+kong", "taiwan", "japan", "korea",
            "singapore", "malaysia", "thailand", "vietnam", r"viet\s+nam",
            "indonesia", "philippines", "pakistan", "bangladesh",
            r"sri\s+lanka", "australia", r"new\s+zealand", "israel", "turkey",
            r"t.rkiye", r"saudi\s+arabia", r"united\s+arab\s+emirates", "uae",
            "qatar", "kuwait", "bahrain", "oman", "jordan", "egypt", "tunisia",
            "morocco", r"south\s+africa", "nigeria", "kenya", "ghana",
            r"united\s+kingdom", "uk", r"great\s+britain", "england", "eng",
            "scotland", "wales", "ireland", "france", "germany", "spain",
            "portugal", "italy", "netherlands", "belgium", "luxembourg",
            "switzerland", "austria", "sweden", "norway", "denmark", "finland",
            "iceland", "poland", r"czech(\s+republic|ia)?", "slovakia",
            "hungary", "romania", "bulgaria", "serbia", "croatia", "slovenia",
            "greece", "ukraine", "lithuania", "latvia", "estonia", "emea",
            "apac", "latam", r"european\s+union", "brazil", "brasil",
            "argentina", "chile", "colombia", "peru", "uruguay",
            r"costa\s+rica", "panama", r"dominican\s+republic", "bahamas",
            "jamaica", "ecuador", "guatemala", r"el\s+salvador", r"europe(an)?", "mea",
            r"middle\s+east", "africa", "asia", "kazakhstan", "armenia",
            "palestine", "cyprus", "algeria", "guinea", "aruba", "trinidad",
            "caicos", "cayman", "barbados", "belize",
        ]
    )
    + r")\b",
    re.IGNORECASE,
)
_FOREIGN_COUNTRY_CODES = re.compile(
    r"(?<![A-Za-z])(?:IND|JPN|KOR|SGP|MYS|ISR|AUS|ARE|GBR|GB|IRL|DEU|ESP|POL|CHN"
    r"|TWN|HKG|THA|VNM|IDN|PHL|BRA|ARG|CHL|COL|JOR|GBP|CHE|CZE)(?![A-Za-z])"
)
# Cities that show up with no country attached.
_FOREIGN_CITIES = re.compile(
    r"\b("
    + "|".join(
        [
            "bengaluru", "bangalore", "hyderabad", "chennai", "mumbai", "pune",
            "noida", "gurgaon", "gurugram", "delhi", "kolkata", "ahmedabad",
            "vadodara", "kochi", "shanghai", "beijing", "shenzhen", "suzhou",
            "guangzhou", "chengdu", "hangzhou", "nanjing", "wuhan", "tokyo",
            "osaka", "yokohama", "seoul", "taipei", "hsinchu", "kaohsiung",
            "penang", "putrajaya", r"kuala\s+lumpur", "johor", "bangkok",
            "hanoi", r"ho\s+chi\s+minh", "jakarta", "manila", "sydney",
            "melbourne", "brisbane", "auckland", r"tel\s+aviv", "haifa",
            "yokneam", "jerusalem", "istanbul", "riyadh", "dubai",
            r"abu\s+dhabi", "cairo", "johannesburg", r"cape\s+town", "london",
            "manchester", "edinburgh", "glasgow", "bristol", "dublin", "cork",
            "paris", "lyon", "munich", "munchen", "berlin", "hamburg",
            "frankfurt", "stuttgart", "dresden", "madrid", "barcelona",
            "lisbon", "milan", "rome", "amsterdam", "eindhoven", "brussels",
            "zurich", "geneva", "lausanne", "vienna", "stockholm", "oslo",
            "copenhagen", "helsinki", "espoo", "warsaw", "krakow", r"krak.w",
            "gdansk", "wroclaw", "prague", "budapest", "bucharest", "belgrade",
            "sofia", "athens", "kyiv", r"s.o\s+paulo", r"sao\s+paulo",
            r"buenos\s+aires", "bogota", "lima", "alabang", "makati", "muntinlupa",
            r"metro\s+manila", "sheffield", "nottingham", "aberdeen",
            r"newcastle\s+upon\s+tyne", r"george\s+town", "admiralty", "nassau",
            "dusseldorf", "d.sseldorf", "basel", "canberra", "nicosia",
            "yerevan", "almaty", "amman", "algiers", "helier", "dubin",
            "bratislava", "casablanca", "tbilisi",
        ]
    )
    + r")\b",
    re.IGNORECASE,
)

_MULTI_LOCATION = re.compile(
    r"\b\d+\+?\s+locations?\b"
    r"|\b(?:multiple|various|several|many|more|other)\s+(?:locations?|sites?|offices?|cities)\b"
    r"|\bmulti[-\s]?(?:location|site|office)s?\b"
    r"|\bmore\.\.\."
    r"|\blocations\b",
    re.IGNORECASE,
)


def is_multiple_locations(location: str) -> bool:
    return bool(_MULTI_LOCATION.search(location))


def is_north_america(location: str | None) -> bool:
    """True if the location is in (or could be in) the US, Canada or Mexico."""
    text = (location or "").strip()
    if not text or is_multiple_locations(text):
        return True
    if _NA_NAMES.search(text) or _NA_COUNTRY_CODES.search(text):
        return True

    foreign_city = bool(_FOREIGN_CITIES.search(text))
    region_codes = [m.group(1) for m in _REGION_CODE.finditer(text)]
    if any(code not in _AMBIGUOUS_CODES for code in region_codes):
        return True
    if region_codes and not foreign_city:
        return True

    if (
        foreign_city
        or _FOREIGN_COUNTRY_NAMES.search(text)
        or _FOREIGN_COUNTRY_CODES.search(text)
    ):
        return False
    return True


# --- Canada / British Columbia ------------------------------------------------
#
# Stricter than is_north_america: a location only counts when it positively
# points at the region. Multi-location strings ("Vancouver, BC; Seattle, WA")
# count when any of their parts does.

_PARTS = re.compile(r"\s*(?:;|\||\s/\s|\bor\b)\s*", re.IGNORECASE)
_REMOTE = re.compile(
    r"\b(remote|virtual|work from home|wfh|home[- ]?based|distributed|anywhere)\b",
    re.IGNORECASE,
)
_CANADA_STRICT = re.compile(r"\bcanad(a|ian)\b|(?<![A-Za-z])CAN(?![A-Za-z])", re.IGNORECASE)
_PROVINCES = re.compile(r"\b(" + "|".join(_CA_PROVINCES) + r"|qu.bec)\b", re.IGNORECASE)
_PROVINCE_CODE = re.compile(r"(?:^|[,;:\-]\s*|\s-\s)(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)(?![A-Za-z])")
_CANADIAN_POSTAL = re.compile(r"\b([A-CEGHJ-NPR-TVXY])\d[A-Z]\s?\d[A-Z]\d\b")
_US_CONTEXT = re.compile(
    r"(?i:\bwashington\b|united\s+states|\bu\.s\.)|(?<![A-Za-z])(WA|US|USA)(?![A-Za-z])",
)

_BC_EXPLICIT = re.compile(
    r"(?i:british\s+columbia)|(?<![A-Za-z])B\.?C\.?(?![A-Za-z])|\bV\d[A-Z]\s?\d[A-Z]\d\b"
)
# Only in BC (or only meant as BC once US context is ruled out).
_BC_CITIES = re.compile(
    r"\b(vancouver|burnaby|kelowna|abbotsford|coquitlam|nanaimo|kamloops|"
    r"new\s+westminster|port\s+moody|port\s+coquitlam|chilliwack|prince\s+george|"
    r"squamish|whistler|courtenay|penticton|maple\s+ridge|white\s+rock|"
    r"north\s+vancouver|west\s+vancouver|campbell\s+river|cranbrook|"
    r"fort\s+st\.?\s+john|saanich|langford)\b",
    re.IGNORECASE,
)
# Common elsewhere too (Richmond VA, Victoria AU, Surrey UK): need Canada context.
_BC_CITIES_AMBIGUOUS = re.compile(
    r"\b(richmond|victoria|surrey|langley|delta|vernon)\b", re.IGNORECASE
)


def _other_province(part: str) -> bool:
    names = [m.group(1).lower() for m in _PROVINCES.finditer(part)]
    codes = [m.group(1) for m in _PROVINCE_CODE.finditer(part)]
    return any(not n.startswith("british") for n in names) or any(c != "BC" for c in codes)


def _canada_part(part: str) -> bool:
    if not is_north_america(part):
        return False
    return bool(
        _CANADA_STRICT.search(part)
        or _PROVINCES.search(part)
        or _PROVINCE_CODE.search(part)
        or _CANADIAN_POSTAL.search(part)
    )


def _bc_part(part: str, allow_remote: bool) -> bool:
    if _BC_EXPLICIT.search(part):
        return True
    if _other_province(part) or not is_north_america(part):
        return False
    if _BC_CITIES.search(part) and not _US_CONTEXT.search(part):
        return True
    if _BC_CITIES_AMBIGUOUS.search(part) and _CANADA_STRICT.search(part):
        return True
    if allow_remote:
        # "Remote", "Remote - Canada", "Virtual Canada", or a bare "Canada".
        remote = bool(_REMOTE.search(part))
        bare_canada = bool(re.fullmatch(r"\W*canada\W*", part, re.IGNORECASE))
        if (remote or bare_canada) and not _US_CONTEXT.search(part):
            stripped = _REMOTE.sub("", _CANADA_STRICT.sub("", part))
            # Nothing but "remote"/"Canada" and punctuation left.
            return not re.search(r"[A-Za-z]{2,}", stripped)
    return False


def _parts(location: str) -> list[str]:
    return [p for p in _PARTS.split(location or "") if p and p.strip()]


def is_canada(location: str | None, *, allow_remote: bool = True) -> bool:
    parts = _parts(location or "")
    return any(
        _canada_part(p) or (allow_remote and _bc_part(p, allow_remote=True)) for p in parts
    )


def is_british_columbia(location: str | None, *, allow_remote: bool = True) -> bool:
    return any(_bc_part(p, allow_remote) for p in _parts(location or ""))


def is_unknown_location(location: str | None) -> bool:
    """No usable location yet (empty or "3 Locations"); the job's detail page
    usually has the full list."""
    text = (location or "").strip()
    return not text or is_multiple_locations(text)


REGIONS = {
    "north_america": lambda location, allow_remote: is_north_america(location),
    "canada": lambda location, allow_remote: is_canada(location, allow_remote=allow_remote),
    "british_columbia": lambda location, allow_remote: is_british_columbia(
        location, allow_remote=allow_remote
    ),
}


def in_regions(location: str | None, regions: tuple[str, ...], *, allow_remote: bool = True) -> bool:
    return any(REGIONS[region](location, allow_remote) for region in regions)
