"""verify.py - check the delivered film actually is what the brief asks for.

    python3 -m snooze.verify output/snooze.mp4

Checks
  * container: H.264 video + AAC audio, exactly 1080x1920
  * duration: 120.000 s and 2880 frames at 24 fps
  * content: every frame decodes, nothing black, nothing washed out
  * loop: the last frame and the first frame are the same picture
"""

from __future__ import annotations

import os
import subprocess
import sys

import numpy as np

W, H, FPS, FRAMES, DUR = 1080, 1920, 24, 2880, 120.0
SW, SH = 54, 96          # sampling size for the content checks


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'


def probe(path):
    out = subprocess.run([ffmpeg(), '-hide_banner', '-i', path],
                         capture_output=True, text=True).stderr
    info = {'raw': out}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('Duration:'):
            hms = line.split('Duration:')[1].split(',')[0].strip()
            h, m, s = hms.split(':')
            info['duration'] = int(h) * 3600 + int(m) * 60 + float(s)
        if 'Video:' in line:
            info['video'] = line
            info['codec'] = 'h264' if 'h264' in line else 'other'
            if f'{W}x{H}' in line:
                info['size'] = (W, H)
            if f'{FPS} fps' in line:
                info['fps'] = FPS
        if 'Audio:' in line:
            info['audio'] = line
    return info


def decode_small(path):
    """Decode every frame at SWxSH greyscale -> (n, SH, SW) int16."""
    cmd = [ffmpeg(), '-v', 'error', '-i', path, '-map', '0:v:0',
           '-vf', f'scale={SW}:{SH},format=gray',
           '-f', 'rawvideo', '-']
    raw = subprocess.run(cmd, capture_output=True).stdout
    n = len(raw) // (SW * SH)
    if n == 0:
        return np.zeros((0, SH, SW), np.int16)
    return np.frombuffer(raw[:n * SW * SH], np.uint8).reshape(n, SH, SW).astype(np.int16)


def verify(path, verbose=True):
    ok = True

    def check(cond, msg):
        nonlocal ok
        ok = ok and bool(cond)
        if verbose:
            print(('  PASS  ' if cond else '  FAIL  ') + msg)

    print(f'verifying {path}')
    if not os.path.exists(path):
        print('  FAIL  file does not exist')
        return False

    info = probe(path)
    check(info.get('codec') == 'h264', 'H.264 video')
    check(info.get('size') == (W, H), f'resolution {W}x{H} (got {info.get("size")})')
    check(info.get('fps') == FPS, f'{FPS} fps (got {info.get("fps")})')
    check(abs(info.get('duration', 0) - DUR) <= 1.0 / FPS,
          f'duration {DUR:.3f} s (got {info.get("duration")})')
    check('aac' in info.get('audio', '').lower(), 'AAC audio track present')

    frames = decode_small(path)
    n = len(frames)
    check(n == FRAMES, f'{FRAMES} frames decoded (got {n})')
    if n < 2:
        return ok

    means = frames.mean(axis=(1, 2))
    rng = frames.max(axis=(1, 2)) - frames.min(axis=(1, 2))
    check(means.min() > 6, f'no black frames (darkest mean {means.min():.1f})')
    check(np.percentile(rng, 5) > 20,
          f'every shot has contrast (5th pct range {np.percentile(rng, 5):.0f})')
    check(means.max() < 245, f'no blown-out frames (brightest mean {means.max():.1f})')

    first = frames[0].astype(np.float32)
    last = frames[-1].astype(np.float32)
    diff = float(np.abs(first - last).mean())
    check(diff < 6.0, f'loop: first vs last frame differ by {diff:.2f}/255')

    # a rough motion check: consecutive frames should differ somewhere
    d = np.abs(np.diff(frames[::12].astype(np.float32), axis=0)).mean(axis=(1, 2))
    check(d.max() > 2.0, f'the film actually moves (max 12-frame delta {d.max():.1f})')
    return ok


if __name__ == '__main__':
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'output',
        'snooze.mp4')
    sys.exit(0 if verify(p) else 1)
