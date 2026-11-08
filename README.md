# SNOOZE — a two-minute 2D animated short

> A little alarm clock has one important job: wake the sleepy Sun so morning can begin.
> The trouble is, it keeps accidentally putting *itself* back to sleep.

Vertical 1080×1920 · 24 fps · 2880 frames · exactly 120 seconds, built to loop.

---

## Status

| Part | State |
| --- | --- |
| Art + animation engine (`snooze/`) | in progress |
| 12 shots, 120 s timeline | storyboarded, staged, being iterated |
| Blender delivery package (`blender/`) | planned |
| Sound + music | planned |
| Final H.264 MP4 | planned |

---

## How it is built

The film is drawn with a **2D vector engine** (skia via `skia-python`), not a
3D scene. Every frame is a pure function of time —

```python
film.draw_frame(canvas, t)      # t = seconds, 0.0 … 119.958
```

— so frames are deterministic, render in any order and in parallel. Artwork is
rasterised at 2× and downsampled for clean, inked line quality, then finished
with a subtle paper overlay, grain and vignette. Layers are drawn with camera
depth so the sky, city and clouds parallax independently.

### Layout

```
snooze/
  gfx.py         drawing toolkit: paths, ink passes, gradients, texture, easing
  palette.py     the colour script: midnight → peach/pink/gold → midnight
  characters.py  the alarm clock, the Sun, birds, clouds, props (fixed proportions)
  world.py       sky, horizon glow, layered city, windows, effects
  stage.py       camera + parallax layers, the shared opening/closing tableau
  film.py        the twelve shots and the exact 0:00–2:00 timeline
  preview.py     render individual frames
  dev/           contact sheets for reviewing staging
blender/         editable Blender project package (planned)
output/          renders (ignored by git)
```

### Tools

```bash
# character sheet (proportions / colours / expressions)
python3 -m snooze.dev.sheet

# individual frames -> output/preview/
python3 -m snooze.preview 0 12 46.5 96

# review grid of a sequence
python3 -m snooze.dev.contact 70 76 82 88 --cols 4 --out plan.png
```

---

## Timing (locked to the brief)

| Time | Beat |
| --- | --- |
| 0:00–0:04 | The joke — the alarm rings, the clock snoozes itself |
| 0:04–0:12 | Morning is late — dark city, sleeping bird, one window peeks |
| 0:12–0:23 | Attempt 1 — ring louder; the cloud blanket bounces it backward |
| 0:23–0:34 | Attempt 2 — wake-up dance; sleeping birds bop along |
| 0:34–0:46 | Attempt 3 — the feather tickle, the flare |
| 0:46–0:59 | The giant yawn — blown away, saved by a cloud thread |
| 0:59–1:10 | A tiny recovery — dizzy, crooked bell, first dawn colour |
| 1:10–1:25 | The clever plan — a ribbon paints the dawn |
| 1:25–1:37 | The Sun wakes, the proud tired bow, sunrise |
| 1:37–1:47 | Morning arrives — montage, thank-you beam, nod off |
| 1:47–1:56 | The day races by |
| 1:56–2:00 | Seamless ending — identical to the opening frame |
