"""gmail_tool — Read Gmail inbox and create drafts (no sending)."""

from __future__ import annotations

import base64
import email.message
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("gmail")
class GmailTool(BaseTool):
    """Read Gmail messages and create drafts. Cannot send emails."""

    tool_id = "gmail"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="gmail",
            description=(
                "Read Gmail inbox messages or create an email draft (cannot send). "
                "Use action='list' to see recent emails. "
                "Use action='read' with message_id to read the full email. "
                "Use action='draft' to compose a draft the user can review and send themselves."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["list", "read", "draft"],
                        "description": "list: recent inbox. read: full email body. draft: create a draft.",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "For list: number of emails to return (default 10).",
                    },
                    "query": {
                        "type": "string",
                        "description": "For list: Gmail search query (e.g. 'is:unread', 'from:boss@company.com').",
                    },
                    "message_id": {
                        "type": "string",
                        "description": "For read: Gmail message ID to retrieve.",
                    },
                    "to": {
                        "type": "string",
                        "description": "For draft: recipient email address.",
                    },
                    "subject": {
                        "type": "string",
                        "description": "For draft: email subject line.",
                    },
                    "body": {
                        "type": "string",
                        "description": "For draft: email body text.",
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
                tool_name="gmail",
                content=(
                    "Google libraries not installed. "
                    "Run: pip install google-api-python-client google-auth-oauthlib"
                ),
                success=False,
            )

        try:
            creds = get_credentials()
        except RuntimeError as exc:
            return ToolResult(tool_name="gmail", content=str(exc), success=False)

        service = build("gmail", "v1", credentials=creds)
        action = params.get("action", "list")

        if action == "list":
            max_results = int(params.get("max_results") or 10)
            query = params.get("query") or "in:inbox"
            try:
                result = (
                    service.users()
                    .messages()
                    .list(userId="me", q=query, maxResults=max_results)
                    .execute()
                )
            except Exception as exc:
                return ToolResult(tool_name="gmail", content=f"Gmail error: {exc}", success=False)

            messages = result.get("messages", [])
            if not messages:
                return ToolResult(tool_name="gmail", content="No messages found.", success=True)

            lines = []
            for msg in messages:
                try:
                    m = (
                        service.users()
                        .messages()
                        .get(
                            userId="me",
                            id=msg["id"],
                            format="metadata",
                            metadataHeaders=["Subject", "From", "Date"],
                        )
                        .execute()
                    )
                    hdrs = {
                        h["name"]: h["value"]
                        for h in m.get("payload", {}).get("headers", [])
                    }
                    lines.append(
                        f"[{msg['id']}] {hdrs.get('Date', '')} | "
                        f"From: {hdrs.get('From', '?')} | {hdrs.get('Subject', 'No subject')}"
                    )
                except Exception:
                    lines.append(f"[{msg['id']}] (could not fetch details)")

            return ToolResult(tool_name="gmail", content="\n".join(lines), success=True)

        elif action == "read":
            message_id = (params.get("message_id") or "").strip()
            if not message_id:
                return ToolResult(
                    tool_name="gmail", content="message_id is required.", success=False
                )

            try:
                m = (
                    service.users()
                    .messages()
                    .get(userId="me", id=message_id, format="full")
                    .execute()
                )
            except Exception as exc:
                return ToolResult(
                    tool_name="gmail", content=f"Failed to read message: {exc}", success=False
                )

            hdrs = {
                h["name"]: h["value"]
                for h in m.get("payload", {}).get("headers", [])
            }
            body = _extract_body(m.get("payload", {}))
            content = (
                f"From: {hdrs.get('From', '')}\n"
                f"To: {hdrs.get('To', '')}\n"
                f"Subject: {hdrs.get('Subject', '')}\n"
                f"Date: {hdrs.get('Date', '')}\n\n"
                f"{body[:4000]}"
            )
            return ToolResult(tool_name="gmail", content=content, success=True)

        elif action == "draft":
            to = (params.get("to") or "").strip()
            subject = (params.get("subject") or "").strip()
            body_text = (params.get("body") or "").strip()
            if not to or not subject:
                return ToolResult(
                    tool_name="gmail",
                    content="to and subject are required to create a draft.",
                    success=False,
                )

            raw = _build_raw(to, subject, body_text)
            try:
                draft = (
                    service.users()
                    .drafts()
                    .create(userId="me", body={"message": {"raw": raw}})
                    .execute()
                )
            except Exception as exc:
                return ToolResult(
                    tool_name="gmail", content=f"Failed to create draft: {exc}", success=False
                )

            _ = draft  # draft ID not needed in response
            return ToolResult(
                tool_name="gmail",
                content=f"Draft saved — to: {to}, subject: '{subject}'. Open Gmail to review and send.",
                success=True,
            )

        return ToolResult(tool_name="gmail", content=f"Unknown action: {action}", success=False)


def _extract_body(payload: dict) -> str:
    """Recursively extract plain-text body from a Gmail message payload."""
    if payload.get("mimeType") == "text/plain":
        data = payload.get("body", {}).get("data", "")
        if data:
            return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    for part in payload.get("parts", []):
        result = _extract_body(part)
        if result and result != "(no text body)":
            return result
    return "(no text body)"


def _build_raw(to: str, subject: str, body: str) -> str:
    """Build a base64url-encoded RFC 2822 message."""
    msg = email.message.EmailMessage()
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
