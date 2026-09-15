#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(process.argv[2]||join(here,'../..'));
const read=file=>readFileSync(join(root,file),'utf8');
const sources=['js/hh.js','js/domain/time.js','js/domain/booking.js','js/domain/dvn.js',
  'js/domain/overbooking.js','js/storage/indexeddb.js','js/services/admin.js'].map(read);
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const equal=(actual,expected,message)=>assert(actual===expected,
  `${message}\nexpected: ${expected}\nactual: ${actual}`);

// The gateway sees the same asynchronous request/transaction behavior it sees in a browser:
// reads complete later, writes stay private until commit, and aborts publish nothing.
function transactionalDB(seed={}){
  const names=['regels','dossiers','meta','overboekingen'],rows={};
  for(const name of names)rows[name]=new Map(name==='meta'?Object.entries(seed.meta||{}):
    (seed[name]||[]).map(value=>[value.id,clone(value)]));
  let queue=Promise.resolve(),writes=0;
  return{rows,get writes(){return writes;},transaction(requested,mode){
    const stores=Array.isArray(requested)?requested:[requested];let release;
    const previous=queue;queue=new Promise(done=>{release=done;});
    let active=false,pending=0,aborted=false,data,finishing=false;
    const jobs=[],tx={error:null,abort(){aborted=true;tx.error=new Error('aborted');},
      objectStore(name){return{
        get:key=>request(()=>clone(data[name].get(key))),
        getAll:()=>request(()=>[...data[name].values()].map(clone)),
        put:(value,key)=>request(()=>{data[name].set(key===undefined?value.id:key,clone(value));}),
        delete:key=>request(()=>data[name].delete(key)),clear:()=>request(()=>data[name].clear())
      };}};
    function finish(){if(finishing||pending)return;finishing=true;setTimeout(()=>{
      if(aborted)tx.onabort?.();else{if(mode==='readwrite'){
        for(const name of stores)rows[name]=data[name];writes++;}tx.oncomplete?.();}release();
    },0);}
    function request(action){let value;const request={error:null,readyState:'pending',
      get result(){if(this.readyState!=='done')throw new Error('premature IDB result');return value;}};
      pending++;const run=()=>setTimeout(()=>{if(!aborted)try{value=action();request.readyState='done';
        request.onsuccess?.({target:request});}catch(error){request.error=tx.error=error;aborted=true;
        request.onerror?.({target:request});}pending--;finish();},0);
      if(active)run();else jobs.push(run);return request;
    }
    previous.then(()=>{data=Object.fromEntries(stores.map(name=>[name,new Map([...rows[name]]
      .map(([key,value])=>[key,clone(value)]))]));active=true;jobs.forEach(run=>run());finish();});
    return tx;
  }};
}

function load(seed){
  const context={console,setTimeout,clearTimeout,queueMicrotask};vm.createContext(context);
  for(const source of sources)vm.runInContext(source,context);
  const db=transactionalDB(seed);context.HH.storage.indexedDB.use(db);
  return{HH:context.HH,db};
}

const date='2026-09-15',nowIso='2026-09-15T12:00:00Z';
const i7={id:'i7',nummer:'I7-0001',naam:'Indirect',isI7:true,revision:1};
const canonical={id:'matter',nummer:'123456789',naam:'Client matter',revision:1};
const oldReceipt={id:'old-i7-proof',channel:'overbooking_i7',confirmedAt:'2026-09-14T12:00:00Z',
  snapshot:{date:'2026-09-14',targetNumber:i7.nummer,targetName:i7.naam,code:'COM',
    description:'older temporary posting',normalizedDescription:'older temporary posting',hours:0.5,
    roundingMode:'groep',sourceIds:['old-rule'],sources:[]}};
const history=()=>({version:1,receipts:[clone(oldReceipt)],resolutions:[],legacyOrphans:[]});
const makeRule=(target,id='rule')=>({id,datum:date,dossierId:target.id,code:'A',
  omschrijving:'15.09.2026 Work',start:'09:00',eind:'10:00',soort:'werk',revision:1});

function summarize(HH,dossiers){
  return rules=>HH.domain.booking.aggregateIntapp(rules,{roundingMode:'groep',
    getDossier:id=>dossiers.find(item=>item.id===id),
    getIntappInfo:dossier=>HH.domain.dvn.intappInfo(dossier,{dossiers,i7Dossier:i7})});
}
function common(HH,dossiers){return{summarize:summarize(HH,dossiers),hoursOf:HH.domain.booking.hoursOf,
  roundingMode:'groep',commercialCode:'COM',nowIso,nowMs:2};}

async function lifecycle(target,dossiers){
  const rule=makeRule(target),h=load({dossiers:[...dossiers,i7],regels:[rule],overboekingen:[],
    meta:{bookingHistory:history()}}),input=common(h.HH,dossiers),row=input.summarize([rule])[0];
  const parked=await h.HH.services.admin.parkOverbooking({...input,row,target,i7Dossier:i7,
    sourceDate:date,id:'parked',receiptId:'temporary-proof'});
  assert(parked.ok,`park failed: ${parked.error}`);
  const refreshed=await h.HH.services.admin.refreshOverbooking({...input,overbooking:parked.overbooking});
  assert(refreshed.ok,`refresh failed: ${refreshed.error}`);
  const completed=await h.HH.services.admin.completeOverbookings({...input,ids:['parked'],
    overbookings:[refreshed.overbooking],bookedDate:date});
  assert(completed.ok,`complete failed: ${completed.error}`);
  equal(completed.overbookings[0].status,'done','record did not become terminal');
  const receipts=h.db.rows.meta.get('bookingHistory').receipts;
  assert(receipts.some(receipt=>receipt.id===oldReceipt.id),'older i7 receipt was lost');
  assert(receipts.some(receipt=>receipt.id==='temporary-proof'),'parking receipt was lost');
  assert(receipts.some(receipt=>receipt.channel==='overbooking_target'),'target receipt missing');
}

const tests=[];const test=(name,run)=>tests.push([name,run]);
test('numbered DVN can park, refresh and complete while retaining receipts',async()=>{
  const target={...canonical,id:'numbered-dvn',dvn:true};await lifecycle(target,[target]);
});
test('dvnTo alias can park, refresh and complete against its canonical target',async()=>{
  const alias={id:'alias',nummer:null,naam:'Alias label',dvn:true,dvnTo:canonical.id,
    dvnResolvedNr:canonical.nummer,revision:1};await lifecycle(alias,[alias,canonical]);
});
test('stale alias resolution is rejected without a write',async()=>{
  const alias={id:'alias',nummer:null,naam:'Alias label',dvn:true,dvnTo:canonical.id,
    dvnResolvedNr:canonical.nummer,revision:1},rule=makeRule(alias),h=load({
      dossiers:[alias,{...canonical,nummer:'987654321'},i7],regels:[rule],overboekingen:[],meta:{}}),
    input=common(h.HH,[alias,canonical]),row=input.summarize([rule])[0];
  const out=await h.HH.services.admin.parkOverbooking({...input,row,target:alias,i7Dossier:i7,
    sourceDate:date,id:'stale'});
  equal(out.error,'source_changed','stale resolved number was accepted');equal(h.db.writes,0,'reject wrote data');
});
test('indirect and unresolved aliases cannot be parked',async()=>{
  const indirect={id:'indirect',nummer:'TEMP',naam:'Temporary',voorlopig:true,dvn:true,revision:1},
    orphan={id:'alias',naam:'Orphan',dvn:true,dvnTo:'missing',dvnResolvedNr:'123456789',revision:1};
  for(const [label,target,dossiers] of [['indirect',indirect,[indirect]],
    ['unresolved',orphan,[orphan]]]){
    const rule=makeRule(target,label+'-rule'),h=load({dossiers:[...dossiers,i7],regels:[rule],
      overboekingen:[],meta:{}}),input=common(h.HH,dossiers),row=input.summarize([rule])[0];
    const out=await h.HH.services.admin.parkOverbooking({...input,row,target,i7Dossier:i7,
      sourceDate:date,id:label});
    equal(out.error,'invalid_target',`${label} target was accepted`);equal(h.db.writes,0,`${label} reject wrote data`);
  }
});
test('loss of an alias target blocks both refresh and completion',async()=>{
  const alias={id:'alias',nummer:null,naam:canonical.naam,dvn:true,dvnTo:canonical.id,
    dvnResolvedNr:canonical.nummer,revision:1},rule=makeRule(alias),dossiers=[alias,canonical],
    h=load({dossiers:[...dossiers,i7],regels:[rule],overboekingen:[],meta:{}}),
    input=common(h.HH,dossiers),row=input.summarize([rule])[0];
  const parked=await h.HH.services.admin.parkOverbooking({...input,row,target:alias,i7Dossier:i7,
    sourceDate:date,id:'lost-target'});
  assert(parked.ok,`setup park failed: ${parked.error}`);h.db.rows.dossiers.delete(canonical.id);
  const refreshed=await h.HH.services.admin.refreshOverbooking({...input,overbooking:parked.overbooking});
  equal(refreshed.error,'invalid_target','refresh accepted a lost canonical target');
  const completed=await h.HH.services.admin.completeOverbookings({...input,ids:['lost-target'],
    overbookings:[parked.overbooking],bookedDate:date});
  assert(!completed.ok,'completion accepted a lost canonical target');
  equal(h.db.writes,1,'rejected target loss wrote after the original park');
});
test('assignDvnNumber preserves the source date in rules and stack',async()=>{
  const target={id:'new-dvn',nummer:null,naam:'New DVN',voorlopig:true,dvn:true,revision:1},
    rule={...makeRule(target),omschrijving:'15.09.2026 · Old name · Work'},stackRule={...rule};
  const h=load({dossiers:[target,i7],regels:[rule],overboekingen:[],meta:{stack:[stackRule]}});
  const out=await h.HH.services.admin.assignDvnNumber({dossier:target,dossiers:[target,i7],rules:[rule],
    number:'555555555',name:'Resolved name',nowIso,nowMs:2});
  assert(out.ok,`assign failed: ${out.error}`);
  equal(out.rules[0].omschrijving,'15.09.2026 Work','rule date was discarded');
  equal(out.stack[0].omschrijving,'15.09.2026 Work','stack date was discarded');
});

let failed=0;
for(const [name,run] of tests)try{await run();console.log('PASS '+name);}catch(error){
  failed++;console.log('FAIL '+name+': '+(error.stack||error.message));
}
console.log(`${tests.length-failed}/${tests.length} Phase AB service checks passed`);
process.exitCode=failed?1:0;
