#!/usr/bin/env python3
"""Generates accurate .srt/.vtt captions by running local Whisper (mlx-whisper) over
each *actual* generated narration clip to get real segment-level timestamps, then
offsetting those into the final video's timeline (matching demo/animation/src/timeline.ts's
block placement -- title=3.0s, then each scene + 1.5s transition gap, with scene 6's
narration split across the architecture/results-reveal visuals exactly as the video does).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from narrate import SCENES, OUT_DIR, DEMO_DIR  # noqa: E402

import mlx_whisper

TRANSITION_S = 1.5
CAPTIONS_DIR = DEMO_DIR / "captions"


def fmt_srt(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def fmt_vtt(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def main():
    CAPTIONS_DIR.mkdir(parents=True, exist_ok=True)
    provenance = json.loads((OUT_DIR / "provenance.json").read_text())
    duration_by_id = {s["sceneId"]: s["durationSeconds"] for s in provenance["scenes"]}

    # Mirror timeline.ts's block placement exactly.
    cursor = 3.0  # after TITLE
    scene_offsets = {}
    scene_order = [s[0] for s in SCENES]
    scene6_total = duration_by_id["scene-06-evaluation"]
    architecture_share = min(9.0, scene6_total * 0.45)

    for scene_id in scene_order:
        scene_offsets[scene_id] = cursor
        cursor += duration_by_id[scene_id] + TRANSITION_S

    cues = []
    for scene_id, _text in SCENES:
        wav_path = OUT_DIR / f"{scene_id}.wav"
        result = mlx_whisper.transcribe(
            str(wav_path), path_or_hf_repo="mlx-community/whisper-small-mlx", word_timestamps=False
        )
        offset = scene_offsets[scene_id]
        for seg in result["segments"]:
            cues.append(
                {
                    "start": offset + seg["start"],
                    "end": offset + seg["end"],
                    "text": seg["text"].strip(),
                }
            )

    srt_lines = []
    vtt_lines = ["WEBVTT", ""]
    for i, cue in enumerate(cues, start=1):
        srt_lines.append(str(i))
        srt_lines.append(f"{fmt_srt(cue['start'])} --> {fmt_srt(cue['end'])}")
        srt_lines.append(cue["text"])
        srt_lines.append("")

        vtt_lines.append(f"{fmt_vtt(cue['start'])} --> {fmt_vtt(cue['end'])}")
        vtt_lines.append(cue["text"])
        vtt_lines.append("")

    (CAPTIONS_DIR / "demo.srt").write_text("\n".join(srt_lines))
    (CAPTIONS_DIR / "demo.vtt").write_text("\n".join(vtt_lines))
    print(f"wrote {CAPTIONS_DIR / 'demo.srt'} and demo.vtt with {len(cues)} cues")
    for cue in cues[:5]:
        print(f"  {cue['start']:.2f}-{cue['end']:.2f}: {cue['text']}")


if __name__ == "__main__":
    main()
