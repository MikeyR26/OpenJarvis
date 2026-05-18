"""navigate_to — navigate the Jarvis UI to a specific page."""

from __future__ import annotations

import json
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_ROUTES = {
    "mission-control": "/mission-control",
    "mission control": "/mission-control",
    "home": "/",
    "jarvis": "/",
    "settings": "/settings",
    "chat": "/chat",
    "dashboard": "/dashboard",
    "logs": "/logs",
    "agents": "/agents",
}


@ToolRegistry.register("navigate_to")
class NavigateToTool(BaseTool):
    """Navigate the Jarvis UI to a different page."""

    tool_id = "navigate_to"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="navigate_to",
            description=(
                "Navigate the Jarvis interface to a different page. "
                "Use when the user says 'take me to mission control', 'open settings', "
                "'go to dashboard', 'show mission control', etc."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "destination": {
                        "type": "string",
                        "enum": list(_ROUTES.keys()),
                        "description": "The page to navigate to",
                    },
                },
                "required": ["destination"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=0.01,
        )

    def execute(self, **params: Any) -> ToolResult:
        dest = (params.get("destination") or "").strip().lower()
        path = _ROUTES.get(dest)
        if not path:
            return ToolResult(
                tool_name="navigate_to",
                content=json.dumps({"error": f"Unknown destination: {dest}"}),
                success=False,
            )
        label = dest.replace("-", " ").upper()
        return ToolResult(
            tool_name="navigate_to",
            content=json.dumps({"path": path, "label": label}),
            success=True,
        )
