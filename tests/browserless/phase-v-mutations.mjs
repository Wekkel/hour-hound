#!/usr/bin/env node
// Phase V: execute production services/handlers with serialized, staged IDB transactions.
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const arg=process.argv.find(x=>x.startsWith('--root='));
const root=resolve(arg?arg.slice(7):(process.env.HH_TEST_ROOT||join(dirname(fileURLToPath(import.meta.url)),'../..')));
const read=rel=>readFileSync(join(root,rel),'utf8');
const paths={hh:'hh',time:'domain/time',bookingDomain:'domain/booking',dvnDomain:'domain/dvn',overbookingDomain:'domain/overbooking',storage:'storage/indexeddb',admin:'services/admin',dayRules:'services/day-rules',timerService:'services/timer',settings:'services/settings',state:'state',core:'core',timer:'timer'};
const src=Object.fromEntries(Object.entries(paths).map(([k,v])=>[k,read('js/'+v+'.js')]));
let failures=0;
const assert=(v,m)=>{if(!v)throw new Error(m);};
const assertEq=(a,b,m)=>assert(a===b,m+'; expected '+b+', got '+a);
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
  vm.runInContext(src.settings, context, { filename: 'js/services/settings.js' });
  vm.runInContext(src.state, context, { filename: 'js/state.js' });
  const exportCode = `\n;globalThis.__hhSetState = function(s){\n`+
    `HH.state.commit({dossiers:s.dossiers||[],templates:s.templates||[],codes:s.i7codes||[],rules:s.alle||[],overbookings:s.overboekingen||[],running:s.running||null,stack:s.stack||[],viewDate:s.viewDate||today(),dayEnds:s.dagEinde||{},dayAudit:s.dagAudit||{},roundingMode:s.rondMode||"groep",booked:s.geboekt||{},codeUsage:s.codeGebruik||{}});\n`+
    `return true;\n};\n`+
    `globalThis.__hhPure = { hm2m, m2hm, uu, ymd, dmy, parseD, addD, weekend, werkdag, schoon, normOms, simIntappTotaal, urenOf, ruweMin, eindOf, totaal, nuBreakdown, gapsFor, gapHours, takenVandaag, taakLabel, autoAanvulTekort, dagSluitStatus, isDvn, dvnDefinitiefI7, isIndirect, dvnRegels, dvnResolvedNummer, dvnIntappState, dvnStatusTekst, dvnSummaryStatus, dvnAuditAdd, markDvnControleNodig, dvnPutIfPosted, intappDossierInfo, codesFor, defaultCode, codeVoor, i7CodeOp, codeFout, sumVan, overboekingOpenVoorRegel, overboekingVoorBronId, overboekingVoorRow, overboekingFingerprints, overboekingAfgerondVoorRow, overboekingState, overboekingStatusTekst, overboekingWijzigingen };`;
  vm.runInContext(src.core + exportCode, context, { filename: 'js/core.js' });
  return { api: context.__hhPure, setState: context.__hhSetState, context };
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

function persistentDB(seed={}){
 const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
 const rows={};for(const name of ['regels','dossiers','meta','overboekingen','codes','templates']){
  rows[name]=new Map(name==='meta'?Object.entries(seed[name]||{}):(seed[name]||[]).map(x=>[x.id||x.code,clone(x)]));
 }
 let queue=Promise.resolve();let writes=0,failWrites=0;
 return {rows,failNextWrite(){failWrites++;},get writes(){return writes;},transaction(names,mode){
  names=Array.isArray(names)?names:[names];let resolveDone;
  const done=new Promise(r=>resolveDone=r),previous=queue;queue=done;
  let active=false,pending=0,aborted=false,data;
  const jobs=[];
  const tx={error:null,abort(){aborted=true;tx.error=new Error('aborted');},objectStore(name){return {
   get:key=>request(()=>clone(data[name].get(key))),getAll:()=>request(()=>[...data[name].values()].map(clone)),
   put:(value,key)=>request(()=>{const k=key===undefined?(value.id||value.code):key;data[name].set(k,clone(value));return k;}),
   delete:key=>request(()=>data[name].delete(key)),clear:()=>request(()=>data[name].clear())
  };}};
  function finish(){setTimeout(()=>{if(pending)return;if(mode==='readwrite'&&failWrites){failWrites--;aborted=true;tx.error=new Error('Injected write failure');}if(aborted){tx.onabort?.();resolveDone();return;}
   if(mode==='readwrite'){for(const n of names)rows[n]=data[n];writes++;}tx.oncomplete?.();resolveDone();},0);}
  function request(fn){let value;const r={readyState:'pending',error:null,get result(){if(r.readyState!=='done'){const e=new Error('IDBRequest.result accessed while pending');e.name='InvalidStateError';throw e;}return value;}};pending++;
   const run=()=>setTimeout(()=>{if(!aborted)try{value=fn();r.readyState='done';r.onsuccess?.({target:r});}catch(e){r.error=tx.error=e;aborted=true;r.onerror?.({target:r});}
    pending--;if(!pending)finish();},0);
   if(active)run();else jobs.push(run);return r;}
  previous.then(()=>{data=Object.fromEntries(names.map(n=>[n,new Map([...rows[n]].map(([k,v])=>[k,clone(v)]))]));active=true;jobs.forEach(j=>j());if(!pending)finish();});
  return tx;
 }};
}
const date='2026-09-01';
const rule={id:'r',datum:date,start:'09:00',eind:'10:00',dossierId:'d',omschrijving:'Oud',code:null,uren:1,urenHand:false,soort:'werk',gewijzigd:1};
const dossier={id:'d',nummer:'123',naam:'Test',codes:[]};
const i7dos={id:'i7',naam:'i7',isI7:true,codes:[{code:'ADM',naam:'Administratie'}]};
const checks=[];
checks.push(['draft plus codewijziging behoudt beide velden',async()=>{
 const {context:c,setState}=evaluateCorePure();vm.runInContext(src.timer,c);
 const r={...rule,eind:null};setState({alle:[r],running:r,dossiers:[dossier]});
 const db=persistentDB({regels:[r],dossiers:[dossier],meta:{running:'r'}});c.HH.storage.indexedDB.use(db);
 await Promise.all([vm.runInContext('saveRegel',c)({...r,omschrijving:'Nieuw'}),c.koppelRegel(r,{code:'X'})]);
 const final=db.rows.regels.get('r');assertEq(final.omschrijving,'Nieuw','Omschrijving verloren');assertEq(final.code,'X','Code verloren');
}]);
checks.push(['dubbele aanvulling blijft maximaal acht uur',async()=>{
 const HH=evaluateDayRules();const db=persistentDB({regels:[rule],dossiers:[dossier,i7dos],meta:{dagEinde:{[date]:'17:00'},dagAudit:{}}});HH.storage.indexedDB.use(db);
 const input={date,isWorkday:true,dayEnds:{[date]:'17:00'},dayAudit:{},rules:[rule],dossiers:[dossier,i7dos],i7Dossier:i7dos,code:'ADM',currentTotal:1,nowMs:2,nowIso:date+'T17:00:00Z',bookingContext:{dossiers:[dossier,i7dos],roundingMode:'groep'}};
 await Promise.all([HH.services.dayRules.autoFillDay({...input,id:'a'}),HH.services.dayRules.autoFillDay({...input,id:'b'})]);
 const total=[...db.rows.regels.values()].reduce((s,r)=>s+(r.uren||0),0);assertEq(total,8,'Dubbele of ontbrekende aanvulling');
}]);
checks.push(['heropenen regel maakt dagstatus open',async()=>{
 const HH=evaluateDayRules();const db=persistentDB({regels:[rule],dossiers:[dossier],meta:{dagEinde:{[date]:'17:00'},dagAudit:{}}});HH.storage.indexedDB.use(db);
 const out=await HH.services.timer.reopenRule({currentTimer:null,readCurrentTimer:()=>null,rule,rules:[rule],dossiers:[dossier],dayEnds:{[date]:'17:00'},dayAudit:{},overbookings:[],today:date,nowTime:'11:00',nowMs:2,nowIso:date+'T11:00:00Z',confirmedWarnings:true});
 assert(out.ok,'Heropenen geweigerd '+out.error);assert(!(db.rows.meta.get('dagEinde')||{})[date],'Dag bleef afgesloten');
}]);
checks.push(['stale editor bewaart een latere omschrijving',async()=>{
 const HH=evaluateDayRules();const newer={...rule,omschrijving:'Nieuwe opgeslagen tekst',gewijzigd:3,revision:1};
 const db=persistentDB({regels:[newer],dossiers:[dossier],meta:{}});HH.storage.indexedDB.use(db);
 const out=await HH.services.dayRules.editRule({before:rule,rule:{...rule,eind:'11:00',uren:2},rules:[newer],dossiers:[dossier],overbookings:[],runningId:null,nowTime:'11:00',nowMs:4,nowIso:date+'T11:00:00Z',confirmedWarnings:true});
 assertEq(db.rows.regels.get('r').omschrijving,'Nieuwe opgeslagen tekst','Stale editor overschrijft later opgeslagen tekst');
 assert(out.ok,'Niet-conflicterende eindtijdwijziging moet slagen');assertEq(out.rule.eind,'11:00','Eindtijd niet aangepast');
}]);
checks.push(['verwijderen weigert achterhaalde revisie bij gelijke timestamp',async()=>{
 const HH=evaluateDayRules();const before={...rule,revision:1};const newer={...before,omschrijving:'Later',revision:2};
 const db=persistentDB({regels:[newer],dossiers:[dossier],meta:{}});HH.storage.indexedDB.use(db);
 const out=await HH.services.dayRules.deleteRule({rule:before,rules:[newer],dossiers:[dossier],overbookings:[],runningId:null,nowMs:4,nowIso:date+'T11:00:00Z'});
 assert(db.rows.regels.has('r'),'Nieuwere regel verwijderd');assert(!out.ok,'Verwijderen moet revisieconflict melden');
}]);
checks.push(['undo overschrijft geen latere mutatie',async()=>{
 const {context:c,setState}=evaluateCorePure();vm.runInContext(src.timer,c);c.HH.app={render(){}};
 const after={...rule,omschrijving:'Eerste wijziging',revision:1,gewijzigd:2};
 setState({alle:[after],dossiers:[dossier]});
 const db=persistentDB({regels:[after],dossiers:[dossier],meta:{}});c.HH.storage.indexedDB.use(db);
 c.undoData('omschrijving wijzigen',[rule],{weg:[],expected:[{id:'r',revision:1}]});
 const later={...after,omschrijving:'Latere wijziging',revision:2,gewijzigd:3};db.rows.regels.set('r',later);setState({alle:[later],dossiers:[dossier]});
 await c.undo();assertEq(db.rows.regels.get('r').omschrijving,'Latere wijziging','Undo heeft nieuwere tekst overschreven');
}]);
checks.push(['ongewijzigde undo blijft uitvoerbaar',async()=>{
 const {context:c,setState}=evaluateCorePure();vm.runInContext(src.timer,c);c.HH.app={render(){}};
 const after={...rule,omschrijving:'Eerste wijziging',revision:1,gewijzigd:2};
 setState({alle:[after],dossiers:[dossier]});const db=persistentDB({regels:[after],dossiers:[dossier],meta:{}});c.HH.storage.indexedDB.use(db);
 c.undoData('omschrijving wijzigen',[rule],{weg:[],expected:[{id:'r',revision:1}]});
 await c.undo();assertEq(db.rows.regels.get('r').omschrijving,'Oud','Veilige undo moet de oude tekst herstellen');
}]);
checks.push(['nieuwe taak slaagt tijdens een omschrijvingssave',async()=>{
 const {context:c,setState}=evaluateCorePure();vm.runInContext(src.timer,c);const r={...rule,eind:null};
 setState({alle:[r],running:r,dossiers:[dossier]});const db=persistentDB({regels:[r],dossiers:[dossier],meta:{running:'r'}});c.HH.storage.indexedDB.use(db);
 const save=vm.runInContext('saveRegel',c)({...r,omschrijving:'Nieuwe tekst'});
 const start=c.HH.services.timer.start({currentTimer:r,readCurrentTimer:()=>c.HH.state.read().running,rules:[r],dossiers:[dossier],date,time:'11:00',id:'nieuw',dossierId:'d',description:'Volgende taak',kind:'werk',nowMs:5,nowIso:date+'T11:00:00Z',waitForRules:vm.runInContext('rustig',c)});
 const [,out]=await Promise.all([save,start]);assert(out.ok,'Normale task switch gaf vals conflict '+out.error);
 assertEq(db.rows.regels.get('r').omschrijving,'Nieuwe tekst','Timer sluiten verloor net opgeslagen omschrijving');assertEq(db.rows.meta.get('running'),'nieuw','Nieuwe taak niet gestart');
}]);
checks.push(['afsluiten en aanvullen rollen samen terug en slagen samen',async()=>{
 const HH=evaluateDayRules(),r={...rule,eind:null},db=persistentDB({regels:[r],dossiers:[dossier,i7dos],meta:{running:'r',stack:[{dossierId:'d'}]}});HH.storage.indexedDB.use(db);
 const input={currentTimer:r,runningId:'r',closedRule:{...r,eind:'10:00',uren:1},rules:[r],dossiers:[dossier,i7dos],date,end:'10:00',dayEnds:{},dayAudit:{},stack:[{dossierId:'d'}],fill:true,isWorkday:true,i7Dossier:i7dos,code:'ADM',autoFillId:'aanvul',batchId:'batch',operationId:'close-one',nowMs:2,nowIso:date+'T10:00:00Z'};
 db.failNextWrite();let failed=false;try{const out=await HH.services.dayRules.closeDay(input);failed=!out.ok;}catch{failed=true;}
 assert(failed,'Injected failure must be reported');assertEq(db.rows.regels.get('r').eind,null,'Timer half afgesloten');assertEq(db.rows.meta.get('running'),'r','Pointer half gestopt');assert(!db.rows.meta.get('dagEinde')?.[date],'Dag half afgesloten');assert(!db.rows.regels.has('aanvul'),'Aanvulling bleef na abort');
 const out=await HH.services.dayRules.closeDay(input);assert(out.ok,'Retry failed '+out.error);
 assertEq([...db.rows.regels.values()].reduce((t,r)=>t+r.uren,0),8,'Afsluiten+aanvullen moet samen8uur opleveren');assertEq(db.writes,1,'Succes moet één write-transactie zijn');assertEq(db.rows.meta.get('running'),undefined,'Timerpointer bleef lopen');assertEq(db.rows.meta.get('dagEinde')[date],'10:00','Dagstatus niet gesloten');
}]);
checks.push(['toevoegen op gesloten dag heropent en trekt alleen vrije aanvulling in',async()=>{
 const HH=evaluateDayRules(),auto={...rule,id:'auto',uren:7,urenHand:true,autoAanvul:true,dossierId:'i7'};
 const db=persistentDB({regels:[rule,auto],dossiers:[dossier,i7dos],meta:{dagEinde:{[date]:'17:00'}}});HH.storage.indexedDB.use(db);
 const out=await HH.services.dayRules.addRule({rule:{...rule,id:'extra'},rules:[rule,auto],dossiers:[dossier,i7dos],nowMs:2,nowIso:date+'T17:10:00Z'});
 assert(out.ok,'Toevoegen mislukt');assert(!db.rows.meta.get('dagEinde')[date],'Dag bleef gesloten');assert(!db.rows.regels.has('auto'),'Vrije aanvulling bleef staan');assert(db.rows.regels.has('extra'),'Nieuwe regel ontbreekt');
}]);
checks.push(['heropenen bewaart geboekte automatische uren',async()=>{
 const HH=evaluateDayRules(),auto={...rule,id:'auto',uren:7,urenHand:true,autoAanvul:true,dossierId:'i7'};
 const db=persistentDB({regels:[rule,auto],dossiers:[dossier,i7dos],meta:{dagEinde:{[date]:'17:00'},geboekt:{[date]:['fp']}}});HH.storage.indexedDB.use(db);
 const out=await HH.services.dayRules.reopenDay({date,removeAutomatic:true,rules:[rule,auto],dossiers:[dossier,i7dos],dayEnds:{[date]:'17:00'},dayAudit:{},nowMs:2,nowIso:date+'T17:10:00Z'});
 assert(out.ok,'Heropenen mislukt');assert(db.rows.regels.has('auto'),'Geboekte aanvulling verwijderd');assert(!db.rows.meta.get('dagEinde')[date],'Dag bleef gesloten');
}]);
checks.push(['aanvulling volgt groepsgewijs Intapp-totaal',async()=>{
 const {context:c,setState}=evaluateCorePure();const a={...rule,eind:'09:01',uren:0.1},b={...a,id:'b',start:'10:00',eind:'10:01'};
 setState({alle:[a,b],dossiers:[dossier,i7dos]});const db=persistentDB({regels:[a,b],dossiers:[dossier,i7dos],meta:{dagEinde:{[date]:'17:00'}}});c.HH.storage.indexedDB.use(db);
 const totalForRules=vm.runInContext('simIntappTotaal',c);assertEq(totalForRules([a,b]),0.1,'Fixture moet gegroepeerd0.1 zijn');
 const out=await c.HH.services.dayRules.autoFillDay({date,isWorkday:true,dayEnds:{[date]:'17:00'},rules:[a,b],dossiers:[dossier,i7dos],i7Dossier:i7dos,code:'ADM',currentTotal:0.1,totalForRules,id:'fill',nowMs:2,nowIso:date+'T17:00:00Z'});
 assert(out.ok,'Aanvullen mislukt');assertEq(out.rule.uren,7.9,'Verkeerde afrondingsbasis voor aanvulling');
}]);
checks.push(['dossier koppelen behoudt actuele naam en telt gebruik atomair',async()=>{
 const {context:c,setState}=evaluateCorePure();vm.runInContext(src.timer,c);
 const old={...dossier,naam:'Oude naam',used:1,codes:[]},actual={...old,naam:'Nieuwe naam',used:5,revision:2};
 setState({alle:[rule],dossiers:[old]});const db=persistentDB({regels:[rule],dossiers:[actual],meta:{}});c.HH.storage.indexedDB.use(db);
 const out=await c.koppelRegel(rule,{dossierId:old.id,telUsed:true});
 assert(out,'Koppelen mislukt');const saved=db.rows.dossiers.get(old.id);
 assertEq(saved.naam,'Nieuwe naam','Koppelen overschreef latere dossiernaam');assertEq(saved.used,6,'Gebruik niet vanuit opslag geteld');assertEq(saved.revision,3,'Dossierrevisie ontbreekt');
}]);
checks.push(['dageditor bewaart nieuwe dossiernaam bij toevoegen werkcode',async()=>{
 const HH=evaluateDayRules(),before={...dossier,naam:'Oud',codes:[]},actual={...before,naam:'Nieuw',revision:2};
 const db=persistentDB({regels:[rule],dossiers:[actual],meta:{}});HH.storage.indexedDB.use(db);
 const out=await HH.services.dayRules.editRule({before:rule,rule:{...rule,code:'X'},rules:[rule],dossiers:[before],
 dossierWrites:[{...before,codes:[{code:'X',naam:'X'}]}],overbookings:[],nowMs:3,nowTime:'11:00',nowIso:date+'T11:00:00Z',confirmedWarnings:true});
 assert(out.ok,'Bewerken mislukt '+out.error);const saved=db.rows.dossiers.get(before.id);
 assertEq(saved.naam,'Nieuw','Dageditor overschreef dossiernaam');assertEq(saved.codes[0].code,'X','Werkcode niet toegevoegd');assertEq(saved.revision,3,'Dossierrevisie ontbreekt');
}]);
checks.push(['herhaalde actie-ID schrijft niet opnieuw en vraagt actuele reload',async()=>{
 const HH=evaluateDayRules(),db=persistentDB({regels:[rule],dossiers:[dossier,i7dos],meta:{}});HH.storage.indexedDB.use(db);
 const input={date,end:'17:00',fill:true,isWorkday:true,i7Dossier:i7dos,code:'ADM',autoFillId:'fill',batchId:'b',operationId:'once',nowMs:2,nowIso:date+'T17:00:00Z'};
 const first=await HH.services.dayRules.closeDay(input);assert(first.ok,'Eerste afsluiting mislukt');
 const saved=db.rows.regels.get('r');db.rows.regels.set('r',{...saved,omschrijving:'Later',revision:5});
 const again=await HH.services.dayRules.closeDay(input);assert(again.ok&&again.replayed&&again.reload,'Herhaling moet actuele reload vragen');
 assertEq(db.rows.regels.get('r').omschrijving,'Later','Herhaling overschreef latere tekst');
 assertEq([...db.rows.regels.values()].filter(r=>r.autoAanvul).length,1,'Herhaalde aanvulling');
 assertEq(db.rows.meta.get('dagAudit')[date].events.length,2,'Audit opnieuw geschreven');
}]);
for(const [name,fn] of checks)try{await fn();console.log('PASS '+name);}catch(e){failures++;console.error('FAIL '+name+' — '+e.message);}
process.exitCode=failures?1:0;
