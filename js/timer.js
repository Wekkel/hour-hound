"use strict";
/* ---------- regels ---------- */
const saveRegel=r=>{r.gewijzigd=Date.now();memRegel(r);return schrijfRegel(kopie1(r));};
function refreshDay(){regels=alle.filter(x=>x.datum===viewDate)
  .sort((a,b)=>(hm2m(a.start)||0)-(hm2m(b.start)||0));}
function prefixVoor(d,datum,tekst){
  const kaal=(tekst||"").replace(VOOR,"");
  if(!d||!d.voorlopig)return kaal;
  return dmy(datum)+" · "+d.naam+" · "+kaal;}

/* Eén taakwissel = één transactie. sluitObj() maakt een kopie van de lopende regel
   mét eindtijd; er wordt pas iets in het geheugen aangepast als de schrijfactie is
   geslaagd, zodat het scherm nooit iets anders toont dan wat is opgeslagen.     */
function sluitObj(r,eindTijd){
  const k=Object.assign({},r);
  const oms=pakOmschr(r.id);
  if(oms!=null)k.omschrijving=oms;
  let e=eindTijd||nowHM();
  if(hm2m(e)==null)e=nowHM();
  if(hm2m(e)<hm2m(k.start))e="23:59";
  k.eind=e;
  if(!k.urenHand)k.uren=Math.ceil(Math.max(1,hm2m(e)-hm2m(k.start))/6)/10;
  k.gewijzigd=Date.now();
  return k;}

/* _stop en _start doen het databasewerk en worden uitsluitend binnen een timerOp
   aangeroepen. stopRunning() is de publieke variant met wachtrij.              */
async function _stop(eindTijd){
  if(!running)return null;
  const voor=kopie1(running);
  const dicht=sluitObj(running,eindTijd);
  await rustig([dicht.id]);
  await txAll(o=>{o.regels.put(dicht);o.meta.delete("running");});
  running=null;memRegel(dicht);
  L("stop-regel",dicht.start+"-"+dicht.eind+" · "+uu(urenOf(dicht))+" u · "+
    dosIdLog(dicht.dossierId));
  return{dicht,voor};}
function stopRunning(eindTijd,label){
  return timerOp(label||"stoppen",async t=>{
    const verwacht=running?running.id:null;
    if(!opGeldig(t,verwacht))return null;
    const r=await _stop(eindTijd);
    if(!r)return null;
    liveId=null;renderAll();announce();
    return r.dicht;});}

async function _start(o){
  const dag=today();
  const maak=o.nieuwDossier?bouwDossier(o.nieuwDossier):null;
  const dosId=maak?maak.id:(o.dossierId||null);
  const d=maak||(dosId?dosOf(dosId):null);
  const nieuw={id:uid(),datum:dag,start:nowHM(),eind:null,dossierId:dosId,
    code:codeVoor(d,o.code),
    omschrijving:prefixVoor(d,dag,o.omschrijving||""),
    uren:0.1,urenHand:false,soort:o.soort||"werk",
    gemaakt:Date.now(),gewijzigd:Date.now()};
  const dicht=running?sluitObj(running):null;
  let nwStack=null;
  if(o.stackNa)nwStack=o.stackNa;
  else if((o.soort||"werk")==="werk"&&!o.bewaarStack&&stack.length)nwStack=[];
  const nwDagEinde=Object.assign({},dagEinde);
  const dagEindeWeg=nwDagEinde[dag]!=null;
  const autoWeg=dagEindeWeg?alle.filter(r=>r.datum===dag&&r.autoAanvul):[];
  if(dagEindeWeg)delete nwDagEinde[dag];
  const dos=maak||(nieuw.dossierId?dosOf(nieuw.dossierId):null);
  const dosNw=dos?stempel(Object.assign({},dos,{used:(dos.used||0)+1})):null;
  const nwCode=Object.assign({},codeGebruik);
  if(nieuw.code)nwCode[nieuw.code]=(nwCode[nieuw.code]||0)+1;
  await rustig([nieuw.id,dicht?dicht.id:null].concat(autoWeg.map(r=>r.id)));
  await txAll(s=>{
    s.meta.delete("pending"); /* opruimen van oude T3-versies */
    autoWeg.forEach(r=>s.regels.delete(r.id));
    if(dicht)s.regels.put(dicht);
    s.regels.put(nieuw);
    s.meta.put(nieuw.id,"running");
    if(nwStack)s.meta.put(nwStack,"stack");
    if(dagEindeWeg)s.meta.put(nwDagEinde,"dagEinde");
    if(dosNw)s.dossiers.put(dosNw);
    if(nieuw.code)s.meta.put(nwCode,"codeGebruik");});
  pending=null;
  vergeetTimerUndo("nieuwe timerwissel");
  if(autoWeg.length){
    const ids=new Set(autoWeg.map(r=>r.id));
    alle=alle.filter(r=>!ids.has(r.id));
    undoStack=undoStack.filter(a=>!(a.soort==="data"&&(a.weg||[]).some(id=>ids.has(id))));
    L("aanvullen-ingetrokken",autoWeg.length+" automatische regel(s) · dag heropend");}
  if(dicht)memRegel(dicht);
  memRegel(nieuw);
  running=nieuw;viewDate=dag;
  if(nwStack)stack=nwStack;
  if(dagEindeWeg)dagEinde=nwDagEinde;
  if(dosNw)memDossier(dosNw);
  if(maak)L("dossier-nieuw","dos"+idKort(maak.id)+(maak.nummer?"":" · VOORLOPIG")+
    (logOms?" · "+kort(maak.naam):""));
  codeGebruik=nwCode;
  L("start-regel",nieuw.soort+" · "+dosIdLog(nieuw.dossierId)+" · code "+
    (nieuw.code||"-")+" · "+nieuw.start+" · oms "+omsLog(nieuw.omschrijving));
  liveId=null;snoozeTot=0;hideWake();renderAll();announce();
  if(isIndirect(d)&&!i7codes.length)geenCodes();
  return nieuw;}

function startRegel(o){
  return timerOp("starten",async t=>{
    if(!opGeldig(t,running?running.id:null))return null;
    return await _start(o||{});});}
/* Elke directe route naar een andere taak (hervatten, i7-snelkeuze, enz.) maakt
   net als N meteen een echte timerwissel. Alleen de NT-wizard start bewust leeg en
   vult de identiteit daarna op de reeds lopende regel aan.                      */
function kiesTaak(w){return startRegel(w);}

async function eindeWerkdag(){
  return sluitWerkdag(today());}


/* ---------- dossier koppelen ----------
   Aanmaken of bijwerken van het dossier, het ophogen van used, het toevoegen van een
   dossiercode en het koppelen aan de tijdregel gebeuren in één transactie over
   dossiers en regels. Er wordt met kopieën gewerkt; running, de dossierarray en de
   zichtbare velden worden pas bijgewerkt nadat de transactie is geslaagd. Mislukt
   het, dan blijft alles zoals het was en volgt een melding.                     */
function bouwDossier(spec){
  return{id:uid(),nummer:spec.nummer||null,naam:spec.naam||"Zonder naam",
    lang:spec.lang||"nl",voorlopig:!spec.nummer,codes:[],c:dossiers.length,used:0,
    isI7:false,archief:false,gewijzigd:Date.now()};}
/* Dossiers dragen een gewijzigd-stempel zodat samenvoegen bij import per record kan
   bepalen welke versie de nieuwste is.                                          */
const stempel=d=>{d.gewijzigd=Date.now();return d;};
function itemNaarOpdracht(it){
  if(!it)return null;
  if(it.t==="dos")return{dossierId:it.id,telUsed:true};
  if(it.t==="taak"){const t=takenVandaag().find(x=>x.k===it.k);
    return t?{dossierId:t.dossierId,code:t.code,omschrijving:t.oms,telUsed:true}:null;}
  if(it.t==="i7code"){const ind=i7();
    return{dossierId:ind?ind.id:null,code:it.code,telUsed:true};}
  if(it.t==="nieuw")
    return{nieuwDossier:{naam:it.naam,nummer:it.nummer,lang:"nl"},telUsed:true};
  if(it.t==="volgt"){
    const d=actief().find(x=>x.voorlopig&&x.naam.toLowerCase()===it.naam.toLowerCase());
    return d?{dossierId:d.id,telUsed:true}:
      {nieuwDossier:{naam:it.naam,nummer:null,lang:"nl"},telUsed:true};}
  return null;}
async function koppelRegel(r,op){
  if(!r||!op)return null;
  const maak=op.nieuwDossier?bouwDossier(op.nieuwDossier):null;
  const dosId=maak?maak.id:(op.dossierId!==undefined?op.dossierId:r.dossierId);
  let dosK=maak;
  if(!dosK&&dosId){
    const d=dosOf(dosId);
    if(!d){toast("Dat dossier bestaat niet meer");return null;}
    dosK=Object.assign({},d,{codes:(d.codes||[]).map(c=>Object.assign({},c))});}
  /* DVN mag nooit stilzwijgend op een willekeurige i7-code vallen. Als de vaste
     code Commercieel ontbreekt, blijft de lopende timer intact maar wordt de
     dossierkoppeling geweigerd totdat de werklijst is hersteld. */
  if(dosK&&dosK.voorlopig&&!defaultCode(dosK)){
    toast("Werkcode Commercieel ontbreekt in de i7-werklijst — herstel werkcodes.json eerst");
    return null;}
  if(dosK&&op.telUsed){dosK.used=(dosK.used||0)+1;stempel(dosK);}
  if(op.nieuweCode&&dosK&&!isIndirect(dosK)&&
    !dosK.codes.some(c=>c.code===op.nieuweCode))
    dosK.codes.push({code:op.nieuweCode,naam:op.nieuweCode});
  const nw=Object.assign({},r);
  if(dosId!==undefined)nw.dossierId=dosId||null;
  if(op.code!==undefined)nw.code=op.code;
  /* Alleen een echte dossierwissel mag bepalen of de oude code nog past. Bij een
     gewone metadata-update op hetzelfde dossier moet een handmatig gekozen vrije
     code uiteraard blijven staan. */
  else if(dosK&&dosId!==r.dossierId)nw.code=passendeCode(dosK,nw.code);
  if(op.nieuweCode)nw.code=op.nieuweCode;
  /* Sluitstuk: welke route hier ook binnenkomt, een indirecte regel krijgt altijd een
     geldige code en een voorlopig dossier altijd de vaste code.                */
  if(dosK&&isIndirect(dosK))nw.code=codeVoor(dosK,nw.code);
  if(op.omschrijving!==undefined)nw.omschrijving=op.omschrijving;
  nw.omschrijving=prefixVoor(dosK,nw.datum,nw.omschrijving||"");
  nw.gewijzigd=Date.now();
  /* De NT-wizard start bewust zonder code. Een later expliciet gekozen i7-code moet
     daarom hier óók meetellen voor de sortering op meest gebruikt; vroeger gebeurde
     dat alleen wanneer de code al bij _start() bekend was. */
  const telCode=!!(dosK&&isIndirect(dosK)&&nw.code&&nw.code!==r.code);
  const nwCode=Object.assign({},codeGebruik);
  if(telCode)nwCode[nw.code]=(nwCode[nw.code]||0)+1;
  try{
    await rustig([r.id]);
    await tx(["dossiers","regels","meta"],"readwrite",o=>{
      if(dosK)o.dossiers.put(dosK);
      o.regels.put(nw);
      if(telCode)o.meta.put(nwCode,"codeGebruik");});
  }catch(e){L("FOUT-koppelen",String(e));
    toast("Koppelen mislukt — er is niets gewijzigd: "+e);
    return null;}
  if(dosK)memDossier(dosK);
  if(telCode)codeGebruik=nwCode;
  if(maak)L("dossier-nieuw","dos"+idKort(maak.id)+(maak.nummer?"":" · VOORLOPIG")+
    (logOms?" · "+kort(maak.naam):""));
  Object.keys(r).forEach(k=>{delete r[k];});
  Object.assign(r,nw);
  memRegel(r);
  if(running&&running.id===r.id){running=r;liveId=null;}
  return{regel:r,dossier:dosK};}
async function makeDossier(naam,nummer,lang){
  const d={id:uid(),nummer:nummer||null,naam:naam||"Zonder naam",lang:lang||"nl",
    voorlopig:!nummer,codes:[],c:dossiers.length,used:1,isI7:false,archief:false,
    gewijzigd:Date.now()};
  await put("dossiers",d);dossiers=await getAll("dossiers");
  L("dossier-nieuw","dos"+idKort(d.id)+(nummer?"":" · VOORLOPIG")+
    (logOms?" · "+kort(naam):""));
  return d;}

/* De stapel wordt niet meer apart weggeschreven: hij gaat als stackNa mee in dezelfde
   transactie als de nieuwe regel, zodat parkeren en starten niet los kunnen raken. */
const parkeerLijst=()=>{const st=stack.slice();
  if(running&&running.soort==="werk")
    st.push({dossierId:running.dossierId,code:running.code,
      omschrijving:running.omschrijving});
  return st;};
async function interrupt(soort,label){
  ntWizard=null;
  if(running&&running.soort===soort){await terug();return;}
  const ok=await timerOp("onderbreken",async t=>{
    if(!opGeldig(t,running?running.id:null))return false;
    const ind=i7();
    return !!await _start({dossierId:ind?ind.id:null,omschrijving:"",soort:soort,
      stackNa:parkeerLijst()});});
  if(!ok)return;
  naStart();
  L("onderbreking",soort+" · stapel "+stack.length);
  toast(label+" loopt — druk R of dezelfde toets om terug te keren");}
async function terug(){
  ntWizard=null;
  const uit=await timerOp("terugkeren",async t=>{
    if(!opGeldig(t,running?running.id:null))return null;
    const st=stack.slice(),back=st.pop();
    if(!back){await _stop();liveId=null;renderAll();announce();return{leeg:true};}
    await _start({dossierId:back.dossierId,code:back.code,
      omschrijving:back.omschrijving,bewaarStack:true,stackNa:st});
    return{leeg:false,naam:(dosOf(back.dossierId)||{}).naam||"vorige taak"};});
  if(!uit)return;
  L("terug",uit.leeg?"stapel leeg":"stapel "+stack.length);
  if(uit.leeg)await nieuweTaak();else toast("Terug bij "+uit.naam);}
async function pauze(){
  ntWizard=null;
  /* P is een toggle, net als T en O: nogmaals P keert terug naar de geparkeerde taak. */
  if(running&&running.soort==="pauze"){await terug();return;}
  await timerOp("pauzeren",async t=>{
    if(!opGeldig(t,running?running.id:null))return;
    await _start({dossierId:null,code:null,omschrijving:"Pauze",soort:"pauze",
      stackNa:parkeerLijst()});});}

async function kiesCodeItem(it){
  if(!running)return;
  const d=dosOf(running.dossierId);
  const uit=await koppelRegel(running,it.isNew&&d?{nieuweCode:it.newCode}:{code:it.value});
  const nd=uit?uit.dossier:dosOf(running.dossierId);
  $("l-code").value=codeNaam(nd,running.code);
  $("l-code").classList.toggle("miss",isIndirect(nd)&&!running.code);
  liveId=null;verversDag();announce();
  setTimeout(()=>$("l-omschr").focus(),20);}
async function markeerVolgt(){
  if(!running){toast("Er loopt niets om te markeren");return;}
  if(running.soort==="pauze"){toast("Een pauzeregel kan geen dossier krijgen");return;}
  if(!i7CodeOp(VAST_VOORLOPIG,"-704")){
    toast("Werkcode Commercieel ontbreekt — herstel werkcodes.json onder Beheer");return;}
  ntWizard=null;
  const naam=prompt("Werknaam voor dit dossier (nummer volgt nog):",
    ((dosOf(running.dossierId)||{}).naam)||"");
  if(!naam)return;
  const best=actief().find(x=>x.voorlopig&&
    x.naam.toLowerCase()===naam.trim().toLowerCase());
  const op=best?{dossierId:best.id,telUsed:true}:
    {nieuwDossier:{naam:naam.trim(),nummer:null,lang:"nl"},telUsed:true};
  if(!await koppelRegel(running,op))return;
  liveId=null;renderAll();announce();naStart();
  toast("Gemarkeerd als dossier volgt nog");}
/* ---------- voorlopig dossier definitief maken ---------- */
async function kenNummerToe(id){
  const d=dosOf(id);if(!d)return;
  const nr=(prompt('Dossiernummer voor "'+d.naam+'":',"")||"").trim();
  if(!nr)return;
  const bestaand=dossiers.find(x=>x.id!==d.id&&(x.nummer||"").toLowerCase()===nr.toLowerCase());
  const rs=alle.filter(r=>r.dossierId===d.id);
  const doel=bestaand||d;
  const vraag=(bestaand?
      'Nummer '+nr+' hoort al bij "'+bestaand.naam+'".\nAlle regels van "'+d.naam+
      '" naar dat dossier verplaatsen?':
      '"'+d.naam+'" krijgt nummer '+nr+".")+
    "\n\n"+rs.length+" regel(s) worden bijgewerkt:\n"+
    "• het voorvoegsel met datum en werknaam wordt verwijderd\n"+
    "• de i7-werkcode wordt gewist (dossiercodes zijn optioneel)\n\nDoorgaan?";
  if(!confirm(vraag))return;
  /* Bulkoperatie: alle regels, de stapel en het dossier zelf in één transactie. */
  const nwRegels=rs.map(r=>{
    const k=Object.assign({},r);
    k.dossierId=doel.id;
    k.omschrijving=(k.omschrijving||"").replace(VOOR,"").trim()||d.naam;
    k.code=null;k.gewijzigd=Date.now();
    return k;});
  const stackGewijzigd=stack.some(it=>it.dossierId===d.id);
  const nwStack=stack.map(it=>it.dossierId!==d.id?it:
    Object.assign({},it,{dossierId:doel.id,code:null,
      omschrijving:((it.omschrijving||"").replace(VOOR,"").trim())||d.naam}));
  const nwDos=bestaand?null:stempel(Object.assign({},d,{nummer:nr,voorlopig:false}));
  try{
    await txAll(s=>{
      nwRegels.forEach(r=>s.regels.put(r));
      if(stackGewijzigd)s.meta.put(nwStack,"stack");
      if(bestaand)s.dossiers.delete(d.id);else s.dossiers.put(nwDos);});
  }catch(e){L("FOUT-nummer-toekennen",String(e));
    toast("Overzetten mislukt — er is niets gewijzigd: "+e);return;}
  nwRegels.forEach(memRegel);
  if(stackGewijzigd)stack=nwStack;
  dossiers=await getAll("dossiers");
  if(running)running=alle.find(r=>r.id===running.id)||running;
  undoStack=[];
  liveId=null;refreshDay();renderAll();renderWeek();announce();
  L("nummer-toegekend","dos"+idKort(d.id)+" → dos"+idKort(doel.id)+" · "+
    rs.length+" regels"+(bestaand?" · samengevoegd":""));
  toast(rs.length+" regel(s) overgezet naar "+nr);}

/* ---------- langloopmelding ----------
   Geen vraag meer bij afwezigheid: hourhound draait de hele dag op de achtergrond.
   Wel een rustige melding als één regel erg lang doorloopt, want dan is de kans
   groot dat er een taakwissel is gemist.                                        */
const LANG=180;
function hideWake(){$("l-wake").classList.remove("on");}
document.addEventListener("visibilitychange",()=>{if(document.hidden)flushOmschr();});
function checkWake(){
  if(!running||running.soort!=="werk"){hideWake();return;}
  const mins=Math.max(0,(hm2m(nowHM())||0)-(hm2m(running.start)||0));
  if(mins<LANG||Date.now()<snoozeTot){hideWake();return;}
  const naam=(dosOf(running.dossierId)||{}).naam||"deze taak";
  $("wake-txt").textContent="Deze regel loopt al "+Math.floor(mins/60)+" uur "+
    pad(mins%60)+" op "+naam+". Klopt dat nog?";
  $("l-wake").classList.add("on");}
$("wake-ja").onclick=()=>{snoozeTot=Date.now()+60*60*1000;hideWake();};
$("wake-nee").onclick=async()=>{hideWake();
  await stopRunning(null,"stoppen na langloopmelding");await nieuweTaak();};

/* ---------- middernachtgrens ---------- */
async function middernachtCheck(){
  if(!running||running.datum===today())return;
  const d=running.datum,verwacht=running.id;
  await timerOp("middernachtcontrole",async t=>{
    if(!opGeldig(t,verwacht))return;
    if(!running||running.datum===today())return;
    await _stop("23:59");
    ntWizard=null;pending=null;
    try{await del("meta","pending");}catch(e){}
    liveId=null;renderAll();announce();
    toast("Regel van "+dmy(d)+" is om 23:59 afgesloten");});}

