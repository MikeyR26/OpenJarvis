"""google_connect — initiate or check Google OAuth connection."""

from __future__ import annotations

from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("google_connect")
class GoogleConnectTool(BaseTool):
    """Initiate or check status of Google account connection (Calendar + Gmail)."""

    tool_id = "google_connect"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="google_connect",
            description=(
                "Connect or check the status of the user's Google account. "
                "Use action='connect' when the user says 'connect my Google account' or when Calendar/Gmail fails with not connected. "
                "Use action='status' to check if already connected."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["connect", "status"],
                        "description": "'connect' to get the auth URL, 'status' to check connection.",
                    }
                },
                "required": ["action"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=0.5,
        )

    def execute(self, **params: Any) -> ToolResult:
        from openjarvis.tools.google_oauth import get_auth_url, is_connected

        action = params.get("action", "status")

        if action == "status":
            connected = is_connected()
            msg = "Google account is connected." if connected else "Google account is not connected."
            return ToolResult(tool_name="google_connect", content=msg, success=True)

        if action == "connect":
            if is_connected():
                return ToolResult(
                    tool_name="google_connect",
                    content="Google account is already connected.",
                    success=True,
                )
            try:
                import subprocess, sys
                url, _ = get_auth_url()
                if sys.platform == "win32":
                    subprocess.Popen(
                        ["powershell", "-NonInteractive", "-Command", f"Start-Process '{url}'"],
                        creationflags=subprocess.CREATE_NO_WINDOW,
                    )
                else:
                    subprocess.Popen(["xdg-open", url])
                return ToolResult(
                    tool_name="google_connect",
                    content="Authorization page opened in your browser, sir. Sign in and approve access — I'll be connected automatically.",
                    success=True,
                )
            except Exception as exc:
                return ToolResult(
                    tool_name="google_connect",
                    content=f"Failed to open auth page: {exc}",
                    success=False,
                )

        return ToolResult(
            tool_name="google_connect",
            content=f"Unknown action '{action}'.",
            success=False,
        )
