"use strict";
/* ---------- render en start ---------- */
HH.renderCoordinator.register("live",renderLive).register("recent",renderRecent)
  .register("totals",renderTot).register("openDays",renderOpenDagen)
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
async function herstelInvariant(snapshotMeta){
  const uitSnapshot=!!snapshotMeta;
  const rid=uitSnapshot?snapshotMeta.running:await get("meta","running");
  /* Oude versies konden een uitgestelde taakwissel in meta.pending bewaren. De
     huidige versie kent dat concept niet meer; de oude marker wordt daarom alleen
     opgeruimd, zonder retroactief een tijdknip te verzinnen. */
  const oudPending=(uitSnapshot?snapshotMeta.pending:await get("meta","pending"))||null;
  const uit=await HH.services.timer.repairInvariant({currentTimer:HH.state.read().running,
    readCurrentTimer:()=>HH.state.read().running,rules:HH.state.read().rules,pointerId:rid||null,pendingId:oudPending});
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
  if(metInstellingen)Object.assign(delta,instellingenDelta(snapshot.meta));
  HH.state.commit(delta);
  if(metInstellingen)pasInstellingenUiToe(snapshot.meta);
  await herstelInvariant(snapshot.meta);
  /* Niet awaiten: herlaad() kan vanuit de foutafhandeling van TimerService worden
     aangeroepen, en middernachtCheck() raadpleegt daarna dezelfde service.       */
  setTimeout(middernachtCheck,0);
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
  const ds=await getAll("dossiers");
  if(ds.some(d=>d.isI7))return;
  const g=ds.find(d=>/^I7/i.test(d.nummer||""));
  if(g){g.isI7=true;g.gewijzigd=Date.now();await put("dossiers",g);return;}
  await put("dossiers",{id:"d-i7",nummer:"I700000000",naam:"Indirecte uren",lang:"nl",
    voorlopig:false,codes:[],c:ds.length,used:999,isI7:true,archief:false,
    gewijzigd:Date.now()});}

function instellingenDelta(meta){return{codeUsage:meta.codeGebruik||{},
  booked:meta.geboekt||{},roundingMode:meta.rondMode||"groep"};}
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
    "codeGebruik","geboekt","log","logOms","thema","rondMode"]));
}

let tick=null;
async function boot(){
  await zorgVoorI7();
  await laadWerkcodes();
  await herlaad(true);
  await herstelOmschr();
  setTimeout(controleerOudeLopendeTaak,0);
  L("app-start","dossiers "+HH.state.read().dossiers.length+" · regels "+HH.state.read().rules.length+
    " · sjablonen "+HH.state.read().templates.length+" · i7-codes "+HH.state.read().codes.length+
    " · overboekingen "+HH.state.read().overbookings.filter(overboekingOpen).length+
    " · lopend "+(HH.state.read().running?HH.state.read().running.start:"nee"));
  if(tick)clearInterval(tick);
  tick=setInterval(()=>{middernachtCheck();
    if(HH.state.read().running){HH.renderCoordinator.render(["live","totals"]);controleerOudeLopendeTaak();}},10000);}

(async function(){
  try{HH.state.commit({db:await openDB()});}catch(e){
    document.body.innerHTML="<main><section>IndexedDB niet beschikbaar: "+esc(e)+"</section></main>";return;}
  if(navigator.storage&&navigator.storage.persist){
    try{if(!(await navigator.storage.persisted()))await navigator.storage.persist();}catch(e){}}
  await migrate();await boot();})();

if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").then(reg=>{
    const check=()=>{if(reg.waiting)$("btn-update").style.display="";};check();
    reg.addEventListener("updatefound",()=>{const w=reg.installing;if(!w)return;
      w.addEventListener("statechange",()=>{
        if(w.state==="installed"&&navigator.serviceWorker.controller)check();});});
    $("btn-update").onclick=()=>{
      if(HH.state.read().running&&!confirm("Er loopt een regel. De pagina herlaadt na de update.\nDoorgaan?"))return;
      flushOmschr().catch(()=>{});
      setTimeout(()=>{if(reg.waiting)reg.waiting.postMessage({type:"SKIP_WAITING"});},250);};
    setInterval(()=>reg.update(),15*60*1000);}).catch(()=>{});
  let rl=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(rl)return;rl=true;location.reload();});
  navigator.serviceWorker.ready.then(()=>{
    const c=navigator.serviceWorker.controller;
    if(!c){$("ver").textContent="versie — (geen sw)";return;}
    const ch=new MessageChannel();
    ch.port1.onmessage=e=>{appVer="versie "+e.data.version;
      $("ver").textContent=appVer;L("sw",appVer);};
    c.postMessage({type:"GET_VERSION"},[ch.port2]);});}
