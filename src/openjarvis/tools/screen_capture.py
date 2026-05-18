"""screen_capture — screenshot the screen and describe what's visible."""

from __future__ import annotations

import base64
import io
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


def _capture_screenshot() -> bytes | None:
    """Capture a screenshot using Pillow or PowerShell fallback."""
    try:
        from PIL import ImageGrab  # type: ignore
        img = ImageGrab.grab(all_screens=True)
        buf = io.BytesIO()
        # Resize to reduce token cost (~1920px wide is plenty)
        w, h = img.size
        if w > 1920:
            ratio = 1920 / w
            img = img.resize((1920, int(h * ratio)))
        img.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except Exception:
        pass

    # PowerShell fallback
    try:
        tmp = Path(tempfile.mktemp(suffix=".png"))
        ps = (
            "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; "
            "$screens = [System.Windows.Forms.Screen]::AllScreens; "
            "$top = ($screens | Measure-Object -Property Bounds.Top -Minimum).Minimum; "
            "$left = ($screens | Measure-Object -Property Bounds.Left -Minimum).Minimum; "
            "$bottom = ($screens | Measure-Object -Property { $_.Bounds.Top + $_.Bounds.Height } -Maximum).Maximum; "
            "$right = ($screens | Measure-Object -Property { $_.Bounds.Left + $_.Bounds.Width } -Maximum).Maximum; "
            "$bmp = New-Object System.Drawing.Bitmap(($right - $left), ($bottom - $top)); "
            "$g = [System.Drawing.Graphics]::FromImage($bmp); "
            "$g.CopyFromScreen($left, $top, 0, 0, $bmp.Size); "
            f"$bmp.Save('{str(tmp)}', [System.Drawing.Imaging.ImageFormat]::Png)"
        )
        result = subprocess.run(
            ["powershell", "-NonInteractive", "-Command", ps],
            capture_output=True, timeout=15,
        )
        if result.returncode == 0 and tmp.exists():
            data = tmp.read_bytes()
            tmp.unlink(missing_ok=True)
            return data
    except Exception:
        pass

    return None


def _analyze_image(img_bytes: bytes) -> str:
    """Send screenshot to Claude vision for description."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return f"Screenshot captured ({len(img_bytes) // 1024}KB) but ANTHROPIC_API_KEY not set for vision analysis."

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        b64 = base64.b64encode(img_bytes).decode()
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=512,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": "image/png", "data": b64},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Describe what's on this screen concisely. "
                            "Mention: what application is open, what the user is doing, "
                            "any important text or content visible. Be brief and factual."
                        ),
                    },
                ],
            }],
        )
        return response.content[0].text
    except Exception as e:
        return f"Screenshot captured ({len(img_bytes) // 1024}KB) but vision analysis failed: {e}"


@ToolRegistry.register("screen_capture")
class ScreenCaptureTool(BaseTool):
    """Take a screenshot and describe what's visible on screen."""

    tool_id = "screen_capture"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="screen_capture",
            description=(
                "Take a screenshot of the screen and describe what's visible. "
                "Use when the user asks 'what's on my screen', 'can you see my screen', "
                "'what am I looking at', or similar questions."
            ),
            parameters={
                "type": "object",
                "properties": {},
                "required": [],
            },
            category="utility",
            cost_estimate=0.05,
            latency_estimate=3.0,
        )

    def execute(self, **params: Any) -> ToolResult:
        img_bytes = _capture_screenshot()
        if img_bytes is None:
            return ToolResult(
                tool_name="screen_capture",
                content="Screenshot failed: could not capture the screen.",
                success=False,
            )

        description = _analyze_image(img_bytes)
        return ToolResult(tool_name="screen_capture", content=description, success=True)
