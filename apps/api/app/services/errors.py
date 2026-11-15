class DomainError(Exception):
    """Business-rule violation; mapped to an HTTP status in app.main."""

    status_code = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFound(DomainError):
    status_code = 404


class Conflict(DomainError):
    status_code = 409


class Gone(DomainError):
    status_code = 410
