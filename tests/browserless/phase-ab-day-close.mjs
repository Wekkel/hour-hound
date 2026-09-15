import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=f=>fs.readFileSync((process.argv[2]||'.')+'/'+f,'utf8');
let failed=0;
async function test(name,fn){try{await fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+': '+e.message);}}
const elements=new Map(),events=[];
const make=id=>({id,value:id==='dc-end'?'17:00':'',textContent:'',innerHTML:'',style:{},children:[],classList:{add(){},remove(){},toggle(){}},setAttribute(){},focus(){},addEventListener(){}});
for(const id of ['dayclose','dc-date','dc-status','dc-done','dc-miss','dc-missing-wrap','dc-end','dc-warn','dc-help','dc-fill','dc-nofill','dc-goday','dc-cancel','dc-x','open-days'])elements.set(id,make(id));
const context={console,Date,Map,Set,Promise,setTimeout:f=>{queueMicrotask(f);return 1},clearTimeout,$:id=>elements.get(id),document:{getElementById:id=>elements.get(id),activeElement:null,addEventListener:(t,f)=>events.push(f),removeEventListener(){}},window:{},NORM:8,openDagenSnooze:0,autoAanvulTekort:n=>Math.max(0,8-n),
  dagLabel:d=>d,dmy:d=>d,voorstelDagEinde:()=> '17:00',m2hm:n=> '17:00',nowHM:()=> '17:00',werkdag:()=>true,dagIntappTotaal:()=>1,dagTekort:()=>7,dagAfsluitWaarschuwing:()=>[],uu:n=>String(n),esc:s=>String(s),hm2m:s=>/^\d\d:\d\d$/.test(s)?1:null,eindOf:r=>r.eind||r.start,
  sluitObj:()=>null,boekRekenContext:()=>({}),rustig:()=>Promise.resolve(),announce(){},meldTimerFout:()=>false,meldDagRegelFout:()=>false,mergeById:(a,b)=>a.concat(b.filter(Boolean)),vergeetTimerUndo(){},today:()=> '2026-09-15',
  HH:{domain:{},storage:{},services:{},ui:{},app:{},state:{}}};
vm.createContext(context);
for(const f of ['js/hh.js','js/domain/time.js','js/state.js'])vm.runInContext(read(f),context,{filename:f});
const H=context.HH;context.dagSluitStatus=d=>{const e=H.state.read().dayEnds[d]||null;return {open:e==null,gesloten:e!=null,eind:e}};H.state.commit({rules:[{id:'r',datum:'2026-09-14',start:'09:00',eind:'10:00',soort:'werk'}],dayEnds:{},dayAudit:{},viewDate:'2026-09-14'});
let openRenders=0;H.renderCoordinator.register('openDays',()=>{openRenders++}).register('day',()=>{});
vm.runInContext(read('js/app-runtime.js'),context,{filename:'js/app-runtime.js'});await test('navigation refreshes global day status',()=>{openRenders=0;H.app.showTab('nu');assert.equal(openRenders,1,'tab navigation must refresh the global open-day banner');});
vm.runInContext(read('js/ui/day-status-view.js'),context,{filename:'js/ui/day-status-view.js'});
let calls=0,toasts=[];context.toast=m=>toasts.push(m);context.simIntappTotaal=()=>1;
H.services.timer={isBlocked:()=>false,closeDay:async()=>{calls++;return {ok:true}}};
vm.runInContext(read('js/ui/day-close-controller.js')+'\n;globalThis.__close=sluitWerkdag;',context,{filename:'js/ui/day-close-controller.js'});
await test('stale confirmation cannot close the same day twice',async()=>{
  const closing=context.__close('2026-09-14');
  H.state.commit({dayEnds:{'2026-09-14':'17:00'}});
  elements.get('dc-nofill').onclick();
  assert.equal(await closing,false,'stale close sheet must be cancelled');
  assert.equal(calls,0,'stale close must not call closeDay twice');
  assert.match(toasts.at(-1),/al afgesloten om 17:00/);
});
if(failed)process.exitCode=1;
