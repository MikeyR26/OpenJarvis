"""get_time — returns the current local time for any city or timezone."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

# Map common city/country names to IANA timezone strings
_CITY_MAP: dict[str, str] = {
    "tokyo": "Asia/Tokyo",
    "japan": "Asia/Tokyo",
    "london": "Europe/London",
    "uk": "Europe/London",
    "england": "Europe/London",
    "paris": "Europe/Paris",
    "france": "Europe/Paris",
    "berlin": "Europe/Berlin",
    "germany": "Europe/Berlin",
    "new york": "America/New_York",
    "new york city": "America/New_York",
    "nyc": "America/New_York",
    "eastern": "America/New_York",
    "los angeles": "America/Los_Angeles",
    "la": "America/Los_Angeles",
    "pacific": "America/Los_Angeles",
    "chicago": "America/Chicago",
    "central": "America/Chicago",
    "denver": "America/Denver",
    "mountain": "America/Denver",
    "vancouver": "America/Vancouver",
    "toronto": "America/Toronto",
    "canada eastern": "America/Toronto",
    "sydney": "Australia/Sydney",
    "australia": "Australia/Sydney",
    "melbourne": "Australia/Melbourne",
    "dubai": "Asia/Dubai",
    "uae": "Asia/Dubai",
    "singapore": "Asia/Singapore",
    "hong kong": "Asia/Hong_Kong",
    "beijing": "Asia/Shanghai",
    "shanghai": "Asia/Shanghai",
    "china": "Asia/Shanghai",
    "moscow": "Europe/Moscow",
    "russia": "Europe/Moscow",
    "utc": "UTC",
    "gmt": "UTC",
}


@ToolRegistry.register("get_time")
class GetTimeTool(BaseTool):
    """Returns the accurate current time for any city or timezone."""

    tool_id = "get_time"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="get_time",
            description=(
                "Get the current local time for any city or timezone. "
                "Use this for ANY question about what time it is somewhere. "
                "Always prefer this over web_search for time questions."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name or timezone (e.g. 'Tokyo', 'Vancouver', 'UTC')",
                    }
                },
                "required": ["location"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=0.01,
        )

    def execute(self, **params: Any) -> ToolResult:
        location = params.get("location", "UTC").strip()

        try:
            from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        except ImportError:
            return ToolResult(
                tool_name="get_time",
                content="zoneinfo not available — requires Python 3.9+",
                success=False,
            )

        # Resolve city name → IANA timezone
        tz_key = location.lower()
        iana = _CITY_MAP.get(tz_key)

        # If not in map, try using the string directly as an IANA key
        if not iana:
            iana = location  # e.g. "America/Vancouver" passed directly

        try:
            tz = ZoneInfo(iana)
        except (ZoneInfoNotFoundError, KeyError):
            return ToolResult(
                tool_name="get_time",
                content=f"Unknown timezone: {location}",
                success=False,
            )

        now = datetime.now(tz=tz)
        time_str = now.strftime("%I:%M %p").lstrip("0")  # e.g. "11:24 AM"
        date_str = now.strftime("%A, %B %d")             # e.g. "Friday, May 8"

        return ToolResult(
            tool_name="get_time",
            content=f"{time_str} on {date_str} ({iana})",
            success=True,
        )
