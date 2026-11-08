"""film.py - SNOOZE, a two minute 2D animated cartoon.

    draw_frame(canvas, t)   with t in seconds, 0.0 .. 119.958

Everything is a pure function of time: no state, so frames can be rendered in
any order, in parallel, and re-rendered deterministically.

Story beats (exact, per the brief):
   0:00-0:04  the joke      snooze hits itself
   0:04-0:12  morning late  city, bird, window, realisation
   0:12-0:23  attempt 1     ring louder, blanket bounce
   0:23-0:34  attempt 2     wake-up dance, birds bop
   0:34-0:46  attempt 3     the feather tickle
   0:46-0:59  giant yawn    blown away, saved by a cloud thread
   0:59-1:10  recovery      dizzy, dawn colour, the idea
   1:10-1:25  clever plan   the ribbon paints the dawn
   1:25-1:37  the Sun wakes sunrise, the bow
   1:37-1:47  morning       montage, thank-you beam, nod off
   1:47-1:56  day races by  time lapse
   1:56-2:00  loop          back to the opening tableau
"""

from __future__ import annotations

import math

import skia

from . import palette as pal
from . import world as wd
from .characters import (draw_bird, draw_burst, draw_clock, draw_cloud, draw_feather,
                         draw_note, draw_star, draw_sun, star_path, blanket_path)
from .gfx import (H, W, Canvas, clamp, ease_out_back, ellipse_path, hexa, lerp,
                  mix, pulse, rgba, seg, seg_io, sine, smooth_noise, wobble)
from .stage import CLOCK_HOME, SUN_HOME, Stage, tableau

FPS = 24
TOTAL = 120.0

# --------------------------------------------------------------------------- #
# shot table (seconds)
# --------------------------------------------------------------------------- #
SHOTS = [
    ("s01_joke",          0.0,   4.0),
    ("s02_morning_late",  4.0,  12.0),
    ("s03_attempt_ring", 12.0,  23.0),
    ("s04_dance",        23.0,  34.0),
    ("s05_feather",      34.0,  46.0),
    ("s06_yawn",         46.0,  59.0),
    ("s07_recovery",     59.0,  70.0),
    ("s08_plan",         70.0,  85.0),
    ("s09_sunrise",      85.0,  97.0),
    ("s10_morning",      97.0, 107.0),
    ("s11_timelapse",   107.0, 116.0),
    ("s12_loop",        116.0, 120.0),
]

# shared geography used by several shots
SUN_BED = (540.0, 1080.0)
BAND_Y = 1005.0                # where the painted dawn band sits in the sky     # where the Sun sleeps during attempts 1-3
HORIZON_Y = 1280.0            # where the sun hides behind the city in wide shots
CLOUD_TOP_Y = 1215.0          # the rim of the clock's cloud


# --------------------------------------------------------------------------- #
# entry point
# --------------------------------------------------------------------------- #
def draw_frame(c: Canvas, t: float):
    t = max(0.0, min(TOTAL - 1e-6, t))
    for name, t0, t1 in SHOTS:
        if t0 <= t < t1 or (t1 >= TOTAL and t >= t0):
            fn = globals()[name]
            fn(c, t, t - t0, t1 - t0)
            return
    globals()[SHOTS[-1][0]](c, t, t - SHOTS[-1][1], SHOTS[-1][2] - SHOTS[-1][1])


# --------------------------------------------------------------------------- #
# 0:00 - 0:04  the joke
# --------------------------------------------------------------------------- #
def s01_joke(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    st.zoom = 1.0 + 0.05 * seg(lt, 0.0, dur)
    st.pan = (0.0, 10.0 * seg(lt, 0, dur))
    tableau(c, st, lt, sky_key="midnight", zoom=st.zoom,
            ring_at=0.42, hit_at=2.42)


# --------------------------------------------------------------------------- #
# 0:04 - 0:12  morning is late
# --------------------------------------------------------------------------- #
def s02_morning_late(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    u = seg_io(lt, 0.0, dur)
    # start tight on the clock, pull back to the dark city
    st.zoom = lerp(1.30, 1.0, seg_io(lt, 0.0, 2.6))
    st.pan = (lerp(-40, 0, seg_io(lt, 0.0, 2.6)), lerp(120, 0, seg_io(lt, 0.0, 2.6)))
    sky = pal.sky("midnight", 0.35, "latenight")

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.5, glow_y=H * 0.80)
        wd.draw_stars(c, t, 0.85)

    with st.layer(0.30):
        wd.draw_cloud_band(c, 1180, 1400, 240, rgba(sky.cloud, 0.5), None, 0,
                           seed=61, lobes=7, drift=math.sin(t * 0.2) * 14)

    # sleeping Sun, hidden lower and further back
    with st.layer(0.55):
        breath = 0.5 + 0.5 * math.sin(t * 1.05 - 0.6)
        draw_sun(c, 540, 1300, s=0.70, eyes="shut", mouth="o",
                 mouth_amt=0.28 + 0.2 * breath, rays=0.30, ray_alpha=0.5, glow=0.4,
                 blanket=0.38, blanket_fill=sky.cloud, t=t)
        wd.draw_snore_puffs(c, 690, 1300, t, 0.6, 0.8, spread=(140, 190))

    with st.layer(0.62):
        wd.draw_horizon_band(c, 1440, 180, [sky.horizon, sky.mid, sky.top], 0.9, 0.6)

    # ---- the city --------------------------------------------------------
    with st.layer(0.74):
        wd.draw_city_far(c, 1620, pal.CITY_FAR, window_alpha=0.2, t=t)
    with st.layer(0.88):
        wd.draw_city_mid(c, 1700, pal.CITY_MID, pal.INK, window_alpha=0.3, t=t)
    with st.layer(1.0):
        wd.draw_city_near(c, 1930, pal.CITY_NEAR, pal.INK, warm=0.0)

    # the sleeping bird on the near roof
    with st.layer(1.0, boil=0.5):
        bob = math.sin(t * 1.1) * 3
        draw_bird(c, 236, 1495, s=0.95, awake=0.0, bob=bob * 0.2)

    # ---- one window opens, peeks, closes (4.6 .. 8.6) --------------------
    win_open = seg(lt, 1.5, 2.2) * (1 - seg(lt, 3.5, 4.2))
    with st.layer(1.0):
        _window_gag(c, 790, 1600, 130, 150, win_open, lt)

    # ---- the clock wakes (6.4 .. 9.6) ------------------------------------
    with st.layer(1.0, boil=0.5):
        cy = CLOCK_HOME[1] + 300 + math.sin(t * 1.05 + 0.4) * 4
        draw_cloud(c, CLOCK_HOME[0], cy + 132, 520, 200, sky.cloud, pal.INK, 5,
                   seed=8, lobes=6)
        snap = seg(lt, 2.05, 2.28, True, False)
        look = (lerp(0.0, 0.55, seg(lt, 2.3, 2.9)), lerp(0.0, 0.35, seg(lt, 2.3, 2.9)))
        eyes = "shut" if lt < 2.05 else ("wide" if lt < 2.9 else "open")
        open_amt = 0.0 if lt < 2.05 else (1.32 if lt < 2.9 else 1.0)
        # points at the sun, at its bells, then at the city
        arm_u, arm_ang, look_x = 0.0, 0.0, look
        if 3.2 < lt < 4.4:
            arm_u = seg(lt, 3.2, 3.6) * (1 - seg(lt, 4.0, 4.4))
            arm_ang = 118.0
            look_x = (-0.2, 0.55)
        elif 4.4 <= lt < 5.6:
            arm_u = seg(lt, 4.4, 4.8) * (1 - seg(lt, 5.2, 5.6))
            arm_ang = -46.0
            look_x = (0.0, 0.9)
        elif 5.6 <= lt < 6.8:
            arm_u = seg(lt, 5.6, 6.0) * (1 - seg(lt, 6.4, 6.8))
            arm_ang = 160.0
            look_x = (0.2, -0.7)
        squash = 1.0 + 0.22 * pulse(lt, 2.2, 0.25) - 0.1 * pulse(lt, 2.5, 0.3)
        draw_clock(c, CLOCK_HOME[0], cy, s=0.86, rot=-3 + 2 * math.sin(t * 1.2),
                   eyes=eyes if lt >= 2.05 else "shut",
                   eye_open=open_amt, look=look_x, mouth="small" if lt < 2.4 else
                   ("o" if lt < 7.2 else "flat"), mouth_amt=0.5,
                   bells=0.0, t=t, hand_angle=(150, 210), feet="dangle",
                   feet_phase=t * 0.3, arm=arm_u, arm_angle=0, arm_len=130,
                   arm_bend=-0.5, sy=squash, sx=1 / squash ** 0.5)

    with st.layer(1.16):
        draw_cloud(c, 110, 1840, 700, 220, rgba(sky.cloud, 0.95), None, 0, seed=71,
                   lobes=5)


def _window_gag(c: Canvas, x, y, w, h, open_amt, lt, greeting=False):
    """A city window.

    Default: someone peeks out, sees it is still dark, and closes up again.
    greeting=True: the shutters open on a bright morning and a happy face
    leans out (used in the morning montage).
    """
    ink = hexa(pal.INK)
    frame = skia.Path()
    frame.addRRect(skia.RRect.MakeRectXY(
        skia.Rect.MakeXYWH(x - w / 2, y - h / 2, w, h), w * 0.1, w * 0.1))
    c.shape(frame, hexa("#232C5C"), ink, 5)
    inner = skia.Path()
    inner.addRRect(skia.RRect.MakeRectXY(
        skia.Rect.MakeXYWH(x - w / 2 + 12, y - h / 2 + 12, w - 24, h - 24),
        w * 0.08, w * 0.08))
    c.save()
    c.clip(inner)
    c.fill(inner, hexa("#0B1030"))
    if greeting:
        c.fill(inner, rgba("#FFDFA0", 1.0))
    if open_amt > 0.03:
        # warm sliver of room light + a peeking silhouette
        c.fill(ellipse_path(x, y + h * 0.1, w * 0.75, h * 0.7),
               rgba("#FFC46B", 0.28 * open_amt))
        hx = x + w * 0.02
        hy = y + h * 0.06 + (1 - open_amt) * 30
        c.circle(hx, hy, w * 0.24, rgba("#150C2A", 0.95), None)
        # tangled bed hair
        for i in range(4):
            c.line(hx + math.cos(i * 1.7) * w * 0.16, hy + w * 0.2,
                   hx + math.cos(i * 1.7) * w * 0.3, hy + w * 0.34,
                   rgba("#150C2A", 0.95), 6)
        c.save()
        c.clip(ellipse_path(hx, hy, w * 0.24, w * 0.24))
        if greeting:
            # a sunny room with a little plant on the sill
            c.fill(ellipse_path(x, y - h * 0.2, w * 0.6, h * 0.5),
                   rgba("#FFF0C8", 0.9))
            pot_x = x + w * 0.18
            c.fill(skia.Path().addRRect(skia.RRect.MakeRectXY(
                skia.Rect.MakeXYWH(pot_x - w * 0.09, y + h * 0.16, w * 0.18, h * 0.16),
                3, 3)), hexa("#C97A5A"))
            for k in (-1, 0, 1):
                c.stroke(ellipse_path(pot_x + k * w * 0.06, y + h * 0.10,
                                      w * 0.05, h * 0.09),
                         hexa("#4E9A5A"), w * 0.035)
        else:
            # the eye that sees the dark
            c.fill(ellipse_path(hx + w * 0.11, hy + w * 0.01, w * 0.055, w * 0.045),
                   hexa("#FFE7B4"))
            c.fill(ellipse_path(hx + w * 0.13, hy + w * 0.01, w * 0.022, w * 0.032),
                   hexa("#2C1B3A"))
        c.restore()
    c.restore()
    # curtains (two panels)
    for sgn in (-1, 1):
        pw = (w - 24) * (0.52 - 0.5 * open_amt)
        px = x + sgn * ((w - 24) / 2 - pw / 2)
        c.save()
        c.translate(px, y)
        cur = skia.Path()
        cur.addRRect(skia.RRect.MakeRectXY(
            skia.Rect.MakeXYWH(-pw / 2, -(h - 24) / 2, pw, h - 24), pw * 0.3, pw * 0.3))
        c.shape(cur, hexa("#6B62A2"), ink, 4)
        for k in (-0.28, 0.0, 0.28):
            c.line(k * pw, -(h - 26) / 2, k * pw, (h - 26) / 2, rgba("#2C1B3A", 0.22), 2.2)
        c.restore()
    c.line(x, y - h * 0.12, x, y + h * 0.42, rgba("#2C1B3A", 0.0), 1)


# --------------------------------------------------------------------------- #
# 0:12 - 0:23  attempt one: ring louder
# --------------------------------------------------------------------------- #
def s03_attempt_ring(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    sky = pal.sky("midnight", 0.18, "latenight")

    # camera: medium on the Sun's cloud bed, small pushes on each ring
    push = 0.0
    push += 0.05 * pulse(lt, 2.3, 1.3)
    push += 0.09 * pulse(lt, 5.6, 1.6)
    push += 0.12 * pulse(lt, 8.2, 1.4)
    st.zoom = 1.06 + push
    st.pan = (0.0, -10 + 14 * seg_io(lt, 0, dur))
    rattle = 0.0
    if 5.2 < lt < 6.9 or 7.6 < lt < 9.2:
        rattle = 1.0
    st.shake = (math.sin(t * 63) * 3.0 * rattle, math.cos(t * 71) * 2.4 * rattle)

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.45, glow_y=H * 0.86)
        wd.draw_stars(c, t, 0.75)

    with st.layer(0.26):
        wd.draw_cloud_band(c, 250, 900, 190, rgba(sky.cloud, 0.34), None, 0,
                           seed=81, lobes=6, drift=math.sin(t * 0.2) * 16, x=300)
        wd.draw_cloud_band(c, 430, 700, 150, rgba(sky.cloud, 0.26), None, 0,
                           seed=82, lobes=5, drift=math.cos(t * 0.24) * 14, x=850)

    # ---- the Sun's cloud bed --------------------------------------------
    bed_y = 1330.0
    with st.layer(0.6):
        c.save()
        c.translate(0, math.sin(t * 1.05) * 6)
        draw_cloud(c, 540, bed_y + 250, 1300, 420, mix2(sky.cloud), pal.INK, 6,
                   seed=17, lobes=7)
        c.restore()

    # ---- the Sun ---------------------------------------------------------
    su = lambda a, b, **kw: seg(lt, a, b, **kw)
    roll = 0.0
    pull = 0.0
    puff = 0.0
    bounce = 0.0
    # beats
    # 0.4-1.4 clock arrives and taps the sun
    # 2.2 ring; 3.2 sun rolls over; 4.2 pulls blanket; 5.2 clock rings harder;
    # 6.0 blanket puffs and bounces the clock; 7.6 ring again; 8.4 snores in rhythm
    roll = 14.0 * su(3.1, 4.0)
    pull = 0.92 * su(4.1, 5.0)
    puff = su(5.9, 6.4)
    breath = 0.5 + 0.5 * math.sin(t * 1.6)
    snore_rhythm = 0.0
    if lt > 8.3:
        snore_rhythm = 0.5 + 0.5 * math.sin((lt - 8.3) * 9.0)
    with st.layer(0.92, boil=0.6):
        sx = 1.0 + 0.05 * puff
        sy = 1.0 - 0.04 * puff
        draw_sun(c, 540 + 26 * roll / 14.0, SUN_BED[1] - 6 * pull + 8 * snore_rhythm,
                 s=1.0, rot=roll, eyes="shut", look=(0, 0),
                 mouth="o", mouth_amt=0.22 + 0.3 * snore_rhythm,
                 rays=0.45, ray_wobble=t, ray_alpha=0.6, glow=0.3,
                 blanket=0.16 + 0.78 * pull, blanket_fill=sky.cloud,
                 sx=sx, sy=sy, t=t, cheeks=0.9)

    # ---- the clock -------------------------------------------------------
    cx, cy = _clock_path_attempt1(lt, t)
    ring = 0.0
    if 1.9 < lt < 3.2:
        ring = 0.75
    elif 5.2 < lt < 6.0:
        ring = 1.0
    elif 7.5 < lt < 9.2:
        ring = 1.25
    airborne = 6.0 < lt < 6.9
    dizzy = 6.9 < lt < 8.0
    squash = 1.0
    sy_ = 1.0
    if airborne:
        squash = 1.0 + 0.16 * math.sin((lt - 6.0) * 9.0)
    if dizzy:
        squash = 1.0 - 0.08 * math.sin((lt - 6.9) * 7.0)
    rot = 0.0
    if lt > 6.0:
        rot = -360 * su(6.0, 6.9) * 0.5
    eyes = "open" if lt < 0.7 else ("wide" if lt < 1.2 else "open")
    if 3.2 <= lt < 5.2:
        eyes = "open"
    if 5.2 <= lt < 6.0:
        eyes = "star"
    if dizzy:
        eyes = "spiral"
    mouth = "grin" if 1.9 < lt < 5.0 else "o"
    if dizzy:
        mouth = "wobble"
    if lt > 9.4:
        mouth = "flat"

    with st.layer(1.0, boil=0.6):
        draw_clock(c, cx, cy, s=0.80, rot=rot, eyes=eyes, mouth=mouth,
                   mouth_amt=0.7, bells=ring, t=t, hand_angle=(150, 210),
                   feet="jump" if not airborne else "dangle",
                   feet_phase=t * 2.0, stars=1.0 if dizzy else 0.0,
                   sweat=0.0, sy=squash, sx=1 / squash ** 0.45,
                   arm=0.7 if 7.5 < lt < 9.2 else 0.0, arm_len=120, arm_bend=0.5)

    # ring waves + notes
    if ring > 0:
        with st.layer(1.0):
            wd.draw_sound_rings(c, cx, cy - 60, t, ring * 0.85, "#FFD465", 3, 1.7,
                                6.5, 0.85, max_r=340)
    if lt > 8.3:
        with st.layer(1.0):
            for i in range(3):
                u = ((lt * 0.8 + i / 3) % 1.0)
                draw_note(c, 700 + i * 60 + u * 30, SUN_BED[1] - 200 - u * 220,
                          1.1 + i * 0.2, math.sin(u * 6) * 12, alpha=math.sin(u * math.pi) * 0.9)

    with st.layer(1.18):
        draw_cloud(c, 60, 1900, 760, 250, rgba(mix2(sky.cloud), 0.95), None, 0,
                   seed=101, lobes=5)
        draw_cloud(c, 1010, 1950, 640, 220, rgba(mix2(sky.cloud), 0.95), None, 0,
                   seed=102, lobes=5)

    # blanket puff rings at the bounce
    if 5.95 < lt < 7.2:
        with st.layer(0.92):
            u = seg(lt, 5.95, 7.2, False, True)
            c.stroke(ellipse_path(540, SUN_BED[1] + 120, 300 + u * 420, 90 + u * 150),
                     rgba("#BFCBF0", (1 - u) * 0.7), 8)




def mix2(c):
    """Slightly lifted cloud colour so cloud furniture separates from the sky."""
    return mix(c, "#8EA0D8", 0.42)


def _clock_path_attempt1(lt, t):
    """Where the clock is during attempt one."""
    x, y = 300.0, 900.0
    # run to the Sun's ear
    if lt < 1.6:
        u = seg(lt, 0.0, 1.6)
        x = lerp(180, 330, u)
        y = lerp(760, 985, u) + math.sin(u * math.pi) * -40
    elif lt < 2.0:
        x, y = 330, 985
    else:
        x, y = 330, 985
    # recoil back a touch while ringing
    if 1.9 < lt < 3.2:
        x = 330 - 6 * math.sin(lt * 40)
    # jump back in surprise when the Sun rolls over
    if 3.1 <= lt < 4.1:
        u = seg(lt, 3.1, 4.1)
        x = lerp(330, 300, u)
        y = 985 - math.sin(u * math.pi) * 90
    # hop up next to the blanket
    if 4.1 <= lt < 5.2:
        u = seg(lt, 4.1, 5.2)
        x = lerp(300, 250, u)
        y = 985 - math.sin(u * math.pi) * 60
    # ring right at the blanket
    if 5.2 <= lt < 6.0:
        x, y = 250, 930 + 5 * math.sin(lt * 40)
    # the blanket puffs and bounces the clock backwards
    if 6.0 <= lt < 6.9:
        u = seg(lt, 6.0, 6.9, False, False)
        x = lerp(250, 120, u)
        y = 930 - math.sin(u * math.pi) * 230 + u * 140
    # lands on its feet
    if 6.9 <= lt < 7.6:
        u = seg(lt, 6.9, 7.6, False, True)
        x = lerp(120, 250, u)
        y = lerp(1070, 900, u)
    if lt >= 7.6:
        x, y = 250, 900 + 6 * math.sin(lt * 30)
    return x, y


# --------------------------------------------------------------------------- #
# 0:23 - 0:34  attempt two: the wake-up dance
# --------------------------------------------------------------------------- #
def s04_dance(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    sky = pal.sky("midnight", 0.22, "latenight")
    beat = 2.1  # beats per second
    bph = (lt * beat) % 1.0
    st.zoom = 1.05 + 0.03 * math.sin(lt * 4.0)
    st.pan = (0.0, 0.0)

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.45, glow_y=H * 0.9)
        wd.draw_stars(c, t, 0.7)

    with st.layer(0.26):
        wd.draw_cloud_band(c, 480, 1300, 250, rgba(sky.cloud, 0.4), None, 0, seed=111,
                           lobes=7, drift=math.sin(t * 0.3) * 18)

    # sun bed
    with st.layer(0.6):
        draw_cloud(c, 540, 1560, 1100, 340, sky.cloud, pal.INK, 6, seed=17, lobes=7)
    # the Sun, smiling in its sleep
    with st.layer(0.92, boil=0.6):
        breath = 0.5 + 0.5 * math.sin(t * 1.4)
        smile = seg(lt, 3.4, 4.6)
        eyes = "shut" if lt < 4.6 else "happy"
        mouth = "o" if lt < 3.4 else ("grin" if lt < 5.0 else "smile")
        draw_sun(c, 690, 1130, s=0.96, rot=3.0, eyes=eyes, mouth=mouth,
                 mouth_amt=0.25 + 0.2 * breath, rays=0.5,
                 ray_wobble=t * 3.4, ray_alpha=0.6, glow=0.35,
                 blanket=0.30 + 0.08 * breath, blanket_fill=sky.cloud, t=t,
                 cheeks=1.0)

    # birds bobbing in their sleep along the roofline
    bopping = seg(lt, 4.5, 6.0)
    with st.layer(0.96):
        for i, (bx, by, sc) in enumerate(((150, 1428, 0.72), (900, 1420, 0.68),
                                          (330, 1400, 0.52), (1010, 1436, 0.5))):
            bph2 = (lt * beat + i * 0.17) % 1.0
            bob = math.sin(bph2 * math.tau) * 9 * bopping
            draw_bird(c, bx, by + bob, s=sc, awake=0.0, bob=bob * 0.06,
                      color="#6F86C4")

    # ---- the clock's dance ----------------------------------------------
    dx, dy, rot, sy, feet, phase, arm = _dance_pose(lt)
    ring = 0.35 + 0.25 * math.sin(lt * 13.2)
    eyes = "open"
    mouth = "grin"
    if lt > 8.4:      # stops, pants, offended
        eyes = "squeeze"
        mouth = "flat" if lt < 9.2 else "pant"
    with st.layer(1.0, boil=0.6):
        draw_clock(c, dx, dy, s=0.82, rot=rot, eyes=eyes, look=(0.15, 0.35),
                   mouth=mouth, mouth_amt=0.75, bells=ring, t=t,
                   hand_angle=(30, 200), feet=feet, feet_phase=phase,
                   arm=arm, arm_bend=0.5 + 0.4 * math.sin(lt * 5.0), arm_len=120,
                   sy=sy, sx=1 / sy ** 0.5, blush=1.0,
                   sweat=1.0 if lt > 8.6 else 0.0)
    with st.layer(1.0):
        wd.draw_sound_rings(c, dx, dy + 50, t, 0.35 * ring, "#FFD465", 2, 2.4, 5.0,
                            0.6, max_r=220)
        if lt > 4.5:
            for i in range(4):
                u = ((lt * 0.9 + i / 4) % 1.0)
                draw_note(c, dx + (i - 1.5) * 70 + math.sin(u * 7) * 22,
                          dy - 180 - u * 260, 1.0 + (i % 2) * 0.25,
                          math.sin(u * 5 + i) * 18, alpha=math.sin(u * math.pi) * 0.85)

    with st.layer(1.2):
        draw_cloud(c, 100, 1870, 780, 240, rgba(sky.cloud, 0.9), None, 0, seed=121, lobes=5)


def _dance_pose(lt):
    """March, jump, spin, wave. Returns (x, y, rot, squash, feet, phase, arm)."""
    x, y = 300.0, 1130.0
    beat = 2.1
    phase = (lt * beat) % 1.0
    rot = -4.0
    sy = 1.0
    feet = "walk"
    arm = 0.55

    # 0.0-2.4 march
    if lt < 2.4:
        y = 1120 - abs(math.sin(phase * math.pi)) * 18
        rot = -4 + math.sin(phase * math.tau) * 5
        feet = "walk"
        arm = 0.5 + 0.25 * math.sin(phase * math.tau)
    # 2.4-4.6 jumping
    elif lt < 4.6:
        u = (lt - 2.4) / 2.2
        j = abs(math.sin(u * math.pi * 5))
        y = 1120 - j * 120
        sy = 1.0 + 0.14 * (1 - j) - 0.06 * j
        rot = -4 + math.sin(u * math.pi * 10) * 8
        feet = "jump"
        arm = 0.7
    # 4.6-6.8 spin
    elif lt < 6.8:
        u = (lt - 4.6) / 2.2
        x = 300 + math.sin(u * math.pi * 4) * 70
        y = 1120 - abs(math.sin(u * math.pi * 8)) * 40
        rot = -4 + u * 720
        feet = "walk"
        arm = 0.9
    # 6.8-8.4 wave the clock hands
    elif lt < 8.4:
        u = (lt - 6.8) / 1.6
        y = 1120 - abs(math.sin(u * math.pi * 6)) * 26
        rot = -4 + math.sin(u * math.pi * 12) * 10
        arm = 1.0
        feet = "walk"
    else:
        u = seg(lt, 8.4, 9.4, False, True)
        y = 1120 - 30 * (1 - u)
        rot = lerp(-4, -2, u)
        feet = "stand"
        arm = lerp(0.7, 0.0, u)
        sy = lerp(1.0, 0.92, u) if lt < 9.4 else 0.92 + 0.02 * math.sin(lt * 8)
    return x, y, rot, sy, feet, phase, arm


# --------------------------------------------------------------------------- #
# 0:34 - 0:46  attempt three: the feather
# --------------------------------------------------------------------------- #
def s05_feather(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    sky = pal.sky("latenight", 0.25, "preglow")
    st.zoom = 1.12 + 0.05 * seg(lt, 4.5, 7.0) - 0.02 * seg(lt, 10.0, 12.0)
    st.pan = (0.0, -20 + 30 * seg(lt, 10.0, 12.0))

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.5, glow_y=H * 0.95)
        wd.draw_stars(c, t, 0.55)

    with st.layer(0.26):
        wd.draw_cloud_band(c, 430, 1200, 230, rgba(sky.cloud, 0.35), None, 0, seed=131,
                           lobes=7, drift=math.sin(t * 0.25) * 14)

    with st.layer(0.6):
        draw_cloud(c, 560, 1600, 1120, 360, sky.cloud, pal.INK, 6, seed=17, lobes=7)

    # The Sun: relaxed, then a huge inhale
    twitch = 0.0
    if 5.2 < lt < 6.6 or 7.4 < lt < 8.0:
        twitch = 1.0
    inhale = seg(lt, 8.0, 9.4)
    danger = seg(lt, 9.4, 10.4)
    sxs = 1.0 - 0.05 * inhale
    sys = 1.0 + 0.10 * inhale
    with st.layer(0.92, boil=0.6):
        draw_sun(c, 640, 1180, s=1.0, eyes="shut", mouth="o",
                 mouth_amt=0.10 + 0.45 * inhale, rays=0.55 + 0.1 * inhale,
                 ray_wobble=t * 1.6, ray_alpha=0.6, glow=0.35,
                 blanket=0.22, blanket_fill=sky.cloud,
                 nostril=0.3 * twitch + 1.1 * danger, nose_twitch=twitch + inhale,
                 sx=sxs, sy=sys, t=t, cheeks=0.8)

    # the feather
    fx, fy, frot = _feather_pose(lt, t)
    with st.layer(1.02, boil=0.5):
        draw_feather(c, fx, fy, s=1.15, rot=frot, wave=math.sin(t * 2.2))
    # sparkles while it tickles
    if twitch > 0:
        with st.layer(1.02):
            for i in range(3):
                a = t * 2.4 + i * 2.1
                draw_star(c, fx + math.cos(a) * 34, fy + math.sin(a) * 34, 9,
                          "#FFF2B0", 0.9, rot=a)

    # the clock sneaks in, then backs away
    cx, cy, back = _clock_pose_feather(lt)
    eyes = "open"
    if back > 0.35:
        eyes = "wide"
    mouth = "smile" if back < 0.3 else "o"
    with st.layer(1.0, boil=0.6):
        draw_clock(c, cx, cy, s=0.68, rot=-6 + 3 * math.sin(t * 1.3), eyes=eyes,
                   look=(0.55 if back < 0.3 else -0.6, 0.2),
                   mouth=mouth, mouth_amt=0.8, bells=0.12, t=t,
                   hand_angle=(150, 210), feet="walk", feet_phase=lt * 1.6,
                   arm=0.9 if back < 0.35 else 0.3, arm_len=120,
                   arm_bend=-0.3 if back < 0.35 else 0.6,
                   sweat=back,
                   sx=1 + 0.06 * seg(lt, 8.6, 9.6) * (1 - seg(lt, 10.0, 10.6)))

    # anticipation lines when the Sun inhales
    if inhale > 0.05:
        with st.layer(1.0):
            for i in range(6):
                a = -0.9 + i * 0.36
                rr = 300 - 60 * inhale
                c.line(600 + math.cos(a) * rr, 1180 + math.sin(a) * rr * 0.8,
                       600 + math.cos(a) * (rr + 60), 1180 + math.sin(a) * (rr + 60) * 0.8,
                       rgba("#DCE4FF", 0.35 * inhale), 5)

    with st.layer(1.2):
        draw_cloud(c, 60, 1880, 780, 250, rgba(sky.cloud, 0.9), None, 0, seed=141, lobes=5)


def _feather_pose(lt, t):
    """Feather drifting, then held by the clock, then stuck to the nose."""
    # drifts in 0.6-3.4, gets grabbed (held by the clock) 3.4-4.6, tickles 4.6-8.0,
    # then sticks to the nose
    if lt < 3.4:
        u = seg(lt, 0.4, 3.4, False, False)
        x = lerp(880, 560, u) + math.sin(u * 6.0) * 34
        y = lerp(360, 1130, u)
        rot = 40 + math.sin(t * 1.6) * 40
    elif lt < 8.2:
        # follows the clock's hand, right at the Sun's nose
        x = 588 + math.sin(t * 4.2) * 22
        y = 1178 + 6 * math.sin(t * 5.6)
        rot = 62 + math.sin(t * 3.0) * 16
    else:
        u = seg(lt, 8.2, 9.6)
        x = lerp(588, 640, u)
        y = lerp(1178, 1150, u)
        rot = lerp(62, 96, u)
    return x, y, rot


def _clock_pose_feather(lt):
    """Clock creeps in from the left, then backs off in fear."""
    if lt < 2.6:
        u = seg(lt, 0.4, 2.6)
        x = lerp(175, 310, u)
        y = lerp(1330, 1230, u)
        back = 0.0
    elif lt < 8.0:
        x = 300 + math.sin(lt * 2.0) * 8
        y = 1230
        back = 0.0
    elif lt < 9.6:
        u = seg(lt, 8.0, 9.6)
        x = lerp(300, 260, u)
        y = 1230
        back = 0.4 * u
    else:
        u = seg(lt, 9.6, 11.6, False, True)
        x = lerp(260, 110, u)
        y = lerp(1230, 1310, u)
        back = 0.4 + 0.6 * u
    return x, y, back


# --------------------------------------------------------------------------- #
# 0:46 - 0:59  the giant yawn
# --------------------------------------------------------------------------- #
def s06_yawn(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    sky = pal.sky("preglow", 0.4, "dawnfaint")

    yawn = seg(lt, 0.0, 1.3)
    blast = seg(lt, 1.2, 2.0)
    shake = 6.0 * pulse(lt, 1.7, 0.5)
    st.shake = (math.sin(t * 55) * shake, math.cos(t * 61) * shake * 0.7)
    st.zoom = 1.08 - 0.10 * seg(lt, 1.2, 3.0)
    st.pan = (0.0, 60 * seg(lt, 1.4, 4.0))

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.55, glow_y=H * 0.75)
        wd.draw_stars(c, t, 0.4)

    with st.layer(0.28):
        wd.draw_cloud_band(c, 420, 1300, 250, rgba(sky.cloud, 0.4), None, 0, seed=151,
                           lobes=7)

    # Sun (upper part of the frame)
    with st.layer(0.9, boil=0.6):
        draw_sun(c, 520, 760, s=1.0, eyes="squeeze" if yawn > 0.2 else "shut",
                 mouth="yawn", mouth_amt=yawn, rays=0.6, ray_wobble=t * 2.0,
                 ray_alpha=0.65, glow=0.45, blanket=0.1, blanket_fill=sky.cloud,
                 nostril=0.8 * yawn, t=t,
                 sx=1 + 0.05 * blast, sy=1 - 0.03 * blast)

    # city below
    with st.layer(0.72):
        wd.draw_city_far(c, 1300, pal.CITY_FAR, window_alpha=0.18, t=t)
    with st.layer(0.86):
        wd.draw_city_mid(c, 1500, pal.CITY_MID, pal.INK, window_alpha=0.25, t=t)
    with st.layer(0.95):
        wd.draw_city_near(c, 1960, pal.CITY_NEAR, pal.INK)

    # the blast of wind
    if 1.1 < lt < 4.4:
        with st.layer(1.0):
            p = seg(lt, 1.1, 3.6, False, True)
            wd.draw_wind_streaks(c, t * 2.2, 1.0 + p, (1, 0.22), "#DCE8FF", 18, 3,
                                 1.15 * (1 - p), 1.2)

    # ---- the clock's ride ------------------------------------------------
    phase = _yawn_phase(lt)
    cx, cy, rot, s_, feet, arm = phase
    eyes = "squeeze" if 1.0 < lt < 5.4 else ("wide" if lt < 7.1 else "spiral")
    mouth = "o" if lt < 6.2 else "wobble"
    with st.layer(1.0, boil=0.8):
        draw_clock(c, cx, cy, s=s_, rot=rot, eyes=eyes, mouth=mouth, mouth_amt=0.9,
                   bells=0.9 * (1.0 - seg(lt, 7.0, 8.4)), t=t,
                   hand_angle=(150, 210), feet=feet, feet_phase=lt * 3.0,
                   arm=arm, arm_len=150, arm_bend=0.3,
                   sweat=1.0 if lt < 6.0 else 0.4,
                   stars=1.0 if lt > 7.1 else 0.0)

    # motion smear behind the clock while it flies
    if 1.6 < lt < 5.0:
        with st.layer(1.0):
            for i in range(3):
                u = 0.06 + i * 0.07
                px, py, _, ps, _, _ = _yawn_phase(max(0.0, lt - u))
                c.save()
                c.alpha_layer(0.22 - i * 0.05)
                draw_clock(c, px, py, s=ps, rot=rot, eyes="open", mouth="o",
                           mouth_amt=0.8, bells=0.0, t=t, feet="dangle",
                           hand_angle=(150, 210))
                c.restore()

    # the dangling cloud thread it grabs
    if 5.0 < lt < 10.0:
        with st.layer(1.0):
            tx, ty = _thread_anchor()
            grabbed = seg(lt, 5.2, 5.5)
            px, py, _, _, _, _ = phase
            if grabbed < 1:
                top = (px + 40, py - 30)
            else:
                top = (tx, ty)
            path = skia_path_thread(top[0], top[1], 300)
            c.stroke(path, rgba("#9FB2E8", 0.9), 4.5)

    # puff of impact when it lands
    if 8.4 < lt < 10.0:
        with st.layer(1.0):
            u = seg(lt, 8.4, 9.6)
            wd.draw_puff(c, 300, 1420, 60 + u * 90, (1 - u) * 0.6, "#C9D4F5", 5)

    with st.layer(1.2):
        draw_cloud(c, 940, 1840, 700, 240, rgba(sky.cloud, 0.9), None, 0, seed=161, lobes=5)


def _thread_anchor():
    return (250.0, 1000.0)


def skia_path_thread(x, y, length):
    p = skia.Path()
    p.moveTo(x, y)
    p.cubicTo(x + 12 * math.sin(0.7), y + length * 0.35, x - 14, y + length * 0.7,
              x + 6, y + length)
    return p


def _yawn_phase(lt):
    """(x, y, rot, scale, feet, arm) through the big tumble."""
    if lt < 1.4:
        u = seg(lt, 0.0, 1.4)
        return (380, 1000 - u * 20, -8 + u * 6, 0.62, "dangle", 0.0)
    if lt < 5.2:
        u = seg(lt, 1.4, 5.2, False, False)
        # swept right and down towards the rooftops
        x = lerp(380, 300, u) + math.sin(u * 5.0) * 120 * (1 - u * 0.4)
        y = lerp(980, 1180, u) + u * u * 320
        rot = -8 + u * 620
        return (x, y, rot, 0.62, "dangle", 0.0)
    if lt < 5.5:
        u = seg(lt, 5.2, 5.5, False, False)
        return (lerp(300, 250, u), lerp(1180, 1240, u), 620 * 4.7 * 0 + 40, 0.62,
                "dangle", 0.9)
    if lt < 8.0:
        u = seg(lt, 5.5, 8.0, False, False)
        # swinging from one foot, then pulling itself up with the winding key
        ang = math.sin(u * math.pi * 5.0) * (1 - u) * 46
        x = 250 + ang * 0.9
        y = 1240 - 10 * u
        rot = ang
        arm = 0.5
        return (x, y, rot, 0.6, "dangle", arm)
    u = seg(lt, 8.0, 8.7, False, True)
    return (lerp(250, 330, u), lerp(1230, 1400, u), lerp(0, -6, u), 0.6, "stand", 0.0)


# --------------------------------------------------------------------------- #
# 0:59 - 1:10  a tiny recovery
# --------------------------------------------------------------------------- #
def s07_recovery(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    sky = pal.sky("dawnfaint", 0.35, "dawn")
    st.zoom = 1.10 - 0.06 * seg(lt, 6.0, 10.0)
    st.pan = (0.0, -16 * seg(lt, 0.0, 4.0) + 40 * seg(lt, 6.0, 10.0))

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.7, glow_y=H * 0.82)
        wd.draw_stars(c, t, 0.28)

    # first colour of dawn at the horizon
    dawn = seg(lt, 5.0, 9.0)
    with st.layer(0.18):
        wd.draw_horizon_band(c, 1500, 240, ["#F59E7E", "#FFC178", "#8A6A8E"], 0.55 * dawn, 1.2)

    with st.layer(0.28):
        wd.draw_cloud_band(c, 520, 1300, 260, rgba(sky.cloud, 0.4), None, 0, seed=171,
                           lobes=7, drift=math.sin(t * 0.2) * 12)

    # the clock lies flat on its cloud
    sit = seg(lt, 3.4, 5.2)
    bell_fix = seg(lt, 4.2, 5.4)
    with st.layer(0.55):
        draw_cloud(c, 540, 1400, 760, 280, sky.cloud, pal.INK, 5, seed=8, lobes=6)

    # sun, further away, still asleep
    with st.layer(0.7):
        breath = 0.5 + 0.5 * math.sin(t * 1.0)
        draw_sun(c, 560, 880, s=0.56, eyes="shut", mouth="o",
                 mouth_amt=0.24 + 0.16 * breath, rays=0.3, ray_alpha=0.45,
                 glow=0.25, blanket=0.35, blanket_fill=sky.cloud, t=t)
        wd.draw_snore_puffs(c, 700, 880, t, 0.5, 0.7)

    cx, cy, rot, sx, sy = _recovery_pose(lt, t)
    eyes = "spiral" if lt < 2.6 else ("shut" if lt < 3.4 else "open")
    mouth = "wobble" if lt < 3.4 else ("flat" if lt < 5.6 else "small")
    if lt > 6.6:
        eyes = "wide"
        mouth = "o"
    with st.layer(1.0, boil=0.7):
        draw_clock(c, cx, cy, s=0.74, rot=rot, eyes=eyes, look=(0, 0),
                   mouth=mouth, mouth_amt=0.6, bells=0.0, t=t,
                   hand_angle=(150, 210), feet="flat",
                   bell_side=1.0 - bell_fix if lt < 5.4 else 0.0,
                   stars=1.0 if lt < 2.6 else 0.0, sy=sy, sx=sx,
                   blush=1.0)

    # the "idea" sparkle
    if lt > 8.4:
        with st.layer(1.0):
            u = seg(lt, 8.4, 9.4)
            draw_burst(c, cx, cy - 60, 60, 60 + u * 110, 10, "#FFF0B8",
                       0.9 * (1 - u * 0.4) * u, 6, rot=t * 0.6)
            draw_star(c, cx + 70, cy - 120, 16 * u, "#FFF6C8", u, rot=t)

    with st.layer(1.2):
        draw_cloud(c, 120, 1880, 800, 250, rgba(sky.cloud, 0.92), None, 0, seed=181, lobes=5)
        draw_cloud(c, 980, 1830, 620, 210, rgba(sky.cloud, 0.8), None, 0, seed=191, lobes=5)


def _recovery_pose(lt, t):
    """Flat on the cloud, sits up, straightens the bell, spots the dawn."""
    if lt < 1.0:
        return 540, 1310, 0, 1.0, 0.86     # flat
    if lt < 3.4:
        u = seg(lt, 1.0, 3.4, False, True)
        return (540, lerp(1300, 1270, u), lerp(0, -3, u), lerp(1.0, 0.96, u),
                lerp(0.86, 1.0, u))
    if lt < 6.0:
        u = seg(lt, 3.4, 4.4)
        wob = math.sin(lt * 3.2) * 4 * (1 - seg(lt, 4.4, 5.2))
        return (540, lerp(1270, 1235, u), -3 + wob, 0.96, 1.0)
    u = seg(lt, 6.0, 7.4)
    return (lerp(540, 470, u), lerp(1235, 1225, u), lerp(-3, -6, u), 0.96, 1.0)


# --------------------------------------------------------------------------- #
# 1:10 - 1:25  the clever plan: the ribbon paints the dawn
# --------------------------------------------------------------------------- #
def s08_plan(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    sky = pal.sky("dawn", 0.5, "sunrise")
    paint = seg(lt, 3.2, 11.2)
    st.zoom = 1.02 - 0.04 * paint
    st.pan = (-60 * (paint - 0.5) * 2.0, 0.0)

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.6 + 0.4 * paint, glow_y=H * 0.66)
        wd.draw_stars(c, t, 0.3 * (1 - paint))

    # far clouds
    with st.layer(0.3):
        for i, (cx, cy, w0, h0, sd) in enumerate(((300, 520, 700, 200, 201),
                                                 (860, 620, 620, 170, 211),
                                                 (540, 380, 500, 140, 221))):
            wd.draw_cloud_band(c, cy, w0, h0, rgba(sky.cloud, 0.28), None, 0,
                               seed=sd, lobes=6, x=cx + math.sin(t * 0.2 + i) * 14)

    # ---- the painted ribbon of dawn (in the sky, above the rooftops) -----
    horizon_y = BAND_Y
    trail = _ribbon_trail(lt)
    if len(trail) > 1:
        # soft glow bleeding off the paint
        with st.layer(0.42):
            u = seg(lt, 3.0, 11.0, False, False)
            # the paint bleeds up into the sky: peach near the horizon, rose above
            vp = skia.Paint(AntiAlias=True)
            vp.setShader(skia.GradientShader.MakeLinear(
                [skia.Point(0, horizon_y - 700), skia.Point(0, horizon_y + 90)],
                [rgba("#FF9EC4", 0.0), rgba("#FF9EC4", 0.34 * u),
                 rgba("#FFB98C", 0.52 * u), rgba("#FFD9A0", 0.72 * u),
                 rgba("#FFE4B4", 0.86 * u)],
                [0.0, 0.42, 0.68, 0.88, 1.0]))
            c.c.drawRect(skia.Rect.MakeLTRB(-900, horizon_y - 700, W + 900,
                                            horizon_y + 90), vp)
            gp = skia.Paint(AntiAlias=True)
            gp.setShader(skia.GradientShader.MakeLinear(
                [skia.Point(-100, 0), skia.Point(W + 100, 0)],
                [rgba("#FFB07A", 0.0), rgba("#FFB07A", 0.62 * u),
                 rgba("#FF9EC4", 0.45 * u), rgba("#FF9EC4", 0.0)],
                [0.0, 0.25, 0.7, 1.0]))
            gp.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 46))
            c.c.drawRect(skia.Rect.MakeLTRB(-900, horizon_y - 300, W + 900,
                                            horizon_y + 90), gp)
        # the band itself: three ribbons of peach / pink / gold
        with st.layer(0.46):
            for off, cols, wid, a in ((0, ["#FFD9A0", "#FFC178", "#FFE0A0"], 215, 0.97),
                                      (78, ["#FF9EC4", "#FFB3C6", "#FF9EC4"], 150, 0.90),
                                      (-72, ["#FFF0C0", "#FFE0A0"], 112, 0.85)):
                pts = [(x, y + off * 0.55) for x, y in trail]
                wd.draw_ribbon(c, pts, wid, cols, a, True)
            # the brush nib at the leading edge
            if lt < 11.4 and trail:
                bx, by = trail[-1]
                for i in range(6):
                    a = t * 3.0 + i * 1.05
                    draw_star(c, bx + math.cos(a) * (20 + i * 8),
                              by + math.sin(a) * (14 + i * 5), 7 + 2 * math.sin(a * 2),
                              "#FFF3C4", 0.9, rot=a)

    # the ribbon coil still inside the clock during the unwinding beat
    if lt < 3.6:
        with st.layer(0.99):
            cx0, cy0, _, _ = _ribbon_runner(lt, trail, horizon_y)
            grow = seg(lt, 0.4, 3.0)
            for i in range(5):
                a = i * 1.9 + t * 1.2
                rr = 46 + i * 13 * (0.4 + grow)
                c.stroke(ellipse_path(cx0 + 30 + math.cos(a) * 20,
                                      cy0 + 26 + math.sin(a) * 14,
                                      rr, rr * 0.42),
                         rgba(["#FFC178", "#FF9EC4", "#FFD9A0"][i % 3], 0.85 - i * 0.1),
                         7 - i * 0.6)

    # the city, dusk-lit
    with st.layer(0.72):
        wd.draw_city_far(c, 1420, mix(pal.CITY_FAR, "#8A6A94", 0.45),
                         window_alpha=0.25, t=t)
    with st.layer(0.86):
        wd.draw_city_mid(c, 1560, mix(pal.CITY_MID, "#7A5A86", 0.42), pal.INK,
                         window_alpha=0.4, t=t)
    with st.layer(0.98):
        wd.draw_city_near(c, 1960, mix(pal.CITY_NEAR, "#6A4A7A", 0.35), pal.INK)

    # the whole horizon glows as the paint spreads
    with st.layer(0.3):
        wd.draw_warm_wash(c, paint * paint, ("#FF9E7A", "#FFD9A0"), 0.40)

    # ---- the Sun (asleep on the right, then touched by colour) -----------
    wake = seg(lt, 12.4, 14.2)
    with st.layer(0.9, boil=0.5):
        breath = 0.5 + 0.5 * math.sin(t * 1.0)
        draw_sun(c, 820, 800, s=0.82, rot=-6,
                 eyes="shut" if wake < 0.4 else "open",
                 eye_open=max(0.0, (wake - 0.4) / 0.6),
                 look=(-0.4, -0.2), mouth="o" if wake < 0.6 else "smile",
                 mouth_amt=0.3 + 0.2 * breath, rays=0.42 + 0.2 * wake,
                 ray_wobble=t * 1.2, ray_alpha=0.6 + 0.3 * wake, glow=0.35 + 0.4 * wake,
                 blanket=0.3 * (1 - wake), blanket_fill=sky.cloud, t=t,
                 blush_extra=wake)

    # ---- the clock running with the ribbon -------------------------------
    cx, cy, rot, run = _ribbon_runner(lt, trail, horizon_y)
    done = lt > 10.6
    eyes = "open"
    mouth = "grin"
    if done:
        eyes = "sleepy"
        mouth = "smile"
    with st.layer(1.0, boil=0.8):
        draw_clock(c, cx, cy, s=0.56, rot=rot, eyes=eyes, look=(0.4, 0.1),
                   mouth=mouth, mouth_amt=0.7, bells=0.15, t=t,
                   hand_angle=(150, 210), feet="run", feet_phase=lt * 2.4,
                   arm=0.8, arm_len=110, arm_bend=-0.2,
                   sweat=1.0 if lt < 10.0 else 0.5,
                   sy=1.0 + 0.05 * math.sin(lt * 14.0), sx=1.0)
        if not done:
            # ribbon streaming out of its back
            for i in range(4):
                u = (lt * 3.0 + i * 0.25) % 1.0
                c.stroke(ellipse_path(cx - 60 - u * 24, cy + 10 + math.sin(u * 6 + i) * 8,
                                      14 + u * 10, 7), rgba("#FFB3C6", (1 - u) * 0.8), 4)
    if done:
        u = seg(lt, 10.6, 12.6)
        bow = math.sin(clamp(u) * math.pi)
        rot = -6 + 34 * bow
    with st.layer(1.14):
        draw_cloud(c, 80, 1880, 760, 240, rgba("#B98AA8", 0.55), None, 0, seed=231, lobes=5)


def _ribbon_trail(lt):
    """Points of the painted band, revealed left to right."""
    if lt < 3.0:
        return []
    u = seg(lt, 3.0, 11.0, False, False)
    xs = -80 + u * (W + 160)
    pts = []
    n = 28
    for i in range(n):
        f = i / (n - 1)
        x = -80 + (xs + 80) * f
        bob = math.sin(f * 6.0 + 0.6) * 13 + math.sin(f * 2.7) * 8
        y = BAND_Y + bob
        pts.append((x, y))
    return pts


def _ribbon_runner(lt, trail, horizon_y):
    """The clock unwinds the ribbon at frame-left, then races it across."""
    if lt < 3.0:
        u = seg(lt, 0.4, 3.0)
        return (lerp(320, 210, u), BAND_Y + 150 + math.sin(u * 4) * 6,
                -4 + 8 * math.sin(u * 6), u)
    if lt < 11.2:
        u = seg(lt, 3.0, 11.0, False, False)
        x = -40 + u * (W + 80)
        y = BAND_Y + 96 + math.sin(u * 9.0) * 10
        return (x, y, -6 + math.sin(u * 24) * 4, u)
    u = seg(lt, 11.2, 13.4, False, True)
    return (lerp(960, 700, u), lerp(BAND_Y + 130, BAND_Y + 70, u), -4, 1.0)


# --------------------------------------------------------------------------- #
# 1:25 - 1:37  the Sun wakes
# --------------------------------------------------------------------------- #
def s09_sunrise(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    rise = seg(lt, 4.2, 9.0)
    sky = pal.sky("sunrise", rise * 0.85, "morning")
    st.zoom = 1.06 - 0.06 * rise
    st.pan = (0.0, 60 * rise)

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.9 + 0.6 * rise, glow_y=H * 0.58,
                    warm=rise)
        wd.draw_stars(c, t, 0.2 * (1 - rise))

    # the painted band still on the horizon + morning light flooding in
    with st.layer(0.2):
        wd.draw_horizon_band(c, 1420 - 120 * rise, 260,
                             ["#FF9E7A", "#FFC178", "#FFE9BE"], 0.85, 1.2)
        wd.draw_warm_wash(c, 0.30 + 0.70 * rise, ("#FFC178", "#FFE9BE"), 0.26)

    with st.layer(0.3):
        wd.draw_cloud_band(c, 470, 1200, 210, rgba(sky.cloud, 0.45), None, 0, seed=241,
                           lobes=6, drift=math.sin(t * 0.2) * 12)

    # city
    with st.layer(0.72):
        wd.draw_city_far(c, 1500, mix(pal.CITY_FAR, "#9A6A78", 0.45 + 0.3 * rise),
                         window_alpha=0.2, t=t)
    with st.layer(0.86):
        wd.draw_city_mid(c, 1680, mix(pal.CITY_MID, "#8A5A70", 0.4 + 0.35 * rise),
                         pal.INK, window_alpha=0.35, t=t)
    with st.layer(0.98):
        wd.draw_city_near(c, 1990, mix(pal.CITY_NEAR, "#7A4A66", 0.3 + 0.35 * rise),
                          pal.INK)

    # the Sun: eye opens, sits up, rises above the horizon
    sun_y = lerp(1215, 620, rise)
    sun_s = lerp(0.92, 1.0, rise)
    eye = seg(lt, 1.6, 3.0)
    look = (-0.55 + 0.5 * seg(lt, 3.4, 5.0), -0.1)
    with st.layer(0.9, boil=0.5):
        draw_sun(c, 540, sun_y, s=sun_s, eyes="shut" if eye < 0.15 else "open",
                 eye_open=eye, look=look, lid=max(0.0, 0.55 - 0.55 * eye),
                 mouth="small" if lt < 2.6 else ("smile" if lt < 5.6 else "grin"),
                 mouth_amt=0.4, rays=0.5 + 0.6 * rise, ray_wobble=t * 1.2 + rise * 3,
                 ray_alpha=0.7 + 0.3 * rise, glow=0.3 + 0.7 * rise,
                 t=t, blush_extra=0.5 * rise, cheeks=1.0)

    # beam of light flooding the city
    if rise > 0.1:
        with st.layer(0.8):
            u = rise
            p = skia.Paint(AntiAlias=True)
            p.setShader(skia.GradientShader.MakeRadial(
                skia.Point(540, sun_y), 300 + 900 * u,
                [rgba("#FFE7A8", 0.55 * u), rgba("#FFD08A", 0.18 * u), rgba("#FFD08A", 0.0)],
                [0.0, 0.5, 1.0]))
            p.setBlendMode(skia.BlendMode.kScreen)
            c.c.drawPaint(p)

    # the clock: proud, tired bow. It drifts left and down out of the Sun's
    # way as the Sun climbs past it, so nothing covers the Sun's face.
    bow = math.sin(clamp(seg(lt, 6.4, 8.4)) * math.pi)
    cx = lerp(300, 190, rise)
    cy = lerp(1010, 880, rise) + 10 * seg(lt, 6.4, 7.4)
    with st.layer(1.0, boil=0.6):
        draw_cloud(c, cx, cy + 100, 400, 145, rgba(sky.cloud, 0.95), None, 3, seed=251,
                   lobes=5)
        draw_clock(c, cx, cy, s=0.56, rot=-4 + 22 * bow,
                   eyes="happy" if lt > 6.2 else "sleepy",
                   mouth="grin" if lt > 6.2 else "smile", mouth_amt=0.7,
                   bells=0.35 + 0.3 * math.sin(t * 8), t=t,
                   hand_angle=(150, 210), feet="stand",
                   arm=0.9, arm_len=110, arm_bend=0.9, blush=1.0,
                   sweat=0.0 if lt > 3.0 else 0.4)

    # waking bird flies across
    if lt > 4.4:
        u = seg(lt, 4.4, 10.0, False, False)
        bx = lerp(-120, W + 140, u)
        by = 1450 - math.sin(u * math.pi) * 300 + math.sin(u * 9) * 12
        with st.layer(1.0):
            draw_bird(c, bx, by, s=1.05, awake=1.0, flap=math.sin(u * 40) * 26,
                  look=(0.6, 0.0))

    with st.layer(1.14):
        draw_cloud(c, 100, 1880, 780, 240, rgba("#F0C8B8", 0.7), None, 0, seed=261, lobes=5)


# --------------------------------------------------------------------------- #
# 1:37 - 1:47  morning arrives
# --------------------------------------------------------------------------- #
def s10_morning(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    sky = pal.sky("morning", 0.25, "day")

    # four short, rhythmic beats
    cuts = [0.0, 2.4, 4.6, 6.8, 9.4]
    idx = 0
    for i, c0 in enumerate(cuts):
        if lt >= c0:
            idx = i
    local = lt - cuts[idx]
    push = 1.0 - math.exp(-local * 3.0)

    if idx == 0:
        _morning_rooftops(c, st, t, lt, sky, push)
    elif idx == 1:
        _morning_windows(c, st, t, lt, sky, push)
    elif idx == 2:
        _morning_flowers(c, st, t, lt, sky, push)
    else:
        _morning_beams(c, st, t, lt, sky, push, local)


def _morning_sky(c, st, t, sky, base_cloud=True, warm=0.6):
    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=1.0, glow_y=H * 0.42, warm=warm)
    if base_cloud:
        with st.layer(0.3):
            wd.draw_cloud_band(c, 420, 1200, 200, rgba("#FFFFFF", 0.7), None, 0, seed=271,
                               lobes=6, drift=math.sin(t * 0.4) * 10)


def _morning_rooftops(c, st, t, lt, sky, push):
    _morning_sky(c, st, t, sky)
    with st.layer(0.7):
        wd.draw_city_far(c, 1250, mix(pal.CITY_FAR, "#7FA8E0", 0.75), window_alpha=0.05, t=t)
    with st.layer(0.86):
        wd.draw_city_mid(c, 1450, mix(pal.CITY_MID, "#6E96CC", 0.72), pal.INK,
                         window_alpha=0.1, t=t)
    with st.layer(1.0):
        wd.draw_city_near(c, 1960, mix(pal.CITY_NEAR, "#5F86BE", 0.7), pal.INK)
    # sun peeking with a warm bounce of light
    with st.layer(0.9):
        draw_sun(c, 540, 300 - 20 * push, s=0.9, eyes="happy", mouth="grin",
                 mouth_amt=0.8, rays=1.0, ray_wobble=t * 3.0, glow=0.8, t=t)
    # bird flies across with speed puffs
    with st.layer(1.02):
        u = seg(lt, 0.0, 2.4, False, False)
        draw_bird(c, lerp(-100, W + 120, u), 1180 - math.sin(u * math.pi) * 180,
                  s=0.66, awake=1.0, flap=math.sin(u * 30) * 24, look=(0.6, 0))
        wd.draw_bird_flap_burst(c, lerp(-100, W + 120, u) - 60,
                                1180 - math.sin(u * math.pi) * 180, 0.5, 30)


def _morning_windows(c, st, t, lt, sky, push):
    _morning_sky(c, st, t, sky)
    with st.layer(0.7):
        wd.draw_city_far(c, 1300, mix(pal.CITY_FAR, "#88B0E4", 0.8), window_alpha=0.1, t=t)
    with st.layer(0.9):
        wd.draw_city_mid(c, 1560, mix(pal.CITY_MID, "#7098CE", 0.78), pal.INK,
                         window_alpha=0.55, t=t, window_color="#FFD98A")
    with st.layer(1.0):
        wd.draw_city_near(c, 1980, mix(pal.CITY_NEAR, "#6288C0", 0.72), pal.INK)
        # three windows popping open on the beat
        for i, (wx, wy, ww, hh) in enumerate(((210, 1560, 150, 190),
                                              (545, 1620, 170, 210),
                                              (880, 1540, 150, 180))):
            o = seg(lt, 0.20 + i * 0.32, 0.55 + i * 0.32)
            if o > 0:
                _window_gag(c, wx, wy, ww, hh, o, lt, greeting=True)
                # warm spill from the opening window
                c.stroke(ellipse_path(wx, wy, ww * (0.62 + 0.5 * o), hh * (0.55 + 0.4 * o)),
                         rgba("#FFF3C4", (1 - o) * 0.45 + 0.10), 4)


def _morning_flowers(c, st, t, lt, sky, push):
    _morning_sky(c, st, t, sky)
    with st.layer(0.7):
        wd.draw_city_far(c, 1320, mix(pal.CITY_FAR, "#9AC0EA", 0.85), window_alpha=0.1, t=t)
    with st.layer(0.9):
        wd.draw_city_mid(c, 1480, mix(pal.CITY_MID, "#7AA4D6", 0.8), pal.INK,
                         window_alpha=0.35, t=t)
        draw_sun(c, 860, 380, s=0.72, eyes="happy", mouth="grin", mouth_amt=0.8,
                 rays=0.9, ray_wobble=t * 2.6, glow=0.7, t=t)
    with st.layer(1.04):
        # big rooftop flower boxes
        for b in range(2):
            bx = -40 + b * 560
            box = skia.Path()
            box.addRRect(skia.RRect.MakeRectXY(
                skia.Rect.MakeXYWH(bx, 1560, 580, 420), 18, 18))
            c.shape(box, mix("#B06A5E", "#D89280", 0.5), pal.INK, 5)
            c.fill(skia.Path().addRRect(skia.RRect.MakeRectXY(
                skia.Rect.MakeXYWH(bx + 16, 1576, 548, 54), 10, 10)),
                rgba("#8A4A44", 0.55))
        for i in range(6):
            fx = 90 + i * 180
            bloom = seg(lt, 0.10 * i, 0.65 + 0.10 * i)
            if bloom > 0:
                wd.draw_flower(c, fx, 1566, 2.5 + 0.35 * (i % 2), bloom,
                               -0.12 + 0.05 * i,
                               ["#FF9EC4", "#FFB86B", "#FFE07A", "#FF97B8",
                                "#FFC46B", "#FF9EC4"][i], t)
    with st.layer(1.08):
        u = seg(lt, 0.2, 2.4, False, False)
        draw_bird(c, lerp(W + 100, -140, u), 900 - math.sin(u * math.pi) * 140, s=0.75,
                  awake=1.0, flap=math.sin(u * 26) * 22, look=(-0.6, 0))


def draw_flower_local(c, x, y, s, open_amt, rot, color, t):
    wd.draw_flower(c, x, y, s, open_amt, rot, color, t)


def _morning_beams(c, st, t, lt, sky, push, local):
    _morning_sky(c, st, t, sky, warm=0.8)
    with st.layer(0.75):
        wd.draw_city_far(c, 1350, mix(pal.CITY_FAR, "#9AC0EA", 0.85), window_alpha=0.15, t=t)
    with st.layer(0.95):
        wd.draw_city_mid(c, 1600, mix(pal.CITY_MID, "#7AA4D6", 0.82), pal.INK,
                         window_alpha=0.4, t=t)
    with st.layer(1.0):
        wd.draw_city_near(c, 1990, mix(pal.CITY_NEAR, "#6A90C8", 0.75), pal.INK)

    # the Sun's thank-you beam towards the clock
    sun_p = (540, 430)
    clock_p = (540, 1180)
    beam = seg(lt, 0.2, 1.6) * (1 - 0.25 * seg(lt, 2.4, 3.0))
    with st.layer(0.9):
        draw_sun(c, sun_p[0], sun_p[1], s=0.86, eyes="happy", mouth="smile",
                 mouth_amt=0.7, rays=0.9, ray_wobble=t * 2.4, glow=0.85, t=t)
        if beam > 0.02:
            wd.draw_light_beam(c, sun_p[0] + 120, sun_p[1] + 200, clock_p[0] - 40,
                               clock_p[1] - 40, 60, 220, "#FFE7A8", 0.55 * beam, 4, 0.5)
    with st.layer(1.0, boil=0.6):
        draw_cloud(c, clock_p[0], clock_p[1] + 120, 460, 160, rgba("#FFFFFF", 0.95), None,
                   3, seed=281, lobes=5)
        nod = seg(lt, 2.0, 3.2)
        draw_clock(c, clock_p[0], clock_p[1] + 8 * nod, s=0.58, rot=-4 + 10 * nod,
                   eyes="happy" if nod < 0.6 else "shut",
                   mouth="smile" if nod < 0.5 else "small",
                   mouth_amt=0.6, bells=0.3 + 0.2 * math.sin(t * 5), t=t,
                   hand_angle=(150, 210), feet="stand", arm=0.4 * (1 - nod),
                   arm_len=110, arm_bend=0.6, blush=1.0, lid=0.6 * nod)
    # celebration sparkles
    with st.layer(1.06):
        for i in range(6):
            a = t * 1.4 + i * 1.05
            draw_star(c, clock_p[0] + math.cos(a) * (200 + i * 12),
                      clock_p[1] - 120 + math.sin(a) * (90 + i * 8),
                      7 + 3 * math.sin(a * 2), "#FFF6C8", 0.75, rot=a)


# --------------------------------------------------------------------------- #
# 1:47 - 1:56  the day races by
# --------------------------------------------------------------------------- #
def s11_timelapse(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    u = clamp(lt / dur)
    # sky cycles morning -> noon -> afternoon -> evening -> dusk
    if u < 0.34:
        sky = pal.lerp_sky("morning", "day", u / 0.34)
        sun_x = lerp(330, 560, u / 0.34)
        sun_y = lerp(520, 330, u / 0.34)
    elif u < 0.62:
        v = (u - 0.34) / 0.28
        sky = pal.lerp_sky("day", "afternoon", v)
        sun_x = lerp(560, 760, v)
        sun_y = lerp(330, 420, v)
    elif u < 0.86:
        v = (u - 0.62) / 0.24
        sky = pal.lerp_sky("afternoon", "evening", v)
        sun_x = lerp(760, 880, v)
        sun_y = lerp(420, 760, v)
    else:
        v = (u - 0.86) / 0.14
        sky = pal.lerp_sky("evening", "dusk", v)
        sun_x = lerp(880, 940, v)
        sun_y = lerp(760, 1180, v)

    with st.layer(0.12):
        wd.draw_sky(c, sky, glow_strength=0.8, glow_y=H * 0.4)
        if u > 0.72:
            wd.draw_stars(c, t, seg(u, 0.72, 0.95) * 0.5)

    # sweeping clouds for speed
    with st.layer(0.24):
        for i, (cy2, sd) in enumerate(((360, 291), (560, 301), (280, 311), (700, 321))):
            wd.draw_cloud_band(c, cy2, 760, 160, rgba("#FFFFFF", 0.5 - i * 0.09), None, 0,
                               seed=sd, lobes=5,
                               drift=-((t * 340 + i * 260) % (W + 900)) + W / 2)
    # light sweeps across the rooftops as the sun travels
    with st.layer(0.6):
        sweep = ((lt * 0.55) % 1.4) - 0.2
        gp = skia.Paint(AntiAlias=True)
        gp.setShader(skia.GradientShader.MakeLinear(
            [skia.Point(sweep * W - 200, 0), skia.Point(sweep * W + 260, 0)],
            [rgba("#FFE9B8", 0.0), rgba("#FFE9B8", 0.30), rgba("#FFE9B8", 0.0)],
            [0.0, 0.5, 1.0]))
        gp.setBlendMode(skia.BlendMode.kScreen)
        c.c.drawRect(skia.Rect.MakeLTRB(0, 900, W, H), gp)

    # the sun sweeps across and sinks
    with st.layer(0.88, boil=0.4):
        draw_sun(c, sun_x, sun_y, s=lerp(0.95, 0.8, u), eyes="happy",
                 mouth="smile", mouth_amt=0.6, rays=0.9, ray_wobble=t * 4.0,
                 ray_alpha=0.8, glow=0.7, ray_spin=u * 5.0, t=t)

    # city with shifting light
    with st.layer(0.72):
        wd.draw_city_far(c, 1380, mix(pal.CITY_FAR, "#8AB4E6", 0.7 - 0.4 * u),
                         window_alpha=0.1 + 0.4 * seg(u, 0.6, 0.9), t=t,
                         window_color=mix("#FFD98A", "#FFB070", 0.4 * u))
    with st.layer(0.88):
        wd.draw_city_mid(c, 1560, mix(pal.CITY_MID, "#789FD0", 0.65 - 0.4 * u), pal.INK,
                         window_alpha=0.25 + 0.5 * seg(u, 0.55, 0.95), t=t,
                         window_color=mix("#FFD98A", "#FFB070", 0.4 * u))
    with st.layer(1.0):
        wd.draw_city_near(c, 1990, mix(pal.CITY_NEAR, "#6A90C8", 0.6 - 0.45 * u), pal.INK)

    # the clock, asleep, riding its cloud beside the Sun
    ride_x = lerp(300, 700, u)
    ride_y = lerp(760, 980, u) + math.sin(t * 1.4) * 8
    with st.layer(0.96, boil=0.5):
        draw_cloud(c, ride_x, ride_y + 96, 400, 150, rgba(sky.cloud, 0.9), pal.INK, 4,
                   seed=321, lobes=5)
        bounce = abs(math.sin(t * 1.6)) * 4
        draw_clock(c, ride_x, ride_y - bounce, s=0.52, rot=-6,
                   eyes="shut", mouth="small", mouth_amt=0.5,
                   bells=0.0, t=t, hand_angle=(150, 210), feet="dangle",
                   feet_phase=t * 0.4, blush=1.0, lid=0.0)
    # speed lines behind it
    with st.layer(1.1):
        wd.draw_speed_lines(c, 540, 240, 0.0, 160, 3, 0.25, "#FFFFFF", 420, 4)

    # time-lapse sun streaks
    with st.layer(0.5):
        for i in range(7):
            a = i / 7.0
            if a < u:
                c.stroke(ellipse_path(lerp(330, 940, a), lerp(520, 1180, a) - 120,
                                      90, 40), rgba("#FFE7A8", 0.18), 3)

    with st.layer(1.16):
        draw_cloud(c, 80, 1880, 800, 250, rgba(sky.cloud, 0.6), None, 0, seed=331, lobes=5)


# --------------------------------------------------------------------------- #
# 1:56 - 2:00  the seamless ending
# --------------------------------------------------------------------------- #
def s12_loop(c: Canvas, t, lt, dur):
    st = Stage(c, t)
    # matching the opening shot exactly by the last frame
    blend = seg_io(lt, 0.0, 1.6)
    st.zoom = lerp(1.02, 1.0, blend)
    st.pan = (0.0, lerp(-14, 0, blend))
    # ring starts again, the clock snoozes itself, and the film settles back
    # onto the exact opening composition so it loops without a cut
    tableau(c, st, lt, sky_key="nightfall", toward="midnight", amount=blend,
            ring_at=1.05, hit_at=3.25)
    # a slow final settle that lands on the opening frame just as the music
    # rings its last note, so the loop reads as "and again" rather than a cut
    settle = seg_io(lt, 2.95, 4.45) ** 1.6
    if settle > 0.001:
        c.save()
        c.alpha_layer(settle)
        st0 = Stage(c, 0.0)
        st0.set_cam(pan=(0.0, 0.0), zoom=1.0)
        tableau(c, st0, 0.0, sky_key="midnight", ring_at=0.42, hit_at=2.42)
        c.restore()
