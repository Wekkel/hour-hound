#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(process.argv[2]||join(here,'../..'));
const read=file=>readFileSync(join(root,file),'utf8');
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const equal=(actual,expected,message)=>assert(actual===expected,`${message}\nexpected: ${expected}\nactual: ${actual}`);

function element(){
  const listeners={};
  return{listeners,hidden:false,value:'',innerHTML:'',textContent:'',dataset:{},classList:{contains:()=>false},
    addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn);},setAttribute(){},
    async fire(type,target){for(const fn of listeners[type]||[])await fn({target,preventDefault(){}});}};
}
function uiContext(){
  const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const state={tab:'beheer',rules:[],dossiers:[],overbookings:[],templates:[],codes:[],
    booked:{},roundingMode:'groep',bookingHistory:{version:1,receipts:[],resolutions:[],legacyOrphans:[]}};
  const c={console,setTimeout,clearTimeout,queueMicrotask,Date,Math,JSON,Map,Set,
    window:{scrollY:0,scrollTo(){}},navigator:{clipboard:{writeText:async()=>{}}},confirm:()=>true,
    document:{getElementById:get,querySelectorAll:()=>[],querySelector:()=>element(),addEventListener(){}},$:get,
    HH:{ui:{},services:{admin:{},settings:{save:async()=>{}}},app:{render(){},showTab(){}},state:{read:()=>state,
      commit(delta){Object.assign(state,clone(delta));},upsert(){},remove(){},selectors:{overbookings:()=>[],dvnRules:()=>[]}}},
    esc:String,dmy:String,uu:String,uid:()=>`id-${Math.random()}`,today:()=> '2026-09-22',nowHM:()=> '12:00',
    toast(){},announce(){},boekStat(){},L(){},kopieer:async()=>{},meldAdminFout:()=>false,
    mergeById:(old,updates)=>old.map(x=>updates.find(y=>y.id===x.id)||x).concat(updates.filter(y=>!old.some(x=>x.id===y.id))),
    bookingSemanticKey:x=>JSON.stringify(x),bookingCorrectionsFor:()=>[],alleBookingSnapshots:()=>[],
    overboekingOpen:()=>true,bronIdsVan:o=>o.sourceRuleIds||[],overboekingState:()=> 'waiting',
    overboekingLijnen:o=>o.targetLines||[],overboekingHuidig:o=>({lijnen:o.targetLines||[]}),overboekingWijzigingen:()=>[],
    isDvn:d=>!!d?.dvn,dvnDefinitiefI7:()=>false,dvnIntappState:()=> 'posted',dvnResolvedNummer:d=>d?.nummer,
    dvnRegels:()=>[],dvnBoekSnapshots:()=>[],dosOf:id=>state.dossiers.find(d=>d.id===id),
    intappDossierInfo:d=>({nummer:d?.nummer||''}),sumVanData:()=>[],bookingSnapshotVan:x=>x,
    valideerBoekData:()=>[],rustig:async()=>{},sumVan:()=>[],urenOf:()=>1,
    kenNummerToe:async()=>{},verversOverboeking:async()=>{},maakDvnDefinitiefI7:async()=>{},
    maakOverboekingDefinitiefI7:async()=>{},openDvnPostSheet(){},openOverboekPost(){},
    handelOverboekingenAf(){},sluitOverboekPost(){},nummerBezet:()=>false,makeDossier:async()=>{},
    stempel:x=>x,hernoemVoorlopig:async()=>true,dvnPutIfPosted:()=>null,zorgVoorI7:async()=>{},herlaad:async()=>{},
    legeBookingHistory:()=>({version:1,receipts:[],resolutions:[],legacyOrphans:[]}),logOms:false,logboek:[],undoStack:[],appVer:'test',
    bookingDomain:{rowSourceIds:s=>s?.sourceIds||(s?.sources||[]).map(x=>x.id),evidenceForSnapshot:()=>null},
    bookingBronIds:s=>s?.sourceIds||(s?.sources||[]).map(x=>x.id),bookingBewijsVoor:()=>null};
  vm.createContext(c);vm.runInContext(read('js/ui/manage-view.js'),c);
  return{c,state,elements,get};
}
function loadController(h){vm.runInContext(read('js/ui/manage-controller.js'),h.c);}
function closestTarget(selector){return{closest:q=>q===selector?{}:null};}

function transactionalDB(seed={}){
  const names=['regels','dossiers','meta','overboekingen'],rows={};
  for(const name of names)rows[name]=new Map(name==='meta'?Object.entries(seed.meta||{}):(seed[name]||[]).map(v=>[v.id,clone(v)]));
  let queue=Promise.resolve(),writes=0;
  return{rows,get writes(){return writes;},transaction(requested,mode){
    const stores=Array.isArray(requested)?requested:[requested];let release;
    const previous=queue;queue=new Promise(done=>{release=done;});
    let active=false,pending=0,aborted=false,data,finishing=false;const jobs=[];
    const tx={error:null,abort(){aborted=true;tx.error=new Error('aborted');},objectStore(name){return{
      get:key=>request(()=>clone(data[name].get(key))),getAll:()=>request(()=>[...data[name].values()].map(clone)),
      put:(value,key)=>request(()=>{data[name].set(key===undefined?value.id:key,clone(value));}),
      delete:key=>request(()=>data[name].delete(key)),clear:()=>request(()=>data[name].clear())};}};
    function finish(){if(finishing||pending)return;finishing=true;setTimeout(()=>{if(aborted)tx.onabort?.();else{
      if(mode==='readwrite'){for(const name of stores)rows[name]=data[name];writes++;}tx.oncomplete?.();}release();},0);}
    function request(action){let value;const request={error:null,readyState:'pending',get result(){
      if(this.readyState!=='done')throw new Error('premature IDB result');return value;}};pending++;
      const run=()=>setTimeout(()=>{if(!aborted)try{value=action();request.readyState='done';request.onsuccess?.({target:request});}
        catch(error){request.error=tx.error=error;aborted=true;request.onerror?.({target:request});}pending--;finish();},0);
      if(active)run();else jobs.push(run);return request;}
    previous.then(()=>{data=Object.fromEntries(stores.map(name=>[name,new Map([...rows[name]].map(([k,v])=>[k,clone(v)]))]));
      active=true;jobs.forEach(run=>run());finish();});return tx;
  }};
}
function realAdmin(seed={}){
  const c={console,setTimeout,clearTimeout,queueMicrotask};vm.createContext(c);
  for(const file of ['js/hh.js','js/domain/time.js','js/domain/booking.js','js/domain/dvn.js','js/domain/overbooking.js','js/storage/indexeddb.js','js/services/admin.js'])
    vm.runInContext(read(file),c);
  const db=transactionalDB(seed);c.HH.storage.indexedDB.use(db);return{H:c.HH,db};
}

const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('aliases collect correction, overbooking and DVN work under their canonical dossier',()=>{
  const {c}=uiContext(),dossiers=[{id:'alias',naam:'Old',dvn:true,dvnTo:'matter'},{id:'matter',naam:'Matter',nummer:'123'}],
    rules=[{id:'r',dossierId:'alias'}],snap={sourceIds:['r'],sources:[{id:'r',dossierId:'alias'}]};
  const groups=c.groepeerBeheerWerk({dossiers,rules,corrections:[{receiptId:'receipt',currentOptions:[snap]}],
    overbookings:[{id:'over',sourceRuleIds:['r'],targetDossierId:'alias'}],dvnTasks:[{dossierId:'alias'}]});
  equal(groups.length,1,'work was split across dossiers');equal(groups[0].id,'matter','alias did not resolve');
  equal(groups[0].corrections.length+groups[0].overbookings.length+groups[0].dvnTasks.length,3,'a workflow disappeared');
});
test('a deleted correction is retained from its earlier snapshot',()=>{
  const {c}=uiContext(),before={sourceIds:['gone'],sources:[{id:'gone',dossierId:'d'}]},groups=c.groepeerBeheerWerk({
    dossiers:[{id:'d',naam:'D'}],rules:[],corrections:[{receiptId:'x',beforeSnapshots:[before],currentOptions:[]}],overbookings:[],dvnTasks:[]});
  equal(groups.length,1,'deleted correction disappeared');equal(groups[0].id,'d','deleted correction was not assigned from stored evidence');
});
test('ambiguous and broken assignments retain every item in the review group',()=>{
  const {c}=uiContext(),snap={sourceIds:['a','b'],sources:[]},groups=c.groepeerBeheerWerk({
    dossiers:[{id:'d1',naam:'One'},{id:'d2',naam:'Two'},{id:'broken',naam:'Broken',dvnTo:'missing'}],
    rules:[{id:'a',dossierId:'d1'},{id:'b',dossierId:'d2'}],corrections:[{receiptId:'x',currentOptions:[snap]}],
    overbookings:[],dvnTasks:[{dossierId:'broken'}]});
  const review=groups.find(g=>g.id==='__manage_review__');assert(review,'review group missing');
  equal(review.corrections.length,1,'ambiguous correction lost');equal(review.dvnTasks.length,1,'broken alias task lost');
});
test('an overbooking whose current source and stored target disagree is held for review',()=>{
  const {c}=uiContext(),groups=c.groepeerBeheerWerk({dossiers:[{id:'old',naam:'Old'},{id:'new',naam:'New'}],
    rules:[{id:'r',dossierId:'new'}],corrections:[],overbookings:[{id:'o',sourceRuleIds:['r'],targetDossierId:'old'}],dvnTasks:[]});
  const review=groups.find(g=>g.id==='__manage_review__');assert(review?.overbookings.some(x=>x.id==='o'),'disagreeing overbooking silently attached to one dossier');
});
test('day scope selects a correction but retains its complete atomic batch',()=>{
  const h=uiContext(),a={date:'2026-09-21',sourceIds:['a'],hours:1},b={date:'2026-09-22',sourceIds:['b'],hours:2},
    correction={receiptId:'receipt',beforeSnapshots:[a,b],before:a,currentOptions:[a,b]};
  Object.assign(h.state,{dossiers:[{id:'d',naam:'D',nummer:'123'}],rules:[{id:'a',dossierId:'d'},{id:'b',dossierId:'d'}]});
  h.c.bookingCorrectionsFor=()=>[correction];h.c.alleBookingSnapshots=()=>[a,b];
  vm.runInContext("beheerUi.scopeDate='2026-09-22'",h.c);const groups=h.c.beheerWerkData(),task=groups.flatMap(g=>g.tasks).find(t=>t.type==='correction');
  assert(task,'scoped correction disappeared');equal(task.lines.length,2,'scope split an atomic correction batch');
});
test('number assignment re-derives the same DVN as booking work',()=>{
  const h=uiContext(),d={id:'dvn',naam:'New matter',nummer:null,dvn:true,voorlopig:true},rule={id:'r',dossierId:'dvn',datum:'2026-09-22'},
    snap={date:'2026-09-22',sourceIds:['r'],sources:[rule],targetNumber:'123',hours:1,description:'Work'};
  Object.assign(h.state,{dossiers:[d],rules:[rule]});h.c.alleBookingSnapshots=()=>[snap];h.c.dvnRegels=()=>[rule];
  h.c.dvnIntappState=x=>x.nummer?'ready':'missing';h.c.dvnResolvedNummer=x=>x.nummer;h.c.bookingSemanticKey=()=> 'snapshot';
  let groups=h.c.beheerWerkData(),tasks=groups.flatMap(g=>g.tasks);assert(tasks.some(t=>t.type==='number'),'missing-number task not derived');
  d.nummer='123';d.voorlopig=false;groups=h.c.beheerWerkData();tasks=groups.flatMap(g=>g.tasks);
  assert(!tasks.some(t=>t.type==='number')&&tasks.some(t=>t.type==='book'),'number assignment did not regroup into booking work');
});
test('first line of a multi-line action advances without a receipt or commit',async()=>{
  const h=uiContext();let calls=0,commits=0;h.c.HH.services.admin.resolveBookingCorrection=async()=>{calls++;return{ok:true,history:{}};};
  h.c.HH.state.commit=()=>{commits++;};loadController(h);
  const task={key:'correction:x',type:'correction',lines:[{hours:1},{hours:2}],correction:{receiptId:'x',currentOptions:[{hours:1},{hours:2}]}};
  h.c.task=task;vm.runInContext("beheerGroups=[{id:'d',tasks:[task]}];beheerUi.group='d';beheerUi.line=0;beheerUi.seen=[];beheerUi.signature='';beheerWerkData=()=>[{tasks:[task]}];renderBeheerWerk=()=>{};renderBeheerFlow();",h.c);
  assert(h.get('manage-flow').innerHTML.includes('Regel 1 van 2'),'first line was not rendered as a batch');
  await h.c.bevestigBeheerTaak();equal(calls,0,'receipt service called before the last line');equal(commits,0,'state committed before the last line');
  equal(vm.runInContext('beheerUi.line',h.c),1,'flow did not advance');
  assert(h.get('manage-flow').innerHTML.includes('Regel 2 van 2'),'second line was not rendered after review');
  await h.c.bevestigBeheerTaak();equal(calls,1,'last line did not resolve once');equal(commits,1,'successful resolution not committed once');
});
test('a stale task is rejected before any service write',async()=>{
  const h=uiContext();let calls=0;h.c.HH.services.admin.setRegularBooking=async()=>{calls++;return{ok:true,history:{}};};loadController(h);
  h.c.shown={key:'book:x',type:'book',lines:[{hours:1}],snapshot:{sourceIds:['r'],hours:1}};
  h.c.current={...h.c.shown,lines:[{hours:2}],snapshot:{sourceIds:['r'],hours:2}};
  vm.runInContext('beheerShown=shown;beheerUi.signature=beheerTaakSignature(shown);beheerWerkData=()=>[{tasks:[current]}];renderBeheerWerk=()=>{};',h.c);
  await h.c.bevestigBeheerTaak();equal(calls,0,'stale task reached the service');
  assert(vm.runInContext('beheerUi.error',h.c).includes('gewijzigd'),'stale task did not explain the refresh');
});
test('Later doen changes navigation without any service or state write',async()=>{
  const h=uiContext();let writes=0;h.c.HH.state.commit=()=>{writes++;};loadController(h);
  vm.runInContext("beheerUi.group='d';beheerUi.taskKey='one';beheerGroups=[{id:'d',tasks:[{key:'one'},{key:'two'}]}];renderBeheerFlow=()=>{};",h.c);
  await h.get('v-beheer').fire('click',closestTarget('[data-manage-later]'));
  equal(vm.runInContext('beheerUi.taskKey',h.c),'two','Later doen did not select the next task');equal(writes,0,'Later doen wrote application state');
});
test('copy uses the rendered line value and performs no state write',async()=>{
  const h=uiContext();let copied=null,writes=0;h.c.kopieer=async value=>{copied=value;};h.c.HH.state.commit=()=>{writes++;};loadController(h);
  h.c.task={lines:[{hours:1.5,targetNumber:'123',description:'Work'}]};
  vm.runInContext('beheerShown=task;beheerUi.line=0;',h.c);const target={dataset:{manageCopy:'hours'},innerHTML:'copy',closest:q=>q==='[data-manage-copy]'?target:null};
  await h.get('v-beheer').fire('click',target);equal(copied,'1.5','copy did not use the displayed hours');equal(writes,0,'copy wrote application state');
});
test('a real book dispatch stores its receipt transactionally and mirrors committed state',async()=>{
  const date='2026-09-22',dossier={id:'d',naam:'Matter',nummer:'123',revision:1},
    rule={id:'r',datum:date,dossierId:'d',code:null,omschrijving:'Work',start:'09:00',eind:'10:00',soort:'werk',revision:1},
    history={version:1,receipts:[],resolutions:[],legacyOrphans:[]},real=realAdmin({dossiers:[dossier],regels:[rule],meta:{bookingHistory:history,geboekt:{},rondMode:'groep'}}),
    options={roundingMode:'groep',getDossier:id=>id==='d'?dossier:null,getIntappInfo:d=>({nummer:d.nummer,naam:d.naam}),
      getDescription:r=>r.omschrijving,getCodeName:()=>'',hasCodeError:()=>false},
    rows=rules=>real.H.domain.booking.aggregateIntapp(rules,options),row=rows([rule])[0],snapshot=real.H.domain.booking.bookingSnapshot(row,date,{roundingMode:'groep',sources:[rule]});
  const h=uiContext();Object.assign(h.state,{rules:[rule],dossiers:[dossier],bookingHistory:history});h.c.HH.services.admin=real.H.services.admin;
  h.c.sumVanData=rules=>rows(rules);h.c.bookingSnapshotVan=(row,date)=>real.H.domain.booking.bookingSnapshot(row,date,{roundingMode:'groep',sources:[rule]});
  h.c.bookingSemanticKey=real.H.domain.booking.semanticKey;h.c.bookingDomain=real.H.domain.booking;loadController(h);
  h.c.task={key:'book:'+real.H.domain.booking.semanticKey(snapshot),type:'book',snapshot,lines:[snapshot]};
  vm.runInContext('beheerShown=task;beheerUi.signature=beheerTaakSignature(task);beheerWerkData=()=>[{tasks:[task]}];renderBeheerFlow=()=>{};renderBeheerWerk=()=>{};',h.c);
  await h.c.bevestigBeheerTaak();const stored=real.db.rows.meta.get('bookingHistory');
  equal(stored.receipts.length,1,'transaction did not store the receipt');equal(h.state.bookingHistory.receipts.length,1,'UI did not mirror committed receipt');
  equal(real.db.writes,1,'booking required an unexpected number of transactions');
});
test('a real overbooking completion stores target evidence and closes the record once',async()=>{
  const date='2026-09-22',target={id:'d',naam:'Matter',nummer:'123',revision:1},i7={id:'i7',naam:'Indirect',nummer:'I7',isI7:true,revision:1},
    rule={id:'r',datum:date,dossierId:'d',code:null,omschrijving:'Work',start:'09:00',eind:'10:00',soort:'werk',revision:1},
    history={version:1,receipts:[],resolutions:[],legacyOrphans:[]},real=realAdmin({dossiers:[target,i7],regels:[rule],overboekingen:[],meta:{bookingHistory:history,geboekt:{},rondMode:'groep'}}),
    options={roundingMode:'groep',getDossier:id=>[target,i7].find(d=>d.id===id),getIntappInfo:d=>({nummer:d.nummer,naam:d.naam}),
      getDescription:r=>r.omschrijving,getCodeName:()=>'',hasCodeError:()=>false},summarize=rules=>real.H.domain.booking.aggregateIntapp(rules,options),row=summarize([rule]);
  const parked=await real.H.services.admin.parkOverbooking({row:row[0],target,i7Dossier:i7,sourceDate:date,id:'over',receiptId:'i7-proof',
    rules:[rule],dossiers:[target,i7],summarize,roundingMode:'groep',commercialCode:'COM',hoursOf:real.H.domain.booking.hoursOf,
    nowIso:date+'T12:00:00Z',nowMs:1});
  assert(parked.ok,'overbooking setup failed: '+parked.error);const h=uiContext();Object.assign(h.state,{rules:[rule],dossiers:[target,i7],overbookings:[parked.overbooking],bookingHistory:parked.history});
  h.c.HH.services.admin=real.H.services.admin;h.c.sumVan=summarize;h.c.urenOf=real.H.domain.booking.hoursOf;loadController(h);
  h.c.task={key:'over:over',type:'overpost',record:parked.overbooking,lines:parked.overbooking.targetLines.map(x=>({date,targetNumber:'123',code:x.werkcode,description:x.omschrijving,hours:x.uren}))};
  vm.runInContext('beheerShown=task;beheerUi.signature=beheerTaakSignature(task);beheerWerkData=()=>[{tasks:[task]}];renderBeheerFlow=()=>{};renderBeheerWerk=()=>{};',h.c);
  const before=real.db.writes;await h.c.bevestigBeheerTaak();const stored=real.db.rows.meta.get('bookingHistory'),record=real.db.rows.overboekingen.get('over');
  equal(record.status,'done','record was not closed');assert(stored.receipts.some(r=>r.channel==='overbooking_target'),'target evidence was not stored');
  equal(real.db.writes,before+1,'completion did not use exactly one transaction');equal(h.state.overbookings[0].status,'done','UI did not mirror completion');
});

let failed=0;
for(const [name,run] of tests)try{await run();console.log('PASS '+name);}catch(error){failed++;console.log('FAIL '+name+': '+(error.stack||error.message));}
console.log(`${tests.length-failed}/${tests.length} Phase AC flow checks passed for ${root}`);
process.exitCode=failed?1:0;
