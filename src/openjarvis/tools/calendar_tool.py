"""calendar_tool — Read and create Google Calendar events."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("google_calendar")
class GoogleCalendarTool(BaseTool):
    """Read upcoming events and create new events in Google Calendar."""

    tool_id = "google_calendar"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="google_calendar",
            description=(
                "Read upcoming Google Calendar events or create a new event. "
                "Use action='list' to see upcoming events. "
                "Use action='create' to add a new calendar event. "
                "Examples: 'What's on my calendar today?', 'Add a dentist appointment Friday at 2pm'."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["list", "create"],
                        "description": "list: show upcoming events. create: add a new event.",
                    },
                    "days": {
                        "type": "integer",
                        "description": "For list: number of days ahead to look (default 7).",
                    },
                    "title": {
                        "type": "string",
                        "description": "For create: event title/summary.",
                    },
                    "start": {
                        "type": "string",
                        "description": "For create: start time in ISO 8601 (e.g. 2026-05-10T14:00:00).",
                    },
                    "end": {
                        "type": "string",
                        "description": "For create: end time in ISO 8601. Defaults to 1 hour after start.",
                    },
                    "description": {
                        "type": "string",
                        "description": "For create: optional event description/notes.",
                    },
                },
                "required": ["action"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=1.5,
        )

    def execute(self, **params: Any) -> ToolResult:
        try:
            from googleapiclient.discovery import build

            from openjarvis.tools.google_oauth import get_credentials
        except ImportError:
            return ToolResult(
                tool_name="google_calendar",
                content=(
                    "Google libraries not installed. "
                    "Run: pip install google-api-python-client google-auth-oauthlib"
                ),
                success=False,
            )

        try:
            creds = get_credentials()
        except RuntimeError as exc:
            return ToolResult(tool_name="google_calendar", content=str(exc), success=False)

        service = build("calendar", "v3", credentials=creds)
        action = params.get("action", "list")

        if action == "list":
            days = int(params.get("days") or 7)
            now = datetime.now(timezone.utc)
            time_min = now.isoformat()
            time_max = (now + timedelta(days=days)).isoformat()

            try:
                result = (
                    service.events()
                    .list(
                        calendarId="primary",
                        timeMin=time_min,
                        timeMax=time_max,
                        maxResults=20,
                        singleEvents=True,
                        orderBy="startTime",
                    )
                    .execute()
                )
            except Exception as exc:
                return ToolResult(
                    tool_name="google_calendar", content=f"Calendar error: {exc}", success=False
                )

            items = result.get("items", [])
            if not items:
                return ToolResult(
                    tool_name="google_calendar",
                    content=f"Nothing on the calendar for the next {days} days.",
                    success=True,
                )

            lines = []
            for ev in items:
                start = ev["start"].get("dateTime", ev["start"].get("date", ""))
                lines.append(f"- {start}: {ev.get('summary', 'Untitled')}")
            return ToolResult(tool_name="google_calendar", content="\n".join(lines), success=True)

        elif action == "create":
            title = (params.get("title") or "").strip()
            start_str = (params.get("start") or "").strip()
            if not title or not start_str:
                return ToolResult(
                    tool_name="google_calendar",
                    content="title and start are required to create an event.",
                    success=False,
                )

            end_str = (params.get("end") or "").strip()
            if not end_str:
                try:
                    start_dt = datetime.fromisoformat(start_str)
                    end_str = (start_dt + timedelta(hours=1)).isoformat()
                except ValueError:
                    end_str = start_str

            event_body: dict = {
                "summary": title,
                "start": {"dateTime": start_str},
                "end": {"dateTime": end_str},
            }
            if params.get("description"):
                event_body["description"] = params["description"]

            try:
                created = (
                    service.events().insert(calendarId="primary", body=event_body).execute()
                )
            except Exception as exc:
                return ToolResult(
                    tool_name="google_calendar",
                    content=f"Failed to create event: {exc}",
                    success=False,
                )

            start_display = created["start"].get("dateTime", created["start"].get("date"))
            return ToolResult(
                tool_name="google_calendar",
                content=f"Done. '{created.get('summary')}' added to your calendar for {start_display}.",
                success=True,
            )

        return ToolResult(
            tool_name="google_calendar", content=f"Unknown action: {action}", success=False
        )
