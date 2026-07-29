#!/usr/bin/env python3
"""Generate per-scene ContactSafe narration with Qwen3-TTS, locked to one session.

Model: mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit (see docs/CURRENT_SOURCES.md).
Loads the model once, generates every scene from demo/narration.md in this same
locked session, and writes lossless WAV files under demo/audio/narration/.
"""
import fcntl
import json
import platform
import time
from pathlib import Path

MODEL_ID = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit"
LOCK_PATH = "/tmp/hackathon-qwen3-tts.lock"
DEMO_DIR = Path(__file__).resolve().parents[1]
OUT_DIR = DEMO_DIR / "audio" / "narration"
PROVENANCE_PATH = OUT_DIR / "provenance.json"

# Scene text mirrors demo/narration.md exactly, with the `//` voice-direction pause
# markers stripped -- Qwen3-TTS paces off sentence punctuation, not markup.
SCENES = [
    (
        "scene-01-problem",
        "Two agents. One customer. Both remember the conversation. "
        "Neither one knows what the other's about to do.",
    ),
    (
        "scene-02-race",
        "Here's Jordan. Jordan got a promise last week: "
        "\"I'll email the revised quote after Tuesday.\" "
        "Now two agents both pick up the follow-up task at the same instant. "
        "Agent A and Agent B each query CockroachDB for the same thing -- "
        "Jordan's consent, the open promise, and anything similar in vector memory. "
        "Both get the same answer back, with citations. Both are about to act. "
        "That's the moment most systems get this wrong.",
    ),
    (
        "scene-03-transaction-result",
        "Watch the lease. Agent B gets there first -- one serializable transaction, "
        "one fenced lease, one outbox row, committed. "
        "Agent A retries a beat later, sees a newer fencing token, and backs off cleanly. "
        "No duplicate email. No coin flip. CockroachDB didn't just store the memory -- "
        "it decided, transactionally, who gets to act on it.",
    ),
    (
        "scene-04-revocation",
        "Now Jordan revokes email consent. "
        "The email from a moment ago is still sitting in the queue, waiting to send. "
        "Doesn't matter that it was already approved. "
        "Before delivery, the worker rechecks consent one more time -- and this time it's revoked. "
        "The send gets canceled, not sent, before anything goes out.",
    ),
    (
        "scene-05-crash-recovery",
        "One more test: kill the outbox worker mid-delivery. On restart, it doesn't guess. "
        "It rechecks consent, rechecks the fencing token, and finds the one pending row it already approved. "
        "It resumes that -- and only that. No second send. No lost task.",
    ),
    (
        "scene-06-evaluation",
        "Under the hood, CockroachDB Cloud's distributed vector index runs for recall. "
        "The official ccloud CLI provisioned the database and SQL identity, and AWS Lambda "
        "serves this live judge console. Bedrock remains fixture-backed because this AWS "
        "organization explicitly denies Bedrock access. We then ran one thousand concurrent, "
        "retried attempts against the Cloud database. "
        "One approved action. Zero duplicates. Zero consent violations. "
    ),
    (
        "scene-07-limitation",
        "This demo sends through a sandbox provider, not a live inbox. "
        "And ContactSafe enforces the policy you configure -- it isn't a compliance review on its own.",
    ),
    (
        "scene-08-closing",
        "Shared memory made two agents safe to run together. That's ContactSafe.",
    ),
]


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    lock_file = open(LOCK_PATH, "w")
    print(f"[narrate] waiting for lock at {LOCK_PATH}...")
    fcntl.flock(lock_file, fcntl.LOCK_EX)
    print("[narrate] lock acquired")
    try:
        import mlx_audio
        from mlx_audio.tts.utils import load_model
        import soundfile as sf
        import numpy as np

        print(f"[narrate] platform={platform.platform()} machine={platform.machine()}")
        t0 = time.time()
        print(f"[narrate] loading {MODEL_ID}...")
        model = load_model(MODEL_ID)
        load_s = time.time() - t0
        print(f"[narrate] loaded in {load_s:.1f}s")

        results = []
        for scene_id, text in SCENES:
            t1 = time.time()
            chunks = []
            sr = None
            for result in model.generate(text=text, verbose=False):
                chunks.append(np.array(result.audio))
                sr = result.sample_rate
            audio = np.concatenate(chunks) if len(chunks) > 1 else chunks[0]
            out_path = OUT_DIR / f"{scene_id}.wav"
            sf.write(str(out_path), audio, sr)
            duration_s = len(audio) / sr
            gen_s = time.time() - t1
            word_count = len(text.split())
            wpm = word_count / (duration_s / 60)
            print(
                f"[narrate] {scene_id}: {duration_s:.2f}s audio, {word_count} words, "
                f"{wpm:.0f} wpm, generated in {gen_s:.1f}s -> {out_path}"
            )
            results.append(
                {
                    "sceneId": scene_id,
                    "text": text,
                    "wordCount": word_count,
                    "durationSeconds": round(duration_s, 3),
                    "sampleRate": sr,
                    "wordsPerMinute": round(wpm, 1),
                    "generationSeconds": round(gen_s, 2),
                    "path": str(out_path.relative_to(DEMO_DIR)),
                }
            )

        from importlib.metadata import version as pkg_version

        try:
            mlx_audio_version = pkg_version("mlx-audio")
        except Exception:
            mlx_audio_version = "unknown"

        provenance = {
            "modelId": MODEL_ID,
            "mlxAudioVersion": mlx_audio_version,
            "platform": platform.platform(),
            "machine": platform.machine(),
            "loadSeconds": round(load_s, 2),
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "scenes": results,
        }
        PROVENANCE_PATH.write_text(json.dumps(provenance, indent=2))
        print(f"[narrate] wrote provenance to {PROVENANCE_PATH}")
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
        print("[narrate] lock released")


if __name__ == "__main__":
    main()
