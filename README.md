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
node tests/browserless/regression.mjs
./node_modules/.bin/playwright test
```

De browserloze suite voert onder meer de echte N-, T-, O- en P-adapters uit en opent
de DVN-selectie met representatieve data. De Playwright-suite vereist een lokaal
geïnstalleerde Chromium-browser.
