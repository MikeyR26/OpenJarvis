"""calendar_tool — Read and create Google Calendar events."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_log = logging.getLogger("openjarvis.tools.calendar")


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
        _log.info("google_calendar called with params: %s", params)
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
            _log.info("credentials valid=%s expired=%s", creds.valid, creds.expired)
        except RuntimeError as exc:
            _log.error("get_credentials failed: %s", exc)
            return ToolResult(tool_name="google_calendar", content=str(exc), success=False)

        service = build("calendar", "v3", credentials=creds)
        # Show which Google account is connected
        cal_info = service.calendars().get(calendarId="primary").execute()
        account_email = cal_info.get("id", "unknown")
        _log.info("calendar account: %s", account_email)
        action = params.get("action", "list")

        if action == "list":
            days = max(1, int(params.get("days") or 7))
            # Use local time so "today" and "tomorrow" match the user's clock
            local_now = datetime.now().astimezone()
            today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
            time_min = today_start.isoformat()
            # End of the last day (23:59:59) so evening events aren't cut off
            time_max = (today_start + timedelta(days=days, hours=23, minutes=59, seconds=59)).isoformat()

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
                    content=f"Nothing on the calendar for the next {days} days. (Connected account: {account_email})",
                    success=True,
                )

            lines = [f"Connected account: {account_email}"]
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
            try:
                start_dt = datetime.fromisoformat(start_str)
                if start_dt.tzinfo is None:
                    start_dt = start_dt.astimezone()
                if not end_str:
                    end_dt = start_dt + timedelta(hours=1)
                else:
                    end_dt = datetime.fromisoformat(end_str)
                    if end_dt.tzinfo is None:
                        end_dt = end_dt.astimezone()
                # isoformat() includes the UTC offset e.g. 2026-05-19T20:00:00-07:00
                start_str = start_dt.isoformat()
                end_str = end_dt.isoformat()
            except ValueError:
                if not end_str:
                    end_str = start_str

            event_body: dict = {
                "summary": title,
                "start": {"dateTime": start_str},
                "end": {"dateTime": end_str},
            }
            if params.get("description"):
                event_body["description"] = params["description"]

            _log.info("inserting event: %s", event_body)
            try:
                created = (
                    service.events().insert(calendarId="primary", body=event_body).execute()
                )
                _log.info("created event id=%s htmlLink=%s", created.get("id"), created.get("htmlLink"))
            except Exception as exc:
                _log.error("event insert failed: %s", exc)
                return ToolResult(
                    tool_name="google_calendar",
                    content=f"Failed to create event: {exc}",
                    success=False,
                )

            start_display = created["start"].get("dateTime", created["start"].get("date"))
            organizer = created.get("organizer", {}).get("email", "unknown")
            link = created.get("htmlLink", "")
            _log.info("event created successfully: %s on %s for %s", title, start_display, organizer)
            return ToolResult(
                tool_name="google_calendar",
                content=f"Done. '{created.get('summary')}' added for {start_display}. Account: {organizer}. Link: {link}",
                success=True,
            )

        return ToolResult(
            tool_name="google_calendar", content=f"Unknown action: {action}", success=False
        )
