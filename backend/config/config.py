DEFAULT_WORKDAY_API_URL = "https://company.wd1.myworkdayjobs.com/wday/cxs/company/jobs"
DEFAULT_WORKDAY_COMPANY_URL = "https://company.wd1.myworkdayjobs.com/Careers"
CAPITALONE_COMPANY_URL = "https://capitalone.wd12.myworkdayjobs.com/Careers"
CAPITALONE_API_URL = (
    "https://capitalone.wd12.myworkdayjobs.com/wday/cxs/capitalone/Capital_One/jobs"
)
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
INTEL_COMPANY_URL = "https://intel.wd1.myworkdayjobs.com/en-US/External"
INTEL_API_URL = "https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/External/jobs"
AMD_COMPANY_URL = "https://careers.amd.com"
AMD_API_URL = "https://careers.amd.com/api/jobs?sortBy=relevance&internal=false"
SANDISK_COMPANY_URL = "https://careers.sandisk.com"
SANDISK_API_URL = "https://api.smartrecruiters.com/v1/companies/sandisk/postings"
WESTERN_DIGITAL_COMPANY_URL = "https://careers.westerndigital.com"
WESTERN_DIGITAL_API_URL = (
    "https://api.smartrecruiters.com/v1/companies/westerndigital/postings"
)
TEXAS_INSTRUMENTS_COMPANY_URL = "https://careers.ti.com"
TEXAS_INSTRUMENTS_API_URL = (
    "https://edbz.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions?"
    "finder=findReqs;siteNumber=CX&onlyData=true&limit=25&expand=requisitionList.workLocation"
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

CISCO_COMPANY_URL = "https://cisco.wd5.myworkdayjobs.com/Careers"
CISCO_API_URL = "https://cisco.wd5.myworkdayjobs.com/wday/cxs/cisco/Cisco_Careers/jobs"

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
SOFI_GREENHOUSE_API_URL = "https://boards-api.greenhouse.io/v1/boards/sofi/jobs"

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

PHENOM_PALO_ALTO_NETWORKS_API_URL = (
    "https://jobs.paloaltonetworks.com/en/search-jobs/results"
    "?ActiveFacetID=0"
    "&CurrentPage=1"
    "&RecordsPerPage=15"
    "&TotalContentResults=164"
    "&Distance=50"
    "&RadiusUnitType=0"
    "&Keywords="
    "&Location="
    "&ShowRadius=False"
    "&IsPagination=False"
    "&CustomFacetName="
    "&FacetTerm="
    "&FacetType=0"
    "&SearchResultsModuleName=Section+29+-+Search+Results"
    "&SearchFiltersModuleName=Section+29+-+Search+Filters"
    "&SortCriteria=0"
    "&SortDirection=0"
    "&SearchType=5"
    "&PostalCode="
    "&ResultsType=0"
    "&fc="
    "&fl="
    "&fcf="
    "&afc="
    "&afl="
    "&afcf="
    "&TotalContentPages=11"
)

# Probably broken
PHENOM_PALO_ALTO_NETWORKS_COMPANY_URL = "https://jobs.paloaltonetworks.com"

DATABRICKS_API_URL = (
    "https://www.databricks.com/careers-assets/page-data/company/careers/"
    "open-positions/page-data.json"
)
# Also probably broken
DATABRICKS_COMPANY_URL = "https://www.databricks.com/company/careers/open-positions"

DATADOG_API_URL = "https://gk6e3zbyuntvc5dap.a1.typesense.net/multi_search"
DATADOG_API_KEY = "1Hwq7hntXp211hKvRS3CSI2QSU7w2gFm"
DATADOG_COMPANY_URL = "https://careers.datadoghq.com"
DATADOG_PAYLOAD = {
    "searches": [
        {
            "preset": "careers_list_view",
            "collection": "careers_alias",
            "q": "*",
            "facet_by": (
                "child_department_Engineering,"
                "child_department_GeneralAdministrative,"
                "child_department_Marketing,"
                "child_department_Sales,"
                "child_department_TechnicalSolutions,"
                "location_APAC,location_Americas,location_EMEA,"
                "parent_department_Engineering,"
                "parent_department_GeneralAdministrative,"
                "parent_department_Marketing,"
                "parent_department_ProductDesign,"
                "parent_department_ProductManagement,"
                "parent_department_Sales,"
                "parent_department_TechnicalSolutions,"
                "region_APAC,region_Americas,region_EMEA,"
                "remote,time_type"
            ),
            "filter_by": "language: en && time_type:=[Early Career]",
            "max_facet_values": 50,
            "page": 1,
            "per_page": 10,
        },
        {
            "preset": "careers_list_view",
            "collection": "careers_alias",
            "q": "*",
            "facet_by": "time_type",
            "filter_by": "language: en",
            "max_facet_values": 50,
            "page": 1,
            "per_page": 0,
        },
    ]
}

# Company URL mapping for logo.dev and careers pages
COMPANY_URL_MAPPING = {
    # Workday companies
    "AMD": "amd.com",
    "Autodesk": "autodesk.com",
    "CIBC": "cibc.com",
    "Capital One": "capitalone.com",
    "Cisco": "cisco.com",
    "NVIDIA": "nvidia.com",
    "Motorola": "motorolasolutions.com",
    "RBC": "rbc.com",
    "Salesforce": "salesforce.com",
    "TD": "td.com",
    "Telus": "telus.com",
    "Intel": "intel.com",
    # Greenhouse companies
    "Stripe": "stripe.com",
    "Pinterest": "pinterest.com",
    "Twilio": "twilio.com",
    "Sofi": "sofi.com",
    # Rippling companies
    "D-Wave": "dwavesys.com",
    "Rippling": "rippling.com",
    "Anaconda": "anaconda.com",
    "Raptor Maps": "rapidmaps.com",
    # Phenom People companies
    "Palo Alto Networks": "paloaltonetworks.com",
    # Direct API companies
    "Databricks": "databricks.com",
    "Datadog": "datadog.com",
    "Sandisk": "sandisk.com",
    "Western Digital": "westerndigital.com",
    "Texas Instruments": "ti.com",
    # Ashby companies
    "Cohere": "cohere.io",
    "Perplexity": "perplexity.ai",
    "RAMP": "ramppro.com",
    "Snowflake": "snowflake.com",
    "WealthSimple": "wealthsimple.com",
    # Other
    "Deloitte": "deloitte.com",
}
