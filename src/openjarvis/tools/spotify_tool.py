"""spotify_tool — Search Spotify catalog and play tracks by name."""

from __future__ import annotations

import base64
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

try:
    import httpx as _httpx
except ImportError:
    _httpx = None  # type: ignore

_token_cache: dict = {}


def _credentials() -> tuple[str, str]:
    try:
        import tomllib
    except ImportError:
        try:
            import tomli as tomllib  # type: ignore
        except ImportError:
            return "", ""
    f = Path.home() / ".openjarvis" / "credentials.toml"
    if not f.exists():
        return "", ""
    d = tomllib.loads(f.read_text(encoding="utf-8"))
    sp = d.get("spotify", {})
    return sp.get("client_id", ""), sp.get("client_secret", "")


def _token(client_id: str, client_secret: str) -> str:
    now = time.time()
    if _token_cache.get("t") and _token_cache.get("exp", 0) > now + 60:
        return _token_cache["t"]
    enc = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    with _httpx.Client(timeout=10) as c:
        r = c.post(
            "https://accounts.spotify.com/api/token",
            headers={"Authorization": f"Basic {enc}"},
            data={"grant_type": "client_credentials"},
        )
        r.raise_for_status()
        d = r.json()
    _token_cache["t"] = d["access_token"]
    _token_cache["exp"] = now + d["expires_in"]
    return _token_cache["t"]


def _search(query: str, client_id: str, client_secret: str) -> dict | None:
    tok = _token(client_id, client_secret)
    with _httpx.Client(timeout=10) as c:
        r = c.get(
            "https://api.spotify.com/v1/search",
            headers={"Authorization": f"Bearer {tok}"},
            params={"q": query, "type": "track", "limit": 1},
        )
        r.raise_for_status()
        items = r.json().get("tracks", {}).get("items", [])
    if not items:
        return None
    t = items[0]
    return {
        "name": t["name"],
        "artist": t["artists"][0]["name"],
        "uri": t["uri"],
    }


def _play_uri(uri: str) -> None:
    """Open the track in the Spotify desktop app, then send play media key."""
    import ctypes
    from ctypes import wintypes

    subprocess.Popen(
        ["powershell", "-NonInteractive", "-Command", f"Start-Process '{uri}'"],
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    time.sleep(1.5)

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
            ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
            ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
        ]

    class _U(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT)]

    class INPUT(ctypes.Structure):
        _anonymous_ = ("_u",)
        _fields_ = [("type", wintypes.DWORD), ("_u", _U)]

    inputs = (INPUT * 2)()
    inputs[0].type = inputs[1].type = 1
    inputs[0].ki.wVk = inputs[1].ki.wVk = 0xB3  # VK_MEDIA_PLAY_PAUSE
    inputs[0].ki.dwFlags = 0x0001               # KEYEVENTF_EXTENDEDKEY
    inputs[1].ki.dwFlags = 0x0001 | 0x0002      # KEYEVENTF_EXTENDEDKEY | KEYUP
    ctypes.windll.user32.SendInput(2, inputs, ctypes.sizeof(INPUT))
    hwnd = ctypes.windll.user32.GetShellWindow()
    ctypes.windll.user32.SendMessageW(hwnd, 0x0319, hwnd, 14 << 16)


@ToolRegistry.register("spotify")
class SpotifyTool(BaseTool):
    """Search Spotify and play a specific track by name."""

    tool_id = "spotify"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="spotify",
            description=(
                "Search Spotify and play a specific song, artist, or album by name. "
                "Use this when the user names something specific to play. "
                "Examples: play Thunderstruck by AC/DC, play Dark Side of the Moon, play Taylor Swift."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Song, artist, or album name to search and play.",
                    }
                },
                "required": ["query"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=2.0,
        )

    def execute(self, **params: Any) -> ToolResult:
        query = (params.get("query") or "").strip()
        if not query:
            return ToolResult(tool_name="spotify", content="No query.", success=False)

        client_id, client_secret = _credentials()
        if not client_id:
            return ToolResult(
                tool_name="spotify",
                content="Spotify not configured. Add [spotify] client_id and client_secret to ~/.openjarvis/credentials.toml.",
                success=False,
            )
        if _httpx is None:
            return ToolResult(tool_name="spotify", content="httpx not installed.", success=False)

        try:
            track = _search(query, client_id, client_secret)
            if not track:
                return ToolResult(tool_name="spotify", content=f'Nothing found for "{query}".', success=False)
            _play_uri(track["uri"])
            return ToolResult(
                tool_name="spotify",
                content=f'Playing {track["name"]} by {track["artist"]}, sir.',
                success=True,
            )
        except Exception as exc:
            return ToolResult(tool_name="spotify", content=f"Spotify error: {exc}", success=False)
