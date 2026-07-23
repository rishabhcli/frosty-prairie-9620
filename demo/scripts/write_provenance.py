#!/usr/bin/env python3
"""Reconstructs demo/audio/narration/provenance.json from the already-generated WAV
files -- no model load, no lock needed, since this only inspects existing output."""
import json
import platform
import time
from importlib.metadata import version as pkg_version
from pathlib import Path

import soundfile as sf

from narrate import SCENES, MODEL_ID, OUT_DIR, DEMO_DIR, PROVENANCE_PATH

results = []
for scene_id, text in SCENES:
    wav_path = OUT_DIR / f"{scene_id}.wav"
    info = sf.info(str(wav_path))
    word_count = len(text.split())
    wpm = word_count / (info.duration / 60)
    results.append(
        {
            "sceneId": scene_id,
            "text": text,
            "wordCount": word_count,
            "durationSeconds": round(info.duration, 3),
            "sampleRate": info.samplerate,
            "wordsPerMinute": round(wpm, 1),
            "path": str(wav_path.relative_to(DEMO_DIR)),
        }
    )

try:
    mlx_audio_version = pkg_version("mlx-audio")
except Exception:
    mlx_audio_version = "unknown"

provenance = {
    "modelId": MODEL_ID,
    "mlxAudioVersion": mlx_audio_version,
    "platform": platform.platform(),
    "machine": platform.machine(),
    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "scenes": results,
}
PROVENANCE_PATH.write_text(json.dumps(provenance, indent=2))
print(f"wrote {PROVENANCE_PATH}")
print(json.dumps(provenance, indent=2))
