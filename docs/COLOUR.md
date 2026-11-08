# Colour script

Every colour in the film comes from `snooze/palette.py`. Nothing is invented on
the fly inside a shot: the whole film walks one ramp, and each shot asks the ramp
for a moment and (optionally) a blend between two moments.

## Sky ramp

| Moment | Top | Mid | Horizon | Glow | Cloud | Used in |
| --- | --- | --- | --- | --- | --- | --- |
| `midnight` | `#080C28` | `#111A44` | `#243066` | `#3A4A86` | `#2A3768` | 0:00 opening, 2:00 loop |
| `latenight` | `#0A1030` | `#16204E` | `#2A3568` | `#42508C` | `#2E3B70` | 0:04 morning is late |
| `preglow` | `#101838` | `#252D62` | `#4A4A80` | `#8A6E9A` | `#3C4678` | 0:12 first small warmth |
| `dawnfaint` | `#172046` | `#3A3A70` | `#8A6A8E` | `#D98E86` | `#4E5488` | 0:59 the first dawn colour |
| `dawn` | `#242E5E` | `#6A5A9A` | `#E0957E` | `#FFC48A` | `#7A6A9E` | 1:10 the ribbon paints |
| `sunrise` | `#2E4176` | `#8A7AB0` | `#F4A87C` | `#FFDCA0` | `#D8A9A0` | 1:25 the Sun wakes |
| `morning` | `#4E86C8` | `#9CC4E8` | `#FFE0B4` | `#FFF3D8` | `#FFFFFF` | 1:37 morning arrives |
| `day` | `#3E86D8` | `#86BCEC` | `#D6ECFA` | `#FFF8E8` | `#FFFFFF` | 1:47 midday |
| `afternoon` | `#4E8EDA` | `#A6C8E8` | `#FFD9A8` | `#FFF0CC` | `#FFF6E4` | 1:52 later |
| `evening` | `#3A3E82` | `#8A5E92` | `#F0907A` | `#FFC080` | `#B5788E` | 1:54 the day runs out |
| `dusk` | `#1E2452` | `#3E3A76` | `#B0668A` | `#E89070` | `#6A5488` | 1:56 heading home |
| `nightfall` | `#0C1132` | `#1A2352` | `#3A4270` | `#5A5490` | `#3A4678` | 1:58 back to bed |

The loop works because `nightfall` blends to `midnight` over the last three
seconds, ending on the exact opening frame.

## Fixed character colours

| Element | Hex | Why |
| --- | --- | --- |
| Clock body | `#F2604C` | the only saturated red in the film — the eye always finds it |
| Clock face | `#FFF3DE` | warm cream, reads as a lit face even at night |
| Clock hands / ink | `#2C1B3A` | one ink for the whole film, never pure black |
| Bells | `#F6B93B` | brass; a small warm accent on the clock so it is not one flat red blob |
| Sun | `#FFD155` | pure warm gold, brighter than anything else on screen |
| Sun rim light | `#FFE38C` | top-of-disc highlight, kept clear of the eyes |
| Sun cheeks | `#FF9E6E` | a sleepy flush |
| Clouds (night) | `#2A3768` | same family as the sky, so they sit *in* the night |
| City near / mid / far | `#0E1436` → mauve | desaturated so the characters always win |
| Lit windows | `#FFCE73` | the only warmth in the night city |
| Bird | `#5C6FA8` | cool blue-grey, never competes with the clock |

## Rules the film follows

* **One ink.** All linework is `#2C1B3A` at varying opacity — never pure black,
  never multiple inks. This is what makes it feel hand-drawn rather than vector.
* **Warm light only ever grows.** Nothing in the film gets colder after 1:25 until
  the deliberate evening turn.
* **No saturated colour outside the two leads.** The ribbon of dawn is the only
  exception, and it is the payoff of the story.
* **Night is blue-violet, not grey.** Even the darkest frame keeps a violet cast.
