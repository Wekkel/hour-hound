import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.',read=p=>fs.readFileSync(root+'/'+p,'utf8');
function harness({closed=false,correction=false}={}){
 const els=new Map(),copies=[],beheer=[];
 const element=id=>({id,disabled:false,dataset:{},style:{},innerHTML:'',textContent:'',attrs:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},addEventListener(type,fn){this[type]=fn;},focus(){},click(){return this.onclick?.();}});
 const c=vm.createContext({console,Date,setTimeout:()=>1,clearTimeout,localStorage:{getItem(){return null;}},document:{activeElement:null,getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id);},addEventListener(){}},window:{addEventListener(){}},navigator:{clipboard:{writeText:async s=>copies.push(s)}},confirm:()=>true,toast(){},L(){},controleer:()=>[]});
 for(const p of ['hh','domain/time','domain/booking','domain/dvn','domain/overbooking','storage/indexeddb','state','core','booking'])vm.runInContext(read('js/'+p+'.js'),c,{filename:p});
 const run=s=>vm.runInContext(s,c),H=c.HH,date='2026-09-08';
 const d={id:'d',nummer:'304000001',naam:'Bank - Project',codes:[]};
 const rs=[0,1].map(i=>({id:'r'+i,datum:date,dossierId:'d',omschrijving:'Werk '+i,code:null,start:i?'10:00':'09:00',eind:i?'10:36':'09:36',soort:'werk'}));
 H.state.commit({dossiers:[d],rules:rs,codes:[],viewDate:date,booked:{},bookingHistory:H.domain.booking.emptyHistory(),roundingMode:'groep',dayAudit:closed?{[date]:{events:[{type:'gesloten',eind:'17:00'}]}}:{}});
 c.sumRows=()=>run('sumVanData(HH.state.read().rules)');let writes=0;
 H.services.admin={setRegularBooking:async input=>{writes++;const values=new Set(H.state.read().booked[date]||[]);if(input.enabled)values.add(input.fingerprint);else values.delete(input.fingerprint);return {ok:true,booked:{[date]:[...values]},history:H.state.read().bookingHistory};},parkOverbooking:async()=>({ok:false})};
 if(correction){const row=run('sumVanData(HH.state.read().rules)[0]'),before={...run('bookingSnapshotVan(sumVanData(HH.state.read().rules)[0],"2026-09-08")'),targetNumber:'999999999'};H.state.commit({bookingHistory:{version:1,receipts:[{id:'receipt',channel:'day',snapshot:before,confirmedAt:'2026-09-09'}],resolutions:[]}});}
 c.openBeheerVoorDag=(date,row)=>beheer.push({date,row});
 return {c,H,els,copies,beheer,run,get writes(){return writes;},open:()=>els.get('d-boek').onclick()};
}
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.stack);}}
await test('Processed closed day remains clickable and reports actual counts',()=>{const h=harness({closed:true});h.H.state.commit({booked:{'2026-09-08':h.c.sumRows().map(r=>r.fp)}});h.run('boekStat()');assert.equal(h.els.get('d-boek').attrs['aria-disabled'],'true');h.open();assert.match(h.els.get('bk-tel').innerHTML,/2 geboekt · 0 geparkeerd/);assert.match(h.els.get('bk-kaart').innerHTML,/open regels zijn verwerkt/);});
await test('Mixed correction day books unaffected row and completion exposes correction',async()=>{const h=harness({correction:true});h.open();assert.equal(h.writes,0);await h.els.get('bk-done').onclick();assert.equal(h.writes,1);assert.match(h.els.get('bk-tel').innerHTML,/1 geboekt · 0 geparkeerd · 0 open · 1 correcties/);assert.match(h.els.get('bk-kaart').innerHTML,/correcties wachten in Beheer/);});
await test('Correction row routes to day-aware beheer and cannot copy or book',async()=>{const h=harness({correction:true});h.open();h.els.get('bk-toggle').onclick();const button={dataset:{correctie:'0'}};await h.els.get('bk-lijst').click({target:{closest:s=>s==='[data-correctie]'?button:null}});assert.equal(h.writes,0);assert.equal(h.beheer.length,1);assert.equal(h.beheer[0].date,'2026-09-08');});
await test('Processed unclosed day is grey',()=>{const h=harness();h.H.state.commit({booked:{'2026-09-08':h.c.sumRows().map(r=>r.fp)}});h.run('boekStat()');assert.equal(h.els.get('d-boek').attrs['aria-disabled'],'true');});
await test('Only corrections routes completion directly to day beheer',async()=>{const h=harness({correction:true});h.H.state.commit({rules:h.H.state.read().rules.slice(0,1)});h.open();assert.match(h.els.get('bk-done').innerHTML,/Correcties bekijken/);await h.els.get('bk-done').onclick();assert.equal(h.beheer[0].date,'2026-09-08');assert.equal(h.writes,0);});
await test('Selected correction blocks clipboard and new receipts',async()=>{const h=harness({correction:true});h.open();h.run('boek.i=0;boek.completion=false;tekenBoek()');assert.match(h.els.get('bk-done').innerHTML,/Correctie bekijken/);await h.run('kopieerHuidig()');assert.equal(await h.run('zetGeboekt(boek.rows[0],true)'),false);assert.equal(h.copies.length,0);assert.equal(h.writes,0);await h.els.get('bk-done').onclick();assert.equal(h.beheer.length,1);});
console.log(`${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
