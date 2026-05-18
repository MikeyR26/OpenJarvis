"""music_control — Spotify / Windows media-key control via Windows API."""

from __future__ import annotations

import subprocess
import sys
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

# Windows Virtual Key codes for media keys
_VK_CODES = {
    "play_pause":  0xB3,  # VK_MEDIA_PLAY_PAUSE
    "next_track":  0xB0,  # VK_MEDIA_NEXT_TRACK
    "prev_track":  0xB1,  # VK_MEDIA_PREV_TRACK
    "volume_up":   0xAF,  # VK_VOLUME_UP
    "volume_down": 0xAE,  # VK_VOLUME_DOWN
    "mute":        0xAD,  # VK_VOLUME_MUTE
}

_MESSAGES = {
    "play_pause":  "Toggled playback, sir.",
    "next_track":  "Skipping to the next track.",
    "prev_track":  "Going back a track.",
    "volume_up":   "Volume up.",
    "volume_down": "Volume down.",
    "mute":        "Mute toggled.",
    "open_spotify": "Opening Spotify.",
}


# WM_APPCOMMAND codes — Spotify listens to these via the shell broadcast
_WM_APPCOMMAND = 0x0319
_APPCOMMAND_FOR_VK = {
    0xB3: 14,   # VK_MEDIA_PLAY_PAUSE  → APPCOMMAND_MEDIA_PLAY_PAUSE
    0xB0: 11,   # VK_MEDIA_NEXT_TRACK  → APPCOMMAND_MEDIA_NEXTTRACK
    0xB1: 12,   # VK_MEDIA_PREV_TRACK  → APPCOMMAND_MEDIA_PREVIOUSTRACK
    0xAF: 10,   # VK_VOLUME_UP         → APPCOMMAND_VOLUME_UP
    0xAE:  9,   # VK_VOLUME_DOWN       → APPCOMMAND_VOLUME_DOWN
    0xAD:  8,   # VK_VOLUME_MUTE       → APPCOMMAND_VOLUME_MUTE
}


def _send_media_key(vk: int) -> None:
    """Send a media key via both SendInput and WM_APPCOMMAND for max compatibility.

    SendInput covers legacy media players; WM_APPCOMMAND to the shell window
    is what modern Spotify/browsers actually respond to for next/prev track.
    """
    import ctypes
    from ctypes import wintypes

    # ── Method 1: SendInput with KEYEVENTF_EXTENDEDKEY ──────────────────────
    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk",         wintypes.WORD),
            ("wScan",       wintypes.WORD),
            ("dwFlags",     wintypes.DWORD),
            ("time",        wintypes.DWORD),
            ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
        ]

    class _INPUT_UNION(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT)]

    class INPUT(ctypes.Structure):
        _anonymous_ = ("_u",)
        _fields_ = [("type", wintypes.DWORD), ("_u", _INPUT_UNION)]

    KEYEVENTF_EXTENDEDKEY = 0x0001
    KEYEVENTF_KEYUP       = 0x0002

    inputs = (INPUT * 2)()
    inputs[0].type = inputs[1].type = 1  # INPUT_KEYBOARD
    inputs[0].ki.wVk = inputs[1].ki.wVk = vk
    inputs[0].ki.dwFlags = KEYEVENTF_EXTENDEDKEY
    inputs[1].ki.dwFlags = KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP
    ctypes.windll.user32.SendInput(2, inputs, ctypes.sizeof(INPUT))

    # ── Method 2: WM_APPCOMMAND to the shell window ─────────────────────────
    # Spotify and most modern players register for this broadcast, which is
    # why it reliably controls next/prev even when Spotify is not focused.
    app_cmd = _APPCOMMAND_FOR_VK.get(vk)
    if app_cmd is not None:
        hwnd = ctypes.windll.user32.GetShellWindow()
        ctypes.windll.user32.SendMessageW(hwnd, _WM_APPCOMMAND, hwnd, app_cmd << 16)


@ToolRegistry.register("music_control")
class MusicControlTool(BaseTool):
    """Control music playback via Windows media keys."""

    tool_id = "music_control"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="music_control",
            description=(
                "Control music playback on Windows: play/pause, skip tracks, "
                "adjust volume, or open Spotify. Works with Spotify, YouTube Music, "
                "and any other media player that responds to media keys."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": list(_VK_CODES.keys()) + ["open_spotify"],
                        "description": (
                            "play_pause: toggle play/pause. "
                            "next_track/prev_track: skip tracks. "
                            "volume_up/volume_down/mute: adjust volume. "
                            "open_spotify: launch Spotify."
                        ),
                    },
                },
                "required": ["action"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=0.1,
        )

    def execute(self, **params: Any) -> ToolResult:
        action = (params.get("action") or "").strip()
        all_actions = list(_VK_CODES.keys()) + ["open_spotify"]

        if action not in all_actions:
            return ToolResult(
                tool_name="music_control",
                content=f"Unknown action '{action}'. Choose from: {', '.join(all_actions)}",
                success=False,
            )

        try:
            if action == "open_spotify":
                subprocess.Popen(
                    ["powershell", "-NonInteractive", "-Command", "Start-Process 'spotify:'"],
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
                )
            else:
                _send_media_key(_VK_CODES[action])

            return ToolResult(
                tool_name="music_control",
                content=_MESSAGES[action],
                success=True,
            )
        except Exception as exc:
            return ToolResult(
                tool_name="music_control",
                content=f"Music control failed: {exc}",
                success=False,
            )
