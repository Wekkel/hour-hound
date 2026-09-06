import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const base='https://example.test/hour-hound/';
const url=value=>new URL(typeof value==='string'?value:value.url,base).href;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(){
  const events={},stores=new Map(),calls={fetch:[],install:[],skip:0,claim:0};
  const faults={add:false,put:false,open:false,match:false};
  class Cache{
    data=new Map();
    async match(key){if(faults.match)throw Error('cache read failed');return this.data.get(url(key))?.clone();}
    async put(key,response){if(faults.put)throw Error('cache write failed');this.data.set(url(key),response.clone());}
    async addAll(requests){
      calls.install.push(...requests);
      if(faults.add)throw Error('missing required asset');
      // Model addAll's all-or-nothing batch; native Request/Response for its inputs.
      const batch=requests.map(req=>[url(req),new Response('installed:'+url(req))]);
      batch.forEach(([key,value])=>this.data.set(key,value));
    }
  }
  const caches={
    async open(name){if(faults.open)throw Error('cache unavailable');if(!stores.has(name))stores.set(name,new Cache());return stores.get(name);},
    async keys(){return [...stores.keys()];},
    async delete(name){return stores.delete(name);},
    async match(req){for(const cache of stores.values()){const hit=await cache.match(req);if(hit)return hit;}}
  };
  const context=vm.createContext({URL,Request,Response,console:{error(){}},location:{href:base+'sw.js',origin:new URL(base).origin},caches,
    fetch:async req=>{calls.fetch.push(url(req));return new Response('new network');},
    self:{addEventListener:(type,fn)=>events[type]=fn,clients:{claim:async()=>{calls.claim++;}},skipWaiting:async()=>{calls.skip++;}}});
  vm.runInContext(source,context);
  async function dispatch(type,extra={}){
    const waits=[];let response;
    events[type]({...extra,waitUntil:p=>waits.push(p),respondWith:p=>{response=Promise.resolve(p);response.catch(()=>{});}});
    await Promise.all(waits);return response?await response:undefined;
  }
  let version;await dispatch('message',{data:{type:'GET_VERSION'},ports:[{postMessage:m=>version=m}]});
  const active=await caches.open(version.cache);
  return {calls,faults,stores,caches,context,dispatch,active,version,
    get:(file,options={})=>dispatch('fetch',{request:options.mode==='navigate'?{url:url(file),method:'GET',mode:'navigate'}:new Request(url(file),options)})};
}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('failed install rejects and preserves the old release',async()=>{
  const h=await harness(),old=await h.caches.open('hourhound-previous');await old.put('index.html',new Response('old'));
  h.faults.add=true;await assert.rejects(h.dispatch('install'),/missing required/);
  assert.equal(await (await old.match('index.html')).text(),'old');assert.equal(h.calls.skip,0);assert.equal(h.calls.claim,0);
});
test('complete install bypasses HTTP cache and waits for explicit activation',async()=>{
  const h=await harness();await h.dispatch('install');assert(h.calls.install.length>20);
  assert(h.calls.install.every(req=>req instanceof Request&&req.cache==='reload'));
  assert(h.calls.install.every(req=>req.url.startsWith(base)));assert.equal(h.calls.skip,0);
});
test('activation deletes only old Hour Hound caches',async()=>{
  const h=await harness();await h.caches.open('hourhound-previous');await h.caches.open('another-app');await h.dispatch('activate');
  assert.deepEqual([...h.stores.keys()].sort(),['another-app',h.version.cache].sort());assert.equal(h.calls.claim,1);
});
test('navigation keeps active HTML even when network serves a newer release',async()=>{
  const h=await harness();await h.active.put('index.html',new Response('active HTML'));
  assert.equal(await (await h.get('./?screen=day',{mode:'navigate'})).text(),'active HTML');assert.equal(h.calls.fetch.length,0);
});
test('offline navigation works from active cache',async()=>{
  const h=await harness();await h.active.put('index.html',new Response('offline HTML'));h.context.fetch=async()=>{throw Error('offline');};
  assert.equal(await (await h.get('./',{mode:'navigate'})).text(),'offline HTML');
});
test('navigation never takes HTML from another release cache',async()=>{
  const h=await harness(),old=await h.caches.open('hourhound-previous');await old.put('index.html',new Response('wrong release'));
  h.context.fetch=async()=>{throw Error('offline');};assert.equal((await h.get('./',{mode:'navigate'})).type,'error');
});
test('required asset missing from active release never falls back to network',async()=>{
  const h=await harness();assert.equal((await h.get('js/core.js')).type,'error');assert.equal(h.calls.fetch.length,0);
});
test('required assets never come from a different cache',async()=>{
  const h=await harness(),old=await h.caches.open('hourhound-previous');await old.put('js/core.js',new Response('old script'));
  assert.equal((await h.get('js/core.js')).type,'error');assert.equal(h.calls.fetch.length,0);
});
test('query string cannot bypass the release cache for a required script',async()=>{
  const h=await harness();await h.active.put('js/core.js',new Response('active script'));
  assert.equal(await (await h.get('js/core.js?v=new')).text(),'active script');assert.equal(h.calls.fetch.length,0);
  h.active.data.clear();assert.equal((await h.get('js/core.js?v=new')).type,'error');assert.equal(h.calls.fetch.length,0);
});
test('successful optional response is cached in active release',async()=>{
  const h=await harness();assert.equal(await (await h.get('werkcodes.json')).text(),'new network');
  assert.equal(await (await h.active.match('werkcodes.json')).text(),'new network');
});
test('HTTP error response cannot poison optional cache',async()=>{
  const h=await harness();h.context.fetch=async()=>new Response('missing',{status:404});
  assert.equal((await h.get('werkcodes.json')).status,404);await tick();assert.equal(await h.active.match('werkcodes.json'),undefined);
});
test('cache write rejection does not hide valid response or leak rejection',async()=>{
  const h=await harness(),errors=[];const handler=e=>errors.push(e);process.on('unhandledRejection',handler);
  try{h.faults.put=true;assert.equal(await (await h.get('werkcodes.json')).text(),'new network');await tick();assert.deepEqual(errors,[]);}
  finally{process.removeListener('unhandledRejection',handler);}
});
test('unavailable cache still permits optional network response',async()=>{
  const h=await harness();h.faults.open=true;assert.equal(await (await h.get('werkcodes.json')).text(),'new network');
  assert.equal((await h.get('js/core.js')).type,'error');
});
test('non-GET and cross-origin requests are left alone',async()=>{
  const h=await harness();assert.equal(await h.get('data',{method:'POST'}),undefined);assert.equal(await h.get('https://elsewhere.test/data'),undefined);assert.equal(h.calls.fetch.length,0);
});
test('version response and explicit skip-waiting message remain supported',async()=>{
  const h=await harness();assert.equal(h.version.cache,'hourhound-'+h.version.version);assert.equal(h.calls.skip,0);
  await h.dispatch('message',{data:{type:'SKIP_WAITING'}});assert.equal(h.calls.skip,1);
});
let failed=0;
for(const [name,fn] of tests){try{await fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
console.log(`${tests.length-failed}/${tests.length} Phase X cache checks passed`);
process.exitCode=failed?1:0;
