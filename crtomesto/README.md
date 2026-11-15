# Črtomesto

Za lokalni zagon v korenu repozitorija izvedi `python3 -m http.server 8000 --directory crtomesto` in odpri stran strežnika. Za WebGL je potreben združljiv brskalnik.

V četrtem poglavju se približaj svetilniku, z E dvigni daljnogled in usmeri križec proti razpoki na nebu. Števec napreduje, ko si peš v bližini, živ in gledaš proti razpoki; zunaj teh pogojev se ustavi. E daljnogled tudi spusti. Po smrti se števec ohrani, daljnogled pa je treba znova dvigniti.

Na zaslonu na dotik uporabljaj levo stran za hojo in desno za pogled; gumbi upravljajo dejanja. V vozilu se pojavijo dodatni gumbi, ki jih držiš za upravljanje.

Regresijski testi pravil zgodbe: `node --experimental-default-type=module crtomesto/tests/story-logic.test.mjs` (Node.js). Pri preizkusu igre v brskalniku so bili uporabljeni tudi testni premiki in pospešena simulacija, zato je še vedno priporočljivo ročno preigravanje in preverjanje na fizičnih napravah.
