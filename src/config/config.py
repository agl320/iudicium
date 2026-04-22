DEFAULT_API_URL = "https://company.wd1.myworkdayjobs.com/wday/cxs/company/jobs"
MOTOROLA_API_URL = "https://motorolasolutions.wd5.myworkdayjobs.com/wday/cxs/motorolasolutions/Careers/jobs"
TD_API_URL = "https://td.wd3.myworkdayjobs.com/wday/cxs/td/TD_Bank_Careers/jobs"
AUTODESK_API_URL = "https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs"
RBC_API_URL = "https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1"
TELUS_API_URL = (
    "https://lifeworks.wd3.myworkdayjobs.com/wday/cxs/lifeworks/External/jobs"
)
SALESFORCE_API_URL = "https://salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/External_Career_Site/jobs"
CIBC_API_URL = "https://cibc.wd3.myworkdayjobs.com/wday/cxs/cibc/search/jobs"

MOTOROLA_PAYLOAD = {"appliedFacets": {}, "limit": 20, "offset": 0, "searchText": ""}
DEFAULT_WORKDAY_PAYLOAD = {
    "appliedFacets": {},
    "limit": 20,
    "offset": 0,
    "searchText": "",
}
DEFAULT_RIPPLING_PAYLOAD = {
    "page": 0,
    "pageSize": 20,
    "searchQuery": "",
    "city": "",
    "state": "",
    "country": "",
    "workplaceType": "",
    "groupJobsByLocation": "true",
}

DWAVE_API_URL = "https://ats.rippling.com/api/v2/board/d-wave-quantum/jobs"

DEFAULT_HEADERS = {"Content-Type": "application/json"}

# Legacy aliases (kept for backward-compatible imports)
URL = DEFAULT_API_URL
HEADERS = DEFAULT_HEADERS
PAYLOAD = DEFAULT_WORKDAY_PAYLOAD

AUTODESK_URL = AUTODESK_API_URL
CIBC_URL = CIBC_API_URL
MOTOROLA_URL = MOTOROLA_API_URL
RBC_URL = RBC_API_URL
SALESFORCE_URL = SALESFORCE_API_URL
TD_URL = TD_API_URL
TELUS_URL = TELUS_API_URL
