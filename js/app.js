"use strict";
/* ---------- render en start ---------- */
HH.storage.indexedDB.requireWriteLock();
HH.renderCoordinator.register("live",renderLive).register("recent",renderRecent)
  .register("saveStatus",renderOpslagStatus).register("totals",renderTot).register("openDays",renderOpenDagen)
  .register("day",bouwDag).register("week",renderWeek).register("manage",renderBeheer);
HH.app.assertReady();

async function migrate(){
  if(await get("meta","v3done"))return;
  try{
    if(!(await get("meta","v3dossiers"))){
      const oldM=await getAll("matters");
      if(oldM.length&&!(await getAll("dossiers")).length)
        await tx("dossiers","readwrite",o=>{oldM.forEach((m,i)=>o.put({
          id:m.id,nummer:m.number&&m.number!=="—"?m.number:null,
          naam:m.name||m.alias,lang:m.lang||"nl",
          voorlopig:!(m.number&&m.number!=="—"),
          codes:[],c:i,used:1,isI7:/^i7/i.test(m.alias||""),archief:false}));});
      await putK("meta",true,"v3dossiers");}
    /* Deterministische ID's per oude dag en slotpositie: een migratie die halverwege
       afbreekt en opnieuw draait overschrijft dezelfde records in plaats van
       dubbele regels aan te maken.                                              */
    for(const day of await getAll("days")){
      const S=day.slots||[],rows=[];let i=0;
      const key=s=>s.m+"|"+(s.n||"")+"|"+(s.c||"");
      while(i<S.length){
        if(!S[i]){i++;continue;}
        const a=i,k=key(S[i]);
        while(i<S.length&&S[i]&&key(S[i])===k)i++;
        rows.push({id:"v3-"+day.date+"-"+a,datum:day.date,
          start:m2hm(420+a*6),eind:m2hm(420+i*6),
          dossierId:S[a].m,code:S[a].c||null,omschrijving:S[a].n||"",
          uren:(i-a)/10,urenHand:false,soort:"werk",
          gemaakt:Date.now(),gewijzigd:Date.now()});}
      if(rows.length)await tx("regels","readwrite",o=>{rows.forEach(r=>o.put(r));});}
    await putK("meta",true,"v3done");
  }catch(e){L("FOUT-migratie",String(e));
    toast("Migratie niet afgerond — er is niets verwijderd en hourhound probeert het "+
      "bij de volgende start opnieuw");}}

/* Invariant bij elke start: er is hooguit één open regel, en meta.running wijst
   precies naar die regel. Wijkt de database daarvan af — na een crash, een gesloten
   tabblad of een mislukte schrijfactie — dan wordt dat hier hersteld voordat de
   gebruiker iets kan doen. Een ontbrekende pointer bij nul of één open regel wordt
   veilig rechtgezet; meerdere open regels worden nooit stilzwijgend afgesloten. */
/* Alleen een ondubbelzinnige situatie wordt automatisch rechtgezet: nul of één open
   regel met een ontbrekende of verkeerde pointer. Bij meerdere open regels wordt er
   niets gewijzigd; dan verschijnt het herstelvenster en liggen alle timeracties stil
   tot de gebruiker heeft bevestigd.                                            */
async function herstelInvariant(snapshotMeta,allowWrite){
  const uitSnapshot=!!snapshotMeta;
  const rid=uitSnapshot?snapshotMeta.running:await get("meta","running");
  /* Oude versies konden een uitgestelde taakwissel in meta.pending bewaren. De
     huidige versie kent dat concept niet meer; de oude marker wordt daarom alleen
     opgeruimd, zonder retroactief een tijdknip te verzinnen. */
  const oudPending=(uitSnapshot?snapshotMeta.pending:await get("meta","pending"))||null;
  const uit=await HH.services.timer.repairInvariant({currentTimer:HH.state.read().running,
    readCurrentTimer:()=>HH.state.read().running,rules:HH.state.read().rules,pointerId:rid||null,
    pendingId:oudPending,allowWrite:allowWrite!==false});
  if(await meldTimerFout(uit,"Timerstatus herstellen is niet uitgevoerd"))return;
  pending=null;if(oudPending)L("migratie-pending","oude uitgestelde taakwissel verwijderd");
  HH.state.commit({running:uit.currentTimer});
  if(!uit.blocked){
    if(uit.pointerChanged){L("herstel","pointer "+(HH.state.read().running?"gezet op open regel":"gewist"));
      if(HH.state.read().running)toast("Lopende regel hersteld — loopt sinds "+HH.state.read().running.start);}
    $("l-herstel").classList.remove("on");return;}
  $("l-herstel").classList.add("on");
  L("herstel-nodig",uit.openRules.length+" open regels");
  toonHerstel();}
function openRegels(){return HH.state.read().rules.filter(r=>!r.eind)
  .sort((a,b)=>(a.datum+a.start)<(b.datum+b.start)?-1:1);}
function voorstelEind(r){
  const na=HH.state.read().rules.filter(x=>x.datum===r.datum&&x.id!==r.id&&hm2m(x.start)!=null&&
    hm2m(x.start)>hm2m(r.start)).sort((a,b)=>hm2m(a.start)-hm2m(b.start))[0];
  if(na)return na.start;
  if(r.datum===today())return nowHM();
  return r.start;}
function toonHerstel(){
  const open=openRegels();
  if(open.length<2){$("herstel").classList.remove("on");return;}
  $("h-lijst").innerHTML=open.map(r=>{
    const d=dosOf(r.dossierId);
    return '<div class="hrow" data-id="'+esc(r.id)+'">'+
      '<span class="hs">'+esc(r.start)+"</span>"+
      "<span>"+esc(dmy(r.datum))+" · "+esc(d?d.naam:"geen dossier")+
      (r.omschrijving?' <span class="hint">'+esc(kort(r.omschrijving,40))+"</span>":"")+
      "</span>"+
      '<input type="text" data-eind value="'+esc(voorstelEind(r))+'">'+
      (r.datum===today()?
        '<label><input type="radio" name="hloopt" value="'+esc(r.id)+
        '" style="width:auto;min-width:0"> laat lopen</label>':
        '<span class="hint">oude dag</span>')+
      "</div>";}).join("")+
    '<div class="hrow"><span></span><span class="hint">Of laat geen enkele regel '+
    'doorlopen.</span><span></span>'+
    '<label><input type="radio" name="hloopt" value="" checked '+
    'style="width:auto;min-width:0"> geen</label></div>';
  $("herstel").classList.add("on");}
$("l-herstelknop").onclick=toonHerstel;
$("h-later").onclick=()=>{$("herstel").classList.remove("on");
  toast("Timeracties blijven geblokkeerd tot je dit hebt afgerond");};
$("h-ok").onclick=async()=>{
  const rijen=[...$("h-lijst").querySelectorAll(".hrow[data-id]")];
  const gekozen=($("h-lijst").querySelector('input[name="hloopt"]:checked')||{}).value||"";
  const nieuw=[];
  for(const rij of rijen){
    const r=HH.state.read().rules.find(x=>x.id===rij.dataset.id);
    if(!r)continue;
    if(r.id===gekozen)continue;
    const v=rij.querySelector("[data-eind]").value.trim();
    const m=hm2m(v);
    if(m==null){alert("Ongeldige eindtijd bij "+r.start);return;}
    if(m<hm2m(r.start)){alert("Eindtijd ligt vóór de starttijd bij "+r.start);return;}
    nieuw.push(Object.assign({},r,{eind:m2hm(m),
      uren:Math.ceil(Math.max(1,m-hm2m(r.start))/6)/10,urenHand:false,
      hersteld:true,herstelOp:Date.now(),
      herstelOrigineel:{eind:null,uren:r.uren,urenHand:!!r.urenHand},
      gewijzigd:Date.now()}));}
  const uit=await HH.services.timer.confirmRecovery({currentTimer:HH.state.read().running,readCurrentTimer:()=>HH.state.read().running,
    rules:HH.state.read().rules,replacements:nieuw,chosenId:gekozen||null,waitForRules:rustig});
  if(await meldTimerFout(uit,"Herstel is niet uitgevoerd")){alert("Herstel mislukt");return;}
  const nextRules=mergeById(HH.state.read().rules,uit.rules);
  HH.state.commit({rules:nextRules,running:uit.currentTimerId?
    (nextRules.find(x=>x.id===uit.currentTimerId)||null):null});
  vergeetTimerUndo("herstel bevestigd");
  $("herstel").classList.remove("on");$("l-herstel").classList.remove("on");
  liveId=null;refreshDay();bouwDag();HH.app.render();announce();
  L("herstel-bevestigd",nieuw.length+" afgesloten · lopend "+(gekozen?"ja":"nee"));
  toast(nieuw.length+" regel(s) afgesloten — de oorspronkelijke waarden zijn bewaard");};

async function herlaad(metInstellingen){
  /* Eerst één consistente database-snapshot; pas na een volledig geslaagde
     transactie wordt runtime-state vervangen. Een leesfout laat alles intact. */
  const snapshot=await HH.storage.repositories.loadSnapshot();
  const delta={dossiers:snapshot.dossiers,templates:snapshot.templates,
    codes:snapshot.codes,rules:snapshot.regels,overbookings:snapshot.overboekingen,
    stack:snapshot.meta.stack||[],dayEnds:snapshot.meta.dagEinde||{},
    dayAudit:snapshot.meta.dagAudit||{}};
  Object.assign(delta,instellingenDelta(snapshot.meta));
  HH.state.commit(delta);
  pasInstellingenUiToe(snapshot.meta);
  await herstelInvariant(snapshot.meta,HH.storage.indexedDB.hasWriteAccess());
  if(HH.storage.indexedDB.hasWriteAccess()){
    const nowIso=new Date().toISOString(),legacy=await HH.services.admin.bootstrapLegacyBookings({
      aggregateRows:sumVanData,snapshotRow:bookingSnapshotVan,nowIso});
    if(legacy.ok&&legacy.added)HH.state.commit({bookingHistory:legacy.history});
  }
  /* Niet awaiten: herlaad() kan vanuit de foutafhandeling van TimerService worden
     aangeroepen, en middernachtCheck() raadpleegt daarna dezelfde service.       */
  if(HH.storage.indexedDB.hasWriteAccess())setTimeout(middernachtCheck,0);
  liveId=null;HH.app.render();}

/* W2: de handmatig geïmporteerde i7-werklijst in IndexedDB is leidend. De gebruiker
   bewaart werkcodes.json bewust niet in de repository, dus een bestaande lokale lijst
   mag bij een start nooit afhankelijk worden van een netwerkfetch of een eventueel
   oude service-worker-cache. Alleen wanneer lokaal nog géén codes bestaan, proberen
   we werkcodes.json als eenmalige bootstrap voor installaties die het bestand wél naast
   index.html hebben staan.                                                      */
async function laadWerkcodes(){
  const lokaal=await getAll("codes");
  if(lokaal.length){
    HH.state.commit({codes:lokaal});
    L("werkcodes-lokaal","behouden · "+lokaal.length+" codes");
    return false;}
  let d=null;
  try{
    const r=await fetch("werkcodes.json",{cache:"no-cache"});
    if(!r.ok){L("werkcodes-json",r.status+" bij ophalen · lokale lijst leeg");return false;}
    d=await r.json();
  }catch(e){L("werkcodes-json","niet opgehaald · lokale lijst leeg: "+
    String(e).slice(0,50));return false;}
  const rij=keurCodes(d&&Array.isArray(d.codes)?d.codes:d);
  if(!rij.goed.length){L("werkcodes-json","geen bruikbare codes · lokale lijst leeg");return false;}
  await replaceAll("codes",rij.goed);
  HH.state.commit({codes:await getAll("codes")});
  L("werkcodes-json","bootstrap · "+rij.goed.length+" codes"+
    (rij.fout.length?" · "+rij.fout.length+" afgekeurd":""));
  toast("Werkcodelijst geladen uit werkcodes.json — "+rij.goed.length+" codes");
  return true;}
async function zorgVoorI7(){
  const uit=await HH.services.admin.ensureI7({nowMs:Date.now()});
  if(!uit||!uit.ok){toast("I7-dossier niet aangemaakt — er is niets gewijzigd");return null;}
  if(uit.dossier)HH.state.upsert("dossiers",uit.dossier);
  return uit.dossier||null;}

function instellingenDelta(meta){return{codeUsage:meta.codeGebruik||{},
  booked:meta.geboekt||{},bookingHistory:bookingDomain.normalizeHistory(meta.bookingHistory),
  roundingMode:meta.rondMode||"groep"};}
function pasInstellingenUiToe(meta){
  logboek=meta.log||[];
  logOms=!!meta.logOms;
  $("b-logoms").checked=logOms;$("logstat").textContent=logboek.length+" regels";
  zetThema(meta.thema||"donker");
  $("d-mode").value=HH.state.read().roundingMode;
}
function pasInstellingenToe(meta){HH.state.commit(instellingenDelta(meta));pasInstellingenUiToe(meta);}
async function laadInstellingen(){
  pasInstellingenToe(await HH.storage.repositories.config.getMany([
    "codeGebruik","geboekt","bookingHistory","log","logOms","thema","rondMode"]));
}

let schrijfOvergang=false,syncTimer=null,syncBusy=false,syncNogmaals=false;
const overnameAntwoorden=new Map();
function zetSchrijfmodus(canWrite,unsupported){
  const banner=$("writer-banner");if(!banner)return;
  banner.style.display=canWrite?"none":"flex";
  $("writer-status").textContent=unsupported?
    "Deze browser ondersteunt geen veilig schrijfvenster. Gebruik een browser met Web Locks om uren te wijzigen.":
    "Dit venster is alleen-lezen. Je kunt hier de actuele uren bekijken of verder werken.";
  document.body.classList.toggle("read-only",!canWrite);
  $("writer-takeover").disabled=!!unsupported||schrijfOvergang;
}
function stuurVensterbericht(message){if(bc)try{bc.postMessage(Object.assign({from:TABID},message));}catch(ignore){}}
HH.storage.indexedDB.onCommit(()=>stuurVensterbericht({type:"changed"}));
async function synchroniseerLeesvenster(){
  if(HH.storage.indexedDB.hasWriteAccess()||schrijfOvergang)return;
  if(syncBusy){syncNogmaals=true;return;}
  syncBusy=true;
  try{await herlaad(true);}catch(error){toast("Bijwerken mislukt — probeer opnieuw of herlaad het venster");}
  finally{syncBusy=false;if(syncNogmaals){syncNogmaals=false;synchroniseerLeesvenster();}}
}
async function ontvangVensterbericht(event){
  const m=event.data;if(!m||m.from===TABID||!HH.state.read().db)return;
  if(m.target&&m.target!==TABID)return;
  if(m.type==="takeover-ready"||m.type==="takeover-denied"){
    const resolve=overnameAntwoorden.get(m.requestId);if(resolve)resolve(m);return;
  }
  if(m.type==="takeover-request"){
    if(!HH.storage.indexedDB.hasWriteAccess())return;
    const antwoord=type=>stuurVensterbericht({type,target:m.from,requestId:m.requestId});
    const active=document.activeElement,editing=active&&/^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName);
    if(schrijfOvergang||HH.ui.modals.anyOpen()||editing||sluitWerkdag.busy||vulAanTot8.busy){
      antwoord("takeover-denied");return;}
    schrijfOvergang=true;zetSchrijfmodus(false,false);
    try{
      await flushOmschr();await rustig(HH.state.read().rules.map(r=>r.id));
      if(HH.services.timer.idle)await HH.services.timer.idle();
      await HH.storage.indexedDB.releaseWriteLock();
      undoStack=[];ntWizard=null;liveId=null;antwoord("takeover-ready");
    }catch(error){HH.storage.indexedDB.resumeWrites();antwoord("takeover-denied");
      toast("Overname niet uitgevoerd: de laatste wijziging kon niet worden opgeslagen");}
    finally{schrijfOvergang=false;zetSchrijfmodus(HH.storage.indexedDB.hasWriteAccess(),false);}
    if(!HH.storage.indexedDB.hasWriteAccess())await synchroniseerLeesvenster();return;
  }
  // An active writer owns local drafts; only readers replace their entire snapshot.
  if(!HH.storage.indexedDB.hasWriteAccess()){
    clearTimeout(syncTimer);syncTimer=setTimeout(synchroniseerLeesvenster,30);
  }
}
async function neemSchrijvenOver(){
  if(schrijfOvergang)return;
  schrijfOvergang=true;const button=$("writer-takeover");button.disabled=true;
  try{
    let acquired=await HH.storage.indexedDB.acquireWriteLock(navigator.locks,false);
    if(!acquired&&bc){
      const requestId=TABID+":"+Date.now(),answer=await new Promise(resolve=>{
        const timeout=setTimeout(()=>{overnameAntwoorden.delete(requestId);resolve(null);},5000);
        overnameAntwoorden.set(requestId,m=>{clearTimeout(timeout);overnameAntwoorden.delete(requestId);resolve(m);});
        stuurVensterbericht({type:"takeover-request",requestId});
      });
      if(answer&&answer.type==="takeover-ready")acquired=await HH.storage.indexedDB.acquireWriteLock(navigator.locks,false);
    }
    if(!acquired){toast("Rond de invoer in het andere venster af of sluit het; probeer daarna opnieuw");return;}
    // Do not enable editing until the new owner has loaded and repaired the current snapshot.
    undoStack=[];ntWizard=null;await migrate();await boot(true);
    toast("Je kunt in dit venster verder werken");
  }catch(error){await HH.storage.indexedDB.releaseWriteLock();
    toast("Overname mislukt — dit venster blijft alleen-lezen");}
  finally{schrijfOvergang=false;zetSchrijfmodus(HH.storage.indexedDB.hasWriteAccess(),!navigator.locks);}
}
$("writer-takeover").onclick=neemSchrijvenOver;
function bewaakLeesvenster(event){
  if(!schrijfOvergang&&HH.storage.indexedDB.hasWriteAccess())return;
  const target=event.target,viewControl=target&&typeof target.closest==="function"&&
    target.closest("#writer-takeover,#tabs,#d-prev,#d-next,#d-today,#d-date,#w-prev,#w-next,#w-now,[data-open-view]");
  if(!schrijfOvergang&&(viewControl||(updateHerlaadNodig&&target&&
    typeof target.closest==="function"&&target.closest("#btn-update"))))return;
  if(event.type==="keydown"&&(event.key==="Tab"||(event.ctrlKey||event.metaKey)&&["c","a","f"].includes(event.key.toLowerCase())))return;
  if(event.type==="click"&&(!target||!target.closest("button,input,select,textarea,[contenteditable]")))return;
  event.preventDefault();event.stopImmediatePropagation();
}
["click","keydown","beforeinput","change","drop","paste"].forEach(type=>window.addEventListener(type,bewaakLeesvenster,true));
window.addEventListener("focus",()=>{if(!HH.storage.indexedDB.hasWriteAccess())synchroniseerLeesvenster();});

let tick=null;
async function boot(canWrite){
  if(canWrite){await zorgVoorI7();await laadWerkcodes();}
  await herlaad(true);
  if(canWrite)await herstelOmschr();
  if(canWrite)setTimeout(controleerOudeLopendeTaak,0);
  L("app-start","dossiers "+HH.state.read().dossiers.length+" · regels "+HH.state.read().rules.length+
    " · sjablonen "+HH.state.read().templates.length+" · i7-codes "+HH.state.read().codes.length+
    " · overboekingen "+HH.state.read().overbookings.filter(overboekingOpen).length+
    " · lopend "+(HH.state.read().running?HH.state.read().running.start:"nee"));
  if(tick)clearInterval(tick);
  tick=setInterval(()=>{if(schrijfOvergang)return;
    if(HH.storage.indexedDB.hasWriteAccess())middernachtCheck();
    if(HH.state.read().running){HH.renderCoordinator.render(["live","totals"]);if(HH.storage.indexedDB.hasWriteAccess())controleerOudeLopendeTaak();}},10000);}

(async function(){
  try{HH.state.commit({db:await openDB()});}catch(e){
    document.body.innerHTML="<main><section>IndexedDB niet beschikbaar: "+esc(e)+"</section></main>";return;}
  if(navigator.storage&&navigator.storage.persist){
    try{if(!(await navigator.storage.persisted()))await navigator.storage.persist();}catch(e){}}
  const lockSupported=!!(navigator.locks&&typeof navigator.locks.request==="function"),
    canWrite=await HH.storage.indexedDB.acquireWriteLock(navigator.locks,false);
  zetSchrijfmodus(canWrite,!lockSupported);
  schrijfOvergang=true;
  try{if(canWrite)await migrate();await boot(canWrite);}
  catch(error){await HH.storage.indexedDB.releaseWriteLock();toast("Starten mislukt — herlaad het venster");}
  finally{schrijfOvergang=false;zetSchrijfmodus(HH.storage.indexedDB.hasWriteAccess(),!lockSupported);}})();

/* Een update mag pas herladen nadat toegelaten schrijfacties zijn afgerond.
   De schrijflease blijft vastgehouden tot reload, zodat een ander venster niet
   tussen de laatste snapshot en de herlaadactie nieuwe wijzigingen start. */
let updateVoorbereiding=null,updateHerlaadNodig=false,updateHerlaadt=false;
let updateWachtTimer=null;
function herstelNaUpdateFout(error){
  clearTimeout(updateWachtTimer);updateWachtTimer=null;
  updateVoorbereiding=null;
  HH.storage.indexedDB.resumeWrites();schrijfOvergang=false;
  zetSchrijfmodus(HH.storage.indexedDB.hasWriteAccess(),!navigator.locks);
  $("btn-update").disabled=false;$("btn-update").style.display="";
  toast("Update niet herladen: "+(error.message||"bewaren mislukt")+". Probeer opnieuw.");
}
function bereidUpdateVoor(){
  if(updateVoorbereiding)return updateVoorbereiding;
  if(schrijfOvergang||HH.ui.modals.anyOpen()||sluitWerkdag.busy||vulAanTot8.busy)
    return Promise.reject(new Error("rond eerst de open actie af"));
  schrijfOvergang=true;$("btn-update").disabled=true;
  updateVoorbereiding=(async()=>{
    if(HH.storage.indexedDB.hasWriteAccess()){
      await flushOmschr();await rustig(HH.state.read().rules.map(r=>r.id));
      await HH.services.timer.idle();
    }
    await HH.storage.indexedDB.pauseWrites();
  })();
  return updateVoorbereiding;
}
async function herlaadNaUpdate(){
  if(updateHerlaadt)return;
  try{await bereidUpdateVoor();
    if(updateHerlaadt)return;
    clearTimeout(updateWachtTimer);updateHerlaadt=true;location.reload();
  }catch(error){
    // Een andere overgang bezit zijn eigen invoer- en opslaggrens.
    if(!updateVoorbereiding){$("btn-update").style.display="";
      toast("Update klaar. Rond de open actie af en klik daarna op Update.");return;}
    herstelNaUpdateFout(error);
  }
}
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").then(reg=>{
    const check=()=>{if(reg.waiting)$("btn-update").style.display="";};check();
    reg.addEventListener("updatefound",()=>{const w=reg.installing;if(!w)return;
      w.addEventListener("statechange",()=>{
        if(w.state==="installed"&&navigator.serviceWorker.controller)check();});});
    $("btn-update").onclick=async()=>{
      if(updateHerlaadNodig){await herlaadNaUpdate();return;}
      if(updateVoorbereiding||!reg.waiting)return;
      if(HH.state.read().running&&!confirm("Er loopt een regel. De pagina herlaadt na de update.\nDoorgaan?"))return;
      try{
        await bereidUpdateVoor();
        if(!reg.waiting)throw new Error("de nieuwe versie is niet meer beschikbaar");
        reg.waiting.postMessage({type:"SKIP_WAITING"});
        if(!updateHerlaadt)updateWachtTimer=setTimeout(()=>herstelNaUpdateFout(
          new Error("activeren duurt te lang")),15000);
      }catch(error){if(updateVoorbereiding)herstelNaUpdateFout(error);
        else toast("Rond eerst de open actie af en probeer de update opnieuw");}
    };
    setInterval(()=>reg.update().catch(()=>{}),15*60*1000);}).catch(()=>{});
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    updateHerlaadNodig=true;herlaadNaUpdate();});
  navigator.serviceWorker.ready.then(()=>{
    const c=navigator.serviceWorker.controller;
    if(!c){$("ver").textContent="versie — (geen sw)";return;}
    const ch=new MessageChannel();
    ch.port1.onmessage=e=>{appVer="versie "+e.data.version;
      $("ver").textContent=appVer;L("sw",appVer);};
    c.postMessage({type:"GET_VERSION"},[ch.port2]);});}
