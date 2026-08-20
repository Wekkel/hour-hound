"use strict";
/* ============================================================================
   hourhound — VASTE ONTWERPAFSPRAKEN
   Lees dit voordat je iets wijzigt. Onderstaande punten zijn bewuste keuzes en zijn
   in het verleden meer dan eens per ongeluk teruggedraaid bij losse aanpassingen.
   Verandert er iets aan deze regels, pas dan ook dit blok aan.

   WERKCODES
   W1. De i7-werklijst is een VASTE lijst van kantoor die via werkcodes.json wordt
       geïmporteerd. De app en de gebruiker maken daar nooit codes bij aan.
       codeItems() biedt "Nieuwe code" daarom alleen aan bij een gewoon dossier.
   W2. Een eenmaal geïmporteerde i7-werklijst wordt lokaal in IndexedDB bewaard en is
       leidend. laadWerkcodes() probeert werkcodes.json alleen als bootstrap wanneer
       lokaal nog géén codes bestaan; het bestand hoeft dus niet in de repository.
   W3. Op het i7-dossier is een werkcode VERPLICHT, maar er is GEEN stille standaard.
       defaultCode() geeft daar bewust null terug, eisCode() vraagt de code op en
       controleer() maakt het een blokkerende fout. Nooit automatisch invullen.
   W4. Bij een dossier in de categorie "dossier volgt nog" is de werkcode ALTIJD
       Commercieel. Geen keuze, veld read-only, keuzelijst toont één regel.
       Zie codeVoor() en VAST_VOORLOPIG.
   W5. Bij een GEWOON dossier is een werkcode OPTIONEEL en VRIJ van vorm. Wat de
       gebruiker zélf intypt wordt overgenomen én bij het dossier onthouden (d.codes),
       zodat het de volgende keer uitsluitend als suggestie beschikbaar is. Een
       onthouden code wordt NOOIT automatisch of stilzwijgend ingevuld.
   W6. De NT-wizard heeft altijd drie gelijkwaardige hoofdcategorieën: gewoon dossier,
       indirect (i7) en dossier volgt nog (i7). Geen daarvan is de default.

   TIJD EN TIMER
   T1. Elke toestandsovergang van de timer gaat door timerOp() en wordt in één
       transactie geschreven (txAll). Geheugen pas bijwerken ná succes.
   T2. Invariant: hooguit één open regel, en meta.running wijst precies daarnaar.
       Alleen een eenduidige situatie wordt automatisch hersteld; bij meerdere open
       regels komt het herstelvenster en liggen timeracties stil (opBlok).
   T3. N maakt de tijdknip ONMIDDELLIJK: de lopende regel wordt gesloten en in
       dezelfde transactie wordt een lege nieuwe werkregel gestart. Dossier, code en
       omschrijving zijn metadata die daarna via de NT-wizard mogen worden ingevuld.
       Escape uit de wizard draait de tijdknip nooit terug; de nieuwe timer loopt door.
   T4. Een onvolledige NT-regel mag bestaan en later worden aangevuld. Hij blijft wel
       een blokkerende fout voor boeken in Intapp totdat de vereiste metadata compleet is.
   T5. Een lopende regel heeft nooit urenHand=true en de eindtijd ervan wordt alleen
       via een echte stopactie gezet. Een eindtijd leegmaken kan niet; daarvoor is
       de knop "maak dit de lopende timer".
   T6. Undo is gesplitst: gegevensstappen komen nooit aan meta.running; timerstappen
       herstellen die alleen als de huidige status nog is wat die actie achterliet.

   BOEKEN EN UREN
   B1. Iedere losse tijdregel wordt naar boven afgerond op 0,1 uur. Dat is bewust.
   B2. De norm is hard 8,0 uur per dag en maximaal 24,0 uur per datum.
   B3. Blokkerende fouten (open regel, lopende timer, ontbrekend dossier, ontbrekende
       verplichte i7-code, lege omschrijving, ongeldige tijd) kunnen niet met
       "toch boeken" worden gepasseerd. Waarschuwingen wel.
   B4. De boekstatus hangt aan een vingerafdruk van de inhoud; wijzigt er iets aan
       uren, bronregels of afrondingsmodus, dan vervalt de status vanzelf.
   B5. Automatisch aanvullen tot 8,0 uur kan alleen op een expliciet afgesloten dag.
       Het gebruikt uitsluitend echte gaten vóór de vastgelegde eindtijd, mag het
       Intapp-totaal nooit boven 8,0 brengen en wordt ingetrokken als de dag heropent.

   LOGBOEK
   L1. Standaard komen er uitsluitend technische gegevens in het logboek. Vrije tekst,
       dossiernamen en dossiernummers alleen via dosLog() en omsLog().
   ========================================================================== */
const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,"0");
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uu=n=>(Math.round(n*10)/10).toFixed(1).replace(".",",");
const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today=()=>ymd(new Date());
const nowHM=()=>{const d=new Date();return pad(d.getHours())+":"+pad(d.getMinutes());};
function hm2m(s){const m=/^(\d{1,2}):(\d{2})$/.exec(s||"");if(!m)return null;
  const h=+m[1],mi=+m[2];if(h>23||mi>59)return null;return h*60+mi;}
const m2hm=m=>{const v=Math.max(0,Math.min(1439,Math.round(m)));
  return pad(Math.floor(v/60))+":"+pad(v%60);};
const dmy=s=>{const[y,m,d]=s.split("-");return d+"."+m+"."+y;};
const parseD=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);};
const addD=(s,n)=>{const d=parseD(s);d.setDate(d.getDate()+n);return ymd(d);};
const dagLabel=s=>parseD(s).toLocaleDateString("nl-NL",
  {weekday:"long",day:"numeric",month:"long",year:"numeric"});
const kortDag=s=>parseD(s).toLocaleDateString("nl-NL",{weekday:"short"})+" "+
  dmy(s).replace(/\./g,"-");
const weekend=s=>{const d=parseD(s).getDay();return d===0||d===6;};
const schoon=s=>String(s==null?"":s).replace(/[\t\r\n\u0000-\u001f]/g," ").trim();
const NORM=8.0, VOOR=/^\d{2}\.\d{2}\.\d{4} · [^·]* · /;

let db=null,dossiers=[],templates=[],i7codes=[],alle=[],regels=[],running=null,stack=[];
let viewDate=today(),weekAnchor=today(),tab="nu",liveId=null;
let hiddenAt=null,rondMode="groep",dagEinde={},dagAudit={},snoozeTot=0,openDagenSnooze=0,oldRunSnooze=0;
let ntWizard=null;   // UI-state; N heeft de nieuwe timer dan al werkelijk gestart
let pending=null;    // alleen voor het opruimen van oude versies; nieuwe code gebruikt dit niet
const TABID=Math.random().toString(36).slice(2);
const bc=("BroadcastChannel" in window)?new BroadcastChannel("hourhound"):null;

/* ---------- opslag ---------- */
function openDB(){return new Promise((res,rej)=>{
  const r=indexedDB.open("hourhound",3);
  r.onupgradeneeded=()=>{const d=r.result;
    if(!d.objectStoreNames.contains("days"))d.createObjectStore("days",{keyPath:"date"});
    if(!d.objectStoreNames.contains("matters"))d.createObjectStore("matters",{keyPath:"id"});
    if(!d.objectStoreNames.contains("meta"))d.createObjectStore("meta");
    if(!d.objectStoreNames.contains("templates"))d.createObjectStore("templates",{keyPath:"id"});
    if(!d.objectStoreNames.contains("codes"))d.createObjectStore("codes",{keyPath:"code"});
    if(!d.objectStoreNames.contains("dossiers"))d.createObjectStore("dossiers",{keyPath:"id"});
    if(!d.objectStoreNames.contains("regels")){
      const s=d.createObjectStore("regels",{keyPath:"id"});s.createIndex("datum","datum");}};
  r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();
    toast("Database elders bijgewerkt — herlaad de pagina");};res(r.result);};
  r.onerror=()=>rej(r.error);});}
function tx(s,mode,fn){return new Promise((res,rej)=>{
  const t=db.transaction(s,mode),q=fn(Array.isArray(s)?
    Object.fromEntries(s.map(n=>[n,t.objectStore(n)])):t.objectStore(s));
  t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error);
  t.onabort=()=>rej(t.error||new Error("afgebroken"));});}
const getAll=s=>tx(s,"readonly",o=>o.getAll());
const get=(s,k)=>tx(s,"readonly",o=>o.get(k));
const put=(s,v)=>tx(s,"readwrite",o=>o.put(v));
const putK=(s,v,k)=>tx(s,"readwrite",o=>o.put(v,k));
const del=(s,k)=>tx(s,"readwrite",o=>o.delete(k));
const replaceAll=(s,rows)=>tx(s,"readwrite",o=>{o.clear();rows.forEach(r=>o.put(r));});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
/* Eén transactie over regels, meta en dossiers. Elke toestandsovergang van de timer
   wordt hierin volledig geschreven of helemaal niet, en het geheugen wordt pas
   bijgewerkt nadat de transactie is geslaagd.                                    */
const TXALL=["regels","meta","dossiers"];
function txAll(fn){return tx(TXALL,"readwrite",fn);}

/* ---------- één wachtrij voor alle timerovergangen ----------
   Knoppen, sneltoetsen, handmatig stoppen, de langloopmelding, de middernachtcontrole,
   herstel, update en synchronisatie lopen hier doorheen. Er kan dus nooit een tweede
   overgang tussendoor glippen. Elke operatie krijgt een token; na een await mag een
   functie de globale timerstatus alleen nog aanpassen wanneer haar token nog het
   actieve token is én de verwachte timer-ID nog klopt. Een vertraagde stopactie kan
   daardoor geen inmiddels nieuw gestarte timer meer wissen.                     */
let opTeller=0,opHuidig=0,opKetting=Promise.resolve(),opBlok=false;
function timerOp(naam,fn){
  const draai=async()=>{
    if(opBlok){toast("Rond eerst het herstelvenster af");return null;}
    const t={id:++opTeller,naam,start:running?running.id:null};
    opHuidig=t.id;
    try{return await fn(t);}
    catch(e){L("FOUT-"+naam.replace(/\s+/g,"-"),String(e));
      toast(naam+" mislukt — er is niets gewijzigd: "+e);
      try{await herlaad();}catch(x){}
      return null;}};
  const p=opKetting.then(draai,draai);
  opKetting=p.then(()=>{},()=>{});
  return p;}
function opGeldig(t,verwachtTimerId){
  if(!t||t.id!==opHuidig)return false;
  if(verwachtTimerId!==undefined&&(running?running.id:null)!==verwachtTimerId)return false;
  return true;}

/* ---------- schrijfacties per regel geserialiseerd ----------
   Iedere schrijfactie bevriest de bedoelde waarde en wordt achter de vorige schrijf-
   actie van dezelfde regel gehangen. Een oudere save kan een nieuwere dus nooit meer
   overschrijven. rustig() wacht tot alle openstaande schrijfacties van de opgegeven
   regels klaar zijn, zodat een transactie er niet overheen kan lopen.           */
const schrijfRij={};
const kopie1=r=>JSON.parse(JSON.stringify(r));
function schrijfRegel(waarde){
  const id=waarde.id,vorige=schrijfRij[id]||Promise.resolve();
  const p=vorige.then(()=>put("regels",waarde),()=>put("regels",waarde));
  schrijfRij[id]=p.then(()=>{},()=>{});
  return p;}
function rustig(ids){
  return Promise.all((ids||[]).filter(Boolean)
    .map(id=>schrijfRij[id]||Promise.resolve()));}

/* ---------- uitgestelde omschrijving ----------
   De debouncecallback legt de concrete regel-ID en de bedoelde tekst vast en kijkt
   nooit later naar de globale running. pakOmschr() haalt een openstaande tekst op en
   annuleert de timer, zodat een taakwissel die tekst in dezelfde transactie meeneemt. */
let omsWacht=null;
function planOmschr(id,tekst){
  if(omsWacht&&omsWacht.id!==id)flushOmschr();
  if(omsWacht)clearTimeout(omsWacht.t);
  const p={id,tekst,t:null};
  p.t=setTimeout(()=>{if(omsWacht===p)omsWacht=null;schrijfOms(p);},400);
  omsWacht=p;
  try{localStorage.setItem("hh-oms",JSON.stringify({id,tekst}));}catch(e){}}
function schrijfOms(p){
  const r=alle.find(x=>x.id===p.id);
  if(!r)return Promise.resolve();
  r.omschrijving=p.tekst;
  const kl=()=>{try{const n=JSON.parse(localStorage.getItem("hh-oms")||"null");
    if(n&&n.id===p.id&&n.tekst===p.tekst)localStorage.removeItem("hh-oms");}catch(e){}};
  return saveRegel(r).then(kl,kl);}
function flushOmschr(){
  if(!omsWacht)return Promise.resolve();
  const p=omsWacht;omsWacht=null;clearTimeout(p.t);
  return schrijfOms(p);}
function pakOmschr(id){
  if(omsWacht&&omsWacht.id===id){clearTimeout(omsWacht.t);
    const t=omsWacht.tekst;omsWacht=null;
    try{localStorage.removeItem("hh-oms");}catch(e){}
    return t;}
  return null;}
function memRegel(r){const i=alle.findIndex(x=>x.id===r.id);
  if(i<0)alle.push(r);else alle[i]=r;refreshDay();}
function memDossier(d){const i=dossiers.findIndex(x=>x.id===d.id);
  if(i<0)dossiers.push(d);else dossiers[i]=d;}
let logboek=[],logOms=false,logT=null,appVer="?",codeGebruik={};
const kort=(s,n)=>{s=String(s==null?"":s);
  return s.length>(n||34)?s.slice(0,n||34)+"…":s;};
/* Logboek: standaard uitsluitend technische gegevens — actiecodes, ID-staarten,
   werkcodes, tijdstippen, aantallen en tekstlengtes. Dossiernamen, dossiernummers
   en omschrijvingen komen het logboek alleen binnen via dosLog() of omsLog(), en die
   geven pas volledige tekst terug als de gebruiker dat expliciet heeft aangezet.
   Nieuwe logregels horen dus nooit rechtstreeks vrije tekst mee te geven.       */
const idKort=s=>s?"#"+String(s).slice(-4):"#-";
const omsLog=s=>logOms?kort(s,60):"["+String(s||"").length+" tekens]";
const dosLog=d=>!d?"geen-dossier":("dos"+idKort(d.id)+(d.isI7?"/i7":"")+
  (d.voorlopig?"/voorlopig":"")+(logOms?" "+kort(dosVeld(d),40):""));
const dosIdLog=id=>dosLog(dosOf(id));
function L(k,v){
  const d=new Date();
  logboek.push(pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds())+
    "  "+k+(v?"  "+v:""));
  if(logboek.length>600)logboek.shift();
  clearTimeout(logT);logT=setTimeout(()=>putK("meta",logboek,"log").catch(()=>{}),2000);
  const el=$("logstat");if(el)el.textContent=logboek.length+" regels";}
window.addEventListener("error",e=>L("FOUT",(e.message||"")+" @"+(e.lineno||"?")));
window.addEventListener("unhandledrejection",e=>
  L("FOUT-async",String((e.reason&&e.reason.message)||e.reason||"")));
let undoStack=[];
/* ---------- twee soorten ongedaan-stappen ----------
   Een gegevensstap raakt uitsluitend recordvelden en komt nooit aan meta.running. Een
   timerstap herstelt wél de timerstatus, maar uitsluitend wanneer de huidige status
   nog exact is wat die actie achterliet: dezelfde timerpointer én dezelfde regels
   ongewijzigd. Iedere timerwissel die zelf niet terug te draaien is (starten, wisselen,
   einde werkdag, herstel, import) gooit de openstaande timerstappen weg.        */
function undoData(label,rs,opts){
  try{undoStack.push({soort:"data",label:label||"",
    regels:(rs||[]).filter(Boolean).map(kopie1),
    weg:(opts&&opts.weg)||[]});
  if(undoStack.length>25)undoStack.shift();}catch(e){}}
function undoTimer(label,rs,opts){
  const o=opts||{};
  try{undoStack.push({soort:"timer",label:label||"",
    regels:(rs||[]).filter(Boolean).map(kopie1),
    weg:o.weg||[],
    herstelRunning:o.herstelRunning||null,
    verwachtRunning:o.verwachtRunning===undefined?null:o.verwachtRunning,
    verwacht:o.verwacht||[]});
  if(undoStack.length>25)undoStack.shift();}catch(e){}}
function vergeetTimerUndo(reden){
  const n=undoStack.length;
  undoStack=undoStack.filter(a=>a.soort==="data");
  if(n!==undoStack.length)L("undo-timer-vervallen",reden+" · "+(n-undoStack.length));}
async function undo(){
  const a=undoStack.pop();
  if(!a){toast("Niets om ongedaan te maken");return;}
  if(a.soort==="timer")return undoTimerStap(a);
  const runId=running?running.id:null;
  const weg=a.weg||[];
  /* Een gegevensstap mag geen open regel terugzetten die niet de lopende timer is,
     en mag de lopende regel niet afsluiten of weggooien.                        */
  const fout=a.regels.find(r=>(!r.eind&&r.id!==runId)||(r.eind&&r.id===runId));
  if(fout||weg.indexOf(runId)>=0){
    L("undo-geweigerd","gegevensstap raakt de timerstatus");
    toast("Deze stap raakt de lopende timer en wordt niet teruggedraaid");return;}
  try{
    await rustig(a.regels.map(r=>r.id).concat(weg));
    await tx("regels","readwrite",o=>{
      a.regels.forEach(r=>o.put(r));weg.forEach(id=>o.delete(id));});
  }catch(e){L("FOUT-ongedaan",String(e));toast("Ongedaan maken mislukt: "+e);return;}
  weg.forEach(id=>{alle=alle.filter(x=>x.id!==id);});
  a.regels.forEach(memRegel);
  refreshDay();
  if(runId)running=alle.find(x=>x.id===runId)||running;
  liveId=null;bouwDag();renderAll();announce();
  L("ongedaan","gegevens · "+(a.label||"actie")+" · "+a.regels.length+" regel(s)");
  toast("Ongedaan: "+(a.label||"laatste wijziging")+" — "+
    undoStack.length+" stap(pen) over");}
async function undoTimerStap(a){
  const nu=running?running.id:null;
  if(nu!==a.verwachtRunning){
    L("undo-geweigerd","timerstatus is inmiddels veranderd");
    toast("Er loopt inmiddels een andere timer — deze stap wordt niet teruggedraaid");
    return;}
  const scheef=(a.verwacht||[]).find(v=>{
    const r=alle.find(x=>x.id===v.id);
    return v.gewijzigd==null?!!r:(!r||(r.gewijzigd||0)!==v.gewijzigd);});
  if(scheef){
    L("undo-geweigerd","betrokken regel is inmiddels gewijzigd");
    toast("De betrokken regel is inmiddels gewijzigd — niet teruggedraaid");return;}
  await timerOp("ongedaan maken",async t=>{
    if(!opGeldig(t,a.verwachtRunning))return;
    const weg=a.weg||[];
    await rustig(a.regels.map(r=>r.id).concat(weg));
    await txAll(o=>{
      a.regels.forEach(r=>o.regels.put(r));
      weg.forEach(id=>o.regels.delete(id));
      if(a.herstelRunning)o.meta.put(a.herstelRunning,"running");
      else o.meta.delete("running");});
    weg.forEach(id=>{alle=alle.filter(x=>x.id!==id);});
    a.regels.forEach(memRegel);
    refreshDay();
    running=a.herstelRunning?(alle.find(x=>x.id===a.herstelRunning)||null):null;
    liveId=null;bouwDag();renderAll();announce();
    L("ongedaan","timer · "+(a.label||"actie"));
    toast("Ongedaan: "+(a.label||"timerwijziging")+" — "+
      undoStack.length+" stap(pen) over");});}
function toast(m){const t=$("toast");t.textContent=m;t.classList.add("on");
  clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("on"),2600);}
let syncOpen=false;
function announce(){if(bc)try{bc.postMessage({from:TABID,timer:!!running});}catch(e){}}
if(bc)bc.onmessage=async e=>{
  if(!e.data||e.data.from===TABID||!db)return;
  if(e.data.timer&&running)
    toast("Let op: een ander venster van hourhound beheert ook een timer — sluit dat venster");
  const a=document.activeElement;
  if(a&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)){syncOpen=true;return;}
  await herlaad();toast("Bijgewerkt vanuit een ander venster");};
document.addEventListener("focusout",()=>{
  if(!syncOpen)return;syncOpen=false;
  setTimeout(()=>{const a=document.activeElement;
    if(a&&/^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)){syncOpen=true;return;}
    herlaad();},200);});

/* ---------- model ---------- */
const dosOf=id=>dossiers.find(d=>d.id===id);
const i7=()=>dossiers.find(d=>d.isI7);
const actief=()=>dossiers.filter(d=>!d.archief);
const isDvn=d=>!!d&&(d.voorlopig||d.dvn);
const isIndirect=d=>!!d&&(d.isI7||d.voorlopig);
const dosVeld=d=>d?(d.nummer||d.naam):"";
function dvnRegels(d){return d?alle.filter(r=>r.dossierId===d.id&&r.soort!=="pauze"):[];}
function dvnResolvedDoel(d){return d&&d.dvnTo?dosOf(d.dvnTo):null;}
function dvnResolvedNummer(d){
  if(!d)return"";
  const doel=dvnResolvedDoel(d);
  return (doel&&doel.nummer)||d.nummer||d.dvnResolvedNr||"";}
function dvnIntappState(d){
  if(!isDvn(d))return"";
  if(!dvnResolvedNummer(d))return"missing";
  if(d.dvnIntappStatus==="posted")return"posted";
  if(d.dvnIntappStatus==="needs_check")return"needs_check";
  return"ready";}
function dvnStatusTekst(d){
  const nr=dvnResolvedNummer(d),st=dvnIntappState(d);
  if(st==="missing")return"dossiernummer ontbreekt";
  if(st==="posted")return"dossiernummer "+nr+" · ingevoerd in Intapp";
  if(st==="needs_check")return"dossiernummer "+nr+" · controle nodig";
  if(st==="ready")return"dossiernummer "+nr+" · nog invoeren";
  return"DVN";}
function dvnSummaryStatus(d){
  const st=dvnIntappState(d);
  if(st==="posted")return"DVN · ingevoerd in Intapp";
  if(st==="needs_check")return"DVN · controle nodig";
  if(st==="ready")return"DVN · nog invoeren";
  if(st==="missing")return"DVN · nummer ontbreekt";
  return"";}
function dvnAuditAdd(d,type,extra){
  const ev=(Array.isArray(d&&d.dvnIntappAudit)?d.dvnIntappAudit:[]).slice(-19);
  ev.push(Object.assign({type,t:new Date().toISOString()},extra||{}));
  return ev;}
function markDvnControleNodig(d,reden){
  if(!isDvn(d)||dvnIntappState(d)!=="posted")return d;
  return stempel(Object.assign({},d,{dvnIntappStatus:"needs_check",
    dvnIntappNeedsCheckAt:new Date().toISOString(),
    dvnIntappNeedsCheckReason:reden||"tijdregel gewijzigd",
    dvnIntappAudit:dvnAuditAdd(d,"controle-nodig",{reden:reden||"tijdregel gewijzigd"})}));}
function intappDossierInfo(d){
  const ind=i7();
  if(!d)return{nummer:"",naam:"",dvn:false,status:""};
  if(d.dvnTo){
    const doel=dvnResolvedDoel(d);
    if(doel)return{nummer:doel.nummer||"",naam:doel.naam,dvn:true,
      status:dvnSummaryStatus(d)};}
  if(d.voorlopig&&!d.nummer)return{nummer:ind?ind.nummer:"",
    naam:ind?ind.naam:"Indirecte uren",dvn:true,status:dvnSummaryStatus(d)};
  if(isDvn(d))return{nummer:dvnResolvedNummer(d),naam:d.naam,dvn:true,
    status:dvnSummaryStatus(d)};
  return{nummer:d.nummer||"",naam:d.naam,dvn:false,status:""};}
const dosColor=d=>{const P=["#3f6b3a","#a8452a","#39607f","#7a5090","#8a6b2c","#2f6f6b",
  "#8f3f5c","#5a6b2c","#6b4a3f","#455a64"];return d?P[(d.c||0)%P.length]:"#888";};
function codesFor(d){
  if(!d)return[];
  if(isIndirect(d))return i7codes.map(c=>({code:c.code,naam:c.naam,fav:c.favoriet}));
  return (d.codes||[]).map(c=>({code:c.code,naam:c.naam}));}
const codeNaam=(d,c)=>{if(!c)return"";const x=codesFor(d).find(k=>k.code===c);return x?x.naam:c;};
/* Een regel op i7 of op een dossier waarvan het nummer nog volgt móét een werkcode
   hebben; dat is geen vrije keuze van de gebruiker. Voor "dossier volgt nog" ligt de
   code bovendien vast op Commercieel. codeVoor() is de enige plek waar dat wordt
   bepaald, zodat iedere route — starten, wisselen, koppelen, blur, dagtabel — tot
   dezelfde uitkomst leidt.                                                      */
function codeVoor(d,gewenst){
  if(!isIndirect(d))return gewenst!==undefined?gewenst:null;
  if(d.voorlopig)return defaultCode(d);
  if(gewenst&&codesFor(d).some(c=>c.code===gewenst))return gewenst;
  return defaultCode(d);}
function passendeCode(nieuw,huidig){
  if(isIndirect(nieuw))return codeVoor(nieuw,huidig);
  /* W5: bij een gewoon dossier nooit een code uit de vorige dossiercontext meenemen.
     Bekende codes zijn suggesties; alleen expliciete invoer/keuze mag er één zetten. */
  return null;}
function nummerBezet(nr,exclId){
  const n=(nr||"").trim().toLowerCase();
  return !!n&&dossiers.some(d=>d.id!==exclId&&(d.nummer||"").toLowerCase()===n);}
/* De vaste code voor een voorlopig dossier wordt op naam gezocht, want de nummering
   van de i7-werklijst kan wijzigen; het codesuffix is alleen een terugval.     */
const VAST_VOORLOPIG=/commerc/i;
function i7CodeOp(patroon,suffix){
  const opNaam=i7codes.find(c=>patroon.test(c.naam||""));
  if(opNaam)return opNaam.code;
  const opCode=i7codes.find(c=>(c.code||"").endsWith(suffix));
  if(opCode)return opCode.code;
  /* Voor een verplichte vaste code is een willekeurige eerste i7-code géén veilige
     terugval. Ontbreekt Commercieel, dan moet de gebruiker dat eerst herstellen. */
  return null;}
/* Op het i7-dossier zelf is er géén stille standaard: de gebruiker moet de werkcode
   zelf kiezen, anders komt er vanzelf een code in Intapp die niemand heeft bedoeld.
   Alleen "dossier volgt nog" heeft een vaste code, want daar valt niets te kiezen. */
function defaultCode(d){
  if(!isIndirect(d))return null;
  if(d.voorlopig)return i7CodeOp(VAST_VOORLOPIG,"-704");
  return null;}
/* Alleen de automatisch gegenereerde aanvulregels ("Diversen") hebben een vaste code
   nodig; daar is geen gebruiker die kiest.                                      */
function i7Standaard(){
  return i7CodeOp(/praktijkorganisatie|administrat/i,"-701");}
/* Vraagt de ontbrekende werkcode meteen op, met de keuzelijst open en de cursor erin. */
let codeGevraagd=null;
function eisCode(){
  if(!running||ntWizard)return false;
  const d=dosOf(running.dossierId);
  if(!isIndirect(d)||d.voorlopig||running.code)return false;
  if(!i7codes.length){geenCodes();return false;}
  codeGevraagd=running.id;
  setTimeout(()=>{if(!running||running.code)return;
    const el=$("l-code");el.value="";el.focus();
    openAC(el,codeItems(d,""),kiesCodeItem);},40);
  return true;}
/* Na een start: eerst de verplichte werkcode, pas daarna de omschrijving. */
function naStart(){
  if(eisCode())return;
  setTimeout(()=>$("l-omschr").focus(),30);}
const geenCodes=()=>{
  toast("Er zijn nog geen i7-werkcodes — importeer werkcodes.json onder Beheer");};
function eindOf(r){return r.eind||(running&&r.id===running.id?nowHM():r.start);}
function ruweMin(r){const a=hm2m(r.start),b=hm2m(eindOf(r));
  if(a==null||b==null)return 1;return Math.max(1,b-a);}
function urenOf(r){
  if(r.soort==="pauze")return 0;
  /* Een lopende regel telt altijd live door: handmatige uren zouden de teller
     bevriezen en worden daarom genegeerd zolang de timer loopt.                */
  if(r.urenHand&&r.uren&&!(running&&running.id===r.id))return r.uren;
  return Math.ceil(ruweMin(r)/6)/10;}
const pauzeUren=l=>l.filter(r=>r.soort==="pauze")
  .reduce((s,r)=>s+Math.ceil(ruweMin(r)/6)/10,0);
const totaal=l=>l.reduce((s,r)=>s+urenOf(r),0);
const vandaagRegels=()=>alle.filter(r=>r.datum===today());

function gapsFor(list,datum){
  const iv=list.filter(r=>hm2m(r.start)!=null)
    .map(r=>[hm2m(r.start),Math.max(hm2m(r.start),hm2m(eindOf(r))||hm2m(r.start))])
    .sort((a,b)=>a[0]-b[0]);
  if(!iv.length)return[];
  const mg=[iv[0].slice()];
  for(let i=1;i<iv.length;i++){const l=mg[mg.length-1];
    if(iv[i][0]<=l[1])l[1]=Math.max(l[1],iv[i][1]);else mg.push(iv[i].slice());}
  const de=dagEinde[datum]!=null?hm2m(dagEinde[datum]):null;
  const end=de!=null?Math.max(de,mg[mg.length-1][1])
    :(datum===today()?hm2m(nowHM()):mg[mg.length-1][1]);
  const out=[];
  for(let i=0;i<mg.length-1;i++)if(mg[i+1][0]>mg[i][1])out.push([mg[i][1],mg[i+1][0]]);
  const last=mg[mg.length-1][1];if(end>last)out.push([last,end]);
  return out.filter(g=>g[1]-g[0]>=6);}
const gapHours=g=>g.reduce((s,x)=>s+Math.ceil((x[1]-x[0])/6)/10,0);

function takenVandaag(){
  const map=new Map();
  /* Onvolledige NT-regels zonder dossier horen wel in Dag/controle, maar niet in
     "Verder op": daar kun je inhoudelijk niets zinnigs op hervatten. Een DVN blijft
     wel hervatbaar als die ooit via telefoon/onderbreking is ontstaan: de voorlopige
     dossieridentiteit is daarvoor belangrijker dan het oorspronkelijke regelsoort. */
  vandaagRegels().filter(r=>r.dossierId&&(r.soort==="werk"||(dosOf(r.dossierId)||{}).voorlopig))
    .forEach(r=>{
      const k=(r.dossierId||"-")+"|"+(r.code||"")+"|"+(r.omschrijving||"");
      const g=map.get(k)||{k,dossierId:r.dossierId,code:r.code,oms:r.omschrijving||"",
        u:0,laatst:""};
      g.u+=urenOf(r);if(r.start>g.laatst)g.laatst=r.start;map.set(k,g);});
  const geparkeerd=stack.length?stack[stack.length-1]:null;
  const parkKey=geparkeerd?(geparkeerd.dossierId||"-")+"|"+(geparkeerd.code||"")+"|"+
    (geparkeerd.omschrijving||""):null;
  return [...map.values()].sort((a,b)=>a.k===parkKey?-1:b.k===parkKey?1:
    (a.laatst<b.laatst?1:a.laatst>b.laatst?-1:0));}
const taakLabel=t=>{const d=dosOf(t.dossierId);
  return (d?(d.nummer?d.nummer+" · ":"")+d.naam:"geen dossier");};
function recente(){
  const grens=addD(today(),-11),seen=new Set();
  alle.filter(r=>r.datum>=grens&&r.dossierId)
    .sort((a,b)=>(a.datum+a.start)<(b.datum+b.start)?1:-1)
    .forEach(r=>seen.add(r.dossierId));
  return [...seen].map(dosOf).filter(d=>d&&!d.isI7&&!d.archief).slice(0,9);}
const codesGesorteerd=()=>i7codes.slice().sort((a,b)=>
  (codeGebruik[b.code]||0)-(codeGebruik[a.code]||0)||
  (b.favoriet?1:0)-(a.favoriet?1:0)||a.naam.localeCompare(b.naam));
const favCodes=()=>codesGesorteerd().slice(0,6);

/* ---------- autocomplete ---------- */
let ac={el:null,items:[],hi:0,onPick:null,vrij:false};
let pickBusy=0;
function closeAC(){$("ac").classList.remove("on");ac.el=null;ac.items=[];}
function openAC(el,items,onPick,vrij){
  /* Het zichtbare label bevat dossiernamen en omschrijvingen en gaat daarom niet in
     het logboek: alleen het soort keuze dat is gemaakt.                         */
  const wrap=async it=>{pickBusy++;
    try{L("kies",(el.id||el.dataset.f||"veld")+" → "+(it.t||it.group||"item")+
      (it.isNew?" [nieuw]":"")+(logOms?" · "+kort(it.label,50):""));
      await onPick(it);}
    catch(err){L("FOUT-kies",String(err));}
    finally{pickBusy--;}};
  ac={el,items,hi:vrij?-1:0,onPick:wrap,vrij:!!vrij};
  const r=el.getBoundingClientRect(),a=$("ac");
  a.style.left=Math.min(r.left,window.innerWidth-320)+"px";
  a.style.top=(r.bottom+3)+"px";a.style.width=Math.max(r.width,300)+"px";
  a.scrollTop=0;drawAC();a.classList.add("on");}
function drawAC(){
  let h="",g=null;
  ac.items.forEach((it,i)=>{
    if(it.group&&it.group!==g){g=it.group;h+='<div class="acg">'+esc(g)+"</div>";}
    h+='<div class="aci'+(i===ac.hi?" hi":"")+(it.isNew?" new":"")+'" data-i="'+i+'">'+
      '<span class="l">'+esc(it.label)+'</span><span class="s">'+esc(it.sub||"")+"</span></div>";});
  const box=$("ac");
  box.innerHTML=h||'<div class="aci">Niets gevonden</div>';
  /* De lijst wordt bij elke toetsaanslag opnieuw opgebouwd, waardoor de scrollpositie
     terugspringt naar boven. De gemarkeerde regel wordt daarom actief in beeld
     gehouden — inclusief de groepskop die er direct boven staat.               */
  const hi=box.querySelector(".aci.hi");
  if(!hi)return;
  const kop=hi.previousElementSibling;
  const boven=(kop&&kop.classList.contains("acg")?kop:hi).offsetTop;
  const onder=hi.offsetTop+hi.offsetHeight;
  if(boven<box.scrollTop)box.scrollTop=boven;
  else if(onder>box.scrollTop+box.clientHeight)box.scrollTop=onder-box.clientHeight;}
$("ac").addEventListener("mousedown",e=>{
  const it=e.target.closest("[data-i]");if(!it)return;e.preventDefault();
  const f=ac.onPick,item=ac.items[+it.dataset.i];closeAC();if(f)f(item);});
/* De lijst staat op position:fixed, dus scrollen van de pagina laat hem los van het
   veld hangen: dan sluiten we hem. Scrollen bínnen de lijst zelf — muiswiel of
   sleepbalk — mag hem uiteraard niet sluiten.                                  */
document.addEventListener("scroll",e=>{
  const box=$("ac");
  const t=e.target;
  if(t&&t.nodeType===1&&(t===box||box.contains(t)))return;
  closeAC();},true);
/* Muiswiel boven de lijst scrollt de lijst; alleen als hij aan het einde staat mag de
   pagina het overnemen, en dan sluit hij alsnog via de scroll-handler.         */
$("ac").addEventListener("wheel",e=>{
  const box=$("ac");
  const max=box.scrollHeight-box.clientHeight;
  if(max<=0)return;
  const na=box.scrollTop+e.deltaY;
  if(na>=0&&na<=max)e.stopPropagation();},{passive:true});
/* De muis mag de markering overnemen, zodat toetsenbord en muis hetzelfde item
   aanwijzen en Enter altijd doet wat er oplicht.                               */
$("ac").addEventListener("mousemove",e=>{
  const it=e.target.closest?e.target.closest("[data-i]"):null;
  if(!it)return;
  const i=+it.dataset.i;
  if(i===ac.hi)return;
  ac.hi=i;
  [...$("ac").querySelectorAll(".aci")].forEach(el=>
    el.classList.toggle("hi",+el.dataset.i===i));});
function acKeys(e){
  if(!ac.el||ac.el!==e.target)return false;
  if(e.key==="ArrowDown"){ac.hi=Math.min(ac.hi+1,ac.items.length-1);drawAC();e.preventDefault();return true;}
  if(e.key==="ArrowUp"){ac.hi=Math.max(ac.hi-1,0);drawAC();e.preventDefault();return true;}
  if((e.key==="Enter"||e.key==="Tab")&&ac.items.length&&ac.hi>=0){
    const f=ac.onPick,it=ac.items[ac.hi];closeAC();if(f)f(it);
    if(e.key==="Enter")e.preventDefault();return true;}
  if((e.key==="Enter"||e.key==="Tab")&&ac.vrij){closeAC();return false;}
  if(e.key==="Escape"){closeAC();e.preventDefault();return true;}
  return false;}
function splitsDossier(q){
  const t=(q||"").trim();if(!t)return null;
  /* In de praktijk zijn dossiernummers negen aaneengesloten cijfers, maar hourhound
     valideert dat bewust niet. Alleen de expliciete vorm "nummer - naam" maakt
     automatisch een nieuw dossier aan. */
  const m=/^(.+?)\s+[-–—]\s+(.+)$/.exec(t);
  return m?{nummer:m[1].trim(),naam:m[2].trim()}:null;}
function dossierItems(q){
  const t=(q||"").trim(),lo=t.toLowerCase();
  const m=x=>!lo||String(x).toLowerCase().includes(lo);
  const it=[];
  takenVandaag().filter(x=>(!running||x.k!==taakKey(running))&&
      m(taakLabel(x)+" "+x.oms)).slice(0,6)
    .forEach(x=>it.push({t:"taak",k:x.k,d:dosOf(x.dossierId),
      label:taakLabel(x)+(x.oms?" — "+x.oms:""),sub:uu(x.u)+" u",
      group:"Verder op vandaag"}));
  actief().filter(d=>!d.isI7&&!d.voorlopig&&m((d.nummer||"")+" "+d.naam))
    .sort((a,b)=>(b.used||0)-(a.used||0)).slice(0,12)
    .forEach(d=>it.push({t:"dos",id:d.id,d,label:d.naam,sub:d.nummer||"",
      group:"Dossiers"}));
  codesGesorteerd().filter(c=>m("i7 indirect "+c.code+" "+c.naam))
    .slice(0,lo?8:4)
    .forEach(c=>it.push({t:"i7code",code:c.code,label:"i7 · "+c.naam,
      sub:c.code.split("-").pop(),group:"Indirecte uren"}));
  actief().filter(d=>d.voorlopig&&m(d.naam)).slice(0,6)
    .forEach(d=>it.push({t:"dos",id:d.id,d,label:d.naam,sub:"volgt nog",
      group:"Dossiernummer volgt nog"}));
  if(t){
    const pd=splitsDossier(t);
    if(pd&&!nummerBezet(pd.nummer,null))
      it.push({t:"nieuw",nummer:pd.nummer,naam:pd.naam,isNew:true,
        label:"Nieuw dossier: "+pd.naam,sub:pd.nummer,group:"Aanmaken"});
    it.push({t:"volgt",naam:t,isNew:true,label:'Dossier volgt nog: "'+t+'"',
      sub:"i7",group:"Aanmaken"});}
  return it;}
function codeItems(d,q){
  /* Bij een dossier waarvan het nummer nog volgt is er maar één geldige werkcode. */
  if(d&&d.voorlopig){
    const vast=defaultCode(d),x=codesFor(d).find(c=>c.code===vast);
    return x?[{label:x.naam,sub:x.code.split("-").pop(),value:x.code,
      group:"Vast bij dossier volgt nog"}]:[];}
  const s=(q||"").toLowerCase(),src=codesFor(d);
  const hit=src.filter(c=>!s||(c.code+" "+c.naam).toLowerCase().includes(s));
  hit.sort((a,b)=>(b.fav?1:0)-(a.fav?1:0));
  const items=hit.slice(0,25).map(c=>({label:c.naam,sub:c.code.split("-").pop(),value:c.code,
    group:isIndirect(d)?"i7-werklijst":"Codes van dit dossier"}));
  if(s&&d&&!isIndirect(d)&&!src.some(c=>c.code.toLowerCase()===s))
    items.push({label:'Nieuwe code: "'+q+'"',sub:"aanmaken",isNew:true,newCode:q,group:"Aanmaken"});
  return items;}
function omschrItems(d,q){
  const s=(q||"").toLowerCase(),lang=d&&d.lang==="en"?"en":"nl";
  return templates.filter(t=>!s||((t.nl||"")+" "+(t.en||"")+" "+t.cat).toLowerCase().includes(s))
    .slice(0,25).map(t=>({label:(lang==="en"&&t.en)?t.en:t.nl,sub:t.cat,
      value:(lang==="en"&&t.en)?t.en:t.nl,code:t.code,group:"Sjablonen"}));}

