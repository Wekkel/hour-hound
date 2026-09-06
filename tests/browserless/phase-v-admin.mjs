#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(process.argv[2]||join(here,'../..'));
const read=file=>readFileSync(join(root,file),'utf8');
const source={
  hh:read('js/hh.js'),time:read('js/domain/time.js'),booking:read('js/domain/booking.js'),
  dvn:read('js/domain/dvn.js'),over:read('js/domain/overbooking.js'),
  storage:read('js/storage/indexeddb.js'),day:read('js/services/day-rules.js'),
  timer:read('js/services/timer.js'),admin:read('js/services/admin.js'),
  core:read('js/core.js'),manage:read('js/ui/manage-controller.js')
};
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const equal=(actual,expected,message)=>assert(actual===expected,
  `${message}\nverwacht: ${expected}\ngekregen: ${actual}`);

function persistentDB(seed={}){
  const names=['regels','dossiers','meta','overboekingen','codes','templates'],rows={};
  for(const name of names)rows[name]=new Map(name==='meta'?Object.entries(seed.meta||{}):
    (seed[name]||[]).map(value=>[value.id||value.code,clone(value)]));
  let queue=Promise.resolve(),writes=0;
  return{rows,get writes(){return writes;},transaction(requested,mode){
    const stores=Array.isArray(requested)?requested:[requested];let release;
    const previous=queue;queue=new Promise(resolveDone=>{release=resolveDone;});
    let active=false,pending=0,aborted=false,data,finishing=false;
    const jobs=[],tx={error:null,abort(){aborted=true;tx.error=new Error('aborted');},
      objectStore(name){return{
        get:key=>request(()=>clone(data[name].get(key))),
        getAll:()=>request(()=>[...data[name].values()].map(clone)),
        put:(value,key)=>request(()=>{const id=key===undefined?(value.id||value.code):key;
          data[name].set(id,clone(value));return id;}),
        delete:key=>request(()=>data[name].delete(key)),
        clear:()=>request(()=>data[name].clear())
      };}};
    function finish(){if(finishing||pending)return;finishing=true;setTimeout(()=>{
      if(aborted)tx.onabort?.();else{if(mode==='readwrite'){
        for(const name of stores)rows[name]=data[name];writes++;}tx.oncomplete?.();}
      release();
    },0);}
    function request(action){let value;const request={readyState:'pending',error:null,
      get result(){if(request.readyState!=='done'){
        const error=new Error('IDBRequest.result accessed while pending');
        error.name='InvalidStateError';throw error;}return value;}};
      pending++;const run=()=>setTimeout(()=>{if(!aborted)try{value=action();request.readyState='done';
        request.onsuccess?.({target:request});}catch(error){request.error=tx.error=error;aborted=true;
        request.onerror?.({target:request});}pending--;finish();},0);
      if(active)run();else jobs.push(run);return request;
    }
    previous.then(()=>{data=Object.fromEntries(stores.map(name=>[name,
      new Map([...rows[name]].map(([key,value])=>[key,clone(value)]))]));active=true;
      jobs.forEach(run=>run());finish();});
    return tx;
  }};
}

function services(){
  const context={console,setTimeout,clearTimeout,queueMicrotask};vm.createContext(context);
  for(const [name,code] of Object.entries({hh:source.hh,time:source.time,booking:source.booking,
    dvn:source.dvn,over:source.over,storage:source.storage,day:source.day,timer:source.timer,
    admin:source.admin}))vm.runInContext(code,context,{filename:name+'.js'});
  return context.HH;
}

function coreRuntime(initial,restoreUndo){
  const elements=new Map(),messages=[],received=[];
  const element=()=>({dataset:{},style:{},textContent:'',innerHTML:'',scrollTop:0,
    scrollHeight:0,clientHeight:0,classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];},
    contains(){return false;},closest(){return null;}});
  class FakeBroadcastChannel{
    constructor(){FakeBroadcastChannel.instance=this;this.onmessage=null;}
    postMessage(value){messages.push(clone(value));}
    close(){}
  }
  const context={console,setTimeout,clearTimeout,queueMicrotask,Date,Math,
    BroadcastChannel:FakeBroadcastChannel,CSS:{escape:value=>String(value)},
    localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    navigator:{},location:{},confirm:()=>true,prompt:()=>null,
    addEventListener(){},ontvangVensterbericht:event=>received.push(event.data),
    document:{activeElement:null,getElementById(id){
      if(!elements.has(id))elements.set(id,element());return elements.get(id);},
      addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];}}};
  context.window=context;context.globalThis=context;vm.createContext(context);
  for(const code of [source.hh,source.time,source.booking,source.dvn,source.over])
    vm.runInContext(code,context);
  const state=Object.assign({db:null,dossiers:[],templates:[],codes:[],rules:[],running:null,
    stack:[],overbookings:[],dayEnds:{},dayAudit:{},booked:{},roundingMode:'groep',
    codeUsage:{},viewDate:date,weekAnchor:date,tab:'dag'},clone(initial||{}));
  context.HH.state={read:()=>state,commit(delta){Object.assign(state,delta);return state;},
    upsert(field,value){const list=Array.isArray(value)?value:[value];for(const row of list){
      const index=state[field].findIndex(item=>item.id===row.id);
      if(index<0)state[field].push(row);else state[field][index]=row;}return state[field];}};
  context.HH.renderCoordinator={render(){}};
  context.HH.app={render(){}};
  context.HH.storage.indexedDB={TIMER_STORES:[],hasWriteAccess:()=>false,
    revisionOf:value=>Number.isInteger(value&&value.revision)?value.revision:0,
    tx(){},getAll(){},get(){},put(){},putKey(){return Promise.resolve();},remove(){},replaceAll(){}};
  context.HH.services.timer={restoreUndo};
  vm.runInContext(source.core+`\n;globalThis.__coreTest={undoData,undoTimer,undo,
    undoTimerStap,stack:()=>undoStack.slice(),bc};`,context,{filename:'core.js'});
  return{context,state,messages,received,api:context.__coreTest,
    channel:FakeBroadcastChannel.instance};
}

const date='2026-09-05';
const dossier={id:'d',nummer:'123',naam:'Dossier',revision:1,gewijzigd:1};
const rule={id:'r',datum:date,start:'09:00',eind:'10:00',dossierId:'d',code:null,
  omschrijving:'Oud',uren:1,urenHand:false,soort:'werk',revision:1,gewijzigd:1};
const tests=[];
const test=(name,run)=>tests.push([name,run]);

test('data-undo controleert persistent revisie en verhoogt herstelrevisie',async()=>{
  const HH=services(),after={...rule,omschrijving:'Nieuw',revision:2,gewijzigd:2},
    db=persistentDB({regels:[after],dossiers:[dossier],meta:{}});HH.storage.indexedDB.use(db);
  const restored=await HH.services.timer.restoreUndo({kind:'data',currentTimer:null,
    expectedRunning:null,rules:[rule],remove:[],expected:[{id:'r',revision:2}],nowMs:3});
  assert(restored.ok,'Veilige data-undo is geweigerd: '+restored.error);
  equal(db.rows.regels.get('r').omschrijving,'Oud','Data-undo herstelde de oude waarde niet');
  equal(db.rows.regels.get('r').revision,3,'Data-undo verhoogde de revisie niet');
  db.rows.regels.set('r',{...db.rows.regels.get('r'),omschrijving:'Later',revision:4});
  const stale=await HH.services.timer.restoreUndo({kind:'data',currentTimer:null,
    expectedRunning:null,rules:[after],remove:[],expected:[{id:'r',revision:3}],nowMs:5});
  equal(stale.error,'rule_changed','Data-undo accepteerde een achterhaalde opgeslagen revisie');
  equal(db.rows.regels.get('r').omschrijving,'Later','Geweigerde undo overschreef latere data');
});

test('timer-undo controleert pointer en revisie atomair',async()=>{
  const HH=services(),closed={...rule,eind:'11:00',uren:2,revision:2,gewijzigd:2},
    db=persistentDB({regels:[closed],dossiers:[dossier],meta:{}});HH.storage.indexedDB.use(db);
  const out=await HH.services.timer.restoreUndo({kind:'timer',currentTimer:null,
    expectedRunning:null,restoreRunningId:'r',rules:[{...rule,eind:null}],remove:[],
    expected:[{id:'r',revision:2}],nowMs:3});
  assert(out.ok,'Timer-undo is geweigerd: '+out.error);
  equal(db.rows.meta.get('running'),'r','Timer-undo herstelde de pointer niet');
  equal(db.rows.regels.get('r').revision,3,'Timer-undo verhoogde de regelrevisie niet');
});

test('timer-dossierwrites verhogen bestaande en nieuwe revisies',async()=>{
  const HH=services(),existing={...dossier,revision:4,used:2},db=persistentDB({
    dossiers:[existing],meta:{}});HH.storage.indexedDB.use(db);
  const started=await HH.services.timer.start({currentTimer:null,date,time:'09:00',id:'nieuw',
    dossierId:'d',description:'Werk',kind:'werk',nowMs:3,nowIso:'nu'});
  assert(started.ok,'Timerstart met bestaand dossier is geweigerd: '+started.error);
  equal(db.rows.dossiers.get('d').revision,5,'Timerstart verhoogde de dossierrevisie niet');
  const created={id:'new-d',naam:'Nieuw',nummer:null,voorlopig:true,gewijzigd:4};
  const stopped=await HH.services.timer.stop({currentTimer:db.rows.regels.get('nieuw'),
    date,time:'10:00',nowMs:5,nowIso:'later'});
  assert(stopped.ok,'Voorbereidende stop is geweigerd: '+stopped.error);
  const createdStart=await HH.services.timer.start({currentTimer:null,date,time:'10:00',id:'nieuw-2',
    dossierId:created.id,createdDossier:created,description:'Werk',kind:'werk',nowMs:6,nowIso:'later'});
  assert(createdStart.ok,'Timerstart met nieuw dossier is geweigerd: '+createdStart.error);
  equal(db.rows.dossiers.get(created.id).revision,1,'Nieuw timerdossier kreeg geen beginrevisie');
});

test('dossier-save weigert revision-zero model tegen nieuwere opslag',async()=>{
  const HH=services(),actual={...dossier,naam:'Actueel',revision:3,gewijzigd:3},
    stale={...dossier,naam:'Overschrijven',revision:0,gewijzigd:4},
    db=persistentDB({dossiers:[actual]});HH.storage.indexedDB.use(db);
  const out=await HH.services.admin.saveDossier({dossier:stale,nowMs:5});
  equal(out.error,'admin_changed','Revision-zero invoer overschreef een nieuwere dossierrecord');
  equal(db.rows.dossiers.get('d').naam,'Actueel','Geweigerde dossier-save wijzigde opslag');
});

test('beheeradapter commit de door opslag verhoogde dossierrevisie',async()=>{
  const before={...dossier,revision:4},persisted={...dossier,naam:'Bewaard',revision:5};
  const runtime=coreRuntime({dossiers:[before]},async()=>({ok:true,rules:[],remove:[]}));
  runtime.context.HH.services.admin={saveDossier:async()=>({ok:true,dossier:persisted})};
  vm.runInContext(source.manage.slice(0,source.manage.indexOf('$("dvn-intapp")'))+
    '\n;globalThis.__saveDossier=bewaarBeheerDossier;',
    runtime.context,{filename:'manage-controller.js'});
  const out=await runtime.context.__saveDossier({...before,naam:'Bewaard'});
  assert(out,'Beheeradapter meldde een geslaagde save als mislukt');
  equal(runtime.state.dossiers[0].revision,5,
    'Beheeradapter committeerde niet de door opslag geretourneerde revisie');
});

for(const [name,extra,error] of [
  ['geboekte dag',{meta:{geboekt:{[date]:['fp']}}},'booked_rule'],
  ['open overboeking',{overboekingen:[{id:'o',status:'waiting',sourceRuleIds:['r']}]},'parked_rule'],
  ['afgeronde overboekingshistorie',{overboekingen:[{id:'o',status:'done',sourceRuleIds:['r']}]},'parked_rule'],
  ['DVN-status',{dossiers:[{...dossier,dvn:true,dvnResolvedNr:'123',dvnIntappStatus:'posted'}]},'admin_changed']
])test('undo weigert '+name,async()=>{
  const HH=services(),after={...rule,omschrijving:'Nieuw',revision:2},seed={regels:[after],
    dossiers:extra.dossiers||[dossier],overboekingen:extra.overboekingen||[],
    meta:extra.meta||{}};
  const db=persistentDB(seed);HH.storage.indexedDB.use(db);
  const out=await HH.services.timer.restoreUndo({kind:'data',currentTimer:null,
    expectedRunning:null,rules:[rule],remove:[],expected:[{id:'r',revision:2}],nowMs:3});
  equal(out.error,error,'Undo gaf niet de verwachte administratieve blokkade');
  equal(db.rows.regels.get('r').omschrijving,'Nieuw','Geblokkeerde undo wijzigde de regel');
});

test('timer-undo heropent geen regel op een gesloten dag',async()=>{
  const HH=services(),closed={...rule,eind:'10:00',revision:2},db=persistentDB({regels:[closed],
    dossiers:[dossier],meta:{dagEinde:{[date]:'17:00'},dagAudit:{}}});
  HH.storage.indexedDB.use(db);
  const out=await HH.services.timer.restoreUndo({kind:'timer',currentTimer:null,
    expectedRunning:null,restoreRunningId:'r',rules:[{...rule,eind:null}],remove:[],
    expected:[{id:'r',revision:2}],nowMs:3,nowIso:'nu'});
  equal(out.error,'day_closed','Timer-undo opende een regel op een gesloten dag');
  equal(db.rows.meta.has('running'),false,'Geweigerde timer-undo wijzigde de pointer');
});

test('undo van automatische aanvulling bewaart dagsluiting en schrijft audit',async()=>{
  const HH=services(),auto={...rule,id:'auto',start:'17:00',eind:'17:00',uren:2,
    urenHand:true,autoAanvul:true,revision:1},oldAudit={
      [date]:{events:[{type:'aangevuld',t:'eerder',ids:['auto']}]}};
  const db=persistentDB({regels:[auto],dossiers:[dossier],meta:{
    dagEinde:{[date]:'17:00'},dagAudit:oldAudit}});HH.storage.indexedDB.use(db);
  const out=await HH.services.timer.restoreUndo({kind:'data',currentTimer:null,
    expectedRunning:null,rules:[],remove:['auto'],expected:[{id:'auto',revision:1}],
    nowMs:3,nowIso:'nu'});
  assert(out.ok,'Undo van automatische aanvulling is geweigerd: '+out.error);
  equal(db.rows.meta.get('dagEinde')[date],'17:00','Undo heropende de afgesloten dag');
  equal(db.rows.meta.get('dagAudit')[date].events.at(-1).type,'aanvulling-ongedaan',
    'Undo schreef geen samenhangende dagaudit');
  equal(out.dayAudit[date].events.at(-1).ids[0],'auto','Undo-effect mist de verwijderde regel');
});

test('adminregelmerge bewaart latere velden en verhoogt revisie',async()=>{
  const HH=services(),dvn={id:'v',naam:'DVN',voorlopig:true,dvn:true,revision:1,gewijzigd:1},
    before={...rule,id:'v-r',dossierId:'v',code:'ANDERS'},
    actual={...before,omschrijving:'Latere tekst',revision:2,gewijzigd:2},
    db=persistentDB({regels:[actual],dossiers:[dvn],meta:{stack:[]}});HH.storage.indexedDB.use(db);
  const out=await HH.services.admin.finalizeDvnI7({dossier:dvn,dossiers:[dvn],rules:[before],
    stack:[],runningId:null,commercialCode:'COM',hoursOf:()=>1,nowMs:3,nowIso:'nu'});
  assert(out.ok,'Veilige adminmerge is geweigerd: '+out.error);
  equal(db.rows.regels.get('v-r').omschrijving,'Latere tekst','Adminwrite verloor een later veld');
  equal(db.rows.regels.get('v-r').code,'COM','Adminwrite paste zijn eigen veld niet toe');
  equal(db.rows.regels.get('v-r').revision,3,'Adminwrite verhoogde de revisie niet');
});

test('DVN-hernoemen weigert conflict op hetzelfde veld',async()=>{
  const HH=services(),dvn={id:'v',naam:'Oud',voorlopig:true,dvn:true,revision:1,gewijzigd:1},
    actualDvn={...dvn},before={...rule,id:'v-r',dossierId:'v',
      omschrijving:'05.09.2026 · Oud · Werk'},
    actual={...before,omschrijving:'05.09.2026 · Elders · Werk',revision:2,gewijzigd:2},
    desired={...before,omschrijving:'05.09.2026 · Nieuw · Werk'},
    db=persistentDB({regels:[actual],dossiers:[actualDvn],meta:{stack:[]}});HH.storage.indexedDB.use(db);
  const out=await HH.services.admin.saveDvnRename({beforeDossier:dvn,beforeRules:[before],
    dossier:{...dvn,naam:'Nieuw'},rules:[desired],stack:[],nowMs:3});
  equal(out.error,'source_changed','Hernoemen accepteerde een conflict op de omschrijving');
  equal(db.rows.regels.get('v-r').omschrijving,actual.omschrijving,
    'Geweigerde hernoemactie overschreef de actuele omschrijving');
});

test('invariantreparatie gebruikt de opgeslagen snapshot',async()=>{
  const HH=services(),open={...rule,eind:null},db=persistentDB({regels:[open],
    dossiers:[dossier],meta:{pending:{id:'oud'}}});HH.storage.indexedDB.use(db);
  const out=await HH.services.timer.repairInvariant({currentTimer:null,rules:[],pointerId:null,
    pendingId:null,allowWrite:true});
  assert(out.ok&&!out.blocked,'Eenduidige opgeslagen invariant is niet hersteld');
  equal(db.rows.meta.get('running'),'r','Reparatie gebruikte de verouderde invoerregels');
  equal(db.rows.meta.has('pending'),false,'Reparatie ruimde de opgeslagen pending-marker niet op');
});

test('dag heropenen bewaart auto-aanvulling met overboekingshistorie',async()=>{
  const HH=services(),auto={...rule,id:'a',autoAanvul:true},record={id:'o',status:'done',
    sourceRuleIds:['a']},db=persistentDB({regels:[auto],dossiers:[dossier],
    overboekingen:[record],meta:{dagEinde:{[date]:'17:00'},dagAudit:{}}});
  HH.storage.indexedDB.use(db);
  const out=await HH.services.timer.start({currentTimer:null,date,time:'11:00',id:'nieuw',
    dossierId:'d',description:'Werk',kind:'werk',nowMs:3,nowIso:'nu'});
  assert(out.ok,'Start op gesloten dag is geweigerd: '+out.error);
  assert(db.rows.regels.has('a'),'Beschermde automatische regel is verwijderd');
});

test('TimerService idle wacht werkelijk op de seriële keten',async()=>{
  const HH=services(),db=persistentDB({dossiers:[dossier],meta:{}});HH.storage.indexedDB.use(db);
  const pending=HH.services.timer.start({currentTimer:null,date,time:'09:00',id:'idle-r',
    dossierId:'d',description:'Werk',kind:'werk',nowMs:3,nowIso:'nu'});
  await HH.services.timer.idle();
  assert(db.rows.regels.has('idle-r'),'idle eindigde vóór de queued timerwrite');
  const out=await pending;assert(out.ok,'Timerwrite mislukte');
});

test('core voert undo-stack, audit-effect en BroadcastChannel uit',async()=>{
  const before={...rule,omschrijving:'Oud',revision:1},after={...rule,omschrijving:'Nieuw',revision:2};
  let calls=0,reject=false,rejectionReached=false;
  const runtime=coreRuntime({rules:[after],dayEnds:{[date]:'17:00'},dayAudit:{}},async input=>{
    calls++;equal(input.expected[0].revision,reject?3:2,'Core gaf de verwachte revisie niet door');
    if(reject){rejectionReached=true;return{ok:false,error:'day_closed'};}
    return{ok:true,rules:[{...before,revision:3}],remove:[],currentTimerId:null,
      dayEnds:{[date]:'17:00'},dayAudit:{[date]:{events:[{type:'aanvulling-ongedaan'}]}}};
  });
  runtime.api.undoData('bewerking',[before],{expected:[{id:'r',revision:2}]});
  await runtime.api.undo();
  equal(calls,1,'Core riep de undo-service niet aan');
  equal(runtime.state.rules[0].revision,3,'Core committeerde de persistente herstelrevisie niet');
  equal(runtime.state.dayAudit[date].events[0].type,'aanvulling-ongedaan',
    'Core committeerde het persistente dagaudit-effect niet');
  equal(runtime.api.stack().length,0,'Geslaagde undo bleef op de stack staan');
  assert(runtime.messages.length===1,'Geslaagde undo kondigde de wijziging niet aan');
  runtime.channel.onmessage({data:{from:'ander'}});
  equal(runtime.received.length,1,'BroadcastChannel delegeerde niet aan app-eigenaarschap');
  reject=true;runtime.api.undoData('conflict',[before],{expected:[{id:'r',revision:3}]});
  await runtime.api.undo();
  equal(calls,2,'Core riep de service niet aan voor de geweigerde undo');
  assert(rejectionReached,'Core-test bereikte de serviceweigering niet');
  equal(runtime.api.stack().length,1,'Geweigerde undo verdween van de stack');
});

for(const kind of ['data','timer'])test('core verwijdert na async '+kind+'-undo alleen de uitgevoerde stap',async()=>{
  const before={...rule,revision:1},after={...rule,revision:2};let finish;
  const runtime=coreRuntime({rules:[after]},()=>new Promise(resolve=>{finish=resolve;}));
  if(kind==='data')runtime.api.undoData('oud',[before],{expected:[{id:'r',revision:2}]});
  else runtime.api.undoTimer('oud',[before],{verwachtRunning:null,herstelRunning:null,
    verwacht:[{id:'r',revision:2}]});
  const pending=runtime.api.undo();
  runtime.api.undoData('nieuw',[before],{expected:[{id:'r',revision:3}]});
  finish({ok:true,rules:[{...before,revision:3}],remove:[],currentTimerId:null});
  await pending;
  equal(runtime.api.stack().length,1,'Async undo verwijderde ook de later toegevoegde stap');
  equal(runtime.api.stack()[0].label,'nieuw','Async undo behield niet de nieuwe stap');
});

test('undo herstelt geen verwijzing naar een verwijderd dossier',async()=>{
  const HH=services(),after={...rule,revision:2},db=persistentDB({regels:[after],dossiers:[dossier],meta:{}});
  HH.storage.indexedDB.use(db);
  const out=await HH.services.timer.restoreUndo({kind:'data',currentTimer:null,expectedRunning:null,
    rules:[{...rule,dossierId:'verwijderd'}],remove:[],expected:[{id:'r',revision:2}],nowMs:3});
  equal(out.error,'dossier_missing','Undo herstelde een niet-bestaand dossier');
  equal(db.rows.regels.get('r').dossierId,dossier.id,'Geweigerde undo wijzigde het dossier');
});

let failures=0;
for(const [name,run] of tests)try{await run();console.log('PASS '+name);}
catch(error){failures++;console.error('FAIL '+name+' — '+error.message);}
console.log(`${tests.length-failures}/${tests.length} phase-v-admin checks geslaagd`);
process.exitCode=failures?1:0;
