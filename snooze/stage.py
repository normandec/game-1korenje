"""stage.py - camera, layer transforms and the shared opening/ending tableau.

The film is composed in a fixed 1080x1920 world. Every drawing call happens
inside a `Stage.layer(depth=...)` transform so backgrounds can slide at their
own parallax rate while the characters stay crisp and centred.
"""

from __future__ import annotations

import math
from contextlib import contextmanager

from . import palette as pal
from .characters import draw_clock, draw_cloud, draw_sun
from .gfx import (W, H, Canvas, clamp, hexa, lerp, mix, rgba, seg, seg_io,
                  smooth_noise, wobble)
from . import world as wd
from .characters import draw_bird
from .gfx import ellipse_path


class Stage:
    """Camera for one drawing."""

    def __init__(self, c: Canvas, t: float, boil: bool = True):
        self.c = c
        self.t = t
        self.pan = (0.0, 0.0)
        self.zoom = 1.0
        self.shake = (0.0, 0.0)
        self.boil = boil

    # -- camera sugar ------------------------------------------------------
    def set_cam(self, pan=(0.0, 0.0), zoom=1.0, shake=(0.0, 0.0)):
        self.pan = pan
        self.zoom = zoom
        self.shake = shake
        return self

    @contextmanager
    def layer(self, depth: float = 1.0, extra=(0.0, 0.0), boil: float = 0.0,
              rotate: float = 0.0):
        """Screen transform for a layer.

        depth 0 = pinned sky, 1 = the plane the characters live on.
        """
        c = self.c
        c.save()
        z = 1.0 + (self.zoom - 1.0) * (0.35 + 0.65 * depth)
        px = self.pan[0] * depth + self.shake[0] + extra[0]
        py = self.pan[1] * depth + self.shake[1] + extra[1]
        c.translate(W / 2 + px, H / 2 + py)
        if rotate:
            c.rotate(rotate)
        c.scale(z, z)
        c.translate(-W / 2, -H / 2)
        if boil:
            step = math.floor(self.t * 12.0) / 12.0
            c.translate(smooth_noise(step, 11) * boil,
                        smooth_noise(step, 23) * boil)
        yield c
        c.restore()

    @contextmanager
    def screen(self):
        """Pinned to the frame (flashes, vignette, overlays)."""
        c = self.c
        c.save()
        yield c
        c.restore()


# --------------------------------------------------------------------------- #
# palette helpers
# --------------------------------------------------------------------------- #
def sky_of(key, toward=None, amount=0.0):
    if toward and amount > 0:
        return pal.sky(key, min(1.0, amount), toward)
    return pal.sky(key)


# --------------------------------------------------------------------------- #
# the shared opening / closing tableau (identical art, so the film loops)
# --------------------------------------------------------------------------- #
SUN_HOME = (540.0, 1074.0)
CLOCK_HOME = (540.0, 560.0)


def tableau(c: Canvas, st: Stage, tl: float, sky_key="midnight", toward=None,
            amount=0.0, zoom=1.0, ring_at=0.55, hit_at=2.55, wake=0.0):
    """The loop tableau: snoring Sun behind the horizon, sleepy clock on its
    cloud, alarm rings, the clock snoozes itself.

    tl -> local seconds since the tableau started.
    """
    sky = sky_of(sky_key, toward, amount)
    t = st.t

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.55, glow_y=H * 0.78)
        wd.draw_stars(c, t, 0.9 * (1.0 - amount * 0.6))
        wd.draw_moon(c, 874, 292, 34, alpha=0.8)

    # far clouds
    with st.layer(0.30, extra=(0, 0)):
        wd.draw_cloud_band(c, 1330, 1300, 230, rgba(sky.cloud, 0.55), None, 0,
                           seed=21, lobes=7, drift=math.sin(t * 0.2) * 12)
        wd.draw_cloud_band(c, 470, 900, 150, rgba(sky.cloud, 0.35), None, 0,
                           seed=31, lobes=6, drift=math.cos(t * 0.17) * 10)

    # sun behind the horizon
    snore = math.sin(t * 1.05)
    breath = 0.5 + 0.5 * math.sin(t * 1.05 - 0.6)
    blanket = 0.30 + 0.10 * breath
    shiver = 0.0
    ringing = ring_at <= tl < hit_at
    if ringing:
        shiver = 0.7
    with st.layer(0.55):
        draw_sun(c, SUN_HOME[0], SUN_HOME[1] + math.sin(t * 1.05) * 5,
                 s=0.98, eyes="shut", mouth="o", mouth_amt=0.30 + 0.22 * breath,
                 rays=0.34 + 0.05 * breath, ray_wobble=t * 0.7,
                 ray_alpha=0.55, glow=0.5, blanket=blanket,
                 blanket_fill=sky.cloud, t=t)
        # snores
        wd.draw_snore_puffs(c, SUN_HOME[0] + 120, SUN_HOME[1] + 60, t, 0.85, 0.9,
                            spread=(150, 210))

    # horizon haze so the Sun is *behind* the horizon
    with st.layer(0.62):
        wd.draw_horizon_band(c, 1290, 150, [sky.horizon, sky.mid, sky.top], 0.75, 0.65)

    # the city asleep
    with st.layer(0.72):
        wd.draw_city_far(c, 1520, pal.CITY_FAR, window_alpha=0.22, t=t)
    with st.layer(0.86):
        wd.draw_city_mid(c, 1690, pal.CITY_MID, pal.INK, window_alpha=0.35, t=t)
        draw_bird(c, 236, 1502, s=0.6, awake=0.0)

    with st.layer(1.0):
        wd.draw_city_near(c, 2070, pal.CITY_NEAR, pal.INK)

    # the clock's cloud
    cloud_y = CLOCK_HOME[1] + 132 + math.sin(t * 1.05 + 0.9) * 4
    with st.layer(0.95):
        draw_cloud(c, CLOCK_HOME[0], cloud_y, 620, 230,
                   mix(sky.cloud, "#8EA0D8", 0.42), pal.INK, 5, seed=8, lobes=6)
        c.fill(ellipse_path(CLOCK_HOME[0] - 60, cloud_y - 16, 120, 22),
               rgba("#FFFFFF", 0.10))

    # ------- the clock itself ---------------------------------------------
    bob = math.sin(t * 1.05 + 0.4) * 4
    cx = CLOCK_HOME[0]
    cy = CLOCK_HOME[1] + bob

    # bell ring bursts
    if ringing:
        burst = 1.0
        shake = 3.0 * math.sin(t * 60.0)
        cx += shake
        cy += 2.0 * math.cos(t * 70.0)
    else:
        burst = 0.0

    with st.layer(1.0, boil=0.6):
        # reach for the snooze button, then slump
        arm = 0.0
        arm_ang = 0.0
        if tl < hit_at:
            reach_u = seg(tl, ring_at + 1.05, hit_at - 0.16, True, False)
            arm = 0.0 if tl < ring_at else reach_u
            arm_ang = -28.0 * arm
            # peck the button with a little overshoot
            if tl > hit_at - 0.3:
                arm = min(1.0, arm)
        eye_open = 0.0
        lid = 0.0
        # tiny twitch when the alarm fires
        if ringing:
            lid = 0.18 + 0.1 * math.sin(t * 20)
        draw_clock(c, cx, cy, s=1.02, rot=-4 + 1.5 * math.sin(t * 0.9),
                   eyes="shut" if tl < hit_at - 0.05 else "sleepy",
                   mouth="small", mouth_amt=0.4, bells=burst, t=t,
                   hand_angle=(150, 210), arm=arm, arm_angle=arm_ang,
                   arm_len=120, arm_bend=-0.55, feet="dangle", feet_phase=t * 0.3,
                   blush=1.0, lid=lid)

    # ring waves from the bells
    if tl < hit_at:
        with st.layer(1.0):
            power = seg(tl, ring_at, ring_at + 0.25) * (1.0 - seg(tl, hit_at - 0.12, hit_at))
            if power > 0.01:
                wd.draw_sound_rings(c, cx, cy + 60, t, power * 0.9, "#FFD465", 3, 1.6,
                                    6.0, 0.9, max_r=300)

    # foreground cloud wisp (kept dark and soft so it reads as depth, not rock)
    with st.layer(1.14):
        draw_cloud(c, 120, 1830, 760, 240, rgba(sky.mid, 0.95), None, 0,
                   seed=44, lobes=5)
        draw_cloud(c, 1010, 1880, 660, 200, rgba(sky.mid, 0.9), None, 0,
                   seed=52, lobes=5)

    if wake > 0:
        with st.screen():
            c.fill_path_full(rgba("#FFEAC0", wake * 0.5))

    return dict(clock=(cx, cy), sun=SUN_HOME, ringing=ringing)
