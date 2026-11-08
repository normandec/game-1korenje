"""palette.py - the film's colour script.

The story walks from midnight blue to peach/pink/gold and back to midnight, so
every scene asks for a *moment* on that ramp (or an explicit override) and gets
a consistent set of sky, cloud, city and rim colours.
"""

from __future__ import annotations

import skia

from .gfx import mix, rgba, hexa

# --------------------------------------------------------------------------- #
# named stops along the film's colour ramp
# --------------------------------------------------------------------------- #
STOPS = [
    # key           top        mid        horizon    glow       cloud
    ("midnight",   "#080C28", "#111A44", "#243066", "#3A4A86", "#2A3768"),
    ("latenight",  "#0A1030", "#16204E", "#2A3568", "#42508C", "#2E3B70"),
    ("preglow",    "#101838", "#252D62", "#4A4A80", "#8A6E9A", "#3C4678"),
    ("dawnfaint",  "#172046", "#3A3A70", "#8A6A8E", "#D98E86", "#4E5488"),
    ("dawn",       "#242E5E", "#6A5A9A", "#E0957E", "#FFC48A", "#7A6A9E"),
    ("sunrise",    "#2E4176", "#8A7AB0", "#F4A87C", "#FFDCA0", "#D8A9A0"),
    ("morning",    "#4E86C8", "#9CC4E8", "#FFE0B4", "#FFF3D8", "#FFFFFF"),
    ("day",        "#3E86D8", "#86BCEC", "#D6ECFA", "#FFF8E8", "#FFFFFF"),
    ("afternoon",  "#4E8EDA", "#A6C8E8", "#FFD9A8", "#FFF0CC", "#FFF6E4"),
    ("evening",    "#3A3E82", "#8A5E92", "#F0907A", "#FFC080", "#B5788E"),
    ("dusk",       "#1E2452", "#3E3A76", "#B0668A", "#E89070", "#6A5488"),
    ("nightfall",  "#0C1132", "#1A2352", "#3A4270", "#5A5490", "#3A4678"),
]
_RAMP = {s[0]: s[1:] for s in STOPS}


class Sky:
    """A resolved palette moment."""

    __slots__ = ("top", "mid", "horizon", "glow", "cloud", "key")

    def __init__(self, key):
        self.key = key
        self.top, self.mid, self.horizon, self.glow, self.cloud = _RAMP[key]

    def __repr__(self):
        return f"Sky({self.key})"


def sky(key: str, amount: float = 1.0, toward: str = None) -> Sky:
    """Get a palette moment, optionally nudged toward another moment."""
    if toward is None or amount <= 0:
        return Sky(key)
    a, b = _RAMP[key], _RAMP[toward]
    s = Sky.__new__(Sky)
    s.key = key
    s.top = mix(a[0], b[0], amount)
    s.mid = mix(a[1], b[1], amount)
    s.horizon = mix(a[2], b[2], amount)
    s.glow = mix(a[3], b[3], amount)
    s.cloud = mix(a[4], b[4], amount)
    s.top = _hexish(s.top, a[0], b[0], amount)
    s.mid = _hexish(s.mid, a[1], b[1], amount)
    s.horizon = _hexish(s.horizon, a[2], b[2], amount)
    s.glow = _hexish(s.glow, a[3], b[3], amount)
    s.cloud = _hexish(s.cloud, a[4], b[4], amount)
    return s


def _hexish(c, a, b, t):
    """mix() gives packed skia colours; convert back to '#rrggbb'."""
    return "#%02X%02X%02X" % (skia.ColorGetR(c), skia.ColorGetG(c), skia.ColorGetB(c))


def lerp_sky(k1: str, k2: str, t: float) -> Sky:
    return sky(k1, max(0.0, min(1.0, t)), k2)


# --------------------------------------------------------------------------- #
# character + prop colours (never change between shots)
# --------------------------------------------------------------------------- #
INK = "#2C1B3A"          # the one outline colour used on every character
INK_SOFT = "#4A3358"

CLOCK_RED = "#F2604C"
CLOCK_RED_DK = "#CE4438"
CLOCK_RED_LT = "#FF8A72"
CLOCK_CREAM = "#FFF3DE"
CLOCK_CREAM_DK = "#F2DFC0"
BELL_GOLD = "#F6B93B"
BELL_GOLD_DK = "#D4931F"
BELL_GOLD_LT = "#FFD465"
HAND_DARK = "#3B2A4C"

SUN_GOLD = "#FFD155"
SUN_GOLD_DK = "#F2A93B"
SUN_GOLD_LT = "#FFE38C"
SUN_INK = "#B3671F"
SUN_CHEEK = "#FF9E6E"

CITY_FAR = "#1A2452"
CITY_MID = "#141C42"
CITY_NEAR = "#0E1436"
WINDOW_WARM = "#FFCE73"
CLOUD_NIGHT = "#39477C"
BIRD_BLUE = "#5C6FA8"

PAPER_TINT = "#FFF8EC"
