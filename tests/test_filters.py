import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from backend.config.loader import ConfigError, DEFAULT_CONFIG_PATH, load_config
from backend.models import JobPosting
from backend.services.classifier import classify, match_track, needs_details
from backend.services.details import Details, apply_details
from backend.services.location import is_australia, is_british_columbia, is_canada
from backend.services.salary import find_salaries, pick_salary, with_salary

FILTERED = load_config()
BROAD = load_config(filters_path=None)


def posting(title, location="Vancouver, BC", **extra) -> JobPosting:
    return JobPosting(
        source="test",
        title=title,
        company="Acme",
        company_url="acme.com",
        location=location,
        url="https://example.com/job",
        **extra,
    )


def paid(title, location="Vancouver, BC", low=75000, high=95000, currency="CAD"):
    return posting(
        title,
        location,
        salary="x",
        salary_min=low,
        salary_max=high,
        salary_currency=currency,
        details_checked=True,
    )


class HrFilterTests(unittest.TestCase):
    def test_filter_loaded(self):
        hr = FILTERED.track("hr").filter
        self.assertIsNotNone(hr)
        self.assertEqual(hr.regions, ("british_columbia",))
        self.assertTrue(hr.require_salary)
        self.assertEqual(hr.min_salary, 70000)
        self.assertEqual(FILTERED.track("tech_intern").filter.regions, ("north_america", "australia"))

    def test_hris_and_payroll_roles_in_bc_with_pay(self):
        for title in (
            "HR Analyst II",
            "HRIS Analyst",
            "Senior HRIS Specialist",
            "Workday HCM Analyst",
            "Payroll Specialist",
            "Payroll Analyst 2",
            "People Systems Analyst",
            "HR Operations Specialist",
            "Compensation Analyst",
            "Benefits Specialist",
            "Human Resources Generalist",
            "UKG Payroll Administrator",
        ):
            self.assertEqual(classify(paid(title), FILTERED.tracks), "hr", title)

    def test_broad_hr_titles_not_in_strict_track(self):
        for title in (
            "Talent Acquisition Partner",
            "Technical Sourcer",
            "Director, Payroll",
            "Head of People Operations",
            "Vice President, Human Resources",
        ):
            self.assertEqual(classify(paid(title), FILTERED.tracks), "", title)
            # ...but they are still collected (broad match) and shown in "All".
            self.assertEqual(match_track(paid(title), FILTERED.tracks), "hr", title)

    def test_salary_required_and_threshold(self):
        self.assertEqual(classify(posting("Payroll Analyst"), FILTERED.tracks), "")
        self.assertEqual(
            classify(paid("Payroll Analyst", low=55000, high=68000), FILTERED.tracks), ""
        )
        # The ceiling counts (salary_basis = "max").
        self.assertEqual(
            classify(paid("Payroll Analyst", low=60000, high=72000), FILTERED.tracks), "hr"
        )
        # US$55k-60k is about CA$76k-83k.
        self.assertEqual(
            classify(paid("Payroll Analyst", low=55000, high=60000, currency="USD"), FILTERED.tracks),
            "hr",
        )

    def test_region(self):
        for location in ("Toronto, ON", "Seattle, WA", "Vancouver, WA", "Remote - US", "Pune, India"):
            self.assertEqual(classify(paid("HRIS Analyst", location), FILTERED.tracks), "", location)
        for location in (
            "Burnaby, British Columbia",
            "VANCOUVER, British Columbia, Canada",
            "Seattle, WA; Vancouver, BC",
            "Remote - Canada",
            "Kelowna, BC, CA, V1Y 6H2",
        ):
            self.assertEqual(classify(paid("HRIS Analyst", location), FILTERED.tracks), "hr", location)

    def test_without_filters_hr_is_broad(self):
        self.assertEqual(classify(posting("Talent Acquisition Partner", "Toronto, ON"), BROAD.tracks), "hr")
        self.assertEqual(classify(posting("Payroll Analyst", "Austin, TX"), BROAD.tracks), "hr")
        self.assertEqual(classify(posting("Payroll Analyst", "Pune, India"), BROAD.tracks), "")

    def test_needs_details(self):
        tracks = FILTERED.tracks
        self.assertTrue(needs_details(posting("Payroll Analyst"), tracks))
        self.assertTrue(needs_details(posting("Payroll Analyst", "3 Locations"), tracks))
        # Already fails something that the detail page cannot change.
        self.assertFalse(needs_details(posting("Payroll Analyst", "Toronto, ON"), tracks))
        self.assertFalse(needs_details(posting("Director, Payroll"), tracks))
        self.assertFalse(needs_details(posting("Software Engineer Intern"), tracks))
        self.assertFalse(needs_details(paid("Payroll Analyst"), tracks))
        # No filter on HR -> nothing to look up.
        self.assertFalse(needs_details(posting("Payroll Analyst"), BROAD.tracks))

    def test_apply_details(self):
        details = Details(
            "<p>Base pay range: $72,000 - $90,000 CAD</p>",
            ("Burnaby, British Columbia, Canada", "Toronto, Ontario, Canada"),
        )
        enriched = apply_details(posting("Payroll Analyst", "2 Locations"), details)
        self.assertTrue(enriched.details_checked)
        self.assertIn("Burnaby", enriched.location)
        self.assertEqual(enriched.salary, "CA$72,000–90,000/yr")
        self.assertEqual(classify(enriched, FILTERED.tracks), "hr")


class SalaryTests(unittest.TestCase):
    def test_formats(self):
        cases = {
            "Salary Range: $70,000-$120,000": ("CAD", 70000, 120000),
            "hiring range is from $59,800 - 78,500 annually": ("CAD", 59800, 78500),
            "USD $86,100 - $169,800 per year": ("USD", 86100, 169800),
            "Hiring Range in USD from: $103,000 to $264,100 per annum": ("USD", 103000, 264100),
            "CA$85K – CA$110K • Offers Equity": ("CAD", 85000, 110000),
            "$32.50 - $40.00 per hour": ("CAD", 32.5 * 2080, 40 * 2080),
            "The base salary for this role is $95,000.": ("CAD", 95000, 95000),
        }
        for text, (currency, low, high) in cases.items():
            found = pick_salary(text, "CAD")
            self.assertIsNotNone(found, text)
            self.assertEqual((found.currency, found.low, found.high), (currency, low, high), text)

    def test_prefers_cad_range(self):
        text = "US: $176000 - $256000 (USD) + bonus. Canada: $174000 - $178000 (CAD) + bonus"
        self.assertEqual(pick_salary(text, "USD").currency, "CAD")
        self.assertEqual(pick_salary(text, "USD").low, 174000)

    def test_ignores_non_salary_money(self):
        self.assertEqual(find_salaries("a $350 billion startup managing $250MM", "CAD"), [])
        self.assertEqual(find_salaries("We have 1,200 employees since 2009", "CAD"), [])

    def test_default_currency_from_location(self):
        canada = with_salary(posting("x", "Vancouver, BC"), "pay: $80,000 - $90,000")
        us = with_salary(posting("x", "Austin, TX"), "pay: $80,000 - $90,000")
        self.assertEqual((canada.salary_currency, us.salary_currency), ("CAD", "USD"))


class BritishColumbiaTests(unittest.TestCase):
    def test_bc(self):
        for location in (
            "Vancouver, BC", "Vancouver", "745 THURLOW ST:VANCOUVER", "Burnaby",
            "Canada · British Columbia · Vancouver", "CA, BC, Vancouver",
            "Richmond, British Columbia", "Victoria, BC",
            "AMER - Canada - British Columbia - Remote",
        ):
            self.assertTrue(is_british_columbia(location), location)

    def test_not_bc(self):
        for location in (
            "Vancouver, WA", "Vancouver, Washington, United States of America",
            "Toronto, ON", "Richmond, VA", "Victoria, Australia", "CAN-QC-Home Office",
            "Remote - US", "2 Locations", "",
        ):
            self.assertFalse(is_british_columbia(location), location)

    def test_remote(self):
        for location in ("Remote", "Remote - Canada", "Remote (Canada)", "Canada"):
            self.assertTrue(is_british_columbia(location), location)
            self.assertFalse(is_british_columbia(location, allow_remote=False), location)
        self.assertTrue(is_canada("Toronto, ON"))


class TechInternRegionTests(unittest.TestCase):
    def test_north_america_australia_and_remote(self):
        for location in (
            "Santa Clara, CA", "Toronto, ON", "Mexico City", "Sydney, NSW, Australia",
            "Melbourne, VIC", "AUS-Sydney", "Brisbane", "Remote - Australia", "Remote",
            "Sydney; London, UK", "2 Locations",
        ):
            self.assertEqual(classify(posting("Software Engineer Intern", location), FILTERED.tracks), "tech_intern", location)

    def test_elsewhere(self):
        for location in (
            "Xi'an, China", "Tampere, Finland", "Remote - India", "London", "Singapore",
            "Perth, Scotland, UK",
        ):
            self.assertEqual(classify(posting("Software Engineer Intern", location), FILTERED.tracks), "", location)
        self.assertFalse(is_australia("Austin, TX"))


class FilterConfigTests(unittest.TestCase):
    def write(self, text: str) -> Path:
        directory = Path(tempfile.mkdtemp())
        (directory / "companies.toml").write_bytes(DEFAULT_CONFIG_PATH.read_bytes())
        (directory / "filters.toml").write_text(text, encoding="utf-8")
        return directory / "companies.toml"

    def test_missing_file_is_broad(self):
        directory = Path(tempfile.mkdtemp())
        (directory / "companies.toml").write_bytes(DEFAULT_CONFIG_PATH.read_bytes())
        config = load_config(directory / "companies.toml")
        self.assertIsNone(config.track("hr").filter)

    def test_disabled_section_is_broad(self):
        config = load_config(self.write("[hr]\nenabled = false\nmin_salary = 1\n"))
        self.assertIsNone(config.track("hr").filter)

    def test_bad_options_rejected(self):
        for text in (
            "[hr]\nregions = ['ontario']\n",
            "[hr]\nsalary_basis = 'avg'\n",
            "[hr]\nmin_salry = 70000\n",
            "[nope]\nmin_salary = 1\n",
        ):
            with self.assertRaises(ConfigError, msg=text):
                load_config(self.write(text))


if __name__ == "__main__":
    unittest.main()
