"""open_browser_tool — Find a website and open it in the default browser."""

from __future__ import annotations

import subprocess
import sys
from typing import Any
from urllib.parse import quote_plus

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("open_browser")
class OpenBrowserTool(BaseTool):
    """Search for a website by name and open it in the browser."""

    tool_id = "open_browser"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="open_browser",
            description=(
                "Search for a website by name and open it in the default browser. "
                "Use when the user says 'pull up', 'open', 'show me', or 'go to' a website. "
                "Examples: 'pull up the Cloverdale Rodeo website', 'open YouTube', "
                "'show me the NHL scores page'. "
                "Provide url if you already know the exact URL; otherwise provide query."
            ),
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "Website name or topic to search for "
                            "(e.g. 'Cloverdale Rodeo', 'YouTube', 'TSN hockey scores')."
                        ),
                    },
                    "url": {
                        "type": "string",
                        "description": "Direct URL to open when already known.",
                    },
                },
            },
            category="utility",
            cost_estimate=0.0,
            latency_estimate=1.5,
        )

    def execute(self, **params: Any) -> ToolResult:
        url = (params.get("url") or "").strip()
        query = (params.get("query") or "").strip()

        if not url and not query:
            return ToolResult(
                tool_name="open_browser", content="Provide a query or url.", success=False
            )

        if not url:
            url = self._find_url(query)

        _open_url(url)
        return ToolResult(tool_name="open_browser", content=f"Opening {url}, sir.", success=True)

    def _find_url(self, query: str) -> str:
        """Search Tavily for the best URL; fall back to a Google search URL."""
        try:
            from pathlib import Path

            try:
                import tomllib
            except ImportError:
                import tomli as tomllib  # type: ignore

            creds_file = Path.home() / ".openjarvis" / "credentials.toml"
            api_key = ""
            if creds_file.exists():
                d = tomllib.loads(creds_file.read_text(encoding="utf-8"))
                api_key = d.get("tavily", {}).get("api_key", "")

            if not api_key:
                import os
                api_key = os.environ.get("TAVILY_API_KEY", "")

            if api_key:
                import httpx

                with httpx.Client(timeout=8) as c:
                    r = c.post(
                        "https://api.tavily.com/search",
                        json={
                            "api_key": api_key,
                            "query": f"{query} official website",
                            "search_depth": "basic",
                            "max_results": 3,
                            "include_answer": False,
                        },
                    )
                    r.raise_for_status()
                    results = r.json().get("results", [])
                    if results:
                        return results[0].get("url", "")
        except Exception:
            pass

        return f"https://www.google.com/search?q={quote_plus(query)}"


def _open_url(url: str) -> None:
    if sys.platform == "win32":
        subprocess.Popen(
            ["powershell", "-NonInteractive", "-Command", f"Start-Process '{url}'"],
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    elif sys.platform == "darwin":
        subprocess.Popen(["open", url])
    else:
        subprocess.Popen(["xdg-open", url])
