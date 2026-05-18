"""schedule_reminder — schedule proactive alerts for a future time."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_REMINDERS_FILE = Path.home() / ".openjarvis" / "reminders.json"


def _load() -> list[dict]:
    try:
        if _REMINDERS_FILE.exists():
            return json.loads(_REMINDERS_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []


def _save(reminders: list[dict]) -> None:
    _REMINDERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _REMINDERS_FILE.write_text(json.dumps(reminders, indent=2), encoding="utf-8")


def pop_due_reminders() -> list[dict]:
    """Return and remove all reminders due now or in the past."""
    reminders = _load()
    now = datetime.now(timezone.utc).isoformat()
    due = [r for r in reminders if r.get("due_at", "9999") <= now]
    remaining = [r for r in reminders if r.get("due_at", "9999") > now]
    if due:
        _save(remaining)
    return due


@ToolRegistry.register("schedule_reminder")
class ScheduleReminderTool(BaseTool):
    """Schedule a future reminder that Jarvis will proactively deliver."""

    tool_id = "schedule_reminder"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="schedule_reminder",
            description=(
                "Schedule a future reminder. Jarvis will proactively alert you when the time arrives. "
                "Use for 'remind me at 3pm', 'morning briefing at 8am', 'remind me in 2 hours to call Bob'."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "What to remind the user about",
                    },
                    "due_at": {
                        "type": "string",
                        "description": (
                            "ISO 8601 UTC datetime when to fire the reminder, "
                            "e.g. '2026-05-08T08:00:00Z'. "
                            "Use get_time first to determine the correct UTC offset."
                        ),
                    },
                    "label": {
                        "type": "string",
                        "description": "Short label, e.g. 'Morning Briefing'",
                    },
                },
                "required": ["message", "due_at"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=0.01,
        )

    def execute(self, **params: Any) -> ToolResult:
        message = (params.get("message") or "").strip()
        due_at = (params.get("due_at") or "").strip()
        label = (params.get("label") or "Reminder").strip()

        if not message:
            return ToolResult(
                tool_name="schedule_reminder", content="No message provided.", success=False
            )
        if not due_at:
            return ToolResult(
                tool_name="schedule_reminder", content="No due_at datetime provided.", success=False
            )

        try:
            dt = datetime.fromisoformat(due_at.replace("Z", "+00:00"))
        except ValueError:
            return ToolResult(
                tool_name="schedule_reminder",
                content=f"Invalid datetime '{due_at}'. Use ISO 8601 format, e.g. 2026-05-08T08:00:00Z.",
                success=False,
            )

        reminders = _load()
        entry = {
            "id": f"rem_{int(datetime.now().timestamp())}",
            "message": message,
            "label": label,
            "due_at": dt.astimezone(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        reminders.append(entry)
        _save(reminders)

        try:
            dt_str = dt.strftime("%I:%M %p on %A, %B %d")
        except Exception:
            dt_str = due_at

        return ToolResult(
            tool_name="schedule_reminder",
            content=f"Reminder set: '{label}' at {dt_str}. I'll alert you then, sir.",
            success=True,
        )
