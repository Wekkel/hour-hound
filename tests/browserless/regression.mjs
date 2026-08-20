#!/usr/bin/env node
/*
  Hour Hound browserloze regressiesuite

  Doel
  ----
  Deze suite vangt regressies op in de kerncontracten van Hour Hound zonder een
  browser, IndexedDB, service worker of Playwright nodig te hebben. De tests zijn
  bewust klein en uitlegbaar: pure helpers worden rechtstreeks uit de productie-
  code geladen; kwetsbare UI/workflow-afspraken worden als statische invarianten
  gecontroleerd zolang de app nog klassieke globale scripts gebruikt.

  Wanneer aanpassen?
  ------------------
  Pas tests alleen aan wanneer het onderliggende productcontract bewust wijzigt.
  Voorbeelden:
  - Als scripts worden hernoemd of de laadvolgorde wijzigt, pas scriptOrder aan.
  - Als recente taken bewust meer dan 4 sneltoetsen krijgen, pas de recent-tests aan.
  - Als DVN-statussen worden hernoemd, pas de DVN-state tests en statische checks aan.
  - Als HH naar ES-modules gaat, vervang evaluateCorePure() door directe imports.
*/

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const read = rel => readFileSync(join(root, rel), 'utf8');
const src = {
  html: read('index.html'),
  css: read('css/app.css'),
  core: read('js/core.js'),
  timer: read('js/timer.js'),
  wizard: read('js/wizard.js'),
  views: read('js/views.js'),
  controls: read('js/controls.js'),
  io: read('js/io.js'),
  booking: read('js/booking.js'),
  app: read('js/app.js')
};

let failures = 0;
const tests = [];
function test(name, fn){ tests.push({name, fn}); }
function assert(cond, msg){ if(!cond) throw new Error(msg); }
function assertEq(actual, expected, msg){
  if(actual !== expected) throw new Error(`${msg}\nverwacht: ${expected}\ngekregen: ${actual}`);
}
function assertIncludes(text, needle, msg){ assert(text.includes(needle), msg || `Ontbreekt: ${needle}`); }
function assertNotIncludes(text, needle, msg){ assert(!text.includes(needle), msg || `Mag niet voorkomen: ${needle}`); }

function scriptOrderFromHtml(){
  return [...src.html.matchAll(/<script\s+src="\.\/(js\/[^"?]+)"/g)].map(m => m[1]);
}

function evaluateCorePure(){
  const dummyEl = () => ({
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    style: {}, dataset: {}, value: '', textContent: '', innerHTML: '',
    setAttribute(){}, appendChild(){}, focus(){}, select(){},
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    getBoundingClientRect(){ return { top: 0, bottom: 0, height: 0 }; }
  });
  const context = {
    console,
    setTimeout, clearTimeout,
    document: { getElementById(){ return dummyEl(); }, createElement(){ return dummyEl(); }, addEventListener(){}, removeEventListener(){}, body: { dataset: {} }, activeElement: null },
    window: { addEventListener(){}, removeEventListener(){} },
    navigator: {},
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    indexedDB: { open(){ return {}; } },
    stempel(d){ d.gewijzigd = d.gewijzigd || 1; return d; }
  };
  vm.createContext(context);
  const exportCode = `\n;globalThis.__hhSetState = function(s){\n`+
    `dossiers=s.dossiers||[]; templates=s.templates||[]; i7codes=s.i7codes||[]; alle=s.alle||[]; regels=s.regels||[]; running=s.running||null; stack=s.stack||[]; viewDate=s.viewDate||today();\n`+
    `return true;\n};\n`+
    `globalThis.__hhPure = { hm2m, m2hm, uu, ymd, dmy, parseD, addD, weekend, schoon, urenOf, ruweMin, eindOf, totaal, gapsFor, gapHours, takenVandaag, taakLabel, isDvn, isIndirect, dvnRegels, dvnResolvedNummer, dvnIntappState, dvnStatusTekst, dvnSummaryStatus, dvnAuditAdd, markDvnControleNodig, intappDossierInfo, codesFor, defaultCode, codeVoor, i7CodeOp };`;
  vm.runInContext(src.core + exportCode, context, { filename: 'js/core.js' });
  return { api: context.__hhPure, setState: context.__hhSetState };
}

// 1. Algemene bronkwaliteit --------------------------------------------------
test('alle klassieke JavaScriptbestanden blijven syntaxgeldig', () => {
  for (const name of readdirSync(join(root, 'js')).filter(x => x.endsWith('.js')).sort()) {
    const code = read(`js/${name}`);
    new Function(code);
  }
});

test('index.html laadt scripts in de afgesproken globale volgorde', () => {
  assertEq(scriptOrderFromHtml().join('\n'), [
    'js/core.js',
    'js/timer.js',
    'js/wizard.js',
    'js/views.js',
    'js/controls.js',
    'js/io.js',
    'js/booking.js',
    'js/app.js'
  ].join('\n'), 'Scriptvolgorde gewijzigd. Bij klassieke globals kan dat runtime breken.');
});

// 2. Pure helpers uit productiecode -----------------------------------------
test('tijdhelpers valideren en formatteren tijden voorspelbaar', () => {
  const { api } = evaluateCorePure();
  assertEq(api.hm2m('00:00'), 0, '00:00 moet minuut 0 zijn');
  assertEq(api.hm2m('09:30'), 570, '09:30 moet 570 minuten zijn');
  assertEq(api.hm2m('24:00'), null, '24:00 is geen geldige tijdregel-tijd');
  assertEq(api.hm2m('12:60'), null, '12:60 is ongeldig');
  assertEq(api.m2hm(570), '09:30', '570 minuten moet 09:30 zijn');
  assertEq(api.m2hm(-5), '00:00', 'Negatieve minuten worden begrensd');
  assertEq(api.m2hm(2000), '23:59', 'Meer dan een dag wordt begrensd');
});

test('datumhelpers houden Nederlandse werkdaglogica stabiel', () => {
  const { api } = evaluateCorePure();
  assertEq(api.dmy('2026-08-20'), '20.08.2026', 'dmy-format wijzigde');
  assertEq(api.addD('2026-08-14', 3), '2026-08-17', 'addD moet kalenderdagen optellen');
  assertEq(api.weekend('2026-08-15'), true, 'Zaterdag moet weekend zijn');
  assertEq(api.weekend('2026-08-17'), false, 'Maandag mag geen weekend zijn');
});

test('urenOf rondt losse tijdregels altijd naar boven af op 0,1 uur', () => {
  const { api, setState } = evaluateCorePure();
  setState({});
  assertEq(api.urenOf({ start: '09:00', eind: '09:01' }), 0.1, '1 minuut moet 0,1 uur worden');
  assertEq(api.urenOf({ start: '09:00', eind: '09:06' }), 0.1, '6 minuten moet 0,1 uur worden');
  assertEq(api.urenOf({ start: '09:00', eind: '09:07' }), 0.2, '7 minuten moet naar 0,2 uur afronden');
  assertEq(api.urenOf({ start: '09:00', eind: '09:30', urenHand: true, uren: 0.4 }), 0.4, 'Handmatige uren moeten leidend blijven');
});

test('DVN pure statushelpers onderscheiden ontbrekend, klaar, ingevoerd en controle nodig', () => {
  const { api, setState } = evaluateCorePure();
  const doel = { id: 'dos-1', naam: 'Echt dossier', nummer: '304999999' };
  const open = { id: 'dvn-open', naam: 'DVN open', voorlopig: true };
  const ready = { id: 'dvn-ready', naam: 'DVN ready', dvn: true, dvnResolvedNr: '304999998' };
  const linked = { id: 'dvn-linked', naam: 'DVN linked', dvn: true, dvnTo: doel.id };
  const posted = { id: 'dvn-posted', naam: 'DVN posted', dvn: true, dvnResolvedNr: '304999997', dvnIntappStatus: 'posted' };
  setState({ dossiers: [doel, open, ready, linked, posted] });
  assertEq(api.isDvn(open), true, 'voorlopig dossier moet DVN zijn');
  assertEq(api.dvnResolvedNummer(open), '', 'open DVN heeft nog geen nummer');
  assertEq(api.dvnResolvedNummer(ready), '304999998', 'resolved nummer moet worden gebruikt');
  assertEq(api.dvnResolvedNummer(linked), '304999999', 'gekoppeld doelnummer moet worden gebruikt');
  assertEq(api.dvnIntappState(open), 'missing', 'open DVN mist dossiernummer');
  assertEq(api.dvnIntappState(ready), 'ready', 'resolved DVN moet klaar voor Intapp zijn');
  assertEq(api.dvnIntappState(posted), 'posted', 'posted status moet blijven staan');
  const checked = api.markDvnControleNodig(posted, 'testwijziging');
  assertEq(api.dvnIntappState(checked), 'needs_check', 'posted DVN moet naar controle nodig kunnen vallen');
});

test('takenVandaag groepeert onbeperkt en behoudt recente taakidentiteit', () => {
  const { api, setState } = evaluateCorePure();
  const today = new Date();
  const ds = api.ymd(today);
  const dossiers = [{ id: 'd1', naam: 'Dossier A', nummer: '1' }];
  const alle = Array.from({ length: 7 }, (_, i) => ({
    id: `r${i}`, datum: ds, start: `0${i}:00`, eind: `0${i}:10`,
    dossierId: 'd1', soort: 'werk', code: '', omschrijving: `taak ${i}`
  }));
  setState({ dossiers, alle });
  const taken = api.takenVandaag();
  assertEq(taken.length, 7, 'takenVandaag mag niet tot vier worden beperkt');
  assert(taken.every(t => t.k.includes('|')), 'taakKey-achtige sleutel moet aanwezig blijven');
});

// 3. Statische workflow-invarianten -----------------------------------------
test('recente-takenlijst toont alle taken maar alleen sneltoetsen 1-4', () => {
  assertNotIncludes(src.views, 'takenVandaag().filter(t=>!running||t.k!==taakKey(running)).slice(0,4)',
    'renderRecent mag de lijst niet meer hard afkappen op 4');
  assertIncludes(src.views, 'recent.classList.toggle("recent-scroll",tk.length>4)',
    'renderRecent moet scrollstijl activeren vanaf taak 5');
  assertIncludes(src.views, '(i<4?"<kbd>"+(i+1)+"</kbd>":"")',
    'Alleen de eerste vier recente taken mogen sneltoetslabels tonen');
  assertIncludes(src.controls, 'slice(0,4)',
    'Keyboard shortcuts moeten bewust beperkt blijven tot 1-4');
  assertIncludes(src.css, '#recent.recent-scroll', 'CSS voor scrollbare recente-takenlijst ontbreekt');
});

test('modal/sheet staat globale sneltoetsen niet toe', () => {
  for (const id of ['dayclose', 'oldrun', 'editregel', 'dvnnum', 'dvnpost', 'boek', 'herstel']) {
    assertIncludes(src.views, `"${id}"`, `isModalOpen mist ${id}`);
  }
  for (const id of ['dayclose', 'oldrun', 'editregel', 'dvnnum', 'dvnpost']) {
    assertIncludes(src.controls, `"${id}"`, `controls sneltoetsblokkade mist ${id}`);
  }
});

test('dagafsluiting gebruikt expliciete sheet en auditvelden', () => {
  assertIncludes(src.html, 'id="dayclose"', 'Dagafsluitsheet ontbreekt');
  assertIncludes(src.views, 'function dagAfsluitKeuze', 'Dagafsluitkeuze moet via sheet lopen');
  assertIncludes(src.views, 'auditDag(datum,"gesloten"', 'Dagafsluiting moet audit schrijven');
  assertIncludes(src.views, 'function heropenWerkdag', 'Heropenfunctie ontbreekt');
  assertIncludes(src.views, 'autoAanvulRegels', 'Heropenen moet automatische aanvulregels kennen');
});

test('oude lopende taak over datumgrens krijgt expliciete keuzes', () => {
  assertIncludes(src.html, 'id="oldrun"', 'Oude-lopende-taaksheet ontbreekt');
  assertIncludes(src.views, 'function controleerOudeLopendeTaak', 'Detectie oude lopende taak ontbreekt');
  assertIncludes(src.views, 'function voorstelOudeTimerEind', 'Voorstel eindtijd oude taak ontbreekt');
  assertIncludes(src.controls, 'xr-stop', 'Stoppen op gekozen tijdstip-actie ontbreekt');
  assertIncludes(src.controls, 'xr-continue', 'Door laten lopen-actie ontbreekt');
  assertIncludes(src.controls, 'xr-edit', 'Taak bekijken/bewerken-actie ontbreekt');
});

test('bestaande tijdregels worden via bewerksheet gewijzigd, niet rauw inline', () => {
  assertIncludes(src.html, 'id="editregel"', 'Tijdregel-bewerksheet ontbreekt');
  assertIncludes(src.views, 'function openRegelEditor', 'openRegelEditor ontbreekt');
  assertIncludes(src.views, 'readonly', 'Dag-tabelvelden moeten read-only blijven');
  assertIncludes(src.views, 'bewerk', 'Dagregels moeten een bewuste bewerkactie tonen');
  assertIncludes(src.views, 'automatische Diversen-aanvulregel', 'Waarschuwing voor automatische regels ontbreekt');
});

test('DVN blijft intern herkenbaar na dossiernummer-toekenning', () => {
  assertIncludes(src.html, 'id="dvnnum"', 'DVN-nummer-sheet ontbreekt');
  assertIncludes(src.html, 'id="dvn-intapp"', 'Beheer-sectie DVN naar Intapp ontbreekt');
  assertIncludes(src.timer, 'dvn:true', 'DVN mag niet plat naar gewoon dossier verdwijnen');
  assertIncludes(src.timer, 'dvnOriginalName', 'Oorspronkelijke DVN-naam moet bewaard blijven');
  assertIncludes(src.timer, 'dvnResolvedNr', 'Toegekend dossiernummer moet als DVN-metadata bestaan');
  assertIncludes(src.core, 'function intappDossierInfo', 'Intapp-output moet via dossierinfo-resolutie lopen');
  assertIncludes(src.views, 'tag dvn', 'Dag/Intapp-output moet DVN-badge kunnen tonen');
});

test('DVN Intapp-status is markeerbaar en valt terug naar controle nodig bij latere wijzigingen', () => {
  assertIncludes(src.html, 'id="dvnpost"', 'DVN-post-sheet ontbreekt');
  assertIncludes(src.timer, 'function openDvnPostSheet', 'DVN-post-sheet opener ontbreekt');
  assertIncludes(src.timer, 'async function markeerDvnIngevoerd', 'Markeer-als-ingevoerd functie ontbreekt');
  assertIncludes(src.core, 'function dvnIntappState', 'DVN-statushelper ontbreekt');
  assertIncludes(src.core, '"posted"', 'DVN posted-status ontbreekt');
  assertIncludes(src.core, '"needs_check"', 'DVN controle-nodig status ontbreekt');
  assertIncludes(src.views, 'tijdregel gewijzigd', 'Bewerken van posted DVN-regel moet controle nodig maken');
  assertIncludes(src.views, 'tijdregel verwijderd', 'Verwijderen van posted DVN-regel moet controle nodig maken');
  assertIncludes(src.views, 'tijdregel opnieuw lopend gemaakt', 'Opnieuw lopend maken moet controle nodig maken');
  assertIncludes(src.timer, 'dossiernummer aangepast', 'Dossiernummerwijziging na posted moet controle nodig maken');
});

test('backup/import bewaart nieuwe dag- en DVN-metadata', () => {
  assertIncludes(src.io, 'const BACKUPVERSIE=7', 'Backupversie moet Patch C-metadata dekken');
  for (const key of ['dagAudit', 'dvnResolvedNr', 'dvnTo', 'dvnIntappStatus', 'dvnIntappAudit', 'dvnIntappPostedRuleIds']) {
    assertIncludes(src.io, key, `Backup/import mist ${key}`);
  }
});

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    failures++;
    console.error(`✗ ${name}`);
    console.error(err && err.stack ? err.stack : String(err));
  }
}

if (failures) {
  console.error(`\n${failures} browserloze regressietest(s) gefaald.`);
  process.exit(1);
}
console.log(`\n${tests.length} browserloze regressietests geslaagd.`);
