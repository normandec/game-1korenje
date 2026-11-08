"""Render a grid contact sheet of frames for review.

    python3 -m snooze.dev.contact 25 30 36 --cols 3 --out sheet.png

Composited with PIL from the same RGBA buffers the film renderer writes, so
the colours in the sheet are exactly the colours in the film.
"""
import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from PIL import Image
from snooze.gfx import W, H, bgra_to_rgba, downsample, render_canvas_ss
from snooze import film

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'output', 'preview')


def frame_rgba(t, ss=2):
    """Finished film frame as an RGBA numpy array."""
    surf, c = render_canvas_ss(ss)
    film.draw_frame(c, t)
    return bgra_to_rgba(downsample(surf, ss))


def contact(times, cols=4, out='sheet.png', scale=0.34, ss=2):
    tw, th = int(W * scale), int(H * scale)
    pad = 6
    rows = (len(times) + cols - 1) // cols
    sheet = Image.new('RGB', ((tw + pad) * cols + pad, (th + pad) * rows + pad),
                      (22, 22, 28))
    for i, t in enumerate(times):
        im = Image.fromarray(frame_rgba(t, ss)[:, :, :3]).resize(
            (tw, th), Image.LANCZOS)
        r, cc = divmod(i, cols)
        sheet.paste(im, (pad + cc * (tw + pad), pad + r * (th + pad)))
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, out)
    sheet.save(path)
    return path


if __name__ == '__main__':
    args = sys.argv[1:]
    cols, out, sc = 4, 'sheet.png', 0.34
    if '--cols' in args:
        i = args.index('--cols'); cols = int(args[i + 1]); del args[i:i + 2]
    if '--out' in args:
        i = args.index('--out'); out = args[i + 1]; del args[i:i + 2]
    if '--scale' in args:
        i = args.index('--scale'); sc = float(args[i + 1]); del args[i:i + 2]
    print(contact([float(a) for a in args], cols, out, sc))
