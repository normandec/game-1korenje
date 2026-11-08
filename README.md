# SNOOZE — a two-minute 2D animated cartoon

> A little alarm clock has one important job: wake the sleepy Sun so morning can begin.
> The trouble is, it keeps accidentally putting *itself* back to sleep.

Vertical **1080×1920** · **24 fps** · **2880 frames** · **120.000 s**, built to loop
seamlessly onto its own first frame.

**Watch:** `output/snooze.mp4`
**Edit:** `output/SNOOZE_project.blend` · **Rebuild:** `python3 -m snooze.build`

---

## The film

| Time | Beat |
| --- | --- |
| 0:00–0:04 | **The joke.** The Sun snores behind the horizon, wrapped in a cloud blanket. On its own cloud the alarm clock rings — and snoozes itself without waking up. |
| 0:04–0:12 | **Morning is late.** Dark city, a bird asleep on a roof, one window opens, peeks at the dark, closes again. The clock's eyes snap open and it works out the problem: points at the Sun, at its own bells, at the dark city. |
| 0:12–0:23 | **Attempt 1 — ring louder.** It rings at the Sun's ear; the Sun rolls over and pulls the blanket up; the ringing gets harder; the blanket puffs and bounces the clock backwards. It lands on its feet and tries again — the Sun snores in rhythm with the bells. |
| 0:23–0:34 | **Attempt 2 — the wake-up dance.** Marching, jumping, spinning, waving its clock hands. The bells make a catchy rhythm, sleeping birds bob their heads — the Sun smiles without opening its eyes. The clock stops, panting, personally offended. |
| 0:34–0:46 | **Attempt 3 — the feather.** A drifting feather, a tickle, a nose twitch, hope, another tickle, a huge inhale, the feather stuck to the nose, the clock backing away. |
| 0:46–0:59 | **The giant yawn.** A silent yawn and a blast of wind sweep the clock off its cloud. It grabs a dangling cloud thread with one foot, swings above the city, pulls itself up by its winding key and lands dizzy but safe. |
| 0:59–1:10 | **A tiny recovery.** Flat on the cloud, stars circling, one bell fallen sideways. It sits up, straightens the bell, and notices the first faint colour of dawn — then gets an idea. |
| 1:10–1:25 | **The clever plan.** It unwinds a long coloured ribbon from inside its body and races along the horizon, painting peach, pink and gold across the sky until the whole horizon glows. |
| 1:25–1:37 | **The Sun wakes.** One eye opens, it sees the painted dawn, sits up and smiles. The clock gives a proud, tired bow. The Sun rises and floods the city with warm light; the sleeping bird wakes, stretches and flies across frame. |
| 1:37–1:47 | **Morning arrives.** Rooftops brighten, windows open, flowers unfold, the bird flies, the bells ring. The Sun gives the clock a beam of warm light like a hug; it leans in and starts to nod off. |
| 1:47–1:56 | **The day races by.** Playful time-lapse: the Sun sweeps across the sky, the city shifts morning → afternoon → evening, the clock rides a cloud asleep, bells gently bouncing. |
| 1:56–2:00 | **Seamless ending.** The Sun settles behind the horizon and curls up in its cloud blanket. The alarm rings. Still asleep, the clock hits snooze — on the exact opening composition, so the film loops. |

No dialogue, no captions, no readable text anywhere — the whole story is told
with expression, movement, colour and sound. Every palette choice walks one ramp:
midnight blue → peach/pink/gold dawn → midnight.

---

## How it is built

The film is drawn with a **2D vector engine** (skia via `skia-python`), not a 3D
scene with a flat filter. Every frame is a pure function of time —

```python
film.draw_frame(canvas, t)      # t = seconds, 0.0 … 119.958
```

— so frames are deterministic, render in any order and in parallel. Artwork is
rasterised at 2× and downsampled for clean inked linework, then finished with
paper fibre, per-frame grain and a soft vignette. Layers are drawn with camera
depth so sky, city and clouds parallax independently.

```
snooze/
  gfx.py         drawing toolkit: paths, multi-pass ink, unions, gradients, texture, easing
  palette.py     the colour script (one ramp for the whole film)
  characters.py  the alarm clock, the Sun, birds, clouds, props — fixed proportions/colours
  world.py       sky, horizon glow, layered city, windows, effects
  stage.py       camera + parallax layers, the shared opening/closing tableau
  film.py        the twelve shots and the exact 0:00–2:00 timeline
  audio.py       the original score + sound effects, synthesised from scratch
  render.py      frame renderer -> libx264 -> H.264 MP4
  plates.py      one key plate per shot for the Blender project
  verify.py      duration / resolution / frame-count / loop checks
  build.py       one command for the whole pipeline
blender/         project builder + the shot plates
docs/            delivery notes
output/          the film, the .blend, the soundtrack, the contact sheet
```

### Rebuild

```bash
python3 -m pip install numpy pillow skia-python imageio-ffmpeg
python3 -m snooze.build              # plates → blend → audio → render → sheet → verify
```

Handy single steps:

```bash
python3 -m snooze.dev.sheet                        # character sheet
python3 -m snooze.preview 0 46.5 96                # finished frames
python3 -m snooze.dev.contact 20 40 60 80 --cols 4 # review grid
python3 -m snooze.audio                            # 120.0 s soundtrack
python3 -m snooze.verify output/snooze.mp4         # checks the delivered MP4
```

---

## The Blender project

`output/SNOOZE_project.blend` is an editable Blender 5.0 project:
1080×1920, 24 fps, frames 1–2880 (exactly 120.0 s), orthographic camera, four
named collections (`01_CHARACTERS`, `02_BACKGROUNDS`, `03_ANIMATION`, `04_SHOTS`),
the twelve shot plates keyed in and out at their exact frame ranges, a Grease
Pencil object with `CLOCK` / `SUN` / `NOTES` layers for hand animation, timeline
markers for every beat, and the timing and colour script as text datablocks.

**Honest limitation:** the frames of the film were rendered by the 2D pipeline
above, not by Blender's renderer — this environment has no GPU/GL context, so
Blender's render engines cannot run here (EEVEE needs a GL context; Cycles is not
in the `bpy` wheel). The plates packed into the .blend are the rendered key frames
from `snooze/film.py`. See `docs/DELIVERY.md` for the details.

## Sound

Everything you hear is synthesised in `snooze/audio.py` — no samples, no library
music: the alarm, the snooze click, snores, bell rings, the blanket *boing*, the
dance groove, feather tinkles, the yawn whoosh, the tumble, the thread grab, a
dizzy sparkle, a rising arpeggio as the ribbon unfolds, a warm major-key lift at
sunrise, the montage rhythm, time-lapse ticking, and the reprise at the loop point.
