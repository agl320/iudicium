"""Application configuration.

This package exposes configuration constants (e.g., scraper endpoints) in a
single import location.
"""

from .config import (
    AUTODESK_API_URL,
    CIBC_API_URL,
    DEFAULT_API_URL,
    DEFAULT_HEADERS,
    DEFAULT_WORKDAY_PAYLOAD,
    DEFAULT_RIPPLING_PAYLOAD,
    DWAVE_API_URL,
    MOTOROLA_API_URL,
    MOTOROLA_PAYLOAD,
    RBC_API_URL,
    SALESFORCE_API_URL,
    TD_API_URL,
    TELUS_API_URL,
)

__all__ = [
    "AUTODESK_API_URL",
    "CIBC_API_URL",
    "DEFAULT_API_URL",
    "DEFAULT_HEADERS",
    "DEFAULT_RIPPLING_PAYLOAD",
    "DEFAULT_WORKDAY_PAYLOAD",
    "DWAVE_API_URL",
    "MOTOROLA_API_URL",
    "MOTOROLA_PAYLOAD",
    "RBC_API_URL",
    "SALESFORCE_API_URL",
    "TD_API_URL",
    "TELUS_API_URL",
]
