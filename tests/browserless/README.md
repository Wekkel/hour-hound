# Hour Hound browserloze regressiesuite

Deze map bevat de kleine regressiesuite die zonder browser draait. Het doel is niet om de volledige UI te simuleren, maar om snel regressies te vangen in afspraken die bij Hour Hound makkelijk per ongeluk breken.

## Wat wordt getest?

1. **Syntax en laadvolgorde**
   Alle klassieke scripts moeten syntaxgeldig blijven en `index.html` moet ze in dezelfde volgorde laden. Omdat Hour Hound nog geen ES-modules gebruikt, is die volgorde functioneel belangrijk.

2. **Pure helpers uit productiecode**
   De suite laadt `js/core.js` in een Node `vm` met minimale DOM-stubs. Daardoor worden echte productiehelpers getest, zoals tijdconversie, datumhelpers, afronding naar 0,1 uur, DVN-statushelpers en `takenVandaag()`.

3. **Statische workflow-invarianten**
   Sommige contracten zitten nu nog verspreid over HTML, CSS en globale JS. Die worden bewust als broninvarianten getest, bijvoorbeeld:
   - de recente-takenlijst mag niet meer hard op vier items worden afgekapt;
   - sneltoetsen voor recente taken blijven beperkt tot 1–4;
   - sheets/modals blokkeren globale sneltoetsen;
   - dagafsluiting, heropenen, oude lopende timers, veilige regelbewerking en DVN → Intapp-statussen blijven aanwezig;
   - backup/import bewaart nieuwe dag- en DVN-metadata.

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

## Waarom nog geen Playwright hier?

Deze suite is bedoeld als snel harnas dat ook in een kale omgeving werkt. In een latere stap komt daar een Playwright-smoketest naast voor de echte UI-flows: app openen, taak starten, oude timer melden, dag afsluiten, DVN nummer toekennen en DVN als ingevoerd markeren.
