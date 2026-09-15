import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=process.argv[2]||'.',read=p=>fs.readFileSync(root+'/'+p,'utf8');
function harness({count=1,booked=false,alias=false,fail=false}={}){
 const els=new Map(),copies=[];const element=id=>({id,disabled:false,dataset:{},style:{},innerHTML:'',textContent:'',attrs:{},classList:{add(){},remove(){},toggle(){},contains(){return false;}},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},toggleAttribute(){},addEventListener(type,fn){this[type]=fn;},focus(){},click(){return this.onclick?.();}});
 const c=vm.createContext({console,Date,setTimeout:()=>1,clearTimeout,localStorage:{getItem(){return null;}},document:{activeElement:null,getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id);},addEventListener(){}},window:{addEventListener(){}},navigator:{clipboard:{writeText:async s=>copies.push(s)}},confirm:()=>true,toast(){},L(){},controleer:()=>[]});
 for(const p of ['hh','domain/time','domain/booking','domain/dvn','domain/overbooking','storage/indexeddb','state','core','booking'])vm.runInContext(read('js/'+p+'.js'),c,{filename:p});
 const run=s=>vm.runInContext(s,c),H=c.HH,date='2026-09-08';
 const d={id:'d',nummer:alias?null:'304000001',naam:alias?'DVN alias':'Bank - Project',dvn:true,voorlopig:false,dvnTo:alias?'real':null,dvnResolvedNr:'304000001',codes:[]};
 const ds=[d,{id:'real',nummer:'304000001',naam:'Bank - Project',codes:[]},{id:'i7',nummer:'I700000000',naam:'Indirecte uren',isI7:true}];
 const rs=Array.from({length:count},(_,i)=>({id:'r'+i,datum:date,dossierId:'d',omschrijving:'Werk '+i,code:null,start:'09:00',eind:'09:36',soort:'werk'}));
 H.state.commit({dossiers:ds,rules:rs,codes:[{code:'COM',naam:'Commercieel'}],viewDate:date,booked:{},bookingHistory:H.domain.booking.emptyHistory(),roundingMode:'groep'});
 c.sumRows=()=>run('sumVanData(HH.state.read().rules)');c.controleer=()=>[];let writes=0;
 H.services.admin={setRegularBooking:async input=>{writes++;if(fail)return {ok:false,error:'source_changed'};const values=new Set(H.state.read().booked[date]||[]);input.enabled?values.add(input.fingerprint):values.delete(input.fingerprint);return {ok:true,booked:{[date]:[...values]},history:H.domain.booking.emptyHistory()};},parkOverbooking:async input=>{writes++;return {ok:true,overbooking:{id:'over',status:'waiting',sourceDate:date,sourceRuleIds:input.row.bron.map(x=>x.id),hours:input.row.u},history:H.domain.booking.emptyHistory()};}};
 if(booked)H.state.commit({booked:{[date]:c.sumRows().map(r=>r.fp)}});
 const key=k=>H.ui.bookingKeys({key:k,target:{tagName:'BODY'},preventDefault(){}});
 return {c,H,els,copies,run,key,get writes(){return writes;},open:()=>els.get('d-boek').onclick()};
}
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.stack);}}
await test('Last booking shows completion and disables copy including C',async()=>{const h=harness();h.open();await h.els.get('bk-done').onclick();assert.equal(h.writes,1);assert.equal(h.els.get('bk-copy').disabled,true);assert.ok(!h.els.get('bk-kaart').innerHTML.includes('Werk 0'));await h.els.get('bk-copy').onclick();h.key('c');assert.equal(h.copies.length,0);});
await test('Reopening processed open day shows only completion',()=>{const h=harness({booked:true});h.open();assert.equal(h.els.get('bk-copy').disabled,true);assert.ok(!h.els.get('bk-kaart').innerHTML.includes('Werk 0'));});
await test('Back to processed row cannot copy while other work remains',async()=>{const h=harness({count:2});h.open();await h.els.get('bk-done').onclick();h.els.get('bk-prev').onclick();h.key('c');await h.els.get('bk-copy').onclick();assert.equal(h.copies.length,0);assert.equal(h.els.get('bk-copy').disabled,true);});
await test('Last list checkbox reaches completion',async()=>{const h=harness();h.open();const b={dataset:{done:'0'},checked:true};await h.els.get('bk-lijst').click({target:{closest:s=>s==='[data-done]'?b:null}});assert.equal(h.els.get('bk-copy').disabled,true);assert.ok(!h.els.get('bk-kaart').innerHTML.includes('Werk 0'));});
await test('Failed booking remains open and copyable',async()=>{const h=harness({fail:true});h.open();await h.els.get('bk-done').onclick();assert.equal(h.els.get('bk-copy').disabled,false);await h.els.get('bk-copy').onclick();assert.equal(h.copies.length,1);});
for(const alias of [false,true])await test('Numbered DVN parking copies actual Intapp fields'+(alias?' through alias':''),async()=>{const h=harness({alias});h.open();assert.equal(h.els.get('bk-park').style.display,'');h.els.get('bk-park').onclick();for(const id of ['pb-i7-copy','pb-hours-copy','pb-copy'])await h.els.get(id).onclick();assert.equal(h.copies[0],'I700000000');assert.equal(h.copies[1],'0,6');assert.ok(h.copies[2].startsWith('Tijdelijk i7 voor 304000001 · Bank - Project · '));assert.ok(h.copies[2].includes('Werk 0'));await h.els.get('pb-save').onclick();assert.equal(h.H.state.read().overbookings.length,1);assert.equal(h.els.get('bk-copy').disabled,true);});
await test('Completion list permits correcting an accidental booking marker',async()=>{
 const h=harness();h.open();await h.els.get('bk-done').onclick();h.els.get('bk-toggle').onclick();
 assert.equal(h.els.get('bk-lijst').style.display,'block');
 const button={dataset:{done:'0'},checked:false};
 await h.els.get('bk-lijst').click({target:{closest:s=>s==='[data-done]'?button:null}});
 assert.equal(h.H.state.read().booked['2026-09-08'].length,0);
 assert.equal(h.els.get('bk-copy').disabled,false);
});
console.log(`${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
