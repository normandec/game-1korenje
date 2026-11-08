"""Render a grid contact sheet of frames for review.

    python3 -m snooze.dev.contact 25 30 36 --cols 3 --out sheet.png
"""
import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import skia
import numpy as np
from snooze.gfx import W, H, render_canvas_ss, downsample
from snooze import film

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'output', 'preview')


def frame_arr(t, ss=2):
    surf, c = render_canvas_ss(ss)
    film.draw_frame(c, t)
    return downsample(surf, ss)


def contact(times, cols=4, out='sheet.png', scale=0.34, ss=2, label=True):
    arrs = [(t, frame_arr(t, ss)) for t in times]
    th, tw = arrs[0][1].shape[:2]
    tw2, th2 = int(tw * scale), int(th * scale)
    rows = (len(arrs) + cols - 1) // cols
    pad = 6
    canvas = np.full(((th2 + pad) * rows + pad, (tw2 + pad) * cols + pad, 4), 24, np.uint8)
    canvas[:, :, 3] = 255
    for i, (t, a) in enumerate(arrs):
        img = skia.Image.fromarray(a, colorType=skia.kRGBA_8888_ColorType)
        small = img.resize(tw2, th2, skia.SamplingOptions(skia.FilterMode.kLinear))
        b = small.toarray()
        r, cc = divmod(i, cols)
        y0 = pad + r * (th2 + pad)
        x0 = pad + cc * (tw2 + pad)
        canvas[y0:y0 + th2, x0:x0 + tw2] = b
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, out)
    skia.Image.fromarray(np.ascontiguousarray(canvas), colorType=skia.kRGBA_8888_ColorType).save(path)
    return path


if __name__ == '__main__':
    args = sys.argv[1:]
    cols, out = 4, 'sheet.png'
    if '--cols' in args:
        i = args.index('--cols'); cols = int(args[i + 1]); del args[i:i + 2]
    if '--out' in args:
        i = args.index('--out'); out = args[i + 1]; del args[i:i + 2]
    if '--scale' in args:
        i = args.index('--scale'); sc = float(args[i + 1]); del args[i:i + 2]
    else:
        sc = 0.34
    times = [float(a) for a in args]
    print(contact(times, cols, out, sc))
