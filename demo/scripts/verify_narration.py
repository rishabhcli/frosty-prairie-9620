#!/usr/bin/env python3
"""Local STT verification pass: transcribes each generated narration clip with
Whisper (via mlx-whisper) and prints it next to the intended script text so any
missing words, repeats, or mis-renderings are visible before the final mix."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from narrate import SCENES, OUT_DIR  # noqa: E402

import mlx_whisper

lines = []
for scene_id, text in SCENES:
    wav_path = OUT_DIR / f"{scene_id}.wav"
    result = mlx_whisper.transcribe(str(wav_path), path_or_hf_repo="mlx-community/whisper-small-mlx")
    transcript = result["text"].strip()
    lines.extend(
        [
            f"=== {scene_id} ===",
            f"script:     {text}",
            f"transcript: {transcript}",
            "",
        ]
    )

verification = "\n".join(lines)
(OUT_DIR / "stt_verification.txt").write_text(verification)
print(verification)
print(f"wrote {OUT_DIR / 'stt_verification.txt'}")
