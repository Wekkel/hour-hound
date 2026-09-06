#!/usr/bin/env node
/* Bounded lifecycle review for the Phase V writer gateway.  No browser or npm
   package is needed; the fake IDB deliberately keeps request.result pending
   until an event is delivered. */
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const arg=process.argv.find(x=>x.startsWith('--root='));
const root=resolve(arg?arg.slice(7):(process.argv[2]||process.env.HH_TEST_ROOT||join(here,'..','..')));
const storage=readFileSync(join(root,'js/storage/indexeddb.js'),'utf8');
const tests=[]; let failures=0;
const test=(name,fn)=>tests.push({name,fn});
const ok=(v,m)=>{if(!v)throw Error(m||'assertion failed');};
const eq=(a,b,m)=>{if(a!==b)throw Error(`${m||'value'}: ${a} !== ${b}`);};

const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
function persistentDB(seed={}) {
  const copy=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
  const rows={};
  for(const name of ['regels','dossiers','meta','overboekingen','codes','templates'])
    rows[name]=new Map(name==='meta'?Object.entries(seed[name]||{}):(seed[name]||[]).map(x=>[x.id||x.code,copy(x)]));
  let queue=Promise.resolve(),failWrites=0;
  return {rows,failNextWrite(){failWrites++;},transaction(names,mode){
    names=Array.isArray(names)?names:[names];let resolveDone;
    const done=new Promise(r=>resolveDone=r),previous=queue;queue=done;
    let pending=0,aborted=false,active=false,data;const jobs=[];
    const tx={error:null,abort(){aborted=true;tx.error=tx.error||Error('aborted');},objectStore(name){return {
      get:key=>request(()=>copy(data[name].get(key))),
      getAll:()=>request(()=>[...data[name].values()].map(copy)),
      put:(value,key)=>request(()=>{const k=key===undefined?(value.id||value.code):key;data[name].set(k,copy(value));return k;}),
      add:(value,key)=>tx.objectStore(name).put(value,key),
      delete:key=>request(()=>data[name].delete(key)),clear:()=>request(()=>data[name].clear())
    };}};
    function finish(){setTimeout(()=>{if(pending)return;
      if(mode==='readwrite'&&failWrites){failWrites--;aborted=true;tx.error=Error('injected database failure');}
      if(aborted){tx.onabort?.();resolveDone();return;}
      if(mode==='readwrite'){for(const n of names)rows[n]=data[n];}
      tx.oncomplete?.();resolveDone();},0);}
    function request(fn){let value;const r={readyState:'pending',error:null,get result(){
      if(r.readyState!=='done')throw Error('IDBRequest.result accessed while pending');return value;}};
      pending++;const run=()=>setTimeout(()=>{if(!aborted)try{value=fn();r.readyState='done';r.onsuccess?.({target:r});}
        catch(e){r.error=tx.error=e;aborted=true;r.onerror?.({target:r});}pending--;if(!pending)finish();},0);
      if(active)run();else jobs.push(run);return r;
    }
    previous.then(()=>{data=Object.fromEntries(names.map(n=>[n,new Map([...rows[n]].map(([k,v])=>[k,copy(v)]))]));active=true;jobs.splice(0).forEach(j=>j());if(!pending)finish();});
    return tx;
  }};
}
function fakeDb(seed={},opts={}){const db=persistentDB(seed);if(opts.failTx)db.failNextWrite();return db;}
function vmStorage(db){
  const context={console,setTimeout,clearTimeout,queueMicrotask,indexedDB:{}};
  vm.createContext(context);vm.runInContext('(globalThis.HH={storage:{}})',context);
  vm.runInContext(storage,context,{filename:'js/storage/indexeddb.js'});
  context.HH.storage.indexedDB.use(db); return context.HH.storage.indexedDB;
}

class SharedLocks {
  constructor(){this.owner=null;this.waiters=[];}
  request(name,opts,callback){
    const run=()=>{if(this.owner&&opts.ifAvailable)return callback(null);
      this.owner=true;
      return Promise.resolve(callback({name,mode:opts.mode})).finally(()=>{
        this.owner=false;const next=this.waiters.shift();if(next)next();
      });};
    if(this.owner&&!opts.ifAvailable)return new Promise(resolve=>this.waiters.push(()=>run().then(resolve,resolve)));
    return run();
  }
}

test('IDB request.result is strict while pending',async()=>{
  const db=fakeDb({regels:[{id:'a'}]}); const s=vmStorage(db); const p=s.getAll('regels');
  await new Promise(r=>setTimeout(r,0)); // request timer has not necessarily fired
  let threw=false; try{db.transaction('regels','readonly').objectStore('regels').getAll().result;}catch(e){threw=true;}
  ok(threw,'pending result was readable'); await p;
});

test('two VM writers are exclusive; readonly reads remain available',async()=>{
  const locks=new SharedLocks(), a=vmStorage(fakeDb()), b=vmStorage(fakeDb());
  eq(await a.acquireWriteLock(locks,false),true,'first acquire'); eq(await b.acquireWriteLock(locks,false),false,'second acquire');
  eq(await b.get('regels','missing'),undefined,'readonly get'); let blocked=false;
  try{await b.put('regels',{id:'x'});}catch(e){blocked=e.code==='read_only';} ok(blocked,'write was not blocked');
  await a.releaseWriteLock(); eq(await b.acquireWriteLock(locks,false),true,'takeover after release'); await b.releaseWriteLock();
});

test('release waits for admitted transaction completion',async()=>{
  const locks=new SharedLocks(), db=fakeDb({regels:[]}), a=vmStorage(db), b=vmStorage(db);
  await a.acquireWriteLock(locks,false);
  let committed=false;
  const tx=a.tx('regels','readwrite',o=>o.put({id:'x'})).then(()=>{committed=true;});
  const next=b.acquireWriteLock(locks,true); await Promise.resolve();
  ok(!b.hasWriteAccess(),'second writer acquired before old transaction');
  await a.releaseWriteLock(); ok(committed&&db.rows.regels.has('x'),'lock released before commit'); await tx; eq(await next,true,'second acquire after commit');
  await b.tx('regels','readwrite',o=>o.put({id:'y'}));
  ok(db.rows.regels.has('x')&&db.rows.regels.has('y'),'shared committed data missing'); await b.releaseWriteLock();
});

test('unsupported locks fail closed',async()=>{
  const s=vmStorage(fakeDb()); eq(await s.acquireWriteLock(undefined,false),false,'unsupported acquire'); let blocked=false;
  try{await s.put('regels',{id:'x'});}catch(e){blocked=e.code==='read_only';} ok(blocked,'unsupported writer allowed');
});

test('failed writer transaction rejects and does not notify',async()=>{
  const db=fakeDb({}, {failTx:true}),s=vmStorage(db); let n=0;s.onCommit(()=>n++);let failed=false;
  try{await s.atomicWrite({stores:['regels']},(snap,w)=>{w.put('regels',{id:'x'});return {ok:true};});}catch(e){failed=true;} ok(failed,'failed tx resolved');eq(n,0,'failure notified');ok(!db.rows.regels.has('x'),'failed write persisted');
});

test('atomic commit excludes log metadata but reports real metadata',async()=>{
  const s=vmStorage(fakeDb({meta:{}})),seen=[];s.onCommit(x=>seen.push(x));
  await s.atomicWrite({metaKeys:['log']},(snap,w)=>{w.put('meta',[{x:1}],'log');return {ok:true};});eq(seen.length,0,'log notified');
  await s.atomicWrite({metaKeys:['running']},(snap,w)=>{w.put('meta',{id:'r'},'running');return {ok:true};});eq(seen.length,1,'metadata omitted');eq(seen[0][0],'meta','metadata notification');
});

test('acquire is idempotent and rapid release/reacquire is safe',async()=>{
  const l=new SharedLocks(),s=vmStorage(fakeDb());eq(await s.acquireWriteLock(l,false),true,'acquire');eq(await s.acquireWriteLock(l,false),true,'double acquire');await s.releaseWriteLock();eq(s.hasWriteAccess(),false,'released');eq(await s.acquireWriteLock(l,false),true,'reacquire');await s.releaseWriteLock();
});

for(const t of tests){try{await t.fn();console.log(`PASS ${t.name}`);}catch(e){failures++;console.log(`FAIL ${t.name}: ${e.message}`);}}
process.exitCode=failures?1:0;
