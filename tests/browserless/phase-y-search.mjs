import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(process.argv[2]||path.join(here,'../..'));
const wizard=fs.readFileSync(path.join(root,'js/wizard.js'),'utf8');
const noop=()=>{};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};

function harness(options={}){
  const dossiers=options.dossiers||[
    {id:'ordinary',nummer:'123',naam:'Gewone zaak',used:8},
    {id:'i7',nummer:'I700000000',naam:'Indirect',isI7:true,used:2},
    {id:'dvn',nummer:null,naam:'Klant zaak',voorlopig:true,used:1}
  ];
  const state={running:options.running||{id:'run:1',datum:'2026-09-06',start:'10:00',dossierId:null,code:null,omschrijving:''},dossiers,
    codes:options.codes||[{code:'I7:704',naam:'Commercieel',favoriet:true},{code:'I7:101',naam:'Overleg'}],rules:[],stack:[]};
  const calls={start:[],link:[],render:0,focus:[],toast:[]};
  const elements=new Map();
  function el(id,extra={}){
    const x={id,dataset:{},value:'',innerHTML:'',textContent:'',selectionStart:0,selectionEnd:0,
      classList:{toggle:noop,add:noop,remove:noop},focus(){context.document.activeElement=this;calls.focus.push(id);},
      setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b;},...extra};
    elements.set(id,x);return x;
  }
  const box=el('nt-wizard',{dataset:{},contains:x=>x&&x._inWizard===true,querySelector:()=>null,querySelectorAll:()=>[]});
  const context=vm.createContext({console,Promise,Date,setTimeout:f=>f(),clearTimeout,Map,Set,CSS:{escape:String},
    document:{activeElement:null},window:{},ntWizard:null,liveId:null,VOOR:'VOOR: ',VAST_VOORLOPIG:'I7:704',HH:{
      state:{read:()=>state},ui:{},app:{render(){calls.render++;}}},
    $:id=>elements.get(id)||null,esc:s=>String(s??''),schoon:s=>String(s??'').trim(),normOms:s=>String(s??'').trim().toLowerCase(),
    actief:()=>state.dossiers,dosOf:id=>state.dossiers.find(d=>d.id===id)||null,isIndirect:d=>!!(d&&(d.isI7||d.voorlopig)),
    i7:()=>state.dossiers.find(d=>d.isI7)||null,codesGesorteerd:()=>state.codes,takenVandaag:()=>options.tasks||[],
    taakKey:t=>t.k,taakLabel:t=>t.label||t.k,vandaagRegels:()=>state.rules,urenOf:()=>0,uu:String,
    codesFor:()=>[],omschrItems:()=>[],splitsDossier:()=>null,nummerBezet:()=>false,codeNaam:(d,c)=>c||'',
    i7CodeOp:(preferred,suffix)=>state.codes.find(c=>c.code===preferred||c.code.endsWith(suffix))?.code||null,
    prefixVoor:(d,date,s)=>s,planOmschr:noop,closeAC:noop,announce:noop,L:noop,kort:s=>s,
    toast:s=>calls.toast.push(s),startRegel:async op=>{calls.start.push(op);const r={id:'run:new',datum:'2026-09-06',start:'10:01',...op};state.running=r;return r;},
    koppelRegel:async(r,op)=>{calls.link.push({id:r&&r.id,op});if(options.link)return options.link(r,op,state,calls);
      if(!r)return null;Object.assign(r,op);return{regel:r,dossier:r.dossierId?dossiers.find(d=>d.id===r.dossierId):null};}
  });
  vm.runInContext(wizard,context,{filename:path.join(root,'js/wizard.js')});
  context.ntRender=()=>{calls.render++;};context.ntFocus=wat=>{calls.focus.push(wat||'default');};
  function resetWizard(extra={}){context.ntWizard=Object.assign(context.ntNieuwState(),extra);return context.ntWizard;}
  return{context,state,calls,resetWizard,el};
}

const tests=[];const test=(name,fn)=>tests.push([name,fn]);

test('N cuts once and metadata selection updates that same running rule',async()=>{
  const h=harness();await h.context.nieuweTaak();
  assert.equal(h.calls.start.length,1);assert.equal(h.context.ntWizard.step,'kind');assert.equal(h.context.ntWizard.id,'run:new');
  await h.context.ntKiesDossier('ordinary',false);
  assert.equal(h.calls.link.length,1);assert.equal(h.calls.link[0].id,'run:new');assert.equal(h.state.running.id,'run:new');assert.equal(h.context.ntWizard.step,'omschrijving');
});

test('double selection while save is pending performs one mutation',async()=>{
  const gate=deferred();const h=harness({link:async(r,op,state)=>{await gate.promise;Object.assign(r,op);return{regel:r};}});h.resetWizard();
  const a=h.context.ntKiesDossier('ordinary',false),b=h.context.ntKiesDossier('ordinary',false);
  assert.equal(h.calls.link.length,1);gate.resolve();await Promise.all([a,b]);assert.equal(h.context.ntWizard.step,'omschrijving');
});

test('failed save releases busy and permits retry',async()=>{
  let attempt=0;const h=harness({link:async(r,op)=>{attempt++;if(attempt===1)throw Error('disk');Object.assign(r,op);return{regel:r};}});h.resetWizard();
  await h.context.ntKiesDossier('ordinary',false);assert.equal(h.context.ntWizard.busy,false);assert.equal(h.context.ntWizard.step,'kind');
  await h.context.ntKiesDossier('ordinary',false);assert.equal(attempt,2);assert.equal(h.context.ntWizard.step,'omschrijving');
});

test('running replacement, wizard replacement, or Escape during await cannot advance foreign state',async()=>{
  for(const action of ['running','replace','escape']){
    const gate=deferred();const h=harness({link:async(r,op)=>{await gate.promise;Object.assign(r,op);return{regel:r};}});const old=h.resetWizard();
    const pending=h.context.ntKiesDossier('ordinary',false);
    if(action==='running')h.state.running={id:'run:foreign',datum:'2026-09-06',start:'10:02'};
    else {h.context.ntWizard={...h.context.ntNieuwState(),marker:'foreign'};if(action==='escape')h.context.ntTerug();}
    const afterAction=h.context.ntWizard;gate.resolve();await pending;
    assert.equal(h.context.ntWizard,afterAction);assert.notEqual(h.context.ntWizard?.step,'omschrijving');
    if(action==='running')assert.equal(h.state.running.id,'run:foreign');
  }
});

test('i7 selection requires a current real code and lands on the i7 dossier',async()=>{
  const h=harness();h.resetWizard();
  await h.context.ntKiesI7('missing');assert.equal(h.calls.link.length,0);assert.equal(h.context.ntWizard.step,'kind');
  await h.context.ntKiesI7('I7:101');assert.equal(h.calls.link.length,1);assert.equal(h.state.running.dossierId,'i7');assert.equal(h.state.running.code,'I7:101');assert.equal(h.context.ntWizard.kind,'i7');assert.equal(h.context.ntWizard.step,'omschrijving');
  const absent=harness({dossiers:[{id:'ordinary',nummer:'123',naam:'Gewone zaak'}]});absent.resetWizard();await absent.context.ntKiesI7('I7:101');assert.equal(absent.calls.link.length,0);assert.equal(absent.context.ntWizard.kind,null);
});

test('existing DVN selection reaches commercial metadata through the coupling adapter',async()=>{
  const h=harness({link:async(r,op,state)=>{const d=state.dossiers.find(x=>x.id===op.dossierId);Object.assign(r,op);
    if(d?.voorlopig)r.code=state.codes.find(c=>c.code==='I7:704')?.code||null;return r.code?{regel:r,dossier:d}:null;}});
  h.resetWizard({kind:'volgt',step:'volgt',dvnNaam:'Klant zaak'});await h.context.ntBevestigVolgt('dvn');
  assert.equal(h.state.running.dossierId,'dvn');assert.equal(h.state.running.code,'I7:704');assert.equal(h.context.ntWizard.step,'omschrijving');
});

let failed=0;
for(const [name,fn] of tests){try{await fn();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n  '+(error&&error.stack||error));}}
console.log(`${tests.length-failed}/${tests.length} task-selection safety checks passed (${root})`);
process.exitCode=failed?1:0;
