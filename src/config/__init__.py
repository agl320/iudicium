"""Application configuration.

This package exposes configuration constants (e.g., scraper endpoints) in a
single import location.
"""

from .config import (
    AUTODESK_API_URL,
    DEFAULT_API_URL,
    DEFAULT_HEADERS,
    DEFAULT_PAYLOAD,
    MOTOROLA_API_URL,
    MOTOROLA_PAYLOAD,
    RBC_API_URL,
    SALESFORCE_API_URL,
    TD_API_URL,
    TELUS_API_URL,
)

# Legacy exports
from .config import (
    AUTODESK_URL,
    HEADERS,
    MOTOROLA_URL,
    PAYLOAD,
    RBC_URL,
    SALESFORCE_URL,
    TD_URL,
    TELUS_URL,
    URL,
)

__all__ = [
    "AUTODESK_API_URL",
    "DEFAULT_API_URL",
    "DEFAULT_HEADERS",
    "DEFAULT_PAYLOAD",
    "MOTOROLA_API_URL",
    "MOTOROLA_PAYLOAD",
    "RBC_API_URL",
    "SALESFORCE_API_URL",
    "TD_API_URL",
    "TELUS_API_URL",
    "AUTODESK_URL",
    "HEADERS",
    "MOTOROLA_URL",
    "PAYLOAD",
    "RBC_URL",
    "SALESFORCE_URL",
    "TD_URL",
    "TELUS_URL",
    "URL",
]
