"""calendar_tool — Read, create, update and delete Google Calendar events."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_log = logging.getLogger("openjarvis.tools.calendar")


@ToolRegistry.register("google_calendar")
class GoogleCalendarTool(BaseTool):
    """Read, create, update and delete Google Calendar events."""

    tool_id = "google_calendar"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="google_calendar",
            description=(
                "Manage Google Calendar events: list, create, update, or delete. "
                "Use action='list' to see upcoming events (returns event IDs). "
                "Use action='create' to add a new event. "
                "Use action='update' to change an existing event (requires event_id from list). "
                "Use action='delete' to remove an event (requires event_id from list). "
                "To update or delete: first call list to get the event_id, then call update/delete."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["list", "create", "update", "delete"],
                        "description": "list: show events. create: add event. update: change event. delete: remove event.",
                    },
                    "days": {
                        "type": "integer",
                        "description": "For list: number of days ahead to look (default 7).",
                    },
                    "event_id": {
                        "type": "string",
                        "description": "For update/delete: event ID from a previous list call.",
                    },
                    "title": {
                        "type": "string",
                        "description": "For create/update: event title/summary.",
                    },
                    "start": {
                        "type": "string",
                        "description": "For create/update: start time in ISO 8601 (e.g. 2026-06-11T14:00:00).",
                    },
                    "end": {
                        "type": "string",
                        "description": "For create/update: end time in ISO 8601. Defaults to 1 hour after start.",
                    },
                    "description": {
                        "type": "string",
                        "description": "For create/update: optional event description/notes.",
                    },
                },
                "required": ["action"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=1.5,
        )

    def _build_service(self):
        from googleapiclient.discovery import build
        from openjarvis.tools.google_oauth import get_credentials
        creds = get_credentials()
        _log.info("credentials valid=%s expired=%s", creds.valid, creds.expired)
        return build("calendar", "v3", credentials=creds), creds

    def _parse_dt(self, dt_str: str) -> str:
        """Parse ISO datetime string, attach local tz if naive, return isoformat."""
        dt = datetime.fromisoformat(dt_str)
        if dt.tzinfo is None:
            dt = dt.astimezone()
        return dt.isoformat()

    def execute(self, **params: Any) -> ToolResult:
        _log.info("google_calendar called with params: %s", params)
        try:
            service, _ = self._build_service()
        except ImportError:
            return ToolResult(
                tool_name="google_calendar",
                content="Google libraries not installed. Run: pip install google-api-python-client google-auth-oauthlib",
                success=False,
            )
        except RuntimeError as exc:
            _log.error("get_credentials failed: %s", exc)
            return ToolResult(tool_name="google_calendar", content=str(exc), success=False)

        cal_info = service.calendars().get(calendarId="primary").execute()
        account_email = cal_info.get("id", "unknown")
        _log.info("calendar account: %s", account_email)
        action = params.get("action", "list")

        # ── LIST ────────────────────────────────────────────────────────────
        if action == "list":
            days = max(1, int(params.get("days") or 7))
            local_now = datetime.now().astimezone()
            today_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
            time_min = today_start.isoformat()
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
                return ToolResult(tool_name="google_calendar", content=f"Calendar error: {exc}", success=False)

            items = result.get("items", [])
            if not items:
                return ToolResult(
                    tool_name="google_calendar",
                    content=f"Nothing on the calendar for the next {days} days. (Account: {account_email})",
                    success=True,
                )

            lines = [f"Account: {account_email}"]
            for ev in items:
                start = ev["start"].get("dateTime", ev["start"].get("date", ""))
                lines.append(f"- [{ev['id']}] {start}: {ev.get('summary', 'Untitled')}")
            return ToolResult(tool_name="google_calendar", content="\n".join(lines), success=True)

        # ── CREATE ───────────────────────────────────────────────────────────
        elif action == "create":
            title = (params.get("title") or "").strip()
            start_str = (params.get("start") or "").strip()
            if not title or not start_str:
                return ToolResult(
                    tool_name="google_calendar",
                    content="title and start are required to create an event.",
                    success=False,
                )

            try:
                start_str = self._parse_dt(start_str)
                end_str = params.get("end", "")
                if end_str:
                    end_str = self._parse_dt(end_str)
                else:
                    end_str = (datetime.fromisoformat(start_str) + timedelta(hours=1)).isoformat()
            except ValueError:
                end_str = end_str or start_str

            event_body: dict = {
                "summary": title,
                "start": {"dateTime": start_str},
                "end": {"dateTime": end_str},
            }
            if params.get("description"):
                event_body["description"] = params["description"]

            _log.info("inserting event: %s", event_body)
            try:
                created = service.events().insert(calendarId="primary", body=event_body).execute()
                _log.info("created event id=%s htmlLink=%s", created.get("id"), created.get("htmlLink"))
            except Exception as exc:
                _log.error("event insert failed: %s", exc)
                return ToolResult(tool_name="google_calendar", content=f"Failed to create event: {exc}", success=False)

            start_display = created["start"].get("dateTime", created["start"].get("date"))
            return ToolResult(
                tool_name="google_calendar",
                content=f"Done. '{created.get('summary')}' added for {start_display}. ID: {created.get('id')}",
                success=True,
            )

        # ── UPDATE ───────────────────────────────────────────────────────────
        elif action == "update":
            event_id = (params.get("event_id") or "").strip()
            if not event_id:
                return ToolResult(
                    tool_name="google_calendar",
                    content="event_id is required. Call list first to get the event ID.",
                    success=False,
                )

            try:
                existing = service.events().get(calendarId="primary", eventId=event_id).execute()
            except Exception as exc:
                return ToolResult(tool_name="google_calendar", content=f"Event not found: {exc}", success=False)

            if params.get("title"):
                existing["summary"] = params["title"]
            if params.get("description") is not None:
                existing["description"] = params["description"]
            if params.get("start"):
                try:
                    start_str = self._parse_dt(params["start"])
                    existing["start"] = {"dateTime": start_str}
                    end_str = params.get("end", "")
                    if end_str:
                        end_str = self._parse_dt(end_str)
                    else:
                        end_str = (datetime.fromisoformat(start_str) + timedelta(hours=1)).isoformat()
                    existing["end"] = {"dateTime": end_str}
                except ValueError as exc:
                    return ToolResult(tool_name="google_calendar", content=f"Invalid date: {exc}", success=False)

            _log.info("updating event %s: %s", event_id, existing.get("summary"))
            try:
                updated = service.events().update(calendarId="primary", eventId=event_id, body=existing).execute()
            except Exception as exc:
                return ToolResult(tool_name="google_calendar", content=f"Failed to update event: {exc}", success=False)

            start_display = updated["start"].get("dateTime", updated["start"].get("date"))
            return ToolResult(
                tool_name="google_calendar",
                content=f"Updated. '{updated.get('summary')}' now at {start_display}.",
                success=True,
            )

        # ── DELETE ───────────────────────────────────────────────────────────
        elif action == "delete":
            event_id = (params.get("event_id") or "").strip()
            if not event_id:
                return ToolResult(
                    tool_name="google_calendar",
                    content="event_id is required. Call list first to get the event ID.",
                    success=False,
                )

            try:
                existing = service.events().get(calendarId="primary", eventId=event_id).execute()
                title = existing.get("summary", "Untitled")
                service.events().delete(calendarId="primary", eventId=event_id).execute()
                _log.info("deleted event %s: %s", event_id, title)
            except Exception as exc:
                return ToolResult(tool_name="google_calendar", content=f"Failed to delete event: {exc}", success=False)

            return ToolResult(
                tool_name="google_calendar",
                content=f"Deleted '{title}'.",
                success=True,
            )

        return ToolResult(tool_name="google_calendar", content=f"Unknown action: {action}", success=False)
