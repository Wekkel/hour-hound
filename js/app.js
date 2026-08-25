"use strict";
/* ---------- render en start ---------- */
function renderAll(){
  renderLive();renderRecent();renderTot();renderOpenDagen();
  if(tab==="dag")bouwDag();if(tab==="week")renderWeek();if(tab==="beheer")renderBeheer();}
function showTab(v){
  tab=v;["nu","dag","week","beheer"].forEach(x=>$("v-"+x).classList.toggle("on",x===v));
  [...$("tabs").children].forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===v));
  /* renderRecent() meet de natuurlijke hoogte van vier taken. Doe dat opnieuw
     nadat Nu zichtbaar is; metingen tijdens een verborgen Beheer-tab zijn nul. */
  if(v==="nu")renderRecent();
  if(v==="dag")bouwDag();if(v==="week")renderWeek();if(v==="beheer")renderBeheer();}

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
async function herstelInvariant(){
  const rid=await get("meta","running");
  /* Oude versies konden een uitgestelde taakwissel in meta.pending bewaren. De
     huidige versie kent dat concept niet meer; de oude marker wordt daarom alleen
     opgeruimd, zonder retroactief een tijdknip te verzinnen. */
  const oudPending=(await get("meta","pending"))||null;
  pending=null;
  if(oudPending){try{await del("meta","pending");}catch(e){}
    L("migratie-pending","oude uitgestelde taakwissel verwijderd");}
  const open=alle.filter(r=>!r.eind);
  if(open.length<=1){
    const lopend=open[0]||null;
    if((rid||null)!==(lopend?lopend.id:null)){
      await txAll(o=>{if(lopend)o.meta.put(lopend.id,"running");
        else o.meta.delete("running");});
      L("herstel","pointer "+(lopend?"gezet op open regel":"gewist"));
      if(lopend)toast("Lopende regel hersteld — loopt sinds "+lopend.start);}
    running=lopend;opBlok=false;$("l-herstel").classList.remove("on");
    return;}
  running=rid?open.find(r=>r.id===rid)||null:null;
  opBlok=true;
  $("l-herstel").classList.add("on");
  L("herstel-nodig",open.length+" open regels");
  toonHerstel();}
function openRegels(){return alle.filter(r=>!r.eind)
  .sort((a,b)=>(a.datum+a.start)<(b.datum+b.start)?-1:1);}
function voorstelEind(r){
  const na=alle.filter(x=>x.datum===r.datum&&x.id!==r.id&&hm2m(x.start)!=null&&
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
    const r=alle.find(x=>x.id===rij.dataset.id);
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
  try{
    await rustig(nieuw.map(r=>r.id));
    await txAll(o=>{
      nieuw.forEach(r=>o.regels.put(r));
      if(gekozen)o.meta.put(gekozen,"running");else o.meta.delete("running");});
  }catch(e){L("FOUT-herstel",String(e));alert("Herstel mislukt: "+e);return;}
  nieuw.forEach(memRegel);
  running=gekozen?(alle.find(x=>x.id===gekozen)||null):null;
  opBlok=false;vergeetTimerUndo("herstel bevestigd");
  $("herstel").classList.remove("on");$("l-herstel").classList.remove("on");
  liveId=null;refreshDay();bouwDag();renderAll();announce();
  L("herstel-bevestigd",nieuw.length+" afgesloten · lopend "+(gekozen?"ja":"nee"));
  toast(nieuw.length+" regel(s) afgesloten — de oorspronkelijke waarden zijn bewaard");};

async function herlaad(){
  dossiers=await getAll("dossiers");templates=await getAll("templates");
  i7codes=await getAll("codes");alle=await getAll("regels");
  overboekingen=await getAll("overboekingen");
  stack=(await get("meta","stack"))||[];
  dagEinde=(await get("meta","dagEinde"))||{};
  dagAudit=(await get("meta","dagAudit"))||{};
  refreshDay();
  await herstelInvariant();
  /* Niet awaiten: herlaad() kan vanuit de foutafhandeling van een timerOp worden
     aangeroepen, en middernachtCheck() zet zelf weer een timerOp in de wachtrij.  */
  setTimeout(middernachtCheck,0);
  liveId=null;renderAll();}

/* W2: de handmatig geïmporteerde i7-werklijst in IndexedDB is leidend. De gebruiker
   bewaart werkcodes.json bewust niet in de repository, dus een bestaande lokale lijst
   mag bij een start nooit afhankelijk worden van een netwerkfetch of een eventueel
   oude service-worker-cache. Alleen wanneer lokaal nog géén codes bestaan, proberen
   we werkcodes.json als eenmalige bootstrap voor installaties die het bestand wél naast
   index.html hebben staan.                                                      */
async function laadWerkcodes(){
  const lokaal=await getAll("codes");
  if(lokaal.length){
    i7codes=lokaal;
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
  i7codes=await getAll("codes");
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

async function laadInstellingen(){
  codeGebruik=(await get("meta","codeGebruik"))||{};
  geboekt=(await get("meta","geboekt"))||{};
  logboek=(await get("meta","log"))||[];
  logOms=!!(await get("meta","logOms"));
  $("b-logoms").checked=logOms;$("logstat").textContent=logboek.length+" regels";
  zetThema((await get("meta","thema"))||"donker");
  rondMode=(await get("meta","rondMode"))||"groep";
  $("d-mode").value=rondMode;}

let tick=null;
async function boot(){
  await zorgVoorI7();
  await laadWerkcodes();
  await laadInstellingen();
  await herlaad();
  await herstelOmschr();
  setTimeout(controleerOudeLopendeTaak,0);
  L("app-start","dossiers "+dossiers.length+" · regels "+alle.length+
    " · sjablonen "+templates.length+" · i7-codes "+i7codes.length+
    " · overboekingen "+overboekingen.filter(overboekingOpen).length+
    " · lopend "+(running?running.start:"nee"));
  if(tick)clearInterval(tick);
  tick=setInterval(()=>{middernachtCheck();checkWake();
    if(running){renderLive();renderTot();controleerOudeLopendeTaak();}},10000);}

(async function(){
  try{db=await openDB();}catch(e){
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
      if(running&&!confirm("Er loopt een regel. De pagina herlaadt na de update.\nDoorgaan?"))return;
      flushOmschr();
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
