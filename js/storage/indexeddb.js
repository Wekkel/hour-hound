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
    "stack","dagEinde","dagAudit","running","pending","codeGebruik","geboekt",
    "log","logOms","thema","rondMode"]);
  let database=null;

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
  function tx(stores,mode,fn){return new Promise((resolve,reject)=>{
    let transaction,result;
    try{
      transaction=current().transaction(stores,mode);
      const objects=Array.isArray(stores)
        ?Object.fromEntries(stores.map(name=>[name,transaction.objectStore(name)]))
        :transaction.objectStore(stores);
      result=fn(objects,transaction);
    }catch(error){
      if(transaction)try{transaction.abort();}catch(ignore){}
      reject(error);return;
    }
    transaction.oncomplete=()=>{
      try{resolve(resultOf(result));}catch(error){reject(error);}
    };
    transaction.onerror=()=>reject(transaction.error);
    transaction.onabort=()=>reject(transaction.error||new Error("afgebroken"));
  });}

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
    open,use,current,tx,getAll,get,put,putKey,remove,replaceAll,loadSnapshot
  });
  storage.repositories=Object.freeze({
    regels:recordRepository("regels"),
    dossiers:recordRepository("dossiers"),
    config,
    overboekingen:recordRepository("overboekingen"),
    loadSnapshot
  });
})(globalThis);
