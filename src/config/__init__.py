"""Application configuration.

This package exposes configuration constants (e.g., scraper endpoints) in a
single import location.
"""

from .config import (
	DEFAULT_API_URL,
	DEFAULT_HEADERS,
	DEFAULT_PAYLOAD,
	MOTOROLA_API_URL,
	MOTOROLA_PAYLOAD,
	TD_API_URL,
)

__all__ = [
	"DEFAULT_API_URL",
	"DEFAULT_HEADERS",
	"DEFAULT_PAYLOAD",
	"MOTOROLA_API_URL",
	"MOTOROLA_PAYLOAD",
	"TD_API_URL",
	"HEADERS",
	"MOTOROLA_URL",
	"PAYLOAD",
	"TD_URL",
	"URL",
]
