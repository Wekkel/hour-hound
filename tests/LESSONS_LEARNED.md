# Hour Hound test lessons learned

Deze notities horen bij de regressies die na Patch A/B/C door de Playwright-smoketests zichtbaar werden. Ze zijn bedoeld voor een volgende LLM of ontwikkelaar voordat er opnieuw aan de timer-, Dag- of DVN-code wordt gewerkt.

## 1. Groene statische tests zijn geen bewijs dat gebruikersflows werken

De eerste browserloze suite was groen, maar drie e2e-flows faalden. De oorzaak was dat de suite vooral aanwezigheid van functies en strings controleerde. Dat is nuttig als tripwire voor klassieke globals, maar het vangt geen echte DOM-volgorde, service-worker-effecten, focus/autocomplete-mutaties of timerherlaadgedrag.

Bij wijzigingen in een kernworkflow moet daarom minimaal één Playwright-flow bestaan die de zichtbare gebruikersroute uitvoert.

## 2. Geen stille timeractie over datumgrenzen

`middernachtCheck()` mag een lopende regel van een eerdere datum niet stilzwijgend sluiten. De gebruiker moet dezelfde keuze krijgen als bij app-start: stoppen op gekozen tijdstip, door laten lopen, of de taak bekijken/bewerken.

Omdat een HH-tijdregel geen einddatumveld heeft, telt een oude open regel voor berekeningen maximaal tot `23:59` van zijn eigen datum. Dat voorkomt dat maandagse tijd administratief op vrijdag terechtkomt.

## 3. Readonly UI is niet genoeg

Een veld readonly maken voorkomt niet dat bestaande `input`, `change`, `blur`, `focusin` of autocomplete-handlers nog steeds mutaties uitvoeren. Voor opgeslagen Dag-regels is het productcontract: lezen in de tabel, wijzigen alleen via de bewerksheet met expliciet opslaan.

Bij elke wijziging aan de Dag-tabel moet gecontroleerd worden dat er geen muterende inline-handler terugkomt.

## 4. DVN-status moet centraal terugvallen

Een DVN die als ingevoerd in Intapp is gemarkeerd, moet naar `controle nodig` zodra een betrokken tijdregel of relevante DVN-metadata later wijzigt. Dat mag niet per knop handmatig worden onthouden. Gebruik een gedeelde helper zoals `dvnPutIfPosted()` op alle schrijfpaden.

Controleer specifiek: starten, stoppen, koppelen, live omschrijving, editor, verwijderen, opnieuw lopend maken, DVN-naam en DVN-dossiernummer.

## 5. Timerstate alleen via het timerpad

Wijzigingen aan `meta.running` en een lopende regel horen via `timerOp()`/de timertransactie te lopen. Een editor of herstelactie die buiten dat pad schrijft, kan race-achtige bugs veroorzaken met sneltoetsen, intervalchecks of openstaande debounced saves.

## 6. Playwright-locators moeten precies zijn

Losse tekstlocators waren fragiel: `Dag` kan ook in andere knoppen of tekst voorkomen, en `DVN naar Intapp` kan op meerdere plekken staan. Gebruik liever stabiele ids, `#tabs [data-v="dag"]`, modal-ids en scoped locators.

## 7. Service workers horen niet in e2e-rooktests te domineren

Voor Playwright-smoketests worden service workers geblokkeerd. Dat voorkomt dat `claim()`/reload of oude caches de test instabiel maken. De SW zelf wordt browserloos gecontroleerd op de belangrijkste invariant: testbestanden mogen niet in de cachelijst staan.
