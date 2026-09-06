#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(process.argv[2]||join(here,'../..'));
const read=file=>readFileSync(join(root,file),'utf8');
const source={
  hh:read('js/hh.js'),time:read('js/domain/time.js'),booking:read('js/domain/booking.js'),
  dvn:read('js/domain/dvn.js'),over:read('js/domain/overbooking.js'),
  storage:read('js/storage/indexeddb.js'),day:read('js/services/day-rules.js'),
  timer:read('js/services/timer.js'),admin:read('js/services/admin.js'),
  core:read('js/core.js'),manage:read('js/ui/manage-controller.js')
};
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const equal=(actual,expected,message)=>assert(actual===expected,
  `${message}\nverwacht: ${expected}\ngekregen: ${actual}`);

function persistentDB(seed={}){
  const names=['regels','dossiers','meta','overboekingen','codes','templates'],rows={};
  for(const name of names)rows[name]=new Map(name==='meta'?Object.entries(seed.meta||{}):
    (seed[name]||[]).map(value=>[value.id||value.code,clone(value)]));
  let queue=Promise.resolve(),writes=0,failWrites=0;
  return{rows,failNextWrite(){failWrites++;},get writes(){return writes;},transaction(requested,mode){
    const stores=Array.isArray(requested)?requested:[requested];let release;
    const previous=queue;queue=new Promise(resolveDone=>{release=resolveDone;});
    let active=false,pending=0,aborted=false,data,finishing=false;
    const jobs=[],tx={error:null,abort(){aborted=true;tx.error=new Error('aborted');},
      objectStore(name){return{
        get:key=>request(()=>clone(data[name].get(key))),
        getAll:()=>request(()=>[...data[name].values()].map(clone)),
        put:(value,key)=>request(()=>{const id=key===undefined?(value.id||value.code):key;
          data[name].set(id,clone(value));return id;}),
        delete:key=>request(()=>data[name].delete(key)),
        clear:()=>request(()=>data[name].clear())
      };}};
    function finish(){if(finishing||pending)return;finishing=true;setTimeout(()=>{
      if(mode==='readwrite'&&failWrites){failWrites--;aborted=true;tx.error=new Error('Injected failure');}
      if(aborted)tx.onabort?.();else{if(mode==='readwrite'){
        for(const name of stores)rows[name]=data[name];writes++;}tx.oncomplete?.();}
      release();
    },0);}
    function request(action){let value;const request={readyState:'pending',error:null,
      get result(){if(request.readyState!=='done'){
        const error=new Error('IDBRequest.result accessed while pending');
        error.name='InvalidStateError';throw error;}return value;}};
      pending++;const run=()=>setTimeout(()=>{if(!aborted)try{value=action();request.readyState='done';
        request.onsuccess?.({target:request});}catch(error){request.error=tx.error=error;aborted=true;
        request.onerror?.({target:request});}pending--;finish();},0);
      if(active)run();else jobs.push(run);return request;
    }
    previous.then(()=>{data=Object.fromEntries(stores.map(name=>[name,
      new Map([...rows[name]].map(([key,value])=>[key,clone(value)]))]));active=true;
      jobs.forEach(run=>run());finish();});
    return tx;
  }};
}

function services(){
  const context={console,setTimeout,clearTimeout,queueMicrotask};vm.createContext(context);
  for(const [name,code] of Object.entries({hh:source.hh,time:source.time,booking:source.booking,
    dvn:source.dvn,over:source.over,storage:source.storage,day:source.day,timer:source.timer,
    admin:source.admin}))vm.runInContext(code,context,{filename:name+'.js'});
  context.HH.__context=context;return context.HH;
}
const date='2026-09-01',d={id:'d',nummer:'123456789',naam:'Dossier',codes:[]},rule={id:'r',datum:date,dossierId:'d',code:'A',omschrijving:'Werk',start:'09:00',eind:'10:00',uren:1,soort:'werk',revision:1};
function harness(seed={}){const HH=services(),g=HH.storage.indexedDB,b=HH.domain.booking,db=persistentDB({dossiers:[d],regels:[rule],meta:{},...seed});g.use(db);
const adapters={aggregateRows:(rs,ds,mode,overs,history)=>b.aggregateIntapp(rs,{roundingMode:mode,getDossier:id=>ds.find(x=>x.id===id),getIntappInfo:x=>({nummer:x?.nummer||'',naam:x?.naam||''}),getBoundaryId:r=>b.boundaryForSource(history,r.id,r.datum)}),snapshotRow:(row,date,rs,mode)=>b.bookingSnapshot(row,date,{roundingMode:mode,sources:rs.filter(r=>b.rowSourceIds(row).includes(r.id))}),validateRules:(rs,ds)=>b.validateDay(rs,{getDossier:id=>ds.find(x=>x.id===id)})};
const snap=(r=rule,dos=d)=>adapters.snapshotRow(adapters.aggregateRows([r],[dos],'groep',{})[0],date,[r],'groep');
return{HH,g,b,db,adapters,snap,input:(r=rule)=>({...adapters,snapshot:snap(r),fingerprint:'fp-'+r.id,enabled:true,receiptId:'p-'+r.id,resolutionId:'res-'+r.id,nowMs:2,nowIso:'2026-09-01T10:00:00Z'})};}
const checks=[];const test=(n,f)=>checks.push([n,f]);
test('snelle markeringen bewaren beide receipts en vlaggen',async()=>{const r2={...rule,id:'r2',omschrijving:'Ander'},h=harness({regels:[rule,r2]});const out=await Promise.all([h.HH.services.admin.setRegularBooking(h.input()),h.HH.services.admin.setRegularBooking(h.input(r2))]);assert(out.every(x=>x.ok),'markering mislukt');equal(h.db.rows.meta.get('bookingHistory').receipts.length,2,'receipt kwijt');equal(h.db.rows.meta.get('geboekt')[date].length,2,'vlag kwijt');});
test('oudere geboekte datums blijven behouden',async()=>{const booked=Object.fromEntries(Array.from({length:80},(_,i)=>[new Date(Date.UTC(2025,0,i+1)).toISOString().slice(0,10),['old']]));const h=harness({meta:{geboekt:booked}});const out=await h.HH.services.admin.setRegularBooking(h.input());assert(out.ok,'markering mislukt');equal(Object.keys(h.db.rows.meta.get('geboekt')).length,81,'historie afgekapt');});
test('gewijzigd doelnummer na tonen weigert markering',async()=>{const h=harness({dossiers:[{...d,nummer:'987654321'}]});const out=await h.HH.services.admin.setRegularBooking(h.input());assert(!out.ok,'nieuw doel stilzwijgend bevestigd');equal(h.db.rows.meta.has('bookingHistory'),false,'afgewezen boeking schreef historie');});
test('lopende regel met gelijk afgerond totaal is niet boekbaar',async()=>{const short={...rule,eind:'09:06',uren:0.1},h=harness({regels:[{...short,eind:null}]});const out=await h.HH.services.admin.setRegularBooking(h.input(short));assert(!out.ok,'lopende regel geboekt');});
test('getoonde verwijdering mag geen herstelde regel bevestigen',async()=>{const h=harness({regels:[{...rule,omschrijving:'Hersteld'}]});const before=h.snap();h.db.rows.meta.set('bookingHistory',{version:1,receipts:[{id:'p',channel:'day',snapshot:before,confirmedAt:'2026-09-01T10:00:00Z'}],resolutions:[]});const out=await h.HH.services.admin.resolveBookingCorrection({...h.adapters,receiptId:'p',currentKeys:[],resolutionId:'x',nowIso:'2026-09-01T11:00:00Z'});assert(!out.ok,'herstelde inhoud ongezien bevestigd');equal(h.db.rows.meta.get('bookingHistory').resolutions.length,0,'weigering schreef resolutie');});
function loadRealAdapters(h){
 const c=h.HH.__context,els=new Map(),dummy=()=>({dataset:{},style:{},value:'',classList:{add(){},remove(){},toggle(){},contains(){return false;}},setAttribute(){},addEventListener(){},querySelector(){return dummy();},querySelectorAll(){return[];}});
 c.window=c;c.addEventListener=()=>{};c.document={activeElement:null,getElementById:id=>{if(!els.has(id))els.set(id,dummy());return els.get(id);},addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;}};
 c.navigator={};c.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
 vm.runInContext(read('js/state.js'),c);h.HH.app.render=()=>{};
 vm.runInContext(source.core,c);vm.runInContext(read('js/booking.js'),c);
 h.HH.state.commit({dossiers:[d],rules:[rule],booked:{},bookingHistory:h.b.emptyHistory(),viewDate:date});
 return{aggregateRows:vm.runInContext('sumVanData',c),snapshotRow:vm.runInContext('bookingSnapshotVan',c),validateRules:vm.runInContext('valideerBoekData',c)};
}
test('echte core-adapter kan aan adminservice worden doorgegeven',async()=>{const h=harness(),real=loadRealAdapters(h);const out=await h.HH.services.admin.setRegularBooking({...h.input(),...real});assert(out.ok,'echte adapter boeking mislukt '+out.error);});
test('echte dagstatus laat oude vlag geen gewijzigde receipt overrulen',async()=>{const h=harness(),real=loadRealAdapters(h),c=h.HH.__context;const before=vm.runInContext('sumVan(HH.state.read().rules)[0]',c);const out=await h.HH.services.admin.setRegularBooking({...h.input(),...real,snapshot:real.snapshotRow(before,date,[rule],'groep'),fingerprint:before.fp});assert(out.ok,'voorbereiding mislukt');h.HH.state.commit({booked:out.booked,bookingHistory:out.history,dossiers:[{...d,nummer:'987654321'}]});assert(!vm.runInContext('isDossierGeboektOp(sumVan(HH.state.read().rules)[0],HH.state.read().viewDate)',c),'oude vlag maskeert correctie');});
const stamp='2026-09-01T10:00:00Z';
const record=(h,s,id='p')=>({id,channel:'day',snapshot:s,confirmedAt:stamp,confirmedContent:h.b.semanticKey(s)});
test('inhoudsvergelijking bewaart veldgrenzen en negeert timestamps',()=>{const h=harness(),s=h.snap();assert(!h.b.semanticEqual({...s,code:'A|B',description:'C'},{...s,code:'A',description:'B|C'}),'veldgrens verloren');assert(h.b.semanticEqual({...s,sources:[{id:'r',gewijzigd:1}]},{...s,sources:[{id:'r',gewijzigd:2}],roundingMode:'regel'}),'irrelevante wijziging');});
test('correctie op gesplitste groep bewaart ongewijzigde rest',async()=>{
 const a={...rule,id:'a'},b={...rule,id:'b'},h=harness({regels:[a,b]});
 const original=h.adapters.snapshotRow(h.adapters.aggregateRows([a,b],[d],'groep')[0],date,[a,b],'groep');
 h.db.rows.meta.set('bookingHistory',{...h.b.emptyHistory(),receipts:[record(h,original)]});
 h.db.rows.regels.set('b',{...b,omschrijving:'Tweede'});
 const current=()=>{const rs=[...h.db.rows.regels.values()],hist=h.db.rows.meta.get('bookingHistory');return h.adapters.aggregateRows(rs,[d],'groep',null,hist).map(row=>h.adapters.snapshotRow(row,date,rs,'groep'));};
 const resolveNow=async(id)=>h.HH.services.admin.resolveBookingCorrection({...h.adapters,receiptId:'p',currentKeys:current().map(h.b.semanticKey),resolutionId:id,nowIso:'2026-09-01T11:00:00Z'});
 assert((await resolveNow('split')).ok,'splitsing niet opgelost');equal(h.b.evidence(h.db.rows.meta.get('bookingHistory')).length,2,'splitsing verloor bewijs');
 h.db.rows.regels.set('a',{...a,omschrijving:'Eerste aangepast'});
 const c=h.b.corrections(h.db.rows.meta.get('bookingHistory'),current());equal(c.length,1,'groep kreeg conflicterende correcties');equal(c[0].currentOptions.length,2,'ongewijzigde rest niet in resolutie');
 assert((await resolveNow('second')).ok,'tweede correctie niet opgelost');equal(h.b.evidence(h.db.rows.meta.get('bookingHistory')).length,2,'tweede correctie verloor rest');
 const second=current().find(s=>s.sourceIds.includes('b'));
 const out=await h.HH.services.admin.setRegularBooking({...h.input(),snapshot:second,enabled:false,resolutionId:'unmark',nowIso:'2026-09-01T12:00:00Z'});
 assert(out.ok,'deelmarkering niet ingetrokken');equal(h.b.evidence(out.history).length,1,'deelmarkering verwijderde rest');assert(!h.b.evidenceForSnapshot(out.history,second),'intrekking genegeerd');
});
test('gewijzigde boeking kan niet als nieuwe boeking worden bevestigd',async()=>{const h=harness();const out=await h.HH.services.admin.setRegularBooking(h.input());assert(out.ok,'voorbereiding');const next={...rule,omschrijving:'Gewijzigd'};h.db.rows.regels.set('r',next);const again=await h.HH.services.admin.setRegularBooking(h.input(next));equal(again.error,'correction_required','dubbele boeking toegestaan');equal(h.db.rows.meta.get('bookingHistory').receipts.length,1,'bewijs verdubbeld');});
test('DVN en Dag delen dezelfde afgeronde boekingsregels',async()=>{
 const dvn={...d,dvn:true,dvnResolvedNr:d.nummer,voorlopig:false},a={...rule,eind:'09:01',uren:0.1},b={...a,id:'r2',start:'10:00',eind:'10:01'},h=harness({dossiers:[dvn],regels:[a,b]});
 const real=loadRealAdapters(h),c=h.HH.__context;h.HH.state.commit({dossiers:[dvn],rules:[a,b]});
 assert(vm.runInContext('!!sumVan(HH.state.read().rules)[0].dvnStatus',c),'DVN-label ontbreekt in dagwizard');
 const snapshots=vm.runInContext('dvnBoekSnapshots(HH.state.read().dossiers[0])',c);equal(snapshots[0].hours,0.1,'DVN rondt anders af');
 const out=await h.HH.services.admin.markDvnPosted({...real,dossier:dvn,dossiers:[dvn],rules:[a,b],snapshots,nowMs:2,nowIso:stamp});assert(out.ok,'DVN-post mislukt '+out.error);
 h.HH.state.commit({dossiers:[out.dossier],bookingHistory:out.history});assert(vm.runInContext('isDossierGeboektOp(sumVan(HH.state.read().rules)[0],HH.state.read().viewDate)',c),'Dag biedt DVN opnieuw aan');
});
test('via Dag geboekte DVN verschijnt afgehandeld',async()=>{const dvn={...d,dvn:true,dvnResolvedNr:d.nummer,voorlopig:false},h=harness({dossiers:[dvn]}),real=loadRealAdapters(h),c=h.HH.__context;h.HH.state.commit({dossiers:[dvn]});const out=await h.HH.services.admin.setRegularBooking({...h.input(),...real});assert(out.ok,'dagboeking');h.HH.state.commit({bookingHistory:out.history,booked:out.booked});equal(vm.runInContext('dvnIntappState(HH.state.read().dossiers[0])',c),'posted','DVN spreekt Dag tegen');});
test('oude DVN-bevestiging behoudt oorspronkelijke losse afronding',async()=>{
 const a={...rule,eind:'09:01',uren:0.1},b={...a,id:'r2',start:'10:00',eind:'10:01'},dvn={...d,dvn:true,dvnResolvedNr:d.nummer,voorlopig:false,dvnIntappStatus:'posted',dvnIntappPostedRuleIds:['r','r2'],dvnIntappPostedHours:0.2},h=harness({regels:[a,b],dossiers:[dvn]});
 const real=loadRealAdapters(h);h.HH.state.commit({dossiers:[dvn],rules:[a,b]});const out=await h.HH.services.admin.bootstrapLegacyBookings({...real,nowIso:stamp});equal(out.history.receipts.length,2,'oude DVN niet gemigreerd');assert(out.history.receipts.every(r=>r.legacyInferred),'reconstructie niet gemarkeerd');h.HH.state.commit({bookingHistory:out.history});equal(vm.runInContext('sumVan(HH.state.read().rules).reduce((n,r)=>n+r.u,0)',h.HH.__context),0.2,'oude afronding gewijzigd');
 const again=await h.HH.services.admin.bootstrapLegacyBookings({...real,nowIso:stamp});equal(again.history.receipts.length,2,'migratie verdubbelt');
});
function ioRuntime(h){loadRealAdapters(h);const c=h.HH.__context;c.schrijfOvergang=false;c.confirm=()=>true;c.prompt=()=>null;c.zorgVoorI7=async()=>{};c.laadInstellingen=async()=>{};c.herlaad=async()=>{};c.announce=()=>{};c.Blob=Blob;
 let blob;c.URL={createObjectURL:x=>{blob=x;return'blob:test';},revokeObjectURL(){}};c.document.createElement=()=>({click(){}});vm.runInContext(read('js/io.js'),c);
 vm.runInContext('kiesBackupActie=tekst=>{globalThis.__backupText=tekst;return Promise.resolve(globalThis.__backupAction||"restore")};metImportGrens=async fn=>fn();toast=tekst=>{globalThis.__toast=tekst}',c);
 return{c,choose:action=>{c.__backupAction=action;},check:vm.runInContext('keurBookingHistory',c),merge:vm.runInContext('voegBookingHistorySamen',c),checksum:vm.runInContext('checksumVan',c),importFile:vm.runInContext('importFile',c),export:async()=>{await c.document.getElementById('b-export').onclick();if(!blob)throw new Error(c.__toast||'geen exportblob');return JSON.parse(await blob.text());}};
}
test('back-up bewaart lange bron-ID en alle bronregels zonder afkappen',()=>{const h=harness(),io=ioRuntime(h),s=h.snap(),ids=Array.from({length:600},(_,i)=>'id-'+i+'x'.repeat(130));s.sourceIds=ids;s.sources=ids.map(id=>({id}));s.description='lang '.repeat(700);const history={...h.b.emptyHistory(),receipts:[record(h,s)]};const out=io.check(history);equal(out.fout.length,0,'geldige grote historie afgekeurd');equal(JSON.stringify(out.goed),JSON.stringify(history),'historie afgekapt');});
test('back-up weigert ontbrekende lijsten en beschadigde correctie',()=>{const h=harness(),io=ioRuntime(h);assert(io.check({version:1}).fout.length,'ontbrekende lijsten stil leeg');const history={...h.b.emptyHistory(),receipts:[record(h,h.snap())],resolutions:[{id:'x',receiptId:'p',type:'corrected',resolvedAt:stamp,currentSnapshots:[h.snap()],comparedContent:['verkeerd']}]};assert(io.check(history).fout.length,'vergelijking niet gecontroleerd');});
test('historiechecksum controleert ook broninhoud en tijdstempels',()=>{const h=harness(),io=ioRuntime(h),a={...h.b.emptyHistory(),receipts:[record(h,h.snap())]},b=clone(a);b.receipts[0].snapshot.sources[0].omschrijving='beschadigd';assert(io.checksum([],[],[],[],[],a)!==io.checksum([],[],[],[],[],b),'broninhoud buiten checksum');});
test('samenvoegen behoudt lokale beslissing en weigert identiteitsconflict',()=>{const h=harness(),io=ioRuntime(h),base={...h.b.emptyHistory(),receipts:[record(h,h.snap())]},current={...base,resolutions:[{id:'local',receiptId:'p',type:'reopened',resolvedAt:stamp,comparedContent:h.b.semanticKey(h.snap())}]},incoming={...base,resolutions:[{id:'remote',receiptId:'p',type:'corrected',resolvedAt:stamp,currentSnapshots:[h.snap()],comparedContent:[h.b.semanticKey(h.snap())]}]};equal(h.b.evidence(io.merge(current,incoming)).length,0,'gelijke timestamp overschreef lokale beslissing');let rejected=false;try{io.merge(base,{...base,receipts:[{...base.receipts[0],channel:'dvn'}]});}catch{rejected=true;}assert(rejected,'identiteitsconflict stil samengevoegd');});
test('echte export en restore bewaren schema11 en volledige historie',async()=>{const h=harness(),io=ioRuntime(h),history={...h.b.emptyHistory(),receipts:[record(h,h.snap())]};h.db.rows.meta.set('bookingHistory',history);const dump=await io.export();equal(dump.schemaVersion,11,'schema niet verhoogd');equal(JSON.stringify(dump.meta.bookingHistory),JSON.stringify(history),'export mist historie');
 const restored=harness({regels:[],dossiers:[]}),target=ioRuntime(restored);await target.importFile({size:100,text:async()=>JSON.stringify(dump)});equal(JSON.stringify(restored.db.rows.meta.get('bookingHistory')),JSON.stringify(history),'restore verloor historie · '+target.c.__toast);});
test('mislukte boeking bewaart geen halve status en retry commit eenmaal',async()=>{
 const h=harness();h.db.failNextWrite();let failed=false;try{await h.HH.services.admin.setRegularBooking(h.input());}catch{failed=true;}
 assert(failed,'opslagfout niet gemeld');assert(!h.db.rows.meta.has('geboekt')&&!h.db.rows.meta.has('bookingHistory'),'halve boeking bewaard');
 const out=await h.HH.services.admin.setRegularBooking(h.input());assert(out.ok,'retry mislukt');equal(h.db.writes,1,'boekstatus en historie niet in één commit');
});
test('oude gewijzigde DVN vereist expliciete controle vóór bevestiging',async()=>{
 const dvn={...d,dvn:true,dvnResolvedNr:d.nummer,voorlopig:false,dvnIntappStatus:'needs_check',dvnIntappPostedRuleIds:['r']},h=harness({dossiers:[dvn]}),real=loadRealAdapters(h);
 h.HH.state.commit({dossiers:[dvn]});const snapshots=vm.runInContext('dvnBoekSnapshots(HH.state.read().dossiers[0])',h.HH.__context),input={...real,dossier:dvn,dossiers:[dvn],rules:[rule],snapshots,nowMs:2,nowIso:stamp};
 equal((await h.HH.services.admin.markDvnPosted(input)).error,'correction_required','oude gewijzigde DVN opnieuw geboekt zonder controle');
 const out=await h.HH.services.admin.markDvnPosted({...input,legacyReviewed:true});assert(out.ok,'bewuste controle geweigerd');assert(out.history.receipts[0].legacyCorrection,'controle niet vastgelegd');
});
test('schema9 samenvoegen bewaart W-historie en terugzetten waarschuwt',async()=>{
 const origin=harness(),io=ioRuntime(origin),dump=await io.export();dump.schemaVersion=9;delete dump.meta.bookingHistory;
 delete dump.manifest.bookingReceipts;delete dump.manifest.bookingResolutions;
 dump.manifest.checksum=io.checksum(dump.dossiers,dump.regels,dump.templates,dump.codes,dump.overboekingen);
 for(const restore of [false,true]){const h=harness(),target=ioRuntime(h),history={...h.b.emptyHistory(),receipts:[record(h,h.snap())]},prompts=[];
  h.db.rows.meta.set('bookingHistory',history);target.choose(restore?'restore':'merge');target.c.confirm=message=>{prompts.push(message);return true;};
  await target.importFile({size:100,text:async()=>JSON.stringify(dump)});
  assert(target.c.__backupText.includes('geen duurzame boekingshistorie'),'oude back-up zonder waarschuwing');
  equal(h.db.rows.meta.get('bookingHistory').receipts.length,restore?0:1,'oude import verloor onbedoeld historie');
 }
});
test('oude afgeronde overboeking bewaart werkelijk eerder doelnummer',async()=>{
 const old={id:'o',status:'done',sourceDate:date,sourceRuleIds:['r'],sourceSnapshot:[rule],targetNumberSnapshot:d.nummer,
   targetNameSnapshot:d.naam,targetLines:[{werkcode:'A',omschrijving:'Werk',uren:1}],targetBookedAt:stamp},
   h=harness({dossiers:[{...d,nummer:'987654321'}],overboekingen:[old]});
 const real=loadRealAdapters(h);h.HH.state.commit({dossiers:[{...d,nummer:'987654321'}]});
 const out=await h.HH.services.admin.bootstrapLegacyBookings({...real,nowIso:stamp});equal(out.history.receipts[0].snapshot.targetNumber,d.nummer,'oorspronkelijk doelnummer vervangen');
 const rs=real.aggregateRows([rule],[{...d,nummer:'987654321'}],'groep',[],out.history).map(row=>real.snapshotRow(row,date,[rule],'groep'));
 equal(h.b.corrections(out.history,rs).length,1,'nummerwijziging van oude overboeking gemist');
});
let failures=0;for(const [name,run] of checks)try{await run();console.log('PASS '+name);}catch(e){failures++;console.log('FAIL '+name+': '+(e.stack||e.message));}console.log(`${checks.length-failures}/${checks.length} Phase W checks passed`);process.exitCode=failures?1:0;
