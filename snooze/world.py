"""world.py - the stage: sky, horizon glow, layered city, clouds and effects.

Each layer is a plain function that draws into the world canvas, so a scene can
compose them with different parallax offsets (camera push / pan / tilt).
"""

from __future__ import annotations

import math

import skia

from . import palette as pal
from .characters import cloud_path, draw_cloud, draw_star, star_path
from .gfx import (W, H, P, Canvas, ellipse_path, hexa, lerp, lin_shader, fill_paint,
                  mix, rad_shader, rgba, smooth_closed, smooth_open, union,
                  with_alpha, col, pulse, smooth_noise)


# --------------------------------------------------------------------------- #
# sky
# --------------------------------------------------------------------------- #
def draw_sky(c: Canvas, sky, tint=None, warm=0.0, glow_strength=1.0,
             glow_y=None, top_alpha=1.0):
    """Vertical gradient plus a warm horizon band."""
    colors = [hexa(sky.top), hexa(sky.mid), hexa(sky.horizon)]
    p = fill_paint(colors[0])
    p.setShader(lin_shader(0, -H * 0.15, 0, H * 0.92, colors, [0.0, 0.42, 1.0]))
    c.c.drawPaint(p)
    if tint is not None:
        c.c.drawPaint(fill_paint(col(tint)))
    gy = glow_y if glow_y is not None else H * 0.70
    if glow_strength > 0.001:
        gp = skia.Paint(AntiAlias=True)
        gp.setShader(rad_shader(W * 0.5, gy, H * 0.72,
                                [rgba(sky.glow, 0.95 * glow_strength),
                                 rgba(sky.glow, 0.42 * glow_strength),
                                 rgba(sky.glow, 0.0)],
                                [0.0, 0.42, 1.0]))
        gp.setBlendMode(skia.BlendMode.kScreen)
        c.c.drawPaint(gp)
    if warm > 0:
        wp = skia.Paint(AntiAlias=True)
        wp.setShader(lin_shader(0, H * 0.30, 0, H,
                                [rgba("#FFB27A", 0.0), rgba("#FFB27A", 0.30 * warm)]))
        c.c.drawPaint(wp)


def draw_stars(c: Canvas, t: float, alpha: float, seed=1, count=90, area_top=0.0,
               area_bottom=0.86, twinkle=1.0):
    import numpy as np
    # stable star field built from smooth noise functions
    for i in range(count):
        u = (math.sin(i * 12.9898 + seed) * 43758.5453) % 1.0
        v = (math.sin(i * 78.233 + seed * 3.7) * 43758.5453) % 1.0
        x = u * W * 1.06 - W * 0.03
        y = area_top * H + v * (area_bottom - area_top) * H
        tw = 0.55 + 0.45 * math.sin(t * (1.2 + (i % 7) * 0.35) + i)
        a = alpha * (0.35 + 0.65 * tw) * (0.45 + 0.55 * (1 - v))
        if a <= 0.02:
            continue
        r = 1.6 + (i % 5) * 1.15
        draw_star(c, x, y, r, alpha=a, rot=t * 0.15 + i, points=4, inner=0.2,
                  color="#EAF0FF")


def draw_cloud_band(c: Canvas, y, w, h, fill, ink=None, ink_w=3.0, alpha=1.0,
                    seed=0, lobes=6, x=W / 2, drift=0.0):
    draw_cloud(c, x + drift, y, w, h, col(fill), col(ink) if ink else None, ink_w,
               seed=seed, lobes=lobes, alpha=alpha)


def draw_moon(c: Canvas, x, y, r, alpha=1.0, glow=0.6, color="#F2EEDC"):
    if alpha <= 0.01:
        return
    if alpha < 1:
        c.alpha_layer(alpha)
    c.circle(x, y, r * 2.4, rgba(color, 0.05 * glow), None)
    c.circle(x, y, r * 1.5, rgba(color, 0.07 * glow), None)
    c.circle(x, y, r, rgba(color, 0.95), rgba("#C9C2A8", 0.8), 3)
    c.circle(x - r * 0.3, y - r * 0.22, r * 0.16, rgba("#DED8C4", 0.8), None)
    c.circle(x + r * 0.28, y + r * 0.3, r * 0.11, rgba("#DED8C4", 0.7), None)
    if alpha < 1:
        c.restore()


# --------------------------------------------------------------------------- #
# city
# --------------------------------------------------------------------------- #
# static skyline definitions (x, width, height, roof type, seed)
FAR = [
    (30, 210, 210, "pitch"), (230, 150, 300, "antenna"), (370, 260, 170, "pitch"),
    (620, 170, 330, "flat"), (780, 240, 210, "watertower"), (1010, 190, 280, "pitch"),
]
MID = [
    (-30, 250, 250, "pitch"), (200, 180, 340, "flat"), (360, 260, 200, "pitch"),
    (600, 150, 400, "antenna"), (740, 270, 240, "pitch"), (990, 180, 330, "flat"),
]
NEAR = [
    (-60, 300, 190, "pitch"), (230, 210, 300, "flat"), (430, 290, 160, "pitch"),
    (700, 200, 350, "watertower"), (890, 260, 210, "pitch"),
]


def _roof(c: Canvas, x, w, top, kind, ink, fill, iw=3.0):
    if kind == "pitch":
        p = P()
        p.moveTo(x - w * 0.10, top + 6)
        p.lineTo(x + w * 0.5, top - w * 0.40)
        p.lineTo(x + w * 1.10, top + 6)
        p.close()
        c.shape(p, fill, ink, iw)
        # chimney
        chx = x + w * (0.66 if (int(x) % 2 == 0) else 0.28)
        c.rrect(chx, top - w * 0.30, w * 0.12, w * 0.26, 3, fill, ink, iw * 0.8)
    elif kind == "antenna":
        c.line(x + w * 0.5, top, x + w * 0.5, top - 60, ink, 3.0)
        c.line(x + w * 0.32, top - 44, x + w * 0.68, top - 44, ink, 2.4)
        c.circle(x + w * 0.5, top - 64, 4, rgba("#FF6A6A", 0.9), None)
    elif kind == "watertower":
        legs = P()
        legs.moveTo(x + w * 0.26, top)
        legs.lineTo(x + w * 0.34, top - 46)
        legs.moveTo(x + w * 0.74, top)
        legs.lineTo(x + w * 0.66, top - 46)
        c.stroke(legs, ink, 3.2)
        c.rrect(x + w * 0.24, top - 84, w * 0.52, 40, 6, fill, ink, iw)


def draw_warm_wash(c: Canvas, amount=1.0, colors=("#FFB07A", "#FFD9A0"), alpha=0.55):
    """Screen-blended warm light flooding the frame (dawn spreading)."""
    if amount <= 0.001:
        return
    p = skia.Paint(AntiAlias=True)
    p.setShader(lin_shader(0, H * 0.15, 0, H,
                           [rgba(colors[1], alpha * 0.75 * amount),
                            rgba(colors[0], alpha * amount),
                            rgba(colors[0], alpha * 0.55 * amount)],
                           [0.0, 0.55, 1.0]))
    p.setBlendMode(skia.BlendMode.kScreen)
    c.c.drawPaint(p)


def draw_city_far(c: Canvas, base_y, color, ink=None, window_alpha=0.0, t=0.0,
                  window_color="#FFCE73", offset=0.0):
    """Distant skyline: simple silhouettes, tiny windows."""
    for i, (x, w, h, kind) in enumerate(FAR):
        xx = x + offset
        top = base_y - h
        fill = mix(color, "#FFFFFF", 0.06 + 0.03 * (i % 3))
        c.fill(skP(xx, top, w, h + 400), col(fill))
        _roof(c, xx, w, top, kind, rgba(fill, 0.0) if ink is None else ink, col(fill), 2.5)
        if window_alpha > 0:
            for r in range(int(h // 46)):
                for k in range(max(1, int(w // 44))):
                    if (r * 7 + k * 5 + i) % 5 == 0:
                        wx = xx + 14 + k * 44
                        wy = top + 22 + r * 46
                        lit = 0.35 + 0.65 * abs(math.sin(i + r + k))
                        c.rrect(wx, wy, 16, 20, 3,
                                rgba(window_color, window_alpha * lit), None)


def skP(x, y, w, h) -> skia.Path:
    p = P()
    p.addRect(skia.Rect.MakeXYWH(float(x), float(y), float(w), float(h)))
    return p


def draw_city_mid(c: Canvas, base_y, color, ink, window_alpha=0.0, t=0.0,
                  window_color="#FFCE73", offset=0.0, curtain_flare=0.0):
    for i, (x, w, h, kind) in enumerate(MID):
        xx = x + offset
        top = base_y - h
        fill = mix(color, "#5A6AA8", 0.05 + 0.04 * (i % 2))
        body = skP(xx, top, w, h + 500)
        c.shape(body, col(fill), col(ink), 3.2)
        _roof(c, xx, w, top, kind, col(ink), col(fill), 3.2)
        if window_alpha > 0:
            rows = int(h // 62)
            cols = max(1, int((w - 30) // 52))
            for r in range(rows):
                for k in range(cols):
                    if (r * 5 + k * 3 + i * 2) % 4 == 0:
                        wx = xx + 20 + k * 52
                        wy = top + 28 + r * 62
                        fl = 0.45 + 0.55 * abs(math.sin(i * 2.1 + r * 1.3 + k))
                        c.rrect(wx, wy, 26, 34, 4,
                                rgba(window_color, window_alpha * fl), None)
                        c.line(wx + 13, wy, wx + 13, wy + 34,
                               rgba("#2A2038", window_alpha * 0.5), 1.6)


def draw_city_near(c: Canvas, base_y, color, ink, offset=0.0, detail=1.0,
                   warm=0.0):
    for i, (x, w, h, kind) in enumerate(NEAR):
        xx = x + offset
        top = base_y - h
        fill = mix(color, "#6A78B0", 0.03 * (i % 3) + warm * 0.1)
        body = skP(xx, top, w, h + 700)
        c.shape(body, col(fill), col(ink), 3.6)
        _roof(c, xx, w, top, kind, col(ink), col(fill), 3.6)


def draw_rooftop_props(c: Canvas, x, y, kind="bird", scale=1.0, t=0.0, ink=None):
    pass


# --------------------------------------------------------------------------- #
# windows / curtains / flowers (story beats)
# --------------------------------------------------------------------------- #
def draw_window(c: Canvas, x, y, w, h, open_amt=0.0, warmth=0.0, kind="peek",
                t=0.0, ink=pal.INK):
    """A city window: shutter-style curtains that part, a warm glow, a silhouette."""
    ink = col(ink)
    frame = P()
    frame.addRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x - w / 2, y - h / 2, w, h),
                                         w * 0.12, w * 0.12))
    c.shape(frame, hexa("#2A3568"), ink, 4)
    inner = P()
    inner.addRRect(skia.RRect.MakeRectXY(
        skia.Rect.MakeXYWH(x - w / 2 + 10, y - h / 2 + 10, w - 20, h - 20),
        w * 0.09, w * 0.09))
    c.save()
    c.clip(inner)
    # room inside: dark, warming up
    c.fill(inner, rgba(mix("#0E1436", "#FFB463", warmth * 0.85), 1.0))
    if open_amt > 0.05:
        # the sleeper peeking: a simple silhouette head
        hx = x + w * 0.05
        hy = y + h * 0.12
        c.circle(hx, hy, w * 0.20, rgba("#1A1030", 0.9), None)
        c.save()
        c.clip(ellipse_path(hx, hy, w * 0.2, w * 0.2))
        c.fill(ellipse_path(hx + w * 0.10, hy - w * 0.02, w * 0.05, w * 0.035),
               rgba("#FFE6B0", 0.9), None)
        c.restore()
    c.restore()
    # curtains: two panels sliding apart
    for sgn in (-1, 1):
        panel_w = (w - 20) * (0.52 - 0.5 * open_amt)
        px = x + sgn * ((w - 20) / 2 - panel_w / 2) - (0 if sgn < 0 else 0)
        c.save()
        c.translate(px, y)
        cur = P()
        cur.addRRect(skia.RRect.MakeRectXY(
            skia.Rect.MakeXYWH(-panel_w / 2, -(h - 20) / 2, panel_w, h - 20),
            panel_w * 0.25, panel_w * 0.25))
        c.shape(cur, hexa("#F2C9A0") if warmth > 0.3 else hexa("#7B6FB0"), ink, 3.4)
        for k in (-1, 0, 1):
            c.line(sgn * k * 0 + k * panel_w * 0.22, -(h - 24) / 2,
                   k * panel_w * 0.22, (h - 24) / 2,
                   rgba("#2C1B3A", 0.25), 2.0)
        c.restore()


def draw_flower(c: Canvas, x, y, s=1.0, open_amt=1.0, rot=0.0, color="#FF9EC4",
                t=0.0):
    c.save()
    c.translate(x, y)
    c.rotate(math.degrees(rot))
    c.scale(s, s)
    ink = col(pal.INK)
    # stem
    c.stroke(smooth_open([(0, 0), (-4, 20), (0, 44)], 0.6), hexa("#4E9A5A"), 5)
    # leaves
    for sgn in (-1, 1):
        lp = P()
        lp.moveTo(0, 26)
        lp.cubicTo(sgn * 22, 20, sgn * 26, 34, 0, 30)
        lp.close()
        c.shape(lp, hexa("#5FB06A"), ink, 2.4)
    # petals
    n = 6
    for i in range(n):
        a = rot * 0 + i * math.tau / n + 0.3
        rr = 10 + 10 * open_amt
        px = math.cos(a) * rr * 0.8
        py = math.sin(a) * rr * 0.8
        c.shape(ellipse_path(px, py - 4, 9 * (0.6 + 0.4 * open_amt),
                             12 * (0.6 + 0.4 * open_amt), a),
                hexa(color), ink, 2.4)
    c.circle(0, -4, 7 * (0.7 + 0.3 * open_amt), hexa("#FFD45E"), ink, 2.2)
    c.restore()


def draw_bird_flap_burst(c: Canvas, x, y, alpha=0.6, r=40, color="#FFFFFF",
                         n=3):
    for i in range(n):
        p = smooth_open([(x - r * 0.6, y + i * 12), (x - r * 1.6 - i * 10, y + 6 + i * 14)],
                        0.4)
        c.stroke(p, rgba(color, alpha), 4)


# --------------------------------------------------------------------------- #
# effects
# --------------------------------------------------------------------------- #
def draw_sound_rings(c: Canvas, x, y, t, power=1.0, color="#FFD465", n=3,
                     speed=1.0, thickness=7.0, alpha=1.0, max_r=260):
    """Bell ring waves."""
    for i in range(n):
        u = ((t * speed + i / n) % 1.0)
        r = 60 + u * max_r
        a = (1 - u) ** 1.4 * alpha * power
        if a <= 0.02:
            continue
        c.stroke(ellipse_path(x, y, r, r * 0.86), rgba(color, a * 0.9), thickness)
        c.stroke(ellipse_path(x, y, r * 0.82, r * 0.7), rgba(color, a * 0.45),
                 thickness * 0.6)


def draw_snore_puffs(c: Canvas, x, y, t, alpha=1.0, scale=1.0, rise=1.0,
                     color="#C8D4FF", spread=(120.0, 150.0)):
    """Soft blobby snores drifting up and out (no text)."""
    for i in range(3):
        u = ((t * 0.42 + i / 3.0) % 1.0)
        px = x + u * spread[0] + math.sin(u * 5.0 + i) * 18
        py = y - u * spread[1] * rise
        r = (8 + u * 26) * scale
        a = math.sin(u * math.pi) * alpha
        if a <= 0.02:
            continue
        c.circle(px, py, r, rgba(color, a * 0.5), None)
        c.circle(px, py, r * 0.62, rgba(color, a * 0.7), None)


def draw_zz(c: Canvas, x, y, t, alpha=1.0, scale=1.0, color="#D8E0FF"):
    """Nested bubble shapes reading as sleep."""
    for i in range(3):
        u = ((t * 0.6 + i / 3.0) % 1.0)
        px = x + 46 * u + math.sin(u * 4 + i) * 16
        py = y - 60 - u * 170
        r = (9 + i * 4 + u * 16) * scale
        a = math.sin(u * math.pi) * alpha * 0.85
        if a <= 0.02:
            continue
        c.circle(px, py, r, rgba(color, a * 0.55), None)


def draw_wind_streaks(c: Canvas, t, power=1.0, direction=(1, 0.15), color="#DCE8FF",
                      count=16, seed=3, alpha=1.0, spread=1.0):
    for i in range(count):
        ph = (i * 0.618) % 1.0
        u = ((t * (0.9 + (i % 5) * 0.12) + ph) % 1.0)
        y = H * (0.05 + 0.9 * ((i * 0.37 + 0.13) % 1.0))
        x = -200 + u * (W + 400)
        ln = (120 + (i % 4) * 90) * power * spread
        a = math.sin(u * math.pi) * 0.55 * alpha
        if a <= 0.02:
            continue
        c.line(x, y, x + ln * direction[0], y + ln * direction[1],
               rgba(color, a), 3.0 + (i % 3) * 2.4)


def draw_speed_lines(c: Canvas, x, y, angle, length, n=5, alpha=0.6,
                     color="#FFFFFF", spread=90, width=5.0):
    a = math.radians(angle)
    for i in range(n):
        off = (i - (n - 1) / 2) * spread / max(1, n - 1)
        ox = math.cos(a + math.pi / 2) * off
        oy = math.sin(a + math.pi / 2) * off
        c.line(x + ox, y + oy, x + ox + math.cos(a) * length,
               y + oy + math.sin(a) * length, rgba(color, alpha), width)


def draw_puff(c: Canvas, x, y, r, alpha=1.0, color="#FFFFFF", seed=0, ink=None):
    if alpha <= 0.01:
        return
    p = cloud_path(x, y, r * 2, r * 1.5, seed=seed, lobes=4)
    if alpha < 1:
        c.alpha_layer(alpha)
    c.shape(p, col(color), col(ink) if ink else None, 2.5)
    if alpha < 1:
        c.restore()


def draw_light_beam(c: Canvas, x0, y0, x1, y1, w0, w1, color="#FFE7A8", alpha=0.5,
                    n=3, spread=0.0):
    """A soft beam of warm light (the Sun's thank-you)."""
    ang = math.atan2(y1 - y0, x1 - x0)
    for i in range(n):
        a = ang + (i - (n - 1) / 2) * spread
        p = P()
        p.moveTo(x0, y0)
        p.lineTo(x1 + math.cos(a - 0.05) * 10, y1 + math.sin(a - 0.05) * 10)
        p.lineTo(x1 + math.cos(a + 0.05) * 10 + math.cos(ang) * w1,
                 y1 + math.sin(a + 0.05) * 10 + math.sin(ang) * w1)
        p.lineTo(x0, y0)
        p.close()
    gp = skia.Paint(AntiAlias=True)
    gp.setShader(lin_shader(x0, y0, x1, y1,
                            [rgba(color, alpha), rgba(color, alpha * 0.5),
                             rgba(color, 0.0)], [0.0, 0.6, 1.0]))
    gp.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, 26))
    for i in range(n):
        a = ang + (i - (n - 1) / 2) * max(0.02, spread)
        p = P()
        p.moveTo(x0, y0)
        p.lineTo(x1 + math.cos(a) * w1 * 0.5, y1 + math.sin(a) * w1 * 0.5)
        p.lineTo(x1 + math.cos(a) * w1 * 1.4, y1 + math.sin(a) * w1 * 1.4)
        p.close()
        c.c.drawPath(p, gp)


def draw_ribbon(c: Canvas, pts, width, colors, alpha=1.0, taper=True):
    """A painted ribbon of colour laid along a path (the dawn-painting gag)."""
    if len(pts) < 2:
        return
    n = len(pts)
    left, right = [], []
    for i, (x, y) in enumerate(pts):
        x2, y2 = pts[min(n - 1, i + 1)]
        x1, y1 = pts[max(0, i - 1)]
        dx, dy = x2 - x1, y2 - y1
        ln = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / ln, dx / ln
        w = width * (0.45 + 0.55 * (i / max(1, n - 1))) if taper else width
        left.append((x + nx * w / 2, y + ny * w / 2))
        right.append((x - nx * w / 2, y - ny * w / 2))
    poly = left + right[::-1]
    path = smooth_closed(poly, 0.3)
    p = fill_paint(colors[0] if not isinstance(colors, list) else colors[0])
    if isinstance(colors, (list, tuple)) and len(colors) > 1:
        p.setShader(lin_shader(pts[0][0], pts[0][1], pts[-1][0], pts[-1][1],
                               [col(cc) for cc in colors]))
    if alpha < 1:
        c.alpha_layer(alpha)
    c.c.drawPath(path, p)
    if alpha < 1:
        c.restore()
    return path


def draw_horizon_band(c: Canvas, y, height, colors, alpha=1.0, glow=1.0):
    """The painted dawn band sitting on the horizon."""
    if alpha <= 0.001:
        return
    p = fill_paint(col(colors[0]))
    p.setShader(lin_shader(0, y - height * 0.9, 0, y + height * 0.25,
                           [rgba(colors[0], 0.0), rgba(colors[1], 0.55 * alpha),
                            rgba(colors[2], 0.9 * alpha), rgba(colors[2], 0.9 * alpha)],
                           [0.0, 0.45, 0.78, 1.0]))
    c.c.drawRect(skia.Rect.MakeLTRB(0, y - height * 0.9, W, H + 40), p)
    if glow > 0:
        gp = skia.Paint(AntiAlias=True)
        gp.setShader(rad_shader(W / 2, y, W * 0.95,
                                [rgba(colors[1], 0.34 * alpha * glow),
                                 rgba(colors[1], 0.0)],
                                [0.24, 1.0]))
        gp.setBlendMode(skia.BlendMode.kScreen)
        c.c.drawPaint(gp)
