"""system_stats — real-time CPU, RAM, GPU usage."""

from __future__ import annotations

from typing import Any

from openjarvis.core.registry import ToolRegistry
from openjarvis.core.types import ToolResult
from openjarvis.tools._stubs import BaseTool, ToolSpec


@ToolRegistry.register("system_stats")
class SystemStatsTool(BaseTool):
    """Report live system resource usage."""

    tool_id = "system_stats"

    @property
    def spec(self) -> ToolSpec:
        return ToolSpec(
            name="system_stats",
            description=(
                "Get real-time system resource usage: CPU percentage, RAM usage, "
                "disk usage, and GPU utilization (if NVIDIA)."
            ),
            parameters={"type": "object", "properties": {}},
            category="utility",
            cost_estimate=0.0,
            latency_estimate=0.15,
        )

    def execute(self, **params: Any) -> ToolResult:
        try:
            import psutil
        except ImportError:
            return ToolResult(
                tool_name="system_stats",
                content="psutil not installed. Run: uv add psutil",
                success=False,
            )

        try:
            cpu = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage("/")

            stats: dict = {
                "cpu_percent": round(cpu, 1),
                "ram_percent": round(mem.percent, 1),
                "ram_used_gb": round(mem.used / 1e9, 1),
                "ram_total_gb": round(mem.total / 1e9, 1),
                "disk_percent": round(disk.percent, 1),
                "disk_used_gb": round(disk.used / 1e9, 1),
                "disk_total_gb": round(disk.total / 1e9, 1),
            }

            try:
                import subprocess

                r = subprocess.run(
                    [
                        "nvidia-smi",
                        "--query-gpu=utilization.gpu,memory.used,memory.total",
                        "--format=csv,noheader,nounits",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=3,
                )
                if r.returncode == 0:
                    parts = r.stdout.strip().split(",")
                    if len(parts) >= 3:
                        stats["gpu_percent"] = float(parts[0].strip())
                        stats["gpu_vram_used_mb"] = float(parts[1].strip())
                        stats["gpu_vram_total_mb"] = float(parts[2].strip())
            except Exception:
                pass

            lines = [
                f"CPU: {stats['cpu_percent']}%",
                f"RAM: {stats['ram_percent']}% ({stats['ram_used_gb']} GB / {stats['ram_total_gb']} GB)",
                f"Disk: {stats['disk_percent']}% used",
            ]
            if "gpu_percent" in stats:
                lines.append(
                    f"GPU: {stats['gpu_percent']}% | VRAM: "
                    f"{stats['gpu_vram_used_mb']:.0f} / {stats['gpu_vram_total_mb']:.0f} MB"
                )

            return ToolResult(
                tool_name="system_stats",
                content="\n".join(lines),
                success=True,
                metadata=stats,
            )
        except Exception as exc:
            return ToolResult(
                tool_name="system_stats",
                content=f"System stats error: {exc}",
                success=False,
            )
