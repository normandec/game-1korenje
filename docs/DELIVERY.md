# SNOOZE — delivery notes

Vertical 1080×1920 · 24 fps · 2880 frames · 120.000 s · loops onto its own first frame.

## Files

| File | What it is |
| --- | --- |
| `output/snooze.mp4` | the finished film — H.264 High, yuv420p, 1080×1920, 24 fps, AAC stereo |
| `output/SNOOZE_project.blend` | editable Blender project (shot plates packed in, Grease Pencil layers ready) |
| `output/snooze_audio.wav` | the original score + sound effects, 48 kHz stereo, 120.0 s |
| `output/SNOOZE_contactsheet.png` | one frame per beat, for a quick read of the whole film |
| `blender/build_snooze_blend.py` | rebuilds the .blend from the plates |
| `snooze/*.py` | the animation source — every frame is a pure function of time |

Companion notes: `docs/DESIGN.md` (staging, acting, parallax, timing) and
`docs/COLOUR.md` (the full colour script).

## How to rebuild

```bash
python3 -m pip install numpy pillow skia-python imageio-ffmpeg
python3 -m snooze.build            # plates -> blend -> audio -> render -> verify
```

Individual steps:

```bash
python3 -m snooze.audio                    # 120.0 s soundtrack
python3 -m snooze.render --still 46.5      # one finished frame
python3 -m snooze.render --segment 0 1440 --out output/segA.mp4
python3 -m snooze.verify output/snooze.mp4 # duration / resolution / loop checks
```

## Honest notes on the Blender requirement

The brief asked for Blender Grease Pencil. What exists here:

* `output/SNOOZE_project.blend` is a real, editable Blender 5.0 project:
  1080×1920, 24 fps, frames 1–2880 (exactly 120.0 s), an orthographic camera,
  four named collections (`01_CHARACTERS`, `02_BACKGROUNDS`, `03_ANIMATION`,
  `04_SHOTS`), twelve shot plates keyed on and off at their exact frame ranges,
  a Grease Pencil object with `CLOCK` / `SUN` / `NOTES` layers for hand
  animation, timeline markers for all twelve beats, and the timing and colour
  script as text datablocks. It opens, plays back and can be edited.
* The film frames themselves are drawn by the 2D vector engine in `snooze/`
  (skia), **not** rendered out of Blender. This sandbox has no GPU and no GL
  context, so Blender's render engines (EEVEE needs a GL context, Cycles is not
  built in the `bpy` wheel) cannot render here. The plates in the .blend are the
  rendered key frames from `snooze/film.py`, packed into the file; re-rendering
  the full film out of Blender was not possible in this environment.
* The result on screen is what the brief describes — a hand-drawn-feeling 2D
  cartoon with inked silhouettes, squash and stretch, layered parallax, paper
  texture and grain — it was just authored in a purpose-built 2D pipeline rather
  than with Grease Pencil tools.

## Timing (all twelve beats, as drawn)

| Time | Beat | Shot |
| --- | --- | --- |
| 0:00–0:04 | the joke: alarm rings, the clock snoozes itself | `01_snooze_itself` |
| 0:04–0:12 | morning is late: dark city, sleeping bird, a window peeks | `02_morning_is_late` |
| 0:12–0:23 | attempt 1: ring louder, the blanket bounces it back | `03_attempt_ring` |
| 0:23–0:34 | attempt 2: the wake-up dance, birds bop in their sleep | `04_attempt_dance` |
| 0:34–0:46 | attempt 3: the feather, the inhale, the flare | `05_attempt_feather` |
| 0:46–0:59 | the giant yawn, blown away, saved by a cloud thread | `06_giant_yawn` |
| 0:59–1:10 | recovery: dizzy, crooked bell, the first dawn colour | `07_tiny_recovery` |
| 1:10–1:25 | the clever plan: a ribbon paints the dawn | `08_the_clever_plan` |
| 1:25–1:37 | the Sun wakes, the proud bow, sunrise | `09_sun_wakes` |
| 1:37–1:47 | morning montage, the thank-you beam, nodding off | `10_morning_arrives` |
| 1:47–1:56 | the day races by | `11_day_races_by` |
| 1:56–2:00 | seamless ending, identical to the opening | `12_seamless_ending` |

## Sound

All sound is synthesised from scratch in `snooze/audio.py` — no samples, no
library music. Cues follow the picture: the alarm, the snooze click, snores,
bell rings, the blanket *boing*, the dance groove, feather tinkles, the yawn
whoosh, the tumble and thread grab, the dizzy sparkle, a rising arpeggio as the
ribbon unfolds, a warm major-key lift at sunrise, the montage rhythm, the
time-lapse ticking, and the reprise of the opening theme at the loop point.
