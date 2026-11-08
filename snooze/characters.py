"""characters.py - the two stars of SNOOZE plus the supporting cast.

Everything is drawn in a local, y-UP space with the character centred on the
origin, then placed in the world with :func:`place` (which flips y so the
artwork reads like a drawing on paper).

Proportions and colours are fixed constants so the alarm clock and the Sun look
identical in every one of the film's ~1500 drawings.
"""

from __future__ import annotations

import math

import skia

from . import palette as pal
from .gfx import (P, Canvas, ellipse_path, hexa, lerp, mix, polygon, rgba,
                  smooth_closed, smooth_open, union, with_alpha, col)

TAU = math.tau


# --------------------------------------------------------------------------- #
# placement
# --------------------------------------------------------------------------- #
def place(c: Canvas, x: float, y: float, s: float = 1.0, rot: float = 0.0,
          sx: float = 1.0, sy: float = 1.0):
    """Push a transform for a y-up character of scale s centred at (x, y)."""
    c.save()
    c.translate(x, y)
    if rot:
        c.rotate(rot)
    if sx != 1.0 or sy != 1.0:
        c.scale(sx, sy)
    c.scale(s, -s)
    return c


# --------------------------------------------------------------------------- #
# eyes - shared by every character so they all emote the same way
# --------------------------------------------------------------------------- #
def draw_eye(c: Canvas, x, y, r, open_amt=1.0, look=(0.0, 0.0), style="round",
             ink=pal.INK, white="#FFFFFF", pupil=pal.HAND_DARK, lid=0.0,
             pupil_scale=1.0, highlight=True, ink_w=4.0, brow=0.0):
    """One appealing cartoon eye.

    open_amt 0 = shut, 1 = open, >1 = panicked pop.  style picks special shapes.
    """
    ink = col(ink)
    if style == "happy" or style == "squeeze" or style == "spiral":
        if style == "happy":
            p = smooth_open([(x - r * 0.95, y - r * 0.12), (x, y + r * 0.78),
                             (x + r * 0.95, y - r * 0.12)], 0.9)
            c.stroke(p, ink, max(ink_w * 1.45, r * 0.22))
        elif style == "squeeze":
            c.stroke(smooth_open([(x - r * 0.8, y + r * 0.62), (x + r * 0.62, y - r * 0.05)], 0.25),
                     ink, max(ink_w * 1.3, r * 0.17))
            c.stroke(smooth_open([(x + r * 0.8, y + r * 0.62), (x - r * 0.62, y - r * 0.05)], 0.25),
                     ink, max(ink_w * 1.3, r * 0.17))
        else:  # dizzy spiral
            p = P()
            turns, steps = 2.3, 40
            for i in range(steps):
                a = turns * TAU * i / steps
                rr = r * (0.1 + 0.85 * i / steps)
                px, py = x + math.cos(a) * rr, y + math.sin(a) * rr
                if i == 0:
                    p.moveTo(px, py)
                else:
                    p.lineTo(px, py)
            c.stroke(p, ink, max(2.6, r * 0.15))
        return

    if open_amt <= 0.07 or style == "flat":
        p = smooth_open([(x - r * 0.98, y + r * 0.14), (x, y - r * 0.36),
                         (x + r * 0.98, y + r * 0.14)], 0.92)
        c.stroke(p, ink, max(ink_w * 1.3, r * 0.19))
        if style == "sleepy":
            c.stroke(smooth_open([(x - r * 0.6, y + r * 0.5), (x + r * 0.7, y + r * 0.28)], 0.5),
                     ink, 3)
        return

    if style == "star":
        pts = []
        for i in range(10):
            a = math.pi / 2 + i * TAU / 10
            rr = r * (1.0 if i % 2 == 0 else 0.44)
            pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
        c.shape(polygon(pts), hexa("#FFF4C2"), ink, max(2.0, r * 0.11))
        return

    rx = r
    ry = r * max(0.14, min(1.2, open_amt))
    p = ellipse_path(x, y, rx, ry)
    c.save()
    c.clip(p)
    c.shape(p, col(white), ink, ink_w)
    pr = r * 0.45 * pupil_scale
    px = x + look[0] * r * 0.42
    py = y + look[1] * r * 0.36
    c.shape(ellipse_path(px, py, pr, pr), col(pupil), None)
    if highlight:
        c.shape(ellipse_path(px - pr * 0.32, py + pr * 0.38, pr * 0.38, pr * 0.32),
                hexa("#FFFFFF"), None)
        c.shape(ellipse_path(px + pr * 0.38, py - pr * 0.44, pr * 0.17, pr * 0.15),
                rgba("#FFFFFF", 0.7), None)
    if lid > 0:
        lid_y = y + ry - 2 * ry * lid
        lp = P()
        lp.addRect(skia.Rect.MakeLTRB(x - rx - 6, lid_y, x + rx + 6, y + ry + 8))
        c.fill(lp, col(white))
    c.restore()
    if lid > 0.03:
        ly = y + ry - 2 * ry * lid
        c.line(x - rx * 0.99, ly + ry * 0.05, x + rx * 0.99, ly + ry * 0.05, ink,
               max(ink_w * 1.05, r * 0.13))


def draw_mouth(c: Canvas, x, y, w, kind="smile", amt=1.0, ink=pal.INK, ink_w=5.0,
               fill="#8A3A2A"):
    ink = col(ink)
    if kind == "none":
        return
    if kind == "smile":
        p = smooth_open([(x - w * 0.5, y + w * 0.14), (x, y - w * 0.28),
                         (x + w * 0.5, y + w * 0.14)], 0.85)
        c.stroke(p, ink, max(ink_w * 0.9, w * 0.13))
    elif kind == "grin":
        p = P()
        p.moveTo(x - w * 0.56, y + w * 0.06)
        p.cubicTo(x - w * 0.42, y - w * 0.66, x + w * 0.42, y - w * 0.66,
                  x + w * 0.56, y + w * 0.06)
        p.close()
        c.shape(p, col(fill), ink, ink_w * 0.85)
        c.shape(ellipse_path(x, y - w * 0.36, w * 0.25, w * 0.15), hexa("#F07A82"), None)
        c.line(x - w * 0.5, y + w * 0.04, x + w * 0.5, y + w * 0.04, ink, ink_w * 0.7)
    elif kind == "o":
        ry = w * (0.26 + 0.30 * amt)
        c.shape(ellipse_path(x, y, w * 0.28, ry), col(fill), ink, ink_w * 0.8)
    elif kind == "yawn":
        ry = w * (0.30 + 0.55 * amt)
        p = ellipse_path(x, y - w * 0.05, w * 0.30, ry)
        c.shape(p, col(fill), ink, ink_w * 0.9)
        c.shape(ellipse_path(x, y - w * 0.1 - ry * 0.55, w * 0.19, ry * 0.33),
                hexa("#E5697A"), None)
    elif kind == "flat":
        c.line(x - w * 0.40, y, x + w * 0.40, y, ink, max(ink_w, w * 0.13))
    elif kind == "frown":
        p = smooth_open([(x - w * 0.45, y - w * 0.12), (x, y + w * 0.22),
                         (x + w * 0.45, y - w * 0.12)], 0.85)
        c.stroke(p, ink, max(ink_w, w * 0.12))
    elif kind == "smirk":
        p = smooth_open([(x - w * 0.38, y + w * 0.02), (x + w * 0.1, y - w * 0.1),
                         (x + w * 0.46, y + w * 0.18)], 0.7)
        c.stroke(p, ink, max(ink_w, w * 0.13))
    elif kind == "wobble":
        pts = [(x - w * 0.5 + i * w * 0.25, y + math.sin(i * 2.1) * w * 0.14)
               for i in range(5)]
        c.stroke(smooth_open(pts, 0.95), ink, max(ink_w, w * 0.12))
    elif kind == "pant":
        p = P()
        p.moveTo(x - w * 0.44, y + w * 0.12)
        p.cubicTo(x - w * 0.32, y - w * 0.56, x + w * 0.32, y - w * 0.56,
                  x + w * 0.44, y + w * 0.12)
        p.close()
        c.shape(p, col(fill), ink, ink_w * 0.8)
        c.shape(ellipse_path(x + w * 0.02, y - w * 0.26, w * 0.2, w * 0.12),
                hexa("#E5697A"), None)
    elif kind == "small":
        c.shape(ellipse_path(x, y, w * 0.14, w * 0.17), col(fill), ink, ink_w * 0.7)
    elif kind == "wavy":
        pts = []
        for i in range(7):
            pts.append((x - w * 0.5 + i * w * 0.166, y + math.sin(i * 1.6) * w * 0.09))
        c.stroke(smooth_open(pts, 0.8), ink, max(ink_w, w * 0.1))


# --------------------------------------------------------------------------- #
# clouds
# --------------------------------------------------------------------------- #
def cloud_path(cx, cy, w, h, seed=0, lobes=5, flat_bottom=True) -> skia.Path:
    """A puffy cloud: union of lobes gives one crisp silhouette + one outline."""
    import numpy as np
    rng = np.random.default_rng(seed)
    parts = []
    n = max(3, lobes)
    for i in range(n):
        u = (i + 0.5) / n
        x = cx - w / 2 + u * w
        # bigger in the middle
        t = 1.0 - abs(u - 0.5) * 2.0
        r = h * (0.30 + 0.34 * t) * (0.86 + 0.28 * rng.random())
        y = cy + h * 0.16 - r * (0.30 + 0.22 * t)
        p = P()
        p.addCircle(x, y, r)
        parts.append(p)
    body = P()
    body.addRRect(skia.RRect.MakeRectXY(
        skia.Rect.MakeLTRB(cx - w * 0.44, cy - h * 0.02, cx + w * 0.44, cy + h * 0.30),
        h * 0.22, h * 0.22))
    parts.append(body)
    return union(*parts)


def draw_cloud(c: Canvas, cx, cy, w, h, fill, ink=None, ink_w=4.0, seed=0,
               lobes=5, alpha=1.0, shadow=None, shadow_off=0.12):
    path = cloud_path(cx, cy, w, h, seed, lobes)
    if alpha < 1.0:
        c.alpha_layer(alpha)
    if shadow is not None:
        c.save()
        c.translate(0, h * shadow_off)
        c.fill(cloud_path(cx, cy, w * 0.99, h * 0.99, seed, lobes), shadow)
        c.restore()
    c.shape(path, fill, ink, ink_w)
    if alpha < 1.0:
        c.restore()
    return path


# --------------------------------------------------------------------------- #
# THE ALARM CLOCK
# --------------------------------------------------------------------------- #
CLOCK_R = 100.0


def draw_clock(
    c: Canvas,
    x: float, y: float, s: float = 1.0, rot: float = 0.0,
    sx: float = 1.0, sy: float = 1.0,
    eyes: str = "open", look=(0.0, 0.0), eye_open: float = 1.0, lid: float = 0.0,
    mouth: str = "smile", mouth_amt: float = 0.6, pupils: float = 1.0,
    bells: float = 0.0, bell_side: float = 0.0,
    hand_angle: tuple = (0.0, 0.0),
    feet: str = "stand", feet_phase: float = 0.0,
    arm: float = 0.0, arm_angle: float = 0.0, arm_len: float = 96.0,
    arm_bend: float = 0.0,
    blush: float = 1.0, key_out: float = 0.0, sweat: float = 0.0,
    stars: float = 0.0, t: float = 0.0, extra_rot_hands: float = 0.0,
    sleepy_z: float = 0.0, scale_squash: float = 1.0,
):
    place(c, x, y, s, rot, sx, sy)
    ink = col(pal.INK)
    iw = 6.5

    # ---- bells (behind the body) -----------------------------------------
    _clock_bells(c, bells, bell_side, t, ink, iw)

    # ---- snooze button ----------------------------------------------------
    c.save()
    c.translate(-2, 100)
    c.rotate(-3)
    c.rrect(-30, 0, 60, 18, 9, hexa(pal.CLOCK_CREAM), ink, iw * 0.9)
    c.line(-16, 9, 16, 9, hexa(pal.CLOCK_CREAM_DK), 4)
    c.restore()

    # ---- feet -------------------------------------------------------------
    _clock_feet(c, feet, feet_phase, ink, iw)

    # ---- body -------------------------------------------------------------
    body = ellipse_path(0, -8, 102, 98)
    c.shape(body, hexa(pal.CLOCK_RED), ink, iw)
    c.save()
    c.clip(body)
    # bottom shading
    sh = P()
    sh.addRect(skia.Rect.MakeLTRB(-120, -120, 120, -58))
    c.fill(sh, rgba(pal.CLOCK_RED_DK, 0.92))
    c.save()
    c.clip(sh)
    c.fill(ellipse_path(0, -34, 112, 40), rgba(pal.CLOCK_RED_DK, 0.0))
    c.restore()
    # top glossy highlight
    c.fill(ellipse_path(-30, 52, 56, 30, -0.45), rgba(pal.CLOCK_RED_LT, 0.5))
    c.restore()

    # ---- face plate -------------------------------------------------------
    face = ellipse_path(0, 0, 79, 79)
    c.shape(face, hexa(pal.CLOCK_CREAM), ink, iw * 0.8)
    c.save()
    c.clip(face)
    c.stroke(ellipse_path(0, 0, 71, 71), rgba(pal.CLOCK_CREAM_DK, 1.0), 3.4)
    for i in range(12):
        a = math.pi / 2 + i * TAU / 12
        r0 = 62 if i % 3 == 0 else 66
        c.line(math.cos(a) * r0, math.sin(a) * r0, math.cos(a) * 71,
               math.sin(a) * 71, hexa(pal.HAND_DARK), 3.6 if i % 3 == 0 else 2.2)
    c.restore()

    # ---- clock hands (its arms) -------------------------------------------
    _clock_hands(c, hand_angle, arm, arm_angle, arm_len, arm_bend, ink, extra_rot_hands)

    # ---- eyes -------------------------------------------------------------
    ex, ey = 31.0, 24.0
    if eyes == "shut":
        for sgn in (-1, 1):
            draw_eye(c, sgn * ex, ey, 28, 0.0, style="flat", ink=ink)
            c.line(sgn * (ex + 13), ey + 9, sgn * (ex + 22), ey + 17, ink, 3.6)
    elif eyes == "spiral":
        draw_eye(c, -ex, ey, 25, style="spiral", ink=ink)
        draw_eye(c, ex, ey, 25, style="spiral", ink=ink)
    else:
        style = "round"
        oa = eye_open
        l = lid
        if eyes == "happy":
            style = "happy"
        elif eyes == "squeeze":
            style = "squeeze"
        elif eyes == "star":
            style = "star"
        elif eyes == "sleepy":
            l = max(l, 0.46)
        elif eyes == "wide":
            oa = max(1.0, eye_open)
            pupils *= 0.7
        for sgn in (-1, 1):
            draw_eye(c, sgn * ex, ey, 29, oa, (look[0] * sgn if style == "round" else look[0],
                                               look[1]), style, ink=ink,
                     pupil=hexa(pal.HAND_DARK), lid=l, pupil_scale=pupils, ink_w=4.6)

    # brows for attitude
    if eyes in ("wide", "star", "squeeze") or mouth in ("flat", "smirk", "wobble", "pant"):
        c.line(-ex - 17, ey + 41, -ex + 12, ey + 36, ink, 5)
        c.line(ex - 12, ey + 36, ex + 17, ey + 41, ink, 5)

    # ---- mouth ------------------------------------------------------------
    draw_mouth(c, 0, -48, 50, mouth, mouth_amt, ink, 4.8)

    # ---- blush ------------------------------------------------------------
    if blush > 0:
        c.save()
        c.clip(face)
        for sgn in (-1, 1):
            c.fill(ellipse_path(sgn * 56, -16, 15, 10), rgba("#FF7C63", 0.45 * blush))
        c.restore()

    # ---- props ------------------------------------------------------------
    if sweat > 0:
        _sweat_drop(c, 74, 54, ink, t, sweat)
    if stars > 0:
        _dizzy_stars(c, t, stars, ink)
    if key_out > 0:
        _winding_key(c, key_out, t, ink, iw)
    if sleepy_z > 0:
        pass
    c.restore()


def _clock_bells(c: Canvas, bells, bell_side, t, ink, iw):
    for side, bx in ((-1, -56), (1, 56)):
        fallen = 1.0 if (bell_side and side == int(math.copysign(1, bell_side))) else 0.0
        vib = bells * 10.0 * math.sin(t * 52.0 + side * 0.7)
        c.save()
        c.translate(bx, 74)
        c.rotate(side * fallen * 74.0 + vib)
        if fallen:
            c.translate(side * 26, -6)
        sc = 1.0 + 0.10 * bells * math.sin(t * 44.0 + side)
        dome = P()
        dome.moveTo(-40 * sc, 2)
        dome.cubicTo(-40 * sc, 62 * sc, 40 * sc, 62 * sc, 40 * sc, 2)
        dome.close()
        c.shape(dome, hexa(pal.BELL_GOLD), ink, iw)
        c.save()
        c.clip(dome)
        c.fill(ellipse_path(-16 * sc, 26 * sc, 18 * sc, 20 * sc), rgba(pal.BELL_GOLD_LT, 0.8))
        c.fill(ellipse_path(6, 2, 60, 20), rgba(pal.BELL_GOLD_DK, 0.45))
        c.restore()
        c.rrect(-43 * sc, -4, 86 * sc, 11, 5, hexa(pal.BELL_GOLD_DK), ink, iw * 0.8)
        c.circle(0, 52 * sc, 8, hexa(pal.BELL_GOLD_DK), ink, iw * 0.9)
        c.line(0, 2, 0, -14, hexa(pal.HAND_DARK), 5)
        c.restore()


def _clock_feet(c: Canvas, feet, phase, ink, iw):
    if feet == "dangle":
        for sgn, off in ((-1, 0.0), (1, 0.14)):
            c.save()
            c.translate(sgn * 42, -84)
            c.rotate(sgn * -14 + math.sin((phase + off) * TAU) * 14)
            c.rrect(-21, -16, 42, 30, 14, hexa(pal.CLOCK_RED_DK), ink, iw * 0.85)
            c.circle(0, -13, 11, hexa(pal.CLOCK_CREAM), ink, iw * 0.65)
            c.restore()
    elif feet == "flat":
        for sgn in (-1, 1):
            c.save()
            c.translate(sgn * 58, -74)
            c.rotate(sgn * 80)
            c.rrect(-20, -14, 44, 26, 12, hexa(pal.CLOCK_RED_DK), ink, iw * 0.85)
            c.restore()
    else:
        for sgn, ph in ((-1, 0.0), (1, math.pi)):
            swing, lift = 0.0, 0.0
            if feet == "walk":
                swing = math.sin(phase * TAU + ph) * 26
                lift = max(0.0, math.sin(phase * TAU + ph)) * 9
            elif feet == "run":
                swing = math.sin(phase * TAU + ph) * 38
                lift = max(0.0, math.sin(phase * TAU + ph)) * 14
            elif feet == "jump":
                lift = 12
                swing = math.sin(phase * TAU + ph) * 14
            c.save()
            c.translate(sgn * 40 + swing * 0.45, -80 + lift)
            c.rotate(swing * 0.5)
            c.rrect(-20, -18, 40, 30, 13, hexa(pal.CLOCK_RED_DK), ink, iw * 0.85)
            c.circle(-2, -13, 10, hexa(pal.CLOCK_CREAM), ink, iw * 0.65)
            c.restore()


def _clock_hands(c: Canvas, hand_angle, arm, arm_angle, arm_len, arm_bend, ink, extra):
    """Two clock hands that double as the clock's arms.

    They sit on the 9 and 3 marks at rest (thin pointer hands hugging the rim)
    and stretch out to gesture / point / ring when the clock is acting.
    """
    hr, mn = hand_angle[0] + extra, hand_angle[1] + extra * 12
    for side in (-1, 1):
        c.save()
        if side < 0:
            c.translate(-86, 2)
            c.rotate(180 + hr)
            reach = 0.0 if arm is None else arm * 0.9
        else:
            c.translate(86, 2)
            c.rotate(0 - mn)
            reach = 0.0 if arm is None else arm
        # arm segment (grows out of the hand)
        L = 34 + reach * (arm_len - 34) * 0.55
        if reach > 0.03:
            bend = arm_bend * side
            mid = (math.sin(bend) * L * 0.30, L * 0.55)
            tip = (mid[0] + math.sin(bend * 1.7 + 0.25) * L * 0.5, L)
            c.stroke(smooth_open([(0, 0), (mid[0] * 0.5, L * 0.3), mid], 0.3),
                     hexa(pal.CLOCK_RED_DK), 13)
            c.stroke(smooth_open([mid, tip], 0.3), hexa(pal.CLOCK_RED_DK), 12)
        else:
            tip = (0, L)
        # clock-hand pointer
        pointer = polygon([(-7, 0), (0, L + 12), (7, 0), (0, -10)])
        c.shape(pointer, hexa(pal.HAND_DARK), ink, 4.2)
        c.circle(0, 0, 7.5, hexa(pal.BELL_GOLD), ink, 4.0)
        if reach > 0.03:
            # mitten hand at the tip
            c.save()
            c.translate(tip[0], tip[1])
            c.rotate(-math.degrees(arm_bend) * 0.25 * side)
            c.circle(0, 10, 13, hexa(pal.CLOCK_CREAM), ink, 4.4)
            c.line(-5, 6, -11, 13, ink, 3.0)
            c.restore()
        c.restore()


def _sweat_drop(c: Canvas, x, y, ink, t, amount):
    c.save()
    c.translate(x + 6 * math.sin(t * 9.0), y - 4)
    c.scale(amount, amount)
    d = P()
    d.moveTo(0, 24)
    d.cubicTo(-14, 6, -11, -13, 0, -13)
    d.cubicTo(11, -13, 14, 6, 0, 24)
    d.close()
    c.shape(d, hexa("#9FE0F5"), ink, 4)
    c.fill(ellipse_path(-3, 3, 3, 5), rgba("#FFFFFF", 0.85))
    c.restore()


def _dizzy_stars(c: Canvas, t, amount, ink):
    for i in range(3):
        a = t * 3.4 + i * TAU / 3
        sx = math.cos(a) * 92
        sy = math.sin(a) * 30 + 128
        sc = (0.75 + 0.28 * math.sin(a * 2.0)) * amount
        pts = []
        for k in range(10):
            ang = math.pi / 2 + k * TAU / 10
            r = 20 if k % 2 == 0 else 8
            pts.append((sx + math.cos(ang) * r * sc, sy + math.sin(ang) * r * sc))
        c.shape(polygon(pts), hexa("#FFE27A"), ink, 3.2)


def _winding_key(c: Canvas, amount, t, ink, iw):
    c.save()
    c.translate(100 + 18 * amount, -4)
    c.rotate(-t * 520 * amount)
    c.line(0, 0, 0, 24, hexa(pal.HAND_DARK), 9)
    c.stroke(ellipse_path(0, 26, 15, 15), ink, iw)
    c.stroke(ellipse_path(0, 26, 11, 11), hexa(pal.BELL_GOLD), 6)
    c.restore()


# --------------------------------------------------------------------------- #
# THE SUN
# --------------------------------------------------------------------------- #
SUN_R = 230.0


def draw_sun(
    c: Canvas, x: float, y: float, s: float = 1.0, rot: float = 0.0,
    sx: float = 1.0, sy: float = 1.0,
    eyes: str = "shut", look=(0.0, 0.0), eye_open: float = 1.0, lid: float = 0.0,
    mouth: str = "o", mouth_amt: float = 0.5,
    rays: float = 1.0, ray_spin: float = 0.0, ray_wobble: float = 0.0,
    ray_alpha: float = 1.0, glow: float = 0.0,
    blanket: float = 0.0, blanket_fill=None,
    nostril: float = 0.0, nose_twitch: float = 0.0, cheeks: float = 1.0,
    snore: float = 0.0, t: float = 0.0, blush_extra: float = 0.0,
):
    ink = col(pal.SUN_INK)
    iw = 7.0

    if glow > 0.01:
        from .gfx import rad_shader
        gp = skia.Paint(AntiAlias=True)
        gr = SUN_R * s * 2.2
        gp.setShader(rad_shader(x, y, gr,
                                [rgba(pal.SUN_GOLD_LT, 0.42 * glow),
                                 rgba(pal.SUN_GOLD_LT, 0.16 * glow),
                                 rgba(pal.SUN_GOLD_LT, 0.0)],
                                [0.24, 0.55, 1.0]))
        gp.setBlendMode(skia.BlendMode.kScreen)
        c.c.drawCircle(x, y, gr, gp)

    place(c, x, y, s, rot, sx, sy)

    # ---- rays -------------------------------------------------------------
    if rays > 0.01:
        n = 12
        if ray_alpha < 1.0:
            c.alpha_layer(ray_alpha)
        for i in range(n):
            a = ray_spin + i * TAU / n
            long = 1.0 if i % 2 == 0 else 0.7
            wob = math.sin(ray_wobble + i * 1.27) * 0.13
            r0 = SUN_R * 0.94
            r1 = SUN_R * (1.02 + (0.30 + wob) * long) * rays
            wid = SUN_R * 0.15
            px, py = math.cos(a), math.sin(a)
            nx, ny = -py, px
            p = P()
            p.moveTo(px * r0 + nx * wid * 0.5, py * r0 + ny * wid * 0.5)
            p.cubicTo(px * (r0 + r1) * 0.52 + nx * wid * 0.52,
                      py * (r0 + r1) * 0.52 + ny * wid * 0.52,
                      px * r1 * 0.80 + nx * wid * 0.18, py * r1 * 0.80 + ny * wid * 0.18,
                      px * r1, py * r1)
            p.cubicTo(px * r1 * 0.80 - nx * wid * 0.18, py * r1 * 0.80 - ny * wid * 0.18,
                      px * (r0 + r1) * 0.52 - nx * wid * 0.52,
                      py * (r0 + r1) * 0.52 - ny * wid * 0.52,
                      px * r0 - nx * wid * 0.5, py * r0 - ny * wid * 0.5)
            p.close()
            c.shape(p, hexa(pal.SUN_GOLD), ink, iw)
        if ray_alpha < 1.0:
            c.restore()

    # ---- disc -------------------------------------------------------------
    disc = ellipse_path(0, 0, SUN_R, SUN_R * 0.97)
    c.shape(disc, hexa(pal.SUN_GOLD), ink, iw)
    c.save()
    c.clip(disc)
    c.fill(ellipse_path(0, SUN_R * 0.42, SUN_R * 1.1, SUN_R * 0.62),
           rgba(pal.SUN_GOLD_DK, 0.5))
    c.fill(ellipse_path(-SUN_R * 0.34, SUN_R * 0.46, SUN_R * 0.46, SUN_R * 0.26, -0.5),
           rgba(pal.SUN_GOLD_LT, 0.75))
    c.restore()

    # ---- nose (soft, only really shows when it flares) --------------------
    twk = math.sin(nose_twitch * 7.0) * 5.0 * (1 if nose_twitch else 0)
    nose_y = -SUN_R * 0.08
    c.save()
    c.clip(disc)
    c.fill(ellipse_path(twk, nose_y + 6, 30 + 10 * nostril, 19 + 7 * nostril),
           rgba(pal.SUN_GOLD_DK, 0.55))
    c.fill(ellipse_path(twk, nose_y + 14, 18 + 8 * nostril, 9 + 5 * nostril),
           rgba("#C8763A", 0.35))
    c.restore()
    if nostril > 0.08:
        for sgn in (-1, 1):
            c.shape(ellipse_path(twk + sgn * 12, nose_y + 4, 3.0 + 7 * nostril,
                                 2.5 + 4.5 * nostril), hexa("#A85622"), None)

    # ---- eyes -------------------------------------------------------------
    ex, ey = 88.0, SUN_R * 0.30
    if eyes == "shut":
        for sgn in (-1, 1):
            c.stroke(smooth_open([(sgn * ex - 40, ey + 4), (sgn * ex, ey - 20),
                                  (sgn * ex + 40, ey + 4)], 0.9), ink, 7.5)
            c.line(sgn * ex - 26, ey + 30, sgn * ex + 26, ey + 30, with_alpha(ink, 0.0), 1)
    elif eyes == "happy":
        for sgn in (-1, 1):
            c.stroke(smooth_open([(sgn * ex - 38, ey - 2), (sgn * ex, ey + 34),
                                  (sgn * ex + 38, ey - 2)], 0.9), ink, 7.5)
    elif eyes == "squeeze":
        for sgn in (-1, 1):
            c.stroke(smooth_open([(sgn * ex - 34, ey + 30), (sgn * ex + 30, ey - 4)], 0.2),
                     ink, 7.5)
            c.line(sgn * (ex - 26), ey + 62, sgn * (ex + 30), ey + 52, ink, 6)
    else:
        l = 0.0 if eyes == "wide" else lid
        for sgn in (-1, 1):
            draw_eye(c, sgn * ex, ey, 43, max(0.0, eye_open if eyes != "wide" else 1.15),
                     (look[0], look[1]), "round", ink=ink, pupil=hexa("#4A2A18"),
                     lid=l, pupil_scale=0.85, ink_w=5.2, white="#FFFCF2")
        if eyes == "wide":
            for sgn in (-1, 1):
                c.line(sgn * (ex - 38), ey + 60, sgn * (ex + 34), ey + 48, ink, 6.5)

    # ---- cheeks -----------------------------------------------------------
    if cheeks > 0:
        c.save()
        c.clip(disc)
        for sgn in (-1, 1):
            c.fill(ellipse_path(sgn * 150, -96, 30, 17),
                   rgba(pal.SUN_CHEEK, (0.5 + 0.4 * blush_extra) * cheeks))
        c.restore()

    # ---- mouth ------------------------------------------------------------
    draw_mouth(c, 0, -SUN_R * 0.40, 64, mouth, mouth_amt, ink, 6, fill="#8F4A3A")

    # ---- blanket (a small cloud pulled up like a duvet) -------------------
    if blanket > 0:
        top = -SUN_R * (0.62 - 1.16 * blanket)
        dv = blanket_path(SUN_R * 1.62, top, -SUN_R * 1.45, seed=5, lobes=4)
        bink = col(pal.INK)
        bfill = mix(blanket_fill or pal.CLOUD_NIGHT, "#9AAEE6", 0.45)
        c.shape(dv, bfill, bink, 6.5)
        c.save()
        c.clip(dv)
        for i, (fx, fy, fr) in enumerate(((-0.55, 0.26, 0.42), (0.5, 0.34, 0.34),
                                          (0.0, 0.15, 0.3))):
            c.fill(ellipse_path(SUN_R * fx, top - SUN_R * fy, SUN_R * fr,
                                SUN_R * 0.10), rgba("#C7D4F5", 0.35))
        c.restore()

    c.restore()


def blanket_path(width, top, bottom, seed=3, lobes=5, wave=None):
    """A cloud pulled up like a duvet: puffy silhouette with a wavy top edge."""
    puff = cloud_path(0, top + (bottom - top) * 0.55, width,
                      (bottom - top) * 1.9, seed=seed, lobes=lobes)
    n = 13
    wp = P()
    wob = wave if wave is not None else []
    wp.moveTo(-width, bottom)
    wp.lineTo(-width, top)
    for i in range(n + 1):
        u = i / n
        x = -width + u * width * 2
        y = top + math.sin(u * math.tau * lobes * 0.5) * (bottom - top) * 0.075
        wp.lineTo(x, y)
    wp.lineTo(width, bottom)
    wp.close()
    b = skia.OpBuilder()
    b.add(puff, skia.kIntersect_PathOp)
    b.add(wp, skia.kIntersect_PathOp)
    return b.resolve()


# --------------------------------------------------------------------------- #
# BIRDS
# --------------------------------------------------------------------------- #
def draw_bird(c: Canvas, x, y, s=1.0, rot=0.0, awake=0.0, bob=0.0, flap=0.0,
              look=(0.0, 0.0), squash=1.0, color="#8FA3D6"):
    place(c, x, y, s, rot, 1.0, squash)
    ink = col(pal.INK)
    iw = 4.5
    tail = polygon([(-26, 4), (-58, 20), (-54, -4), (-24, -10)])
    c.shape(tail, col(color), ink, iw * 0.8)
    body = ellipse_path(0, 0, 34, 30)
    c.shape(body, rgba(color, 1.0), ink, iw)
    c.fill(ellipse_path(6, -11, 21, 14), rgba("#FFFFFF", 0.18))
    c.save()
    c.translate(-3, 1)
    c.rotate(-16 + flap)
    c.shape(ellipse_path(0, 0, 19, 11), hexa(pal.BIRD_BLUE), ink, iw * 0.75)
    c.restore()
    c.save()
    c.translate(23 + look[0] * 4, 17 + bob * 3)
    c.rotate(-5 + bob * 5)
    c.circle(0, 0, 21, rgba(color, 1.0), ink, iw)
    beak = polygon([(16, 7), (41, 0), (16, -8)])
    c.shape(beak, hexa("#F6A94E"), ink, iw * 0.75)
    if awake > 0.5:
        draw_eye(c, 6, 7, 11, 1.0, look, "round", ink=ink, ink_w=2.8)
    else:
        c.stroke(smooth_open([(-3, 6), (13, 2)], 0.6), ink, 3.6)
    c.restore()
    c.restore()


# --------------------------------------------------------------------------- #
# PROPS
# --------------------------------------------------------------------------- #
def draw_feather(c: Canvas, x, y, s=1.0, rot=0.0, wave=0.0, alpha=1.0):
    if alpha < 1:
        c.alpha_layer(alpha)
    place(c, x, y, s, rot)
    ink = col(pal.INK)
    vane = P()
    vane.moveTo(0, -56)
    vane.cubicTo(-30 + wave * 12, -22, -27 + wave * 14, 32, 0, 58)
    vane.cubicTo(27 + wave * 14, 32, 30 + wave * 12, -22, 0, -56)
    vane.close()
    c.shape(vane, hexa("#FFFDF6"), ink, 3.4)
    for i in range(-4, 5):
        yy = i * 11
        w = 17 * (1 - abs(i) / 5.6)
        c.line(-w + wave * 9, yy, 0, yy + 7, rgba("#CFC7B6", 0.95), 2.2)
        c.line(w + wave * 9, yy, 0, yy + 7, rgba("#CFC7B6", 0.95), 2.2)
    c.line(0, -64, 0, 68, hexa("#C9B9A2"), 3.4)
    c.restore()
    if alpha < 1:
        c.restore()


def draw_note(c: Canvas, x, y, s=1.0, rot=0.0, alpha=1.0, color=None):
    if alpha <= 0.01:
        return
    c.save()
    if alpha < 1:
        c.alpha_layer(alpha)
    c.translate(x, y)
    c.rotate(rot)
    c.scale(s, s)
    ink = col(pal.INK)
    c.fill(ellipse_path(-2, 0, 11, 8, -0.35), col(color or pal.BELL_GOLD))
    c.line(6, -2, 8, 32, ink, 4)
    c.stroke(smooth_open([(8, 32), (20, 29), (22, 16)], 0.7), ink, 4)
    c.restore()
    if alpha < 1:
        c.restore()


def star_path(x, y, r, rot=0.0, points=5, inner=0.44):
    pts = []
    n = points * 2
    for i in range(n):
        a = rot + math.pi / 2 + i * TAU / n
        rr = r if i % 2 == 0 else r * inner
        pts.append((x + math.cos(a) * rr, y + math.sin(a) * rr))
    return polygon(pts)


def draw_star(c: Canvas, x, y, r=14, color="#FFF2B0", alpha=1.0, rot=0.0,
              ink=None, points=5, inner=0.44):
    if alpha <= 0.01:
        return
    if alpha < 1:
        c.alpha_layer(alpha)
    c.shape(star_path(x, y, r, rot, points, inner), col(color),
            col(ink) if ink else None, 2.2)
    if alpha < 1:
        c.restore()


def draw_burst(c: Canvas, x, y, r0, r1, n=12, color="#FFFFFF", alpha=1.0,
               width=6.0, rot=0.0, inner_ratio=0.55, ink=None):
    """Radial speed lines / sparkle burst."""
    if alpha <= 0.01:
        return
    if alpha < 1:
        c.alpha_layer(alpha)
    for i in range(n):
        a = rot + i * TAU / n
        rr0 = r0 + (r1 - r0) * inner_ratio
        c.line(x + math.cos(a) * rr0, y + math.sin(a) * rr0,
               x + math.cos(a) * r1, y + math.sin(a) * r1, col(color), width)
    if alpha < 1:
        c.restore()
