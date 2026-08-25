# Hour Hound browserloze regressiesuite

Deze map bevat de kleine regressiesuite die zonder browser draait. Het doel is niet om de volledige UI te simuleren, maar om snel regressies te vangen in afspraken die bij Hour Hound makkelijk per ongeluk breken.

## Wat wordt getest?

1. **Syntax en laadvolgorde**
   Alle klassieke scripts moeten syntaxgeldig blijven en `index.html` moet ze in dezelfde volgorde laden. Omdat Hour Hound nog geen ES-modules gebruikt, is die volgorde functioneel belangrijk.

2. **Pure helpers uit productiecode**
   De suite laadt `js/core.js` in een Node `vm` met minimale DOM-stubs. Daardoor worden echte productiehelpers getest, zoals tijdconversie, datumhelpers, afronding naar 0,1 uur, DVN-statushelpers en `takenVandaag()`.

3. **Opslagcontracten met foutinjectie**
   Een kleine fake IndexedDB controleert databaseversie, stores, index, repositories en de ene
   consistente bootsnapshot. Een geïnjecteerde transactiefout moet afwijzen voordat runtimegeheugen
   wordt vervangen.

4. **Statische workflow-invarianten**
   Sommige contracten zitten nu nog verspreid over HTML, CSS en globale JS. Die worden bewust als broninvarianten getest, bijvoorbeeld:
   - de recente-takenlijst mag niet meer hard op vier items worden afgekapt;
   - sneltoetsen voor recente taken blijven beperkt tot 1–4;
   - sheets/modals blokkeren globale sneltoetsen;
   - dagafsluiting, heropenen, oude lopende timers, veilige regelbewerking en DVN → Intapp-statussen blijven aanwezig;
   - oude timers en bewerking van een lopende regel blijven op het timerOp-contract;
   - hervatten van een recente taak start niet per ongeluk twee timerwissels;
   - backup/import bewaart nieuwe dag- en DVN-metadata;
   - service worker cacheert geen testbestanden.

## Wanneer tests aanpassen?

Pas een test alleen aan als het productcontract bewust wijzigt. Voorbeelden:

- Wordt Hour Hound omgezet naar ES-modules, vervang dan de `vm`-loader door directe imports.
- Krijgen recente taken bewust meer sneltoetsen dan `1`–`4`, pas de recente-taken-test aan.
- Worden DVN-statussen hernoemd, pas de DVN-tests én de migratie/importtests aan.
- Wordt inline editing ooit bewust weer toegestaan, pas de veilige-regelbewerkingtest aan en documenteer waarom dat veilig is.

## Uitvoeren

Na toevoeging aan de repository:

```bash
npm run test:browserless
```

De suite gebruikt alleen Node.js core modules. Er zijn dus geen npm dependencies nodig.

## Relatie met Playwright

Deze suite is bedoeld als snel harnas dat ook in een kale omgeving werkt. Hij vervangt Playwright niet: echte UI-flows, focusgedrag, IndexedDB-herlaadgedrag en service-worker-effecten horen in `tests/e2e/` thuis. Lees ook `tests/LESSONS_LEARNED.md` voordat je tests versoepelt of verwijdert.

### Patch D-contracten

De suite bewaakt daarnaast dat dagafsluitstatus via `dagSluitStatus()` wordt gelezen en dat
auto-aanvullen een administratieve totaalaanvulling is. Een wijziging die opnieuw naar lege
kloktijdvakken zoekt om tot 8,0 uur te komen, is een productregressie en mag niet worden opgelost
door deze test losser te maken.

### Patch D.1-contract

`werkdag(datum)` is de centrale kalenderdefinitie. Vrijdag blijft afsluitplichtig; zaterdag en
zondag mogen regels bevatten, maar tellen niet als eerdere open werkdagen en krijgen geen
8,0-uursaanvulling. UI-code mag hiervoor geen eigen, afwijkende weekendtest introduceren.

### Patch E-contract

De recente-takenlijst meet maximaal vier zichtbare regels. Een render tijdens de verborgen
Beheer-tab mag geen nulhoogte opslaan. Bij terugkeer naar Nu moet `showTab("nu")` daarom
`renderRecent()` aanroepen nadat de view zichtbaar is gemaakt.

### Patch F-contract

DVN-dossiernummers worden alleen onder Beheer gewijzigd. Week blijft alleen-lezen. Een resolved
DVN biedt `Boeken in Intapp`, toont alle gekoppelde regels en het totaal, en wordt pas na de
expliciete bevestiging `Alles ingevoerd in Intapp` afgehandeld. Afgehandelde DVN’s blijven onder
een inklapbare groep traceerbaar en vallen bij latere wijzigingen terug naar `controle nodig`.
De importkeuring bewaart de interne `posted`-status en de daarbij vastgelegde regel-id’s en uren.

### Patch G-contract

Nu toont compact `Declarabel X · i7 Y (DVN Z)`. Gewone dossiers zijn declarabel; alle
niet-declarabele/i7-tijd, inclusief DVN, telt bij i7. DVN blijft daarnaast apart zichtbaar,
ook nadat een echt dossiernummer is toegekend. De breakdown gebruikt de oorspronkelijke
registratiesoort en de bestaande afgeronde uren.

### Patch G.1-contract

Een DVN zonder dossiernummer kan onder Beheer bewust naar `Definitief i7`. De terminale
dispositie bewaart auditgegevens en regel-id’s, houdt alle regels op de vaste werkcode
Commercieel en presenteert ze voortaan via het gewone i7-dossier. De DVN verdwijnt uit open
DVN-acties en uit `(DVN Z)`, maar de uren blijven in het i7-totaal. Backupversie 8 bewaart
deze beslissing en voorkomt dat een oudere importeur haar stilzwijgend verliest.

### Patch H-contract

Een gewone dossierregel die tijdelijk niet boekbaar is, wordt na handmatige invoer op
`i7 · Commercieel` apart geparkeerd. Hij wordt niet DVN en niet als geboekt op het doeldossier
gemarkeerd. De suite bewaakt de aparte IndexedDB-store, de drie dagstatusaantallen, terugval naar
`Gewijzigd — controleren`, de latere dossierboeking zonder i7-correctie en de alternatieve
terminale omzetting van de HH-bronregels naar definitief i7. Backupversie 9 neemt deze wachtrij
mee bij export, terugzetten en samenvoegen.

### Brede regressieronde na Patch H

De suite bewaakt aanvullend de volledige levenscyclus rond die wachtrij. Een afgeronde overboeking
blijft op de oorspronkelijke dag als geboekt herkenbaar, maar alleen zolang de actuele
inhoudsvingerafdruk nog overeenkomt. Nieuw identiek werk blijft een afzonderlijke Intapp-regel,
open bronregels kunnen niet worden verwijderd en wijzigingen in brondata of afrondingsmodus vallen
terug naar `Gewijzigd — controleren`.

De brede ronde controleert daarnaast de timer-invariant, de lokale i7-codeplicht, strikte
restore-keuring, schema-9-checksum, DOM-id-referenties en de exacte service-worker-assetlijst. Die
laatste test mag nooit worden versoepeld door testbestanden aan `ASSETS` toe te voegen.

### Patch M-contract

`js/storage/indexeddb.js` is de enige eigenaar van database openen, schema-upgrade en generieke
transacties. Databasenaam `hourhound`, versie 4, alle bestaande stores, key paths en de index
`regels.datum` blijven exact gelijk. Regels, dossiers, configuratiemeta en overboekingen hebben
kleine repositories; dit is geen generiek repositoryframework.

Boot en herladen lezen dossiers, sjablonen, codes, regels, overboekingen en relevante metadata in
één readonly transactie via `loadSnapshot()`. De runtime-arrays worden pas vervangen nadat die
hele transactie is geslaagd. Timer- en importworkflows houden hun bestaande transacties over
meerdere stores; repositories mogen zo'n use-case nooit opdelen in losse schrijfacties.
