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

## Patch Z: dossieraanmaak en gerichte opschoning

Dossieraanmaak in Beheer en het i7-startdossier lopen via de administratieve service met één
atomaire lees/controle/schrijftransactie. Een bezet ID wordt niet overschreven en
nieuwe dossiernummers worden opnieuw tegen de opgeslagen dossiers gecontroleerd.
Gelijktijdige i7-aanvragen hergebruiken hetzelfde dossier. Bij een mislukte aanmaak
blijft de invoer in Beheer staan; geheugen en succesmelding volgen pas na opslag.
De oude, ongebruikte schrijfRegel-helper is verwijderd. Bewuste transacties voor
migratie, import en timerwijzigingen blijven behouden.

Dossierzoeken gebruikt een afgeleide index die wordt vernieuwd bij vervanging van
de dossierlijst. Een lokale microbenchmark met 5.000 dossiers en 10.000 zoekacties
per ronde ging van circa 230 ms naar 2–5 ms. Dit meet de zoekfunctie, niet de totale
reactietijd van de app. Gedrag bij wijzigen, verwijderen en importeren is afgedekt.

Databaseversie 4 en backupschema 11 blijven behouden. Er is geen datamigratie.
Echte browser-, visuele, offline- en service-worker-upgradeproeven zijn niet
uitgevoerd; de praktische validatie van Z staat daarom nog open. Het cacheherstel
uit X blijft apart: sw.js is niet gewijzigd en zit niet in deze patch.

Bij oplevering zijn 200 browserloze controles geslaagd (20 nieuw voor Z). De nieuwe
tests zijn ook tegen de ongewijzigde Y-baseline uitgevoerd en tonen de ontbrekende
service-afhandeling en herhaalde lineaire zoekactie. De hoofdagent heeft de diff
beoordeeld, de tests aangescherpt en alle relevante tests zelfstandig uitgevoerd.

## Patch X2: cacheherstel (na Z)

Deze aanvulling voert het eerder apart gehouden cacheherstel uit, met expliciete
toestemming om sw.js mee te leveren. De eerdere opmerkingen over het ontbrekende
cacheherstel beschrijven de toestand vóór X2. De patch bouwt voort op alle patches
tot en met Z; sw.js gaat van 0.1.20 naar 0.1.21.

Navigatie en verplichte appbestanden komen uit de cache van de actieve release.
Een ontbrekend verplicht bestand wordt niet stilzwijgend aangevuld uit een nieuwere
netwerkrelease. Een mislukte installatie wordt afgewezen, zodat de bestaande worker
actief kan blijven. Alleen oude Hour Hound-caches worden opgeruimd. HTTP-fouten
worden niet opgeslagen als bruikbare netwerkbestanden.

De bestaande updateknop blijft wachten op drafts en lopende writes. De patch wijzigt
geen uren, IndexedDB-schema of backupschema. Publiceer alle bestanden van de beoogde
release samen; het versienummer alleen controleert niet of een server tijdens een
onvolledige publicatie nog oude bestanden met HTTP-status 200 teruggeeft.

### Praktische controle na publicatie (nog niet uitgevoerd)

1. Maak een JSON-back-up via de app. Publiceer de eerdere patches tot en met Z en
   deze aanvulling als één complete release. Gebruik voor latere releases steeds een
   nieuw, nog niet gebruikt VERSION in sw.js.
2. Open de bestaande app online en gebruik de knop Update zodra die verschijnt.
   Controleer daarna de versie en of de bestaande uren en dossiers aanwezig zijn.
3. Zet de browser offline en herlaad de app. Controleer Nieuwe taak, Pauze/Verder en
   het terugvinden van de ingevoerde gegevens na opnieuw openen.
4. Test in een aparte testomgeving een update met een ontbrekend verplicht bestand:
   de installatie moet mislukken, terwijl de bestaande versie blijft werken.
5. Test een update met twee open vensters en een gewijzigde omschrijving. Herladen
   mag pas volgen nadat de wijzigingen zijn opgeslagen; bij een opslagfout moet
   opnieuw proberen mogelijk blijven.

De bestaande Playwright-smoketests blokkeren service workers en bewijzen deze
upgrade- en offlinegevallen dus niet. Hiervoor blijft een echte browserproef nodig.
De installatie-foutafhandeling volgt de
[waitUntil-semantiek](https://developer.mozilla.org/en-US/docs/Web/API/ExtendableEvent/waitUntil).

## Patch AA: drie duidelijke Nieuwe-taakroutes

Nieuwe taak begint weer met drie afzonderlijke keuzes: Dossier, i7 en DVN. Elke
keuze opent alleen de bijbehorende invoerroute. De gezamenlijke zoeklijst met
dossiers, i7-codes, recente taken en DVN-items is verwijderd, omdat daarin te
gemakkelijk de verkeerde taaksoort werd gekozen.

Dossier toont uitsluitend gewone en inmiddels van een nummer voorziene dossiers.
i7 koppelt het vaste indirecte-urendossier en vraagt daarna om een werkcode. DVN
begint zonder dossierkoppeling en maakt of hergebruikt pas in de volgende stap een
voorlopig dossier; Commercieel blijft daarbij automatisch. De toetsen 1, 2 en 3
kiezen respectievelijk Dossier, i7 en DVN. Escape gaat één stap terug.

De timer start nog steeds meteen wanneer Nieuwe taak wordt gekozen. De categorie en
metadata worden daarna op diezelfde lopende regel opgeslagen. De wijziging raakt
geen bestaande uren, dossiers, database- of backupschema's.

`sw.js` is niet opgenomen. Verhoog bij publicatie het versienummer daarin van
0.1.21 naar een nieuw, nog niet gebruikt nummer, zodat de gewijzigde JavaScript- en
CSS-bestanden als één release worden geïnstalleerd.

Bij oplevering zijn 220 browserloze controles geslaagd, waarvan negen gericht op
de drie taakroutes, teruggaan, opslagfouten en dubbelklikken. Dezelfde negen tests
falen tegen de vorige versie. De bestaande Playwright-test voor i7 is aangepast aan
de nieuwe eerste keuze, maar niet uitgevoerd omdat in de testomgeving geen browser
beschikbaar is.

Validatie: 215 browserloze controles geslaagd, inclusief 15 nieuwe tests die de
werkelijke service-worker-callbacks uitvoeren met native Request/Response en een
gesimuleerde CacheStorage. Dezelfde cachetests tegen Z: 4 geslaagd, 11 gefaald.
De hoofdagent heeft de uiteindelijke tests geschreven en zelfstandig uitgevoerd;
Sol Medium heeft de productiewijziging onafhankelijk beoordeeld. Echte browser-
en service-worker-upgradeproeven zijn niet uitgevoerd wegens ontbrekende browser.

Deploymentbeperking: deze cachenaam gaat uit van één Hour Hound-installatie per
origin (protocol, host en poort). Meerdere Hour Hound-kopieën op verschillende
paden van hetzelfde domein delen de cacheprefix en kunnen elkaars caches raken.
Gebruik voor een tweede testinstallatie een aparte origin. Andere applicaties
zonder de Hour Hound-cacheprefix worden bij activeren niet meer opgeruimd.
