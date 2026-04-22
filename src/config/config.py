DEFAULT_WORKDAY_API_URL = "https://company.wd1.myworkdayjobs.com/wday/cxs/company/jobs"
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
RIPPLING_API_URL = "https://ats.rippling.com/api/v2/board/rippling/jobs"
ANACONDA_API_URL = "https://api.rippling.com/platform/api/ats/v1/board/anaconda/jobs"

DEFAULT_HEADERS = {"Content-Type": "application/json"}

PERPLEXITY_API_URL = (
    "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams"
)

RAPTOR_MAPS_API_URL = "https://ats.rippling.com/api/v2/board/raptor-maps-inc/jobs"
