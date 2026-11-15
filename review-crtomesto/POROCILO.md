# Črtomesto — poročilo o preizkusu

Datum: 15. november 2026

## Obseg in način

Preizkušena je bila lokalno zagnana kopija kode iz `origin/main` pri commitu `6fcc91c5e7f46f7c30151d151549c8f4e4624c73`. Posredovana spletna stran se predstavi kot »Črtomesto — Prah nad mestom«; ni pa bilo neodvisno potrjeno, da je objava zgrajena iz natanko tega commita. Trenutna delovna veja vsebuje projekt SNOOZE in ne kode igre, zato popravki igre niso bili izvedeni.

Uporabljen je bil avtomatizirani Chromium z WebGL (programski izris), zaslon 800 × 450 in pregled postavitve pri 390 × 844. Uvod, dialoge, naloge in nekatere akcije sem preizkusil v igri. Za oddaljene lokacije, eksplozije in pospešeno simulacijo sem uporabil vgrajeni testni vmesnik igre (`__pencilGame`/`__pencilWorld`). Zato to **ni** polno ročno preigravanje in posnetki dokazujejo prikaz stanja, ne pa sami po sebi vseh korakov za nastanek stanja.

## Potrjene ugotovitve

### 1. Visoka — napačni rezervoarji štejejo za nalogo

**Koraki:** Začni poglavje I in uniči tri rezervoarje v drugi, zahodni bazi. Pri preizkusu sem eksplozije sprožil prek testnega vmesnika, brez uničenja vzhodnih rezervoarjev.

**Dejansko:** števec doseže 3 in igra napreduje v poglavje II; vzhodni rezervoarji so še nepoškodovani. **Pričakovano:** šteti morajo samo trije rezervoarji v bazi Polarna zvezda, kot piše v cilju. Popravek: rezervoarje poveži z ustrezno bazo in preverjaj njeno stanje, ne skupnega števca. Koda: `game.js`, `damageFuel`, `updateStory`, `currentWaypoint`.

### 2. Visoka — predčasno uničeni cilji se ne upoštevajo

**Koraki:** Pred pogovorom z Mihcem uniči tri vzhodne rezervoarje, nato začni poglavje I. Eksplozije sem sprožil prek testnega vmesnika.

**Dejansko:** rezervoarji ostanejo uničeni, števec pa je 0; smerokaz usmeri proti rezervoarju v drugi bazi, približno 645 m stran. Uničenje treh zahodnih nato napačno zaključi nalogo. Če bi bili pred nalogo uničeni vsi rezervoarji, po logiki kode napredovanje ne bi bilo več mogoče; tega zadnjega scenarija nisem posebej zaključil kot igralni preizkus. **Pričakovano:** misija mora upoštevati že uničene pravilne cilje oziroma jih varno obnoviti. Glej [posnetek 07](screenshots/07-napacni-rezervoarji.png).

### 3. Visoka — finale se zaključi tudi daleč od svetilnika, brez merjenja

**Koraki:** Po začetku poglavja IV se s testnim vmesnikom premakni daleč od svetilnika in pospeši 90 sekund simulacije. Za izolacijo testa sem igralcu nastavil zelo visoko zdravje.

**Dejansko:** zaključni dialog se sproži in igra preide v epilog približno 380 m od svetilnika, brez preverjanja smeri pogleda ali uporabe daljnogleda. **Pričakovano:** če je namen res »drži daljnogled proti Razpoki«, mora igra preverjati lokacijo, pogled in uporabo ter pokazati napredek; sicer je treba cilj spremeniti, da ustreza dejanski mehaniki. Koda: `game.js`, `updateStory`, poglavje IV. [Posnetek 09](screenshots/09-konec-dalec-od-svetilnika.png) prikazuje epilog po testu.

### 4. Visoka — zgodba se lahko zaključi med smrtjo

Pri ločenem testu sem med simulacijo zadnjega poglavja umrl; časovnik je kljub temu sprožil zaključni dialog, ko je bil igralec mrtev. Dokončanja epiloga v tem stanju nisem potrdil. Popravek: med smrtjo časovnik in prehod zgodbe ustavi oziroma jasno določi pravila ponovnega poskusa. Koda: `game.js`, `updateStory` in obravnava smrti.

### 5. Visoka — na telefonu ni gumbov za ključne akcije

Pri mobilnem prikazu ni gumbov za nadaljevanje dialoga, interakcijo, orožje ali granato; dialog navaja tipko E in ima `pointer-events: none`. Platno podpira dotik za gibanje in pogled, ne pa teh dejanj. Brez zunanje tipkovnice je zato interaktivno napredovanje omejeno oziroma pri Mihcu blokirano. Dodaj vidne, dostopne gumbe za E, strel, orožje, granato in druge potrebne akcije, prilagojene kontekstu. Preverjeno s pregledom vmesnika in kode, ne na fizičnem telefonu. [Posnetek 08](screenshots/08-mobilni-zaslon.png).

### 6. Srednja — mobilni HUD se prekriva

Pri širini 390 px se cilj, smerokaz in zvezdice policije v zgornjem delu prekrivajo, zato so slabše berljivi. Prilagodi postavitev vrsticam, rezerviraj prostor za vsak element in preveri tudi daljša besedila. [Posnetek 08](screenshots/08-mobilni-zaslon.png).

## Preverjeno delovanje

- Uvodni dialog se začne in ga je mogoče nadaljevati z E; pogovor z Mihcem odpre prvo misijo. [Uvod](screenshots/01-uvod.png), [Mihec](screenshots/02-mihec.png), [misija](screenshots/03-misija.png).
- F vključi orožje, klik zmanjša naboj s 30 na 29, R ga napolni na 30; G zmanjša število granat s 3 na 2. [Posnetek orožja](screenshots/06-orozje.png).
- S testnimi premiki in eksplozijami je bilo mogoče sprožiti prehod prek rezervoarjev, prevzem daljnogleda in poglavje svetilnika. To ne potrjuje, da so te lokacije normalno dosegljive in uravnotežene brez testnega vmesnika. [Svetilnik](screenshots/04-svetilnik.png).

## Še potrebno ročno preveriti

Celotno pot brez teleportacije in testnih eksplozij, navigacijo in trke, vozila (avto, tank, helikopter, letalo, čoln), policijo in odziv vojske, shranjevanje oziroma obnavljanje po smrti, zvok, zmogljivost na dejanskih napravah in brskalnikih ter dotik na fizičnem telefonu. Programski izris v testnem okolju ni merodajen za oceno zmogljivosti na uporabnikovi napravi.
