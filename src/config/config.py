DEFAULT_API_URL = "https://company.wd1.myworkdayjobs.com/wday/cxs/company/jobs"
MOTOROLA_API_URL = "https://motorolasolutions.wd5.myworkdayjobs.com/wday/cxs/motorolasolutions/Careers/jobs"
TD_API_URL = "https://td.wd3.myworkdayjobs.com/wday/cxs/td/TD_Bank_Careers/jobs"

MOTOROLA_PAYLOAD = {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""}
DEFAULT_PAYLOAD = {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""}

DEFAULT_HEADERS = {
    "Content-Type": "application/json"
}

# Backwards-compat aliases (prefer the names above)
URL = DEFAULT_API_URL
MOTOROLA_URL = MOTOROLA_API_URL
TD_URL = TD_API_URL

PAYLOAD = DEFAULT_PAYLOAD
HEADERS = DEFAULT_HEADERS

