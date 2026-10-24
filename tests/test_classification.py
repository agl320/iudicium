import unittest

from backend.config.loader import load_config
from backend.models import JobPosting
from backend.services.classifier import classify, normalize_employment_type
from backend.services.discord import build_embed
from backend.services.sources import (
    WORKDAY_FULL_TIME_FACETS,
    WORKDAY_FULL_TIME_LABEL,
    WORKDAY_INTERN_FACETS,
    WORKDAY_INTERN_LABEL,
    _resolve_workday_facet,
)

CONFIG = load_config()


def posting(title: str, employment_type: str = "") -> JobPosting:
    return JobPosting(
        source="test",
        title=title,
        company="Acme",
        company_url="acme.com",
        location="Vancouver, BC",
        url="https://example.com/job",
        employment_type=employment_type,
    )


def category(title: str, employment_type: str = "") -> str:
    return classify(posting(title, employment_type), CONFIG.tracks)


class ConfigTests(unittest.TestCase):
    def test_tracks_loaded_with_colors(self):
        self.assertEqual(CONFIG.track("tech_intern").color, 0x0BBEFE)
        self.assertEqual(CONFIG.track("hr").color, 0xEC4899)

    def test_company_names_are_unique_and_have_domains(self):
        names = [c.name.lower() for c in CONFIG.companies]
        self.assertEqual(len(names), len(set(names)))
        for company in CONFIG.companies:
            self.assertTrue(company.domain, company.name)

    def test_semiconductors_enabled(self):
        enabled = {c.name for c in CONFIG.enabled_companies}
        for name in ("Qualcomm", "Broadcom", "Marvell", "Micron", "Analog Devices"):
            self.assertIn(name, enabled)


class ClassifierTests(unittest.TestCase):
    def test_tech_interns(self):
        for title in (
            "Software Engineering Intern - Summer 2027",
            "NVIDIA Spring 2027 Internships: Developer and Performance Technology",
            "Hardware Co-op (8 months)",
            "Software Engineer, New Grad",
        ):
            self.assertEqual(category(title), "tech_intern", title)

    def test_provider_intern_hint(self):
        self.assertEqual(category("ASIC Design Engineer", "intern"), "tech_intern")

    def test_hr_full_time(self):
        for title in (
            "Senior HR Business Partner, Hardware",
            "Workday HRIS Analyst",
            "Payroll Specialist",
            "Human Resources Generalist",
            "People Operations Associate",
            "Talent Acquisition Partner",
        ):
            self.assertEqual(category(title, "full_time"), "hr", title)
            self.assertEqual(category(title), "hr", title)

    def test_hr_excludes_non_full_time(self):
        self.assertEqual(category("Payroll Specialist (Fixed Term)"), "")
        self.assertEqual(category("HR Coordinator - Part Time"), "")
        self.assertEqual(category("Payroll Specialist", "contract"), "")
        self.assertEqual(category("Payroll Specialist", "part_time"), "")

    def test_hr_interns_are_not_tech_interns(self):
        self.assertEqual(category("HR Intern"), "")
        self.assertEqual(category("Payroll Co-op"), "")

    def test_unrelated_full_time_roles(self):
        self.assertEqual(category("Senior SRAM Circuit Design Engineer"), "")
        self.assertEqual(category("Integrated Digital Marketing Manager"), "")

    def test_normalize_employment_type(self):
        cases = {
            "FullTime": "full_time",
            "Full-time": "full_time",
            "permanent": "full_time",
            "Intern (Fixed Term)": "intern",
            "Student / Intern / Temp": "intern",
            "PartTime": "part_time",
            "Contract": "contract",
            "Temporary": "contract",
            "": "",
            None: "",
        }
        for raw, expected in cases.items():
            self.assertEqual(normalize_employment_type(raw), expected, raw)


class WorkdayFacetTests(unittest.TestCase):
    FACETS = [
        {
            "facetParameter": "workerSubType",
            "values": [
                {"descriptor": "Regular", "id": "r1"},
                {"descriptor": "Intern (Fixed Term)", "id": "i1"},
                {"descriptor": "New College Graduate", "id": "n1"},
            ],
        },
        {
            "facetParameter": "timeType",
            "values": [
                {"descriptor": "Full time", "id": "ft"},
                {"descriptor": "Part time", "id": "pt"},
            ],
        },
        {
            "facetParameter": "locationMainGroup",
            "values": [
                {
                    "facetParameter": "jobFamilyGroup",
                    "values": [{"descriptor": "Interns", "id": "jf1"}],
                }
            ],
        },
    ]

    def test_intern_prefers_worker_sub_type(self):
        self.assertEqual(
            _resolve_workday_facet(
                self.FACETS, WORKDAY_INTERN_FACETS, WORKDAY_INTERN_LABEL
            ),
            {"workerSubType": ["i1"]},
        )

    def test_nested_facets_are_found(self):
        self.assertEqual(
            _resolve_workday_facet(
                self.FACETS[2:], WORKDAY_INTERN_FACETS, WORKDAY_INTERN_LABEL
            ),
            {"jobFamilyGroup": ["jf1"]},
        )

    def test_full_time(self):
        self.assertEqual(
            _resolve_workday_facet(
                self.FACETS, WORKDAY_FULL_TIME_FACETS, WORKDAY_FULL_TIME_LABEL
            ),
            {"timeType": ["ft"]},
        )

    def test_missing_facet(self):
        self.assertEqual(
            _resolve_workday_facet([], WORKDAY_INTERN_FACETS, WORKDAY_INTERN_LABEL),
            {},
        )


class DiscordEmbedTests(unittest.TestCase):
    def test_colors_follow_track(self):
        tech = build_embed(posting("Intern"), CONFIG.track("tech_intern"))
        hr = build_embed(posting("HR Partner"), CONFIG.track("hr"))
        self.assertEqual(tech["color"], 0x0BBEFE)
        self.assertEqual(hr["color"], 0xEC4899)
        self.assertEqual(hr["fields"][2]["value"], "HR / HRIS / Payroll")


if __name__ == "__main__":
    unittest.main()
