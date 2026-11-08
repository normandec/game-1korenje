"""plates.py - render one key plate per shot for the Blender project.

    python3 -m snooze.plates

Writes blender/plates/sNN_*.png (1080x1920, finished look) so
blender/build_snooze_blend.py can assemble the editable .blend.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from snooze.gfx import save_frame
from snooze.render import Renderer, ROOT
import numpy as np
from PIL import Image

# one representative, story-legible frame per shot
PLATE_TIMES = {
    's01_start': 1.2,
    's02_city': 6.2,
    's03_ring': 16.2,
    's04_dance': 26.0,
    's05_feather': 44.2,
    's06_yawn': 47.6,
    's07_recovery': 66.0,
    's08_ribbon': 80.0,
    's09_sunrise': 92.0,
    's10_morning': 104.6,
    's11_timelapse': 112.0,
    's12_loop': 119.0,
}


def main():
    out = os.path.join(ROOT, 'blender', 'plates')
    os.makedirs(out, exist_ok=True)
    r = Renderer()
    for name, t in PLATE_TIMES.items():
        arr = r.frame(t)
        p = os.path.join(out, name + '.png')
        save_frame(np.ascontiguousarray(arr[:, :, [2, 1, 0, 3]]), p)
        print('plate', name, f'{t:.1f}s', p, flush=True)


if __name__ == '__main__':
    main()
