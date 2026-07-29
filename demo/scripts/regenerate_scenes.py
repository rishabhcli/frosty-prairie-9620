#!/usr/bin/env python3
"""Regenerate selected scenes at an adjusted speed and update provenance.

Pass overrides as `scene-id=speed`. With no arguments, the original scene-02 pacing
adjustment is retained for reproducible full-media rebuilds.
"""
import fcntl
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from narrate import SCENES, MODEL_ID, LOCK_PATH, OUT_DIR, PROVENANCE_PATH, DEMO_DIR  # noqa: E402

# scene_id -> speed multiplier (1.0 = model default)
DEFAULT_ADJUSTMENTS = {
    "scene-02-race": 0.55,
}


def main():
    scenes_by_id = dict(SCENES)
    adjustments = DEFAULT_ADJUSTMENTS
    if len(sys.argv) > 1:
        adjustments = {}
        for raw in sys.argv[1:]:
            scene_id, speed_text = raw.rsplit("=", 1)
            if scene_id not in scenes_by_id:
                raise SystemExit(f"unknown scene id: {scene_id}")
            adjustments[scene_id] = float(speed_text)

    lock_file = open(LOCK_PATH, "w")
    print(f"[regen] waiting for lock at {LOCK_PATH}...")
    fcntl.flock(lock_file, fcntl.LOCK_EX)
    print("[regen] lock acquired")
    try:
        from mlx_audio.tts.utils import load_model
        import soundfile as sf
        import numpy as np

        t0 = time.time()
        print(f"[regen] loading {MODEL_ID}...")
        model = load_model(MODEL_ID)
        print(f"[regen] loaded in {time.time() - t0:.1f}s")

        updated = {}
        for scene_id, speed in adjustments.items():
            text = scenes_by_id[scene_id]
            t1 = time.time()
            chunks = []
            sr = None
            for result in model.generate(text=text, speed=speed, verbose=False):
                chunks.append(np.array(result.audio))
                sr = result.sample_rate
            audio = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
            out_path = OUT_DIR / f"{scene_id}.wav"
            sf.write(str(out_path), audio, sr)
            duration_s = len(audio) / sr
            word_count = len(text.split())
            wpm = word_count / (duration_s / 60)
            print(
                f"[regen] {scene_id} @ speed={speed}: {duration_s:.2f}s, {word_count} words, "
                f"{wpm:.0f} wpm, generated in {time.time() - t1:.1f}s"
            )
            updated[scene_id] = {
                "text": text,
                "wordCount": word_count,
                "durationSeconds": round(duration_s, 3),
                "sampleRate": sr,
                "wordsPerMinute": round(wpm, 1),
                "speed": speed,
                "path": str(out_path.relative_to(DEMO_DIR)),
            }
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
        print("[regen] lock released")

    provenance = json.loads(PROVENANCE_PATH.read_text())
    for scene in provenance["scenes"]:
        if scene["sceneId"] in updated:
            scene.update(updated[scene["sceneId"]])
    provenance["regeneratedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    PROVENANCE_PATH.write_text(json.dumps(provenance, indent=2))
    print(f"[regen] updated {PROVENANCE_PATH}")


if __name__ == "__main__":
    main()
