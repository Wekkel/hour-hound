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
