// Zgodba igre: izvirni liki, poglavja in dialogi. Vsi teksti so v slovenščini.
//
// Prah nad Črtomestom: Vida je pristala v mestu, kjer se realnost trga
// kot risba, ki jo nekdo popravlja z gumico. Skozi prah vidi vojaško
// "Polarno zvezdo" in razpoko na nebu, ki požira ljudi. Z lisičjo-risjo
// dušo Ris in z jantarnim daljnogledom jo mora zapreti.

export const CHAPTERS = [
  { id: 'prolog', title: 'Prolog — Prah', goal: 'Poišči starega Mihca na obali.' },
  { id: 'gorivo', title: 'I. Gorivo gori', goal: 'Uniči tri rezervoarje goriva v bazi Polarna zvezda (vzhod).' },
  { id: 'poveljstvo', title: 'II. Poveljstvo', goal: 'Vdri v poveljstvo baze in vzemi jantarni daljnogled.' },
  { id: 'beg', title: 'III. Beg', goal: 'Pripelji daljnogled do svetilnika. Tanki in vojaki so za tabo.' },
  { id: 'razpoka', title: 'IV. Razpoka', goal: 'Pri svetilniku z E dvigni daljnogled in glej proti Razpoki 90 sekund.' },
  { id: 'epilog', title: 'Epilog', goal: 'Mesto je tiho. Prah še vedno pada, a počasneje.' },
];

export const LINES = {
  intro: [
    { who: 'Vida', text: 'Pristala sem v Črtomestu. Vse je narisano s svinčnikom, ulice so tihe, kot da čakajo na prvo črto.' },
    { who: 'Ris', text: 'Prah se zbira nad vzhodom. Čutim ga v kosteh.' },
    { who: 'Vida', text: 'Prah? Kaj to sploh je?' },
    { who: 'Ris', text: 'To, kar ljudje pozabijo, preden se naučijo ime. Nekdo ga lovi. Poišči tistega, ki ve več.' },
  ],
  mihec: [
    { who: 'Mihec', text: 'Ti si tista, ki je priletela z morja. Prav. Kompas so mi vzeli.' },
    { who: 'Mihec', text: 'Jantarni daljnogled. Pokaže, kje se prah trga. Varnovi ljudje so ga odnesli v bazo Polarna zvezda, na vzhodu.' },
    { who: 'Vida', text: 'Kako ga dobim nazaj?' },
    { who: 'Mihec', text: 'Najprej jim ugasni gorivo. Brez njega ne vzletijo in ne streljajo. Tri rezervoarje na južni strani, pri hangarjih.' },
  ],
  fuelDone: [
    { who: 'Polkovnik Varn', text: '(zvočnik) Vida. Vidim te na radarju. Prinesi mi daljnogled in to mesto bo ostalo lepo.' },
    { who: 'Ris', text: 'Gorivo je zdaj pod ognjem. Poveljstvo je v kamnatem bloku z rdečo streho, vzhodno od ograje.' },
  ],
  pickup: [
    { who: 'Vida', text: 'Ga imam. Steklo je hladno in sveti kot jantar.' },
    { who: 'Polkovnik Varn', text: '(zvočnik) Vsem enotam! Zaprite vse! Tanki na cesto!' },
    { who: 'Ris', text: 'Pojdiva. Svetilnik je edino mesto, od koder se Razpoka vidi jasno.' },
  ],
  lighthouse: [
    { who: 'Mihec', text: 'Dvigni ga proti nebu! Razpoka se bo zaprla, če jo bomo držali dovolj dolgo.' },
    { who: 'Ris', text: 'Držijo nas od vseh strani. Vztrajaj, Vida!' },
  ],
  end: [
    { who: 'Mihec', text: 'Zaprla se je. Prah počasi pada na mesto, kot pepel po dolgem poletju.' },
    { who: 'Vida', text: 'Sedla bova na obalo in narisala prvo črto, ki ni nikomur ukradena.' },
    { who: 'Ris', text: 'In tudi naslednjo.' },
  ],
};

export const WAVE_TIME = 90; // sekunde, ki jih moraš vzdržati pri svetilniku
