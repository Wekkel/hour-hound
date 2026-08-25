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

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const read = rel => readFileSync(join(root, rel), 'utf8');
const src = {
  html: read('index.html'),
  css: read('css/app.css'),
  hh: read('js/hh.js'),
  time: read('js/domain/time.js'),
  bookingDomain: read('js/domain/booking.js'),
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

function serviceWorkerAssets(){
  const block=(src.sw.match(/const ASSETS\s*=\s*\[([\s\S]*?)\];/)||[])[1]||'';
  return [...block.matchAll(/"([^"]+)"/g)].map(m=>m[1]);
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
  vm.runInContext(src.hh, context, { filename: 'js/hh.js' });
  vm.runInContext(src.time, context, { filename: 'js/domain/time.js' });
  vm.runInContext(src.bookingDomain, context, { filename: 'js/domain/booking.js' });
  const exportCode = `\n;globalThis.__hhSetState = function(s){\n`+
    `dossiers=s.dossiers||[]; templates=s.templates||[]; i7codes=s.i7codes||[]; alle=s.alle||[]; regels=s.regels||[]; overboekingen=s.overboekingen||[]; running=s.running||null; stack=s.stack||[]; viewDate=s.viewDate||today(); dagEinde=s.dagEinde||{}; dagAudit=s.dagAudit||{}; if(s.rondMode)rondMode=s.rondMode;\n`+
    `return true;\n};\n`+
    `globalThis.__hhPure = { hm2m, m2hm, uu, ymd, dmy, parseD, addD, weekend, werkdag, schoon, urenOf, ruweMin, eindOf, totaal, nuBreakdown, gapsFor, gapHours, takenVandaag, taakLabel, autoAanvulTekort, dagSluitStatus, isDvn, dvnDefinitiefI7, isIndirect, dvnRegels, dvnResolvedNummer, dvnIntappState, dvnStatusTekst, dvnSummaryStatus, dvnAuditAdd, markDvnControleNodig, dvnPutIfPosted, intappDossierInfo, codesFor, defaultCode, codeVoor, i7CodeOp, codeFout, sumVan, overboekingOpenVoorRegel, overboekingVoorBronId, overboekingVoorRow, overboekingFingerprints, overboekingAfgerondVoorRow, overboekingState, overboekingStatusTekst, overboekingWijzigingen };`;
  vm.runInContext(src.core + exportCode, context, { filename: 'js/core.js' });
  return { api: context.__hhPure, setState: context.__hhSetState, context };
}

function evaluateIoPure(){
  const { context } = evaluateCorePure();
  vm.runInContext(src.io+
    '\n;globalThis.__hhIoPure = { keurRegels, keurDossiers, keurOverboekingen, keurDagAudit, checksumVan, backupVersie: BACKUPVERSIE };',
    context,{filename:'js/io.js'});
  return context.__hhIoPure;
}

// 1. Algemene bronkwaliteit --------------------------------------------------
test('alle klassieke JavaScriptbestanden blijven syntaxgeldig', () => {
  const bestanden=[];
  const bezoek=dir=>readdirSync(join(root,dir),{withFileTypes:true}).forEach(item=>{
    const rel=`${dir}/${item.name}`;
    if(item.isDirectory())bezoek(rel);else if(item.name.endsWith('.js'))bestanden.push(rel);
  });
  bezoek('js');
  for (const name of bestanden.sort()) {
    const code = read(name);
    new Function(code);
  }
});

test('index.html laadt scripts in de afgesproken globale volgorde', () => {
  assertEq(scriptOrderFromHtml().join('\n'), [
    'js/hh.js',
    'js/domain/time.js',
    'js/domain/booking.js',
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

test('boekingsmodule berekent zonder globale runtime-state', () => {
  const context={};vm.createContext(context);
  vm.runInContext(src.hh,context,{filename:'js/hh.js'});
  vm.runInContext(src.time,context,{filename:'js/domain/time.js'});
  vm.runInContext(src.bookingDomain,context,{filename:'js/domain/booking.js'});
  const api=context.HH.domain.booking;
  assert(api&&Object.isFrozen(api),'HH.domain.booking moet bestaan en bevroren zijn');
  assertEq(api.NORM,8,'Werkdagnorm moet in de domeinlaag staan');
  assertEq(api.DAGMAX,24,'Maximaal dagtotaal moet in de domeinlaag staan');
  const open={id:'open',datum:'2026-08-25',start:'09:00',eind:null,soort:'werk'};
  assertEq(api.hoursOf(open,{runningId:'open',today:'2026-08-25',nowHM:'10:01'}),1.1,
    'Lopende uren moeten alleen uit expliciete klokcontext volgen');
  const dossier={id:'d1',nummer:'304000001',naam:'Dossier'};
  const rows=api.aggregateIntapp([{...open,eind:'09:01',omschrijving:' Werk  ',gewijzigd:2}],{
    roundingMode:'groep',getDossier:()=>dossier,
    getIntappInfo:d=>({nummer:d.nummer,naam:d.naam,status:''}),
    getCodeName:()=>'',hasCodeError:()=>false,getBoundaryId:()=>''
  });
  assertEq(rows.length,1,'Pure Intapp-aggregatie moet één groep maken');
  assertEq(rows[0].u,0.1,'Pure Intapp-aggregatie moet per groep afronden');
  assertIncludes(rows[0].fp,'|werk|0,1|groep|open:2',
    'Vingerafdruk moet normalisatie, uren, modus en bronversie bevatten');
  assertNotIncludes(src.bookingDomain,'document','Boekingsdomein mag de DOM niet lezen');
  assertNotIncludes(src.bookingDomain,'indexedDB','Boekingsdomein mag geen opslag lezen');
});

test('boekingsmodule bewaart afronding, grenzen en dagvalidatie', () => {
  const context={};vm.createContext(context);
  vm.runInContext(src.hh,context,{filename:'js/hh.js'});
  vm.runInContext(src.time,context,{filename:'js/domain/time.js'});
  vm.runInContext(src.bookingDomain,context,{filename:'js/domain/booking.js'});
  const api=context.HH.domain.booking,dossier={id:'d1',nummer:'304000001',naam:'Dossier'};
  const regel=(id,start,eind,extra={})=>Object.assign({id,datum:'2026-08-25',start,eind,
    dossierId:dossier.id,code:null,omschrijving:'zelfde werk',soort:'werk',gewijzigd:1},extra);
  const regels=[regel('a','09:00','09:01'),regel('b','09:02','09:03')];
  const opties=mode=>({roundingMode:mode,getDossier:()=>dossier,
    getIntappInfo:d=>({nummer:d.nummer,naam:d.naam,status:''}),getCodeName:()=>'',
    hasCodeError:()=>false,getBoundaryId:()=>''});
  assertEq(api.aggregateIntapp(regels,opties('groep'))[0].u,0.1,
    'Groepsafronding moet twee korte bronregels samen op 0,1 zetten');
  assertEq(api.aggregateIntapp(regels,opties('regel'))[0].u,0.2,
    'Regelafronding moet iedere korte bronregel afzonderlijk afronden');
  const gesplitst=api.aggregateIntapp(regels,{...opties('groep'),getBoundaryId:r=>r.id});
  assertEq(gesplitst.length,2,'Een expliciete lifecyclegrens moet aggregatie splitsen');
  const problemen=api.validateDay([
    regel('over-a','09:00','10:00'),regel('over-b','09:30','10:30'),
    regel('hand','11:00','12:00',{urenHand:true,uren:0.2})
  ],{today:'2026-08-25',nowHM:'17:00',getDossier:()=>dossier,isIndirect:()=>false,
    hasCodeError:()=>false,isFixedCode:()=>false});
  assert(problemen.some(p=>/overlapt/.test(p.tekst)),'Overlapwaarschuwing moet behouden blijven');
  assert(problemen.some(p=>/handmatige uren wijken af/.test(p.tekst)),
    'Afwijkende handmatige uren moeten waarschuwing blijven');
  const vol=api.validateDay([regel('vol','00:00','23:59',{urenHand:true,uren:24.1})],{
    today:'2026-08-25',nowHM:'23:59',getDossier:()=>dossier,isIndirect:()=>false,
    hasCodeError:()=>false,isFixedCode:()=>false});
  assert(vol.some(p=>p.blok&&/meer dan 24,0 uur/.test(p.tekst)),
    'Meer dan 24,0 uur moet blokkerend blijven');
});

test('core en io zijn niet langer afhankelijk van berekeningen uit views', () => {
  assertNotIncludes(src.views,'function sumVan(','Intapp-aggregatie mag niet meer in views.js staan');
  assertNotIncludes(src.views,'const DAGMAX','Dagmaximum mag niet meer in views.js staan');
  assertIncludes(src.core,'function sumVan(lijst)','Core moet via een dunne aggregatieadapter werken');
  assertIncludes(src.views,'return bookingDomain.validateDay(regels,',
    'Dagvalidatie moet via de pure boekingslaag lopen');
  assertIncludes(src.core,'const {NORM,DAGMAX}=bookingDomain',
    'Core en io moeten constanten uit de boekingslaag beschikbaar krijgen');
  assertNotIncludes(src.core,'typeof sumVan===',
    'Core mag geen later geladen views-helper meer optioneel proberen te vinden');
});

test('HH-bootstrap en tijdmodule vormen een expliciete pure grens', () => {
  const context={};
  vm.createContext(context);
  vm.runInContext(src.hh,context,{filename:'js/hh.js'});
  vm.runInContext(src.time,context,{filename:'js/domain/time.js'});
  const api=context.HH.domain.time;
  assert(api&&Object.isFrozen(api),'HH.domain.time moet bestaan en bevroren zijn');
  assertEq(api.hm2m('09:30'),570,'De directe tijdmodule moet tijden parsen');
  assertEq(api.m2hm(570),'09:30','De directe tijdmodule moet minuten formatteren');
  assertEq(api.addD('2026-08-14',3),'2026-08-17','De directe tijdmodule moet datums optellen');
  assertEq(api.werkdag('2026-08-15'),false,'De directe tijdmodule bewaakt weekendlogica');
  assertEq(api.uu(1.25),'1,3','De bestaande decimale formattering moet gelijk blijven');
  assertEq(api.schoon('  a\tb\n'),'a b','Tekstopschoning moet gelijk blijven');
  assertNotIncludes(src.time,'document','De pure tijdmodule mag de DOM niet lezen');
  assertNotIncludes(src.time,'indexedDB','De pure tijdmodule mag geen opslag lezen');
});

test('oude globale helpernamen delegeren zonder dubbele implementatie', () => {
  assertIncludes(src.core,'}=HH.domain.time;',
    'core.js moet zijn compatibiliteitsnamen uit HH.domain.time halen');
  for(const naam of ['pad','uu','ymd','today','nowHM','hm2m','m2hm','dmy','parseD',
    'addD','dagLabel','kortDag','weekend','werkdag','schoon']){
    assert(!new RegExp(`(?:function|const)\\s+${naam}\\s*(?:=|\\()`).test(src.core),
      `${naam} mag niet ook nog in core.js geïmplementeerd zijn`);
  }
});

test('statische DOM-id’s en JavaScriptverwijzingen blijven onderling compleet', () => {
  const js=Object.entries(src).filter(([k])=>
    ['core','timer','wizard','views','controls','io','booking','app'].includes(k))
    .map(([,v])=>v).join('\n');
  const htmlIds=[...src.html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assertEq(new Set(htmlIds).size,htmlIds.length,'index.html bevat dubbele id-attributen');
  /* Wizardvelden worden als HTML-string in wizard.js opgebouwd. Neem daarom ook
     statische id-attributen uit de productie-JS mee in de referentieset. */
  const dynamisch=[...js.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  const bekend=new Set(htmlIds.concat(dynamisch));
  const refs=[...js.matchAll(/\$\("([^"]+)"\)/g)].map(m=>m[1]);
  const ontbreekt=[...new Set(refs.filter(id=>!bekend.has(id)))];
  assertEq(ontbreekt.join(','),'','Letterlijke $()-verwijzingen missen een statisch of dynamisch element');
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

test('Nu-breakdown bewaart registratiebron en afgeronde uren', () => {
  const { api, setState } = evaluateCorePure();
  const gewoon = { id: 'd-gewoon', nummer: '304000001', naam: 'Dossier', codes: [] };
  const i7d = { id: 'd-i7-breakdown', nummer: 'I700000001', naam: 'Indirecte uren', isI7: true };
  const dvn = { id: 'd-dvn-breakdown', naam: 'DVN', dvn: true, voorlopig: false, dvnResolvedNr: '304000002' };
  const finalI7 = { id: 'd-final-i7', naam: 'Geen nummer', dvn: true, dvnDisposition: 'final_i7', archief: true };
  setState({ dossiers: [gewoon, i7d, dvn, finalI7],
    i7codes: [{ code: 'COM', naam: 'Commercieel' }] });
  const regel = (id, dossierId, start, eind, extra = {}) =>
    Object.assign({ id, dossierId, datum: '2026-08-25', start, eind, soort: 'werk' }, extra);
  assertEq(JSON.stringify(api.nuBreakdown([regel('r-only-dos', gewoon.id, '08:00', '09:00')])),
    JSON.stringify({ declarabel: 1, i7: 0, dvn: 0 }), 'Alleen een gewoon dossier hoort bij declarabel');
  assertEq(JSON.stringify(api.nuBreakdown([regel('r-only-i7', i7d.id, '08:00', '09:00')])),
    JSON.stringify({ declarabel: 0, i7: 1, dvn: 0 }), 'Alleen i7 hoort bij i7');
  assertEq(JSON.stringify(api.nuBreakdown([regel('r-only-dvn', dvn.id, '08:00', '09:00')])),
    JSON.stringify({ declarabel: 0, i7: 1, dvn: 1 }), 'Alleen DVN hoort bij i7 en DVN');
  assertEq(JSON.stringify(api.nuBreakdown([
    regel('r-dos', gewoon.id, '09:00', '10:01'),
    regel('r-i7', i7d.id, '10:00', '11:06'),
    regel('r-dvn', dvn.id, '11:00', '12:07')
  ])), JSON.stringify({ declarabel: 1.1, i7: 2.3, dvn: 1.2 }),
  'Mix moet gewone dossiers, i7 en DVN apart en op afgeronde uren tonen');
  const resolved = api.nuBreakdown([regel('r-dvn-2', dvn.id, '13:00', '13:06')]);
  assertEq(resolved.declarabel, 0, 'Opgeloste DVN mag niet declarabel worden');
  assertEq(resolved.i7, 0.1, 'Opgeloste DVN blijft i7');
  assertEq(resolved.dvn, 0.1, 'Opgeloste DVN blijft apart herkenbaar');
  assertEq(JSON.stringify(api.nuBreakdown([regel('r-final-i7', finalI7.id, '13:00', '14:00')])),
    JSON.stringify({ declarabel: 0, i7: 1, dvn: 0 }),
    'Definitief i7 blijft i7 maar valt uit de DVN-breakdown');
  assertEq(api.intappDossierInfo(finalI7).nummer, 'I700000001',
    'Definitief i7 moet in de Intapp-samenvatting het gewone i7-dossier gebruiken');
  assertEq(api.intappDossierInfo(finalI7).dvn, false,
    'Definitief i7 mag in de Intapp-samenvatting geen open DVN meer zijn');
  assertEq(api.defaultCode(finalI7), 'COM', 'Definitief i7 blijft vast op Commercieel');
  assertEq(api.nuBreakdown([regel('r-hand', gewoon.id, '14:00', '14:01', { urenHand: true, uren: 0.4 })]).declarabel,
    0.4, 'Afgeronde handmatige uren moeten behouden blijven');
});

test('Nu toont de compacte declarabel-i7-DVN-breakdown', () => {
  assertIncludes(src.html, 'id="t-breakdown"', 'Nu-breakdown ontbreekt in de samenvatting');
  assertIncludes(src.views, 'nuBreakdown(v)', 'Nu moet de breakdown uit de actuele regels worden berekend');
  assertIncludes(src.views, 'Declarabel "+uu(b.declarabel)', 'Declarabele tijd moet apart worden gelabeld');
  assertIncludes(src.views, 'DVN "+uu(b.dvn)', 'DVN-tijd moet apart tussen haakjes worden getoond');
  assertIncludes(src.core, 'function nuBreakdown(lijst)', 'Historische Nu-registratieclassificatie ontbreekt');
});

test('i7-codeplicht heeft geen stille standaard en lokale codes blijven leidend', () => {
  const { api, setState } = evaluateCorePure();
  const ind={id:'d-i7-contract',nummer:'I700000000',naam:'Indirect',isI7:true};
  const dvn={id:'d-dvn-contract',naam:'Nummer volgt',voorlopig:true,dvn:true};
  setState({dossiers:[ind,dvn],i7codes:[
    {code:'COM',naam:'Commercieel'},
    {code:'ADM',naam:'Praktijkorganisatie/administratie'}
  ]});
  assertEq(api.defaultCode(ind),null,'Een gewone i7-regel mag geen stille werkcode krijgen');
  assertEq(api.codeVoor(ind,null),null,'Ook codeVoor() moet i7 zonder expliciete keuze leeg laten');
  assertEq(api.codeVoor(ind,'ADM'),'ADM','Een expliciete geldige i7-code moet behouden blijven');
  assertEq(api.defaultCode(dvn),'COM','DVN moet juist wel vast op Commercieel staan');
  assertIncludes(src.app, 'if(lokaal.length){\n    i7codes=lokaal;',
    'laadWerkcodes() moet een lokale werklijst vóór netwerkbootstrap gebruiken');
  assertIncludes(src.app, 'return false;}\n  let d=null;',
    'Een bestaande lokale werklijst moet de werkcodes.json-bootstrap overslaan');
  assertIncludes(src.wizard, 'if(d&&d.isI7&&!running.code)',
    'De N-wizard moet i7 zonder expliciete code blokkeren');
  assertIncludes(src.wizard, 'if(!i7codes.some(c=>c.code===code))',
    'De wizard moet een stale i7-keuze tegen de actuele lokale lijst controleren');
});

test('bestaande 0.1.7-data en voorlopige DVN-records blijven migreerbaar', () => {
  const { api, setState } = evaluateCorePure();
  const oudDvn={id:'oud-dvn',naam:'Dossier volgt nog',voorlopig:true,
    nummer:null,codes:[],archief:false};
  const oudRegel={id:'oud-regel',datum:'2026-08-20',start:'09:00',eind:'10:00',
    dossierId:oudDvn.id,code:'COM',omschrijving:'oude DVN-tijd',soort:'werk'};
  setState({dossiers:[oudDvn],alle:[oudRegel]});
  assertEq(api.isDvn(oudDvn),true,
    'Een oude voorlopige dossierregistratie moet zonder recordconversie DVN blijven');
  assertEq(api.dvnIntappState(oudDvn),'missing',
    'Een oude open DVN zonder nummer moet in de actuele DVN-werkvoorraad blijven');
  assertEq(api.dvnRegels(oudDvn).map(r=>r.id).join(','),'oud-regel',
    'Bestaande DVN-uren moeten aan hun oude dossier-id gekoppeld blijven');
  assertIncludes(src.core,'indexedDB.open("hourhound",4)',
    'De update moet dezelfde IndexedDB-database blijven openen');
  const upgrade=(src.core.match(/r\.onupgradeneeded=\(\)=>\{[\s\S]*?\n  r\.onsuccess=/)||[''])[0];
  assert(upgrade,'IndexedDB-upgradepad ontbreekt');
  assertIncludes(upgrade,'if(!d.objectStoreNames.contains("overboekingen"))',
    'De nieuwe wachtrijstore moet alleen worden toegevoegd wanneer hij ontbreekt');
  assertNotIncludes(upgrade,'.deleteObjectStore(',
    'Een gewone app-update mag geen bestaande IndexedDB-store verwijderen');
});

test('DVN pure statushelpers onderscheiden ontbrekend, klaar, ingevoerd en controle nodig', () => {
  const { api, setState } = evaluateCorePure();
  const doel = { id: 'dos-1', naam: 'Echt dossier', nummer: '304999999' };
  const open = { id: 'dvn-open', naam: 'DVN open', voorlopig: true };
  const ready = { id: 'dvn-ready', naam: 'DVN ready', dvn: true, dvnResolvedNr: '304999998' };
  const linked = { id: 'dvn-linked', naam: 'DVN linked', dvn: true, dvnTo: doel.id };
  const posted = { id: 'dvn-posted', naam: 'DVN posted', dvn: true, dvnResolvedNr: '304999997', dvnIntappStatus: 'posted' };
  const finalI7 = { id: 'dvn-final-i7', naam: 'DVN final', dvn: true, dvnDisposition: 'final_i7' };
  setState({ dossiers: [doel, open, ready, linked, posted, finalI7] });
  assertEq(api.isDvn(open), true, 'voorlopig dossier moet DVN zijn');
  assertEq(api.dvnResolvedNummer(open), '', 'open DVN heeft nog geen nummer');
  assertEq(api.dvnResolvedNummer(ready), '304999998', 'resolved nummer moet worden gebruikt');
  assertEq(api.dvnResolvedNummer(linked), '304999999', 'gekoppeld doelnummer moet worden gebruikt');
  assertEq(api.dvnIntappState(open), 'missing', 'open DVN mist dossiernummer');
  assertEq(api.dvnIntappState(ready), 'ready', 'resolved DVN moet klaar voor Intapp zijn');
  assertEq(api.dvnIntappState(posted), 'posted', 'posted status moet blijven staan');
  assertEq(api.dvnIntappState(finalI7), 'final_i7', 'Definitief i7 moet een terminale DVN-status zijn');
  assertEq(api.dvnStatusTekst(finalI7), 'definitief i7', 'Definitief-i7-status moet begrijpelijk zijn');
  assertEq(api.intappDossierInfo(finalI7).nummer, '', 'Zonder i7-dossier is definitief i7 niet declarabel');
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
  assertIncludes(src.bookingDomain, '!r.autoAanvul&&r.urenHand',
    'Administratieve aanvulregel mag geen misleidende handmatige-urenwaarschuwing krijgen');
  assertIncludes(src.bookingDomain, 'filter(r=>!r.autoAanvul&&time.hm2m(r.start)!=null)',
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

test('DVN kan bewust en traceerbaar naar definitief i7', () => {
  assertIncludes(src.html, 'Naar definitief i7', 'Beheer moet de bewuste eindactie uitleggen');
  assertIncludes(src.timer, 'async function maakDvnDefinitiefI7', 'Definitief-i7-transactie ontbreekt');
  assertIncludes(src.timer, 'dvnDisposition:"final_i7"', 'Terminale DVN-dispositie moet worden opgeslagen');
  assertIncludes(src.timer, 'dvnFinalI7RuleIds:rs.map', 'Betrokken regel-id’s moeten traceerbaar blijven');
  assertIncludes(src.timer, 'i7CodeOp(VAST_VOORLOPIG,"-704")', 'Commercieel moet verplicht blijven');
  assertIncludes(src.views, 'data-dvn-final-i7', 'Open DVN-kaart mist de definitief-i7-actie');
  assertIncludes(src.views, '!dvnDefinitiefI7(d)', 'Definitief i7 mag niet in de DVN-werkvoorraad blijven');
  assertIncludes(src.core, '!dvnDefinitiefI7(d)', 'Definitief i7 mag niet in het DVN-deel van Nu blijven');
});

test('Patch H houdt gewone blokkade los van DVN en echte boekstatus', () => {
  assertIncludes(src.core, 'd.createObjectStore("overboekingen"', 'Aparte IndexedDB-wachtrij ontbreekt');
  assertIncludes(src.core, 'indexedDB.open("hourhound",4)', 'Databaseversie moet de wachtrij-store aanmaken');
  assertIncludes(src.html, 'Nog over te boeken naar dossier', 'Beheer mist de overboekingswerkvoorraad');
  assertIncludes(src.html, 'Tijdelijk niet boekbaar', 'Dagwizard mist de parkeeractie');
  assertIncludes(src.html, 'Op i7 geboekt · parkeren', 'Expliciete tijdelijke i7-bevestiging ontbreekt');
  assertIncludes(src.booking, 'put("overboekingen",o)', 'Parkeren moet apart van geboekt worden opgeslagen');
  assertNotIncludes(src.booking, 'zetGeboekt(p.row.fp,true)', 'Parkeren mag niet als echte dossierboeking gelden');
  assertIncludes(src.booking, 'geboekt · "+p+" geparkeerd · "+open+" open', 'Dagstatus moet drie aantallen tonen');
  assertIncludes(src.html, 'Op dossier geboekt · afhandelen', 'Latere dossierbevestiging ontbreekt');
  assertIncludes(src.views, 'targetBookedDate:today()', 'Latere boeking moet de actuele Intapp-datum vastleggen');
  assertNotIncludes(src.views, 'Tijdelijke i7-boeking gecorrigeerd', 'Patch H mag geen i7-correctie eisen');
});

test('Patch H detecteert wijzigingen en heeft twee terminale routes', () => {
  const { api, setState } = evaluateCorePure();
  const doel={id:'d-doel',nummer:'304000010',naam:'Doeldossier'};
  const regel={id:'r-over',datum:'2026-08-25',start:'09:00',eind:'10:00',
    dossierId:doel.id,code:null,omschrijving:'werk',gewijzigd:10};
  const wacht={id:'o-1',status:'waiting',targetDossierId:doel.id,
    targetNumberSnapshot:doel.nummer,targetNameSnapshot:doel.naam,sourceDate:regel.datum,
    sourceRuleIds:[regel.id],sourceSnapshot:[{id:regel.id,gewijzigd:10}]};
  setState({dossiers:[doel],alle:[regel],overboekingen:[wacht]});
  assertEq(api.overboekingState(wacht),'waiting','Ongewijzigde parkeerregel moet wachten');
  regel.gewijzigd=11;
  assertEq(api.overboekingState(wacht),'needs_check','Gewijzigde bronregel moet controle nodig maken');
  assertEq(api.overboekingStatusTekst(wacht),'Gewijzigd — controleren','Gebruikerstekst moet wijziging benoemen');
  assertEq(api.overboekingState({...wacht,status:'done'}),'done','Dossierboeking is terminale route één');
  assertEq(api.overboekingState({...wacht,status:'final_i7'}),'final_i7','Definitief i7 is terminale route twee');
  assertIncludes(src.views, 'async function maakOverboekingDefinitiefI7', 'Definitief-i7-overgang ontbreekt');
  assertIncludes(src.views, 'dossierId:ind.id,code:com', 'Definitief i7 moet bronregels echt herclassificeren');
  assertIncludes(src.views, 'rustig(rs.map(r=>r.id))', 'Lopende bronwrites moeten voor omzetting klaar zijn');
  assertIncludes(src.views, 's.overboekingen.put(klaar)', 'Bronregels en terminale status moeten transactioneel schrijven');
});

test('afgeronde overboeking blijft geboekt totdat de broninhoud wijzigt', () => {
  const { api, setState } = evaluateCorePure();
  const datum='2026-08-25';
  const doel={id:'d-over-doel',nummer:'304000020',naam:'Doeldossier'};
  const a={id:'r-over-a',datum,start:'09:00',eind:'09:01',dossierId:doel.id,
    code:null,omschrijving:'zelfde werk',soort:'werk',uren:0.1,urenHand:false,gewijzigd:10};
  const b={id:'r-over-b',datum,start:'09:02',eind:'09:03',dossierId:doel.id,
    code:null,omschrijving:'zelfde werk',soort:'werk',uren:0.1,urenHand:false,gewijzigd:10};
  setState({dossiers:[doel],alle:[a,b],regels:[a,b],viewDate:datum,rondMode:'groep'});
  const voor=api.sumVan([a,b]);
  assertEq(voor.length,1,'Identieke bronregels horen vóór parkeren één Intapp-regel te zijn');
  const wacht={id:'o-contract',status:'waiting',targetDossierId:doel.id,
    targetNumberSnapshot:doel.nummer,targetNameSnapshot:doel.naam,sourceDate:datum,
    sourceRuleIds:[a.id,b.id],sourceFingerprint:voor[0].fp,sourceFingerprints:[voor[0].fp],
    rondModeSnapshot:'groep',sourceSnapshot:[a,b].map(r=>({id:r.id,datum:r.datum,
      start:r.start,eind:r.eind,dossierId:r.dossierId,code:r.code,
      omschrijving:r.omschrijving,uren:0.1,gewijzigd:r.gewijzigd}))};
  setState({dossiers:[doel],alle:[a,b],regels:[a,b],overboekingen:[wacht],
    viewDate:datum,rondMode:'groep'});
  const geparkeerd=api.sumVan([a,b]);
  assertEq(geparkeerd.length,1,'De lifecyclegrens mag de eigen geparkeerde groep niet splitsen');
  assertEq(geparkeerd[0].fp,voor[0].fp,'Parkeren zelf mag de inhoudsvingerafdruk niet wijzigen');
  assertEq(api.overboekingWijzigingen(wacht).length,0,
    'Een zojuist geparkeerde ongewijzigde regel mag niet direct controle nodig krijgen');

  const c={...a,id:'r-over-new',start:'09:04',eind:'09:05'};
  setState({dossiers:[doel],alle:[a,b,c],regels:[a,b,c],overboekingen:[wacht],
    viewDate:datum,rondMode:'groep'});
  const metNieuweTijd=api.sumVan([a,b,c]);
  assertEq(metNieuweTijd.length,2,
    'Nieuw identiek werk mag niet samensmelten met de al geparkeerde bronregels');
  const oudeGroep=metNieuweTijd.find(x=>x.bron.length===2);
  assert(oudeGroep&&oudeGroep.fp===voor[0].fp,
    'De geparkeerde groep moet haar eigen stabiele vingerafdruk behouden');

  const ouder={...wacht,id:'o-ouder',status:'done'};
  setState({dossiers:[doel],alle:[a,b,c],regels:[a,b,c],overboekingen:[ouder,wacht],
    viewDate:datum,rondMode:'groep'});
  assertEq(api.overboekingOpenVoorRegel(a.id).id,wacht.id,
    'Een oudere terminale historie mag een nieuwe open wachtrij niet maskeren');

  const klaar={...wacht,status:'done',sourceFingerprints:[oudeGroep.fp]};
  setState({dossiers:[doel],alle:[a,b,c],regels:[a,b,c],overboekingen:[klaar],
    viewDate:datum,rondMode:'groep'});
  assertEq(api.overboekingAfgerondVoorRow(oudeGroep,datum).id,klaar.id,
    'De terminale wachtrijstatus moet dezelfde bronregel duurzaam als geboekt herkennen');
  const legacy={...klaar,sourceFingerprints:[],sourceFingerprint:oudeGroep.fp};
  setState({dossiers:[doel],alle:[a,b,c],regels:[a,b,c],overboekingen:[legacy],
    viewDate:datum,rondMode:'groep'});
  assertEq(api.overboekingAfgerondVoorRow(oudeGroep,datum).id,legacy.id,
    'Een bestaande Patch H-record met één oude sourceFingerprint moet compatibel blijven');
  const gewijzigd={...a,gewijzigd:11};
  setState({dossiers:[doel],alle:[gewijzigd,b,c],regels:[gewijzigd,b,c],
    overboekingen:[klaar],viewDate:datum,rondMode:'groep'});
  const gewijzigdeGroep=api.sumVan([gewijzigd,b]).find(x=>x.bron.length===2);
  assertEq(api.overboekingAfgerondVoorRow(gewijzigdeGroep,datum),null,
    'Een inhoudswijziging moet de oude terminale boekstatus automatisch ongeldig maken');

  setState({dossiers:[doel],alle:[a,b],regels:[a,b],overboekingen:[wacht],
    viewDate:datum,rondMode:'regel'});
  assert(api.overboekingWijzigingen(wacht).includes('Intapp-samenvatting gewijzigd'),
    'Een gewijzigde afrondingsmodus moet de geparkeerde Intapp-samenvatting laten controleren');
});

test('brede H-regressie bewaakt modal, verwijdering, groepering en atomaire afhandeling', () => {
  for(const id of ['parkboek','overboekpost']){
    assertIncludes(src.views, `"${id}"`, `Centrale modalcheck mist ${id}`);
    assertIncludes(src.controls, `"${id}"`, `Globale sneltoetsblokkade mist ${id}`);
  }
  assertIncludes(src.views, 'if(overboekingOpenVoorRegel(id))',
    'Een bronregel in de open overboekingswachtrij mag niet verwijderbaar zijn');
  assertIncludes(src.views, 'rond de overboeking eerst af onder Beheer',
    'De verwijderblokkade moet de gebruiker naar de herstelplek verwijzen');
  assertIncludes(src.core, 'const over=overboekingVoorBronId(r.id)',
    'Aggregatie moet een overboekingslifecycle als eigen groeperingsgrens gebruiken');
  assertIncludes(src.views, 'tx(["overboekingen","meta"],"readwrite"',
    'Afhandelen en duurzame boekstatus moeten in één transactie worden opgeslagen');
  assertIncludes(src.views, 'sourceFingerprints:fps',
    'Afhandelen moet de actuele inhoudsvingerafdrukken bewaren');
  assertIncludes(src.views, 's.meta.put(boekNieuw,"geboekt")',
    'Afhandelen moet ook de gewone boekstatus duurzaam bijwerken');
  assertIncludes(src.booking, 'overboekingAfgerondVoorRow(row,boek.datum)',
    'De Intapp-wizard moet terminale overboekingen als werkelijk geboekt herkennen');
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

test('timer-invariant herstelt alleen eenduidige state en blokkeert conflicten', () => {
  const begin=src.app.indexOf('async function herstelInvariant()');
  const einde=src.app.indexOf('\nfunction openRegels()',begin);
  const herstel=begin>=0&&einde>begin?src.app.slice(begin,einde):'';
  assert(herstel,'herstelInvariant() ontbreekt');
  assertIncludes(herstel,'const open=alle.filter(r=>!r.eind)',
    'De invariant moet alle regels zonder eindtijd inspecteren');
  assertIncludes(herstel,'if(open.length<=1)',
    'Alleen nul of één open regel mag automatisch worden hersteld');
  assertIncludes(herstel,'await txAll',
    'Pointerherstel moet transactioneel via het centrale timerpad schrijven');
  assertIncludes(herstel,'opBlok=true',
    'Meerdere open regels moeten nieuwe timeracties blokkeren');
  assertIncludes(herstel,'toonHerstel()',
    'Een conflict moet het expliciete herstelvenster openen');
  assertNotIncludes(herstel,'o.regels.put',
    'De opstartcontrole mag conflicterende open regels niet stilzwijgend afsluiten');
  assertIncludes(src.app, 'if(open.length<2){$("herstel").classList.remove("on");return;}',
    'Het herstelvenster moet alleen voor een werkelijk meervoudig conflict verschijnen');
});


test('backup/import bewaart dag-, DVN- en overboekingsmetadata', () => {
  const io = evaluateIoPure();
  assertEq(io.backupVersie, 9, 'Backupversie moet Patch H-wachtrij dekken');
  for (const key of ['dagAudit', 'dvnResolvedNr', 'dvnTo', 'dvnDisposition', 'dvnFinalI7At', 'dvnFinalI7RuleIds', 'dvnIntappStatus', 'dvnIntappAudit', 'dvnIntappPostedRuleIds', 'hersteld', 'herstelOrigineel']) {
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
  const finalI7=io.keurDossiers([{
    id:'dvn-final-backup',naam:'Definitief i7',dvn:true,archief:true,
    dvnDisposition:'final_i7',dvnFinalI7At:'2026-08-25T10:00:00.000Z',
    dvnFinalI7RuleIds:['r-c'],dvnIntappAudit:[{type:'definitief-i7',regels:1,uren:0.7}]
  }]).goed[0];
  assertEq(finalI7.dvnDisposition,'final_i7','Restore moet de terminale DVN-dispositie bewaren');
  assertEq(finalI7.dvnFinalI7RuleIds.join(','),'r-c','Restore moet de betrokken regel-id’s bewaren');
  const langeFp='x'.repeat(5001);
  const over=io.keurOverboekingen([{id:'o-backup',status:'waiting',targetDossierId:'d-doel',
    targetNumberSnapshot:'304000010',targetNameSnapshot:'Doel',sourceDate:'2026-08-25',
    sourceRuleIds:['r-a'],sourceFingerprint:langeFp,sourceFingerprints:[langeFp,'fp-b'],
    rondModeSnapshot:'regel',sourceSnapshot:[{id:'r-a',datum:'2026-08-25',start:'09:00',
      eind:'10:00',dossierId:'d-doel',omschrijving:'werk',uren:1,gewijzigd:12}],
    targetLines:[{omschrijving:'werk',uren:1}],hours:1,i7DossierId:'d-i7',i7Code:'COM',
    parkedAt:'2026-08-25T10:00:00.000Z',updatedAt:'2026-08-25T10:00:00.000Z',
    audit:[{type:'op-i7-geboekt-geparkeerd',t:'2026-08-25T10:00:00.000Z'}]}]).goed[0];
  assertEq(over.status,'waiting','Restore moet open overboekingsstatus bewaren');
  assertEq(over.sourceRuleIds.join(','),'r-a','Restore moet gekoppelde bronregels bewaren');
  assertEq(over.sourceFingerprint.length,5001,
    'Restore mag een geldige samengestelde vingerafdruk niet op 4.000 tekens afkappen');
  assertEq(over.sourceFingerprints[0].length,5001,
    'Restore moet ook de lijst met duurzame boekstatusvingerafdrukken volledig bewaren');
  assertEq(over.sourceFingerprints[1],'fp-b','Restore moet alle boekstatusvingerafdrukken bewaren');
  assertEq(over.rondModeSnapshot,'regel','Restore moet de gebruikte afrondingsmodus bewaren');
  assertEq(over.targetLines[0].uren,1,'Restore moet latere dossierboekingsregels bewaren');
  assertIncludes(src.io, 'o.overboekingen.clear()', 'Volledig terugzetten moet de wachtrij vervangen');
  assertIncludes(src.io, 'nO.forEach', 'Samenvoegen moet overboekingen meenemen');
});

test('importkeuring en checksum signaleren beschadigde kerngegevens', () => {
  const io=evaluateIoPure();
  const goed=io.keurRegels([{id:'r-ok',datum:'2026-08-25',start:'09:00',eind:'10:00',
    dossierId:'d-ok',uren:1,soort:'werk'}]);
  assertEq(goed.goed.length,1,'Een geldige tijdregel moet restore-keuring passeren');
  const fout=io.keurRegels([{id:'r-bad',datum:'2026-02-30',start:'09:00',eind:'10:00',
    dossierId:'d-ok',uren:1,soort:'werk'}]);
  assertEq(fout.goed.length,0,'Een kalendertechnisch ongeldige datum mag niet worden hersteld');
  const basis=[{id:'d-ok',nummer:'304000099',naam:'Dossier'}];
  const regels=[{id:'r-ok',datum:'2026-08-25',start:'09:00',eind:'10:00',uren:1}];
  const wacht=[{id:'o-ok',status:'waiting',targetDossierId:'d-ok',
    updatedAt:'2026-08-25T10:00:00.000Z'}];
  const a=io.checksumVan(basis,regels,[],[],wacht);
  const b=io.checksumVan(basis,regels,[],[],[{...wacht[0],status:'done'}]);
  assert(a!==b,'De schema-9-checksum moet een gewijzigde overboekingsstatus detecteren');
  assertIncludes(src.io, 'if(sv>BACKUPVERSIE)',
    'Een back-up uit een nieuwere onbekende versie moet worden geweigerd');
  assertIncludes(src.io, 'Een open regel wordt nooit automatisch de lopende timer',
    'Restore mag een open regel alleen na expliciete keuze hervatten');
});

test('service-worker-assets zijn compleet en cachevrij van tests', () => {
  assertNotIncludes(src.sw, 'tests/', 'Service worker mag tests niet cachen');
  assertNotIncludes(src.sw, 'regression.mjs', 'Service worker mag de testsuite niet cachen');
  const refs=[...src.html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)].map(m=>m[1]);
  const verwacht=[...new Set(['./','./index.html'].concat(refs))].sort();
  const assets=[...new Set(serviceWorkerAssets())].sort();
  assertEq(assets.join('\n'),verwacht.join('\n'),
    'De service-workerlijst moet exact alle statische runtime-assets uit index.html bevatten');
  for(const asset of assets){
    const lokaal=asset==='.'||asset==='./'?root:join(root,asset.replace(/^\.\//,''));
    assert(existsSync(lokaal),`Service-workerasset bestaat niet: ${asset}`);
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
