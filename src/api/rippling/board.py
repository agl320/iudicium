class RipplingBoardClient:
    def __init__(
        self,
        api_url: str,
        *,
        headers: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
        timeout_s: float = 30.0,
        error_cls: type[RuntimeError] = RuntimeError
    ) -> None:
        self.api_url = api_url
        self.headers = dict(headers or {})
        self.payload = dict(payload or {})
        self.timeout_s = timeout_s
        self.error_cls = error_cls

    def search_raw():
        pass
