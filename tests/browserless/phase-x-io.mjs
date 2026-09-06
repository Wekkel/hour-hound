#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(process.argv[2]||join(here,'../..'));
const source=readFileSync(join(root,'js/io.js'),'utf8');
const clone=x=>x===undefined?undefined:structuredClone(x);
const assert=(x,m)=>{if(!x)throw new Error(m);};
const equal=(a,b,m)=>assert(a===b,`${m}\nverwacht: ${b}\ngekregen: ${a}`);
const emptyHistory=()=>({version:1,receipts:[],resolutions:[],legacyOrphans:[]});
const baseSnapshot=()=>({
  dossiers:[{id:'d1',nummer:'123456789',naam:'Zaak',lang:'nl',codes:[],voorlopig:false,
    archief:false,isI7:false,dvn:false,gewijzigd:10}],
  regels:[{id:'r1',datum:'2026-09-04',start:'09:00',eind:'10:00',dossierId:'d1',code:'A',
    omschrijving:'Werk',uren:1,urenHand:false,autoAanvul:false,hersteld:false,soort:'werk',
    revision:1,gewijzigd:10}],
  templates:[{id:'t1',cat:'Werk',min:6,code:null,nl:'Tekst',en:null}],
  codes:[{code:'A',naam:'Advies',favoriet:false}],overboekingen:[],
  meta:{dagEinde:{'2026-09-04':'17:00'},dagAudit:{'2026-09-04':{events:[]}},stack:[],
    rondMode:'groep',codeGebruik:{A:2},geboekt:{'2026-09-04':['fp']},
    bookingHistory:emptyHistory(),thema:'donker',running:null,pending:undefined}
});
function element(id){return{id,textContent:'',disabled:false,value:'',style:{},dataset:{},onclick:null,
  classList:{values:new Set(),add(x){this.values.add(x);},remove(x){this.values.delete(x);},
    contains(x){return this.values.has(x);}},setAttribute(k,v){this[k]=v;},focus(){this.focused=true;},
  addEventListener(){},querySelector(){return null;},querySelectorAll(){return[];}};}
function harness(seed=baseSnapshot()){
  let data=clone(seed),blob=null,atomicCalls=0,reloads=0;const events=[],toasts=[],confirms=[];
  const els=new Map(),getEl=id=>{if(!els.has(id))els.set(id,element(id));return els.get(id);};
  const listeners=new Map();
  const storage={
    async waitForWrites(){events.push('waitForWrites');},
    async pauseWrites(){events.push('pauseWrites');},resumeWrites(){events.push('resumeWrites');},
    hasWriteAccess(){return true;},async loadSnapshot(){events.push('loadSnapshot');return clone(data);},
    async atomicWrite(options,prepare){atomicCalls++;events.push('atomicWrite');const work=clone(data);
      const stores={};for(const name of options.stores||[])stores[name]={clear(){work[name]=[];},put(row){
        const key=name==='codes'?'code':'id',i=work[name].findIndex(x=>x[key]===row[key]);
        if(i<0)work[name].push(clone(row));else work[name][i]=clone(row);}};
      stores.meta={put(value,key){work.meta[key]=clone(value);},delete(key){delete work.meta[key];}};
      const result=prepare(clone(data),{stores});if(result&&result.ok)data=work;return result;}
  };
  const state={read:()=>({rules:clone(data.regels),running:data.meta.running?data.regels.find(r=>r.id===data.meta.running):null}),commit(delta){events.push('stateCommit');Object.assign(state.last=state.last||{},delta);}};
  const context={console,Blob,setTimeout,clearTimeout,Date,JSON,Map,Set,Promise,
    HH:{domain:{booking:{emptyHistory,normalizeHistory:h=>({...emptyHistory(),...(clone(h)||{})}),semanticKey:s=>JSON.stringify(s)}},
      services:{timer:{async idle(){events.push('timerIdle');}}},storage:{indexedDB:storage},state},
    document:{activeElement:null,getElementById:getEl,createElement(){return{click(){events.push('download');}};},
      addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);}},
    URL:{createObjectURL(value){blob=value;return'blob:test';},revokeObjectURL(){}},
    location:{reload(){reloads++;events.push('reload');}},
    confirm(message){confirms.push(message);return true;},prompt(){return'2';},
    toast(message){toasts.push(String(message));},L(){},announce(){events.push('announce');},
    flushOmschr:async()=>{events.push('flush');},rustig:async()=>{events.push('rustig');},
    zorgVoorI7:async()=>{events.push('zorgVoorI7');},laadInstellingen:async()=>{events.push('laadInstellingen');},
    herlaad:async()=>{events.push('herlaad');},replaceAll:async()=>{},
    getAll:async name=>clone(data[name]||[]),
    get:async(name,key)=>clone(name==='meta'?data.meta[key]:(data[name]||[]).find(x=>(x.id||x.code)===key)),
    today:()=> '2026-09-06',DAGMAX:24,uu:x=>String(x),dmy:x=>x,
    parseD:s=>new Date(s+'T00:00:00Z'),ymd:d=>d.toISOString().slice(0,10),
    hm2m:s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?(+s.slice(0,2)*60+ +s.slice(3)):null,
    m2hm:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'),
    schrijfOvergang:false,pending:null,undoStack:[]};
  context.$=getEl;context.window=context;vm.createContext(context);
  vm.runInContext('const bookingDomain=HH.domain.booking;\n'+source+'\n;globalThis.__io={checksumInhoud:typeof checksumInhoud==="function"?checksumInhoud:null,checksumVan,keurBackupMeta:typeof keurBackupMeta==="function"?keurBackupMeta:null,kiesBackupActie:typeof kiesBackupActie==="function"?kiesBackupActie:null,gate:()=>schrijfOvergang,importFile};',context,{filename:'js/io.js'});
  return{context,events,toasts,confirms,get data(){return data;},set data(x){data=clone(x);},
    get atomicCalls(){return atomicCalls;},get reloads(){return reloads;},get blob(){return blob;},el:getEl,io:context.__io,
    key(key){listeners.get('keydown')?.({key,preventDefault(){},stopImmediatePropagation(){}});},
    async export(){await getEl('b-export').onclick();assert(blob,'export leverde geen blob: '+toasts.at(-1));return JSON.parse(await blob.text());},
    async click(action){const button=getEl(action==='restore'?'bx-restore':action==='merge'?'bx-merge':'bx-cancel');
      for(let i=0;i<30&&(!getEl('backupkeuze').classList.contains('on')||typeof button.onclick!=="function");i++)await Promise.resolve();
      assert(getEl('backupkeuze').classList.contains('on')&&typeof button.onclick==='function','importkeuzemodal werd niet geopend');button.onclick();},
    async choose(promise,action){await this.click(action);return promise;}};
}
async function signed(h,value){value.manifest.checksum=h.io.checksumInhoud(value);return value;}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);

test('export wacht alle queues af en ondertekent volledige JSON-inhoud',async()=>{
  const h=harness();h.data.regels[0].legacyUndefined=undefined;let release;
  h.context.flushOmschr=()=>{h.events.push('flush');return new Promise(done=>{release=done;});};
  const pending=h.el('b-export').onclick();await Promise.resolve();
  assert(!h.events.includes('download'),'export downloadde vóór flush gereed was');release();await pending;
  const dump=JSON.parse(await h.blob.text());
  equal(dump.schemaVersion,11,'schema');equal(h.io.keurBackupMeta(dump).length,0,'eigen export afgekeurd');
  equal(h.events.slice(0,6).join(','),'flush,rustig,timerIdle,waitForWrites,pauseWrites,loadSnapshot','snapshot te vroeg gelezen');
  assert(h.events.indexOf('resumeWrites')>h.events.indexOf('loadSnapshot'),'writes niet hervat');
  const changed=clone(dump);changed.meta.dagEinde['2026-09-04']='18:00';
  assert(h.io.checksumInhoud(changed)!==dump.manifest.checksum,'metadata valt buiten checksum');
});

test('echte keuzemodal levert Restore, Merge, Cancel en Escape',async()=>{
  const h=harness();for(const action of ['restore','merge','cancel']){
    const p=h.io.kiesBackupActie('controle',true);equal(h.el('backupkeuze').classList.contains('on'),true,'modal niet open');
    equal(await h.choose(p,action),action,'verkeerde modalactie');}
  const p=h.io.kiesBackupActie('controle',true);h.key('Escape');
  equal(await p,'cancel','Escape annuleert niet');
});

test('schema11 weigert geneste metadata en fout getypeerde lossless velden zonder crash',async()=>{
  const h=harness(),dump=await h.export(),bad=clone(dump);bad.meta.dagEinde={'2026-02-30':'99:00'};
  bad.regels[0].urenHand='false';bad.dossiers[0].isI7='false';bad.manifest.checksum=h.io.checksumInhoud(bad);
  const errors=h.io.keurBackupMeta(bad);assert(errors.some(x=>/dagafsluiting|tijdregel|dossier/.test(x)),'ongeldige nested metadata/booleans geaccepteerd');
  const missing={app:'hourhound',schemaVersion:11,exported:new Date().toISOString(),meta:{}};
  assert(h.io.keurBackupMeta(missing).length,'onvolledige backup niet afgewezen');
});

test('schema11 herstelt terminale overboeking met verwijderde historische bron',async()=>{
  const h=harness(),dump=await h.export();dump.overboekingen=[{id:'done',status:'done',targetDossierId:'weg',
    sourceDate:'2026-09-04',sourceRuleIds:['verwijderd'],updatedAt:'2026-09-05T10:00:00Z'}];
  dump.manifest.overboekingen=1;dump.manifest.checksum=h.io.checksumInhoud(dump);
  equal(h.io.keurBackupMeta(dump).length,0,'terminale historie ten onrechte als live referentie afgewezen');
  const target=harness();const importing=target.io.importFile({size:100,text:async()=>JSON.stringify(dump)});
  await target.choose(importing,'restore');await importing;
  equal(target.data.overboekingen[0].id,'done','terminale historische overboeking ging bij restore verloren');
});

test('restore is lossless, atomair en houdt de gate vast tot na herladen',async()=>{
  const origin=harness(),dump=await origin.export();dump.regels[0].extra={langeWaarde:'x'.repeat(900),nested:[1,2,3]};
  await signed(origin,dump);const h=harness({...baseSnapshot(),dossiers:[],regels:[],templates:[],codes:[],overboekingen:[]});
  vm.runInContext('herlaad=async()=>{globalThis.__gateAtReload=schrijfOvergang}',h.context);
  const importing=h.io.importFile({size:100,text:async()=>JSON.stringify(dump)});await h.choose(importing,'restore');await importing;
  equal(JSON.stringify(h.data.regels[0].extra),JSON.stringify(dump.regels[0].extra),'onbekende geldige velden verloren');
  equal(h.atomicCalls,1,'restore niet één atomicWrite');equal(h.context.__gateAtReload,true,'gate vóór reload vrijgegeven');
});

test('Cancel wijzigt niets en Merge bewaart lokale instellingen en oudere records',async()=>{
  const origin=harness(),dump=await origin.export(),h=harness();let before=JSON.stringify(h.data);
  let importing=h.io.importFile({size:100,text:async()=>JSON.stringify(dump)});await h.choose(importing,'cancel');await importing;
  equal(JSON.stringify(h.data),before,'Cancel schreef gegevens');equal(h.atomicCalls,0,'Cancel startte transactie');
  dump.dossiers[0].gewijzigd=20;dump.dossiers[0].naam='Nieuw';dump.meta.thema='licht';await signed(origin,dump);
  importing=h.io.importFile({size:100,text:async()=>JSON.stringify(dump)});await h.choose(importing,'merge');await importing;
  equal(h.data.dossiers[0].naam,'Nieuw','nieuwere merge-update ontbreekt');equal(h.data.meta.thema,'donker','merge overschreef lokale instellingen');
});

test('stale merge-preview en lokale open timer blokkeren zonder gedeeltelijke write',async()=>{
  const origin=harness(),dump=await origin.export(),h=harness(),before=JSON.stringify(h.data);
  let importing=h.io.importFile({size:100,text:async()=>JSON.stringify(dump)});await h.click('merge');
  h.data={...h.data,dossiers:[{...h.data.dossiers[0],naam:'Tussentijds',gewijzigd:99}]};await importing;
  equal(h.data.dossiers[0].naam,'Tussentijds','stale import overschreef wijziging');assert(h.toasts.some(x=>x.includes('intussen gewijzigd')),'stale abort niet gemeld');
  const open=baseSnapshot();open.regels[0].eind=null;open.meta.running='r1';const timer=harness(open);
  importing=timer.io.importFile({size:100,text:async()=>JSON.stringify(dump)});await importing;
  equal(timer.atomicCalls,0,'open timer bereikte write');assert(timer.toasts.some(x=>x.includes('lopende regel')),'timerblokkade niet gemeld');
  assert(before!==JSON.stringify(h.data),'testmutatie niet uitgevoerd');
});

test('mislukte refresh na duurzame commit blijft fail-closed en herlaadt',async()=>{
  const origin=harness(),dump=await origin.export(),h=harness({...baseSnapshot(),dossiers:[],regels:[]});
  vm.runInContext('herlaad=async()=>{throw new Error("geinjecteerde refreshfout")}',h.context);
  const importing=h.io.importFile({size:100,text:async()=>JSON.stringify(dump)});
  await h.choose(importing,'restore');await importing;
  equal(h.data.regels.length,1,'duurzame restore ging bij refreshfout verloren');
  equal(h.io.gate(),true,'invoer is met stale runtime weer vrijgegeven');equal(h.reloads,1,'pagina niet herladen');
  assert(h.events.lastIndexOf('pauseWrites')>h.events.lastIndexOf('atomicWrite')&&
    h.events.lastIndexOf('pauseWrites')<h.events.lastIndexOf('reload'),'opslaggateway bleef schrijfbaar na refreshfout');
  assert(h.toasts.some(x=>x.includes('is opgeslagen')&&x.includes('herladen')),'post-commit fout verkeerd gemeld');
});

test('schema10 blijft importeerbaar met oude checksum en normalisatie',async()=>{
  const origin=harness(),dump=await origin.export();dump.schemaVersion=10;
  dump.manifest.checksum=origin.io.checksumVan(dump.dossiers,dump.regels,dump.templates,dump.codes,dump.overboekingen,dump.meta.bookingHistory);
  delete dump.manifest.checksumType;const h=harness({...baseSnapshot(),dossiers:[],regels:[],templates:[],codes:[],overboekingen:[]});
  const importing=h.io.importFile({size:100,text:async()=>JSON.stringify(dump)});await h.choose(importing,'restore');await importing;
  equal(h.data.regels.length,1,'schema10 niet hersteld');equal(h.data.regels[0].omschrijving,'Werk','schema10 verkeerd genormaliseerd');
});

let failed=0;for(const [name,fn] of tests)try{await fn();console.log('PASS '+name);}catch(error){failed++;console.log('FAIL '+name+': '+(error.stack||error));}
console.log(`${tests.length-failed}/${tests.length} Phase X I/O checks passed`);process.exitCode=failed?1:0;
