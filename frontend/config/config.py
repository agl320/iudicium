DEFAULT_WORKDAY_API_URL = "https://company.wd1.myworkdayjobs.com/wday/cxs/company/jobs"
DEFAULT_WORKDAY_COMPANY_URL = "https://company.wd1.myworkdayjobs.com/Careers"
MOTOROLA_COMPANY_URL = "https://motorolasolutions.wd5.myworkdayjobs.com/Careers"
MOTOROLA_API_URL = "https://motorolasolutions.wd5.myworkdayjobs.com/wday/cxs/motorolasolutions/Careers/jobs"
TD_COMPANY_URL = "https://td.wd3.myworkdayjobs.com/en-US/TD_Bank_Careers"
TD_API_URL = "https://td.wd3.myworkdayjobs.com/wday/cxs/td/TD_Bank_Careers/jobs"
AUTODESK_COMPANY_URL = "https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/"
AUTODESK_API_URL = "https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs"
RBC_COMPANY_URL = "https://rbc.wd3.myworkdayjobs.com/en-US/RBCGLOBAL1"
RBC_API_URL = "https://rbc.wd3.myworkdayjobs.com/wday/cxs/rbc/RBCGLOBAL1/jobs"
TELUS_COMPANY_URL = "https://lifeworks.wd3.myworkdayjobs.com/en-US/External"
TELUS_API_URL = (
    "https://lifeworks.wd3.myworkdayjobs.com/wday/cxs/lifeworks/External/jobs"
)
SALESFORCE_COMPANY_URL = (
    "https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site"
)
SALESFORCE_API_URL = "https://salesforce.wd12.myworkdayjobs.com/wday/cxs/salesforce/External_Career_Site/jobs"
CIBC_COMPANY_URL = "https://cibc.wd3.myworkdayjobs.com/en-US/search"
CIBC_API_URL = "https://cibc.wd3.myworkdayjobs.com/wday/cxs/cibc/search/jobs"
NVIDIA_API_URL = (
    "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/jobs"
)
NVIDIA_COMPANY_URL = (
    "https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite"
)

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

ASHBY_API_URL = "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams"

STRIPE_GREENHOUSE_API_URL = "https://boards-api.greenhouse.io/v1/boards/stripe/jobs"
PINTEREST_GREENHOUSE_API_URL = (
    "https://boards-api.greenhouse.io/v1/boards/pinterest/jobs"
)
TWILIO_GREENHOUSE_API_URL = "https://boards-api.greenhouse.io/v1/boards/twilio/jobs"

RAPTOR_MAPS_API_URL = "https://ats.rippling.com/api/v2/board/raptor-maps-inc/jobs"

DELOITTE_API_URL = "https://careers.deloitte.ca/services/recruiting/v1/jobs"
DELOITTE_PAYLOAD = {
    "locale": "en_US",
    "pageNumber": 0,
    "sortBy": "",
    "keywords": "",
    "location": "",
    "facetFilters": {},
    "brand": "",
    "skills": [],
    "categoryId": 984400,
    "alertId": "",
    "rcmCandidateId": "",
}
