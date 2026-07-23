#!/usr/bin/env python3
"""Generates ContactSafe's original music bed: deterministic additive synthesis,
no samples, no vocals, no external audio. Committed here as the sole source of the
track (per the mega-prompt's "scripted, seeded, attributable" music requirement).

Arrangement is specific to this project: a calm, low-key-technical bed (soft bass
pulse + sparse mallet arpeggio in A minor pentatonic + a quiet sustained pad) meant
to sit under narration, not compete with it -- ducking happens later in mix.py.
"""
import numpy as np
import soundfile as sf
from pathlib import Path

SEED = 20260722  # fixed so the track is exactly reproducible from this script
SR = 44100
BPM = 84
BEAT_S = 60.0 / BPM
DURATION_S = 140.0
OUT_PATH = Path(__file__).resolve().parents[1] / "audio" / "music" / "bed.wav"

# A minor pentatonic relative to root A2 (110 Hz), as semitone offsets: A C D E G
ROOT_HZ = 110.0
SCALE_SEMITONES = [0, 3, 5, 7, 10]


def semitone_to_hz(root_hz: float, semitones: float) -> float:
    return root_hz * (2 ** (semitones / 12))


def adsr(n: int, sr: int, attack: float, decay: float, sustain_level: float, release: float) -> np.ndarray:
    a = max(1, int(attack * sr))
    d = max(1, int(decay * sr))
    r = max(1, int(release * sr))
    s = max(0, n - a - d - r)
    env = np.concatenate(
        [
            np.linspace(0, 1, a, endpoint=False),
            np.linspace(1, sustain_level, d, endpoint=False),
            np.full(s, sustain_level),
            np.linspace(sustain_level, 0, r),
        ]
    )
    if len(env) < n:
        env = np.pad(env, (0, n - len(env)))
    return env[:n]


def sine_note(freq: float, dur_s: float, sr: int, amp: float, attack=0.01, decay=0.15, sustain=0.4, release=0.3) -> np.ndarray:
    n = int(dur_s * sr)
    t = np.arange(n) / sr
    # A touch of a higher partial gives it a soft mallet/bell character rather than a bare sine.
    wave = np.sin(2 * np.pi * freq * t) + 0.18 * np.sin(2 * np.pi * freq * 2.01 * t)
    env = adsr(n, sr, attack, decay, sustain, release)
    return (wave * env * amp).astype(np.float64)


def add_at(buffer: np.ndarray, sound: np.ndarray, start_s: float, sr: int) -> None:
    start = int(start_s * sr)
    end = start + len(sound)
    if end > len(buffer):
        sound = sound[: len(buffer) - start]
        end = len(buffer)
    if start < len(buffer) and len(sound) > 0:
        buffer[start:end] += sound


def soft_percussion_tick(sr: int, amp: float) -> np.ndarray:
    dur = 0.05
    n = int(dur * sr)
    rng_local = np.random.default_rng(SEED + 1)
    noise = rng_local.uniform(-1, 1, n)
    # crude low-pass via short moving average -- keeps it soft, not a hi-hat hiss
    kernel = np.ones(8) / 8
    noise = np.convolve(noise, kernel, mode="same")
    env = np.linspace(1, 0, n) ** 2
    return (noise * env * amp).astype(np.float64)


def main():
    rng = np.random.default_rng(SEED)
    n_samples = int(DURATION_S * SR)
    left = np.zeros(n_samples)
    right = np.zeros(n_samples)

    beats_total = int(DURATION_S / BEAT_S)

    # Soft bass pulse: root note, every other beat (beats 0 and 2 of each 4-beat bar),
    # fading in over the first bar and fading out over the last two bars.
    for beat in range(beats_total):
        if beat % 2 != 0:
            continue
        t_s = beat * BEAT_S
        bar_progress = beat / beats_total
        fade_in = min(1.0, t_s / (BEAT_S * 4))
        fade_out = min(1.0, max(0.0, (DURATION_S - t_s) / (BEAT_S * 8)))
        amp = 0.14 * fade_in * fade_out
        bass = sine_note(ROOT_HZ / 2, BEAT_S * 1.8, SR, amp, attack=0.02, decay=0.3, sustain=0.25, release=1.0)
        add_at(left, bass, t_s, SR)
        add_at(right, bass, t_s, SR)

    # Sparse mallet arpeggio: one note roughly every 1-2 bars, picked from the pentatonic
    # scale, gently panned left/right for width, deterministic via the seeded RNG.
    t_cursor = BEAT_S * 4  # let the bass establish itself for one bar first
    while t_cursor < DURATION_S - 6.0:
        semitone = rng.choice(SCALE_SEMITONES) + rng.choice([0, 12])
        freq = semitone_to_hz(ROOT_HZ, semitone)
        note_dur = BEAT_S * float(rng.choice([2.0, 3.0, 4.0]))
        pan = rng.uniform(0.25, 0.75)
        fade_in = min(1.0, t_cursor / (BEAT_S * 4))
        fade_out = min(1.0, max(0.0, (DURATION_S - t_cursor) / (BEAT_S * 8)))
        amp = 0.1 * fade_in * fade_out
        note = sine_note(freq, note_dur, SR, amp, attack=0.01, decay=0.2, sustain=0.35, release=note_dur * 0.6)
        add_at(left, note * (1 - pan) * 2, t_cursor, SR)
        add_at(right, note * pan * 2, t_cursor, SR)
        t_cursor += BEAT_S * float(rng.choice([2.0, 3.0, 4.0, 4.0]))

    # Quiet sustained pad: root/fifth/octave, slow amplitude swell for warmth.
    n = n_samples
    t = np.arange(n) / SR
    pad = np.zeros(n)
    for semitone, weight in [(0, 0.5), (7, 0.3), (12, 0.2)]:
        freq = semitone_to_hz(ROOT_HZ, semitone)
        pad += weight * np.sin(2 * np.pi * freq * t)
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * t / 17.0)  # slow ~17s LFO, organic not mechanical
    fade_in = np.clip(t / 3.0, 0, 1)
    fade_out = np.clip((DURATION_S - t) / 4.0, 0, 1)
    pad_env = 0.045 * swell * fade_in * fade_out
    left += pad * pad_env
    right += pad * pad_env

    # Restrained transition accents every ~20s -- a soft tick, not a dramatic swell.
    accent_times = np.arange(18.0, DURATION_S - 6.0, 20.0)
    for t_s in accent_times:
        tick = soft_percussion_tick(SR, amp=0.09)
        add_at(left, tick, t_s, SR)
        add_at(right, tick, t_s, SR)

    stereo = np.stack([left, right], axis=1)
    peak = np.max(np.abs(stereo))
    if peak > 0:
        stereo = stereo / peak * 0.75  # headroom for the later narration mix

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(OUT_PATH), stereo, SR)
    print(f"wrote {OUT_PATH}: {DURATION_S:.1f}s, {SR}Hz stereo, peak-normalized to 0.75, seed={SEED}")


if __name__ == "__main__":
    main()
