# Črtomesto

3D mesto, narisano s črtami in papirnato teksturo. Igra teče v brskalniku (Three.js + cannon-es).

**Zaženi:** odpri `crtomesto/index.html` prek lokalnega strežnika, npr. `cd crtomesto && python3 -m http.server 8000`, nato `http://localhost:8000/`.

**Upravljanje:** W A S D ali puščice za hojo, miška za pogled, Shift za hitrejši korak, E za pogovor/vstop v vozilo, F orožje, G granata, Space skok ali vožnja v vozilu.

## Struktura

- `crtomesto/index.html`, `styles.css` — postavitev in HUD
- `crtomesto/world.js` — svet, teren, stavbe, sprehod po mestu
- `crtomesto/game.js` — fizika, NPC-ji, vozila, orožje, eksplozije, vojska, HUD
- `crtomesto/story.js` — poglavja in dialogi
- `crtomesto/audio.js` — zvočni učinki
- `crtomesto/assets/` — three.js, cannon-es, pisave (OFL)

## Objava

Delovni tok `.github/workflows/crtomesto-pages.yml` preveri JavaScript in ob potisku na `main` objavi mapo `crtomesto/` na GitHub Pages (vir: GitHub Actions).
