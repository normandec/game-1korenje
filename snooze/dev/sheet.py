"""Quick character sheet test: proportions, colours, expressions, squash."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import skia
from snooze.gfx import (W, H, hexa, rgba, render_canvas_ss, downsample, lin_shader,
                        fill_paint, P)
from snooze import palette as pal
from snooze.characters import (draw_clock, draw_sun, draw_cloud, draw_bird,
                               draw_feather, draw_note, draw_star, draw_burst)

ss = 2
surf, c = render_canvas_ss(ss)
sky = pal.sky("latenight")
p = fill_paint(hexa(sky.top))
p.setShader(lin_shader(0, 0, 0, H, [hexa(sky.top), hexa(sky.mid), hexa(sky.horizon)],
                       [0.0, 0.45, 1.0]))
c.c.drawPaint(p)

draw_cloud(c, 540, 1880, 1500, 420, hexa(sky.cloud), hexa(pal.INK), 5, seed=5, lobes=7)
draw_sun(c, 540, 1420, s=0.62, eyes="shut", mouth="yawn", mouth_amt=0.2, rays=0.4,
         blanket=0.62, glow=0.4, blanket_fill=sky.cloud, nose_twitch=0.4)
c.circle(880, 1420, 30, rgba(pal.SUN_CHEEK, 0.4), None)

draw_clock(c, 540, 520, s=0.92, eyes="open", look=(0.3, 0.05), mouth="smile",
           bells=0.0, feet="walk", feet_phase=0.2)
draw_clock(c, 160, 300, s=0.30, eyes="star", mouth="grin", bells=1.0, t=0.3, feet="jump")
draw_clock(c, 900, 300, s=0.30, eyes="squeeze", mouth="flat", bells=1.0, t=0.5,
           sweat=1.0, feet="stand")
draw_clock(c, 160, 900, s=0.28, eyes="shut", mouth="small", bell_side=1.0, t=0.2,
           feet="flat", sx=1.1, sy=0.9)
draw_clock(c, 900, 900, s=0.28, eyes="spiral", mouth="wobble", stars=1.0, t=1.0)
draw_clock(c, 540, 250, s=0.30, eyes="happy", mouth="grin", arm=1.0, arm_angle=0,
           hand_angle=(0, 120), feet="stand", blush=1.0)

draw_bird(c, 200, 1180, s=0.9, awake=0.0)
draw_bird(c, 880, 1180, s=0.9, awake=1.0, flap=14)
draw_feather(c, 300, 1020, s=0.9, rot=35)
draw_note(c, 760, 640, 1.3, 12)
draw_star(c, 620, 640, 16, rot=0.3)
draw_burst(c, 540, 520, 100, 160, 10, "#FFFFFF", 0.55, 5, rot=0.2)

arr = downsample(surf, ss)
from snooze.gfx import save_frame
save_frame(arr, 
    '/home/user/game-1korenje/output/_sheet.png')
print("ok", arr.shape)
