#!/usr/bin/env node
/* Phase AF: regels zonder soort (Dossier/i7/DVN) kunnen niet meer handmatig ontstaan en
   zijn in de bewerksheet met keuzelijsten te herstellen. Uitgevoerd tegen de echte
   core.js, timer.js, bewerksheet (day-editor-controller.js), dagservice en een
   transactionele geheugen-IndexedDB. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(process.argv[2]||path.join(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const assert=(c,m)=>{if(!c)throw new Error(m);};
const equal=(a,e,m)=>assert(a===e,`${m}\nverwacht: ${JSON.stringify(e)}\ngekregen: ${JSON.stringify(a)}`);
const tick=()=>new Promise(r=>setTimeout(r,5));
const date='2026-09-23';
const i7={id:'i7',nummer:'I700000000',naam:'Indirecte uren',isI7:true,revision:1};
const gewoon={id:'g',nummer:'304111222',naam:'Levering Kerkstraat',revision:1,codes:[]};
const dvn={id:'v',nummer:null,naam:'Bouwfonds Zuid',voorlopig:true,dvn:true,revision:1};
const codes=[{code:'I7-701',naam:'Praktijkorganisatie/administratie'},{code:'I7-705',naam:'Praktijkontwikkeling'},
  {code:'I7-704',naam:'Commercieel'}];

function memoryDB(seed={}){
  const names=['regels','dossiers','meta','overboekingen','codes'],rows={};
  for(const name of names)rows[name]=new Map(name==='meta'?Object.entries(seed.meta||{}):
    (name==='codes'?(seed.codes||codes):(seed[name]||[])).map(v=>[v.id||v.code,clone(v)]));
  let queue=Promise.resolve(),writes=0;
  return{rows,get writes(){return writes;},transaction(requested,mode){
    const stores=Array.isArray(requested)?requested:[requested];let release;
    const previous=queue;queue=new Promise(done=>{release=done;});
    let active=false,pending=0,aborted=false,data,finishing=false;const jobs=[];
    const tx={error:null,abort(){aborted=true;tx.error=new Error('aborted');},objectStore(name){return{
      get:key=>request(()=>clone(data[name].get(key))),getAll:()=>request(()=>[...data[name].values()].map(clone)),
      put:(value,key)=>request(()=>{data[name].set(key===undefined?(value.id||value.code):key,clone(value));}),
      delete:key=>request(()=>data[name].delete(key)),clear:()=>request(()=>data[name].clear())};}};
    function finish(){if(finishing||pending)return;finishing=true;setTimeout(()=>{if(aborted)tx.onabort?.();else{
      if(mode==='readwrite'){for(const name of stores)rows[name]=data[name];writes++;}tx.oncomplete?.();}release();},0);}
    function request(action){let value;const req={error:null,readyState:'pending',get result(){
      if(this.readyState!=='done')throw new Error('premature IDB result');return value;}};pending++;
      const run=()=>setTimeout(()=>{if(!aborted)try{value=action();req.readyState='done';req.onsuccess?.({target:req});}
        catch(error){req.error=tx.error=error;aborted=true;req.onerror?.({target:req});}pending--;finish();},0);
      if(active)run();else jobs.push(run);return req;}
    previous.then(()=>{data=Object.fromEntries(stores.map(name=>[name,new Map([...rows[name]].map(([k,v])=>[k,clone(v)]))]));
      active=true;jobs.forEach(run=>run());finish();});return tx;
  }};
}

/* Minimale DOM met echte listeners, zodat klikken en typen de productiehandlers raken. */
function dom(){
  const elements=new Map(),docListeners=[];
  const make=id=>({id,tagName:/^er-(start|eind|dossier|code|oms|uren)$/.test(id)?'INPUT':'DIV',dataset:{},value:'',placeholder:'',
    readOnly:false,disabled:false,hidden:false,textContent:'',innerHTML:'',style:{},scrollTop:0,
    listeners:{},classList:{set:new Set(),add(x){this.set.add(x);},remove(x){this.set.delete(x);},
      toggle(x,on){(on===undefined?!this.set.has(x):on)?this.set.add(x):this.set.delete(x);},contains(x){return this.set.has(x);}},
    addEventListener(t,f){(this.listeners[t]||(this.listeners[t]=[])).push(f);},setAttribute(k,v){this['attr-'+k]=String(v);},
    focus(){document.activeElement=this;(this.listeners.focus||[]).forEach(f=>f({target:this}));},
    dispatch(t,extra={}){(this.listeners[t]||[]).forEach(f=>f({target:this,...extra}));},
    querySelector(){return null;},querySelectorAll(){return[];},contains(){return false;},
    getBoundingClientRect(){return{left:0,bottom:0,width:200};},closest(){return null;}});
  const soortButtons=['gewoon','i7','dvn'].map(s=>{const b=make('soort-'+s);b.dataset.erSoort=s;
    b.closest=q=>q==='[data-er-soort]'?b:null;return b;});
  const document={activeElement:null,body:{dataset:{}},
    getElementById(id){if(!elements.has(id))elements.set(id,make(id));return elements.get(id);},
    querySelectorAll(q){return q==='[data-er-soort]'?soortButtons:[];},
    querySelector(q){const m=/data-er-soort="(\w+)"/.exec(q);return m?soortButtons.find(b=>b.dataset.erSoort===m[1]):null;},
    addEventListener(t,f,cap){docListeners.push({t,f,cap});},removeEventListener(t,f){const i=docListeners.findIndex(x=>x.f===f);if(i>=0)docListeners.splice(i,1);},
    hasFocus:()=>true,createElement:()=>make('x')};
  return{document,el:id=>document.getElementById(id),soortButtons};
}

function runtime(seed){
  const d=dom(),toasts=[];
  const c={console,setTimeout,clearTimeout,queueMicrotask,document:d.document,
    window:{addEventListener(){},innerWidth:1200},navigator:{},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
    indexedDB:{open(){return{};}},confirm:()=>true};
  vm.createContext(c);
  for(const f of ['js/hh.js','js/domain/time.js','js/domain/booking.js','js/domain/dvn.js','js/domain/overbooking.js',
    'js/storage/indexeddb.js','js/services/admin.js','js/services/day-rules.js','js/services/timer.js','js/services/settings.js',
    'js/state.js','js/core.js','js/timer.js','js/ui/modal.js'])
    vm.runInContext(read(f),c,{filename:f});
  const db=memoryDB(seed);c.HH.storage.indexedDB.use(db);
  c.HH.app={render(){}};c.dagRuimte=()=>true;c.herlaad=async()=>{};
  vm.runInContext('toast=(m)=>{globalThis.__toasts.push(m);};',Object.assign(c,{__toasts:toasts}));
  vm.runInContext(read('js/ui/day-editor-controller.js'),c,{filename:'day-editor-controller.js'});
  c.HH.state.commit({dossiers:clone(seed.dossiers||[]),rules:clone(seed.regels||[]),codes:clone(seed.codes||codes),viewDate:date});
  const soortKlik=s=>d.el('er-soort').dispatch('click',{target:d.soortButtons.find(b=>b.dataset.erSoort===s)});
  return{c,db,el:d.el,toasts,soortKlik,run:code=>vm.runInContext(code,c)};
}
const onaf={id:'r',datum:date,start:'10:51',eind:'11:59',dossierId:null,code:null,omschrijving:'',uren:1.2,soort:'werk',revision:1};

const tests=[];const test=(name,fn)=>tests.push([name,fn]);

test('dagservice weigert een afgesloten werkregel zonder dossier (toevoegen en bewerken)',async()=>{
  const h=runtime({dossiers:[i7],regels:[onaf]}),S=h.c.HH.services.dayRules;
  const nieuw={...onaf,id:'n',revision:undefined};
  const add=await S.addRule({rule:nieuw,dossiers:[i7],overbookings:[],bookingContext:{},nowMs:1,nowIso:date+'T12:00:00Z'});
  equal(add.error,'dossier_required','regel zonder soort toegevoegd');
  const edit=await S.editRule({before:onaf,rule:{...onaf,eind:'12:10'},dossiers:[i7],overbookings:[],confirmedWarnings:true,
    bookingContext:{},nowTime:'23:00',nowMs:2,nowIso:date+'T12:00:00Z'});
  equal(edit.error,'dossier_required','bewerking liet regel zonder soort staan');equal(h.db.writes,0,'weigering schreef data');
  const pauze=await S.addRule({rule:{...nieuw,id:'p',soort:'pauze',omschrijving:'Pauze'},dossiers:[i7],overbookings:[],
    bookingContext:{},nowMs:3,nowIso:date+'T12:00:00Z'});
  assert(pauze.ok,'pauze zonder dossier moet mogelijk blijven: '+pauze.error);
});

test('i7 kiezen vult het i7-nummer zelf in en biedt de i7-werklijst als keuzelijst',async()=>{
  const h=runtime({dossiers:[i7,gewoon],regels:[onaf]});
  const klaar=h.c.openRegelEditor('r','dag');await tick();
  assert(/nog geen soort/.test(h.el('er-warn').innerHTML),'geen uitleg bij regel zonder soort');
  h.soortKlik('i7');await tick();
  equal(h.el('er-dossier').value,'I700000000','i7-nummer niet automatisch ingevuld');
  equal(h.el('er-dossier').readOnly,true,'i7-nummer moet vast staan');
  const lijst=h.run('ac.items').map(x=>x.label);
  assert(lijst.includes('Praktijkontwikkeling')&&lijst.includes('Praktijkorganisatie/administratie'),'i7-werklijst niet aangeboden: '+JSON.stringify(lijst));
  const item=h.run('ac.items').find(x=>x.label==='Praktijkorganisatie/administratie');
  await h.run('ac.onPick')(item);
  equal(h.el('er-code').value,'Praktijkorganisatie/administratie','gekozen werkcode niet overgenomen');
  h.el('er-oms').value='Diversen';
  await h.el('er-save').onclick();await klaar;
  const opgeslagen=h.db.rows.regels.get('r');
  equal(opgeslagen.dossierId,'i7','regel niet op i7 opgeslagen');equal(opgeslagen.code,'I7-701','werkcode niet opgeslagen');
  equal(opgeslagen.omschrijving,'Diversen','omschrijving niet opgeslagen');
});

test('opslaan zonder soort of zonder omschrijving geeft uitleg en schrijft niets',async()=>{
  const h=runtime({dossiers:[i7],regels:[onaf]});
  h.c.openRegelEditor('r','dag');await tick();
  h.el('er-eind').value='12:05';await h.el('er-save').onclick();
  assert(h.toasts.some(t=>/Kies eerst de soort/.test(t)),'geen melding zonder soort: '+JSON.stringify(h.toasts));
  h.soortKlik('i7');await tick();
  await h.run('ac.onPick')(h.run('ac.items')[0]);
  h.el('er-oms').value='  ';await h.el('er-save').onclick();
  assert(h.toasts.some(t=>/omschrijving/.test(t)),'geen melding bij lege omschrijving');
  equal(h.db.writes,0,'onvolledige regel toch opgeslagen');
});

test('DVN kiezen: bestaande DVN uit de lijst, Commercieel vast en datum-naamvoorvoegsel',async()=>{
  const h=runtime({dossiers:[i7,dvn],regels:[onaf]});
  const klaar=h.c.openRegelEditor('r','dag');await tick();
  h.soortKlik('dvn');await tick();
  equal(h.el('er-code').value,'Commercieel','Commercieel niet vast getoond');equal(h.el('er-code').readOnly,true,'werkcode bij DVN moet vast staan');
  const it=h.run('ac.items').find(x=>x.t==='dvn'&&x.id==='v');assert(it,'bestaande DVN niet in de lijst');
  await h.run('ac.onPick')(it);h.el('er-oms').value='overleg bank';
  await h.el('er-save').onclick();await klaar;
  const r=h.db.rows.regels.get('r');
  equal(r.dossierId,'v','niet aan de DVN gekoppeld');equal(r.code,'I7-704','niet op Commercieel');
  equal(r.omschrijving,'23.09.2026 · Bouwfonds Zuid · overleg bank','Intapp-voorvoegsel ontbreekt');
});

test('Dossier kiezen biedt uitsluitend gewone dossiers',async()=>{
  const h=runtime({dossiers:[i7,dvn,gewoon],regels:[onaf]});
  const klaar=h.c.openRegelEditor('r','dag');await tick();
  h.soortKlik('gewoon');await tick();
  const ids=h.run('ac.items').filter(x=>x.t==='dos').map(x=>x.id);
  equal(JSON.stringify(ids),JSON.stringify(['g']),'andere soort in de dossierlijst');
  await h.run('ac.onPick')(h.run('ac.items').find(x=>x.id==='g'));h.el('er-oms').value='Concept akte';
  await h.el('er-save').onclick();await klaar;
  equal(h.db.rows.regels.get('r').dossierId,'g','gewoon dossier niet gekoppeld');
});

test('+ regel / gat invullen: annuleren laat geen lege regel achter, opslaan voegt hem toe',async()=>{
  const h=runtime({dossiers:[i7,gewoon],regels:[]});
  const concept={id:'c1',datum:date,start:'20:35',eind:'20:40',dossierId:null,code:null,omschrijving:'',uren:0.1,urenHand:false,soort:'werk'};
  let klaar=h.c.openRegelEditor('c1','dag',concept);await tick();
  h.el('er-cancel').onclick();equal(await klaar,false,'annuleren gaf geen false');
  equal(h.db.rows.regels.size,0,'geannuleerde conceptregel toch opgeslagen');
  equal(h.c.HH.state.read().rules.length,0,'geannuleerde conceptregel in geheugen');
  klaar=h.c.openRegelEditor('c1','dag',concept);await tick();
  h.soortKlik('gewoon');await tick();await h.run('ac.onPick')(h.run('ac.items').find(x=>x.id==='g'));
  h.el('er-oms').value='Deutsche - borrel';await h.el('er-save').onclick();equal(await klaar,true,'toevoegen niet bevestigd');
  equal(h.db.rows.regels.get('c1').dossierId,'g','conceptregel niet toegevoegd');
  assert(h.c.HH.state.read().rules.some(r=>r.id==='c1'),'toegevoegde regel niet in geheugen');
});

let failed=0;
for(const [name,run] of tests)try{await run();console.log('PASS '+name);}catch(error){failed++;console.log('FAIL '+name+'\n  '+String(error.stack||error.message).split('\n').slice(0,6).join('\n  '));}
console.log(`${tests.length-failed}/${tests.length} Phase AF repair checks passed for ${root}`);
process.exitCode=failed?1:0;
