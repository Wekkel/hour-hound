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
   T1. Elke toestandsovergang van de timer gaat door TimerService en wordt in één
       volledige IndexedDB-transactie geschreven. Geheugen pas bijwerken ná succes.
   T2. Invariant: hooguit één open regel, en meta.running wijst precies daarnaar.
       Alleen een eenduidige situatie wordt automatisch hersteld; bij meerdere open
       regels komt het herstelvenster en blokkeert TimerService alle timeracties.
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
   B2. De norm is hard 8,0 uur per werkdag en maximaal 24,0 uur per datum.
       Zaterdag en zondag zijn geen verplichte werkdagen: tijdregels blijven geldig,
       maar er geldt geen afsluitplicht en geen automatische 8-uursaanvulling.
   B3. Blokkerende fouten (open regel, lopende timer, ontbrekend dossier, ontbrekende
       verplichte i7-code, lege omschrijving, ongeldige tijd) kunnen niet met
       "toch boeken" worden gepasseerd. Waarschuwingen wel.
   B4. De boekstatus hangt aan een vingerafdruk van de inhoud; wijzigt er iets aan
       uren, bronregels of afrondingsmodus, dan vervalt de status vanzelf.
   B5. Automatisch aanvullen tot 8,0 uur kan alleen op een expliciet afgesloten werkdag.
       Het is een administratieve totaalaanvulling: bij minder dan 8,0 uur wordt exact
       het ontbrekende aantal uren als i7/Diversen toegevoegd, onafhankelijk van gaten
       in de kloktijdlijn. Bij 8,0 uur of meer wordt niets toegevoegd. De automatische
       regel wordt ingetrokken als de dag heropent.
   B6. Een gewone dossierregel die tijdelijk niet in Intapp kan worden geboekt, mag
       na handmatige boeking op i7 · Commercieel in een aparte overboekingswachtrij.
       Dat is geen DVN en geen echte dossierboeking. De latere boeking op het doel-
       dossier maakt alleen de wachtrijregel af; de eerdere i7-boeking blijft staan.
   B7. Een afgeronde overboeking blijft als dossierboeking herkenbaar via de inhouds-
       vingerafdruk van haar bronregels. Een latere inhouds- of afrondingswijziging
       maakt die herkenning bewust ongeldig. Zolang de wachtrij open is, mogen bron-
       regels niet worden verwijderd of met nieuw identiek werk worden samengevoegd.

   LOGBOEK
   L1. Standaard komen er uitsluitend technische gegevens in het logboek. Vrije tekst,
       dossiernamen en dossiernummers alleen via dosLog() en omsLog().
   ========================================================================== */
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
/* Tijdelijke globale compatibiliteitsnamen. Alle bestaande scripts gebruiken hiermee
   exact de functies uit de nieuwe pure domeinlaag; er is geen tweede implementatie. */
const {pad,uu,ymd,today,nowHM,hm2m,m2hm,dmy,parseD,addD,dagLabel,kortDag,
  weekend,werkdag,schoon}=HH.domain.time;
const bookingDomain=HH.domain.booking;
const dvnDomain=HH.domain.dvn,overbookingDomain=HH.domain.overbooking;
const adminFoutTekst={invalid_dvn:"Deze DVN is niet meer beschikbaar",
  number_required:"Vul eerst een dossiernummer in",
  target_is_dvn:"Dit nummer hoort bij een andere DVN. Kies eerst een gewoon dossiernummer.",
  number_exists:"Deze DVN heeft al een dossiernummer en kan niet naar definitief i7",
  timer_running:"Stop eerst alle betrokken timers",
  commercial_code_missing:"Werkcode Commercieel ontbreekt — herstel werkcodes.json onder Beheer",
  invalid_target:"De bronregels moeten bij één gewoon dossier met nummer horen",
  i7_missing:"Het i7-dossier ontbreekt",source_changed:"De bronregels zijn intussen gewijzigd",
  source_missing:"Niet alle bronregels bestaan nog",already_parked:"Deze regels zijn al geparkeerd",
  not_open:"Deze wachtrijregel is niet meer open",
  multiple_targets:"De bronregels horen nu bij verschillende dossiers",
  queue_changed:"De wachtrij is gewijzigd — open de boekingswizard opnieuw"};
function meldAdminFout(result,fallback){
  if(result&&result.ok)return false;
  toast(adminFoutTekst[result&&result.error]||fallback||"Administratieve actie niet uitgevoerd");
  return true;}
const dagRegelFoutTekst={rule_missing:"De tijdregel ontbreekt",
  rule_changed:"De tijdregel is intussen gewijzigd — open hem opnieuw",
  invalid_start:"Ongeldige starttijd",invalid_end:"Ongeldige eindtijd",
  end_before_start:"De eindtijd ligt vóór de starttijd",
  stored_rule_requires_end:"Een opgeslagen regel moet een eindtijd hebben",
  running_start_future:"De starttijd van een lopende regel kan niet in de toekomst liggen",
  start_future:"De starttijd ligt in de toekomst",not_today:"Alleen een regel van vandaag kan lopen",
  day_limit:"Dat zou meer dan 24,0 uur op één dag maken",
  confirmation_required:"Bevestig eerst de administratieve gevolgen",
  parked_rule:"Deze regel wacht nog op dossierboeking — rond de overboeking eerst af onder Beheer",
  day_closed:"Deze werkdag is al afgesloten",day_empty:"Deze dag heeft geen tijdregels",
  weekend:"Weekenddagen hebben geen 8-uursaanvulling",
  day_open:"Sluit deze werkdag eerst af met E",day_open_already:"Deze dag is al open",
  timer_running:"Sluit eerst de lopende regel af met E",
  i7_missing:"Geen i7-dossier — maak er eerst een aan onder Beheer",
  admin_code_missing:"Werkcode Praktijkorganisatie/administratie ontbreekt — herstel werkcodes.json eerst",
  unreliable_total:"Aanvullen kon het dagtotaal niet betrouwbaar op 8,0 uur zetten"};
function meldDagRegelFout(result,fallback){
  if(result&&result.ok)return false;
  toast(dagRegelFoutTekst[result&&result.error]||fallback||"Dagactie niet uitgevoerd");
  return true;}
const timerFoutTekst={blocked:"Rond eerst het herstelvenster af",
  timer_changed:"De lopende timer is intussen gewijzigd",
  timer_missing:"Er loopt geen timer meer",dossier_missing:"Het dossier bestaat niet meer",
  invalid_recovery:"De herstelkeuze past niet meer bij de open regels",
  write_failed:"Timeractie mislukt — er is niets gewijzigd"};
async function meldTimerFout(result,fallback){
  if(result&&result.ok)return false;
  if(result&&result.error&&!Object.prototype.hasOwnProperty.call(timerFoutTekst,result.error))
    return false;
  const message=timerFoutTekst[result&&result.error]||fallback||"Timeractie niet uitgevoerd";
  L("FOUT-timer",(result&&result.error||"onbekend")+
    (result&&result.cause?" · "+result.cause:""));toast(message);
  if(result&&result.error==="write_failed")try{await herlaad();}catch(ignore){}
  return true;}
function pasMutatieUndoToe(undo){
  if(!undo)return;
  if(undo.kind==="timer")undoTimer(undo.label,undo.rules,{weg:undo.remove,
    herstelRunning:undo.restoreRunning,verwachtRunning:undo.expectedRunning,
    verwacht:(undo.expected||[]).map(item=>({id:item.id,gewijzigd:item.modified}))});
  else undoData(undo.label,undo.rules,{weg:undo.remove});
}
function vervangOverboekingenGeheugen(updated){
  HH.state.commit({overbookings:mergeById(HH.state.read().overbookings,updated||[])});
}
const {NORM,DAGMAX}=bookingDomain,VOOR=/^\d{2}\.\d{2}\.\d{4} · [^·]* · /;
const autoAanvulTekort=bookingDomain.autoFillShortfall;

let liveId=null;
let hiddenAt=null,snoozeTot=0,openDagenSnooze=0,oldRunSnooze=0;
/* Centrale waarheid voor de actuele dagafsluitstatus. UI-code leest niet meer
   zelfstandig in dagEinde: zo kunnen banners, Dag-status en afsluitsheet niet
   onderling van mening verschillen na sluiten of heropenen. */
function dagSluitStatus(datum){
  const eind=(HH.state.read().dayEnds&&Object.prototype.hasOwnProperty.call(HH.state.read().dayEnds,datum))?HH.state.read().dayEnds[datum]:null;
  const a=HH.state.read().dayAudit&&HH.state.read().dayAudit[datum],events=a&&Array.isArray(a.events)?a.events:[];
  const lastEvent=events.length?events[events.length-1]:null;
  return{datum,open:eind==null,gesloten:eind!=null,eind:eind||null,
    heropend:eind==null&&!!(lastEvent&&lastEvent.type==="heropend"),lastEvent};}
let ntWizard=null;   // UI-state; N heeft de nieuwe timer dan al werkelijk gestart
let pending=null;    // alleen voor het opruimen van oude versies; nieuwe code gebruikt dit niet
const TABID=Math.random().toString(36).slice(2);
const bc=("BroadcastChannel" in window)?new BroadcastChannel("hourhound"):null;

/* ---------- opslag ----------
   Tijdelijke globale adapters houden bestaande scripts compatibel. Schema,
   transacties en repositories hebben één implementatie in de storagegateway. */
function openDB(){return HH.storage.indexedDB.open({onVersionChange:()=>
  toast("Database elders bijgewerkt — herlaad de pagina")});}
const tx=(s,mode,fn)=>HH.storage.indexedDB.tx(s,mode,fn);
const getAll=s=>HH.storage.indexedDB.getAll(s);
const get=(s,k)=>HH.storage.indexedDB.get(s,k);
const put=(s,v)=>HH.storage.indexedDB.put(s,v);
const putK=(s,v,k)=>HH.storage.indexedDB.putKey(s,v,k);
const del=(s,k)=>HH.storage.indexedDB.remove(s,k);
const replaceAll=(s,rows)=>HH.storage.indexedDB.replaceAll(s,rows);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
/* Eén transactie over regels, meta en dossiers. Elke toestandsovergang van de timer
   wordt hierin volledig geschreven of helemaal niet, en het geheugen wordt pas
   bijgewerkt nadat de transactie is geslaagd.                                    */
const TXALL=HH.storage.indexedDB.TIMER_STORES;
function txAll(fn){return tx(TXALL,"readwrite",fn);}

/* ---------- schrijfacties per regel geserialiseerd ----------
   Iedere schrijfactie bevriest de bedoelde waarde en wordt achter de vorige schrijf-
   actie van dezelfde regel gehangen. Een oudere save kan een nieuwere dus nooit meer
   overschrijven. rustig() wacht tot alle openstaande schrijfacties van de opgegeven
   regels klaar zijn, zodat een transactie er niet overheen kan lopen.           */
const schrijfRij={};
const kopie1=r=>JSON.parse(JSON.stringify(r));
function mergeById(base,updates,key){
  const idKey=key||"id",map=new Map((updates||[]).filter(Boolean).map(x=>[x[idKey],x]));
  const seen=new Set(),next=(base||[]).map(x=>{if(!map.has(x[idKey]))return x;
    seen.add(x[idKey]);return map.get(x[idKey]);});
  (updates||[]).forEach(x=>{if(x&&!seen.has(x[idKey]))next.push(x);});
  return next;}
const zonderIds=(base,ids,key)=>{const idKey=key||"id",weg=new Set(ids||[]);
  return (base||[]).filter(x=>!weg.has(x[idKey]));};
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
  const r=HH.state.read().rules.find(x=>x.id===p.id);
  if(!r)return Promise.resolve();
  const gewijzigd=Object.assign({},r,{omschrijving:p.tekst});
  const kl=()=>{try{const n=JSON.parse(localStorage.getItem("hh-oms")||"null");
    if(n&&n.id===p.id&&n.tekst===p.tekst)localStorage.removeItem("hh-oms");}catch(e){}};
  return saveRegel(gewijzigd).then(kl,kl);}
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
function memRegel(r){HH.state.upsert("rules",r);}
function memDossier(d){HH.state.upsert("dossiers",d);}
let logboek=[],logOms=false,logT=null,appVer="?";
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
  const runId=HH.state.read().running?HH.state.read().running.id:null;
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
  const nextRules=mergeById(zonderIds(HH.state.read().rules,weg),a.regels),delta={rules:nextRules};
  if(runId)delta.running=nextRules.find(x=>x.id===runId)||HH.state.read().running;
  HH.state.commit(delta);
  liveId=null;HH.renderCoordinator.render("day");HH.app.render();announce();
  L("ongedaan","gegevens · "+(a.label||"actie")+" · "+a.regels.length+" regel(s)");
  toast("Ongedaan: "+(a.label||"laatste wijziging")+" — "+
    undoStack.length+" stap(pen) over");}
async function undoTimerStap(a){
  const nu=HH.state.read().running?HH.state.read().running.id:null;
  if(nu!==a.verwachtRunning){
    L("undo-geweigerd","timerstatus is inmiddels veranderd");
    toast("Er loopt inmiddels een andere timer — deze stap wordt niet teruggedraaid");
    return;}
  const scheef=(a.verwacht||[]).find(v=>{
    const r=HH.state.read().rules.find(x=>x.id===v.id);
    return v.gewijzigd==null?!!r:(!r||(r.gewijzigd||0)!==v.gewijzigd);});
  if(scheef){
    L("undo-geweigerd","betrokken regel is inmiddels gewijzigd");
    toast("De betrokken regel is inmiddels gewijzigd — niet teruggedraaid");return;}
  const weg=a.weg||[],uit=await HH.services.timer.restoreUndo({currentTimer:HH.state.read().running,
    readCurrentTimer:()=>HH.state.read().running,rules:a.regels,remove:weg,restoreRunningId:a.herstelRunning,
    waitForRules:rustig});
  if(await meldTimerFout(uit,"Ongedaan maken is niet uitgevoerd"))return;
  const nextRules=mergeById(zonderIds(HH.state.read().rules,weg),uit.rules);
  HH.state.commit({rules:nextRules,running:uit.currentTimerId?
    (nextRules.find(x=>x.id===uit.currentTimerId)||null):null});
  liveId=null;HH.renderCoordinator.render("day");HH.app.render();announce();
  L("ongedaan","timer · "+(a.label||"actie"));
  toast("Ongedaan: "+(a.label||"timerwijziging")+" — "+
    undoStack.length+" stap(pen) over");}
function toast(m){const t=$("toast");t.textContent=m;t.classList.add("on");
  clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove("on"),2600);}
let syncOpen=false;
function announce(){if(bc)try{bc.postMessage({from:TABID,timer:!!HH.state.read().running});}catch(e){}}
if(bc)bc.onmessage=async e=>{
  if(!e.data||e.data.from===TABID||!HH.state.read().db)return;
  if(e.data.timer&&HH.state.read().running)
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
const dosOf=id=>HH.state.read().dossiers.find(d=>d.id===id);
const i7=()=>HH.state.read().dossiers.find(d=>d.isI7);
const actief=()=>HH.state.read().dossiers.filter(d=>!d.archief);
const isDvn=dvnDomain.isDvn;
const dvnDefinitiefI7=dvnDomain.isFinalI7;
const isIndirect=dvnDomain.isIndirect;
const dosVeld=d=>d?(d.nummer||d.naam):"";
const overboekingOpen=overbookingDomain.isOpen;
const bronIdsVan=overbookingDomain.sourceIds;
const overboekingOpenVoorRegel=id=>overbookingDomain.openForRule(id,HH.state.read().overbookings);
const overboekingVoorBronId=id=>overbookingDomain.forSourceId(id,HH.state.read().overbookings);
const overboekingBronMatch=(row,o,datum)=>
  overbookingDomain.sourceMatches(row,o,datum||HH.state.read().viewDate);
const overboekingVoorRow=(row,datum)=>
  overbookingDomain.waitingForRow(row,datum||HH.state.read().viewDate,HH.state.read().overbookings);
const overboekingFingerprints=overbookingDomain.fingerprints;
const overboekingAfgerondVoorRow=(row,datum)=>
  overbookingDomain.terminalForRow(row,datum||HH.state.read().viewDate,HH.state.read().overbookings);
const overboekingRekenContext=()=>({rules:HH.state.read().rules,
  dossiers:HH.state.read().dossiers,summarize:sumVan});
const overboekingWijzigingTekst=code=>({
  source_rule_removed:"tijdregel verwijderd",source_rule_changed:"tijdregel gewijzigd",
  source_rule_target_changed:"doeldossier van tijdregel gewijzigd",
  source_selection_changed:"bronselectie gewijzigd",summary_changed:"Intapp-samenvatting gewijzigd",
  target_missing:"doeldossier ontbreekt",target_number_changed:"dossiernummer gewijzigd",
  target_name_changed:"dossiernaam gewijzigd"
}[code]||code);
const overboekingWijzigingen=o=>overbookingDomain.changeCodes(o,overboekingRekenContext())
  .map(overboekingWijzigingTekst);
const overboekingState=o=>overbookingDomain.state(o,overboekingRekenContext());
function overboekingStatusTekst(o){
  const st=overboekingState(o);
  if(st==="waiting")return"Wacht op dossierboeking";
  if(st==="needs_check")return"Gewijzigd — controleren";
  if(st==="done")return"Afgehandeld";
  if(st==="final_i7")return"Definitief i7";
  return"";}
const dvnRegels=d=>HH.state.selectors.dvnRules(d);
const dvnResolvedDoel=d=>dvnDomain.resolvedTarget(d,HH.state.read().dossiers);
const dvnResolvedNummer=d=>dvnDomain.resolvedNumber(d,HH.state.read().dossiers);
const dvnIntappState=d=>dvnDomain.intappState(d,HH.state.read().dossiers);
function dvnStatusTekst(d){
  const nr=dvnResolvedNummer(d),st=dvnIntappState(d);
  if(st==="missing")return"dossiernummer ontbreekt";
  if(st==="posted")return"dossiernummer "+nr+" · afgehandeld";
  if(st==="needs_check")return"dossiernummer "+nr+" · controle nodig";
  if(st==="ready")return"dossiernummer "+nr+" · nog boeken in Intapp";
  if(st==="final_i7")return"definitief i7";
  return"DVN";}
function dvnSummaryStatus(d){
  const st=dvnIntappState(d);
  if(st==="posted")return"DVN · afgehandeld";
  if(st==="needs_check")return"DVN · controle nodig";
  if(st==="ready")return"DVN · nog boeken in Intapp";
  if(st==="missing")return"DVN · nummer ontbreekt";
  if(st==="final_i7")return"";
  return"";}
const dvnAuditAdd=(d,type,extra)=>
  dvnDomain.auditAdd(d,type,extra,new Date().toISOString());
function markDvnControleNodig(d,reden){
  if(!isDvn(d)||dvnIntappState(d)!=="posted")return d;
  return dvnDomain.markNeedsCheck(d,reden||"tijdregel gewijzigd",{
    dossiers:HH.state.read().dossiers,
    needsAt:new Date().toISOString(),auditAt:new Date().toISOString(),modifiedAt:Date.now()});}
function dvnPutIfPosted(d,reden){
  if(!d||!isDvn(d)||dvnIntappState(d)!=="posted")return null;
  return markDvnControleNodig(d,reden||"tijdregel gewijzigd");}
function intappDossierInfo(d){
  const info=dvnDomain.intappInfo(d,{dossiers:HH.state.read().dossiers,
    i7Dossier:i7(),fallbackI7Name:"Indirecte uren"});
  return{nummer:info.nummer,naam:info.naam,dvn:info.dvn,
    status:info.dvn?dvnSummaryStatus(d):""};}
const dosColor=d=>{const P=["#3f6b3a","#a8452a","#39607f","#7a5090","#8a6b2c","#2f6f6b",
  "#8f3f5c","#5a6b2c","#6b4a3f","#455a64"];return d?P[(d.c||0)%P.length]:"#888";};
function codesFor(d){
  if(!d)return[];
  if(isIndirect(d))return HH.state.read().codes.map(c=>({code:c.code,naam:c.naam,fav:c.favoriet}));
  return (d.codes||[]).map(c=>({code:c.code,naam:c.naam}));}
const codeNaam=(d,c)=>{if(!c)return"";const x=codesFor(d).find(k=>k.code===c);return x?x.naam:c;};
function codeFout(d,r){
  if(!d||!isIndirect(d))return false;
  if(!r.code)return true;
  if(!codesFor(d).some(c=>c.code===r.code))return true;
  if(d.voorlopig||dvnDefinitiefI7(d)){const vast=defaultCode(d);return !vast||r.code!==vast;}
  return false;}
/* Adapter naar de pure Intapp-aggregatie. Alle runtimecontext wordt hier expliciet
   verzameld; core.js is daardoor niet meer afhankelijk van views.js. */
function sumVan(lijst){
  return bookingDomain.aggregateIntapp(lijst,{
    roundingMode:HH.state.read().roundingMode,runningId:HH.state.read().running?HH.state.read().running.id:null,today:today(),nowHM:nowHM(),
    getDossier:dosOf,getIntappInfo:intappDossierInfo,getCodeName:codeNaam,
    hasCodeError:codeFout,
    getBoundaryId:r=>{const over=overboekingVoorBronId(r.id);return over?over.id:"";}
  });}
/* Compatibiliteitsadapters voor klassieke UI-scripts. De implementatie blijft in
   de pure booking-domain; wizard en Dag mogen geen eigen normalisatie of totaallogica
   introduceren. */
const normOms=bookingDomain.normalizeDescription;
const simIntappTotaal=lijst=>sumVan(lijst).reduce((t,row)=>t+row.u,0);
function valideerBoekDag(lijst){
  return bookingDomain.validateDay(lijst,{runningId:HH.state.read().running?HH.state.read().running.id:null,
    today:today(),nowHM:nowHM(),getDossier:dosOf,isIndirect,hasCodeError:codeFout,
    isFixedCode:d=>!!d&&(d.voorlopig||dvnDefinitiefI7(d)),getFixedCode:defaultCode,
    getCodeName:codeNaam});}
const dagCapaciteit=(datum,extra,exclId)=>
  bookingDomain.dayCapacity(HH.state.read().rules,datum,extra,exclId,boekRekenContext());
/* Een regel op i7 of op een dossier waarvan het nummer nog volgt móét een werkcode
   hebben; dat is geen vrije keuze van de gebruiker. Voor "dossier volgt nog" ligt de
   code bovendien vast op Commercieel. codeVoor() is de enige plek waar dat wordt
   bepaald, zodat iedere route — starten, wisselen, koppelen, blur, dagtabel — tot
   dezelfde uitkomst leidt.                                                      */
function codeVoor(d,gewenst){
  if(!isIndirect(d))return gewenst!==undefined?gewenst:null;
  if(d.voorlopig||dvnDefinitiefI7(d))return defaultCode(d);
  if(gewenst&&codesFor(d).some(c=>c.code===gewenst))return gewenst;
  return defaultCode(d);}
function passendeCode(nieuw,huidig){
  if(isIndirect(nieuw))return codeVoor(nieuw,huidig);
  /* W5: bij een gewoon dossier nooit een code uit de vorige dossiercontext meenemen.
     Bekende codes zijn suggesties; alleen expliciete invoer/keuze mag er één zetten. */
  return null;}
function nummerBezet(nr,exclId){
  const n=(nr||"").trim().toLowerCase();
  return !!n&&HH.state.read().dossiers.some(d=>d.id!==exclId&&(d.nummer||"").toLowerCase()===n);}
/* De vaste code voor een voorlopig dossier wordt op naam gezocht, want de nummering
   van de i7-werklijst kan wijzigen; het codesuffix is alleen een terugval.     */
const VAST_VOORLOPIG=/commerc/i;
function i7CodeOp(patroon,suffix){
  const opNaam=HH.state.read().codes.find(c=>patroon.test(c.naam||""));
  if(opNaam)return opNaam.code;
  const opCode=HH.state.read().codes.find(c=>(c.code||"").endsWith(suffix));
  if(opCode)return opCode.code;
  /* Voor een verplichte vaste code is een willekeurige eerste i7-code géén veilige
     terugval. Ontbreekt Commercieel, dan moet de gebruiker dat eerst herstellen. */
  return null;}
/* Op het i7-dossier zelf is er géén stille standaard: de gebruiker moet de werkcode
   zelf kiezen, anders komt er vanzelf een code in Intapp die niemand heeft bedoeld.
   Alleen "dossier volgt nog" heeft een vaste code, want daar valt niets te kiezen. */
function defaultCode(d){
  if(!isIndirect(d))return null;
  if(d.voorlopig||dvnDefinitiefI7(d))return i7CodeOp(VAST_VOORLOPIG,"-704");
  return null;}
/* Alleen de automatisch gegenereerde aanvulregels ("Diversen") hebben een vaste code
   nodig; daar is geen gebruiker die kiest.                                      */
function i7Standaard(){
  return i7CodeOp(/praktijkorganisatie|administrat/i,"-701");}
/* Vraagt de ontbrekende werkcode meteen op, met de keuzelijst open en de cursor erin. */
let codeGevraagd=null;
function eisCode(){
  if(!HH.state.read().running||ntWizard)return false;
  const d=dosOf(HH.state.read().running.dossierId);
  if(!isIndirect(d)||d.voorlopig||dvnDefinitiefI7(d)||HH.state.read().running.code)return false;
  if(!HH.state.read().codes.length){geenCodes();return false;}
  codeGevraagd=HH.state.read().running.id;
  setTimeout(()=>{if(!HH.state.read().running||HH.state.read().running.code)return;
    const el=$("l-code");el.value="";el.focus();
    openAC(el,codeItems(d,""),kiesCodeItem);},40);
  return true;}
/* Na een start: eerst de verplichte werkcode, pas daarna de omschrijving. */
function naStart(){
  if(eisCode())return;
  setTimeout(()=>$("l-omschr").focus(),30);}
const geenCodes=()=>{
  toast("Er zijn nog geen i7-werkcodes — importeer werkcodes.json onder Beheer");};
const boekRekenContext=()=>({runningId:HH.state.read().running?HH.state.read().running.id:null,today:today(),nowHM:nowHM()});
const eindOf=r=>bookingDomain.endOf(r,boekRekenContext());
const ruweMin=r=>bookingDomain.rawMinutes(r,boekRekenContext());
const urenOf=r=>bookingDomain.hoursOf(r,boekRekenContext());
const pauzeUren=l=>bookingDomain.pauseHours(l,boekRekenContext());
const totaal=l=>bookingDomain.totalHours(l,boekRekenContext());
const vandaagRegels=()=>HH.state.selectors.today(today());
function nuBreakdown(lijst){
  const out={declarabel:0,i7:0,dvn:0};
  (lijst||[]).filter(r=>r&&r.soort!=="pauze").forEach(r=>{
    const d=dosOf(r.dossierId),u=urenOf(r),isDvnRegel=!!d&&isDvn(d)&&!dvnDefinitiefI7(d);
    if(isDvnRegel){out.dvn+=u;out.i7+=u;return;}
    if(!d||r.soort!=="werk"||isIndirect(d))out.i7+=u;
    else out.declarabel+=u;});
  Object.keys(out).forEach(k=>{out[k]=Math.round(out[k]*10)/10;});
  return out;
}

function gapsFor(list,datum){return bookingDomain.gapsFor(list,Object.assign(
  boekRekenContext(),{date:datum,dayEnd:HH.state.read().dayEnds[datum]!=null?HH.state.read().dayEnds[datum]:null}));}
const gapHours=bookingDomain.gapHours;

function takenVandaag(){
  return HH.state.selectors.recentTasks({date:today(),hoursOf:urenOf,dossierOf:dosOf,
    isFinalI7:dvnDefinitiefI7});}
const taakLabel=t=>{const d=dosOf(t.dossierId);
  return (d?(d.nummer?d.nummer+" · ":"")+d.naam:"geen dossier");};
function recente(){
  return HH.state.selectors.recentDossiers({date:today(),addDays:addD,limit:9});}
const codesGesorteerd=()=>HH.state.read().codes.slice().sort((a,b)=>
  (HH.state.read().codeUsage[b.code]||0)-(HH.state.read().codeUsage[a.code]||0)||
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
  takenVandaag().filter(x=>(!HH.state.read().running||x.k!==taakKey(HH.state.read().running))&&
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
  return HH.state.read().templates.filter(t=>!s||((t.nl||"")+" "+(t.en||"")+" "+t.cat).toLowerCase().includes(s))
    .slice(0,25).map(t=>({label:(lang==="en"&&t.en)?t.en:t.nl,sub:t.cat,
      value:(lang==="en"&&t.en)?t.en:t.nl,code:t.code,group:"Sjablonen"}));}
