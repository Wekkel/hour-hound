"use strict";
/* IndexedDB-grens voor Hour Hound. De gateway bezit openen, upgraden en transacties;
   repositories kennen alleen hun store of configuratiesleutels. Workflows houden
   zelf het eigenaarschap over transacties die meerdere stores tegelijk raken. */
(function(root){
  const storage=root.HH.storage;
  const DB_NAME="hourhound",DB_VERSION=4;
  const TIMER_STORES=Object.freeze(["regels","meta","dossiers","overboekingen"]);
  const SNAPSHOT_STORES=Object.freeze([
    "dossiers","templates","codes","regels","overboekingen","meta"]);
  const SNAPSHOT_META_KEYS=Object.freeze([
    "stack","dagEinde","dagAudit","running","pending","codeGebruik","geboekt","bookingHistory",
    "log","logOms","thema","rondMode"]);
  let database=null;
  let writeGuard=null;
  let writer=false,draining=false,releaseWriter=null,lockRequest=null,acquiring=null;
  const activeWrites=new Set(),idleWaiters=[],commitListeners=new Set();
  const LOCK_NAME="hourhound-writer-v1";

  function upgrade(d){
    if(!d.objectStoreNames.contains("days"))d.createObjectStore("days",{keyPath:"date"});
    if(!d.objectStoreNames.contains("matters"))d.createObjectStore("matters",{keyPath:"id"});
    if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta");
    if(!d.objectStoreNames.contains("templates"))d.createObjectStore("templates",{keyPath:"id"});
    if(!d.objectStoreNames.contains("codes"))d.createObjectStore("codes",{keyPath:"code"});
    if(!d.objectStoreNames.contains("dossiers"))d.createObjectStore("dossiers",{keyPath:"id"});
    if(!d.objectStoreNames.contains("overboekingen"))
      d.createObjectStore("overboekingen",{keyPath:"id"});
    if(!d.objectStoreNames.contains("regels")){
      const s=d.createObjectStore("regels",{keyPath:"id"});
      s.createIndex("datum","datum");
    }
  }

  function open(options){
    const o=options||{},idb=o.indexedDB||root.indexedDB;
    return new Promise((resolve,reject)=>{
      const request=idb.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>upgrade(request.result);
      request.onsuccess=()=>{
        const opened=request.result;database=opened;
        opened.onversionchange=()=>{
          opened.close();if(database===opened)database=null;
          if(typeof o.onVersionChange==="function")o.onVersionChange();
        };
        resolve(opened);
      };
      request.onerror=()=>reject(request.error);
    });
  }

  function use(opened){database=opened;return opened;}
  function current(){
    if(!database)throw new Error("IndexedDB is nog niet geopend");
    return database;
  }
  function resultOf(value){
    if(typeof value==="function")return value();
    if(value&&typeof value==="object"&&"result" in value)return value.result;
    return value;
  }
  function observedStore(store,name,changed){return new Proxy(store,{get(target,key){
    const value=target[key];if(typeof value!=="function")return value;
    return function(...args){
      if(key==="put"||key==="add"||key==="delete"||key==="clear"){
        const metaKey=key==="put"||key==="add"?args[1]:args[0];
        if(name!=="meta"||key==="clear"||!["log","mutationOps"].includes(metaKey))changed.add(name);
      }
      return value.apply(target,args);
    };
  }});}
  function writeFinished(transaction,changed,committed){
    activeWrites.delete(transaction);
    if(committed&&changed.size)commitListeners.forEach(fn=>{try{fn([...changed]);}catch(ignore){}});
    if(!activeWrites.size)idleWaiters.splice(0).forEach(resolve=>resolve());
  }
  function waitForWrites(){return activeWrites.size?new Promise(resolve=>idleWaiters.push(resolve)):Promise.resolve();}
  function pauseWrites(){draining=true;return waitForWrites();}
  function resumeWrites(){draining=false;}
  function onCommit(fn){commitListeners.add(fn);return()=>commitListeners.delete(fn);}
  function tx(stores,mode,fn){return new Promise((resolve,reject)=>{
    let transaction,result,failure;const changed=new Set(),writing=mode==="readwrite";
    try{
      if(writing&&writeGuard)writeGuard();
      transaction=current().transaction(stores,mode);
      if(writing)activeWrites.add(transaction);
      transaction.oncomplete=()=>{if(writing)writeFinished(transaction,changed,true);
        try{resolve(resultOf(result));}catch(error){reject(error);}};
      transaction.onabort=()=>{if(writing)writeFinished(transaction,changed,false);
        reject(failure||transaction.error||new Error("afgebroken"));};
      transaction.onerror=()=>{failure=transaction.error;try{transaction.abort();}catch(ignore){}};
      const object=name=>observedStore(transaction.objectStore(name),name,changed);
      const objects=Array.isArray(stores)?Object.fromEntries(stores.map(name=>[name,object(name)])):object(stores);
      result=fn(objects,transaction);
    }catch(error){
      failure=error;
      if(transaction)try{transaction.abort();}catch(ignore){if(writing)writeFinished(transaction,changed,false);reject(error);}
      else reject(error);
    }
  });}

  /* Lezen, valideren en schrijven blijven in dezelfde actieve IDB-transactie.
     De callback is synchroon: geen await tussen de laatste read en de writes. */
  function atomicWrite(options,prepare){return new Promise((resolve,reject)=>{
    const o=options||{},recordStores=[...new Set(o.stores||[])].filter(n=>n!=="meta"),
      metaKeys=[...new Set((o.metaKeys||[]).concat(o.operationId?["mutationOps"]:[]))],
      names=[...new Set(recordStores.concat(metaKeys.length?["meta"]:[]))];
    let transaction,result,failure;const changed=new Set();
    const abort=error=>{failure=error;try{transaction.abort();}catch(ignore){
      if(transaction)writeFinished(transaction,changed,false);reject(error);}};
    try{
      if(writeGuard)writeGuard();
      transaction=current().transaction(names,"readwrite");activeWrites.add(transaction);
      transaction.oncomplete=()=>{writeFinished(transaction,changed,true);resolve(result);};
      transaction.onabort=()=>{writeFinished(transaction,changed,false);
        if(!failure&&result&&result.ok===false)resolve(result);
        else reject(failure||transaction.error||new Error("mutatie afgebroken"));};
      transaction.onerror=()=>abort(transaction.error||new Error("mutatie mislukt"));
      const stores=Object.fromEntries(names.map(name=>[name,
        observedStore(transaction.objectStore(name),name,changed)]));
      const recordRequests=Object.fromEntries(recordStores.map(name=>[name,stores[name].getAll()]));
      const metaRequests=Object.fromEntries(metaKeys.map(key=>[key,stores.meta.get(key)]));
      const requests=Object.values(recordRequests).concat(Object.values(metaRequests));
      let remaining=requests.length,prepared=false;
      const run=()=>{
        if(prepared||remaining)return;prepared=true;
        try{
          // A draining owner completes its already admitted transaction before releasing the lock.
          const snapshot={};recordStores.forEach(name=>snapshot[name]=recordRequests[name].result||[]);
          snapshot.meta=Object.fromEntries(metaKeys.map(key=>[key,metaRequests[key].result]));
          const operations=snapshot.meta.mutationOps||{};
          if(o.operationId&&Object.prototype.hasOwnProperty.call(operations,o.operationId)){
            result={ok:true,noChange:true,replayed:true,reload:true,operationId:o.operationId};return;}
          const writer={stores,snapshot,put:(store,value,key)=>stores[store].put(value,key),
            remove:(store,key)=>stores[store].delete(key)};
          result=prepare(snapshot,writer);
          if(result&&typeof result.then==="function")throw new Error("Een atomaire mutatie moet synchroon zijn");
          if(result&&result.ok===false){transaction.abort();return;}
          if(o.operationId){
            const next=Object.assign({},operations,{[o.operationId]:{
              operationId:o.operationId,completedAt:o.completedAt||new Date().toISOString()}});
            const keys=Object.keys(next);while(keys.length>40)delete next[keys.shift()];
            stores.meta.put(next,"mutationOps");}
        }catch(error){abort(error);}
      };
      requests.forEach(request=>{request.onsuccess=()=>{remaining--;run();};
        request.onerror=()=>abort(request.error||new Error("lezen voor mutatie mislukt"));});
      if(!requests.length)run();
    }catch(error){if(transaction)abort(error);else reject(error);}
  });}

  const revisionOf=rule=>Number.isInteger(rule&&rule.revision)?rule.revision:0;
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function mergeRule(current,before,desired,nowMs){
    if(!current||!before||current.id!==before.id||desired.id!==before.id)
      return{ok:false,error:"rule_changed"};
    const patch={},conflicts=[];
    [...new Set(Object.keys(before).concat(Object.keys(desired)))].forEach(key=>{
      if(key==="revision"||key==="gewijzigd"||key==="id")return;
      if(same(before[key],desired[key]))return;
      if(!same(current[key],before[key])&&!same(current[key],desired[key]))conflicts.push(key);
      else patch[key]=desired[key];
    });
    if(conflicts.length)return{ok:false,error:"rule_changed",conflicts};
    if(!Object.keys(patch).length)return{ok:true,noChange:true,rule:current};
    const rule=Object.assign({},current,patch,{gewijzigd:nowMs,revision:revisionOf(current)+1});
    return{ok:true,rule,patch};
  }
  function replaceRule(current,desired,nowMs){
    return Object.assign({},desired,{gewijzigd:nowMs,revision:revisionOf(current)+1});}
  function createdRule(rule,nowMs){
    return Object.assign({},rule,{gewijzigd:nowMs,revision:Math.max(1,revisionOf(rule))});}
  function setWriteGuard(fn){writeGuard=typeof fn==="function"?fn:null;}
  function readOnlyError(){const error=new Error("Dit venster is alleen-lezen");
    error.code="read_only";return error;}
  function hasWriteAccess(){return writer;}
  function requireWriteLock(){setWriteGuard(()=>{if(!writer||draining)throw readOnlyError();});}
  function acquireWriteLock(lockManager,wait){
    const manager=lockManager&&lockManager.locks||lockManager;
    requireWriteLock();
    if(!manager||typeof manager.request!=="function")return Promise.resolve(false);
    if(writer)return Promise.resolve(!draining);
    if(acquiring)return acquiring;
    let ready;
    acquiring=new Promise(resolve=>{ready=resolve;});
    const pending=acquiring,options={mode:"exclusive"};if(!wait)options.ifAvailable=true;
    try{lockRequest=manager.request(LOCK_NAME,options,async lock=>{
      if(!lock){acquiring=null;ready(false);return;}
      writer=true;draining=false;
      const held=new Promise(done=>{releaseWriter=done;});
      acquiring=null;ready(true);await held;
    }).catch(()=>{acquiring=null;writer=false;ready(false);});}
    catch(error){acquiring=null;ready(false);}
    return pending;
  }
  async function releaseWriteLock(){
    await pauseWrites();writer=false;
    if(releaseWriter){const done=releaseWriter;releaseWriter=null;done();}
    if(lockRequest)await lockRequest;
  }

  const getAll=store=>tx(store,"readonly",object=>object.getAll());
  const get=(store,key)=>tx(store,"readonly",object=>object.get(key));
  const put=(store,value)=>tx(store,"readwrite",object=>object.put(value));
  const putKey=(store,value,key)=>tx(store,"readwrite",object=>object.put(value,key));
  const remove=(store,key)=>tx(store,"readwrite",object=>object.delete(key));
  const replaceAll=(store,rows)=>tx(store,"readwrite",object=>{
    object.clear();rows.forEach(row=>object.put(row));
  });

  function recordRepository(store){return Object.freeze({
    all:()=>getAll(store),
    get:key=>get(store,key),
    put:value=>put(store,value),
    remove:key=>remove(store,key),
    replaceAll:rows=>replaceAll(store,rows)
  });}
  const config=Object.freeze({
    get:key=>get("meta",key),
    put:(key,value)=>putKey("meta",value,key),
    remove:key=>remove("meta",key),
    getMany(keys){return tx("meta","readonly",object=>{
      const requests=Object.fromEntries(keys.map(key=>[key,object.get(key)]));
      return()=>Object.fromEntries(keys.map(key=>[key,requests[key].result]));
    });}
  });

  function loadSnapshot(){return tx(SNAPSHOT_STORES.slice(),"readonly",objects=>{
    const requests={
      dossiers:objects.dossiers.getAll(),templates:objects.templates.getAll(),
      codes:objects.codes.getAll(),regels:objects.regels.getAll(),
      overboekingen:objects.overboekingen.getAll(),
      meta:Object.fromEntries(SNAPSHOT_META_KEYS.map(key=>[key,objects.meta.get(key)]))
    };
    return()=>({
      dossiers:requests.dossiers.result,templates:requests.templates.result,
      codes:requests.codes.result,regels:requests.regels.result,
      overboekingen:requests.overboekingen.result,
      meta:Object.fromEntries(SNAPSHOT_META_KEYS.map(key=>[key,requests.meta[key].result]))
    });
  });}

  storage.indexedDB=Object.freeze({
    DB_NAME,DB_VERSION,TIMER_STORES,SNAPSHOT_STORES,SNAPSHOT_META_KEYS,
    open,use,current,tx,getAll,get,put,putKey,remove,replaceAll,loadSnapshot,
    atomicWrite,revisionOf,mergeRule,replaceRule,createdRule,setWriteGuard,
    acquireWriteLock,releaseWriteLock,hasWriteAccess,requireWriteLock,
    waitForWrites,pauseWrites,resumeWrites,onCommit,LOCK_NAME
  });
  storage.repositories=Object.freeze({
    regels:recordRepository("regels"),
    dossiers:recordRepository("dossiers"),
    config,
    overboekingen:recordRepository("overboekingen"),
    loadSnapshot
  });
})(globalThis);
