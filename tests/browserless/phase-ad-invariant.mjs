#!/usr/bin/env node
/* Phase AD: executable i7 no-code guards at the real TimerService and adapter seams. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source={hh:read('js/hh.js'),time:read('js/domain/time.js'),booking:read('js/domain/booking.js'),
  dvn:read('js/domain/dvn.js'),over:read('js/domain/overbooking.js'),storage:read('js/storage/indexeddb.js'),
  day:read('js/services/day-rules.js'),timerService:read('js/services/timer.js'),state:read('js/state.js'),
  core:read('js/core.js'),timer:read('js/timer.js')};
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function memoryDB(seed={}){
  const rows={};for(const name of ['regels','dossiers','meta','overboekingen','codes'])
    rows[name]=new Map(name==='meta'?Object.entries(seed.meta||{}):(seed[name]||[])
      .map(x=>[x.id||x.code,clone(x)]));
  let writes=0,queue=Promise.resolve();
  return{rows,get writes(){return writes;},transaction(requested,mode){
    const names=Array.isArray(requested)?requested:[requested],previous=queue;let release;
    queue=new Promise(resolve=>release=resolve);let data,active=false,pending=0,aborted=false,finishing=false;
    const jobs=[],tx={error:null,abort(){aborted=true;tx.error=new Error('aborted');},objectStore(name){return{
      get:key=>request(()=>clone(data[name].get(key))),getAll:()=>request(()=>[...data[name].values()].map(clone)),
      put:(value,key)=>request(()=>{data[name].set(key===undefined?(value.id||value.code):key,clone(value));}),
      delete:key=>request(()=>data[name].delete(key)),clear:()=>request(()=>data[name].clear())};}};
    const finish=()=>{if(finishing||pending)return;finishing=true;setTimeout(()=>{
      if(aborted)tx.onabort?.();else{if(mode==='readwrite'){for(const name of names)rows[name]=data[name];writes++;}
        tx.oncomplete?.();}release();},0);};
    const request=action=>{let value;const req={readyState:'pending',error:null,get result(){
      if(this.readyState!=='done')throw new Error('request accessed while pending');return value;}};
      pending++;const run=()=>setTimeout(()=>{if(!aborted)try{value=action();req.readyState='done';req.onsuccess?.({target:req});}
        catch(error){req.error=tx.error=error;aborted=true;req.onerror?.({target:req});}
        pending--;finish();},0);if(active)run();else jobs.push(run);return req;};
    previous.then(()=>{data=Object.fromEntries(names.map(name=>[name,new Map([...rows[name]].map(([k,v])=>[k,clone(v)]))]));
      active=true;jobs.forEach(run=>run());finish();});return tx;
  }};
}
function runtime(seed={}){
  const nodes=new Map();
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,dataset:{},value:'',readOnly:false,textContent:'',innerHTML:'',
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},addEventListener(type,fn){
      (this.listeners||(this.listeners={}))[type]??=[];this.listeners[type].push(fn);},dispatch(type,event={}){
        for(const fn of this.listeners?.[type]||[]){fn({...event,stopImmediatePropagation(){this.stopped=true;}});if(event.stopped)break;}},
    setAttribute(){},focus(){},select(){},contains(){return false;},querySelector(){return null;},querySelectorAll(){return[];}});return nodes.get(id);};
  const document={getElementById:node,createElement:()=>node('created'),addEventListener(){},removeEventListener(){},
    body:{dataset:{}},activeElement:null,hasFocus:()=>true};
  const c={console,setTimeout,clearTimeout,queueMicrotask,document,window:{addEventListener(){},removeEventListener(){}},
    navigator:{},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},indexedDB:{open(){return{};}},
    stempel:d=>({...d,gewijzigd:d.gewijzigd||1}),toast(){},announce(){},L(){},idKort:x=>x,
    ntFocus(){},ntNieuwState:()=>({step:'kind'}),
  };
  vm.createContext(c);
  for(const k of ['hh','time','booking','dvn','over','storage','day','timerService','state'])
    vm.runInContext(source[k],c,{filename:k+'.js'});
  vm.runInContext(source.core+'\n;globalThis.__setTestState=s=>HH.state.commit({dossiers:s.dossiers||[],codes:s.codes||[],rules:s.rules||[],running:s.running||null,stack:s.stack||[]});',c,{filename:'core.js'});
  vm.runInContext(source.timer,c,{filename:'timer.js'});
  c.HH.app={render(){}};return{c,node,db:memoryDB(seed)};
}
const date='2026-09-23',i7={id:'i7',nummer:'I700000000',naam:'Indirecte uren',isI7:true,revision:1},
  codes=[{code:'I7-101',naam:'Overleg'},{code:'I7-704',naam:'Commercieel'}];
const cases=[];const test=(name,fn)=>cases.push([name,fn]);
test('TimerService rejects i7 without a selected code before writing',async()=>{
  const {c,db}=runtime({dossiers:[i7],codes});c.HH.storage.indexedDB.use(db);
  const out=await c.HH.services.timer.start({currentTimer:null,readCurrentTimer:()=>null,date,time:'09:00',id:'r',
    dossierId:'i7',code:null,dossiers:[i7],nowMs:1,nowIso:date+'T09:00:00Z'});
  assert.equal(out.error,'i7_code_required');assert.equal(db.writes,0);assert.equal(db.rows.regels.size,0);
});
test('TimerService rejects stale i7 code from old tab after persisted list changed',async()=>{
  const {c,db}=runtime({dossiers:[i7],codes:[codes[0]]});c.HH.storage.indexedDB.use(db);
  const out=await c.HH.services.timer.start({currentTimer:null,readCurrentTimer:()=>null,date,time:'09:00',id:'r',
    dossierId:'i7',code:'I7-704',i7Codes:['I7-704'],dossiers:[i7],nowMs:1,nowIso:date+'T09:00:00Z'});
  assert.equal(out.error,'i7_code_required');assert.equal(db.writes,0);
});
test('TimerService accepts a persisted i7 code and requires persisted Commercial for DVN',async()=>{
  const dvn={id:'v',nummer:null,naam:'Voorlopig',voorlopig:true,dvn:true,revision:1},
    {c,db}=runtime({dossiers:[i7,dvn],codes});c.HH.storage.indexedDB.use(db);
  const base={currentTimer:null,readCurrentTimer:()=>null,date,time:'09:00',description:'Werk',kind:'werk',
    dossiers:[i7,dvn],nowMs:1,nowIso:date+'T09:00:00Z'};
  const accepted=await c.HH.services.timer.start({...base,id:'valid',dossierId:'i7',code:'I7-101'});
  assert(accepted.ok,'geldig i7-code geweigerd: '+accepted.error);
  const stopped=await c.HH.services.timer.stop({currentTimer:db.rows.regels.get('valid'),readCurrentTimer:()=>null,
    date,time:'10:00',end:'10:00',nowMs:2,nowIso:date+'T10:00:00Z'});
  assert(stopped.ok,'setup-stop geweigerd');
  const rejected=await c.HH.services.timer.start({...base,id:'wrong-fixed',dossierId:'v',code:'I7-101'});
  assert.equal(rejected.error,'i7_code_mismatch');assert.equal(db.rows.regels.has('wrong-fixed'),false);
});
test('production koppelRegel checks persisted codes, rejecting stale and accepting listed',async()=>{
  const rule={id:'running',datum:date,start:'09:00',eind:null,dossierId:null,code:null,omschrijving:'Work',
    uren:0.1,urenHand:false,soort:'werk',revision:1,gewijzigd:1};
  const {c,db}=runtime({regels:[rule],dossiers:[i7],codes:[codes[0]],meta:{running:rule.id}});
  c.HH.storage.indexedDB.use(db);c.__setTestState({dossiers:[i7],codes,rules:[rule],running:rule});
  const stale=await c.koppelRegel(rule,{dossierId:i7.id,code:'I7-704'});
  assert.equal(stale,null);assert.equal(db.writes,0);assert.equal(db.rows.regels.get(rule.id).dossierId,null);
  const selected=await c.koppelRegel(rule,{dossierId:i7.id,code:'I7-101'});
  assert(selected,'valid i7-code link failed');assert.equal(db.rows.regels.get(rule.id).dossierId,i7.id);
  assert.equal(db.rows.regels.get(rule.id).code,'I7-101');
});
test('new provisional DVN link rejects a Commercial code removed from persisted list',async()=>{
  const rule={id:'running',datum:date,start:'09:00',eind:null,dossierId:null,code:null,omschrijving:'Work',
    uren:0.1,urenHand:false,soort:'werk',revision:1,gewijzigd:1};
  const {c,db}=runtime({regels:[rule],dossiers:[],codes:[codes[0]],meta:{running:rule.id}});
  c.HH.storage.indexedDB.use(db);c.__setTestState({dossiers:[],codes,rules:[rule],running:rule});
  const out=await c.koppelRegel(rule,{nieuwDossier:{naam:'New DVN',nummer:null,lang:'nl'},telUsed:true});
  assert.equal(out,null);assert.equal(db.writes,0);assert.equal(db.rows.dossiers.size,0);
  assert.equal(db.rows.regels.get(rule.id).dossierId,null);
});
test('interrupt starts the captured interval unassigned pending explicit task choice',async()=>{
  const {c}=runtime();let captured=null;
  c.startViaService=async input=>{captured=input;return{rule:{id:'new'}};};
  await vm.runInContext('interrupt',c)('werk','Onderbreking');
  assert.equal(captured.dossierId,null);assert.equal(captured.code,undefined);
});
test('DVN match blocks indirect target and ordinary match locks then restores own name',()=>{
  const ordinary={id:'d',nummer:'123',naam:'Client file'},indirect={id:'x',nummer:'I700000000',naam:'i7',isI7:true};
  const {c,node}=runtime();c.__setTestState({dossiers:[ordinary,indirect]});
  const dlg=node('dvnnum'),number=node('dn-num'),name=node('dn-name'),warn=node('dn-warn');
  dlg.dataset.id='v';dlg.dataset.dnOwnName='My DVN name';number.value='I700000000';name.value='My DVN name';
  const blocked=c.updateDvnNumberMatch();assert.equal(blocked.id,'x');assert.equal(name.readOnly,false);
  assert.match(warn.textContent,/i7- of indirecte dossier/);
  number.value='123';const matched=c.updateDvnNumberMatch();assert.equal(matched.id,'d');
  assert.equal(name.value,'Client file');assert.equal(name.readOnly,true);
  number.value='456';c.updateDvnNumberMatch();assert.equal(name.value,'My DVN name');assert.equal(name.readOnly,false);
});
test('opening a linked DVN match then switching to a new number restores DVN label',()=>{
  const target={id:'d',nummer:'123',naam:'Client file'},alias={id:'v',nummer:null,naam:'Alias label',
    dvn:true,dvnTo:'d',dvnResolvedNr:'123',revision:1};
  const {c,node}=runtime();c.__setTestState({dossiers:[target,alias],codes:[],rules:[]});
  const dlg=node('dvnnum'),number=node('dn-num'),name=node('dn-name'),warn=node('dn-warn');
  dlg.dataset={};number.value='';name.value='';
  c.openDvnNummerSheet('v');
  assert.equal(name.value,'Client file');assert.equal(name.readOnly,true);
  assert.equal(dlg.dataset.dnOwnName,'Alias label');
  number.value='456';c.updateDvnNumberMatch();assert.equal(name.value,'Alias label');assert.equal(name.readOnly,false);
  assert.equal(warn.textContent,'');
});
let failed=0;for(const [name,fn] of cases)try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+': '+error.message);}
console.log(`${cases.length-failed}/${cases.length} Phase AD invariant checks passed`);process.exitCode=failed?1:0;
