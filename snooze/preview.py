"""preview.py - render individual frames (or a range) from the film.

    python3 -m snooze.preview 0 2.5 6.0 12.0        # seconds -> output/preview/
    python3 -m snooze.preview --shot 3 --range 20 40 # frames of one shot
"""
import sys, os, time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from snooze.gfx import W, H, FRAMES, FPS, render_canvas_ss, downsample, save_frame
from snooze import film

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   'output', 'preview')


def render_time(tsec, ss=2, path=None):
    t = tsec
    surf, c = render_canvas_ss(ss)
    film.draw_frame(c, t)
    arr = downsample(surf, ss)
    os.makedirs(OUT, exist_ok=True)
    path = path or os.path.join(OUT, f"t{tsec:07.2f}.png")
    save_frame(arr, path)      # arr is a raw skia buffer (BGRA)
    return path


if __name__ == '__main__':
    args = sys.argv[1:]
    ss = 2
    if '--ss' in args:
        i = args.index('--ss')
        ss = int(args[i + 1])
        del args[i:i + 2]
    times = [float(a) for a in args] or [0.0]
    for tt in times:
        t0 = time.time()
        p = render_time(tt, ss)
        print(f"{tt:6.2f}s  {p}  ({time.time() - t0:.2f}s)")
