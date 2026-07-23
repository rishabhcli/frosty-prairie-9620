#!/usr/bin/env python3
"""One-off smoke test for the Qwen3-TTS pipeline before the real narration run."""
import fcntl
import time
from pathlib import Path

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"
LOCK_PATH = "/tmp/hackathon-qwen3-tts.lock"
OUT = Path(__file__).resolve().parents[1] / "capture" / "tts_smoke.wav"


def main():
    lock_file = open(LOCK_PATH, "w")
    print(f"[smoke] waiting for lock at {LOCK_PATH}...")
    fcntl.flock(lock_file, fcntl.LOCK_EX)
    print("[smoke] lock acquired")
    try:
        from mlx_audio.tts.utils import load_model
        import soundfile as sf
        import numpy as np

        t0 = time.time()
        print(f"[smoke] loading {MODEL_ID}...")
        model = load_model(MODEL_ID)
        print(f"[smoke] loaded in {time.time() - t0:.1f}s")

        text = "Two agents. One customer. Neither one knows what the other's about to do."
        chunks = []
        sr = None
        for result in model.generate(text=text, verbose=True):
            chunks.append(np.array(result.audio))
            sr = result.sample_rate
        audio = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
        sf.write(str(OUT), audio, sr)
        print(f"[smoke] wrote {OUT} sample_rate={sr} duration={len(audio) / sr:.2f}s")
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
        print("[smoke] lock released")


if __name__ == "__main__":
    main()
