#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(process.argv[2]||join(here,'../..'));
const read=f=>readFileSync(join(root,f),'utf8');
const files=['js/hh.js','js/domain/time.js','js/domain/booking.js','js/domain/dvn.js','js/domain/overbooking.js','js/storage/indexeddb.js','js/services/admin.js'];
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
function db(seed={},fail=false){
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
        put:(value,key)=>request(()=>{if(fail&&mode==='readwrite')throw new Error('injected failure');const id=key===undefined?(value.id||value.code):key;
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
function service(seed={},fail=false){const c={console,setTimeout,clearTimeout,queueMicrotask};vm.createContext(c);for(const f of files)vm.runInContext(read(f),c);c.HH.storage.indexedDB.use(db(seed,fail));return c.HH;}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);const assert=(x,m)=>{if(!x)throw Error(m)};
test('parallel same number creates one',async()=>{const d=db();const A=service({},false),B=service({},false);A.storage.indexedDB.use(d);B.storage.indexedDB.use(d);const [a,b]=await Promise.all([A.services.admin.createDossier({id:'a',naam:'A',nummer:' Ab 1 ',nowMs:1}),B.services.admin.createDossier({id:'b',naam:'B',nummer:'ab 1',nowMs:2})]);assert([a.ok,b.ok].filter(Boolean).length===1,'both creates committed');assert([...d.rows.dossiers.values()].length===1,'duplicate persisted');});
test('ensureI7 is idempotent when doubled',async()=>{const d=db();const A=service(),B=service();A.storage.indexedDB.use(d);B.storage.indexedDB.use(d);const [a,b]=await Promise.all([A.services.admin.ensureI7({nowMs:1}),B.services.admin.ensureI7({nowMs:2})]);assert(a.ok&&b.ok,'ensure failed');assert([...d.rows.dossiers.values()].filter(x=>x.isI7).length===1,'two I7 rows');});
test('occupied d-i7 is preserved',async()=>{const old={id:'d-i7',nummer:'X',naam:'Existing',revision:7,gewijzigd:9,custom:'keep'};const backing=db({dossiers:[old]}),H=service();H.storage.indexedDB.use(backing);const out=await H.services.admin.ensureI7({nowMs:10});assert(out.ok,'ensure occupied id failed');assert(out.dossier.id!=='d-i7','occupied id overwritten');assert(JSON.stringify(backing.rows.dossiers.get('d-i7'))===JSON.stringify(old),'occupied row changed');assert([...backing.rows.dossiers.values()].filter(x=>x.isI7).length===1,'I7 missing');});
test('transaction failure has no memory success',async()=>{const H=service({},true);assert(typeof H.services.admin.createDossier==='function','createDossier API missing before failure injection');let called=false;try{const out=await H.services.admin.createDossier({id:'a',naam:'A',nummer:'1'});called=!!out.ok;}catch{}assert(!called,'failure returned success');});
test('creation starts at revision one and retry cannot overwrite',async()=>{const H=service();assert(typeof H.services.admin.createDossier==='function','createDossier API missing');const out=await H.services.admin.createDossier({id:'a',naam:'A',nummer:'1',revision:8,nowMs:3});assert(out.ok&&out.dossier.revision===1,'creation always starts at revision one');const retry=await H.services.admin.createDossier({id:'a',naam:'A',nummer:'1',revision:8});assert(!retry.ok,'retry overwrote existing');assert(H.storage.indexedDB.revisionOf(out.dossier)===1,'revision not preserved');});
test('legacy prefix claims existing fields and revision',async()=>{const old={id:'legacy',nummer:'i7123',naam:'Old',revision:4,gewijzigd:2,custom:'yes'};const H=service({dossiers:[old]});const out=await H.services.admin.ensureI7({nowMs:8});assert(out.ok&&out.dossier.isI7&&out.dossier.revision===5&&out.dossier.custom==='yes','legacy fields changed');});

test('makeDossier defers state until service commit',async()=>{const c={console,setTimeout,clearTimeout,queueMicrotask,Date,Math};vm.createContext(c);vm.runInContext(read('js/hh.js'),c);let resolve,upserts=0;c.HH.state={read:()=>({dossiers:[]}),upsert(){upserts++;}};c.HH.services.admin={createDossier:()=>new Promise(r=>{resolve=r;})};Object.assign(c,{uid:()=>"u",idKort:x=>x,kort:x=>x,L(){},logOms:false});vm.runInContext(read('js/timer.js').slice(read('js/timer.js').indexOf('async function makeDossier'),read('js/timer.js').indexOf('\n\n/* De stapel',read('js/timer.js').indexOf('async function makeDossier'))),c);const pending=c.makeDossier('Naam','1','nl');pending.catch(()=>{});await new Promise(r=>setTimeout(r,5));assert(upserts===0,'makeDossier updated memory before commit');resolve({ok:true,dossier:{id:'u',naam:'Naam'}});await pending;assert(upserts===1,'makeDossier did not apply committed result');});
test('makeDossier rejection preserves memory',async()=>{const c={console,setTimeout,clearTimeout,queueMicrotask,Date,Math};vm.createContext(c);vm.runInContext(read('js/hh.js'),c);let upserts=0;c.HH.state={read:()=>({dossiers:[]}),upsert(){upserts++;}};c.HH.services.admin={createDossier:async()=>{throw Error('injected');}};Object.assign(c,{uid:()=>"u",idKort:x=>x,kort:x=>x,L(){},logOms:false});vm.runInContext(read('js/timer.js').slice(read('js/timer.js').indexOf('async function makeDossier'),read('js/timer.js').indexOf('\n\n/* De stapel',read('js/timer.js').indexOf('async function makeDossier'))),c);let failed=false;try{await c.makeDossier('Naam','1','nl');}catch{failed=true;}assert(failed&&upserts===0,'rejected makeDossier changed memory');});
test('Beheer submit failure retains inputs and skips render/success toast',async()=>{const els={"b-naam":{value:' Naam '},"b-nr":{value:' 42 '},"b-lang":{value:'nl'},"b-adddos":{}};let renders=0,success=0,shown=[];const c={console,setTimeout,clearTimeout,queueMicrotask,Date,Math,document:{getElementById:id=>els[id]},$:id=>els[id],HH:{services:{admin:{}},app:{render(){renders++;}},state:{read:()=>({}),upsert(){}}},nummerBezet:()=>false,makeDossier:async()=>{throw Error('injected')},toast:x=>shown.push(x),uid:()=>"u"};vm.createContext(c);const src=read('js/ui/manage-controller.js'),a=src.indexOf('$("b-adddos").onclick='),b=src.indexOf('\n',src.indexOf('};',a)+2);vm.runInContext(src.slice(a,b),c);await c.$('b-adddos').onclick();assert(els['b-naam'].value===' Naam '&&els['b-nr'].value===' 42 ','failed submit changed inputs');assert(renders===0&&success===0&&!shown.some(x=>x==='Dossier toegevoegd'),'failed submit rendered success');});
test('Beheer successful retry clears once',async()=>{const els={"b-naam":{value:'Naam'},"b-nr":{value:'42'},"b-lang":{value:'nl'},"b-adddos":{}};let renders=0,success=0,attempts=0;let c={console,setTimeout,clearTimeout,queueMicrotask,Date,Math,document:{getElementById:id=>els[id]},$:id=>els[id],HH:{services:{admin:{}},app:{render(){renders++;}},state:{read:()=>({}),upsert(){}}},nummerBezet:()=>false,makeDossier:async()=>{if(++attempts===1)throw Error('injected');return{id:'u'};},toast:x=>{if(x==='Dossier toegevoegd')success++;},uid:()=>"u"};vm.createContext(c);const src=read('js/ui/manage-controller.js'),a=src.indexOf('$("b-adddos").onclick='),b=src.indexOf('\n',src.indexOf('};',a)+2);vm.runInContext(src.slice(a,b),c);await c.$('b-adddos').onclick();assert(els['b-naam'].value==='Naam'&&renders===0,'failure before retry lost input');await c.$('b-adddos').onclick();assert(els['b-naam'].value===''&&els['b-nr'].value===''&&renders===1&&success===1,'success submit did not clear once');});

test('legacy claim blocks a stale administrative save',async()=>{
  const old={id:'old',nummer:'i7123',naam:'Original',revision:4,gewijzigd:2,custom:'keep'};
  const backing=db({dossiers:[old]}),H=service();H.storage.indexedDB.use(backing);
  const ensured=await H.services.admin.ensureI7({nowMs:8});
  assert(ensured.dossier.gewijzigd===8,'modification time not advanced');
  const stale=await H.services.admin.saveDossier({dossier:{...old,naam:'Stale'},nowMs:9});
  assert(!stale.ok&&stale.error==='admin_changed','stale save accepted');
  assert(JSON.stringify(backing.rows.dossiers.get('old'))===JSON.stringify({...old,isI7:true,revision:5,gewijzigd:8}),'persisted claim damaged');
});
test('occupied creation ID preserves the complete record',async()=>{
  const old={id:'a',naam:'Keep',nummer:'1',revision:5};
  const backing=db({dossiers:[old]}),H=service();H.storage.indexedDB.use(backing);
  const out=await H.services.admin.createDossier({id:'a',naam:'Replace',nummer:'2'});
  assert(!out.ok&&out.error==='id_exists','occupied ID accepted');
  assert(JSON.stringify(backing.rows.dossiers.get('a'))===JSON.stringify(old),'old record overwritten');
});
test('whitespace around occupied i7 number cannot create a duplicate',async()=>{
  const old={id:'other',naam:'Keep',nummer:' I700000000 ',revision:3};
  const backing=db({dossiers:[old]}),H=service();H.storage.indexedDB.use(backing);
  const out=await H.services.admin.ensureI7({});
  assert(!out.ok&&out.error==='i7_number_occupied','ambiguous number accepted');
  assert(backing.rows.dossiers.size===1&&JSON.stringify(backing.rows.dossiers.get('other'))===JSON.stringify(old),'ambiguous row changed');
});
test('failed transaction leaves persisted dossiers unchanged',async()=>{
  const old={id:'a',naam:'Keep',nummer:'1'};
  const backing=db({dossiers:[old]},true),H=service();H.storage.indexedDB.use(backing);
  assert(typeof H.services.admin.createDossier==='function','creation API missing');
  let error;try{await H.services.admin.createDossier({id:'b',naam:'New',nummer:'2'});}catch(e){error=e;}
  assert(error,'injected write did not reject');
  assert(backing.rows.dossiers.size===1&&JSON.stringify(backing.rows.dossiers.get('a'))===JSON.stringify(old),'failed transaction changed persisted data');
});
let n=0;for(const [name,fn] of tests){try{await fn();console.log('ok',name);n++;}catch(e){console.error('not ok',name,e.stack);process.exitCode=1;}}console.log(`${n}/${tests.length} behavioral tests passed`);
