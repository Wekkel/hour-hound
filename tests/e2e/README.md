# Hour Hound Playwright-smoketests

Deze map bevat de browsertests voor de belangrijkste Hour Hound-flows. Ze vullen de browserloze regressiesuite aan: de browserloze tests zijn snel en controleren veel broncontracten; deze Playwright-tests openen de echte UI en testen enkele kernpaden van begin tot eind.

## Flows die nu worden bewaakt

1. **Lopende taak van eerdere dag**
   De app moet bij start een oude open timer herkennen en een duidelijke sheet tonen. Stilzwijgend afsluiten om 23:59 is verboden; `Door laten lopen` houdt de timer op de oorspronkelijke datum.

2. **Veilige bewerking van bestaande tijdregels**
   Een opgeslagen regel op de Dag-tab wordt niet rauw inline gewijzigd, maar via de sheet `Tijdregel bewerken` en expliciet `Wijzigingen opslaan`.

3. **DVN → dossiernummer → Boeken in Intapp → Afgehandeld**
   Een DVN blijft intern DVN, krijgt onder Beheer een echt dossiernummer en toont vervolgens alle
   betrokken regels met het juiste totaal in de boekingssheet. Na `Alles ingevoerd in Intapp`
   verhuist hij naar de inklapbare groep Afgehandeld. Week is alleen-lezen. Een latere
   tijdregelwijziging zet de DVN terug naar `controle nodig` in de open werkvoorraad.

4. **DVN → Definitief i7**
   Als bewust geen dossiernummer meer komt, zet Beheer alle betrokken regels definitief op
   `i7 · Commercieel`. De DVN verdwijnt uit de werkvoorraad en uit het DVN-deel van Nu, terwijl
   de i7-uren en auditmetadata bewaard blijven.

5. **Dagafsluiting**
   Einde werkdag opent de afsluitsheet. Afsluiten zonder Diversen-aanvulling mag niets extra boeken.

6. **Recente taken**
   Alle taken van vandaag blijven zichtbaar; alleen de eerste vier hebben sneltoetsen 1–4 en de lijst gaat scrollen vanaf taak 5.

7. **Weekend zonder afsluitplicht**
   Een open vrijdag blijft in de herinnering staan. Regels op zaterdag en zondag blijven zichtbaar
   en bewerkbaar, maar veroorzaken geen open-dagmelding, 8-uursnorm of aanvulactie.

8. **Recente taken na Beheer-mutaties**
   Na het toekennen van een dossiernummer aan een DVN en een andere Beheer-mutatie moet Nu alle
   recente taken onmiddellijk tonen. De gebruiker hoeft niet eerst `N` te drukken; een verborgen
   render mag geen `max-height: 0px` achterlaten.

9. **Tijdelijk niet boekbaar dossier**
   Een gewone dossierregel kan in de Intapp-wizard na bevestigde invoer op `i7 · Commercieel`
   worden geparkeerd. Dag toont hem apart als geparkeerd; Beheer groepeert hem onder het echte
   doeldossier. De latere bevestiging handelt alleen de wachtrij af, laat de HH-bronregel op het
   gewone dossier staan en vraagt geen correctie van de eerdere i7-boeking.

Playwright blokkeert service workers (`serviceWorkers: 'block'`), zodat SW-claim/reload de smoketests niet flaky maakt. Dat is testharnas, geen productwijziging.

## Uitvoeren

Installeer eerst dependencies en de Playwright-browser:

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

Alles draaien:

```bash
npm test
```

## Wanneer uitbreiden of aanpassen?

Breid deze suite uit zodra een workflow voor de gebruiker administratief belangrijk wordt, bijvoorbeeld:

- dag heropenen en automatische aanvulregels verwijderen/behouden;
- boeken in Intapp en boekstatus terugval;
- import/export/restore van echte backups.

Pas bestaande tests alleen aan als de gebruikersflow bewust wijzigt. Verandert alleen de code intern, dan horen deze tests juist gelijk te blijven.

### Auto-aanvullen tot 8,0 uur

Er zijn twee kernscenario's die in Playwright moeten blijven bestaan:
1. minder dan 8,0 uur verantwoord: HH voegt exact het tekort als administratieve Diversen-regel toe;
2. 8,0 uur of meer verantwoord: HH voegt geen Diversen toe en meldt dat expliciet.

De test mag niet afhankelijk worden gemaakt van de aanwezigheid van lege kloktijdvakken. Dat is
juist het oude gedrag dat Patch D verwijdert.
