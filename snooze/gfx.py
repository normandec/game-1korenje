"""gfx.py - low level 2D drawing toolkit used by the SNOOZE film.

Everything is drawn with skia (a hand-drawn-flavoured vector rasteriser) at a
supersampled resolution and then downsampled, which gives the clean, inked
look of a 2D animation rather than a filtered 3D render.

World space: a 1080 x 1920 frame, origin at top-left, y pointing down.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterable, Sequence

import numpy as np
import skia

W, H = 1080, 1920
FPS = 24
DURATION = 120.0
FRAMES = int(FPS * DURATION)  # 2880


# --------------------------------------------------------------------------- #
# colour helpers
# --------------------------------------------------------------------------- #
def hexa(s: str) -> skia.Color:
    """'#rrggbb' -> skia colour."""
    s = s.lstrip('#')
    r, g, b = int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)
    return skia.Color(r, g, b)


def rgb_of(c) -> tuple:
    """skia colours are packed ints; pull the channels back out."""
    return skia.ColorGetR(c), skia.ColorGetG(c), skia.ColorGetB(c)


def rgba(s, a: float) -> skia.Color:
    if isinstance(s, str):
        r, g, b = rgb_of(hexa(s))
    else:
        r, g, b = rgb_of(s)
    return skia.Color(r, g, b, int(max(0.0, min(1.0, a)) * 255))


def _co(v) -> skia.Color:
    return hexa(v) if isinstance(v, str) else v


def to_hex(c) -> str:
    """Packed skia colour -> '#rrggbb' so colours can be re-mixed."""
    r, g, b = rgb_of(c)
    return "#%02X%02X%02X" % (r, g, b)


def mix(c1, c2, t: float) -> skia.Color:
    """Blend two colours (sRGB space, good enough for stylised art)."""
    t = max(0.0, min(1.0, t))
    a, b = _co(c1), _co(c2)
    A = rgb_of(a) + (skia.ColorGetA(a),)
    B = rgb_of(b) + (skia.ColorGetA(b),)
    return skia.Color(*(round(A[i] + (B[i] - A[i]) * t) for i in range(4)))


def mixa(c1: str, c2: str, t: float, alpha: float) -> skia.Color:
    c = mix(c1, c2, t)
    return skia.Color(c.r(), c.g(), c.b(), int(max(0.0, min(1.0, alpha)) * 255))


def with_alpha(c, a: float) -> skia.Color:
    r, g, b = rgb_of(c)
    return skia.Color(r, g, b, int(max(0.0, min(1.0, a)) * 255))


# --------------------------------------------------------------------------- #
# paths
# --------------------------------------------------------------------------- #
def P() -> skia.Path:
    return skia.Path()


def polygon(pts: Sequence[Sequence[float]]) -> skia.Path:
    p = P()
    if not pts:
        return p
    p.moveTo(float(pts[0][0]), float(pts[0][1]))
    for x, y in pts[1:]:
        p.lineTo(float(x), float(y))
    p.close()
    return p


def blob(cx: float, cy: float, r: float, seed: int, wobble: float = 0.05,
         n: int = 18, ry: float = None) -> skia.Path:
    """Slightly irregular closed blob - the hand-drawn version of a circle."""
    ry = r if ry is None else ry
    rng = np.random.default_rng(seed)
    ph = rng.random(n) * math.tau
    amp = (rng.random(n) - 0.5) * 2 * wobble
    pts = []
    for i in range(n):
        a = math.tau * i / n
        k = 1.0 + amp[i] * 0.5 + 0.0
        pts.append((cx + math.cos(a) * r * k, cy + math.sin(a) * ry * k))
    return smooth_closed(pts)


def union(*paths) -> skia.Path:
    """Boolean union of several paths -> one silhouette with one outline."""
    b = skia.OpBuilder()
    for p in paths:
        if p is not None:
            b.add(p, skia.kUnion_PathOp)
    return b.resolve()


def bez_pts(pts, tension=0.42):
    """Convert a point list into (points, rounded) for path_through."""
    return list(pts)


def smooth_closed(pts: Sequence[Sequence[float]], tension: float = 0.42) -> skia.Path:
    """Closed Catmull-Rom style curve through points, as cubic beziers."""
    p = P()
    n = len(pts)
    if n < 3:
        return polygon(pts)
    p.moveTo(float(pts[0][0]), float(pts[0][1]))
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 3.0, p1[1] + (p2[1] - p0[1]) * tension / 3.0)
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 3.0, p2[1] - (p3[1] - p1[1]) * tension / 3.0)
        p.cubicTo(c1[0], c1[1], c2[0], c2[1], float(p2[0]), float(p2[1]))
    p.close()
    return p


def smooth_open(pts: Sequence[Sequence[float]], tension: float = 0.42) -> skia.Path:
    p = P()
    n = len(pts)
    if n < 2:
        return p
    p.moveTo(float(pts[0][0]), float(pts[0][1]))
    if n == 2:
        p.lineTo(float(pts[1][0]), float(pts[1][1]))
        return p
    for i in range(n - 1):
        p0 = pts[max(0, i - 1)]
        p1 = pts[i]
        p2 = pts[i + 1]
        p3 = pts[min(n - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 3.0, p1[1] + (p2[1] - p0[1]) * tension / 3.0)
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 3.0, p2[1] - (p3[1] - p1[1]) * tension / 3.0)
        p.cubicTo(c1[0], c1[1], c2[0], c2[1], float(p2[0]), float(p2[1]))
    return p


def ellipse_path(cx: float, cy: float, rx: float, ry: float, rot: float = 0.0) -> skia.Path:
    p = P()
    p.addOval(skia.Rect.MakeLTRB(cx - rx, cy - ry, cx + rx, cy + ry))
    if rot:
        m = skia.Matrix()
        m.setRotate(math.degrees(rot), cx, cy)
        p.transform(m)
    return p


def rect_path(x: float, y: float, w: float, h: float, r: float = 0.0) -> skia.Path:
    p = P()
    p.addRRect(skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(x, y, w, h), r, r))
    return p


# --------------------------------------------------------------------------- #
# paint helpers
# --------------------------------------------------------------------------- #
def col(v):
    """Accept '#rrggbb', (r,g,b[,a]) or a packed skia colour."""
    if isinstance(v, str):
        return hexa(v)
    if isinstance(v, (tuple, list)):
        if len(v) == 3:
            return skia.Color(int(v[0]), int(v[1]), int(v[2]))
        return skia.Color(int(v[0]), int(v[1]), int(v[2]), int(v[3]))
    return v


def fill_paint(color) -> skia.Paint:
    color = col(color)
    p = skia.Paint(AntiAlias=True, Color=color, Style=skia.Paint.kFill_Style)
    return p


def stroke_paint(color, width: float, cap=skia.Paint.kRound_Cap,
                 join=skia.Paint.kRound_Join) -> skia.Paint:
    color = col(color)
    p = skia.Paint(AntiAlias=True, Color=color, Style=skia.Paint.kStroke_Style,
                   StrokeWidth=float(width), StrokeCap=cap, StrokeJoin=join)
    return p


def lin_shader(x0, y0, x1, y1, colors: Sequence[skia.Color], pos: Sequence[float] = None):
    if pos is None:
        pos = [i / max(1, len(colors) - 1) for i in range(len(colors))]
    return skia.GradientShader.MakeLinear(
        [skia.Point(float(x0), float(y0)), skia.Point(float(x1), float(y1))],
        list(colors), list(pos))


def rad_shader(cx, cy, r, colors: Sequence[skia.Color], pos: Sequence[float] = None):
    if pos is None:
        pos = [i / max(1, len(colors) - 1) for i in range(len(colors))]
    return skia.GradientShader.MakeRadial(
        skia.Point(float(cx), float(cy)), float(r), list(colors), list(pos))


def blur_paint(color, sigma: float, style=skia.Paint.kFill_Style) -> skia.Paint:
    color = col(color)
    p = skia.Paint(AntiAlias=True, Color=color, Style=style)
    if sigma > 0.01:
        p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, float(sigma)))
    return p


# --------------------------------------------------------------------------- #
# drawing primitives
# --------------------------------------------------------------------------- #
class Canvas:
    """Thin wrapper adding the few extras the film needs."""

    def __init__(self, c: skia.Canvas):
        self.c = c

    # -- state
    def clear(self, color: skia.Color):
        self.c.clear(color)

    def save(self):
        self.c.save()

    def restore(self):
        self.c.restore()

    def translate(self, x, y):
        self.c.translate(float(x), float(y))

    def rotate(self, deg):
        self.c.rotate(float(deg))

    def scale(self, sx, sy=None):
        self.c.scale(float(sx), float(sx if sy is None else sy))

    def clip(self, shape):
        if not isinstance(shape, skia.Path):
            pth = P()
            pth.addRect(shape)
            shape = pth
        self.c.clipPath(shape, skia.ClipOp.kIntersect, True)

    def alpha_layer(self, a: float):
        self.c.saveLayerAlpha(None, int(max(0.0, min(1.0, a)) * 255))

    # -- shapes
    def fill(self, path: skia.Path, color):
        self.c.drawPath(path, fill_paint(col(color)))

    def stroke(self, path: skia.Path, color, width: float,
               dash: Sequence[float] = None, cap=skia.Paint.kRound_Cap):
        p = stroke_paint(col(color), width, cap=cap)
        if dash:
            p.setPathEffect(skia.DashPathEffect.Make([float(d) for d in dash], 0.0))
        self.c.drawPath(path, p)

    def ink(self, path: skia.Path, color: skia.Color, width: float):
        """Filled shape plus a slightly thicker outline behind it (cartoon ink)."""
        self.c.drawPath(path, stroke_paint(color, width * 2.0))
        self.c.drawPath(path, fill_paint(color))

    def shape(self, path: skia.Path, fill, ink=None, ink_w: float = 5.0):
        if ink is not None and ink_w > 0:
            self.c.drawPath(path, stroke_paint(col(ink), ink_w * 2.0))
        if fill is None:
            return
        self.c.drawPath(path, fill_paint(col(fill)))

    def circle(self, x, y, r, fill: skia.Color, ink: skia.Color = None, ink_w: float = 5.0):
        p = P()
        p.addCircle(float(x), float(y), float(r))
        self.shape(p, fill, ink, ink_w)

    def oval(self, x, y, rx, ry, fill, ink=None, ink_w=5.0, rot=0.0):
        self.shape(ellipse_path(x, y, rx, ry, rot), fill, ink, ink_w)

    def rrect(self, x, y, w, h, r, fill, ink=None, ink_w=5.0):
        self.shape(rect_path(x, y, w, h, r), fill, ink, ink_w)

    def line(self, x0, y0, x1, y1, color: skia.Color, width: float,
             dash: Sequence[float] = None, cap=skia.Paint.kRound_Cap):
        p = P()
        p.moveTo(float(x0), float(y0))
        p.lineTo(float(x1), float(y1))
        self.stroke(p, color, width, dash, cap)

    def polyline(self, pts: Sequence[Sequence[float]], color: skia.Color, width: float,
                 closed: bool = False, smooth: bool = True, tension=0.42):
        path = smooth_closed(pts, tension) if (closed and smooth) else (
            polygon(pts) if closed else (smooth_open(pts, tension) if smooth else polygon(pts)))
        self.stroke(path, color, width)

    def gradient_rect(self, x, y, w, h, colors: Sequence[skia.Color],
                      vertical: bool = True, pos: Sequence[float] = None):
        p = fill_paint(colors[0])
        p.setShader(lin_shader(x, y, x, y + h, colors, pos) if vertical
                    else lin_shader(x, y, x + w, y, colors, pos))
        self.c.drawRect(skia.Rect.MakeXYWH(float(x), float(y), float(w), float(h)), p)

    def gradient_radial(self, cx, cy, r, colors, pos=None):
        p = fill_paint(colors[0])
        p.setShader(rad_shader(cx, cy, r, colors, pos))
        self.c.drawCircle(float(cx), float(cy), float(r), p)

    def fill_path_full(self, color):
        self.c.drawPaint(fill_paint(col(color)))

    def image_shader(self, img: skia.Image, alpha: float = 1.0):
        p = skia.Paint()
        p.setShader(img.makeShader(skia.TileMode.kRepeat, skia.TileMode.kRepeat,
                                   skia.SamplingOptions(skia.FilterMode.kLinear)))
        p.setAlphaf(float(alpha))
        return p

    # -- compositing
    def layer(self, draw_fn, alpha: float = 1.0):
        self.c.saveLayerAlpha(None, int(max(0.0, min(1.0, alpha)) * 255))
        draw_fn(self)
        self.c.restore()

    def blur(self, path: skia.Path, color, sigma: float):
        self.c.drawPath(path, blur_paint(col(color), sigma))


# --------------------------------------------------------------------------- #
# easing / timing helpers
# --------------------------------------------------------------------------- #
def clamp(v, lo=0.0, hi=1.0):
    return lo if v < lo else (hi if v > hi else v)


def lerp(a, b, t):
    return a + (b - a) * t


def seg(t: float, t0: float, t1: float, ease_in=True, ease_out=True) -> float:
    """Normalised 0..1 progress of t inside [t0, t1] with smoothstep ends."""
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    u = clamp((t - t0) / (t1 - t0))
    if ease_in and ease_out:
        return u * u * (3 - 2 * u)
    if ease_in:
        return u * u
    if ease_out:
        return 1 - (1 - u) * (1 - u)
    return u


def seg_io(t, t0, t1):
    return seg(t, t0, t1, True, True)


def ease_out_back(u, s=1.9):
    u = clamp(u) - 1.0
    return 1 + u * u * ((s + 1) * u + s)


def ease_out_elastic(u, amp=1.0, period=0.35):
    u = clamp(u)
    if u in (0.0, 1.0):
        return u
    return math.pow(2, -10 * u) * math.sin((u - period / 4) * math.tau / period) * amp + 1


def ease_in_cubic(u):
    u = clamp(u)
    return u * u * u


def pulse(x: float, center: float, width: float) -> float:
    """1 at center, 0 at +-width, smooth."""
    d = abs(x - center) / max(1e-6, width)
    return 0.0 if d >= 1 else (1 - d * d) ** 2


def sine(t, hz, phase=0.0):
    return math.sin(math.tau * hz * t + phase)


def wobble(t, hz1, hz2=0.0, amp=1.0):
    """Organic hand-made jitter, deterministic."""
    return amp * (math.sin(math.tau * hz1 * t) * 0.65 +
                  math.sin(math.tau * (hz2 if hz2 else hz1 * 1.7) * t + 1.3) * 0.35)


def smooth_noise(t: float, seed: int = 0, octaves=2) -> float:
    """Smooth deterministic noise in -1..1 built from sines."""
    rng = np.random.default_rng(seed)
    v = 0.0
    amp = 1.0
    tot = 0.0
    for i in range(octaves):
        f = (1.0 + i * 1.7) * (0.6 + rng.random() * 0.9)
        ph = rng.random() * math.tau
        v += math.sin(math.tau * f * t + ph) * amp
        tot += amp
        amp *= 0.5
    return v / tot


# --------------------------------------------------------------------------- #
# post-processing (paper texture, grain, vignette)
# --------------------------------------------------------------------------- #
def make_paper(size: int = 512, seed: int = 7) -> np.ndarray:
    """Tileable-ish paper fibre greyscale multiplier + arabesque fibre streaks."""
    rng = np.random.default_rng(seed)
    # multi-scale value noise, smooth, no hard tiles
    acc = np.zeros((size, size), np.float32)
    for octave, weight in ((4, 0.5), (8, 0.28), (16, 0.15), (64, 0.07)):
        g = rng.random((octave, octave)).astype(np.float32)
        up = np.array(
            skia.Image.fromarray(
                np.dstack([(g * 255).astype(np.uint8)] * 3 + [np.full_like(g, 255, np.uint8)]),
                colorType=skia.kRGBA_8888_ColorType)
            .resize(size, size,
                    skia.SamplingOptions(skia.FilterMode.kLinear))
            .toarray()[:, :, 0], dtype=np.float32) / 255.0
        acc += (up - 0.5) * weight
    fibres = rng.normal(0, 1, (size, size)).astype(np.float32)
    # horizontal smearing -> paper fibres
    for _ in range(3):
        fibres = (fibres + np.roll(fibres, 1, axis=1) + np.roll(fibres, -1, axis=1)) / 3.0
    acc += fibres * 0.06
    acc = (acc - acc.mean()) / (acc.std() + 1e-6)
    return acc


def paper_overlay(canvas: Canvas, paper: np.ndarray, strength: float = 0.06,
                  scale: float = 1.0, offset=(0, 0)):
    """Multiply a subtle paper texture on top of the frame."""
    h, w = paper.shape
    img = paper_to_image(paper)
    m = skia.Matrix()
    m.setScale(scale, scale)
    m.postTranslate(offset[0], offset[1])
    p = skia.Paint()
    p.setShader(img.makeShader(skia.TileMode.kRepeat, skia.TileMode.kRepeat,
                               skia.SamplingOptions(skia.FilterMode.kLinear), m))
    p.setBlendMode(skia.BlendMode.kMultiply)
    p.setAlphaf(float(strength))
    canvas.c.drawPaint(p)


_PAPER_CACHE = {}


def paper_to_image(paper: np.ndarray, tint=(255, 250, 242)) -> skia.Image:
    key = (id(paper), tint)
    if key in _PAPER_CACHE:
        return _PAPER_CACHE[key]
    a = np.clip(255 - (paper + 1.2) * 22, 0, 255)  # mostly light grey
    out = np.dstack([
        (a * tint[0] / 255.0).astype(np.uint8),
        (a * tint[1] / 255.0).astype(np.uint8),
        (a * tint[2] / 255.0).astype(np.uint8),
        np.full_like(a, 255, np.uint8)])
    img = skia.Image.fromarray(out, colorType=skia.kRGBA_8888_ColorType)
    _PAPER_CACHE[key] = img
    return img


def vignette(canvas: Canvas, strength=0.30, color=(8, 10, 26)):
    p = skia.Paint()
    p.setShader(rad_shader(W / 2, H * 0.46, H * 0.72,
                           [skia.Color(0, 0, 0, 0), skia.Color(0, 0, 0, 0),
                            skia.Color(color[0], color[1], color[2],
                                       int(255 * strength))],
                           [0.0, 0.55, 1.0]))
    canvas.c.drawRect(skia.Rect.MakeWH(W, H), p)


# Skia on this build uses BGRA_8888 as its native N32 format:
#   Image.toarray()      -> BGRA byte order
#   Image.fromarray(...) -> expects BGRA byte order
# So the canonical numpy buffer in this project is BGRA, converted to RGB only
# when it has to leave skia (PIL, ffmpeg, the review sheets).
def to_bgra(img: skia.Image) -> np.ndarray:
    return np.ascontiguousarray(img.toarray())


def from_bgra(arr: np.ndarray) -> skia.Image:
    return skia.Image.fromarray(np.ascontiguousarray(arr),
                                colorType=skia.kRGBA_8888_ColorType)


def bgra_to_rgba(arr: np.ndarray) -> np.ndarray:
    return np.ascontiguousarray(arr[:, :, [2, 1, 0, 3]])


def image_from_rgba(arr_rgba: np.ndarray) -> skia.Image:
    """Build a skia Image from an RGBA buffer with correct colours."""
    return skia.Image.fromarray(np.ascontiguousarray(arr_rgba[:, :, [2, 1, 0, 3]]),
                                colorType=skia.kRGBA_8888_ColorType)


def save_frame(arr_bgra: np.ndarray, path: str):
    """Save a raw skia buffer (toarray() output, BGRA order) as a correct PNG."""
    from PIL import Image
    Image.fromarray(np.ascontiguousarray(arr_bgra[:, :, [2, 1, 0]])).save(path)
    return path


def render_canvas_ss(ss: int = 2):
    """Create a supersampled surface + wrapped canvas."""
    surf = skia.Surface(W * ss, H * ss)
    c = surf.getCanvas()
    c.scale(ss, ss)
    return surf, Canvas(c)


def downsample(surf: skia.Surface, ss: int) -> np.ndarray:
    img = surf.makeImageSnapshot()
    if ss != 1:
        img = img.resize(W, H, skia.SamplingOptions(skia.FilterMode.kLinear,
                                                    skia.MipmapMode.kLinear))
    # toarray() already gives real RGBA on this build
    return np.ascontiguousarray(img.toarray())


__all__ = [n for n in dir() if not n.startswith('_')]


# --------------------------------------------------------------------------- #
# finishing pass: paper, grain, vignette (drawn after the artwork)
# --------------------------------------------------------------------------- #
def finish_frame(c: Canvas, t: float, paper=None, paper_strength=0.045,
                 grain_strength=0.010, vig=0.20, seed=0):
    """Give the frame the hand-made finish: paper fibre, a touch of grain
    that shifts every frame, and a soft vignette."""
    if paper is not None:
        # paper drifts very slowly so the texture feels like a held sheet
        step = 7  # px per second of drift (tiny)
        paper_overlay(c, paper, paper_strength, 1.0,
                      (int(t * 2.0) % 512, int(t * 1.0) % 512))
    if grain_strength > 0:
        _draw_grain(c, t, grain_strength, seed)
    if vig > 0:
        vignette(c, vig)


_GRAIN = None


def _draw_grain(c: Canvas, t: float, strength: float, seed=0):
    global _GRAIN
    if _GRAIN is None:
        rng = np.random.default_rng(1234)
        g = rng.normal(0, 1, (256, 256)).astype(np.float32)
        a = np.clip(128 + g * 42, 0, 255).astype(np.uint8)
        _GRAIN = skia.Image.fromarray(
            np.dstack([a, a, a, np.full_like(a, 255)]),
            colorType=skia.kRGBA_8888_ColorType)
    m = skia.Matrix()
    s = 2.0
    m.setScale(s, s)
    # shift per frame so the grain "boils" like hand-drawn texture
    f = int(t * 24)
    ox = (f * 37) % 256
    oy = (f * 61) % 256
    m.postTranslate(-ox * s, -oy * s)
    p = skia.Paint()
    p.setShader(_GRAIN.makeShader(skia.TileMode.kRepeat, skia.TileMode.kRepeat,
                                  skia.SamplingOptions(skia.FilterMode.kNearest), m))
    p.setBlendMode(skia.BlendMode.kOverlay)
    p.setAlphaf(float(strength))
    c.c.drawPaint(p)
