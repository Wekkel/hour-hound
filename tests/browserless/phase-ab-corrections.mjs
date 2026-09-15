import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.',read=p=>fs.readFileSync(root+'/'+p,'utf8');
const els=new Map(),copied=[];
const element=()=>({dataset:{},style:{},innerHTML:'',classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this[type]=fn;}});
const c=vm.createContext({console,setTimeout,clearTimeout,Date,localStorage:{getItem(){return null;}},document:{getElementById(id){if(!els.has(id))els.set(id,element());return els.get(id);},addEventListener(){}},navigator:{},window:{addEventListener(){}},kopieer:async text=>copied.push(text)});
for(const p of ['hh','domain/time','domain/booking','domain/dvn','domain/overbooking','storage/indexeddb','state','core','ui/manage-view','ui/overbooking-controller','ui/manage-controller'])vm.runInContext(read('js/'+p+'.js'),c,{filename:p});
const run=s=>vm.runInContext(s,c),HH=c.HH;
const d={id:'d',nummer:'123456789',naam:'Bank - Project',dvn:true,voorlopig:false,codes:[]};
const r={id:'r',datum:'2026-09-04',dossierId:'d',code:null,omschrijving:'red flag review docs',start:'09:00',eind:'13:00',soort:'werk'};
HH.state.commit({dossiers:[d],rules:[r],roundingMode:'groep',overbookings:[],bookingHistory:HH.domain.booking.emptyHistory()});
let failed=0,passed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
await test('Resolved DVN restores date for previously stripped description',()=>assert.equal(run('sumVanData(HH.state.read().rules)[0].oms'),'04.09.2026 red flag review docs'));
await test('Old DVN prefix loses project but retains work date',()=>assert.equal(HH.domain.dvn.resolvedDescription('04.09.2026 · Bank - Project · red flag review docs','2026-09-04'),'04.09.2026 red flag review docs'));
await test('Resolved description is idempotent and empty stays invalid',()=>{assert.equal(HH.domain.dvn.resolvedDescription('04.09.2026 red flag review docs','2026-09-04'),'04.09.2026 red flag review docs');assert.equal(HH.domain.dvn.resolvedDescription('','2026-09-04'),'');});
await test('Ordinary and unnumbered DVN descriptions retain text',()=>{for(const dossier of [{...d,dvn:false},{...d,nummer:null,voorlopig:true}]){HH.state.commit({dossiers:[dossier]});assert.equal(run('sumVanData(HH.state.read().rules)[0].oms'),r.omschrijving);}HH.state.commit({dossiers:[d]});});
await test('Correction exposes three copy actions and exact clipboard values',async()=>{
 const current=run('bookingSnapshotVan(sumVanData(HH.state.read().rules)[0],"2026-09-04")');
 const before={...current,targetNumber:'I700000000',code:'Commercieel',description:'04.09.2026 · Bank - Project · red flag review docs'};
 HH.state.commit({bookingHistory:{version:1,receipts:[{id:'receipt',channel:'day',snapshot:before,confirmedAt:'2026-09-05'}],resolutions:[]}});
 run('renderBookingCorrections()');const html=els.get('booking-corrections').innerHTML;
 for(const field of ['targetNumber','hours','description']){assert.ok(html.includes('data-booking-field="'+field+'"'));const button={dataset:{bookingCopy:'receipt|0',bookingField:field},innerHTML:'Kopieer'};await els.get('booking-corrections').click({target:{closest:selector=>selector==='[data-booking-copy]'?button:null}});}
 assert.deepEqual(copied,['123456789','4,0','04.09.2026 red flag review docs']);assert.equal(HH.state.read().bookingHistory.receipts[0].snapshot.description,before.description);
});
await test('Stale copy button cannot copy missing correction',async()=>{const count=copied.length,button={dataset:{bookingCopy:'missing|0',bookingField:'description'}};await els.get('booking-corrections').click({target:{closest:()=>button}});assert.equal(copied.length,count);});
console.log(`${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
