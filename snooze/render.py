"""render.py - render SNOOZE to H.264 MP4.

Frames are drawn and streamed straight into ffmpeg (no giant PNG sequence on
disk). Work is split into segments so two processes can render in parallel.

    python3 -m snooze.render --segment 0 1440 --out output/seg0.mp4
    python3 -m snooze.render --all --workers 2
    python3 -m snooze.render --still 46.5 --out output/still.png
"""

from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import numpy as np
import skia

from snooze import film
from snooze.gfx import (FPS, FRAMES, H, W, bgra_to_rgba, downsample,
                        make_paper, render_canvas_ss)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'output')
SS = 2


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'


def ffmpeg_cmd(out_path, crf=18, preset='veryfast'):
    return [ffmpeg_exe(), '-y', '-hide_banner', '-loglevel', 'error',
            '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}',
            '-r', str(FPS), '-i', '-',
            '-an', '-c:v', 'libx264', '-preset', preset, '-crf', str(crf),
            '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.2',
            '-movflags', '+faststart', out_path]


class Renderer:
    """Draws one finished frame: artwork + paper/grain finish, supersampled."""

    def __init__(self):
        from snooze.gfx import make_paper
        self.paper = make_paper(512, 7)

    def frame(self, t):
        from snooze.gfx import finish_frame
        surf, c = render_canvas_ss(SS)
        film.draw_frame(c, t)
        finish_frame(c, t, self.paper)
        small = downsample(surf, SS)          # 1080x1920, native skia order
        return bgra_to_rgba(small)            # RGBA for ffmpeg


def render_segment(i0, i1, out_path, crf=18, log_every=120, renderer=None):
    r = renderer or Renderer()
    os.makedirs(os.path.dirname(out_path) or '.', exist_ok=True)
    proc = subprocess.Popen(ffmpeg_cmd(out_path, crf), stdin=subprocess.PIPE)
    t0 = time.time()
    n = 0
    try:
        for f in range(i0, i1):
            t = (f + 0.5) / FPS      # centre of the frame's time
            arr = r.frame(t)         # RGBA
            proc.stdin.write(arr.tobytes())
            n += 1
            if log_every and n % log_every == 0:
                el = time.time() - t0
                rate = n / max(1e-6, el)
                left = (i1 - i0 - n) / max(1e-6, rate)
                print(f"  [{i0}-{i1}] {n}/{i1 - i0}  {rate:.2f} fps  "
                      f"eta {left / 60:.1f} min", flush=True)
    finally:
        if proc.stdin:
            proc.stdin.close()
        rc = proc.wait()
    print(f"segment {i0}-{i1} done in {(time.time() - t0) / 60:.1f} min (rc={rc})",
          flush=True)
    return rc


def render_still(t, out_path):
    from PIL import Image
    r = Renderer()
    arr = r.frame(t)                      # RGBA
    Image.fromarray(np.ascontiguousarray(arr[:, :, :3])).save(out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--segment', nargs=2, type=int)
    ap.add_argument('--out', default=None)
    ap.add_argument('--crf', type=int, default=18)
    ap.add_argument('--still', type=float, default=None)
    args = ap.parse_args()

    if args.still is not None:
        p = render_still(args.still, args.out or os.path.join(OUT, 'still.png'))
        print('wrote', p)
        return

    i0, i1 = args.segment if args.segment else (0, FRAMES)
    out = args.out or os.path.join(OUT, f'seg_{i0}_{i1}.mp4')
    render_segment(i0, i1, out, args.crf)


if __name__ == '__main__':
    main()
