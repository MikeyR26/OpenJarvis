"""Shared Google OAuth2 token manager for Calendar and Gmail tools."""

from __future__ import annotations

from pathlib import Path

_CREDS_FILE = Path.home() / ".openjarvis" / "google_credentials.json"
_TOKEN_FILE = Path.home() / ".openjarvis" / "google_token.json"
_STATE_FILE = Path.home() / ".openjarvis" / ".google_oauth_state"

SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
]

_REDIRECT_URI = "http://localhost:8000/api/google/callback"


def get_credentials():
    """Return valid google.oauth2.credentials.Credentials or raise RuntimeError."""
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    if not _CREDS_FILE.exists():
        raise RuntimeError(
            "Google credentials not configured. Download credentials.json from "
            "Google Cloud Console (OAuth 2.0 Desktop app) and save it as "
            "~/.openjarvis/google_credentials.json"
        )

    creds = None
    if _TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(_TOKEN_FILE), SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        _save_token(creds)
        return creds

    raise RuntimeError(
        "Google account not connected. Say 'connect my Google account' and "
        "follow the link, or visit Settings to authorise."
    )


def _save_token(creds) -> None:
    _TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    _TOKEN_FILE.write_text(creds.to_json(), encoding="utf-8")


def get_auth_url(redirect_uri: str = _REDIRECT_URI) -> tuple[str, str]:
    """Return (authorization_url, state) to begin the OAuth flow."""
    from google_auth_oauthlib.flow import Flow

    flow = Flow.from_client_secrets_file(
        str(_CREDS_FILE),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
    )
    url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    _STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    _STATE_FILE.write_text(state, encoding="utf-8")
    return url, state


def exchange_code(code: str, state: str, redirect_uri: str = _REDIRECT_URI) -> None:
    """Exchange authorization code for a token and persist it."""
    from google_auth_oauthlib.flow import Flow

    expected = _STATE_FILE.read_text(encoding="utf-8").strip() if _STATE_FILE.exists() else ""
    if expected and state != expected:
        raise ValueError("OAuth state mismatch — possible CSRF attempt")

    flow = Flow.from_client_secrets_file(
        str(_CREDS_FILE),
        scopes=SCOPES,
        redirect_uri=redirect_uri,
        state=state,
    )
    flow.fetch_token(code=code)
    _save_token(flow.credentials)
    if _STATE_FILE.exists():
        _STATE_FILE.unlink()


def is_connected() -> bool:
    """Return True if a valid (or refreshable) Google token exists."""
    if not _TOKEN_FILE.exists():
        return False
    try:
        get_credentials()
        return True
    except Exception:
        return False
