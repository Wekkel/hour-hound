import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.',read=p=>fs.readFileSync(root+'/'+p,'utf8');
const els=new Map(),copied=[];
const element=()=>({dataset:{},style:{},innerHTML:'',hidden:false,children:[],setAttribute(){},classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this[type]=fn;}});
const c=vm.createContext({console,setTimeout,clearTimeout,Date,localStorage:{getItem(){return null;}},document:{querySelectorAll:()=>[],getElementById(id){if(!els.has(id))els.set(id,element());return els.get(id);},addEventListener(){}},navigator:{},window:{addEventListener(){}},kopieer:async text=>copied.push(text)});
for(const p of ['hh','domain/time','domain/booking','domain/dvn','domain/overbooking','storage/indexeddb','state','core','ui/manage-view','ui/overbooking-controller','ui/manage-controller'])vm.runInContext(read('js/'+p+'.js'),c,{filename:p});
const run=s=>vm.runInContext(s,c),HH=c.HH;
const d={id:'d',nummer:'123456789',naam:'Bank - Project',dvn:true,voorlopig:false,codes:[]};
const r={id:'r',datum:'2026-09-04',dossierId:'d',code:null,omschrijving:'red flag review docs',start:'09:00',eind:'13:00',soort:'werk'};
HH.state.commit({dossiers:[d],rules:[r],roundingMode:'groep',overbookings:[],bookingHistory:HH.domain.booking.emptyHistory()});
let failed=0,passed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
const current=run('bookingSnapshotVan(sumVanData(HH.state.read().rules)[0],"2026-09-04")');
HH.state.commit({bookingHistory:{version:1,receipts:[{id:'receipt',channel:'day',snapshot:{...current,targetNumber:'I700000000',code:'Commercieel',description:'Old DVN text'},confirmedAt:'2026-09-05'}],resolutions:[]}});
HH.app.showTab=tab=>HH.state.commit({tab});
await test('real collector groups a correction once and hides duplicate DVN booking',()=>{
 const groups=run('beheerWerkData()'),g=groups.find(g=>g.dossierIds.includes('d'));
 assert.equal(g.tasks.length,1);assert.equal(g.tasks[0].type,'correction');
});
await test('day correction link opens the matching dossier instead of a general list',()=>{
 run('openBeheerVoorDag("2026-09-04")');
 assert.equal(HH.state.read().tab,'beheer');assert.equal(els.get('manage-flow').hidden,false);
 assert.equal(els.get('manage-overview').hidden,true);assert.ok(els.get('manage-flow').innerHTML.includes('123456789'));
});
await test('grouped correction clipboard contains the current dated description',async()=>{
 const button={dataset:{manageCopy:'description'},innerHTML:'Kopieer'};
 await els.get('v-beheer').click({target:{closest:s=>s==='[data-manage-copy]'?button:null}});
 assert.equal(copied.at(-1),'04.09.2026 red flag review docs');
});
await test('grouped overview does not expand all correction fields',()=>{
 run('sluitBeheerFlow()');const html=els.get('manage-worklist').innerHTML;
 assert.equal(els.get('manage-overview').hidden,false);assert.ok(html.includes('Bank - Project'));
 assert.ok(!html.includes('Old DVN text'));assert.ok(!html.includes('data-manage-copy'));
});
console.log(`${passed}/${passed+failed} real adapter journey checks passed`);if(failed)process.exitCode=1;
