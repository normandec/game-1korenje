# Design notes

## One idea per shot, readable at a glance

The film is 120 seconds of pantomime. That means every beat has to survive being
watched muted, at phone size, in one pass. Three rules shaped everything:

1. **One idea per shot.** Ring louder. Dance. Feather. Yawn. Each attempt at
   waking the Sun gets its own shot, its own gag, its own failure.
2. **The clock is always the readable thing.** It is small, round, coral-red —
   the only saturated red in the frame — and it is always either dead centre or
   moving across the middle band of the screen. If your eye is anywhere, it is on
   the clock.
3. **The Sun is always the thing being acted on.** Big, golden, warm, eyes shut
   for the first 85 seconds. Its face is the scoreboard: shut eyes = still
   asleep, one eye open = we are winning.

## Body language, not dialogue

The clock's state is on its face and in its posture: slumped when defeated,
puffed-up when it has a plan, dizzy-spinning after the yawn, a proud bow at
sunrise. Anticipation (a small crouch before every jump), overshoot and settle,
and squash-and-stretch on impact do the acting work that dialogue would.

Repeated gestures carry the story: the clock *points* at the dark city and then
at itself in shot 02, and it repeats that pointing gesture at the ribbon in
shot 08 — the audience already knows what pointing means by then.

## Colour as the arc

The palette is one ramp, walked twice:

| Beat | Sky | Feeling |
| --- | --- | --- |
| 0:00–0:12 | deep midnight blue, cold stars | stuck |
| 0:12–0:46 | night, but warming slightly at the horizon | effort, no progress |
| 0:46–0:59 | midnight again, then a crack of peach | catastrophe |
| 0:59–1:10 | night with the first true dawn colour | hope |
| 1:10–1:25 | peach → pink → gold, painted on | invention |
| 1:25–1:47 | full sunrise, warm gold flood | triumph |
| 1:47–2:00 | morning → evening → midnight | the day runs out |
| 2:00 | exactly the opening frame | loop |

Nothing else in the film is allowed to be that saturated. The city stays
desaturated slate-mauve so the red clock and golden Sun always pop.

## Draw order and parallax

Every shot is built in depth layers — sky, far clouds, horizon band, far city,
mid city, near rooftops, foreground clouds, characters — with the camera panning
each layer by a different amount. On a vertical frame the parallax is mostly
vertical drift, which sells the climb in shot 09 without any 3D.

Linework is drawn as ink passes over shape fills, at 2× resolution and
downsampled, so edges stay crisp but soft; a boil (slight per-frame jitter of the
outline seed) keeps it from feeling mechanical. Paper fibre, per-frame grain and
a soft vignette sit on top of everything, which is what makes the flat vector
shapes read as drawn.

## Timing

The whole film is a metronome of *attempts*: 11 s, 11 s, 12 s, then a 13 s
disaster, then 24 s of planning and payoff, then the day. The dance shot is cut
to a 126 BPM groove; the time-lapse ticks on the beat. The last four seconds are
a copy of the first four — same composition, same pose, same alarm — so the film
loops without a visible cut. That is verified numerically: the first and last
frames differ by less than 1/255 on average.
