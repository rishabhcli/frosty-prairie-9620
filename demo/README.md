# ContactSafe demo package

Everything needed to reproduce the submitted demo video from source, plus the standalone
evidence artifacts (screenshots, thumbnail, captions) judges can review without watching the
whole video.

## Layout

```
demo/
  README.md            this file
  demo.yaml             scene-by-scene script: timing, narration, on-screen text, proof
  narration.md          narration script written for speech, with pacing notes
  animation/            Remotion project (the actual video composition)
  audio/
    narration/           per-scene Qwen3-TTS WAV clips + provenance.json
    music/                original scripted music bed (bed.wav) + generate_music.py is the source
    mix/                  final mixed audio stem extracted from the rendered video
  capture/               raw Playwright-recorded product footage + events.json (real timestamps)
  captions/               demo.srt / demo.vtt, generated from real Whisper timestamps
  screenshots/            7 full-resolution judge-facing screenshots
  thumbnail/              thumbnail.png (16:9), hero.png, architecture.png, results.png
  scripts/                every script used to produce the above (see below)
  final/                  frosty-prairie-9620-demo.mp4 (git-ignored -- see below)
```

## Reproducing the final video from scratch

```bash
# 1. Product must be running locally (see repository root README.md "Local setup")
pnpm db:up && pnpm db:migrate
pnpm --filter @contactsafe/api start &
pnpm --filter @contactsafe/console build && pnpm --filter @contactsafe/console preview &

# 2. Capture real product footage + screenshots (Playwright drives the real running app,
#    including a genuine SIGKILL + restart of the outbox-worker process)
pnpm exec tsx demo/scripts/record.ts

# 3. Generate narration (locked to /tmp/hackathon-qwen3-tts.lock, one session, all 8 scenes)
demo/.venv/bin/python3 demo/scripts/narrate.py

# 4. Generate the original music bed (deterministic, seeded)
demo/.venv/bin/python3 demo/scripts/generate_music.py

# 5. Generate captions from real Whisper timestamps against the actual narration audio
demo/.venv/bin/python3 demo/scripts/generate_captions.py

# 6. Render the final video (locked to /tmp/hackathon-video-render.lock)
python3 demo/scripts/render_with_lock.py

# 7. Loudness-normalize to -16 LUFS / -1 dBTP (two-pass ffmpeg loudnorm)
#    -- see docs/BUILD_EVIDENCE.md for the exact measured/target values used.
```

`demo/.venv` is a project-scoped Python environment (`mlx-audio`, `mlx-whisper`, `soundfile`,
`numpy`) not committed to git; recreate it with `python3 -m venv demo/.venv && demo/.venv/bin/pip
install mlx-audio mlx-whisper soundfile numpy`.

## Why `demo/final/*.mp4` isn't committed to git

The hackathon's own submission rule requires the video be uploaded to YouTube or Vimeo and
made public — the git repository isn't where judges watch it. Committing an 18MB+ binary that
is fully reproducible from committed source (Remotion composition + narration/music scripts +
one documented render command) would only bloat the repository. The file exists on disk after
running the steps above; uploading it to YouTube/Vimeo is a human step (see
`docs/SUBMISSION_CHECKLIST.md`), not something this build performs autonomously.

## Provenance and verification

- **Narration model:** `mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit`, exact version/platform/
  per-scene timing in `demo/audio/narration/provenance.json`.
- **Narration verification:** `demo/audio/narration/stt_verification.txt` — every scene
  transcribed back with local Whisper and diffed against the intended script (word-for-word
  match on all 8 scenes).
- **Music:** fully scripted, seeded, reproducible — `demo/scripts/generate_music.py` is the
  only source of `demo/audio/music/bed.wav`, no samples or external audio.
- **Product footage:** `demo/capture/events.json` records real wall-clock timestamps and the
  actual `outbox-worker` process PIDs that were started, claimed a row, were SIGKILLed, and
  were restarted during capture -- not staged or simulated.
