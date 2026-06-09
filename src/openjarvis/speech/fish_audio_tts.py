"""Fish Audio text-to-speech backend.

Uses the Fish Audio REST API for high-quality, low-latency voice synthesis.
Requires FISH_AUDIO_API_KEY environment variable.
"""

from __future__ import annotations

import os
from typing import List

import httpx

from openjarvis.core.registry import TTSRegistry
from openjarvis.speech.tts import TTSBackend, TTSResult

_FISH_API_BASE = "https://api.fish.audio"

# Default reference voice ID — a neutral English voice.
# Users can override this via config or by passing voice_id to synthesize().
_DEFAULT_VOICE_ID = "5f9fb313da3a4236a6c08cfce1f22dc5"


def _fish_synthesize(
    api_key: str,
    text: str,
    reference_id: str,
    output_format: str = "mp3",
    streaming: bool = False,
) -> bytes:
    """Call the Fish Audio TTS API and return raw audio bytes."""
    body: dict = {
        "text": text,
        "format": output_format,
        "streaming": streaming,
        "speed": 1.25,
    }
    if reference_id:
        body["reference_id"] = reference_id

    resp = httpx.post(
        f"{_FISH_API_BASE}/v1/tts",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=body,
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.content


@TTSRegistry.register("fish_audio")
class FishAudioTTSBackend(TTSBackend):
    """Fish Audio TTS backend — high quality, voice-clonable synthesis."""

    backend_id = "fish_audio"

    def __init__(self, *, api_key: str = "", reference_id: str = "") -> None:
        self._api_key = api_key or os.environ.get("FISH_AUDIO_API_KEY", "")
        self._reference_id = reference_id or os.environ.get(
            "FISH_AUDIO_REFERENCE_ID", _DEFAULT_VOICE_ID
        )

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str = "",
        speed: float = 1.0,
        output_format: str = "mp3",
    ) -> TTSResult:
        if not self._api_key:
            raise RuntimeError(
                "FISH_AUDIO_API_KEY not set — add it to start-jarvis.ps1"
            )

        ref_id = voice_id or self._reference_id

        audio = _fish_synthesize(
            self._api_key,
            text,
            reference_id=ref_id,
            output_format=output_format,
        )

        return TTSResult(
            audio=audio,
            format=output_format,
            voice_id=ref_id,
            metadata={"backend": "fish_audio", "reference_id": ref_id},
        )

    def available_voices(self) -> List[str]:
        return [self._reference_id] if self._reference_id else []

    def health(self) -> bool:
        return bool(self._api_key)
