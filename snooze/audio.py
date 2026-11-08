"""audio.py - original score and sound effects for SNOOZE, synthesised from scratch.

Nothing here is sampled or borrowed: every sound is generated with numpy —
sine/triangle/noise oscillators, envelopes and simple filters — and mixed to a
single 120.0 s, 48 kHz stereo track that lines up with the picture.

    python3 -m snooze.audio            -> output/snooze_audio.wav

Cue sheet (seconds, matching film.py):
  0.55   alarm rings            2.45  snooze click
  6.40   clock wakes            8.50  window closes (soft)
 12.30   run to the sun        15.4   ring ring
 17.2   blanket puff          18.2   bounce / land
 21.0   snores in rhythm (with the bells)
 23.5   dance groove          28.0   birds bop
 34.6   feather arrives       41.0   tickle tickle
 46.2   giant yawn (whoosh)   51.4   falls / grabs thread
 57.0   dizzy sparkle
 70.4   ribbon unwinds        73.4   ribbon race
 85.5   eye opens             88.5   bows
 97.2   morning montage       99.6   windows, 101.8 flowers, 104 beams
107.0   day races by         116.1  the loop reprises
"""

from __future__ import annotations

import math
import os
import wave

import numpy as np

SR = 48000
DUR = 120.0
N = int(SR * DUR)

rng = np.random.default_rng(7)


# --------------------------------------------------------------------------- #
# primitives
# --------------------------------------------------------------------------- #
def _t(dur):
    return np.linspace(0, dur, int(SR * dur), endpoint=False)


def env(n, a=0.005, d=0.1, s=0.6, r=0.2, dur=None):
    """ADSR over n samples."""
    a_n = max(1, int(a * SR))
    d_n = max(1, int(d * SR))
    r_n = max(1, int(r * SR))
    s_n = max(0, n - a_n - d_n - r_n)
    out = np.concatenate([
        np.linspace(0, 1, a_n),
        np.linspace(1, s, d_n),
        np.full(s_n, s),
        np.linspace(s, 0, r_n)])
    if len(out) < n:
        out = np.pad(out, (0, n - len(out)))
    return out[:n]


def sine(freq, dur, phase=0.0):
    t = _t(dur)
    if np.isscalar(freq):
        return np.sin(2 * np.pi * freq * t + phase)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR + phase)


def tri(freq, dur):
    t = _t(dur)
    return 2 * np.abs(2 * ((freq * t) % 1) - 1) - 1


def noise(dur):
    return rng.uniform(-1, 1, int(SR * dur))


def lowpass(x, cutoff, q=0.7):
    """One-pole-ish low pass (fast, musical enough)."""
    a = math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lowpass_fast(x, cutoff, passes=2):
    """Vectorised moving-average approximation of a low pass."""
    k = max(1, int(SR / max(20.0, cutoff) / 3))
    y = x
    for _ in range(passes):
        kern = np.ones(k) / k
        y = np.convolve(y, kern, mode='same')
    return y


def highpass_fast(x, cutoff, passes=2):
    return x - lowpass_fast(x, cutoff, passes)


def bell(freq, dur, amp=0.5, decay=6.0):
    t = _t(dur)
    e = np.exp(-t * decay)
    x = (np.sin(2 * np.pi * freq * t) * 1.0 +
         np.sin(2 * np.pi * freq * 2.01 * t) * 0.45 +
         np.sin(2 * np.pi * freq * 3.02 * t) * 0.22 +
         np.sin(2 * np.pi * freq * 4.98 * t) * 0.10)
    return x * e * amp


def pluck(freq, dur, amp=0.4, bright=0.5):
    t = _t(dur)
    e = np.exp(-t * 4.5)
    x = np.sin(2 * np.pi * freq * t)
    x += np.sin(2 * np.pi * freq * 2 * t) * 0.4 * bright
    x += np.sin(2 * np.pi * freq * 3 * t) * 0.18 * bright
    x += np.sin(2 * np.pi * freq * 4 * t) * 0.08 * bright
    return x * e * amp


def pad(freqs, dur, amp=0.12, attack=0.6, release=0.8, detune=0.004):
    t = _t(dur)
    n = len(t)
    out = np.zeros(n)
    for f in freqs:
        for k in (-1, 0, 1):
            ff = f * (1 + detune * k)
            out += np.sin(2 * np.pi * ff * t + k) * 0.33
            out += np.sin(2 * np.pi * ff * 0.5 * t) * 0.06
    e = env(n, attack, 0.05, 1.0, release)
    return out * e * amp / max(1, len(freqs))


# --------------------------------------------------------------------------- #
# mix bus
# --------------------------------------------------------------------------- #
class Bus:
    def __init__(self):
        self.x = np.zeros((2, N), np.float32)

    def add(self, t0, sig, gain=1.0, pan=0.0):
        if sig is None or len(sig) == 0:
            return
        i0 = int(t0 * SR)
        if i0 >= N:
            return
        sig = np.asarray(sig, dtype=np.float32)
        i1 = min(N, i0 + len(sig))
        seg = sig[:i1 - i0] * gain
        l = math.sqrt(0.5 * (1 - pan))
        r = math.sqrt(0.5 * (1 + pan))
        self.x[0, i0:i1] += seg * l
        self.x[1, i0:i1] += seg * r


# --------------------------------------------------------------------------- #
# instruments / cues
# --------------------------------------------------------------------------- #
def alarm_ring(dur=1.9):
    """The clock's alarm: a bright, mechanical two-tone bell with a buzz."""
    t = _t(dur)
    gate = (np.sin(2 * np.pi * 11.0 * t) > 0).astype(float)
    gate = np.convolve(gate, np.ones(64) / 64, mode='same')
    body = (tri(880, dur) * 0.5 + tri(1320, dur) * 0.3 +
            np.sin(2 * np.pi * 1760 * t) * 0.25)
    click = noise(dur) * 0.18
    x = (body + click) * gate
    fade = np.ones(len(t))
    fade[-int(0.12 * SR):] = np.linspace(1, 0, int(0.12 * SR))
    return x * fade * 0.32


def buzzer(dur=0.35):
    t = _t(dur)
    gate = (np.sin(2 * np.pi * 24 * t) > 0).astype(float)
    gate = np.convolve(gate, np.ones(32) / 32, mode='same')
    x = (tri(220, dur) * 0.5 + tri(330, dur) * 0.3) * gate
    return x * env(len(t), 0.004, 0.02, 0.8, 0.06) * 0.16


def snore(dur=2.2, base=78.0):
    """A soft, friendly snore: filtered noise riding a low sine."""
    t = _t(dur)
    breath = np.clip(np.sin(np.pi * t / dur), 0, 1) ** 1.4
    saw = (np.sin(2 * np.pi * base * t) * 0.6 +
           np.sin(2 * np.pi * base * 2 * t) * 0.2 +
           np.sin(2 * np.pi * base * 3 * t) * 0.08)
    air = lowpass_fast(noise(dur), 700) * 2.2
    x = (saw * 0.5 + air * 0.5) * breath
    return x * 0.5


def whoosh(dur=2.0, up=True, bright=1400.0):
    n = int(SR * dur)
    t = np.linspace(0, 1, n)
    x = noise(dur)
    # time-varying low pass by crossfading two filtered copies
    a = lowpass_fast(x, bright * 0.35)
    b = lowpass_fast(x, bright)
    mixv = np.linspace(0, 1, n) if up else np.linspace(1, 0, n)
    x = a * (1 - mixv) + b * mixv
    e = np.sin(np.pi * t) ** 1.6
    return x * e * 0.5


def boing(dur=0.55, f0=300.0):
    t = _t(dur)
    f = f0 * (1 + 0.9 * np.exp(-t * 12) * np.sin(2 * np.pi * 7 * t))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return x * np.exp(-t * 5.5) * 0.32


def thump(dur=0.3, f=90.0):
    t = _t(dur)
    return np.sin(2 * np.pi * f * t * (1 - 0.25 * t / dur)) * np.exp(-t * 14) * 0.5


def click(dur=0.06):
    t = _t(dur)
    x = highpass_fast(noise(dur), 2500) * np.exp(-t * 90)
    return x * 0.4


def tinkle(dur=0.9, f=2400.0):
    return bell(f, dur, 0.18, 9.0)


def woodblock(dur=0.12, f=1200.0):
    t = _t(dur)
    return (np.sin(2 * np.pi * f * t) + 0.4 * noise(dur)) * np.exp(-t * 55) * 0.25


# --------------------------------------------------------------------------- #
# the score
# --------------------------------------------------------------------------- #
# a simple original melody in A minor that turns major at sunrise
A3, C4, D4, E4, G4, A4, C5, D5, E5, G5, A5 = 220.0, 261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0
CHORDS_NIGHT = [(A3, C4, E4), (F3 := 174.6, A3, C4), (C4, E4, G4), (G3 := 196.0, C4, E4)]
CHORDS_DAY = [(440.0, 554.4, 659.3), (349.2, 440.0, 523.3), (392.0, 493.9, 587.3),
              (293.7, 369.9, 440.0)]


def build_score(bus: Bus):
    """Lullaby-ish bed that follows the film's colour arc."""

    # ---- 1. night: sparse music box, slow ----
    night_notes = [(0.6, A4), (2.0, C5), (3.4, E5), (5.0, D5), (6.4, C5), (8.0, A4),
                   (9.6, G4), (11.0, E4)]
    for t0, f in night_notes:
        bus.add(t0, bell(f, 2.2, 0.20, 3.5), 0.9, pan=-0.15)
    # soft pad underneath, bar by bar
    for i in range(6):
        ch = CHORDS_NIGHT[i % 4]
        bus.add(0.4 + i * 4.0, pad(ch, 5.4, 0.055, 1.4, 1.6), 1.0, pan=0.0)

    # ---- 2. attempt one: the music keeps dozing off with the clock ----
    for i, (t0, f) in enumerate([(12.4, A4), (14.2, C5), (16.0, E5), (18.0, D5),
                                 (20.0, C5), (22.0, A4)]):
        bus.add(t0, pluck(f, 1.4, 0.16, 0.5), 1.0, pan=0.2 * ((-1) ** i))

    # ---- 3. the dance: a real groove, then it deflates ----
    beat = 60.0 / 126.0
    t = 23.5
    step = 0
    dance_scale = [A4, C5, D5, E5, G5, A5]
    while t < 33.0:
        # kick / hat
        bus.add(t, thump(0.28, 78.0), 0.55, pan=0.0)
        bus.add(t + beat * 0.5, highpass_fast(noise(0.05), 6000) * np.exp(
            -_t(0.05) * 60) * 0.10, 1.0, pan=0.3)
        # melodic stabs
        f = dance_scale[(step * 3) % len(dance_scale)]
        bus.add(t, pluck(f, 0.5, 0.12, 0.8), 1.0, pan=-0.25)
        if step % 4 == 2:
            bus.add(t, bell(dance_scale[(step + 2) % len(dance_scale)], 0.8, 0.10, 7),
                    1.0, pan=0.3)
        t += beat * 0.5
        step += 1
    # deflate
    bus.add(32.5, whoosh(1.6, up=False, bright=900), 0.35, pan=0.0)
    bus.add(33.2, pluck(A4, 1.6, 0.10, 0.3), 1.0, pan=0.0)

    # ---- 4. feather: tiny high tinkles, a held breath ----
    for i in range(9):
        bus.add(35.0 + i * 0.9, tinkle(1.4, 2200 + (i % 3) * 400), 0.6,
                pan=(-0.4 + 0.1 * i))
    for i in range(5):
        bus.add(41.2 + i * 0.42, bell(A5, 0.7, 0.10, 10), 0.8, pan=0.25)
    # the inhale
    bus.add(43.2, lowpass_fast(noise(2.2), 900) * np.linspace(0, 1, int(SR * 2.2)) ** 2
            * 0.5, 0.5, pan=0.0)

    # ---- 5. the giant yawn and the tumble ----
    bus.add(46.3, whoosh(2.6, up=True, bright=1800), 0.65, pan=0.0)
    bus.add(48.6, whoosh(2.2, up=False, bright=1200), 0.45, pan=-0.2)
    # panicked little flails
    for i in range(6):
        bus.add(49.0 + i * 0.28, woodblock(0.09, 1500 + 200 * (i % 3)), 0.5,
                pan=-0.3 + i * 0.1)
    bus.add(51.5, bell(392.0, 1.2, 0.16, 5), 0.9, pan=0.0)  # grab

    # ---- 6. recovery: dizzy wobble then a hopeful lift ----
    dizzy_t = 59.2
    for i in range(10):
        f = 300 * (1 + 0.35 * math.sin(i * 1.3))
        bus.add(dizzy_t + i * 0.16, bell(f, 0.4, 0.07, 12), 0.8,
                pan=0.5 * math.sin(i * 2.0))
    bus.add(64.6, bell(E5, 1.8, 0.14, 4), 0.9, pan=0.0)
    bus.add(66.0, bell(A5, 2.4, 0.12, 3), 0.9, pan=0.2)
    # the idea
    bus.add(67.4, bell(C5, 2.0, 0.10, 4), 0.8, pan=-0.2)

    # ---- 7. the ribbon: a rising arpeggio that keeps unfolding ----
    ribbon_notes = [A4, C5, D5, E5, G5, A5, C5 * 2, D5 * 2]
    for i in range(16):
        f = ribbon_notes[i % len(ribbon_notes)] * (1.0 if i < 8 else 0.5)
        bus.add(70.6 + i * 0.62, pluck(f, 1.1, 0.13, 0.7), 1.0,
                pan=-0.6 + (i / 15.0) * 1.2)
    # shimmer as the colour spreads
    for i in range(14):
        bus.add(73.5 + i * 0.55, tinkle(0.9, 3000 + (i % 4) * 500), 0.35,
                pan=math.sin(i * 1.7))
    # warm chord bed
    for i in range(4):
        bus.add(73.0 + i * 3.4, pad(CHORDS_DAY[i % 4], 4.0, 0.075, 1.2, 1.2), 1.0)

    # ---- 8. sunrise: the musical lift ----
    for i, f in enumerate((A4, C5, E5, G5, A5)):
        bus.add(85.4 + i * 0.10, pluck(f, 2.6, 0.16, 0.9), 1.0, pan=-0.3 + i * 0.15)
    bus.add(86.0, pad((A3, E4, A4, C5), 6.0, 0.11, 1.2, 2.0), 1.0)
    # the bow: a little two-note curtsy
    bus.add(90.6, pluck(E5, 1.0, 0.12, 0.6), 1.0, pan=0.1)
    bus.add(91.1, pluck(A5, 1.6, 0.13, 0.6), 1.0, pan=0.1)

    # ---- 9. morning: bright, rhythmic, four beats ----
    day_beat = 60.0 / 112.0
    starts = [97.2, 99.6, 101.8, 104.0]
    for bi, s0 in enumerate(starts):
        for k in range(4):
            tt = s0 + k * day_beat * 0.5
            if tt > 107.0:
                break
            if k % 2 == 0:
                bus.add(tt, thump(0.24, 96.0), 0.30)
            bus.add(tt, pluck(CHORDS_DAY[bi % 4][k % 3] * 2, 0.5, 0.10, 0.8), 1.0,
                    pan=-0.2 + 0.4 * ((k % 3) / 2.0))
    # thank-you beam: a warm swell
    bus.add(103.9, pad((A3, E4, A4, C5, E5), 5.0, 0.12, 1.6, 2.0), 1.0)
    for i, f in enumerate((A5, C5 * 2, E5 * 2)):
        bus.add(104.8 + i * 0.22, bell(f, 2.4, 0.10, 3), 0.9, pan=0.2 * (i - 1))

    # ---- 10. the day races by: fast ticking + a swooping pad ----
    tick = 107.0
    while tick < 116.0:
        bus.add(tick, woodblock(0.05, 2100), 0.10, pan=0.3 * math.sin(tick * 3))
        tick += 0.125
    for i, ch in enumerate((CHORDS_DAY[0], CHORDS_DAY[1], CHORDS_DAY[2], CHORDS_NIGHT[3])):
        bus.add(107.0 + i * 2.2, pad(ch, 2.6, 0.055, 0.4, 0.6), 1.0,
                pan=-0.2 + 0.1 * i)

    # ---- 11. the loop: back to the music box ----
    for i, (t0, f) in enumerate([(116.4, E5), (117.2, D5), (118.0, C5), (118.9, A4)]):
        bus.add(t0, bell(f, 2.0, 0.17, 3.5), 0.95, pan=0.0)
    bus.add(116.0, pad((A3, C4, E4), 4.0, 0.06, 0.8, 1.2), 1.0)


def build_sfx(bus: Bus):
    """Every gag gets its sound; the film still works silently."""
    # -- opening
    bus.add(0.55, alarm_ring(1.85), 1.0, pan=0.0)
    bus.add(2.40, click(), 1.2, pan=0.0)
    bus.add(2.46, thump(0.25, 110), 0.35)
    bus.add(0.2, snore(2.6, 74), 0.55, pan=-0.35)
    bus.add(3.3, snore(2.6, 70), 0.4, pan=-0.35)

    # -- morning is late: night air, a curtain, the clock waking
    bus.add(4.0, lowpass_fast(noise(8.0), 500) * 0.12, 0.6, pan=0.0)
    bus.add(6.4, click(), 0.7, pan=0.5)
    bus.add(8.6, click(), 0.6, pan=0.45)
    bus.add(10.0, bell(A5, 0.5, 0.07, 14), 0.8, pan=-0.3)   # eyes snap open
    bus.add(10.0, bell(E5, 0.4, 0.05, 16), 0.8, pan=0.0)

    # -- attempt one
    for i, t0 in enumerate((12.5, 12.72, 12.94)):
        bus.add(t0, thump(0.12, 150), 0.22, pan=-0.3)          # running
    bus.add(15.4, alarm_ring(1.5), 0.75, pan=-0.25)
    for i in range(4):
        bus.add(16.9 + i * 0.32, bell(1200 + i * 90, 0.4, 0.06, 10), 0.7)
    bus.add(17.6, whoosh(1.4, up=False, bright=700), 0.5, pan=0.0)   # blanket puff
    bus.add(18.3, boing(0.7, 340), 0.9, pan=0.2)                    # bounce
    bus.add(19.0, thump(0.35, 120), 0.5)                            # lands
    bus.add(20.5, alarm_ring(2.4), 0.85, pan=-0.2)
    for i in range(5):
        bus.add(21.2 + i * 0.44, snore(0.6, 92), 0.35, pan=0.35)    # snores in rhythm

    # -- attempt two: dance
    bus.add(23.5, click(), 1.2)                                     # hands on hips
    for i in range(10):
        bus.add(24.0 + i * 0.48, woodblock(0.08, 900 + 90 * (i % 4)), 0.25,
                pan=-0.4)
    for i in range(4):
        bus.add(28.2 + i * 0.48, bell(1600 + i * 120, 0.3, 0.05, 12), 0.6, pan=0.5)
    bus.add(32.6, lowpass_fast(noise(1.4), 600) * np.linspace(1, 0, int(SR * 1.4)),
            0.35)                                                   # deflate
    bus.add(33.4, buzzer(0.3), 0.5)                                  # offended

    # -- attempt three: the feather
    bus.add(35.4, whoosh(1.2, up=False, bright=2600), 0.22, pan=0.6)
    for i in range(6):
        bus.add(41.0 + i * 0.34, tinkle(0.5, 2600 + 300 * (i % 2)), 0.5, pan=0.3)
    bus.add(43.2, bell(3520.0, 0.5, 0.06, 16), 0.5)                  # nose flare
    for i in range(3):
        bus.add(44.2 + i * 0.3, click(), 0.9)                        # backing away steps

    # -- the giant yawn
    bus.add(46.2, whoosh(2.8, up=True, bright=1500), 0.9, pan=0.0)
    for i in range(5):
        bus.add(48.4 + i * 0.22, bell(900 + 200 * i, 0.4, 0.06, 9), 0.6,
                pan=-0.2 + 0.1 * i)
    bus.add(51.4, click(), 1.0)                                      # grabs the thread
    bus.add(51.5, bell(660.0, 1.0, 0.10, 6), 0.8)
    for i in range(4):
        bus.add(52.2 + i * 0.5, woodblock(0.08, 700), 0.20, pan=0.2)  # swinging
    bus.add(56.4, thump(0.4, 100), 0.5)                              # lands dizzy
    bus.add(57.0, bell(2400, 1.4, 0.10, 5), 0.7, pan=0.3)

    # -- recovery
    bus.add(59.6, click(), 0.8)                                      # straightens bell
    bus.add(61.9, bell(1760, 0.8, 0.07, 8), 0.7)                     # bell ting
    bus.add(63.0, bell(880, 2.0, 0.08, 3), 0.7, pan=-0.3)            # sees dawn
    bus.add(67.4, bell(2640, 1.2, 0.08, 6), 0.7, pan=0.2)            # the idea

    # -- the ribbon
    for i in range(12):
        bus.add(70.6 + i * 0.24, highpass_fast(noise(0.12), 4000) *
                np.exp(-_t(0.12) * 30) * 0.12, 1.0, pan=-0.5 + i * 0.08)
    for i in range(8):
        bus.add(73.4 + i * 1.1, whoosh(0.9, up=False, bright=2200), 0.16,
                pan=-0.4 + i * 0.11)
    bus.add(84.2, bell(A5, 2.2, 0.13, 3), 0.9, pan=0.3)              # the Sun stirs

    # -- sunrise
    bus.add(85.6, bell(E5, 2.6, 0.14, 2.5), 0.9, pan=0.0)            # eye opens
    for i in range(3):
        bus.add(87.6 + i * 0.5, whoosh(1.2, up=True, bright=1200), 0.2, pan=0.0)
    bus.add(88.6, bell(A4, 1.6, 0.10, 4), 0.8)                       # bow
    for i in range(4):
        bus.add(90.9 + i * 0.35, bell(1320 + 220 * i, 0.6, 0.06, 10), 0.6,
                pan=0.4)

    # -- morning montage
    bus.add(97.2, whoosh(0.9, up=True, bright=2000), 0.22, pan=-0.4)
    for i in range(3):
        bus.add(99.6 + i * 0.32, click(), 1.0, pan=-0.3 + i * 0.3)    # windows
        bus.add(99.62 + i * 0.32, bell(1760 + i * 220, 0.5, 0.06, 10), 0.6,
                pan=-0.3 + i * 0.3)
    for i in range(6):
        bus.add(101.8 + i * 0.11, tinkle(0.6, 2800 + 260 * i), 0.35, pan=-0.4 + i * 0.16)
    bus.add(104.0, pad((A3, E4, A4), 4.0, 0.07, 1.2, 2.0), 1.0)       # beam
    bus.add(105.2, bell(A5, 2.0, 0.09, 3), 0.8, pan=0.1)

    # -- the day races by
    bus.add(107.0, whoosh(2.4, up=False, bright=1600), 0.35)
    bus.add(114.4, bell(392.0, 2.0, 0.09, 3), 0.8, pan=0.0)           # settling

    # -- the loop
    bus.add(116.1, alarm_ring(1.4), 0.85, pan=0.0)
    bus.add(117.6, click(), 1.0)
    bus.add(117.65, thump(0.25, 110), 0.35)
    bus.add(116.4, snore(2.4, 72), 0.5, pan=-0.35)
    # the last frame is silent-tail free and matches the first: let the
    # reprise cleanly stop so the film can loop
    bus.add(119.4, whoosh(0.6, up=False, bright=800), 0.10)


# --------------------------------------------------------------------------- #
# master
# --------------------------------------------------------------------------- #
def make_audio(path=None) -> str:
    bus = Bus()
    build_score(bus)
    build_sfx(bus)
    x = bus.x

    # gentle bus glue: soft limiter + a whisper of room
    x = np.tanh(x * 1.15) * 0.92
    # tiny stereo width via a 9 ms delayed cross-feed (kept subtle)
    d = int(0.009 * SR)
    l = x[0].copy()
    r = x[1].copy()
    x[0] = l * 0.94 + np.concatenate([np.zeros(d, np.float32), r[:-d]]) * 0.06
    x[1] = r * 0.94 + np.concatenate([np.zeros(d, np.float32), l[:-d]]) * 0.06

    # fades so the loop point is clean
    fi = int(0.05 * SR)
    x[:, :fi] *= np.linspace(0, 1, fi)
    x[:, -int(0.25 * SR):] *= np.linspace(1, 0, int(0.25 * SR))
    peak = np.max(np.abs(x))
    if peak > 0:
        x = x / peak * 0.89
    pcm = (x.T * 32767).astype(np.int16)
    path = path or os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'output',
        'snooze_audio.wav')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return path


if __name__ == '__main__':
    p = make_audio()
    print('wrote', p)
