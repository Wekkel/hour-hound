# Hour Hound Playwright-smoketests

Deze map bevat de browsertests voor de belangrijkste Hour Hound-flows. Ze vullen de browserloze regressiesuite aan: de browserloze tests zijn snel en controleren veel broncontracten; deze Playwright-tests openen de echte UI en testen enkele kernpaden van begin tot eind.

## Flows die nu worden bewaakt

1. **Lopende taak van eerdere dag**
   De app moet bij start een oude open timer herkennen en een duidelijke sheet tonen met concrete keuzes. De test kiest bewust `Door laten lopen`.

2. **Veilige bewerking van bestaande tijdregels**
   Een opgeslagen regel op de Dag-tab wordt niet rauw inline gewijzigd, maar via de sheet `Tijdregel bewerken` en expliciet `Wijzigingen opslaan`.

3. **DVN → dossiernummer → Intapp-status**
   Een DVN blijft intern DVN, krijgt een echt dossiernummer voor Intapp, en kan daarna als `ingevoerd in Intapp` worden gemarkeerd.

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

- dag afsluiten met en zonder automatische Diversen-aanvulling;
- dag heropenen en automatische aanvulregels verwijderen/behouden;
- boeken in Intapp en boekstatus terugval;
- import/export/restore van echte backups.

Pas bestaande tests alleen aan als de gebruikersflow bewust wijzigt. Verandert alleen de code intern, dan horen deze tests juist gelijk te blijven.
