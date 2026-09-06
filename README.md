# Hour Hound

Hour Hound is een lokale PWA voor tijdregistratie vóór handmatige invoer in Intapp.
De app ondersteunt gewone dossiers, i7-werkcodes, DVN-dossiers waarvan het nummer nog
volgt en gewone dossierregels die tijdelijk op i7 · Commercieel zijn geboekt.

## Data en updates

- Alle gebruikersdata blijft lokaal in IndexedDB-database `hourhound`, versie 4.
- De stores, sleutels en bestaande migratie vanaf 0.1.7 blijven ongewijzigd.
- DVN-records en hun tijdregels worden bij een code-update niet geconverteerd of gewist.
- Exporteer desgewenst onder Beheer een JSON-back-up vóór een handmatige update.
- `sw.js` wordt bewust door de eigenaar bijgewerkt. Voeg bij Patch S
  `"./js/app-runtime.js",` aan `ASSETS` toe en verhoog daarna de cacheversie.

## Runtime-opbouw

Pure domeinlogica, IndexedDB en services registreren hun API onder `window.HH`.
`HH.state` is de enige runtimebron; afgeleide dag-, recente-, DVN- en
overboekingslijsten komen uit selectors. `js/app-runtime.js` levert de stabiele
render- en tabnavigatie-API en controleert vóór boot of alle vereiste lagen en
UI-entrypoints zijn geladen.

De app gebruikt klassieke scripts. De volgorde in `index.html` is daarom onderdeel
van het runtimecontract en wordt door de browserloze regressiesuite bewaakt.

## Testen

```text
npm run test:browserless
./node_modules/.bin/playwright test
```

De browserloze suite voert onder meer de echte N-, T-, O- en P-adapters uit en opent
de DVN-selectie met representatieve data. De Playwright-suite vereist een lokaal
geïnstalleerde Chromium-browser.

## Patch W: boekingshistorie

Boekingsbevestigingen bewaren de getoonde inhoud en bronregels in `bookingHistory`.
De oude grens van 60 geboekte datums vervalt. Dag en DVN gebruiken dezelfde
boekingsregels en afronding. Beheer toont gewijzigde of verwijderde geboekte
inhoud; bevestig daar pas nadat de bestaande invoer in Intapp is gecorrigeerd.
Tijdelijke i7-boekingen en latere doelboekingen blijven afzonderlijk bewaard.

Oude markeringen worden alleen waar mogelijk herkend. Afgeleide oude bevestigingen
zijn als zodanig gemarkeerd: niet eerder opgeslagen nummers of verwijderde historie
kunnen niet worden teruggehaald. Oude overboekingen met meerdere doelregels blijven
in hun bestaande historie staan wanneer de bronverdeling niet eenduidig bekend is.

Nieuwe back-ups gebruiken schema 10 en bewaren de boekingshistorie. Oudere back-ups
blijven leesbaar; samenvoegen bewaart de huidige historie, volledig terugzetten van
een oude back-up vervangt deze na waarschuwing. Lees schema 10 met Patch W of later.
De IndexedDB-versie blijft 4. Deze patch bevat geen wijziging aan `sw.js`.

De browserloze suites bevatten 143 controles, waarvan 22 specifiek voor W.
`tests/e2e/phase-w.spec.mjs` voegt twee browsertests voor correcties toe.
Bij oplevering van W zijn de browserloze controles uitgevoerd; de Playwright-tests
zijn niet uitgevoerd omdat de vereiste browseromgeving niet beschikbaar was.

## Patch X: back-up en updategrens

De updateknop wacht op drafts, de timerwachtrij en toegelaten databasewrites.
Een mislukte save voorkomt activeren/herladen en blijft opnieuw te proberen.
Een `controllerchange` vanuit een ander venster wacht eveneens op bewaren;
bij een open dialoog wordt herladen uitgesteld tot een expliciete nieuwe poging.

Het cachegedeelte van fase X is nog niet uitgevoerd: `sw.js` blijft op verzoek
ongewijzigd. De bestaande risico's van gemengde releases, onvolledige cache-installatie
en te brede cache-opruiming worden door alleen deze appwijziging niet opgelost.
Een structurele SW-patch en echte upgrade/offlineproeven blijven apart nodig.

Back-ups gebruiken vanaf X schema 11. De export leest alle relevante stores en
metadata in één readonly-transactie na het afwachten van invoer en schrijfacties.
De versiegebonden checksum omvat alle geëxporteerde recordvelden en metadata.
Schema 11 moet worden gelezen met Patch X of later; oudere back-ups blijven
leesbaar met een melding over de beperktere oude inhoudscontrole.

Import heeft afzonderlijke knoppen Terugzetten, Samenvoegen en Annuleren.
Terugzetten vervangt de dataset na bevestiging. Samenvoegen neemt nieuwere records
over, voegt sjablonen/werkcodes toe of werkt ze bij en bewaart andere lokale items;
boekingshistorie wordt samengevoegd. Conflicten in dossiernummers en een gewijzigde
lokale dataset tussen het voorstel en de bevestiging breken de import af.
Sluit of herstel eerst een lokale open timer. Ontbrekende verwijdermarkeringen in
oude bestanden betekenen dat samenvoegen eerder verwijderde records kan terugbrengen;
de keuzedialoog vermeldt dat expliciet.

De schema-11-restore bewaart geldige recordvelden zonder de oude lengtebeperkingen,
inclusief revisies en historische boekingen waarvan de bron inmiddels is verwijderd.
De databaseversie blijft 4; een database-reset is niet nodig.

Bij oplevering van Patch X zijn alle 162 browserloze controles geslaagd, inclusief
10 updatecontroles en 9 I/O-controles. De onafhankelijke reviews vonden twee
foutpaden (update opnieuw proberen in een leesvenster en verversfout na importcommit);
beide zijn gerepareerd met een falende tegenproef en een geslaagde regressietest.
Echte browser-, offline- en service-worker-upgradeproeven zijn niet uitgevoerd.

## Patch Y: sneller taken kiezen

Nieuwe taak begint direct met zoeken in recente taken, dossiers, DVN en i7-codes.
De eerste druk op N maakt de tijdknip; een zoekselectie vult diezelfde lopende regel
in. Er zijn filters en afzonderlijke acties voor een nieuw dossier en Dossier volgt
nog. Mislukte selecties blijven opnieuw te proberen; een selectie die later terugkomt
kan geen inmiddels andere wizard verderzetten.

De hoofdwerkbalk bevat Nieuwe taak, Pauze/Verder en Dag afronden. Telefoon,
Onderbreking en de aparte DVN-ingang zijn verwijderd, evenals de globale T/O/V-acties.
Historische soorten blijven leesbaar; R en de terugkeerstapel blijven beschikbaar.
Een onvolledige timer krijgt een zichtbare actie Gegevens aanvullen zonder nieuwe
tijdknip. De omschrijving toont blijvend de opslagstatus en bij fouten een retryknop.

Registratietijd is de som van afzonderlijk afgeronde regels; Intapp-totaal volgt de
gekozen boekingsafronding. Beide zijn nu apart benoemd. De declarabel/i7/DVN-breakdown
blijft op registratiebasis. Tijdgaten zijn geen tekort tot acht uur; het apart getoonde
tekort en de voortgang volgen Intapp. In het weekend wordt geen norm gesuggereerd.
Historische uren en databaseversie 4 blijven ongewijzigd.

De oplevering omvat 180 geslaagde browserloze controles, waarvan 18 nieuw voor Y.
De i7-browsertest is aangepast aan de zoekroute, maar echte browsertests en visuele
browsercontrole zijn niet uitgevoerd. `sw.js` blijft ongewijzigd; het nog openstaande
cacheherstel uit fase X is geen onderdeel van Y. De verdere opschoning volgt in Z.
