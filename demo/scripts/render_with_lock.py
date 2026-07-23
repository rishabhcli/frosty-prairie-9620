#!/usr/bin/env python3
"""Acquires the shared /tmp/hackathon-video-render.lock (OS-level flock, not a lock
directory) before running the real Remotion render, so this doesn't collide with
other agents' renders/video encoding on the same shared host."""
import fcntl
import subprocess
import sys
from pathlib import Path

LOCK_PATH = "/tmp/hackathon-video-render.lock"
ANIMATION_DIR = Path(__file__).resolve().parents[1] / "animation"


def main():
    lock_file = open(LOCK_PATH, "w")
    print(f"[render] waiting for lock at {LOCK_PATH}...")
    fcntl.flock(lock_file, fcntl.LOCK_EX)
    print("[render] lock acquired")
    try:
        result = subprocess.run(
            ["pnpm", "exec", "remotion", "render", "src/index.ts", "ContactSafeDemo",
             "../final/frosty-prairie-9620-demo.mp4", "--log=verbose"],
            cwd=str(ANIMATION_DIR),
        )
        return result.returncode
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
        print("[render] lock released")


if __name__ == "__main__":
    sys.exit(main())
