"""show_map — geocodes a location and signals the frontend to open an interactive map."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("show_map")
class ShowMapTool(BaseTool):
    """Geocodes a place name and returns map coordinates for the frontend to display."""

    tool_id = "show_map"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="show_map",
            description=(
                "Display an interactive map of any location. "
                "Use whenever the user asks to see, show, open, or pull up a map of any place."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The place to show (e.g. 'London', 'Tokyo', 'Eiffel Tower')",
                    }
                },
                "required": ["location"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=0.5,
        )

    def execute(self, **params: Any) -> ToolResult:
        location = params.get("location", "").strip()
        if not location:
            return ToolResult(tool_name="show_map", content="No location provided.", success=False)

        query = urllib.parse.urlencode({"q": location, "format": "json", "limit": 1})
        url = f"https://nominatim.openstreetmap.org/search?{query}"
        req = urllib.request.Request(url, headers={"User-Agent": "OpenJarvis/1.0 jarvis@local"})

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                results = json.loads(resp.read().decode())
        except Exception as exc:
            return ToolResult(tool_name="show_map", content=f"Geocoding failed: {exc}", success=False)

        if not results:
            return ToolResult(tool_name="show_map", content=f"Location not found: {location}", success=False)

        r = results[0]
        display = r.get("display_name", location).split(",")[0].strip()

        payload = {
            "location": display,
            "lat": float(r["lat"]),
            "lng": float(r["lon"]),
            "zoom": 11,
        }
        return ToolResult(tool_name="show_map", content=json.dumps(payload), success=True)
