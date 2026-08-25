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
  dvnDomain: read('js/domain/dvn.js'),
  overbookingDomain: read('js/domain/overbooking.js'),
  storage: read('js/storage/indexeddb.js'),
  admin: read('js/services/admin.js'),
  dayRules: read('js/services/day-rules.js'),
  timerService: read('js/services/timer.js'),
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
  vm.runInContext(src.dvnDomain, context, { filename: 'js/domain/dvn.js' });
  vm.runInContext(src.overbookingDomain, context, { filename: 'js/domain/overbooking.js' });
  vm.runInContext(src.storage, context, { filename: 'js/storage/indexeddb.js' });
  vm.runInContext(src.admin, context, { filename: 'js/services/admin.js' });
  vm.runInContext(src.dayRules, context, { filename: 'js/services/day-rules.js' });
  vm.runInContext(src.timerService, context, { filename: 'js/services/timer.js' });
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

function evaluateStorage(){
  const context={console,setTimeout,clearTimeout,queueMicrotask};
  vm.createContext(context);
  vm.runInContext(src.hh,context,{filename:'js/hh.js'});
  vm.runInContext(src.storage,context,{filename:'js/storage/indexeddb.js'});
  return context.HH.storage;
}

function evaluateAdmin(){
  const context={console,setTimeout,clearTimeout,queueMicrotask};
  vm.createContext(context);
  for(const [name,code] of [['hh',src.hh],['time',src.time],
    ['booking',src.bookingDomain],['dvn',src.dvnDomain],
    ['overbooking',src.overbookingDomain],['storage',src.storage],['admin',src.admin]])
    vm.runInContext(code,context,{filename:`js/${name}.js`});
  return context.HH;
}

function evaluateDayRules(){
  const context={console,setTimeout,clearTimeout,queueMicrotask};
  vm.createContext(context);
  for(const [name,code] of [['hh',src.hh],['domain/time',src.time],
    ['domain/booking',src.bookingDomain],['domain/dvn',src.dvnDomain],
    ['domain/overbooking',src.overbookingDomain],['storage/indexeddb',src.storage],
    ['services/day-rules',src.dayRules],['services/timer',src.timerService]])
    vm.runInContext(code,context,{filename:`js/${name}.js`});
  return context.HH;
}

function evaluateTimerService(){return evaluateDayRules();}

function fakeDatabase(values={},options={}){
  const calls=[];
  const store=name=>({
    getAll(){calls.push({op:'getAll',store:name});return{result:values[name]||[]};},
    get(key){calls.push({op:'get',store:name,key});
      return{result:(values[name]&&values[name][key])};},
    put(value,key){calls.push({op:'put',store:name,value,key});
      return{result:key===undefined?(value&&value.id):key};},
    delete(key){calls.push({op:'delete',store:name,key});return{result:undefined};},
    clear(){calls.push({op:'clear',store:name});return{result:undefined};}
  });
  const database={calls,transaction(stores,mode){
    calls.push({op:'transaction',stores:Array.isArray(stores)?[...stores]:stores,mode});
    let aborted=false;
    const transaction={error:null,objectStore:store,abort(){
      if(aborted)return;aborted=true;transaction.error=new Error('afgebroken door test');
      queueMicrotask(()=>transaction.onabort&&transaction.onabort());
    }};
    queueMicrotask(()=>{
      if(aborted)return;
      if(options.fail){transaction.error=new Error('geïnjecteerde databasefout');
        if(transaction.onabort)transaction.onabort();}
      else if(transaction.oncomplete)transaction.oncomplete();
    });
    return transaction;
  }};
  return database;
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
    'js/domain/dvn.js',
    'js/domain/overbooking.js',
    'js/storage/indexeddb.js',
    'js/services/admin.js',
    'js/services/day-rules.js',
    'js/services/timer.js',
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

test('IndexedDB-gateway bewaart exact database 4 en het bestaande schema', async() => {
  const storage=evaluateStorage(),gateway=storage.indexedDB;
  const created=[],indices=[];
  let closed=false,versionChanged=false,openArgs=null;
  const opened={
    objectStoreNames:{contains(){return false;}},
    createObjectStore(name,options){created.push({name,options:options||null});
      return{createIndex(name,keyPath,options){indices.push({name,keyPath,options:options||null});}};},
    close(){closed=true;}
  };
  const indexedDB={open(name,version){
    openArgs={name,version};const request={result:opened,error:null};
    queueMicrotask(()=>{request.onupgradeneeded();request.onsuccess();});return request;
  }};
  const result=await gateway.open({indexedDB,onVersionChange(){versionChanged=true;}});
  assertEq(result,opened,'open() moet de geopende database teruggeven');
  assertEq(JSON.stringify(openArgs),JSON.stringify({name:'hourhound',version:4}),
    'Databasenaam en versie mogen niet veranderen');
  assertEq(created.map(x=>x.name).join(','),
    'days,matters,meta,templates,codes,dossiers,overboekingen,regels',
    'Stores en upgradevolgorde moeten gelijk blijven');
  assertEq(JSON.stringify(created.map(x=>x.options)),JSON.stringify([
    {keyPath:'date'},{keyPath:'id'},null,{keyPath:'id'},{keyPath:'code'},
    {keyPath:'id'},{keyPath:'id'},{keyPath:'id'}]),'Key paths mogen niet veranderen');
  assertEq(JSON.stringify(indices),JSON.stringify([
    {name:'datum',keyPath:'datum',options:null}]),'Alleen de bestaande datumindex hoort erbij');
  opened.onversionchange();
  assert(closed&&versionChanged,'Versiewijziging moet sluiten en de UI-adapter waarschuwen');
  assertNotIncludes(src.storage,'document','Storagegateway mag de DOM niet kennen');
  assertNotIncludes(src.storage,'toast(','Storagegateway mag geen gebruikersmelding tonen');
});

test('repositories laden één snapshot en laten geheugen intact bij databasefout', async() => {
  const storage=evaluateStorage(),gateway=storage.indexedDB,repos=storage.repositories;
  const values={
    dossiers:[{id:'d1'}],templates:[{id:'t1'}],codes:[{code:'c1'}],
    regels:[{id:'r1'}],overboekingen:[{id:'o1'}],
    meta:{stack:['r1'],dagEinde:{'2026-08-25':'17:00'},running:'r1',thema:'donker'}
  };
  const ok=fakeDatabase(values);gateway.use(ok);
  const snapshot=await repos.loadSnapshot();
  assertEq(snapshot.dossiers[0].id,'d1','Snapshot moet dossiers laden');
  assertEq(snapshot.regels[0].id,'r1','Snapshot moet regels laden');
  assertEq(snapshot.overboekingen[0].id,'o1','Snapshot moet overboekingen laden');
  assertEq(snapshot.meta.running,'r1','Snapshot moet configuratiemeta laden');
  const transactions=ok.calls.filter(x=>x.op==='transaction');
  assertEq(transactions.length,1,'loadSnapshot() moet één transactie gebruiken');
  assertEq(transactions[0].mode,'readonly','Snapshot hoort alleen te lezen');
  assertEq(transactions[0].stores.join(','),
    'dossiers,templates,codes,regels,overboekingen,meta',
    'Bootsnapshot moet alle runtime-stores consistent lezen');
  for(const name of ['regels','dossiers','config','overboekingen'])
    assert(repos[name]&&Object.isFrozen(repos[name]),`Kleine repository ontbreekt: ${name}`);
  await repos.regels.put({id:'r2'});
  await repos.dossiers.put({id:'d2'});
  await repos.config.put('thema','licht');
  await repos.overboekingen.remove('o1');
  const writes=ok.calls.filter(x=>x.op==='transaction').slice(1);
  assertEq(JSON.stringify(writes.map(x=>[x.stores,x.mode])),JSON.stringify([
    ['regels','readwrite'],['dossiers','readwrite'],['meta','readwrite'],
    ['overboekingen','readwrite']]),'Iedere kleine repository moet naar haar eigen store delegeren');
  const themePut=ok.calls.find(x=>x.op==='put'&&x.store==='meta'&&x.key==='thema');
  assert(themePut&&themePut.value==='licht','Configuratierepository moet waarde en metakey bewaren');

  const memory={regels:[{id:'oud'}],dossiers:[{id:'oud'}]};
  gateway.use(fakeDatabase(values,{fail:true}));
  let failed=false;
  try{
    const next=await repos.loadSnapshot();
    memory.regels=next.regels;memory.dossiers=next.dossiers;
  }catch(error){failed=true;}
  assert(failed,'Geïnjecteerde databasefout moet loadSnapshot laten afwijzen');
  assertEq(memory.regels[0].id,'oud','Regelgeheugen mag na leesfout niet veranderen');
  assertEq(memory.dossiers[0].id,'oud','Dossiergeheugen mag na leesfout niet veranderen');

  const reloadBegin=src.app.indexOf('async function herlaad(metInstellingen)');
  const reloadEnd=src.app.indexOf('\n/* W2:',reloadBegin);
  const reload=reloadBegin>=0&&reloadEnd>reloadBegin
    ?src.app.slice(reloadBegin,reloadEnd):'';
  assert(reload,'herlaad() met snapshot ontbreekt');
  const loaded=reload.indexOf('await storageRepos.loadSnapshot()');
  assert(loaded>=0&&reload.indexOf('dossiers=snapshot.dossiers')>loaded&&
    reload.indexOf('alle=snapshot.regels')>loaded,
  'Productiecode moet database eerst afwachten en geheugen pas daarna vervangen');
  assertNotIncludes(reload,'await getAll(','Herlaad mag geen gedeeltelijke losse storelezingen doen');
});

test('compatibiliteitshelpers delegeren en use-case-transacties blijven heel', () => {
  for(const line of [
    'const tx=(s,mode,fn)=>storageGateway.tx(s,mode,fn)',
    'const getAll=s=>storageGateway.getAll(s)',
    'const get=(s,k)=>storageGateway.get(s,k)',
    'const put=(s,v)=>storageGateway.put(s,v)',
    'const putK=(s,v,k)=>storageGateway.putKey(s,v,k)',
    'const del=(s,k)=>storageGateway.remove(s,k)',
    'const replaceAll=(s,rows)=>storageGateway.replaceAll(s,rows)'])
    assertIncludes(src.core,line,'Bestaande opslaghelper moet rechtstreeks delegeren');
  assertIncludes(src.core,'const TXALL=storageGateway.TIMER_STORES',
    'Timertransacties moeten dezelfde centrale storelijst gebruiken');
  assertIncludes(src.io,'tx(["dossiers","regels","templates","codes","overboekingen","meta"],"readwrite"',
    'Volledige import moet één transactie over alle betrokken stores blijven');
  assertIncludes(src.io,'tx(["dossiers","regels","templates","codes","overboekingen"],"readwrite"',
    'Samenvoegen moet één transactie over alle betrokken stores blijven');
});

test('DVN-services bewaren nummer, posted en definitief-i7 atomair', async() => {
  const HH=evaluateAdmin(),service=HH.services.admin,gateway=HH.storage.indexedDB;
  const db=fakeDatabase();gateway.use(db);
  const dossier={id:'dvn-1',naam:'Voorlopig',voorlopig:true,dvn:true,
    dvnIntappStatus:'posted',dvnResolvedNr:'304000000',dvnIntappAudit:[]};
  const rule={id:'r1',datum:'2026-08-25',start:'09:00',eind:'10:00',
    dossierId:dossier.id,code:'COM',omschrijving:'25.08.2026 · Voorlopig · Werk',
    soort:'werk',gewijzigd:1};
  const assigned=await service.assignDvnNumber({dossier,number:'304000001',name:'Nieuwe naam',
    dossiers:[dossier],rules:[rule],stack:[{dossierId:dossier.id,omschrijving:rule.omschrijving}],
    waitForRules:()=>Promise.resolve(),nowMs:10,nowIso:'2026-08-25T10:00:00.000Z'});
  assert(assigned.ok,'DVN-nummer-service moet slagen');
  assertEq(assigned.dossier.dvn,true,'DVN-identiteit moet na nummerbevestiging blijven');
  assertEq(assigned.dossier.dvnIntappStatus,'needs_check',
    'Nummerwijziging na posted moet controle nodig maken');
  assertEq(assigned.rules[0].code,null,'Oude verplichte DVN-code moet worden gewist');
  assertEq(assigned.rules[0].omschrijving,'Werk','DVN-voorvoegsel moet exact verdwijnen');
  assertEq(assigned.dossier.dvnIntappAudit.at(-1).reden,'dossiernummer aangepast',
    'Nummerwijziging moet traceerbaar blijven');

  const posted=await service.markDvnPosted({dossier:assigned.dossier,
    dossiers:[assigned.dossier],rules:assigned.rules,hoursOf:()=>1,
    nowMs:11,nowIso:'2026-08-25T10:01:00.000Z'});
  assertEq(posted.dossier.dvnIntappStatus,'posted','DVN moet expliciet posted worden');
  assertEq(posted.dossier.dvnIntappPostedRuleIds.join(','),'r1',
    'Posted moet de bronregel-id’s bewaren');
  assertEq(posted.dossier.dvnIntappPostedHours,1,'Posted moet het urentotaal bewaren');

  const open={id:'dvn-2',naam:'Geen nummer',voorlopig:true,dvn:true,dvnIntappAudit:[]};
  const openRule={...rule,id:'r2',dossierId:open.id,code:'ANDERS',omschrijving:'Werk'};
  const finalI7=await service.finalizeDvnI7({dossier:open,dossiers:[open],rules:[openRule],
    stack:[{dossierId:open.id}],runningId:null,commercialCode:'COM',hoursOf:()=>1,
    waitForRules:()=>Promise.resolve(),nowMs:12,nowIso:'2026-08-25T10:02:00.000Z'});
  assertEq(finalI7.dossier.dvnDisposition,'final_i7','Definitief i7 moet terminaal zijn');
  assertEq(finalI7.dossier.dvnFinalI7RuleIds.join(','),'r2',
    'Definitief i7 moet betrokken regels bewaren');
  assertEq(finalI7.rules[0].code,'COM','Definitief i7 moet Commercieel afdwingen');
  assertEq(finalI7.stack.length,0,'DVN moet uit de terugkeerstapel verdwijnen');

  const transactions=db.calls.filter(call=>call.op==='transaction');
  assertEq(JSON.stringify(transactions.map(call=>[call.stores,call.mode])),JSON.stringify([
    [['regels','meta','dossiers','overboekingen'],'readwrite'],
    ['dossiers','readwrite'],
    [['regels','meta','dossiers','overboekingen'],'readwrite']]),
  'Iedere DVN-use-case moet één volledige transactie bezitten');

  gateway.use(fakeDatabase({}, {fail:true}));
  let rejected=false;
  try{await service.markDvnPosted({dossier:assigned.dossier,dossiers:[assigned.dossier],
    rules:assigned.rules,hoursOf:()=>1,nowMs:99,nowIso:'later'});}catch(error){rejected=true;}
  assert(rejected,'Een geïnjecteerde DVN-writefout moet afwijzen');
  assertEq(assigned.dossier.dvnIntappStatus,'needs_check',
    'De invoerstate mag bij een databasefout niet vooraf worden gemuteerd');
});

test('overboekingsservices bewaren beide terminale routes en eerdere i7-boeking', async() => {
  const HH=evaluateAdmin(),service=HH.services.admin,gateway=HH.storage.indexedDB;
  const db=fakeDatabase();gateway.use(db);
  const target={id:'d1',nummer:'304000001',naam:'Doel'},i7={id:'i7',isI7:true,
    nummer:'I700000000',naam:'Indirect'};
  const rule={id:'r1',datum:'2026-08-25',start:'09:00',eind:'10:00',dossierId:target.id,
    code:null,omschrijving:'Werk',soort:'werk',gewijzigd:1};
  const summarize=rules=>[{fp:'fp-'+rules.map(item=>item.id+':'+item.gewijzigd+':'+
    item.dossierId).join(','),code:'',oms:'Werk',u:1,bron:rules.map(item=>({id:item.id}))}];
  const row={fp:summarize([rule])[0].fp,dosIds:[target.id],nummer:target.nummer,
    naam:target.naam,code:'',oms:'Werk',u:1,bron:[{id:rule.id}]};
  const parked=await service.parkOverbooking({row,target,i7Dossier:i7,commercialCode:'COM',
    rules:[rule],overbookings:[],sourceDate:rule.datum,roundingMode:'groep',id:'o1',
    nowIso:'2026-08-25T10:00:00.000Z',hoursOf:()=>1,waitForRules:()=>Promise.resolve()});
  assertEq(parked.overbooking.status,'waiting','Parkeren moet waiting opslaan');
  assertEq(parked.overbooking.sourceFingerprint,row.fp,'Bronfingerprint moet gelijk blijven');
  assertEq(parked.overbooking.temporaryDescription,
    'Tijdelijk i7 voor 304000001 · Doel · Werk','Tijdelijke i7-omschrijving moet gelijk blijven');

  const changed={...rule,gewijzigd:2};
  const beforeTransactions=db.calls.filter(call=>call.op==='transaction').length;
  const blocked=await service.completeOverbookings({ids:['o1'],
    overbookings:[parked.overbooking],rules:[changed],dossiers:[target,i7],
    summarize,roundingMode:'groep',booked:{},nowIso:'2026-08-25T11:00:00.000Z',
    bookedDate:'2026-08-25'});
  assertEq(blocked.error,'queue_changed','Gewijzigde bronregel moet afhandeling blokkeren');
  assertEq(db.calls.filter(call=>call.op==='transaction').length,beforeTransactions,
    'Geblokkeerde afhandeling mag geen transactie starten');

  const refreshed=await service.refreshOverbooking({overbooking:parked.overbooking,
    rules:[changed],dossiers:[target,i7],runningId:null,summarize,hoursOf:()=>1,
    roundingMode:'groep',waitForRules:()=>Promise.resolve(),
    nowIso:'2026-08-25T11:01:00.000Z'});
  const completed=await service.completeOverbookings({ids:['o1'],
    overbookings:[refreshed.overbooking],rules:[changed],dossiers:[target,i7],
    summarize,roundingMode:'groep',booked:{oud:['bestaande-i7-boeking']},
    nowIso:'2026-08-25T11:02:00.000Z',bookedDate:'2026-08-25'});
  assertEq(completed.overbookings[0].status,'done','Dossierboeking moet done opslaan');
  assertEq(completed.overbookings[0].targetBookedDate,'2026-08-25',
    'Dossierboeking gebruikt de actuele Intapp-datum');
  assertEq(completed.booked.oud[0],'bestaande-i7-boeking',
    'Eerdere i7-boekstatus mag niet worden verwijderd');
  const completeStart=src.admin.indexOf('async function completeOverbookings');
  const completeEnd=src.admin.indexOf('\n  async function finalizeOverbookingI7',completeStart);
  const completeSource=src.admin.slice(completeStart,completeEnd);
  assertNotIncludes(completeSource,'stores.regels',
    'Dossierafhandeling mag de Hour Hound-bronregels niet wijzigen');
  assertNotIncludes(completeSource,'stores.dossiers',
    'Dossierafhandeling mag ook het eerdere i7-dossier niet aanraken');

  const finalRecord={...parked.overbooking,id:'o2',sourceRuleIds:['r2'],
    sourceSnapshot:[{...parked.overbooking.sourceSnapshot[0],id:'r2'}]};
  const finalRule={...rule,id:'r2'};
  const finalI7=await service.finalizeOverbookingI7({overbooking:finalRecord,
    rules:[finalRule],i7Dossier:i7,commercialCode:'COM',runningId:null,
    summarize,booked:{oud:['bestaande-i7-boeking']},waitForRules:()=>Promise.resolve(),
    nowMs:20,nowIso:'2026-08-25T11:03:00.000Z'});
  assertEq(finalI7.overbooking.status,'final_i7','Tweede route moet terminale final_i7 zijn');
  assertEq(finalI7.rules[0].dossierId,i7.id,'Bronregel moet werkelijk naar i7 gaan');
  assertEq(finalI7.rules[0].code,'COM','Bronregel moet Commercieel krijgen');
  assertEq(finalI7.booked.oud[0],'bestaande-i7-boeking',
    'Ook definitief i7 mag eerdere Intapp-status niet wissen');
  assertNotIncludes(src.admin,'document','Administratieve services mogen de DOM niet lezen');
  assertNotIncludes(src.admin,'confirm(','Bevestigingen horen in de UI te blijven');
  assertNotIncludes(src.admin,'toast(','Meldingen horen in de UI te blijven');
});

test('administratieve services blokkeren ongeldige transities vóór IndexedDB', async() => {
  const HH=evaluateAdmin(),service=HH.services.admin,gateway=HH.storage.indexedDB;
  const db=fakeDatabase();gateway.use(db);
  const linked={id:'dvn',naam:'DVN',dvn:true,dvnResolvedNr:'304000001'},
    otherDvn={id:'other',naam:'Andere DVN',nummer:'304000002',voorlopig:true};
  const assign=await service.assignDvnNumber({dossier:linked,number:'304000002',
    dossiers:[linked,otherDvn],rules:[],stack:[],nowMs:1,nowIso:'nu'});
  assertEq(assign.error,'target_is_dvn','Een DVN mag niet aan een andere DVN worden gekoppeld');
  const finalDvn=await service.finalizeDvnI7({dossier:linked,dossiers:[linked],rules:[],
    stack:[],runningId:null,commercialCode:'COM',hoursOf:()=>0,nowMs:1,nowIso:'nu'});
  assertEq(finalDvn.error,'number_exists','Een genummerde DVN mag niet naar definitief i7');
  const invalidPark=await service.parkOverbooking({row:{dosIds:[linked.id],fp:'fp',bron:[]},
    target:linked,i7Dossier:{id:'i7',isI7:true},commercialCode:'COM'});
  assertEq(invalidPark.error,'invalid_target','Een DVN mag niet als gewone blokkade worden geparkeerd');
  const done={id:'o',status:'done',sourceRuleIds:[]};
  const finish=await service.finalizeOverbookingI7({overbooking:done,i7Dossier:{id:'i7'},
    commercialCode:'COM'});
  assertEq(finish.error,'not_open','Een terminale overboeking mag niet opnieuw overgaan');
  assertEq(db.calls.filter(call=>call.op==='transaction').length,0,
    'Ongeldige administratieve transities mogen IndexedDB niet openen');
});

test('administratieve UI-adapters schrijven niet meer rechtstreeks naar opslag', () => {
  const slice=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a+1);
    return a>=0&&b>a?source.slice(a,b):'';};
  const workflows=[
    [src.timer,'async function maakDvnDefinitiefI7','/* ---------- DVN dossiernummer'],
    [src.timer,'async function slaDvnNummerOp','/* ---------- DVN-regels'],
    [src.timer,'async function markeerDvnIngevoerd','/* ---------- langloopmelding'],
    [src.booking,'async function bevestigParkeer','async function kopieerHuidig'],
    [src.views,'async function handelOverboekingenAf','async function verversOverboeking'],
    [src.views,'async function verversOverboeking','async function maakOverboekingDefinitiefI7'],
    [src.views,'async function maakOverboekingDefinitiefI7','/* ---------- beheer']
  ];
  for(const [source,start,end] of workflows){
    const body=slice(source,start,end);assert(body,`Workflow ontbreekt: ${start}`);
    assertIncludes(body,'adminServices.',`${start} moet de administratieve service aanroepen`);
    for(const forbidden of ['await put(','await tx(','await txAll(','getAll("overboekingen")'])
      assertNotIncludes(body,forbidden,`${start} mag niet rechtstreeks naar opslag schrijven`);
  }
});

test('dagregelservice bewaart waarschuwingen, DVN-terugval en undo-soort atomair', async() => {
  const HH=evaluateDayRules(),service=HH.services.dayRules,gateway=HH.storage.indexedDB;
  const db=fakeDatabase();gateway.use(db);
  const dossier={id:'dvn',nummer:'304000001',naam:'DVN',dvn:true,
    dvnIntappStatus:'posted',dvnIntappAudit:[]};
  const rule={id:'r1',datum:'2026-08-25',start:'09:00',eind:'10:00',dossierId:'dvn',
    code:'COM',omschrijving:'Werk',uren:1,urenHand:false,soort:'werk',gewijzigd:1};
  const changed={...rule,eind:'10:30',uren:1.5};
  const common={before:rule,rule:changed,rules:[rule],dossiers:[dossier],overbookings:[],
    runningId:null,isBooked:true,bookingContext:{runningId:null,today:'2026-08-25',nowHM:'11:00'},
    waitForRules:()=>Promise.resolve(),nowTime:'11:00',nowMs:2,nowIso:'nu'};
  const blocked=await service.editRule(common);
  assertEq(blocked.error,'confirmation_required',
    'Een geboekte of posted regel mag niet zonder bewuste bevestiging wijzigen');
  assert(blocked.warnings.includes('dvn_posted')&&blocked.warnings.includes('booked'),
    'Administratieve waarschuwingen moeten centraal uit de service komen');
  assertEq(db.calls.filter(call=>call.op==='transaction').length,0,
    'Een onbevestigde mutatie mag IndexedDB niet openen');
  const edited=await service.editRule({...common,confirmedWarnings:true});
  assertEq(edited.dossiers[0].dvnIntappStatus,'needs_check',
    'Wijzigen moet een posted DVN in dezelfde transactie terugzetten');
  assertEq(edited.undo.kind,'data','Een gewone regelbewerking blijft gegevens-undo');
  const runningEdit=await service.editRule({...common,rules:[rule],runningId:rule.id,
    rule:{...changed,eind:'10:30'},confirmedWarnings:true,nowMs:3});
  assertEq(runningEdit.undo.kind,'timer',
    'Een editoractie die de lopende timer stopt moet timer-undo opleveren');

  const parked={id:'o1',status:'waiting',sourceRuleIds:[rule.id]};
  const before=db.calls.filter(call=>call.op==='transaction').length;
  const refused=await service.deleteRule({rule,rules:[rule],dossiers:[dossier],
    overbookings:[parked],runningId:null,nowMs:4,nowIso:'later'});
  assertEq(refused.error,'parked_rule','Een geparkeerde bronregel mag niet worden verwijderd');
  assertEq(db.calls.filter(call=>call.op==='transaction').length,before,
    'Bescherming van een geparkeerde bronregel moet vóór IndexedDB gelden');

  const failed=fakeDatabase({}, {fail:true});gateway.use(failed);
  const sourceBefore=JSON.stringify({rule,dossier});let rejected=false;
  try{await service.editRule({...common,confirmedWarnings:true,nowMs:5});}
  catch(error){rejected=true;}
  assert(rejected,'Een geïnjecteerde dagregel-writefout moet afwijzen');
  assertEq(JSON.stringify({rule,dossier}),sourceBefore,
    'Een databasefout mag regel en DVN niet vooraf in het geheugen muteren');
});

test('dagservice sluit, vult exact aan en heropent vanuit één opgeslagen dagstaat', async() => {
  const HH=evaluateDayRules(),service=HH.services.dayRules,gateway=HH.storage.indexedDB;
  const db=fakeDatabase();gateway.use(db);
  const date='2026-08-25',rule={id:'r1',datum:date,start:'09:00',eind:'14:54',
    dossierId:'d1',omschrijving:'Werk',uren:5.9,urenHand:true,soort:'werk'};
  const closed=await service.closeDay({date,end:'17:00',rules:[rule],dossiers:[{id:'d1'}],
    overbookings:[],runningId:null,dayEnds:{},dayAudit:{},stack:[],totalBefore:5.9,
    bookingContext:{runningId:null,today:date,nowHM:'17:00'},nowMs:1,nowIso:'sluit'});
  assertEq(closed.dayEnds[date],'17:00','Afsluiten moet de centrale dageindtijd schrijven');
  assertEq(closed.dayAudit[date].events[0].type,'gesloten','Afsluiten moet dagaudit schrijven');

  const i7={id:'i7',isI7:true,naam:'Indirect'};
  const fillInput={date,isWorkday:true,dayEnds:closed.dayEnds,dayAudit:closed.dayAudit,
    dayEnd:'17:00',rules:[rule],dossiers:[{id:'d1'},i7],overbookings:[],runningId:null,
    i7Dossier:i7,code:'ADM',currentTotal:5.9,
    bookingContext:{runningId:null,today:date,nowHM:'17:00'},id:'fill',batchId:'batch',
    nowMs:2,nowIso:'vul',waitForRules:()=>Promise.resolve()};
  const filled=await service.autoFillDay(fillInput);
  assertEq(filled.rule.uren,2.1,'5,9 uur moet exact 2,1 uur Diversen toevoegen');
  assertEq(filled.rule.start,filled.rule.eind,
    'Administratieve aanvulling mag geen fictief tijdvak suggereren');
  assertEq(filled.finalTotal,8,'De opgeslagen aanvulactie moet exact op 8,0 uur uitkomen');
  assertEq(filled.undo.kind,'data','Auto-aanvullen blijft gegevens-undo');

  const reopened=await service.reopenDay({date,removeAutomatic:true,
    rules:[rule,filled.rule],dossiers:[{id:'d1'},i7],overbookings:[],runningId:null,
    dayEnds:closed.dayEnds,dayAudit:filled.dayAudit,nowMs:3,nowIso:'heropen'});
  assert(!Object.prototype.hasOwnProperty.call(reopened.dayEnds,date),
    'Heropenen moet dezelfde centrale dageindtijd verwijderen');
  assertEq(reopened.removedRules[0].id,'fill',
    'Heropenen met keuze 1 moet de automatische regel verwijderen');
  assertEq(reopened.dayAudit[date].events.at(-1).type,'heropend',
    'Open-dagenbanner, Dag-status en audit moeten dezelfde heropenstatus lezen');

  const transactions=db.calls.filter(call=>call.op==='transaction').length;
  const weekend=service.planAutoFill({...fillInput,date:'2026-08-23',isWorkday:false});
  assertEq(weekend.error,'weekend','Weekend mag geen 8-uursaanvulling plannen');
  assertEq(db.calls.filter(call=>call.op==='transaction').length,transactions,
    'Een geblokkeerde weekendaanvulling mag niets schrijven');
});

test('Dag-UI is alleen adapter voor dag- en regelmutaties', () => {
  const slice=(start,end)=>{const a=src.views.indexOf(start),b=src.views.indexOf(end,a+1);
    assert(a>=0&&b>a,`Workflowgrens ontbreekt: ${start}`);return src.views.slice(a,b);};
  const workflows=[
    [slice('async function sluitWerkdag','/* ---------- bewuste regelbewerking'),'timerServices.closeDay'],
    [slice('function openRegelEditor','function controleerOudeLopendeTaak'),'timerServices.editRule'],
    [slice('async function vulAanTot8','async function heropenWerkdag'),'dayRuleServices.autoFillDay'],
    [slice('async function heropenWerkdag','$("d-fill").onclick'),'dayRuleServices.reopenDay'],
    [slice('async function maakLopend','$("d-prev").onclick'),'timerServices.reopenRule'],
    [slice('$("d-table").addEventListener','/* De enige manier'),'timerServices.deleteRule']
  ];
  for(const [body,serviceCall] of workflows){
    assertIncludes(body,serviceCall,`${serviceCall} ontbreekt in de UI-adapter`);
    for(const forbidden of ['await txAll(','await tx(','o.regels.put','o.regels.delete',
      'o.meta.put','o.meta.delete'])assertNotIncludes(body,forbidden,
        `${serviceCall} mag niet rechtstreeks regels of dagmetadata schrijven`);
  }
  assertIncludes(src.views,'dayRuleServices.addRule','Handmatig toevoegen moet ook via de service');
  assertNotIncludes(src.dayRules,'document','De dagservice mag de DOM niet lezen');
  assertNotIncludes(src.dayRules,'confirm(','Bevestigingen blijven eigendom van de UI');
  assertNotIncludes(src.dayRules,'toast(','Meldingen blijven eigendom van de UI');
  assertNotIncludes(src.dayRules,'Date.now','Klokken moeten expliciet worden geïnjecteerd');
});

test('TimerService knipt direct, serialiseert en houdt maximaal één regel open', async() => {
  const HH=evaluateTimerService(),service=HH.services.timer,gateway=HH.storage.indexedDB;
  const db=fakeDatabase();gateway.use(db);
  const oud={id:'r-oud',datum:'2026-08-25',start:'09:00',eind:null,dossierId:'d1',
    code:null,omschrijving:'Oud werk',uren:0.1,urenHand:false,soort:'werk',gewijzigd:1};
  const dossiers=[{id:'d1',naam:'Oud dossier',used:0},{id:'d2',naam:'Nieuw dossier',used:0}];
  let runtime=oud;
  const input={currentTimer:runtime,readCurrentTimer:()=>runtime,rules:[oud],dossiers,
    stack:[],dayEnds:{},dayAudit:{},codeUsage:{},id:'r-nieuw',dossierId:'d2',
    code:'A',description:'Nieuw werk',kind:'werk',date:'2026-08-25',time:'10:07',
    nowMs:2,nowIso:'2026-08-25T10:07:00.000Z',waitForRules:()=>Promise.resolve()};
  const switched=await service.switchTask(input);
  assert(switched.ok,'Een geldige taakwissel moet slagen');
  assertEq(switched.closedRule.eind,'10:07','N moet op het exacte actiemoment een tijdknip maken');
  const resulting=[switched.closedRule,switched.rule].filter(rule=>!rule.eind);
  assertEq(resulting.length,1,'Na een taakwissel mag precies één open regel overblijven');
  assertEq(switched.currentTimerId,'r-nieuw','De nieuwe regel moet de enige timerpointer worden');
  const pointerWrites=db.calls.filter(call=>call.store==='meta'&&call.key==='running');
  assertEq(pointerWrites.length,1,'De pointer hoort één keer in dezelfde transactie te wijzigen');

  const stale=await service.start({...input,id:'r-dubbel'});
  assertEq(stale.error,'timer_changed',
    'Een al ingehaalde UI-snapshot mag geen tweede open timer starten');

  runtime=switched.rule;
  const failed=fakeDatabase({}, {fail:true});gateway.use(failed);
  const before=JSON.stringify(runtime);
  const stopped=await service.stop({currentTimer:runtime,readCurrentTimer:()=>runtime,
    rules:[runtime],dossiers,stack:[],date:'2026-08-25',time:'10:08',end:'10:08',
    nowMs:3,nowIso:'2026-08-25T10:08:00.000Z',waitForRules:()=>Promise.resolve()});
  assertEq(stopped.error,'write_failed','Een databasefout moet als timer-writefout terugkomen');
  assertEq(JSON.stringify(runtime),before,
    'Een databasefout mag de runtime-regel niet vooraf muteren');
});

test('TimerService laat oude timers en meervoudige open regels alleen expliciet herstellen', async() => {
  const HH=evaluateTimerService(),service=HH.services.timer,gateway=HH.storage.indexedDB;
  const db=fakeDatabase();gateway.use(db);
  const a={id:'a',datum:'2026-08-24',start:'09:00',eind:null,dossierId:null,
    uren:0.1,urenHand:false,soort:'werk'},
    b={id:'b',datum:'2026-08-25',start:'10:00',eind:null,dossierId:null,
      uren:0.1,urenHand:false,soort:'werk'};
  const inspected=service.inspectOldTimer({currentTimer:a,date:'2026-08-25'});
  assert(inspected.old,'Een timer van een vorige dag moet als oud worden herkend');
  const kept=await service.keepOldTimer({currentTimer:a,readCurrentTimer:()=>a});
  assert(kept.ok,'Bewust door laten lopen moet de oude timer behouden');
  assertEq(db.calls.filter(call=>call.op==='transaction').length,0,
    'Inspecteren en behouden mogen een oude timer niet stilzwijgend sluiten');

  const repaired=await service.repairInvariant({currentTimer:null,readCurrentTimer:()=>null,
    rules:[a,b],pointerId:null,pendingId:'oud-pending'});
  assert(repaired.blocked&&service.isBlocked(),
    'Meerdere open regels moeten de timerketting blokkeren');
  const blocked=await service.start({currentTimer:null,readCurrentTimer:()=>null,rules:[a,b]});
  assertEq(blocked.error,'blocked','Een geblokkeerde ketting mag niet verder starten');
  const replacements=[{...a,eind:'09:30'},{...b,eind:'10:30'}];
  const confirmed=await service.confirmRecovery({currentTimer:null,readCurrentTimer:()=>null,
    rules:[a,b],replacements,chosenId:null,waitForRules:()=>Promise.resolve()});
  assert(confirmed.ok&&!service.isBlocked(),'Alleen expliciete bevestiging mag het conflict vrijgeven');
  assertEq(confirmed.currentTimerId,null,'Herstel zonder keuze moet geen timer laten lopen');
});

test('TimerService is de enige productie-eigenaar van meta.running', () => {
  const direct=/meta\.(?:put|delete)\([^\n]*["']running["']/;
  const owners=Object.entries(src).filter(([name,code])=>name!=='sw'&&direct.test(code))
    .map(([name])=>name).sort();
  assertEq(owners.join(','),'io,timerService',
    'Alleen TimerService en expliciete import/restore mogen meta.running schrijven');
  assertIncludes(src.timerService,'let counter=0,currentToken=0,chain=Promise.resolve()',
    'TimerService moet één geserialiseerde productieketting bezitten');
  for(const code of [src.timer,src.wizard,src.views,src.controls,src.app])
    assertNotIncludes(code,'meta.put("running")','Controllers mogen de pointer niet schrijven');
});

test('DVN-domein houdt classificatie, resolutie en audit puur', () => {
  const context={};vm.createContext(context);
  vm.runInContext(src.hh,context,{filename:'js/hh.js'});
  vm.runInContext(src.dvnDomain,context,{filename:'js/domain/dvn.js'});
  const api=context.HH.domain.dvn,ind={id:'i7',nummer:'I700000000',naam:'Indirect'},
    doel={id:'doel',nummer:'304000001',naam:'Doeldossier'},
    dvn={id:'dvn',naam:'Oude naam',voorlopig:true,dvn:true,dvnTo:doel.id,
      dvnIntappStatus:'posted',dvnIntappAudit:[{type:'oud',t:'eerder'}]};
  assert(api&&Object.isFrozen(api),'HH.domain.dvn moet bestaan en bevroren zijn');
  assertEq(api.resolvedNumber(dvn,[ind,doel]),doel.nummer,
    'DVN-nummer moet uit expliciet meegegeven dossiers worden opgelost');
  assertEq(api.intappState(dvn,[ind,doel]),'posted','Afgehandelde DVN-status moet behouden blijven');
  const info=api.intappInfo(dvn,{dossiers:[ind,doel],i7Dossier:ind});
  assertEq(JSON.stringify(info),JSON.stringify({nummer:'304000001',naam:'Doeldossier',
    dvn:true,state:'posted'}),'Intapp-info moet het opgeloste dossier gebruiken');
  const changed=api.markNeedsCheck(dvn,'tijd gewijzigd',{dossiers:[ind,doel],
    needsAt:'2026-08-25T10:00:00Z',auditAt:'2026-08-25T10:00:01Z',modifiedAt:123});
  assertEq(changed.dvnIntappStatus,'needs_check','Posted DVN moet controle nodig kunnen worden');
  assertEq(changed.dvnIntappAudit.at(-1).reden,'tijd gewijzigd','Auditreden moet expliciet blijven');
  assertEq(changed.gewijzigd,123,'Wijzigstempel moet uit expliciete invoer komen');
  assertNotIncludes(src.dvnDomain,'document','DVN-domein mag de DOM niet lezen');
  assertNotIncludes(src.dvnDomain,'indexedDB','DVN-domein mag geen opslag lezen');
  for(const label of ['afgehandeld','controle nodig','nog boeken in Intapp','Indirecte uren',
    'tijdregel gewijzigd'])
    assertNotIncludes(src.dvnDomain,label,'Gebruikerslabels horen niet in de DVN-statusmachine');
});

test('overboekingsdomein bewaakt afgeleide en terminale status puur', () => {
  const context={};vm.createContext(context);
  vm.runInContext(src.hh,context,{filename:'js/hh.js'});
  vm.runInContext(src.overbookingDomain,context,{filename:'js/domain/overbooking.js'});
  const api=context.HH.domain.overbooking,doel={id:'d1',nummer:'304000001',naam:'Doel'},
    regel={id:'r1',dossierId:doel.id,gewijzigd:10},
    wacht={id:'o1',status:'waiting',targetDossierId:doel.id,
      targetNumberSnapshot:doel.nummer,targetNameSnapshot:doel.naam,sourceDate:'2026-08-25',
      sourceRuleIds:[regel.id],sourceSnapshot:[{id:regel.id,gewijzigd:10}],
      sourceFingerprints:['fp']},options={rules:[regel],dossiers:[doel],
      summarize:()=>[{fp:'fp'}]};
  assert(api&&Object.isFrozen(api),'HH.domain.overbooking moet bestaan en bevroren zijn');
  assertEq(api.state(wacht,options),'waiting','Ongewijzigde brondata moet waiting blijven');
  assertEq(api.state(wacht,{...options,rules:[{...regel,gewijzigd:11}]}),'needs_check',
    'Needs-check moet uit gewijzigde brondata worden afgeleid');
  assertEq(api.changeCodes(wacht,{...options,rules:[{...regel,gewijzigd:11}]})[0],
    'source_rule_changed','Statusmachine moet een stabiele code teruggeven');
  assertEq(api.state({...wacht,status:'done'},options),'done','Done moet terminaal blijven');
  assertEq(api.state({...wacht,status:'final_i7'},options),'final_i7',
    'Definitief i7 moet terminaal blijven');
  assertEq(api.canFinish(wacht,'done'),true,'Waiting mag naar done');
  assertEq(api.canFinish(wacht,'final_i7'),true,'Waiting mag naar definitief i7');
  assertEq(api.canFinish({...wacht,status:'done'},'final_i7'),false,
    'Een terminale overboeking mag niet opnieuw overgaan');
  assertNotIncludes(src.overbookingDomain,'document','Overboekingsdomein mag de DOM niet lezen');
  assertNotIncludes(src.overbookingDomain,'indexedDB','Overboekingsdomein mag geen opslag lezen');
  for(const label of ['Wacht op dossierboeking','Gewijzigd — controleren','Afgehandeld'])
    assertNotIncludes(src.overbookingDomain,label,
      'Gebruikerslabels horen niet in de overboekingsstatusmachine');
  for(const detail of ['tijdregel verwijderd','tijdregel gewijzigd','dossiernummer gewijzigd'])
    assertNotIncludes(src.overbookingDomain,detail,
      'Wijzigingsdetails horen pas in de presentatieadapter vertaald te worden');
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
  assertIncludes(src.dayRules, 'if(!input.isWorkday)return fail("weekend")',
    'De mutatieservice moet weekendaanvulling blokkeren');
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
  setState({ dossiers: [finalI7] });
  assertEq(api.intappDossierInfo(finalI7).naam,'Indirecte uren',
    'De presentatieadapter moet de bestaande i7-fallbacknaam behouden');
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
  assertIncludes(src.storage,'const DB_NAME="hourhound",DB_VERSION=4',
    'De update moet dezelfde IndexedDB-database blijven openen');
  const upgradeBegin=src.storage.indexOf('function upgrade(d)');
  const upgradeEnd=src.storage.indexOf('\n  function open(',upgradeBegin);
  const upgrade=upgradeBegin>=0&&upgradeEnd>upgradeBegin
    ?src.storage.slice(upgradeBegin,upgradeEnd):'';
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
  const standaard = api.markDvnControleNodig(posted);
  assertEq(standaard.dvnIntappNeedsCheckReason,'tijdregel gewijzigd',
    'De presentatieadapter moet de bestaande standaardreden behouden');
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
  assertIncludes(src.dayRules, 'dayAuditAfter(input.dayAudit,input.date,"gesloten"',
    'Dagafsluitservice moet audit schrijven');
  assertIncludes(src.views, 'timerServices.closeDay',
    'De afsluitsheet moet de dagservice via TimerService aanroepen');
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
  assertIncludes(src.dayRules, 'uren:shortfall,urenHand:true',
    'Automatische Diversen-regel moet exact handmatig aantal uren dragen');
  assertIncludes(src.dayRules, 'const shortfall=booking.autoFillShortfall(current)',
    'Aanvulling moet rechtstreeks uit het tekort tot 8,0 worden berekend');
  for (const forbidden of ['aanvulGaten', 'grootsteBlokTotNorm', 'Welke gaten wil je vullen?', 'vrije tijd om tot']) {
    assertNotIncludes(src.views, forbidden, `Auto-aanvullen mag niet meer afhankelijk zijn van tijdvakken: ${forbidden}`);
  }
  assertIncludes(src.views, 'Er was al "+uu(plan.currentTotal)+" uur verantwoord. Er is daarom geen Diversen toegevoegd.',
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
  assertIncludes(src.admin, 'dvn:true', 'DVN mag niet plat naar gewoon dossier verdwijnen');
  assertIncludes(src.admin, 'dvnOriginalName', 'Oorspronkelijke DVN-naam moet bewaard blijven');
  assertIncludes(src.admin, 'dvnResolvedNr', 'Toegekend dossiernummer moet als DVN-metadata bestaan');
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
  assertIncludes(src.admin, 'dvnIntappPostedRuleIds:rules.map',
    'Afhandeling moet de betrokken regel-id’s vastleggen');
  assertIncludes(src.core, 'const dvnIntappState=d=>dvnDomain.intappState',
    'DVN-statusadapter ontbreekt');
  assertIncludes(src.core, 'function dvnPutIfPosted', 'Gedeelde posted-DVN-terugval ontbreekt');
  assertIncludes(src.core, '"posted"', 'DVN posted-status ontbreekt');
  assertIncludes(src.core, '"needs_check"', 'DVN controle-nodig status ontbreekt');
  assertIncludes(src.dayRules, '"tijdregel gewijzigd"', 'Bewerken van posted DVN-regel moet controle nodig maken');
  assertIncludes(src.dayRules, '"tijdregel verwijderd"', 'Verwijderen van posted DVN-regel moet controle nodig maken');
  assertIncludes(src.dayRules, '"tijdregel opnieuw lopend gemaakt"', 'Opnieuw lopend maken moet controle nodig maken');
  assertIncludes(src.admin, 'dossiernummer aangepast',
    'Dossiernummerwijziging na posted moet controle nodig maken');
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
  assertIncludes(src.admin, 'dvnDisposition:"final_i7"',
    'Terminale DVN-dispositie moet worden opgeslagen');
  assertIncludes(src.admin, 'dvnFinalI7RuleIds:rules.map',
    'Betrokken regel-id’s moeten traceerbaar blijven');
  assertIncludes(src.timer, 'i7CodeOp(VAST_VOORLOPIG,"-704")', 'Commercieel moet verplicht blijven');
  assertIncludes(src.views, 'data-dvn-final-i7', 'Open DVN-kaart mist de definitief-i7-actie');
  assertIncludes(src.views, '!dvnDefinitiefI7(d)', 'Definitief i7 mag niet in de DVN-werkvoorraad blijven');
  assertIncludes(src.core, '!dvnDefinitiefI7(d)', 'Definitief i7 mag niet in het DVN-deel van Nu blijven');
});

test('Patch H houdt gewone blokkade los van DVN en echte boekstatus', () => {
  assertIncludes(src.storage, 'd.createObjectStore("overboekingen"', 'Aparte IndexedDB-wachtrij ontbreekt');
  assertIncludes(src.storage, 'const DB_NAME="hourhound",DB_VERSION=4',
    'Databaseversie moet de wachtrij-store aanmaken');
  assertIncludes(src.html, 'Nog over te boeken naar dossier', 'Beheer mist de overboekingswerkvoorraad');
  assertIncludes(src.html, 'Tijdelijk niet boekbaar', 'Dagwizard mist de parkeeractie');
  assertIncludes(src.html, 'Op i7 geboekt · parkeren', 'Expliciete tijdelijke i7-bevestiging ontbreekt');
  assertIncludes(src.admin, 'gateway.tx("overboekingen","readwrite"',
    'Parkeren moet apart van geboekt worden opgeslagen');
  assertNotIncludes(src.booking, 'zetGeboekt(p.row.fp,true)', 'Parkeren mag niet als echte dossierboeking gelden');
  assertIncludes(src.booking, 'geboekt · "+p+" geparkeerd · "+open+" open', 'Dagstatus moet drie aantallen tonen');
  assertIncludes(src.html, 'Op dossier geboekt · afhandelen', 'Latere dossierbevestiging ontbreekt');
  assertIncludes(src.admin, 'targetBookedDate:input.bookedDate',
    'Latere boeking moet de actuele Intapp-datum vastleggen');
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
  assertIncludes(src.admin, 'dossierId:indirect.id',
    'Definitief i7 moet bronregels echt herclassificeren');
  assertIncludes(src.admin, 'code:input.commercialCode',
    'Definitief i7 moet de verplichte code toepassen');
  assertIncludes(src.admin, 'await waitFor(input,ids)',
    'Lopende bronwrites moeten voor omzetting klaar zijn');
  assertIncludes(src.admin, 'stores.overboekingen.put(updated)',
    'Bronregels en terminale status moeten transactioneel schrijven');
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
  assertIncludes(src.admin, 'gateway.tx(["overboekingen","meta"],"readwrite"',
    'Afhandelen en duurzame boekstatus moeten in één transactie worden opgeslagen');
  assertIncludes(src.admin, 'sourceFingerprints:fingerprints',
    'Afhandelen moet de actuele inhoudsvingerafdrukken bewaren');
  assertIncludes(src.admin, 'stores.meta.put(booked,"geboekt")',
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

test('oude timer en editor volgen het TimerService-contract', () => {
  assertIncludes(src.timer, 'function middernachtCheck', 'middernachtCheck ontbreekt');
  const midnight = (src.timer.match(/async function middernachtCheck\(\)\{[\s\S]*?\n\}/) || [''])[0];
  assertNotIncludes(midnight, 'await _stop', 'middernachtCheck mag niet rechtstreeks stoppen');
  assertIncludes(src.timer, 'timerServices.inspectOldTimer',
    'Een oude timer moet eerst zonder mutatie door TimerService worden geïnspecteerd');
  assertIncludes(src.views, 'timerServices.editRule',
    'Bewerken van de lopende regel moet door TimerService lopen');
  assertNotIncludes(src.views, 'meta.delete("running")',
    'De viewlaag mag meta.running niet rechtstreeks wijzigen');
});

test('timer-invariant herstelt alleen eenduidige state en blokkeert conflicten', () => {
  const begin=src.app.indexOf('async function herstelInvariant(snapshotMeta)');
  const einde=src.app.indexOf('\nfunction openRegels()',begin);
  const herstel=begin>=0&&einde>begin?src.app.slice(begin,einde):'';
  assert(herstel,'herstelInvariant() ontbreekt');
  assertIncludes(herstel,'timerServices.repairInvariant',
    'Opstartreparatie moet door TimerService lopen');
  assertIncludes(src.timerService,'if(open.length>1)',
    'Meerdere open regels moeten expliciet als conflict worden behandeld');
  assertIncludes(src.timerService,'blocked=true',
    'Meerdere open regels moeten nieuwe timeracties blokkeren');
  assertIncludes(herstel,'toonHerstel()',
    'Een conflict moet het expliciete herstelvenster openen');
  assertNotIncludes(src.timerService.slice(src.timerService.indexOf('function repairInvariant'),
    src.timerService.indexOf('function confirmRecovery')),'stores.regels.put',
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
    await fn();
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
