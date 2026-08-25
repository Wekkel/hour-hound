"use strict";
/* ---------- regels ---------- */
const saveRegel=r=>{
  r.gewijzigd=Date.now();memRegel(r);
  const kop=kopie1(r);
  const dvn=dvnPutIfPosted(dosOf(r.dossierId),"tijdregel gewijzigd");
  if(dvn)memDossier(dvn);
  const vorige=schrijfRij[r.id]||Promise.resolve();
  const p=vorige.then(()=>tx(dvn?["regels","dossiers"]:"regels","readwrite",o=>{
    if(dvn){o.regels.put(kop);o.dossiers.put(dvn);}else o.put(kop);}));
  schrijfRij[r.id]=p.then(()=>{},()=>{});
  return p;};
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
  let e=eindTijd;
  if(e==null||hm2m(e)==null)e=k.datum!==today()?"23:59":nowHM();
  if(hm2m(e)==null)e="23:59";
  if(hm2m(e)<hm2m(k.start))e="23:59";
  k.eind=e;
  if(!k.urenHand)k.uren=Math.ceil(Math.max(1,hm2m(e)-hm2m(k.start))/6)/10;
  k.gewijzigd=Date.now();
  return k;}

function timerBasis(nowMs){return{currentTimer:running,readCurrentTimer:()=>running,
  rules:alle,dossiers,stack,dayEnds:dagEinde,dayAudit,codeUsage:codeGebruik,
  date:today(),time:nowHM(),nowMs,nowIso:new Date(nowMs).toISOString(),
  waitForRules:rustig};}
function timerStartInput(o){
  const spec=o||{},nowMs=Date.now(),created=spec.nieuwDossier?bouwDossier(spec.nieuwDossier):null;
  const dossier=created||(spec.dossierId?dosOf(spec.dossierId):null),input=Object.assign(
    timerBasis(nowMs),{id:uid(),createdDossier:created,dossierId:dossier?dossier.id:null,
      code:codeVoor(dossier,spec.code),description:prefixVoor(dossier,today(),spec.omschrijving||""),
      kind:spec.soort||"werk",preserveStack:!!spec.bewaarStack,
      pendingDescription:running?pakOmschr(running.id):null});
  if(Object.prototype.hasOwnProperty.call(spec,"stackNa"))input.stackAfter=spec.stackNa;
  return{input,dossier,created};}
function pasTimerStartToe(uit,context){
  pending=null;vergeetTimerUndo("nieuwe timerwissel");
  if(uit.autoRemoved.length){const ids=new Set(uit.autoRemoved.map(r=>r.id));
    alle=alle.filter(r=>!ids.has(r.id));
    undoStack=undoStack.filter(a=>!(a.soort==="data"&&(a.weg||[]).some(id=>ids.has(id))));
    L("aanvullen-ingetrokken",uit.autoRemoved.length+" automatische regel(s) · dag heropend");}
  if(uit.closedRule)memRegel(uit.closedRule);memRegel(uit.rule);uit.dossiers.forEach(memDossier);
  running=alle.find(r=>r.id===uit.rule.id)||uit.rule;viewDate=uit.rule.datum;
  if(uit.stackChanged)stack=uit.stack;
  if(uit.dayWasClosed){dagEinde=uit.dayEnds;dagAudit=uit.nextDayAudit;}
  codeGebruik=uit.codeUsage;
  if(context.created)L("dossier-nieuw","dos"+idKort(context.created.id)+
    (context.created.nummer?"":" · VOORLOPIG")+(logOms?" · "+kort(context.created.naam):""));
  L("start-regel",uit.rule.soort+" · "+dosIdLog(uit.rule.dossierId)+" · code "+
    (uit.rule.code||"-")+" · "+uit.rule.start+" · oms "+omsLog(uit.rule.omschrijving));
  liveId=null;snoozeTot=0;hideWake();renderAll();announce();
  if(isIndirect(context.dossier)&&!i7codes.length)geenCodes();return uit.rule;}
async function startViaService(o,method){
  const context=timerStartInput(o),uit=await timerServices[method](context.input);
  if(await meldTimerFout(uit,"Starten is niet uitgevoerd"))return null;
  return pasTimerStartToe(uit,context);}
async function stopRunning(eindTijd,label,method){
  const before=running?kopie1(running):null,nowMs=Date.now(),input=Object.assign(timerBasis(nowMs),{
    end:eindTijd,name:label||"stoppen",pendingDescription:running?pakOmschr(running.id):null});
  const uit=await timerServices[method||"stop"](input);
  if(await meldTimerFout(uit,"Stoppen is niet uitgevoerd")||uit.noChange)return null;
  uit.dossiers.forEach(memDossier);memRegel(uit.closedRule);running=null;liveId=null;
  L("stop-regel",uit.closedRule.start+"-"+uit.closedRule.eind+" · "+
    uu(urenOf(uit.closedRule))+" u · "+dosIdLog(uit.closedRule.dossierId));
  renderAll();announce();uit.beforeRule=before;return uit.closedRule;}
function startRegel(o){return startViaService(o||{},"start");}
/* Elke directe route naar een andere taak (hervatten, i7-snelkeuze, enz.) maakt
   net als N meteen een echte timerwissel. Alleen de NT-wizard start bewust leeg en
   vult de identiteit daarna op de reeds lopende regel aan.                      */
function kiesTaak(w){return startViaService(w||{},"switchTask");}

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
  const oudD=r.dossierId?dosOf(r.dossierId):null;
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
  const dvnNw=dvnPutIfPosted(dosK,"tijdregel gewijzigd");
  if(dvnNw)dosK=dvnNw;
  const dvnOud=(!dosK||!oudD||oudD.id!==dosK.id)?dvnPutIfPosted(oudD,"tijdregel gewijzigd"):null;
  try{
    await rustig([r.id]);
    await tx(["dossiers","regels","meta"],"readwrite",o=>{
      if(dosK)o.dossiers.put(dosK);
      if(dvnOud)o.dossiers.put(dvnOud);
      o.regels.put(nw);
      if(telCode)o.meta.put(nwCode,"codeGebruik");});
  }catch(e){L("FOUT-koppelen",String(e));
    toast("Koppelen mislukt — er is niets gewijzigd: "+e);
    return null;}
  if(dosK)memDossier(dosK);
  if(dvnOud)memDossier(dvnOud);
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
  const ind=i7(),nieuw=await startViaService({dossierId:ind?ind.id:null,omschrijving:"",
    soort:soort,stackNa:parkeerLijst()},"interrupt");
  if(!nieuw)return;
  naStart();
  L("onderbreking",soort+" · stapel "+stack.length);
  toast(label+" loopt — druk R of dezelfde toets om terug te keren");}
async function terug(){
  ntWizard=null;
  const st=stack.slice(),back=st.pop();
  if(!back){
    const nowMs=Date.now(),input=Object.assign(timerBasis(nowMs),{returnEmpty:true,
      pendingDescription:running?pakOmschr(running.id):null});
    const uit=await timerServices.returnToStack(input);
    if(await meldTimerFout(uit,"Terugkeren is niet uitgevoerd"))return;
    if(uit.closedRule){uit.dossiers.forEach(memDossier);memRegel(uit.closedRule);running=null;}
    liveId=null;renderAll();announce();L("terug","stapel leeg");await nieuweTaak();return;}
  const context=timerStartInput({dossierId:back.dossierId,code:back.code,
    omschrijving:back.omschrijving,bewaarStack:true,stackNa:st});
  context.input.returnEmpty=false;
  const uit=await timerServices.returnToStack(context.input);
  if(await meldTimerFout(uit,"Terugkeren is niet uitgevoerd"))return;
  pasTimerStartToe(uit,context);L("terug","stapel "+stack.length);
  toast("Terug bij "+((dosOf(back.dossierId)||{}).naam||"vorige taak"));}
async function pauze(){
  ntWizard=null;
  /* P is een toggle, net als T en O: nogmaals P keert terug naar de geparkeerde taak. */
  if(running&&running.soort==="pauze"){await terug();return;}
  await startViaService({dossierId:null,code:null,omschrijving:"Pauze",soort:"pauze",
    stackNa:parkeerLijst()},"pause");}

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
async function maakDvnDefinitiefI7(id){
  const d=dosOf(id);
  if(!d||!isDvn(d)||dvnDefinitiefI7(d))return;
  if(dvnResolvedNummer(d)){
    toast("Deze DVN heeft al een dossiernummer en kan niet naar definitief i7");return;}
  if(running&&running.dossierId===d.id){
    toast("Stop eerst de lopende DVN-regel");return;}
  const commercieel=i7CodeOp(VAST_VOORLOPIG,"-704");
  if(!commercieel){
    toast("Werkcode Commercieel ontbreekt — herstel werkcodes.json onder Beheer");return;}
  const rs=alle.filter(r=>r.dossierId===d.id&&r.soort!=="pauze");
  const uren=Math.round(rs.reduce((s,r)=>s+urenOf(r),0)*10)/10;
  if(!confirm('Zet "'+d.naam+'" met '+rs.length+' regel(s) / '+uu(uren)+
    " uur definitief om naar i7 · Commercieel?\n\nEr wordt geen dossiernummer meer verwacht. "+
    "De regels verdwijnen uit de DVN-werkvoorraad en blijven als gewone i7-tijd bewaard."))return;
  const nowMs=Date.now(),nowIso=new Date(nowMs).toISOString();let uit;
  try{
    uit=await adminServices.finalizeDvnI7({dossier:d,dossiers,rules:alle,stack,
      runningId:running?running.id:null,commercialCode:commercieel,hoursOf,
      waitForRules:rustig,nowMs,nowIso});
  }catch(e){L("FOUT-dvn-definitief-i7",String(e));
    toast("Omzetten naar definitief i7 mislukt — niets gewijzigd");return;}
  if(meldAdminFout(uit,"Omzetten naar definitief i7 is niet uitgevoerd"))return;
  memDossier(uit.dossier);uit.rules.forEach(memRegel);if(uit.stackChanged)stack=uit.stack;
  undoStack=[];liveId=null;refreshDay();renderAll();renderWeek();announce();
  L("dvn-definitief-i7","dos"+idKort(d.id)+" · "+uit.allRules.length+
    " regel(s) · "+uu(uit.total)+" u");
  toast("DVN is definitief i7 · Commercieel");}
/* ---------- DVN dossiernummer toekennen ---------- */
function dvnDossierVoorNummer(nr,id){
  const n=(nr||"").trim().toLowerCase();
  return n?dossiers.find(x=>x.id!==id&&(x.nummer||"").toLowerCase()===n):null;}
function openDvnNummerSheet(id){
  const d=dosOf(id);if(!d||!isDvn(d))return Promise.resolve(false);
  const dlg=$("dvnnum");if(!dlg)return Promise.resolve(false);
  const rs=alle.filter(r=>r.dossierId===d.id&&r.soort!=="pauze"),info=intappDossierInfo(d);
  dlg.dataset.id=id;
  $("dn-status").textContent=d.voorlopig?"nummer ontbreekt":(typeof dvnStatusTekst==="function"?dvnStatusTekst(d):"DVN");
  $("dn-num").value=d.nummer||d.dvnResolvedNr||info.nummer||"";
  $("dn-name").value=d.dvnTo?(dosOf(d.dvnTo)||{}).naam||d.naam:d.naam;
  $("dn-meta").innerHTML='<b>'+esc(d.naam)+'</b><br>'+rs.length+' regel(s) · '+
    uu(rs.reduce((s,r)=>s+urenOf(r),0))+' uur';
  $("dn-warn").classList.remove("on");$("dn-warn").textContent="";
  dlg.classList.add("on");dlg.setAttribute("aria-hidden","false");
  setTimeout(()=>$("dn-num").focus(),0);
  return new Promise(resolve=>{dlg._resolve=resolve;});}
function sluitDvnNummerSheet(v){
  const dlg=$("dvnnum");if(!dlg)return;
  dlg.classList.remove("on");dlg.setAttribute("aria-hidden","true");
  const r=dlg._resolve;dlg._resolve=null;delete dlg.dataset.id;if(r)r(v);}
async function kenNummerToe(id){return openDvnNummerSheet(id);}
async function slaDvnNummerOp(){
  const dlg=$("dvnnum"),id=dlg&&dlg.dataset.id,d=dosOf(id);
  if(!dlg||!d||!isDvn(d)){sluitDvnNummerSheet(false);return;}
  const nr=($("dn-num").value||"").trim(),naam=($("dn-name").value||"").trim()||d.naam;
  if(!nr){toast("Vul het dossiernummer in");$("dn-num").focus();return;}
  const bestaand=dvnDossierVoorNummer(nr,d.id);
  const rs=alle.filter(r=>r.dossierId===d.id);
  if(bestaand&&bestaand.voorlopig){
    toast("Dit nummer hoort bij een andere DVN. Kies eerst een gewoon dossiernummer.");return;}
  const warn=[];
  if(bestaand)warn.push('Nummer '+nr+' hoort al bij "'+bestaand.naam+'". Deze DVN blijft eigen regels houden, maar Intapp gebruikt dat bestaande dossier.');
  warn.push(rs.length+' regel(s) blijven intern aan deze DVN gekoppeld. Het datum/werknaam-voorvoegsel verdwijnt en de i7-werkcode wordt gewist.');
  if(!confirm(warn.join("\n\n")+"\n\nDoorgaan?"))return;
  const nowMs=Date.now(),nowIso=new Date(nowMs).toISOString();let uit;
  try{
    uit=await adminServices.assignDvnNumber({dossier:d,number:nr,name:naam,dossiers,
      rules:alle,stack,waitForRules:rustig,nowMs,nowIso});
  }catch(e){L("FOUT-dvn-nummer",String(e));toast("Dossiernummer opslaan mislukt — niets gewijzigd: "+e);return;}
  if(meldAdminFout(uit,"Dossiernummer is niet opgeslagen"))return;
  memDossier(uit.dossier);uit.rules.forEach(memRegel);if(uit.stackChanged)stack=uit.stack;
  if(running&&running.dossierId===d.id)running=alle.find(r=>r.id===running.id)||running;
  undoStack=[];liveId=null;refreshDay();renderAll();renderWeek();announce();
  L("dvn-nummer","dos"+idKort(d.id)+" → "+nr+" · "+uit.rules.length+
    " regel(s)"+(uit.target?" · koppeling":""));
  toast("DVN gebruikt nu dossiernummer "+nr+" voor Intapp");sluitDvnNummerSheet(true);}

/* ---------- DVN-regels begeleid boeken in Intapp ---------- */
function openDvnPostSheet(id){
  const d=dosOf(id),dlg=$("dvnpost");
  if(!dlg||!d||!isDvn(d))return Promise.resolve(false);
  if(!dvnResolvedNummer(d)){toast("Ken eerst een dossiernummer toe");return Promise.resolve(false);}
  const rs=dvnRegels(d).slice().sort((a,b)=>(a.datum+a.start).localeCompare(b.datum+b.start));
  const u=Math.round(rs.reduce((s,r)=>s+urenOf(r),0)*10)/10,info=intappDossierInfo(d);
  dlg.dataset.id=id;
  $("dp-status").textContent=dvnStatusTekst(d);
  $("dp-meta").innerHTML='<span class="cap">Boeken op dossier</span><br><b class="mono">'+
    esc(info.nummer)+"</b> · <b>"+esc(info.naam||d.naam)+"</b><br>Oorspronkelijke DVN: "+
    esc(d.dvnOriginalName||d.naam);
  $("dp-lines").querySelector("tbody").innerHTML=rs.length?rs.map(r=>
    '<tr data-dvn-rule="'+esc(r.id)+'"><td class="mono">'+esc(dmy(r.datum))+'</td><td>'+ 
    esc(((r.omschrijving||"").replace(VOOR,"").trim())||"geen omschrijving")+
    '</td><td class="mono" style="text-align:right">'+uu(urenOf(r))+"</td></tr>").join(""):
    '<tr><td colspan="3" class="hint">Geen regels om over te nemen.</td></tr>';
  $("dp-total").innerHTML='<span class="cap">Totaal</span><br><b class="mono">'+uu(u)+
    " uur</b> · "+rs.length+" regel"+(rs.length===1?"":"s");
  $("dp-help").textContent=rs.length?
    "Verwerk iedere getoonde regel in Intapp op het echte dossiernummer. Na bevestiging verhuist deze DVN naar Afgehandeld onder Beheer.":
    "Deze DVN heeft geen tijdregels. Controleer of afhandeling werkelijk nodig is.";
  dlg.classList.add("on");dlg.setAttribute("aria-hidden","false");
  return new Promise(res=>{dlg._resolve=res;setTimeout(()=>$("dp-save").focus(),0);});}
function sluitDvnPostSheet(v){
  const dlg=$("dvnpost");if(!dlg)return;
  dlg.classList.remove("on");dlg.setAttribute("aria-hidden","true");
  const r=dlg._resolve;dlg._resolve=null;delete dlg.dataset.id;if(r)r(v);}
async function markeerDvnIngevoerd(){
  const dlg=$("dvnpost"),id=dlg&&dlg.dataset.id,d=dosOf(id);
  if(!dlg||!d||!isDvn(d)){sluitDvnPostSheet(false);return;}
  const nr=dvnResolvedNummer(d);
  if(!nr){toast("Ken eerst een dossiernummer toe");return;}
  const rs=dvnRegels(d),u=Math.round(rs.reduce((s,r)=>s+urenOf(r),0)*10)/10;
  if(!confirm("Bevestig dat alle "+rs.length+" regel(s) / "+uu(u)+
    " uur voor dossier "+nr+" in Intapp zijn ingevoerd."))return;
  const nowMs=Date.now(),nowIso=new Date(nowMs).toISOString();let uit;
  try{uit=await adminServices.markDvnPosted({dossier:d,dossiers,rules:alle,
    hoursOf,nowMs,nowIso});}
  catch(e){L("FOUT-dvn-post",String(e));toast("Markeren mislukt — niets gewijzigd: "+e);return;}
  if(meldAdminFout(uit,"DVN is niet als afgehandeld gemarkeerd"))return;
  memDossier(uit.dossier);renderAll();announce();
  L("dvn-intapp",dosIdLog(id)+" · "+uit.rules.length+" regel(s) · "+uu(uit.total)+" u");
  toast("DVN afgehandeld — alles ingevoerd in Intapp");sluitDvnPostSheet(true);}


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

/* ---------- middernachtgrens ----------
   Een tijdregel kan niet over meerdere datums lopen. Er wordt daarom nooit
   stilzwijgend afgesloten of doorgeboekt: de gebruiker krijgt dezelfde expliciete
   keuzesheet als bij een herstart de volgende ochtend.                        */
async function middernachtCheck(){
  if(!timerServices.inspectOldTimer({currentTimer:running,date:today()}).old)return;
  if(typeof controleerOudeLopendeTaak==="function")controleerOudeLopendeTaak();
}
