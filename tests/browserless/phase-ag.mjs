#!/usr/bin/env node
/* Phase AG: (1) geen werkdatum meer in de omschrijving van een genummerde DVN,
   (2) geen spookregels meer na een onafgemaakte Nieuwe taak, (3) boekregels van een
   dossier via hetzelfde boekvenster als de Dag-tab en een ingedeelde werkvoorraad.
   Uitgevoerd tegen de echte domeinlaag, services, core.js, booking.js, de Beheer- en
   Dag-adapters en een transactionele geheugen-IndexedDB. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const assert=(c,m)=>{if(!c)throw new Error(m);};
const equal=(a,e,m)=>assert(a===e,`${m}\nverwacht: ${JSON.stringify(e)}\ngekregen: ${JSON.stringify(a)}`);
const date='2026-09-04',date2='2026-09-08';
const i7={id:'i7',nummer:'I700000000',naam:'Indirecte uren',isI7:true,revision:1};
const gewoon={id:'g',nummer:'304111222',naam:'Levering Kerkstraat',revision:1,codes:[]};
const dvnOpen={id:'v',nummer:null,naam:'Bouwfonds Zuid',voorlopig:true,dvn:true,revision:1};
const dvnNr={id:'n',nummer:'304999888',naam:'Bank Project',voorlopig:false,dvn:true,dvnResolvedNr:'304999888',revision:1,codes:[]};
const codes=[{code:'I7-701',naam:'Praktijkorganisatie/administratie'},{code:'I7-704',naam:'Commercieel'}];
const regel=(id,o)=>Object.assign({id,datum:date,start:'09:00',eind:'10:00',dossierId:'n',code:null,
  omschrijving:'review docs',uren:1,urenHand:false,soort:'werk',revision:1,gewijzigd:1},o||{});

function memoryDB(seed={}){
  const names=['regels','dossiers','meta','overboekingen','codes'],rows={};
  for(const name of names)rows[name]=new Map(name==='meta'?Object.entries(seed.meta||{}):
    (name==='codes'?(seed.codes||codes):(seed[name]||[])).map(v=>[v.id||v.code,clone(v)]));
  let queue=Promise.resolve(),writes=0;
  return{rows,get writes(){return writes;},transaction(requested,mode){
    const stores=Array.isArray(requested)?requested:[requested];let release;
    const previous=queue;queue=new Promise(done=>{release=done;});
    let active=false,pending=0,aborted=false,data,finishing=false;const jobs=[];
    const tx={error:null,abort(){aborted=true;tx.error=new Error('aborted');},objectStore(name){return{
      get:key=>request(()=>clone(data[name].get(key))),getAll:()=>request(()=>[...data[name].values()].map(clone)),
      put:(value,key)=>request(()=>{data[name].set(key===undefined?(value.id||value.code):key,clone(value));}),
      delete:key=>request(()=>data[name].delete(key)),clear:()=>request(()=>data[name].clear())};}};
    function finish(){if(finishing||pending)return;finishing=true;setTimeout(()=>{if(aborted)tx.onabort?.();else{
      if(mode==='readwrite'){for(const name of stores)rows[name]=data[name];writes++;}tx.oncomplete?.();}release();},0);}
    function request(action){let value;const req={error:null,readyState:'pending',get result(){
      if(this.readyState!=='done')throw new Error('premature IDB result');return value;}};pending++;
      const run=()=>setTimeout(()=>{if(!aborted)try{value=action();req.readyState='done';req.onsuccess?.({target:req});}
        catch(error){req.error=tx.error=error;aborted=true;req.onerror?.({target:req});}pending--;finish();},0);
      if(active)run();else jobs.push(run);return req;}
    previous.then(()=>{data=Object.fromEntries(stores.map(name=>[name,new Map([...rows[name]].map(([k,v])=>[k,clone(v)]))]));
      active=true;jobs.forEach(run=>run());finish();});return tx;
  }};
}
function dom(){
  const elements=new Map();
  const make=id=>({id,tagName:'DIV',dataset:{},value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',style:{},
    listeners:{},classList:{set:new Set(),add(x){this.set.add(x);},remove(x){this.set.delete(x);},
      toggle(x,on){(on===undefined?!this.set.has(x):on)?this.set.add(x):this.set.delete(x);},contains(x){return this.set.has(x);}},
    addEventListener(t,f){(this.listeners[t]||(this.listeners[t]=[])).push(f);},setAttribute(k,v){this['attr-'+k]=String(v);},
    focus(){},querySelector(){return null;},querySelectorAll(){return[];},contains(){return false;},closest(){return null;},
    async fire(t,target){for(const f of (this.listeners[t]||[]))await f({target,preventDefault(){}});}});
  const document={activeElement:null,body:{dataset:{},classList:{toggle(){}}},
    getElementById(id){if(!elements.has(id))elements.set(id,make(id));return elements.get(id);},
    querySelectorAll(){return[];},querySelector(){return null;},addEventListener(){},removeEventListener(){},
    hasFocus:()=>true,createElement:()=>make('x')};
  return{document,el:id=>document.getElementById(id)};
}
const LAGEN=['js/hh.js','js/domain/time.js','js/domain/booking.js','js/domain/dvn.js','js/domain/overbooking.js',
  'js/storage/indexeddb.js','js/services/admin.js','js/services/day-rules.js','js/services/timer.js','js/services/settings.js',
  'js/state.js','js/app-runtime.js','js/core.js','js/timer.js','js/ui/modal.js'];
/* Volledige runtime: lagen + de gevraagde UI-adapters, met de state gevuld uit de seed. */
function runtime(seed,ui=[],klok={}){
  const d=dom(),toasts=[],alerts=[];
  const RealDate=Date,vast=klok.nu?new RealDate(klok.nu):null;
  const FakeDate=vast?class extends RealDate{constructor(...a){if(a.length)super(...a);else super(vast.getTime());}
    static now(){return vast.getTime();}}:RealDate;
  const c={console,setTimeout,clearTimeout,queueMicrotask,Date:FakeDate,document:d.document,
    window:{addEventListener(){},innerWidth:1200,scrollTo(){}},navigator:{clipboard:{writeText:async()=>{}}},
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    indexedDB:{open(){return{};}},confirm:()=>true,alert:m=>alerts.push(m)};
  vm.createContext(c);
  for(const f of LAGEN)vm.runInContext(read(f),c,{filename:f});
  const db=memoryDB(seed);c.HH.storage.indexedDB.use(db);
  vm.runInContext('toast=(m)=>{globalThis.__toasts.push(m);};herlaad=async()=>{};announce=()=>{};',
    Object.assign(c,{__toasts:toasts}));
  for(const f of ui)vm.runInContext(read(f),c,{filename:f});
  const run=code=>vm.runInContext(code,c);
  c.HH.state.commit({dossiers:clone(seed.dossiers||[]),rules:clone(seed.regels||[]),codes:clone(seed.codes||codes),
    overbookings:clone(seed.overboekingen||[]),viewDate:seed.viewDate||date,
    bookingHistory:c.HH.domain.booking.normalizeHistory(seed.meta&&seed.meta.bookingHistory),
    booked:clone(seed.meta&&seed.meta.geboekt)||{},
    running:seed.meta&&seed.meta.running?clone((seed.regels||[]).find(r=>r.id===seed.meta.running)):null});
  return{c,HH:c.HH,db,el:d.el,toasts,alerts,run};
}
const BOEK_UI=['js/ui/day-status-view.js','js/ui/day-view.js','js/ui/overbooking-view.js','js/ui/overbooking-controller.js',
  'js/ui/dvn-view.js','js/ui/manage-view.js','js/ui/manage-controller.js','js/booking.js'];
/* Timerinvoer zoals timer.js die bouwt, maar met een expliciete klok. */
function timerInput(h,time,extra){
  const s=h.HH.state.read(),nowMs=Date.parse(date+'T'+time+':00Z');
  return Object.assign({currentTimer:s.running,readCurrentTimer:()=>h.HH.state.read().running,rules:s.rules,
    dossiers:s.dossiers,stack:s.stack,dayEnds:s.dayEnds,dayAudit:s.dayAudit,codeUsage:s.codeUsage,
    date,time,nowMs,nowIso:new Date(nowMs).toISOString(),id:'nieuw-'+time,dossierId:null,code:null,
    description:'',kind:'werk'},extra||{});
}
const leeg=start=>regel('leeg',{start,eind:null,dossierId:null,omschrijving:'',uren:0.1});
const seedLopend=(start,extra)=>({dossiers:[i7,gewoon,dvnOpen],regels:[regel('eerder',{dossierId:'g',start:'08:00',eind:start}),
  Object.assign(leeg(start),extra||{})],meta:{running:'leeg'}});
const alleRegels=h=>[...h.db.rows.regels.values()].sort((a,b)=>a.start.localeCompare(b.start));

const tests=[];const test=(name,fn)=>tests.push([name,fn]);

/* ---------- 1. omschrijving van een genummerde DVN ---------- */
test('genummerde DVN: de door Patch AB bewaarde werkdatum staat niet meer in de boekregel',()=>{
  const h=runtime({dossiers:[i7,dvnNr],regels:[regel('a',{omschrijving:'04.09.2026 review docs'})]});
  const row=h.run('sumVan(HH.state.read().rules)')[0];
  equal(row.oms,'review docs','werkdatum staat nog in de omschrijving');
  equal(row.nummer,'304999888','boekregel staat niet op het echte dossiernummer');
});
test('nummer toekennen: datum en DVN-naam verdwijnen, ook uit de terugkeerstapel',async()=>{
  const r=regel('a',{dossierId:'v',code:'I7-704',omschrijving:'04.09.2026 · Bouwfonds Zuid · concept akte'});
  const h=runtime({dossiers:[i7,dvnOpen],regels:[r],meta:{stack:[{dossierId:'v',datum:date,omschrijving:r.omschrijving}]}});
  const uit=await h.HH.services.admin.assignDvnNumber({dossier:dvnOpen,number:'304555666',name:'Bouwfonds Zuid',
    dossiers:[i7,dvnOpen],rules:[r],nowMs:5,nowIso:date+'T12:00:00Z'});
  assert(uit.ok,'toekennen mislukt: '+uit.error);
  equal(h.db.rows.regels.get('a').omschrijving,'concept akte','opgeslagen regel houdt datum of DVN-naam');
  equal(h.db.rows.meta.get('stack')[0].omschrijving,'concept akte','stapel houdt datum of DVN-naam');
  h.HH.state.commit({dossiers:[i7,uit.dossier],rules:uit.rules});
  equal(h.run('sumVan(HH.state.read().rules)')[0].oms,'concept akte','boekregel houdt datum of DVN-naam');
});
test('bewaker: DVN zonder nummer houdt datum · naam · tekst (nodig bij i7)',()=>{
  const h=runtime({dossiers:[i7,dvnOpen],regels:[regel('a',{dossierId:'v',code:'I7-704',
    omschrijving:'04.09.2026 · Bouwfonds Zuid · concept akte'})]});
  equal(h.run('sumVan(HH.state.read().rules)')[0].oms,'04.09.2026 · Bouwfonds Zuid · concept akte','i7-voorvoegsel verdwenen');
});
test('bewaker: een al mét datum bevestigde boeking blijft geboekt en wordt geen correctie',()=>{
  const r=regel('a',{omschrijving:'04.09.2026 review docs'});
  const snapshot={date,targetNumber:'304999888',targetName:'Bank Project',code:'',description:'04.09.2026 review docs',
    hours:1,roundingMode:'groep',sourceIds:['a'],sources:[]};
  const h=runtime({dossiers:[i7,dvnNr],regels:[r],meta:{bookingHistory:{version:1,
    receipts:[{id:'p1',channel:'day',snapshot,confirmedAt:'2026-09-05T10:00:00Z'}],resolutions:[]}}},BOEK_UI);
  const row=h.run('sumVan(HH.state.read().rules)')[0];
  equal(row.oms,'04.09.2026 review docs','bevestigde tekst is stil gewijzigd');
  equal(h.run('isGeboektOp(sumVan(HH.state.read().rules)[0],"'+date+'")'),true,'bevestigde boeking niet meer herkend');
  equal(h.run('bookingCorrectionsFor(alleBookingSnapshots()).length'),0,'bevestigde boeking werd een correctietaak');
});
test('na het terugdraaien van zo\'n bevestiging geldt de nieuwe tekst zonder datum',()=>{
  const r=regel('a',{omschrijving:'04.09.2026 review docs'});
  const snapshot={date,targetNumber:'304999888',code:'',description:'04.09.2026 review docs',hours:1,sourceIds:['a']};
  const h=runtime({dossiers:[i7,dvnNr],regels:[r],meta:{bookingHistory:{version:1,
    receipts:[{id:'p1',channel:'day',snapshot,confirmedAt:'2026-09-05T10:00:00Z'}],
    resolutions:[{id:'x',receiptId:'p1',type:'reopened',resolvedAt:'2026-09-06T10:00:00Z'}]}}});
  equal(h.run('sumVan(HH.state.read().rules)')[0].oms,'review docs','heropende boeking houdt de datum');
});
test('bewaker: geparkeerde regel met datum blijft "wacht op dossierboeking"',()=>{
  const r=regel('a',{omschrijving:'04.09.2026 review docs'});
  const h0=runtime({dossiers:[i7,dvnNr],regels:[r]});
  /* fingerprint zoals de oude code hem bij het parkeren vastlegde: mét datum */
  const fp=h0.run('sumVan(HH.state.read().rules)')[0].fp.replace('|review docs|','|04.09.2026 review docs|');
  const over={id:'o1',status:'waiting',revision:1,targetDossierId:'n',targetNumberSnapshot:'304999888',
    targetNameSnapshot:'Bank Project',sourceDate:date,sourceRuleIds:['a'],sourceFingerprint:fp,sourceFingerprints:[fp],
    sourceSnapshot:[{id:'a',gewijzigd:1}],targetLines:[{werkcode:'',omschrijving:'04.09.2026 review docs',uren:1}],
    description:'04.09.2026 review docs',hours:1};
  const h=runtime({dossiers:[i7,dvnNr],regels:[r],overboekingen:[over]});
  equal(h.run('sumVan(HH.state.read().rules)')[0].oms,'04.09.2026 review docs','geparkeerde tekst is stil gewijzigd');
  equal(h.run('overboekingState(HH.state.read().overbookings[0])'),'waiting','parkeerrecord viel terug naar controleren');
});
test('Dag-tabel en bewerksheet tonen dezelfde tekst als de boekregel; andere dossiers blijven letterlijk',()=>{
  const h=runtime({dossiers:[i7,gewoon,dvnNr,dvnOpen],regels:[regel('a',{omschrijving:'04.09.2026 review docs'}),
    regel('g1',{dossierId:'g',omschrijving:'04.09.2026 afspraak notaris'}),
    regel('v1',{dossierId:'v',code:'I7-704',omschrijving:'04.09.2026 · Bouwfonds Zuid · bellen'})]});
  const toon=id=>h.run('regelToonOmschrijving(HH.state.read().rules.find(r=>r.id==="'+id+'"))');
  equal(toon('a'),'review docs','genummerde DVN toont nog de werkdatum');
  equal(toon('g1'),'04.09.2026 afspraak notaris','zelf getypte datum op een gewoon dossier is weggehaald');
  equal(toon('v1'),'04.09.2026 · Bouwfonds Zuid · bellen','DVN zonder nummer verliest zijn voorvoegsel');
});
test('dvn.js levert de helpers die core.js en de bewerksheet aanroepen',()=>{
  const h=runtime({dossiers:[i7,dvnOpen],regels:[]});
  equal(h.run('dvnNaamSchoon("  Bank · Project \\n Zuid ")'),'Bank Project Zuid','DVN-naam wordt niet opgeschoond');
  equal(h.run('dvnOoitGenummerd({dvnResolvedNr:"1"})'),true,'ooit genummerde DVN niet herkend');
  equal(h.run('dvnOoitGenummerd({naam:"x",voorlopig:true})'),false,'nummerloze DVN als genummerd gezien');
});

/* ---------- 2. spookregels ---------- */
test('N direct na een onafgemaakte N: dezelfde regel, geen tweede lege regel',async()=>{
  const h=runtime(seedLopend('10:00'));
  const uit=await h.HH.services.timer.start(timerInput(h,'10:03'));
  assert(uit.ok,'start mislukt: '+uit.error);
  equal(uit.rule.id,'leeg','er is een nieuwe regel gestart in plaats van de lege te hergebruiken');
  equal(alleRegels(h).length,2,'er staat een extra regel in de database');
  equal(h.db.rows.meta.get('running'),'leeg','timerpointer wijst niet naar de overgenomen regel');
});
test('taak kiezen direct na een onafgemaakte N: lege regel wordt die taak, starttijd blijft',async()=>{
  const h=runtime(seedLopend('10:00'));
  const uit=await h.HH.services.timer.switchTask(timerInput(h,'10:04',{dossierId:'g',description:'bespreking'}));
  assert(uit.ok,'wissel mislukt: '+uit.error);
  const regels=alleRegels(h);
  equal(regels.length,2,'de lege regel is als spookregel blijven staan');
  equal(regels.filter(r=>!r.dossierId&&r.soort==='werk').length,0,'er staat nog een werkregel zonder dossier');
  const nu=h.db.rows.regels.get('leeg');
  equal(nu.start,'10:00','starttijd van de tijdknip is verloren');equal(nu.dossierId,'g','dossier niet overgenomen');
  equal(nu.omschrijving,'bespreking','omschrijving niet overgenomen');equal(nu.eind,null,'overgenomen regel loopt niet meer');
  equal(uit.closedRule,null,'de lege regel is toch afgesloten');
});
test('pauze direct na een onafgemaakte N: de lege regel wordt de pauze',async()=>{
  const h=runtime(seedLopend('10:00'));
  const uit=await h.HH.services.timer.pause(timerInput(h,'10:02',{kind:'pauze',description:'Pauze',stackAfter:[]}));
  assert(uit.ok,'pauze mislukt: '+uit.error);
  equal(alleRegels(h).length,2,'lege regel bleef naast de pauze staan');
  equal(h.db.rows.regels.get('leeg').soort,'pauze','lege regel is geen pauze geworden');
});
test('bewaker: een lege regel van meer dan 6 minuten is echte tijd en blijft staan',async()=>{
  const h=runtime(seedLopend('10:00'));
  const uit=await h.HH.services.timer.switchTask(timerInput(h,'10:07',{dossierId:'g',description:'bespreking'}));
  assert(uit.ok,'wissel mislukt: '+uit.error);
  const oud=h.db.rows.regels.get('leeg');
  equal(oud.eind,'10:07','nog toe te wijzen tijd is verdwenen');equal(oud.dossierId,null,'tijd is stil aan een dossier toegewezen');
  equal(alleRegels(h).length,3,'nieuwe taak is niet als eigen regel gestart');
});
test('bewaker: regel mét dossier of met getypte omschrijving wordt nooit overgenomen',async()=>{
  const h=runtime(seedLopend('10:00',{dossierId:'g'}));
  const uit=await h.HH.services.timer.switchTask(timerInput(h,'10:02',{dossierId:'i7',code:'I7-701',description:'admin'}));
  assert(uit.ok,'wissel mislukt: '+uit.error);
  equal(h.db.rows.regels.get('leeg').dossierId,'g','regel met dossier is overschreven');equal(alleRegels(h).length,3,'geen eigen regel');
  const h2=runtime(seedLopend('10:00'));
  const uit2=await h2.HH.services.timer.switchTask(timerInput(h2,'10:02',{dossierId:'g',description:'x',pendingDescription:'half getypt'}));
  assert(uit2.ok,'wissel mislukt: '+uit2.error);
  equal(h2.db.rows.regels.get('leeg').omschrijving,'half getypt','getypte tekst is weggegooid');equal(alleRegels(h2).length,3,'geen eigen regel');
});
test('dag afsluiten direct na een onafgemaakte N: geen lege regel aan het eind van de dag',async()=>{
  const h=runtime(seedLopend('17:00'));
  const s=h.HH.state.read(),dicht=Object.assign({},s.running,{eind:'17:02',uren:0.1});
  const uit=await h.HH.services.timer.closeDay({currentTimer:s.running,readCurrentTimer:()=>h.HH.state.read().running,
    date,end:'17:02',closedRule:dicht,fill:false,isWorkday:true,rules:s.rules,dossiers:s.dossiers,overbookings:[],
    dayEnds:{},dayAudit:{},stack:[],bookingContext:{runningId:'leeg',today:date,nowHM:'17:02'},nowMs:9,nowIso:date+'T17:02:00Z'});
  assert(uit.ok,'afsluiten mislukt: '+uit.error);
  equal(h.db.rows.regels.has('leeg'),false,'lege regel staat nog in de database');
  equal(h.db.rows.meta.get('running'),undefined,'timerpointer is niet gewist');
  equal(h.db.rows.meta.get('dagEinde')[date],'17:02','dag is niet afgesloten');
  equal(uit.droppedRule.id,'leeg','service meldt de vervallen regel niet');
});
test('lege regel verwijderen kan ook op een dag met al geboekte regels; gevulde regel blijft beschermd',async()=>{
  const seed={dossiers:[i7,gewoon],regels:[regel('vol',{dossierId:'g'}),regel('spook',{start:'10:51',eind:'10:52',dossierId:null,omschrijving:'',uren:0.1})],
    meta:{geboekt:{[date]:['een-fingerprint']}}};
  const h=runtime(seed),S=h.HH.services.dayRules,basis={rules:seed.regels,dossiers:seed.dossiers,overbookings:[],nowMs:3,nowIso:date+'T12:00:00Z'};
  const weg=await S.deleteRule(Object.assign({rule:seed.regels[1],isBooked:false},basis));
  assert(weg.ok,'lege regel kon niet weg: '+weg.error);equal(h.db.rows.regels.has('spook'),false,'lege regel staat er nog');
  const vol=await S.deleteRule(Object.assign({rule:seed.regels[0],isBooked:false},basis));
  equal(vol.error,'booked_rule','gevulde regel op een geboekte dag was verwijderbaar');
});
test('Dag: knop ruimt precies de lege regels op en raakt gevulde regels niet',async()=>{
  const seed={dossiers:[i7,gewoon],regels:[regel('vol',{dossierId:'g'}),
    regel('spook1',{start:'10:51',eind:'10:52',dossierId:null,omschrijving:'',uren:0.1}),
    regel('spook2',{start:'11:10',eind:'11:11',dossierId:null,omschrijving:'',uren:0.1}),
    regel('zonderoms',{start:'12:00',eind:'12:30',dossierId:'g',omschrijving:'',uren:0.5})]};
  const h=runtime(seed,['js/ui/day-status-view.js','js/ui/day-view.js']);
  vm.runInContext('bouwDag=()=>{};boekStat=()=>{};renderRecent=()=>{};renderTot=()=>{};pasMutatieUndoToe=()=>{};',h.c);
  h.HH.app={render(){}};
  vm.runInContext(read('js/ui/day-controller.js'),h.c,{filename:'day-controller.js'});
  equal(h.run('legeRegels("'+date+'").map(r=>r.id).join()'),'spook1,spook2','verkeerde regels als leeg aangemerkt');
  h.run('bouwSum()');assert(h.el('d-probs').innerHTML.includes('data-leeg-opruimen'),'opruimknop ontbreekt bij de blokkades');
  await h.run('ruimLegeRegelsOp()');
  equal([...h.db.rows.regels.keys()].sort().join(),'vol,zonderoms','opruimen verwijderde de verkeerde regels');
  equal(h.run('valideerBoekDag(HH.state.selectors.day("'+date+'")).filter(x=>/geen dossier/.test(x.tekst)).length'),0,'blokkade "geen dossier" staat er nog');
});
test('parkeerlijst bewaart geen lege regel om naar terug te keren',()=>{
  const h=runtime(seedLopend('10:00'));
  equal(h.run('parkeerLijst().length'),0,'lege regel op de terugkeerstapel gezet');
  h.HH.state.commit({running:Object.assign({},h.HH.state.read().running,{dossierId:'g'})});
  equal(h.run('parkeerLijst().length'),1,'taak met dossier wordt niet meer geparkeerd');
});

/* ---------- 3. boekvenster per dossier en werkvoorraad ---------- */
const boekSeed=()=>({dossiers:[i7,gewoon,dvnNr,dvnOpen],regels:[
  regel('a',{omschrijving:'review docs'}),
  regel('b',{datum:date2,start:'13:00',eind:'14:30',uren:1.5,omschrijving:'concept akte'}),
  regel('c',{datum:date2,start:'15:00',eind:'16:00',dossierId:'g',omschrijving:'ander dossier'}),
  regel('d',{datum:date2,start:'16:00',eind:'16:30',uren:0.5,dossierId:'v',code:'I7-704',omschrijving:'08.09.2026 · Bouwfonds Zuid · bellen'})]});
test('boekvenster per dossier: alle werkdagen van de DVN, niets van andere dossiers, met werkdatum',()=>{
  const h=runtime(boekSeed(),BOEK_UI);
  assert(h.run('openBoekDossier({dossierIds:["n"],titel:"304999888 · Bank Project"})'),'venster opende niet');
  equal(h.run('boek.rows.map(r=>r.datum+":"+r.oms).join("|")'),date+':review docs|'+date2+':concept akte','verkeerde regels of volgorde');
  assert(h.el('bk-titel').textContent.includes('304999888 · Bank Project'),'titel noemt het dossier niet');
  assert(h.el('bk-kaart').innerHTML.includes('04-09-2026'),'werkdatum van de eerste regel staat niet op de kaart');
});
test('boekvenster per dossier: Enter boekt op de eigen werkdatum en eindigt op klaar',async()=>{
  const h=runtime(boekSeed(),BOEK_UI);
  h.run('openBoekDossier({dossierIds:["n"],titel:"t"})');
  await h.el('bk-done').onclick();
  let hist=h.db.rows.meta.get('bookingHistory');
  equal(hist.receipts.length,1,'eerste regel niet bevestigd');equal(hist.receipts[0].snapshot.date,date,'bevestigd op de verkeerde werkdatum');
  equal(hist.receipts[0].snapshot.targetNumber,'304999888','bevestigd op het verkeerde dossiernummer');
  equal(h.run('boek.i'),1,'venster ging niet door naar de volgende regel');
  assert(h.el('bk-kaart').innerHTML.includes('08-09-2026'),'werkdatum van de tweede regel staat niet op de kaart');
  await h.el('bk-done').onclick();
  hist=h.db.rows.meta.get('bookingHistory');
  equal(hist.receipts.length,2,'tweede regel niet bevestigd');equal(hist.receipts[1].snapshot.date,date2,'tweede regel op verkeerde datum');
  equal(h.run('boek.completion'),true,'geen afrondscherm na de laatste regel');
  equal(h.run('dvnIntappState(dosOf("n"))'),'posted','DVN is na het boekvenster niet afgehandeld');
  equal(h.run('sumVan(HH.state.selectors.day("'+date2+'")).filter(r=>isGeboektOp(r,"'+date2+'")).length'),1,'Dag-tab ziet dezelfde bevestiging niet');
});
test('boekvenster per dossier weigert een regel met een blokkerende fout, met datum in de melding',()=>{
  const seed=boekSeed();seed.regels[1].omschrijving='';
  const h=runtime(seed,BOEK_UI);
  equal(h.run('openBoekDossier({dossierIds:["n"],titel:"t"})'),false,'venster opende ondanks lege omschrijving');
  assert(h.alerts.length===1&&/08-09-2026/.test(h.alerts[0])&&/lege omschrijving/.test(h.alerts[0]),'melding noemt datum en oorzaak niet: '+h.alerts[0]);
});
test('werkvoorraad: ingedeeld naar soort actie, met uren en werkdatums, en filter per soort',()=>{
  const h=runtime(boekSeed(),BOEK_UI);
  h.run('renderBeheerWerk()');
  const html=h.el('manage-worklist').innerHTML;
  assert(html.indexOf('Nu te boeken in Intapp')>=0&&html.indexOf('Wacht op dossiernummer')>html.indexOf('Nu te boeken in Intapp'),'indeling of volgorde klopt niet');
  assert(html.includes('Te boeken: 2 boekregels · 2,5 u'),'uren/aantal te boeken ontbreekt: '+html.replace(/<[^>]+>/g,' ').slice(0,400));
  assert(html.includes('Wacht op nummer: 1 boekregel · 0,5 u'),'uren van de DVN zonder nummer ontbreken');
  assert(html.includes('data-manage-book="n"'),'knop Boeken in Intapp ontbreekt bij het boekbare dossier');
  assert(h.el('manage-count').textContent.includes('te boeken 2,5 u'),'totaalregel mist de te boeken uren');
  h.run('beheerUi.filter="number";renderBeheerWerk()');
  const gefilterd=h.el('manage-worklist').innerHTML;
  assert(gefilterd.includes('Bouwfonds Zuid')&&!gefilterd.includes('Bank Project'),'filter "wacht op nummer" toont de verkeerde dossiers');
});
test('Beheer-knop opent het boekvenster voor uitsluitend de DVN-regels van dat dossier',()=>{
  const h=runtime(boekSeed(),BOEK_UI);
  h.run('renderBeheerWerk()');
  equal(h.run('openBeheerBoekvenster("n")'),true,'boekvenster opende niet vanuit Beheer');
  equal(h.run('boek.scope.soort+":"+boek.rows.length'),'dossier:2','verkeerd bereik');
});
test('bewaker: Dag-boekvenster is ongewijzigd: één dag, geen werkdatumregel op de kaart',()=>{
  const h=runtime(Object.assign(boekSeed(),{viewDate:date2}),BOEK_UI);
  h.run('controleer=()=>[];sumRows=()=>sumVan(HH.state.selectors.day(HH.state.read().viewDate));openBoek()');
  equal(h.run('!!boek.scope'),false,'dagvenster heeft een dossierbereik');
  equal(h.run('boek.rows.length'),3,'dagvenster toont niet alle regels van de dag');
  assert(!h.el('bk-kaart').innerHTML.includes('Werkdatum in Intapp'),'dagvenster toont de dossier-werkdatumregel');
});

let geslaagd=0;const mislukt=[];
for(const [name,fn] of tests){
  try{await fn();geslaagd++;console.log('PASS '+name);}
  catch(error){mislukt.push(name);console.error('FAIL '+name+'\n  '+String(error&&error.message||error).replace(/\n/g,'\n  '));}
}
console.log(`${geslaagd}/${tests.length} Phase AG checks passed for ${root}`);
if(mislukt.length)process.exitCode=1;
