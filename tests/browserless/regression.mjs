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
  app: read('js/app.js'),
  sw: read('sw.js')
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
    `dossiers=s.dossiers||[]; templates=s.templates||[]; i7codes=s.i7codes||[]; alle=s.alle||[]; regels=s.regels||[]; running=s.running||null; stack=s.stack||[]; viewDate=s.viewDate||today(); dagEinde=s.dagEinde||{}; dagAudit=s.dagAudit||{};\n`+
    `return true;\n};\n`+
    `globalThis.__hhPure = { hm2m, m2hm, uu, ymd, dmy, parseD, addD, weekend, werkdag, schoon, urenOf, ruweMin, eindOf, totaal, gapsFor, gapHours, takenVandaag, taakLabel, autoAanvulTekort, dagSluitStatus, isDvn, isIndirect, dvnRegels, dvnResolvedNummer, dvnIntappState, dvnStatusTekst, dvnSummaryStatus, dvnAuditAdd, markDvnControleNodig, dvnPutIfPosted, intappDossierInfo, codesFor, defaultCode, codeVoor, i7CodeOp };`;
  vm.runInContext(src.core + exportCode, context, { filename: 'js/core.js' });
  return { api: context.__hhPure, setState: context.__hhSetState, context };
}

function evaluateIoPure(){
  const { context } = evaluateCorePure();
  vm.runInContext(src.io+
    '\n;globalThis.__hhIoPure = { keurDossiers, backupVersie: BACKUPVERSIE };',
    context,{filename:'js/io.js'});
  return context.__hhIoPure;
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
  assertEq(api.werkdag('2026-08-14'), true, 'Vrijdag moet een verplichte werkdag zijn');
  assertEq(api.werkdag('2026-08-15'), false, 'Zaterdag mag geen verplichte werkdag zijn');
  assertEq(api.werkdag('2026-08-16'), false, 'Zondag mag geen verplichte werkdag zijn');
});

test('weekenddagen vallen centraal buiten afsluitplicht en 8-uursaanvulling', () => {
  assertIncludes(src.views, 'werkdag(r.datum)&&dagSluitStatus(r.datum).open',
    'Open-dagdetectie moet de centrale werkdagdefinitie gebruiken');
  assertIncludes(src.views, 'function dagTekort(datum){return werkdag(datum)?',
    'Dagtekort moet voor weekenddagen centraal nul zijn');
  assertIncludes(src.views, 'if(!werkdag(viewDate))return{fout:"Weekenddagen hebben geen 8-uursaanvulling"}',
    'Het aanvulplan moet weekendaanvulling blokkeren');
  assertIncludes(src.views, 'if(!gesloten){\n    if(isWerkdag)',
    'De Dag-weergave mag voor een open weekenddag geen afsluitactie tonen');
  assertIncludes(src.views, 'const isWerkdag=werkdag(ds),tekort=isWerkdag?',
    'De Week-weergave moet dezelfde werkdagdefinitie gebruiken');
  assertIncludes(src.views, "(!isWerkdag&&t>0?'<div class=\"dd\">weekend</div>'",
    'Een weekendtegel met uren mag niet melden dat de norm is gehaald');
  assertIncludes(src.views, '$("t-progress").style.display=isWerkdag?"":"none"',
    'Nu mag in het weekend geen 8-uursvoortgang tonen');
  assertIncludes(src.views, '"uur verantwoord · weekend"',
    'Nu moet weekenduren zonder 8-uursnorm labelen');
  assertIncludes(src.views, '$("d-fill").style.display=werkdag(viewDate)?"":"none"',
    'De Dag-weergave mag de 8-uursaanvulactie in het weekend niet suggereren');
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
  assertEq(api.dvnStatusTekst(posted), 'dossiernummer 304999997 · afgehandeld',
    'De gebruikersstatus van een posted DVN moet afgehandeld zijn');
  const checked = api.markDvnControleNodig(posted, 'testwijziging');
  assertEq(api.dvnIntappState(checked), 'needs_check', 'posted DVN moet naar controle nodig kunnen vallen');
});

test('lopende taak van eerdere dag telt niet stilzwijgend door tot nu', () => {
  const { api, setState } = evaluateCorePure();
  const yesterday = api.addD(api.ymd(new Date()), -1);
  const running = { id: 'r-old', datum: yesterday, start: '15:20', eind: null, soort: 'werk' };
  setState({ alle: [running], running });
  assertEq(api.eindOf(running), '23:59',
    'Open regel van eerdere dag mag niet tot de huidige klok doortellen');
  assertEq(api.urenOf(running), 8.7, '15:20–23:59 moet 8,7 uur zijn, niet de tijd van vandaag');
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

test('recente taken worden pas gemeten wanneer Nu zichtbaar is', () => {
  assertIncludes(src.views, 'const meetbaar=$("v-nu").classList.contains("on")',
    'renderRecent moet weten of de Nu-tab zichtbaar en meetbaar is');
  assertIncludes(src.views, 'if(tk.length>4&&meetbaar)',
    'Een verborgen recente-takenlijst mag geen nulhoogte opslaan');
  assertIncludes(src.app, 'if(v==="nu")renderRecent()',
    'Terugkeren naar Nu moet de recente-takenhoogte opnieuw berekenen');
});

test('modal/sheet staat globale sneltoetsen niet toe', () => {
  for (const id of ['dayclose', 'oldrun', 'editregel', 'dvnnum', 'dvnpost', 'boek', 'herstel']) {
    assertIncludes(src.views, `"${id}"`, `isModalOpen mist ${id}`);
  }
  for (const id of ['dayclose', 'oldrun', 'editregel', 'dvnnum', 'dvnpost', 'herstel']) {
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


test('auto-aanvultekort kent alleen tekort of geen aanvulling', () => {
  const { api } = evaluateCorePure();
  assertEq(api.autoAanvulTekort(5.9), 2.1, '5,9 uur moet exact 2,1 uur aanvullen');
  assertEq(api.autoAanvulTekort(7.9), 0.1, '7,9 uur moet exact 0,1 uur aanvullen');
  assertEq(api.autoAanvulTekort(8.0), 0, '8,0 uur heeft geen aanvulling nodig');
  assertEq(api.autoAanvulTekort(8.6), 0, 'Boven 8,0 uur mag niets worden toegevoegd');
});

test('dagafsluitstatus heeft één centrale bron voor open en gesloten dagen', () => {
  const { api, setState } = evaluateCorePure();
  setState({ dagEinde: {}, dagAudit: {} });
  assert(api.dagSluitStatus('2026-08-21').open, 'Dag zonder dagEinde moet open zijn');
  setState({ dagEinde: { '2026-08-21': '17:00' }, dagAudit: {
    '2026-08-21': { events: [{ type: 'gesloten', t: '2026-08-21T17:00:00Z', eind: '17:00' }] }
  }});
  const dicht = api.dagSluitStatus('2026-08-21');
  assert(dicht.gesloten, 'Dag met dagEinde moet gesloten zijn');
  assertEq(dicht.eind, '17:00', 'Centrale status moet de opgeslagen eindtijd teruggeven');
  setState({ dagEinde: {}, dagAudit: {
    '2026-08-21': { events: [{ type: 'heropend', t: '2026-08-22T08:00:00Z' }] }
  }});
  const her = api.dagSluitStatus('2026-08-21');
  assert(her.open && her.heropend, 'Heropende dag moet centraal als open/heropend zichtbaar zijn');
  assertNotIncludes(src.views, 'dagEinde[',
    'UI-code in views.js moet dagstatus via dagSluitStatus() lezen, niet rechtstreeks uit dagEinde');
});

test('auto-aanvullen is administratief en niet afhankelijk van tijdvakken', () => {
  assertIncludes(src.core, 'administratieve totaalaanvulling',
    'Productcontract voor administratieve aanvulling ontbreekt');
  assertIncludes(src.views, 'urenHand:true',
    'Automatische Diversen-regel moet exact handmatig aantal uren dragen');
  assertIncludes(src.views, 'const tekort=autoAanvulTekort(nu)',
    'Aanvulling moet rechtstreeks uit het tekort tot 8,0 worden berekend');
  for (const forbidden of ['aanvulGaten', 'grootsteBlokTotNorm', 'Welke gaten wil je vullen?', 'vrije tijd om tot']) {
    assertNotIncludes(src.views, forbidden, `Auto-aanvullen mag niet meer afhankelijk zijn van tijdvakken: ${forbidden}`);
  }
  assertIncludes(src.views, 'Er was al "+uu(plan.nu)+" uur verantwoord. Er is daarom geen Diversen toegevoegd.',
    'Scenario 8,0 uur of meer moet expliciet melden dat niets is toegevoegd');
  assertIncludes(src.views, 'Hour Hound heeft "+uu(extra)+',
    'Scenario onder 8,0 uur moet expliciet melden hoeveel Diversen is toegevoegd');
  assertIncludes(src.views, '!r.autoAanvul&&r.urenHand',
    'Administratieve aanvulregel mag geen misleidende handmatige-urenwaarschuwing krijgen');
  assertIncludes(src.views, 'regels.filter(r=>!r.autoAanvul&&hm2m(r.start)!=null)',
    'Administratieve aanvulregel mag geen overlapwaarschuwing veroorzaken');
});
test('oude lopende taak over datumgrens krijgt expliciete keuzes', () => {
  assertIncludes(src.html, 'id="oldrun"', 'Oude-lopende-taaksheet ontbreekt');
  assertIncludes(src.views, 'function controleerOudeLopendeTaak', 'Detectie oude lopende taak ontbreekt');
  assertIncludes(src.views, 'function voorstelOudeTimerEind', 'Voorstel eindtijd oude taak ontbreekt');
  assertIncludes(src.controls, 'xr-stop', 'Stoppen op gekozen tijdstip-actie ontbreekt');
  assertIncludes(src.controls, 'xr-continue', 'Door laten lopen-actie ontbreekt');
  assertIncludes(src.controls, 'xr-edit', 'Taak bekijken/bewerken-actie ontbreekt');
  const midnight = (src.timer.match(/async function middernachtCheck\(\)\{[\s\S]*?\n\}/) || [''])[0];
  assert(midnight, 'middernachtCheck ontbreekt');
  assertNotIncludes(midnight, '_stop', 'middernacht mag een oude timer niet stilzwijgend afsluiten');
  assertIncludes(midnight, 'controleerOudeLopendeTaak', 'middernacht moet dezelfde keuzesheet tonen');
  assertIncludes(src.timer, 'k.datum!==today()', 'Impliciet sluiten van een oude regel moet op 23:59 blijven');
});

test('bestaande tijdregels worden via bewerksheet gewijzigd, niet rauw inline', () => {
  assertIncludes(src.html, 'id="editregel"', 'Tijdregel-bewerksheet ontbreekt');
  assertIncludes(src.views, 'function openRegelEditor', 'openRegelEditor ontbreekt');
  assertIncludes(src.views, 'readonly', 'Dag-tabelvelden moeten read-only blijven');
  assertIncludes(src.views, 'bewerk', 'Dagregels moeten een bewuste bewerkactie tonen');
  assertIncludes(src.views, 'automatische Diversen-aanvulregel', 'Waarschuwing voor automatische regels ontbreekt');
  for (const eventName of ['focusin', 'input', 'change', 'blur']) {
    assertNotIncludes(src.views, `$("d-table").addEventListener("${eventName}"`,
      `Dag-tabel mag geen rauwe ${eventName}-handler meer hebben`);
  }
  assertIncludes(src.views, 'input[data-f][readonly]',
    'Klikken op readonly dagvelden moet de bewerksheet openen');
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

test('DVN Intapp-workflow toont regels, archiveert done en bewaakt terugval', () => {
  assertIncludes(src.html, 'id="dvnpost"', 'DVN-post-sheet ontbreekt');
  assertIncludes(src.html, 'Boeken in Intapp', 'De begeleide DVN-boekingsactie ontbreekt');
  assertIncludes(src.html, 'id="dp-lines"', 'De boekingssheet moet alle DVN-regels kunnen tonen');
  assertIncludes(src.html, 'Alles ingevoerd in Intapp', 'Expliciete eindbevestiging ontbreekt');
  assertIncludes(src.timer, 'function openDvnPostSheet', 'DVN-post-sheet opener ontbreekt');
  assertIncludes(src.timer, 'async function markeerDvnIngevoerd', 'Markeer-als-ingevoerd functie ontbreekt');
  assertIncludes(src.timer, 'data-dvn-rule', 'Boekingssheet moet herkenbare bronregels tonen');
  assertIncludes(src.timer, 'dvnIntappPostedRuleIds:rs.map', 'Afhandeling moet de betrokken regel-id’s vastleggen');
  assertIncludes(src.core, 'function dvnIntappState', 'DVN-statushelper ontbreekt');
  assertIncludes(src.core, 'function dvnPutIfPosted', 'Gedeelde posted-DVN-terugval ontbreekt');
  assertIncludes(src.core, '"posted"', 'DVN posted-status ontbreekt');
  assertIncludes(src.core, '"needs_check"', 'DVN controle-nodig status ontbreekt');
  assertIncludes(src.views, 'tijdregel gewijzigd', 'Bewerken van posted DVN-regel moet controle nodig maken');
  assertIncludes(src.views, 'tijdregel verwijderd', 'Verwijderen van posted DVN-regel moet controle nodig maken');
  assertIncludes(src.views, 'tijdregel opnieuw lopend gemaakt', 'Opnieuw lopend maken moet controle nodig maken');
  assertIncludes(src.timer, 'dossiernummer aangepast', 'Dossiernummerwijziging na posted moet controle nodig maken');
  assertIncludes(src.timer, 'dvnPutIfPosted', 'Timerpaden moeten posted DVN via de gedeelde helper terugzetten');
  assertIncludes(src.views, 'id="dvn-open"', 'Open DVN-acties moeten een eigen werkvoorraad hebben');
  assertIncludes(src.views, 'id="dvn-done"', 'Afgehandelde DVN’s moeten traceerbaar en inklapbaar blijven');
  assertIncludes(src.views, '>Boeken in Intapp</button>', 'Beheer moet de begeleide boekingsactie aanbieden');
  const week = (src.views.match(/function renderWeek\(\)\{[\s\S]*?\nfunction dvnAuditTekst/) || [''])[0];
  assert(week, 'renderWeek/DVN-statusblok ontbreekt');
  assertIncludes(week, 'Alleen-lezen · wijzigen onder Beheer', 'Week moet naar Beheer verwijzen');
  assertNotIncludes(week, 'data-nr=', 'Week mag geen DVN-dossiernummer wijzigen');
  assertNotIncludes(week, 'kenNummerToe', 'Week mag de nummerworkflow niet aanroepen');
});

test('hervatten van een recente taak start exact één nieuwe timerwissel', () => {
  const m = src.views.match(/async function hervat\(k\)\{[\s\S]*?\n\}/);
  assert(m, 'hervat() ontbreekt');
  const body = m[0];
  assertEq((body.match(/await kiesTaak\(/g) || []).length, 1,
    'hervat() mag niet twee keer achter elkaar dezelfde taak starten');
  assertEq((body.match(/takenVandaag\(\)\.find/g) || []).length, 1,
    'hervat() moet de taak één keer opzoeken en daarna dezelfde snapshot gebruiken');
});

test('oude timer en editor volgen timerOp-contract', () => {
  assertIncludes(src.timer, 'function middernachtCheck', 'middernachtCheck ontbreekt');
  const midnight = (src.timer.match(/async function middernachtCheck\(\)\{[\s\S]*?\n\}/) || [''])[0];
  assertNotIncludes(midnight, 'await _stop', 'middernachtCheck mag niet rechtstreeks stoppen');
  assertIncludes(src.views, 'timerOp("bewerk lopende regel"',
    'Bewerken van de lopende regel moet door timerOp() lopen');
  assertNotIncludes(src.views, 'meta.delete("running");});\n        Object.values(extraDos).forEach(memDossier);',
    'Editor mag meta.running niet buiten het timerOp-pad wijzigen');
});


test('backup/import bewaart nieuwe dag- en DVN-metadata', () => {
  const io = evaluateIoPure();
  assertEq(io.backupVersie, 7, 'Backupversie moet Patch C/F-metadata dekken');
  for (const key of ['dagAudit', 'dvnResolvedNr', 'dvnTo', 'dvnIntappStatus', 'dvnIntappAudit', 'dvnIntappPostedRuleIds', 'hersteld', 'herstelOrigineel']) {
    assertIncludes(src.io, key, `Backup/import mist ${key}`);
  }
  const restored=io.keurDossiers([{
    id:'dvn-backup',nummer:'304999995',naam:'Back-up DVN',dvn:true,
    dvnResolvedNr:'304999995',dvnIntappStatus:'posted',
    dvnIntappPostedAt:'2026-08-25T09:30:00.000Z',dvnIntappPostedCount:2,
    dvnIntappPostedHours:1.5,dvnIntappPostedRuleIds:['r-a','r-b'],
    dvnIntappAudit:[{type:'ingevoerd',t:'2026-08-25T09:30:00.000Z',regels:2,uren:1.5}]
  }]).goed[0];
  assertEq(restored.dvnIntappStatus,'posted','Restore moet afgehandelde DVN-status bewaren');
  assertEq(restored.dvnIntappPostedRuleIds.join(','),'r-a,r-b',
    'Restore moet de gekoppelde afgehandelde regel-id’s bewaren');
  assertEq(restored.dvnIntappPostedHours,1.5,'Restore moet het bevestigde urentotaal bewaren');
});

test('service worker cacheert geen testbestanden', () => {
  assertNotIncludes(src.sw, 'tests/', 'Service worker mag tests niet cachen');
  assertNotIncludes(src.sw, 'regression.mjs', 'Service worker mag de testsuite niet cachen');
  assertIncludes(src.sw, './js/app.js', 'Productie-assets horen in de service worker');
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
