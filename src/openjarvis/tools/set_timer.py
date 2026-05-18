"""set_timer — trigger a countdown timer on the Jarvis frontend."""

from __future__ import annotations

import json
import re
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


def _parse_duration(duration: str) -> int:
    """Parse a human-readable duration string to total seconds."""
    s = duration.lower().strip()
    total = 0
    for pattern, multiplier in [
        (r"(\d+)\s*h(?:our|r)?s?", 3600),
        (r"(\d+)\s*m(?:in(?:ute)?s?)?", 60),
        (r"(\d+)\s*s(?:ec(?:ond)?s?)?", 1),
    ]:
        for m in re.finditer(pattern, s):
            total += int(m.group(1)) * multiplier
    if total == 0:
        try:
            total = int(s) * 60
        except ValueError:
            pass
    return total


@ToolRegistry.register("set_timer")
class SetTimerTool(BaseTool):
    """Set a countdown timer that appears on the Jarvis interface."""

    tool_id = "set_timer"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="set_timer",
            description=(
                "Set a countdown timer. The timer will appear on the Jarvis interface "
                "and sound an alarm when the countdown reaches zero. "
                "Use for requests like 'set a timer for 20 minutes' or 'remind me in 1 hour'."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "duration": {
                        "type": "string",
                        "description": "Duration string e.g. '20 minutes', '1 hour 30 minutes', '90 seconds'",
                    },
                    "label": {
                        "type": "string",
                        "description": "Optional label shown on the timer, e.g. 'Pasta', 'Workout'",
                    },
                },
                "required": ["duration"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=0.01,
        )

    def execute(self, **params: Any) -> ToolResult:
        duration_str = (params.get("duration") or "5 minutes").strip()
        label = (params.get("label") or "Timer").strip()

        seconds = _parse_duration(duration_str)
        if seconds <= 0:
            return ToolResult(
                tool_name="set_timer",
                content=json.dumps({"error": f"Could not parse duration: {duration_str}"}),
                success=False,
            )

        mins, secs = divmod(seconds, 60)
        hours, mins = divmod(mins, 60)
        if hours:
            readable = f"{hours}h {mins}m" if mins else f"{hours}h"
        elif mins and secs:
            readable = f"{mins}m {secs}s"
        elif mins:
            readable = f"{mins} minute{'s' if mins != 1 else ''}"
        else:
            readable = f"{secs} second{'s' if secs != 1 else ''}"

        return ToolResult(
            tool_name="set_timer",
            content=json.dumps({"seconds": seconds, "label": label, "readable": readable}),
            success=True,
        )
