import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
const start=source.includes('let updateVoorbereiding=')?source.indexOf('let updateVoorbereiding='):source.indexOf('if("serviceWorker" in navigator)');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
async function setup(){
 const events={},order=[],timeouts=new Map();let count=0,modal=false,writer=true,reloads=0,flush=async()=>{},drain=async()=>{},pause=async()=>{};
 const button={style:{},disabled:false};
 const reg={waiting:{postMessage(){order.push('activate');}},addEventListener(){},update:async()=>{}};
 const sw={controller:{},register:async()=>reg,addEventListener(t,f){events[t]=f;},ready:new Promise(()=>{})};
 const c=vm.createContext({navigator:{serviceWorker:sw,locks:{}},HH:{state:{read:()=>({rules:[{id:'r'}],running:null})},ui:{modals:{anyOpen:()=>modal}},services:{timer:{idle:async()=>{order.push('idle');await drain();}}},storage:{indexedDB:{hasWriteAccess:()=>writer,pauseWrites:async()=>{order.push('pause');await pause();},resumeWrites:()=>order.push('resume')}}},schrijfOvergang:false,sluitWerkdag:{busy:false},vulAanTot8:{busy:false},flushOmschr:async()=>{order.push('flush');await flush();},rustig:async()=>order.push('rules'),zetSchrijfmodus(){},$:()=>button,toast:m=>order.push('toast:'+m),confirm:()=>true,location:{reload(){order.push('reload');reloads++;}},setTimeout(f){timeouts.set(++count,f);return count;},clearTimeout(id){timeouts.delete(id);},setInterval(){},MessageChannel:function(){}});
 vm.runInContext(source.slice(start),c);
 vm.runInContext(source.slice(source.indexOf('function bewaakLeesvenster('),source.indexOf('["click","keydown","beforeinput"')),c);await tick();
 return{c,order,button,events,reg,timeouts,setFlush:f=>flush=f,setDrain:f=>drain=f,setPause:f=>pause=f,setModal:v=>modal=v,setWriter:v=>writer=v,reloads:()=>reloads,click:()=>button.onclick(),changed:()=>events.controllerchange()};
}
const tests=[];const test=(n,f)=>tests.push([n,f]);
test('update wacht werkelijk op trage draft, timer en transacties',async()=>{
 const h=await setup(),draft=deferred(),timer=deferred(),db=deferred();h.setFlush(()=>draft.promise);h.setDrain(()=>timer.promise);h.setPause(()=>db.promise);
 const done=h.click();await tick();assert(!h.order.includes('activate'));assert.equal(h.c.schrijfOvergang,true);
 draft.resolve();await tick();assert(!h.order.includes('pause'));timer.resolve();await tick();assert(!h.order.includes('activate'));db.resolve();await done;
 assert.deepEqual(h.order,['flush','rules','idle','pause','activate']);h.changed();await tick();assert.equal(h.reloads(),1);
});
test('mislukte draft activeert niet en blijft opnieuw te proberen',async()=>{
 const h=await setup();h.setFlush(async()=>{throw Error('disk full');});await h.click();assert(!h.order.includes('activate'));assert.equal(h.c.schrijfOvergang,false);assert(h.order.includes('resume'));
 h.setFlush(async()=>{});await h.click();assert(h.order.includes('activate'));
});
test('controllerchange vanuit ander venster wacht ook op bewaren',async()=>{
 const h=await setup(),d=deferred();h.setFlush(()=>d.promise);h.changed();await tick();assert.equal(h.reloads(),0);d.resolve();await tick();assert.equal(h.reloads(),1);
});
test('controllerchange bij savefout herlaadt niet en knop probeert opnieuw',async()=>{
 const h=await setup();h.setFlush(async()=>{throw Error('save failed');});h.changed();await tick();assert.equal(h.reloads(),0);h.setFlush(async()=>{});await h.click();assert.equal(h.reloads(),1);
});
test('dubbele klik en controllergebeurtenis activeren en herladen eenmaal',async()=>{
 const h=await setup(),d=deferred();h.setFlush(()=>d.promise);const a=h.click(),b=h.click();d.resolve();await Promise.all([a,b]);assert.equal(h.order.filter(x=>x==='activate').length,1);h.changed();h.changed();await tick();assert.equal(h.reloads(),1);
});
test('open modal blokkeert update en externe reload tot expliciete retry',async()=>{
 const h=await setup();h.setModal(true);await h.click();assert(!h.order.includes('flush'));h.changed();await tick();assert.equal(h.reloads(),0);h.setModal(false);await h.click();assert.equal(h.reloads(),1);
});
test('bestaande overgang wordt niet vrijgegeven door update',async()=>{
 const h=await setup();h.c.schrijfOvergang=true;h.changed();await tick();assert.equal(h.c.schrijfOvergang,true);assert(!h.order.includes('resume'));assert.equal(h.reloads(),0);
});
test('verdwenen waiting worker herstelt invoer zonder activatie',async()=>{
 const h=await setup(),d=deferred();h.setFlush(()=>d.promise);const a=h.click();h.reg.waiting=null;d.resolve();await a;assert(!h.order.includes('activate'));assert.equal(h.c.schrijfOvergang,false);
});
test('activatietimeout geeft invoer en schrijfacties weer vrij',async()=>{
 const h=await setup();await h.click();assert(h.timeouts.size);for(const f of [...h.timeouts.values()])f();assert.equal(h.c.schrijfOvergang,false);assert.equal(h.button.disabled,false);
});
test('alleen-lezenvenster kan uitgestelde controllerupdate via echte klikguard hervatten',async()=>{
 const h=await setup();h.setWriter(false);h.setModal(true);h.changed();await tick();h.setModal(false);
 let blocked=false;const event={type:'click',target:{closest:s=>s==='#btn-update'||s==='button,input,select,textarea,[contenteditable]'?{}:null},preventDefault(){blocked=true;},stopImmediatePropagation(){blocked=true;}};
 h.c.bewaakLeesvenster(event);assert.equal(blocked,false);await h.click();assert.equal(h.reloads(),1);assert(!h.order.includes('flush'));
});
let fail=0;for(const [n,f]of tests){try{await f();console.log('PASS '+n);}catch(e){fail++;console.error('FAIL '+n+': '+e.message);}}console.log(`${tests.length-fail}/${tests.length} Phase X update checks passed`);process.exitCode=fail?1:0;
