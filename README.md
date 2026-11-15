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

## AI ljudi (`crtomesto/ai.js`)

- **Civilisti:** dnevne opravke med točkami zanimanja v bližini doma, postanki, klepet s sosedi. Bežijo pred oboroženim igralcem, avtomobili in hrupom (streli, eksplozije); panika se širi na sosede.
- **Priče:** civilist, ki vidi (ali je blizu) igralčevega streljanja, prijavi policiji in s tem poveča "wanted".
- **Straže in vojaki:** stražijo ali patrulirajo; ko zaznajo igralca, ga napadejo in opozorijo skupino v 25 m; po izgubi stika preiščejo zadnji znani položaj.
- **Policija:** miruje do "wanted", nato lovi igralca; streljajo šele pri "wanted" 3 in več. Policijska vozila se ustavijo približno 12 m pred igralcem.
- Oddaljeni ljudje (> 110 m) se ne simulirajo; po vrnitvi v bližino se stanje (npr. strah) sproti popravi.

## Objava

Delovni tok `.github/workflows/crtomesto-pages.yml` preveri JavaScript in ob potisku na `main` objavi mapo `crtomesto/` na GitHub Pages (vir: GitHub Actions).
