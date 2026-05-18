"""remember — persistent memory across sessions."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec

_MEMORY_FILE = Path.home() / ".openjarvis" / "memories.json"


def _load() -> list[dict]:
    try:
        if _MEMORY_FILE.exists():
            return json.loads(_MEMORY_FILE.read_text(encoding="utf-8"))
        return []
    except Exception:
        return []


def _save(memories: list[dict]) -> None:
    _MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    _MEMORY_FILE.write_text(json.dumps(memories, indent=2), encoding="utf-8")


@ToolRegistry.register("remember")
class RememberTool(BaseTool):
    """Store or recall facts for the user across sessions."""

    tool_id = "remember"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="remember",
            description=(
                "Store a fact to persistent memory, or recall stored memories. "
                "Use action='store' with a fact to remember it permanently. "
                "Use action='recall' with an optional query to retrieve memories. "
                "Use action='forget' to remove a specific memory."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["store", "recall", "forget"],
                        "description": "store: save a new fact. recall: retrieve memories. forget: remove a memory.",
                    },
                    "fact": {
                        "type": "string",
                        "description": "The fact to store or forget (required for store/forget actions)",
                    },
                    "query": {
                        "type": "string",
                        "description": "Optional search string to filter recalled memories",
                    },
                },
                "required": ["action"],
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=0.01,
        )

    def execute(self, **params: Any) -> ToolResult:
        action = params.get("action", "recall")
        fact = (params.get("fact") or "").strip()
        query = (params.get("query") or "").strip().lower()

        memories = _load()

        if action == "store":
            if not fact:
                return ToolResult(tool_name="remember", content="No fact provided.", success=False)
            entry = {"fact": fact, "timestamp": datetime.utcnow().isoformat()}
            memories.append(entry)
            _save(memories)
            return ToolResult(tool_name="remember", content=f"Stored: {fact}", success=True)

        if action == "forget":
            if not fact:
                return ToolResult(tool_name="remember", content="No fact provided.", success=False)
            before = len(memories)
            memories = [m for m in memories if fact.lower() not in m["fact"].lower()]
            _save(memories)
            removed = before - len(memories)
            return ToolResult(
                tool_name="remember",
                content=f"Removed {removed} entr{'y' if removed == 1 else 'ies'} matching '{fact}'.",
                success=True,
            )

        # recall
        if not memories:
            return ToolResult(tool_name="remember", content="No memories stored yet.", success=True)
        if query:
            matches = [m for m in memories if query in m["fact"].lower()]
            if not matches:
                return ToolResult(
                    tool_name="remember",
                    content=f"No memories matching '{query}'.",
                    success=True,
                )
            lines = [f"- {m['fact']}" for m in matches[-20:]]
        else:
            lines = [f"- {m['fact']}" for m in memories[-20:]]

        return ToolResult(tool_name="remember", content="\n".join(lines), success=True)
