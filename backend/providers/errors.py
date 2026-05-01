class ProviderAPIError(RuntimeError):
    """Base provider error that prints a simple message when instantiated.

    This keeps existing behavior of being a RuntimeError while providing
    a short, consistent printed output for debugging and visibility.
    """

    def __init__(self, message: str | None = None) -> None:
        if message is None:
            message = self.__class__.__name__
        # Print a concise message for quick debugging/visibility
        print(f"{self.__class__.__name__}: {message}")
        super().__init__(message)


class MotorolaAPIError(ProviderAPIError):
    pass


class WorkdayAPIError(ProviderAPIError):
    pass


class CapitalOneAPIError(WorkdayAPIError):
    pass


class TDAPIError(ProviderAPIError):
    pass


class AutodeskAPIError(ProviderAPIError):
    pass


class RBCAPIError(ProviderAPIError):
    pass


class TelusAPIError(ProviderAPIError):
    pass


class SalesforceAPIError(ProviderAPIError):
    pass


class CIBCAPIError(ProviderAPIError):
    pass


class NvidiaAPIError(ProviderAPIError):
    pass


class DWaveAPIError(ProviderAPIError):
    pass


class AshbyAPIError(ProviderAPIError):
    pass


class AshbyHQAPIError(ProviderAPIError):
    pass


class PerplexityAPIError(ProviderAPIError):
    pass


class CohereAPIError(ProviderAPIError):
    pass


class SnowflakeAPIError(ProviderAPIError):
    pass


class RampAPIError(ProviderAPIError):
    pass


class WealthsimpleAPIError(ProviderAPIError):
    pass


class GreenhouseAPIError(ProviderAPIError):
    pass


class StripeGreenhouseAPIError(ProviderAPIError):
    pass


class PinterestGreenhouseAPIError(ProviderAPIError):
    pass


class TwilioGreenhouseAPIError(ProviderAPIError):
    pass


class SofiGreenhouseAPIError(ProviderAPIError):
    pass


class CloudflareGreenhouseAPIError(ProviderAPIError):
    pass


class AnacondaAPIError(ProviderAPIError):
    pass


class RipplingBoardAPIError(ProviderAPIError):
    pass


class RipplingAPIError(ProviderAPIError):
    pass


class DeloitteAPIError(ProviderAPIError):
    pass


class PhenomPeopleAPIError(ProviderAPIError):
    pass


class PaloAltoNetworksPhenomAPIError(ProviderAPIError):
    pass


class DatabricksAPIError(ProviderAPIError):
    pass


class DatadogAPIError(ProviderAPIError):
    pass


class IBMAPIError(ProviderAPIError):
    pass


class SmartRecruitersAPIError(ProviderAPIError):
    pass


class OracleCloudAPIError(ProviderAPIError):
    pass


class TexasInstrumentsOracleCloudAPIError(ProviderAPIError):
    pass
