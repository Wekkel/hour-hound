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


## Patch AB — feedback 15 september 2026

- Boekingscorrecties tonen dossiernummer, uren, eventuele werkcode en omschrijving
  als afzonderlijke velden. De huidige waarden hebben eigen kopieerknoppen;
  het eerdere boekingsbewijs blijft onveranderd zichtbaar.
- Bij een opgelost DVN vervangt `04.09.2026 omschrijving` het oude voorvoegsel
  met datum én dossiernaam. Ook eerder van hun datum ontdane DVN-regels krijgen
  bij het samenstellen van de boeking de werkdatum terug. Bronregels worden niet
  bij het installeren herschreven. Een afwijkende eerder bevestigde tekst blijft
  daarom terecht een expliciete correctie; bevestigingen worden niet stil aangepast.
- Tijdelijk boeken toont drie kopieervelden: het i7-dossiernummer, uren en de
  tijdelijke omschrijving met het echte doeldossiernummer en de dossiernaam.
  Genummerde voormalige DVN's, ook gekoppeld aan een bestaand dossier, ondersteunen
  parkeren, controleren en later afhandelen. Een ontbrekend doeldossier blokkeert
  de actie. De eerdere i7-bevestiging blijft in de historie staan.
- Na de laatste boeking of parkeeractie verschijnt een voltooiingsscherm. Kopiëren
  is uitgeschakeld, ook via het toetsenbord. Dit geldt ook bij heropenen van een
  volledig verwerkte dag en bij afronden via de hele lijst.
- Tabnavigatie ververst de algemene melding over open dagen. Een afsluitvenster
  controleert na bevestiging opnieuw of de dag intussen al is gesloten. De bestaande
  transactiecontrole blijft dubbele afsluitingen en aanvullingen blokkeren.

Validatie: 242 geslaagde controles via `npm run test:browserless`, met uitvoerende regressies voor de
kopieeracties, voltooiing, verouderde afsluitvensters en de parkeerketen. De nieuwe
regressies zijn ook tegen de vorige baseline uitgevoerd. Visuele browsertests en
het installeren van de PWA-update zijn in deze omgeving niet uitgevoerd.

Geen wijziging van databaseversie 4, back-upschema 11 of `sw.js`. Verhoog bij
publicatie zelf de serviceworker-cacheversie naar een nog niet gebruikte waarde.
Alle patchbestanden moeten samen worden gepubliceerd.

Een regel die eerder handmatig op i7 is ingevoerd maar in Hour Hound als gewone
boeking is bevestigd, wordt niet automatisch als geparkeerd herkend. Die eerdere
bevestiging moet op basis van de werkelijke Intapp-invoer worden hersteld; deze
patch raadt niet welke bestaande boekingen dat betreft.

## Patch AC — dossierwerkvoorraad en boeken vanuit Dag

Beheer opent met een compacte werkvoorraad per dossier, een zoekveld en filters.
DVN-koppelingen volgen de opgeslagen dossieridentiteit; gelijke namen of hetzelfde
i7-nummer voegen verschillende zaken niet samen. Ontbrekende of tegenstrijdige
koppelingen blijven zichtbaar onder ‘Toewijzing controleren’. Tellingen betreffen
open acties: één correctie met meerdere regels blijft één actie.

‘Afhandelen’ opent de dossierwizard met afzonderlijke kopieervelden voor dossier,
uren, werkcode en omschrijving. Eerdere bevestigingen staan ingeklapt. Bij een
correctie met meerdere regels wordt de bevestiging pas na de laatste regel
opgeslagen. ‘Later doen’ verandert niets aan de boekingsstatus. Dossiergegevens
en instellingen/back-up hebben eigen onderdelen binnen Beheer.

Een correctie blokkeert niet langer de overige boekingen van dezelfde dag.
Vanuit het boekvenster leiden correcties naar de betrokken datum in Beheer.
Een verwerkte dag krijgt ook zonder dagafsluiting een grijze boekknop. Het
voltooiingsscherm onderscheidt geboekt, geparkeerd en nog te corrigeren;
kopiëren van reeds verwerkte regels blijft uitgeschakeld.

Bestaande bronregels, boekingsbewijzen en opslagformaten worden niet gemigreerd.
Hour Hound kan niet controleren wat daadwerkelijk in Intapp staat: bestaande
bevestigingen moeten bij twijfel met Intapp worden vergeleken.

Publiceer alle gewijzigde bestanden samen bovenop patch AB. `sw.js` is bewust
niet inbegrepen of gewijzigd; verhoog zelf de cacheversie bij publicatie.
Visuele browsertests en installatie van de PWA-update zijn niet uitgevoerd.

Validatie AC: `npm run test:browserless` slaagt met 272 controles, waaronder
30 nieuwe uitvoerende controles voor groepering, wizard, opslag en dagboeken.
Die 30 controles falen tegen de AB-baseline en slagen met AC.

## Patch AD — i7-werkcodes, DVN-nummer en parkeren

Nieuwe Taak koppelt een regel pas aan i7 wanneer de werkcode is gekozen. Een
onderbreking blijft herkenbaar als nog toe te wijzen tijd tot de dossierkeuze is
afgerond. De timer, het koppelen van een lopende regel en de Dag-editor weigeren
een i7-regel zonder werkcode; bij het opslaan wordt de actuele werklijst uit
IndexedDB gecontroleerd. Een onvoltooide, nog ongekoppelde regel moet onder Dag
worden afgemaakt voordat de dag naar Intapp kan.

Een DVN mag niet aan het bestaande i7-dossiernummer worden gekoppeld. Bij een
nummer van een al bestaand gewoon dossier toont het nummerformulier de naam van
dat dossier als alleen-lezen. Bij een eigen nummer blijft de DVN-naam bewerkbaar.

Het parkeerformulier toont het i7-dossier, de werkcode Commercieel, uren en de
omschrijving afzonderlijk, met kopieerknoppen. Parkeren weigert een bron die al
als gewone dossierboeking is bevestigd, inclusief een oude boekmarkering.
Hour Hound bewaart bij parkeren het echte doeldossier voor later.

Deze patch past geen bestaande regels of boekingsbewijzen aan. Controleer eerdere
bevestigingen tegen de daadwerkelijke invoer in Intapp; de app kan Intapp niet
zelf raadplegen. Publiceer de gewijzigde bestanden samen bovenop patch AC en
verhoog bij publicatie zelf de serviceworker-cacheversie. `sw.js` hoort niet bij
deze patch.

Validatie AD: `npm run test:browserless` slaagt, inclusief uitvoerende tests
voor oude tabbladen met gewijzigde werkcodes, DVN-nummering, parkeren en
Praktijkorganisatie bij de automatische dagaanvulling. Na publicatie is een
visuele controle in de PWA nog nodig; de browsertestomgeving was niet aanwezig.

## Patch AE — drie sferen afgedicht en gebundeld overboeken

Analyse van alle overgangen tussen gewoon dossier, i7 en DVN (zonder nummer, eigen
nummer, gekoppeld aan bestaand dossier, definitief i7) en de parkeerroute. Zie
`ANALYSE_PATCH_AE.md` voor de volledige bevindingenlijst.

- Een DVN-koppeling wordt tot het eindpunt gevolgd. Een verbroken of cyclische
  koppeling levert géén nummer meer op (voorheen: stil het oude `dvnResolvedNr`).
  Dag blokkeert elke regel zonder Intapp-dossiernummer.
- Het doeldossier van een gekoppelde DVN en het i7-dossier kunnen niet worden
  verwijderd. Een DVN die ooit een nummer of koppeling had, kan niet naar definitief i7.
- De generieke dossiersave in Beheer kan geen sfeer wisselen (DVN/i7/koppeling),
  geen DVN-/i7-nummer wijzigen en geen dubbel nummer opslaan.
- Een geparkeerde bronregel kan niet naar een ander dossier, i7 of DVN worden verhangen.
- Nieuwe dossiers uit wizard, live veld en bewerksheet krijgen de nummercontrole
  binnen de schrijftransactie. Beheer maakt geen dossier zonder nummer meer aan.
- Nieuwe taak → DVN: teruggaan en een andere naam typen hernoemt een bestaande DVN
  met historie niet meer; alleen een DVN die uitsluitend voor de lopende regel bestaat
  mag nog worden verbeterd. Hernoemen van een DVN met bevestigde boekingen vraagt
  eerst bevestiging. DVN-namen kunnen geen `·` meer bevatten.
- Het live dossierveld toont alleen gewone dossiers; i7 en DVN lopen via Nieuwe taak
  of Gegevens aanvullen. Gekoppelde DVN-schillen staan niet meer als los dossier in de
  Dossier-route. Een naam die bij meerdere dossiers hoort wordt nooit stil gekozen.
- Beheer bundelt alle wachtende tijdelijk-i7-items per doeldossier tot één actie:
  regel voor regel overnemen, één bevestiging, één transactie. Gewijzigde items blijven
  een aparte controle-actie; "Dit item definitief i7" raakt alleen het getoonde item.

Geen wijziging van databaseversie 4, back-upschema 11, bestaande regels of
boekingsbewijzen. `sw.js` hoort niet bij deze patch; verhoog bij publicatie zelf de
cacheversie. Publiceer alle gewijzigde bestanden samen bovenop AD.

Validatie AE: `npm run test:browserless` slaagt (alle suites, 311 controles), inclusief
19 nieuwe uitvoerende controles in `phase-ae-spheres.mjs`. Tegen de ongewijzigde
AD-code falen daarvan 16; de 3 die daar slagen zijn bewuste bewakers dat bestaand goed
gedrag blijft (geldige DVN boekbaar, typfoutherstel, geen definitief i7 na nummer).
Visuele browsercontrole en PWA-update zijn niet uitgevoerd.

## Patch AF — regels zonder soort voorkomen en herstellen

Waarom er regels zonder Dossier/i7/DVN ontstonden:

- **N gevolgd door Esc.** De timer start meteen (bewust, de tijdknip gaat voor); wie de
  keuze sluit zonder soort te kiezen, houdt een lopende regel zonder dossier. De volgende
  N sluit die af. Dit blijft zo, maar is nu in de bewerksheet snel te herstellen.
- **"+ regel" en een gat invullen (✎)** sloegen eerst een lege regel op en openden daarna
  de bewerksheet. Annuleren liet die lege regel staan (bijv. 20:35–20:35, 0,1 u).
  Nu is dat een concept: pas "Regel toevoegen" slaat op, annuleren laat niets achter.
- **De bewerksheet accepteerde een leeg dossierveld.** Nu weigert zowel de sheet als de
  dagservice een afgesloten werkregel zonder soort (`dossier_required`).

De bewerksheet heeft bovenaan de keuze **Dossier · i7 · DVN**:

- i7: het i7-nummer wordt zelf ingevuld en staat vast; de werkcode kies je uit de
  i7-werklijst (typen filtert, pijltjes + Enter kiest).
- DVN: kies een bestaande DVN of maak een nieuwe werknaam; Commercieel staat vast en het
  voorvoegsel `datum · naam · tekst` wordt automatisch gezet.
- Dossier: alleen gewone dossiers in de lijst; nieuw als `123456789 - naam`.
- Een afgesloten werkregel zonder omschrijving wordt niet opgeslagen.

De keuzelijst ligt nu boven dialogen (z-index). De sneltoetsuitleg onderaan noemde nog
T, O en V, die sinds Patch Y niet meer bestaan; die zijn verwijderd.

Validatie AF: `npm run test:browserless` slaagt (317 controles), met 6 nieuwe uitvoerende
controles in `phase-af-repair.mjs` tegen de echte bewerksheet, core, dagservice en
opslag. Tegen patch AE falen alle 6. De bestaande Phase U-editortest gebruikt nu een
regel mét dossier (nieuw contract). Geen database-, back-up- of `sw.js`-wijziging;
verhoog bij publicatie zelf de cacheversie. Bestaande regels zonder soort worden niet
automatisch gewijzigd: open ze via de rode foutregel en kies de soort.
