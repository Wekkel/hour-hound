"use strict";
/* ---------- import en export ---------- */
$("b-import").onclick=()=>$("file").click();
$("file").onchange=e=>{const f=e.target.files[0];if(f)importFile(f);e.target.value="";};
const str=(v,max)=>typeof v==="string"?v.slice(0,max||400):"";
const BACKUPVERSIE=11;
/* Een samenvattingsvingerafdruk bevat alle bron-id's en gewijzigd-stempels. Bij een
   grote groep kan die legitiem ruim boven 4.000 tekens uitkomen; afkappen zou na
   restore dezelfde boeking ten onrechte weer als open laten verschijnen. */
const VINGERAFDRUK_MAX=100000;
/* Een datum is pas geldig als hij na parsen exact dezelfde tekst oplevert: zo vallen
   2026-02-30 en 2026-13-01 er ook uit.                                          */
const isDatum=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !isNaN(parseD(s).getTime())&&ymd(parseD(s))===s;
/* Eenvoudige FNV-1a over de kernvelden. Hiermee is te zien of een back-upbestand
   onderweg is aangepast of afgekapt.                                            */
function checksumVan(dos,reg,tpl,cod,over,history){
  const stukken=[
    (dos||[]).map(d=>d&&(d.id+"|"+(d.nummer||"")+"|"+(d.naam||""))).sort().join(";"),
    (reg||[]).map(r=>r&&(r.id+"|"+r.datum+"|"+r.start+"|"+(r.eind||"")+"|"+r.uren))
      .sort().join(";"),
    (tpl||[]).map(t=>t&&t.id).sort().join(";"),
    (cod||[]).map(c=>c&&c.code).sort().join(";")];
  /* Versie 8 en ouder hadden geen vijfde checksumdeel. Laat dat deel bij controle
     van zo'n back-up weg, zodat bestaande geldige exports geldig blijven. */
  if(Array.isArray(over))stukken.push(over.map(o=>o&&(o.id+"|"+o.status+"|"+
    (o.targetDossierId||"")+"|"+(o.updatedAt||""))).sort().join(";"));
  if(history)stukken.push(JSON.stringify(history));
  const stuk=stukken.join("#");
  let h=0x811c9dc5;
  for(let i=0;i<stuk.length;i++){h^=stuk.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
  return("0000000"+h.toString(16)).slice(-8);}
const kloon=x=>JSON.parse(JSON.stringify(x));
function canoniek(x){
  if(x===null||typeof x==="boolean"||typeof x==="string")return JSON.stringify(x);
  if(typeof x==="number"){
    if(!Number.isFinite(x))throw new Error("niet-eindig getal in back-up");
    return JSON.stringify(x);}
  if(Array.isArray(x))return"["+x.map(canoniek).join(",")+"]";
  if(x&&typeof x==="object")return"{"+Object.keys(x).sort().map(k=>
    JSON.stringify(k)+":"+canoniek(x[k])).join(",")+"}";
  throw new Error("ongeldige waarde in back-up");}
function checksumTekst(stuk){
  let h=0x811c9dc5;
  for(let i=0;i<stuk.length;i++){h^=stuk.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
  return("0000000"+h.toString(16)).slice(-8);}
function checksumInhoud(d){
  /* De checksum volgt exact JSON.stringify: undefined objectvelden verdwijnen en
     undefined arrayleden worden null. Zo kan ieder werkelijk exporteerbaar snapshot,
     ook een oud record met een eigen undefined-veld, veilig worden ondertekend. */
  const json=JSON.parse(JSON.stringify({app:d.app,
    schemaVersion:d.schemaVersion,exported:d.exported,dossiers:d.dossiers,regels:d.regels,
    templates:d.templates,codes:d.codes,overboekingen:d.overboekingen,meta:d.meta}));
  return checksumTekst("hourhound/backup/11\n"+canoniek(json));}
const isObject=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const eigen=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const isIso=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
function keurSchema11Inhoud(d){
  const fout=[],m=d.meta,dossierIds=new Set(d.dossiers.map(x=>x&&x.id)),
    regelIds=new Set(d.regels.map(x=>x&&x.id));
  const bool=(x,keys)=>keys.some(k=>eigen(x,k)&&typeof x[k]!=="boolean"),
    integer=(x,k)=>eigen(x,k)&&(!Number.isInteger(x[k])||x[k]<0);
  for(const x of d.dossiers){
    if(!isObject(x)||typeof x.id!=="string"||!x.id||typeof x.naam!=="string"||
      !(x.nummer==null||typeof x.nummer==="string")||
      (eigen(x,"lang")&&!['nl','en'].includes(x.lang))||
      (eigen(x,"codes")&&!Array.isArray(x.codes))||
      (Array.isArray(x.codes)&&x.codes.some(c=>!isObject(c)||typeof c.code!=="string"||typeof c.naam!=="string"))||
      bool(x,["voorlopig","archief","isI7","dvn"])||integer(x,"revision")||
      (eigen(x,"gewijzigd")&&!Number.isFinite(x.gewijzigd)))fout.push("ongeldig dossierrecord");}
  for(const x of d.regels){
    if(!isObject(x)||typeof x.id!=="string"||!x.id||typeof x.datum!=="string"||
      typeof x.start!=="string"||!(x.eind==null||typeof x.eind==="string")||
      !(x.dossierId==null||typeof x.dossierId==="string")||typeof x.omschrijving!=="string"||
      !Number.isFinite(x.uren)||!['werk','pauze','telefoon','onderbreking'].includes(x.soort)||
      bool(x,["urenHand","autoAanvul","hersteld"])||integer(x,"revision")||
      (eigen(x,"gewijzigd")&&!Number.isFinite(x.gewijzigd))||
      (x.dossierId&&!dossierIds.has(x.dossierId)))fout.push("ongeldig tijdregelrecord of dossierverwijzing");}
  for(const x of d.templates)if(!isObject(x)||typeof x.id!=="string"||typeof x.nl!=="string"||
    (eigen(x,"cat")&&typeof x.cat!=="string")||(eigen(x,"min")&&!Number.isFinite(x.min)))
    fout.push("ongeldig sjabloonrecord");
  for(const x of d.codes)if(!isObject(x)||typeof x.code!=="string"||typeof x.naam!=="string"||
    bool(x,["favoriet"]))
    fout.push("ongeldig werkcoderecord");
  for(const x of d.overboekingen)if(!isObject(x)||typeof x.id!=="string"||
    typeof x.targetDossierId!=="string"||
    !Array.isArray(x.sourceRuleIds)||x.sourceRuleIds.some(id=>typeof id!=="string")||
    (x.status==="waiting"&&(!dossierIds.has(x.targetDossierId)||
      x.sourceRuleIds.some(id=>!regelIds.has(id))))||
    ((x.status==="waiting"||eigen(x,"updatedAt"))&&!isIso(x.updatedAt))||
    integer(x,"revision"))fout.push("ongeldige overboeking of bronverwijzing");
  if(isObject(m)){
    for(const [datum,eind] of Object.entries(m.dagEinde||{}))
      if(!isDatum(datum)||hm2m(eind)==null)fout.push("ongeldige dagafsluiting");
    for(const [datum,audit] of Object.entries(m.dagAudit||{})){
      if(!isDatum(datum)||!isObject(audit)||!Array.isArray(audit.events)){
        fout.push("ongeldige dagaudit");continue;}
      for(const event of audit.events)if(!isObject(event)||typeof event.type!=="string"||
        (eigen(event,"t")&&!isIso(event.t))||(event.eind!=null&&hm2m(event.eind)==null)||
        (event.vorigeEind!=null&&hm2m(event.vorigeEind)==null))fout.push("ongeldige dagauditregel");}
    for(const [code,aantal] of Object.entries(m.codeGebruik||{}))
      if(!code||!Number.isFinite(aantal)||aantal<0)fout.push("ongeldig werkcodegebruik");
    for(const [datum,ids] of Object.entries(m.geboekt||{}))
      if(!isDatum(datum)||!Array.isArray(ids)||ids.some(id=>typeof id!=="string"||!id))
        fout.push("ongeldige boekstatus");
    for(const item of m.stack||[])if(!isObject(item)||
      !(item.dossierId==null||typeof item.dossierId==="string")||
      (item.dossierId&&!dossierIds.has(item.dossierId))||!(item.code==null||typeof item.code==="string")||
      typeof item.omschrijving!=="string")fout.push("ongeldige terugkeerstapel");
    if(m.running!=null&&(!regelIds.has(m.running)||
      !d.regels.some(r=>r.id===m.running&&!r.eind)))fout.push("lopende timer verwijst niet naar een open regel");
  }
  return fout;
}
function keurBackupMeta(d){
  const fout=[],sv=d&&d.schemaVersion;
  if(d.app!=="hourhound")fout.push("ongeldige app-identificatie");
  if(!Number.isInteger(sv)||sv<1)fout.push("ongeldige back-upversie");
  if(typeof d.exported!=="string"||!Number.isFinite(Date.parse(d.exported)))
    fout.push("ongeldige exportdatum");
  ["dossiers","regels","templates","codes","overboekingen"].forEach(k=>{
    if(!Array.isArray(d[k]))fout.push(k+" ontbreekt of is geen lijst");});
  if(!isObject(d.meta))fout.push("metadata ontbreekt of is ongeldig");
  const m=isObject(d.meta)?d.meta:{};
  if(!isObject(m.dagEinde)||!isObject(m.dagAudit)||!Array.isArray(m.stack)||
    !isObject(m.codeGebruik)||!isObject(m.geboekt))fout.push("onvolledige back-upmetadata");
  if(!["regel","groep"].includes(m.rondMode)||!["licht","donker","auto"].includes(m.thema)||
    !(m.running==null||typeof m.running==="string"))fout.push("ongeldige instelling in metadata");
  if(sv>=11){
    if(fout.length)return fout;
    const man=d.manifest;
    if(!isObject(man)||man.checksumType!=="fnv1a32-canonical-v1"||
      typeof man.checksum!=="string")fout.push("schema 11 vereist een volledig integriteitsmanifest");
    else{
      const counts={dossiers:d.dossiers.length,regels:d.regels.length,
        templates:d.templates.length,codes:d.codes.length,overboekingen:d.overboekingen.length,
        bookingReceipts:Array.isArray(m.bookingHistory&&m.bookingHistory.receipts)?
          m.bookingHistory.receipts.length:-1,
        bookingResolutions:Array.isArray(m.bookingHistory&&m.bookingHistory.resolutions)?
          m.bookingHistory.resolutions.length:-1,
        open:d.regels.filter(r=>r&&!r.eind).length,
        uren:Math.round(d.regels.reduce((s,r)=>s+(Number(r&&r.uren)||0),0)*10)/10};
      Object.keys(counts).forEach(k=>{if(man[k]!==counts[k])fout.push("manifestveld "+k+" wijkt af");});
      try{if(checksumInhoud(d)!==man.checksum)fout.push("volledige inhoudscontrole klopt niet");}
      catch(error){fout.push(String(error.message||error));}}
    if(!fout.length)fout.push(...keurSchema11Inhoud(d));
  }
  return fout;}
const SOORTEN=["werk","pauze","telefoon","onderbreking"];
function keurBookingHistory(value){
  const fout=[],goed=bookingDomain.emptyHistory(),clone=x=>JSON.parse(JSON.stringify(x));
  if(!value||value.version!==1||!Array.isArray(value.receipts)||!Array.isArray(value.resolutions)||
    !Array.isArray(value.legacyOrphans))return{goed,fout:["ongeldige structuur boekingshistorie"]};
  const validSnapshot=s=>s&&isDatum(s.date)&&typeof s.targetNumber==="string"&&s.targetNumber.trim()&&
    typeof s.targetName==="string"&&typeof s.code==="string"&&typeof s.description==="string"&&
    Number.isFinite(s.hours)&&s.hours>0&&s.hours<=24&&["regel","groep"].includes(s.roundingMode)&&
    Array.isArray(s.sourceIds)&&s.sourceIds.length&&s.sourceIds.every(id=>typeof id==="string"&&id)&&
    new Set(s.sourceIds).size===s.sourceIds.length&&Array.isArray(s.sources)&&
    s.sources.every(r=>r&&typeof r.id==="string"&&s.sourceIds.includes(r.id));
  const ids=new Set(),channels=["day","dvn","legacy","overbooking_i7","overbooking_target","overbooking_final_i7"];
  for(const r of value.receipts){
    if(!r||typeof r.id!=="string"||!r.id||ids.has(r.id)||!channels.includes(r.channel)||
      !validSnapshot(r.snapshot)||typeof r.confirmedAt!=="string"||!Number.isFinite(Date.parse(r.confirmedAt))||
      r.confirmedContent!==bookingDomain.semanticKey(r.snapshot)){
      fout.push("ongeldig of dubbel boekingsbewijs");continue;}
    ids.add(r.id);goed.receipts.push(clone(r));
  }
  const resolutionIds=new Set();
  for(const r of value.resolutions){
    if(!r||typeof r.id!=="string"||!r.id||resolutionIds.has(r.id)||!ids.has(r.receiptId)||
      !["reopened","corrected"].includes(r.type)||typeof r.resolvedAt!=="string"||!Number.isFinite(Date.parse(r.resolvedAt))){
      fout.push("ongeldige of dubbele correctie");continue;}
    if(r.type==="corrected"){
      if(!Array.isArray(r.currentSnapshots)||!r.currentSnapshots.every(validSnapshot)||
        JSON.stringify(r.comparedContent)!==JSON.stringify(r.currentSnapshots.length?
          r.currentSnapshots.map(bookingDomain.semanticKey):["deleted"])){
        fout.push("correctie-inhoud klopt niet");continue;}
    }else if(typeof r.comparedContent!=="string"||!r.comparedContent){fout.push("correctievergelijking ontbreekt");continue;}
    resolutionIds.add(r.id);goed.resolutions.push(clone(r));
  }
  if(value.legacyOrphans.some(x=>typeof x!=="string"))fout.push("ongeldige oude boekmarkering");
  else goed.legacyOrphans=value.legacyOrphans.slice();
  return{goed,fout};}
function voegBookingHistorySamen(current,incoming){
  const merge=(existing,added)=>{const map=new Map(existing.map(x=>[x.id,x]));
    for(const row of added){const previous=map.get(row.id);
      if(previous&&JSON.stringify(previous)!==JSON.stringify(row))
        throw new Error("Boekingshistorie bevat verschillende inhoud met hetzelfde id");
      if(!previous)map.set(row.id,row);}
    return[...map.values()];};
  const receipts=merge(current.receipts,incoming.receipts),resolutions=merge(current.resolutions,incoming.resolutions);
  // Bij gelijke tijdstempels blijft de huidige lokale beslissing leidend.
  const local=new Set(current.resolutions.map(r=>r.id));
  resolutions.sort((a,b)=>Number(local.has(a.id))-Number(local.has(b.id)));
  return{version:1,receipts,resolutions,legacyOrphans:[...new Set(current.legacyOrphans.concat(incoming.legacyOrphans))]};}
/* Elke tijdregel wordt afzonderlijk gekeurd. Wat niet klopt gaat de database niet in,
   en de gebruiker ziet vóór het importeren hoeveel er afvalt en waarom.         */
function keurRegels(arr){
  const goed=[],fout=[],gezien={};
  (Array.isArray(arr)?arr:[]).forEach((x,i)=>{
    const nr="regel "+(i+1);
    if(!x||typeof x!=="object"||typeof x.id!=="string"||!x.id){
      fout.push(nr+": geen bruikbaar id");return;}
    if(gezien[x.id]){fout.push(nr+": dubbel id");return;}
    if(!isDatum(x.datum)){fout.push(nr+": ongeldige datum");return;}
    if(hm2m(x.start)==null){fout.push(nr+": ongeldige starttijd");return;}
    if(x.eind!=null&&hm2m(x.eind)==null){fout.push(nr+": ongeldige eindtijd");return;}
    if(x.eind!=null&&hm2m(x.eind)<hm2m(x.start)){
      fout.push(nr+": eindtijd ligt vóór de starttijd");return;}
    const u=Number(x.uren);
    if(!isFinite(u)||u<0||u>DAGMAX){fout.push(nr+": ongeldig aantal uren");return;}
    gezien[x.id]=1;
    goed.push({id:x.id,datum:x.datum,start:m2hm(hm2m(x.start)),
      eind:x.eind?m2hm(hm2m(x.eind)):null,
      dossierId:typeof x.dossierId==="string"?x.dossierId:null,
      code:x.code?str(x.code,60):null,omschrijving:str(x.omschrijving,2000),
      uren:Math.round(u*10)/10,urenHand:!!x.urenHand,autoAanvul:!!x.autoAanvul,
      autoAanvulOp:+x.autoAanvulOp||0,
      autoAanvulBatch:x.autoAanvulBatch?str(x.autoAanvulBatch,80):null,
      autoAanvulReden:x.autoAanvulReden?str(x.autoAanvulReden,80):null,
      soort:SOORTEN.indexOf(x.soort)>=0?x.soort:"werk",
      hersteld:!!x.hersteld,herstelOp:+x.herstelOp||0,
      herstelOrigineel:x.herstelOrigineel&&typeof x.herstelOrigineel==="object"?{
        eind:x.herstelOrigineel.eind==null?null:str(x.herstelOrigineel.eind,5),
        uren:+x.herstelOrigineel.uren||0,urenHand:!!x.herstelOrigineel.urenHand}:undefined,
      gemaakt:+x.gemaakt||Date.now(),gewijzigd:+x.gewijzigd||0});});
  return{goed,fout};}
function keurDossiers(arr){
  const goed=[],fout=[],gezien={},nummers={};let i7gezien=false;
  (Array.isArray(arr)?arr:[]).forEach((x,i)=>{
    const nr="dossier "+(i+1);
    if(!x||typeof x.id!=="string"||!x.id){fout.push(nr+": geen bruikbaar id");return;}
    if(gezien[x.id]){fout.push(nr+": dubbel id");return;}
    const nummer=x.nummer?str(x.nummer,60):null;
    const sleutel=(nummer||"").toLowerCase();
    if(sleutel&&nummers[sleutel]){
      fout.push(nr+": dossiernummer "+nummer+" komt meer dan één keer voor");return;}
    gezien[x.id]=1;if(sleutel)nummers[sleutel]=1;
    let isI7=!!x.isI7;
    if(isI7&&i7gezien){isI7=false;
      fout.push(nr+": tweede i7-dossier — als gewoon dossier overgenomen");}
    if(isI7)i7gezien=true;
    goed.push({id:x.id,nummer,naam:str(x.naam,200)||"Zonder naam",
      lang:x.lang==="en"?"en":"nl",
      voorlopig:!!x.voorlopig,archief:!!x.archief,isI7,
      dvn:!!x.dvn,dvnOriginalName:x.dvnOriginalName?str(x.dvnOriginalName,200):null,
      dvnResolvedAt:x.dvnResolvedAt?str(x.dvnResolvedAt,40):null,
      dvnResolvedNr:x.dvnResolvedNr?str(x.dvnResolvedNr,60):null,
      dvnTo:x.dvnTo?str(x.dvnTo,80):null,
      dvnDisposition:x.dvnDisposition==="final_i7"?"final_i7":null,
      dvnFinalI7At:x.dvnFinalI7At?str(x.dvnFinalI7At,40):null,
      dvnFinalI7RuleIds:Array.isArray(x.dvnFinalI7RuleIds)?
        x.dvnFinalI7RuleIds.filter(id=>typeof id==="string").slice(0,500):[],
      dvnIntappStatus:["posted","needs_check"].indexOf(x.dvnIntappStatus)>=0?x.dvnIntappStatus:null,
      dvnIntappPostedAt:x.dvnIntappPostedAt?str(x.dvnIntappPostedAt,40):null,
      dvnIntappPostedCount:+x.dvnIntappPostedCount||0,
      dvnIntappPostedHours:+x.dvnIntappPostedHours||0,
      dvnIntappPostedRuleIds:Array.isArray(x.dvnIntappPostedRuleIds)?
        x.dvnIntappPostedRuleIds.filter(id=>typeof id==="string").slice(0,500):[],
      dvnIntappNeedsCheckAt:x.dvnIntappNeedsCheckAt?str(x.dvnIntappNeedsCheckAt,40):null,
      dvnIntappNeedsCheckReason:x.dvnIntappNeedsCheckReason?str(x.dvnIntappNeedsCheckReason,120):null,
      dvnIntappAudit:Array.isArray(x.dvnIntappAudit)?x.dvnIntappAudit.slice(-50)
        .filter(e=>e&&typeof e==="object").map(e=>({
          type:str(e.type,40)||"audit",t:str(e.t,40)||new Date().toISOString(),
          reden:e.reden?str(e.reden,120):null,nummer:e.nummer?str(e.nummer,60):null,
          van:e.van?str(e.van,60):null,naar:e.naar?str(e.naar,60):null,
          regels:+e.regels||0,uren:+e.uren||0})):[],
      c:+x.c||0,used:+x.used||0,gewijzigd:+x.gewijzigd||0,
      codes:Array.isArray(x.codes)?x.codes.filter(c=>c&&c.code)
        .map(c=>({code:str(c.code,60),naam:str(c.naam,120)||str(c.code,60)})):[]});});
  return{goed,fout};}
function keurOverboekingen(arr){
  const goed=[],fout=[],gezien={};
  (Array.isArray(arr)?arr:[]).forEach((x,i)=>{
    const nr="overboeking "+(i+1);
    if(!x||typeof x!=="object"||typeof x.id!=="string"||!x.id){fout.push(nr+": geen bruikbaar id");return;}
    if(gezien[x.id]){fout.push(nr+": dubbel id");return;}
    if(["waiting","done","final_i7"].indexOf(x.status)<0){fout.push(nr+": ongeldige status");return;}
    if(typeof x.targetDossierId!=="string"||!x.targetDossierId){fout.push(nr+": doeldossier ontbreekt");return;}
    if(!isDatum(x.sourceDate)){fout.push(nr+": ongeldige werkdatum");return;}
    const ids=Array.isArray(x.sourceRuleIds)?x.sourceRuleIds.filter(id=>typeof id==="string"&&id).slice(0,500):[];
    if(!ids.length){fout.push(nr+": bronregels ontbreken");return;}
    gezien[x.id]=1;
    const snap=Array.isArray(x.sourceSnapshot)?x.sourceSnapshot.slice(0,500).filter(s=>s&&ids.indexOf(s.id)>=0).map(s=>({
      id:str(s.id,120),datum:isDatum(s.datum)?s.datum:x.sourceDate,start:str(s.start,5),eind:s.eind?str(s.eind,5):null,
      dossierId:s.dossierId?str(s.dossierId,120):null,code:s.code?str(s.code,60):null,
      omschrijving:str(s.omschrijving,2000),uren:Math.max(0,+s.uren||0),gewijzigd:+s.gewijzigd||0})):[];
    const lines=Array.isArray(x.targetLines)?x.targetLines.slice(0,500).filter(l=>l&&typeof l==="object").map(l=>({
      werkcode:str(l.werkcode,120),omschrijving:str(l.omschrijving,2000),uren:Math.max(0,+l.uren||0)})):[];
    const audit=Array.isArray(x.audit)?x.audit.slice(-50).filter(a=>a&&typeof a==="object").map(a=>({
      type:str(a.type,60)||"audit",t:str(a.t,40)||new Date().toISOString(),
      boekdatum:a.boekdatum&&isDatum(a.boekdatum)?a.boekdatum:null})):[];
    goed.push({id:x.id,status:x.status,targetDossierId:str(x.targetDossierId,120),
      targetNumberSnapshot:str(x.targetNumberSnapshot,60),targetNameSnapshot:str(x.targetNameSnapshot,200),
      sourceDate:x.sourceDate,sourceRuleIds:ids,
      sourceFingerprint:str(x.sourceFingerprint,VINGERAFDRUK_MAX),
      sourceFingerprints:Array.isArray(x.sourceFingerprints)?x.sourceFingerprints
        .filter(fp=>typeof fp==="string").map(fp=>str(fp,VINGERAFDRUK_MAX)).slice(0,500):[],
      rondModeSnapshot:x.rondModeSnapshot==="regel"?"regel":(x.rondModeSnapshot==="groep"?"groep":null),
      sourceSnapshot:snap,
      targetLines:lines,description:str(x.description,2000),hours:Math.max(0,+x.hours||0),
      i7DossierId:x.i7DossierId?str(x.i7DossierId,120):null,i7NumberSnapshot:str(x.i7NumberSnapshot,60),
      i7Code:str(x.i7Code,60),temporaryDescription:str(x.temporaryDescription,2000),
      parkedAt:str(x.parkedAt,40),targetBookedAt:x.targetBookedAt?str(x.targetBookedAt,40):null,
      targetBookedDate:x.targetBookedDate&&isDatum(x.targetBookedDate)?x.targetBookedDate:null,
      doneAt:x.doneAt?str(x.doneAt,40):null,finalI7At:x.finalI7At?str(x.finalI7At,40):null,
      finalI7Fingerprints:Array.isArray(x.finalI7Fingerprints)?x.finalI7Fingerprints
        .filter(fp=>typeof fp==="string").map(fp=>str(fp,VINGERAFDRUK_MAX)).slice(0,500):[],
      updatedAt:str(x.updatedAt,40)||str(x.parkedAt,40)||new Date().toISOString(),audit});});
  return{goed,fout};}
function keurTemplates(arr){
  const goed=[],fout=[],gezien={};
  (Array.isArray(arr)?arr:[]).forEach((x,i)=>{
    if(!x||typeof x.id!=="string"||!x.id||typeof x.nl!=="string"||!x.nl.trim()){
      fout.push("sjabloon "+(i+1));return;}
    if(gezien[x.id]){fout.push("sjabloon "+(i+1)+": dubbel id");return;}
    gezien[x.id]=1;
    goed.push({id:str(x.id,120),cat:str(x.cat,60)||"Overig",
      min:Math.max(6,Math.min(600,+x.min||6)),
      code:x.code?str(x.code,60):null,nl:str(x.nl),en:x.en?str(x.en):null});});
  return{goed,fout};}
function keurCodes(arr){
  const goed=[],fout=[],gezien={};
  (Array.isArray(arr)?arr:[]).forEach((x,i)=>{
    if(!x||typeof x.code!=="string"||!x.code.trim()){
      fout.push("werkcode "+(i+1));return;}
    if(gezien[x.code]){fout.push("werkcode "+(i+1)+": dubbele code");return;}
    gezien[x.code]=1;
    goed.push({code:str(x.code,60),naam:str(x.naam,120)||str(x.code,60),
      favoriet:!!x.favoriet});});
  return{goed,fout};}
function keurDagAudit(x){
  if(!x||typeof x!=="object")return{};
  const out={};
  Object.keys(x).forEach(d=>{
    if(!isDatum(d))return;
    const ev=x[d]&&Array.isArray(x[d].events)?x[d].events:[];
    out[d]={events:ev.slice(-20).filter(e=>e&&typeof e==="object").map(e=>({
      type:str(e.type,40)||"audit",t:str(e.t,40)||new Date().toISOString(),
      eind:e.eind?str(e.eind,5):null,vorigeEind:e.vorigeEind?str(e.vorigeEind,5):null,
      uren:+e.uren||0,regels:+e.regels||0,totaalVoor:+e.totaalVoor||0,
      totaalNa:+e.totaalNa||0,autoVerwijderd:+e.autoVerwijderd||0,
      autoBehouden:+e.autoBehouden||0,batch:e.batch?str(e.batch,80):null,
      reden:e.reden?str(e.reden,120):null,
      ids:Array.isArray(e.ids)?e.ids.filter(id=>typeof id==="string").slice(0,200):[]}))};});
  return out;}
async function wachtOpIO(){
  await flushOmschr();
  await rustig(HH.state.read().rules.map(r=>r.id));
  if(HH.services.timer.idle)await HH.services.timer.idle();
  await HH.storage.indexedDB.waitForWrites();}
async function leesVeiligeSnapshot(){
  if(schrijfOvergang)throw new Error("Er wordt al een gegevensactie afgerond");
  schrijfOvergang=true;
  try{
    await wachtOpIO();
    await HH.storage.indexedDB.pauseWrites();
    try{return await HH.storage.indexedDB.loadSnapshot();}
    finally{HH.storage.indexedDB.resumeWrites();}
  }finally{schrijfOvergang=false;}}
let importHerlaadGeblokkeerd=false;
async function metImportGrens(fn){
  if(schrijfOvergang)throw new Error("Er wordt al een gegevensactie afgerond");
  if(!HH.storage.indexedDB.hasWriteAccess())throw new Error("Dit venster is alleen-lezen");
  schrijfOvergang=true;
  try{await wachtOpIO();return await fn();}
  finally{if(!importHerlaadGeblokkeerd)schrijfOvergang=false;}}
function kiesBackupActie(tekst,mergeMogelijk){
  const modal=$("backupkeuze");
  $("bx-text").textContent=tekst;
  $("bx-merge").disabled=!mergeMogelijk;
  modal.classList.add("on");modal.setAttribute("aria-hidden","false");
  $("bx-restore").focus();
  return new Promise(resolve=>{
    let klaar=false;
    const sluit=keuze=>{if(klaar)return;klaar=true;modal.classList.remove("on");
      modal.setAttribute("aria-hidden","true");document.removeEventListener("keydown",toets,true);
      resolve(keuze);};
    const toets=e=>{if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();sluit("cancel");}};
    document.addEventListener("keydown",toets,true);
    $("bx-restore").onclick=()=>sluit("restore");
    $("bx-merge").onclick=()=>{if(mergeMogelijk)sluit("merge");};
    $("bx-cancel").onclick=()=>sluit("cancel");
    $("bx-x").onclick=()=>sluit("cancel");
  });}
function waardeNieuw(erbij,lokaal,veld){return ((erbij&&erbij[veld])||0)>((lokaal&&lokaal[veld])||0);}
function importVingerafdruk(snapshot,metaKeys){
  const meta={};(metaKeys||[]).forEach(k=>{meta[k]=snapshot.meta&&snapshot.meta[k]});
  return checksumTekst(canoniek(JSON.parse(JSON.stringify({dossiers:snapshot.dossiers,
    regels:snapshot.regels,templates:snapshot.templates,codes:snapshot.codes,
    overboekingen:snapshot.overboekingen,meta}))));}
function maakMergePlan(snapshot,D,R,T,C,O,H){
  const kies=(current,incoming,key,stamp)=>{const map=new Map(current.map(x=>[x[key],x]));
    return incoming.filter(x=>{const oud=map.get(x[key]);return !oud||waardeNieuw(x,oud,stamp);});};
  const dossierUpdates=kies(snapshot.dossiers,D,"id","gewijzigd"),
    regelUpdates=kies(snapshot.regels,R,"id","gewijzigd"),
    overboekingUpdates=kies(snapshot.overboekingen,O,"id","updatedAt");
  const voeg=(base,updates,key)=>{const map=new Map(base.map(x=>[x[key],x]));
    updates.forEach(x=>map.set(x[key],x));return[...map.values()];};
  const alleD=voeg(snapshot.dossiers,dossierUpdates,"id"),alleR=voeg(snapshot.regels,regelUpdates,"id"),
    alleO=voeg(snapshot.overboekingen,overboekingUpdates,"id"),nummers=new Map();let i7=0;
  for(const d of alleD){const nummer=typeof d.nummer==="string"?d.nummer.trim().toLowerCase():"";
    if(nummer&&nummers.has(nummer)&&nummers.get(nummer)!==d.id)
      throw new Error("Dossiernummer "+d.nummer+" hoort bij meerdere dossiers");
    if(nummer)nummers.set(nummer,d.id);if(d.isI7)i7++;}
  if(i7>1)throw new Error("De samengevoegde gegevens bevatten meer dan één i7-dossier");
  const dossierIds=new Set(alleD.map(d=>d.id)),regelIds=new Set(alleR.map(r=>r.id));
  if(alleR.some(r=>r.dossierId&&!dossierIds.has(r.dossierId)))
    throw new Error("De samengevoegde tijdregels verwijzen naar een ontbrekend dossier");
  if(alleO.some(o=>o.status==="waiting"&&(!dossierIds.has(o.targetDossierId)||
    o.sourceRuleIds.some(id=>!regelIds.has(id)))))
    throw new Error("De samengevoegde overboekingen hebben ontbrekende brongegevens");
  const history=voegBookingHistorySamen(
      bookingDomain.normalizeHistory(snapshot.meta.bookingHistory),H);
  return{dossiers:dossierUpdates,regels:regelUpdates,overboekingen:overboekingUpdates,
    templates:T,codes:C,history};}
async function importFile(file){
  if(file.size>20*1024*1024){toast("Bestand te groot");return;}
  let d;try{d=JSON.parse(await file.text());}catch(err){toast("Geen geldig JSON");return;}
  if(!d||typeof d!=="object"){toast("Onbruikbaar bestand");return;}
  let soort="",herladen=false;
  try{
    if(d.schema==="hourhound/sjablonen"&&Array.isArray(d.sjablonen)){
      const rows=d.sjablonen.filter(t=>t&&t.id&&t.nl).slice(0,2000).map(t=>({
        id:str(t.id,120),cat:str(t.cat,60)||"Overig",min:Math.max(6,Math.min(600,+t.min||6)),
        code:t.code?str(t.code,60):null,nl:str(t.nl),en:t.en?str(t.en):null}));
      await metImportGrens(()=>replaceAll("templates",rows));soort="sjablonen";
      toast(rows.length+" sjablonen geïmporteerd");}
    else if(d.schema==="hourhound/werkcodes"&&Array.isArray(d.codes)){
      const gekeurd=keurCodes(d.codes.slice(0,500));
      if(!gekeurd.goed.length){
        toast("Geen bruikbare werkcodes gevonden — bestaande werklijst is behouden");return;}
      await metImportGrens(()=>replaceAll("codes",gekeurd.goed));
      HH.state.commit({codes:await getAll("codes")});soort="werkcodes";
      L("werkcodes-import",HH.state.read().codes.length+" codes"+
        (gekeurd.fout.length?" · "+gekeurd.fout.length+" afgekeurd":""));
      toast(HH.state.read().codes.length+" werkcodes geïmporteerd"+
        (gekeurd.fout.length?" · "+gekeurd.fout.length+" overgeslagen":""));}
    else if(d.app==="hourhound"){
      const sv=d.schemaVersion;
      if(Number.isInteger(sv)&&sv>BACKUPVERSIE){
        toast("Deze back-up komt uit een nieuwere versie van hourhound");return;}
      if(sv>=11){
        const metaFout=keurBackupMeta(d);
        if(metaFout.length){toast("Back-up afgewezen: "+metaFout[0]);return;}}
      else if(!Number.isInteger(sv)||sv<1){toast("Back-up afgewezen: ongeldige versie");return;}

      const D=keurDossiers(d.dossiers),R=keurRegels(d.regels),
        T=keurTemplates(d.templates),C=keurCodes(d.codes),O=keurOverboekingen(d.overboekingen),
        M=isObject(d.meta)?d.meta:{},H=sv>=10?keurBookingHistory(M.bookingHistory):
          {goed:bookingDomain.emptyHistory(),fout:[]};
      if(sv>=10&&H.fout.length){toast("Back-up afgewezen: ongeldige boekingshistorie");return;}
      const afkeur=[...D.fout,...R.fout,...T.fout,...C.fout,...O.fout];
      if(sv>=11&&afkeur.length){toast("Back-up afgewezen: "+afkeur[0]);return;}
      /* Schema 11 is een round-tripformaat: na volledige keuring blijven alle geldige
         velden, lange teksten, revisies en historie exact behouden. */
      if(sv>=11){D.goed=kloon(d.dossiers);R.goed=kloon(d.regels);T.goed=kloon(d.templates);
        C.goed=kloon(d.codes);O.goed=kloon(d.overboekingen);H.goed=kloon(M.bookingHistory);}

      const let_op=[];
      if(sv<10)let_op.push("• deze oudere back-up bevat geen duurzame boekingshistorie; "+
        "alleen nog herkenbare oude boekmarkeringen kunnen worden gereconstrueerd");
      if(sv<=10)let_op.push("• de oude checksum controleert alleen samenvattingsvelden; "+
        "niet ieder veld in deze back-up kon destijds worden beschermd");

      const bekend={};D.goed.forEach(x=>{bekend[x.id]=1;});let losgekoppeld=0;
      if(sv<=10)R.goed.forEach(r=>{if(r.dossierId&&!bekend[r.dossierId]){
        r.dossierId=null;losgekoppeld++;}});
      if(losgekoppeld)let_op.push("• "+losgekoppeld+
        " regel(s) verwezen naar een ontbrekend dossier en komen zonder dossier binnen");
      const bronBekend={};R.goed.forEach(r=>{bronBekend[r.id]=1;});
      const overLos=O.goed.filter(o=>!bekend[o.targetDossierId]||
        o.sourceRuleIds.some(id=>!bronBekend[id]));
      if(overLos.length)let_op.push("• "+overLos.length+
        " overboeking(en) hebben ontbrekende brongegevens en vereisen controle");

      const perDag={};R.goed.forEach(r=>{perDag[r.datum]=(perDag[r.datum]||0)+(+r.uren||0);});
      const teVol=Object.keys(perDag).filter(k=>Math.round(perDag[k]*10)/10>DAGMAX);
      if(teVol.length)let_op.push("• "+teVol.length+" dag(en) tellen meer dan "+
        uu(DAGMAX)+" uur: "+teVol.slice(0,4).map(dmy).join(", ")+(teVol.length>4?" …":""));

      const man=isObject(d.manifest)?d.manifest:null,ruwD=Array.isArray(d.dossiers)?d.dossiers:[],
        ruwR=Array.isArray(d.regels)?d.regels:[],ruwT=Array.isArray(d.templates)?d.templates:[],
        ruwC=Array.isArray(d.codes)?d.codes:[],ruwO=Array.isArray(d.overboekingen)?d.overboekingen:[];
      if(sv<=10){
        if(!man)let_op.push("• geen integriteitsmanifest in dit bestand");
        else{
          const mis=[];
          if(man.dossiers!==ruwD.length)mis.push("dossiers");if(man.regels!==ruwR.length)mis.push("regels");
          if(man.templates!==ruwT.length)mis.push("sjablonen");if(man.codes!==ruwC.length)mis.push("werkcodes");
          if(sv>=9&&man.overboekingen!==ruwO.length)mis.push("overboekingen");
          if(sv>=10&&(man.bookingReceipts!==H.goed.receipts.length||
            man.bookingResolutions!==H.goed.resolutions.length))mis.push("boekingshistorie");
          if(mis.length)let_op.push("• het manifest wijkt af voor: "+mis.join(", "));
          if(man.checksum){const eigen=checksumVan(ruwD,ruwR,ruwT,ruwC,sv>=9?ruwO:undefined,
              sv>=10?M.bookingHistory:undefined);
            if(eigen!==man.checksum&&sv>=10){toast("Back-up afgewezen: inhoudscontrole klopt niet");return;}
            if(eigen!==man.checksum)let_op.push("• de oude checksum klopt niet");}
          else let_op.push("• geen checksum in dit bestand");}}

      if(!D.goed.some(x=>x.isI7))let_op.push("• geen i7-dossier — hourhound maakt er zelf een aan");
      if(sv<=10)[["dossier",D.fout],["tijdregel",R.fout],["sjabloon",T.fout],
        ["werkcode",C.fout],["overboeking",O.fout]].forEach(([naam,f])=>{
          if(f.length)let_op.push("• "+f.length+" "+naam+"(s) worden overgeslagen:\n    "+
            f.slice(0,4).join("\n    ")+(f.length>4?"\n    …":""));});

      const huidig=await leesVeiligeSnapshot();
      if(huidig.meta.running||huidig.regels.some(r=>!r.eind)){
        toast("Sluit of herstel eerst de lopende regel");return;}
      let preview=null,mergeFout=null;
      try{preview=maakMergePlan(huidig,D.goed,R.goed,T.goed,C.goed,O.goed,H.goed);}
      catch(error){mergeFout=error;}
      const restoreMeta=["running","pending","stack","dagEinde","dagAudit","rondMode",
          "codeGebruik","geboekt","bookingHistory","thema"],mergeMeta=["running","bookingHistory"],
        restoreVinger=importVingerafdruk(huidig,restoreMeta),
        mergeVinger=importVingerafdruk(huidig,mergeMeta);
      const kop="Back-up van "+str(d.exported,40)+" · versie "+sv+"\n\n"+
        D.goed.length+" dossiers · "+R.goed.length+" tijdregels · "+
        T.goed.length+" sjablonen · "+C.goed.length+" werkcodes · "+
        O.goed.length+" overboekingen"+(let_op.length?"\n\n"+let_op.join("\n"):"")+
        "\n\nTerugzetten vervangt de huidige gegevens. Samenvoegen neemt nieuwere records over, "+
        "voegt sjablonen en werkcodes toe of werkt ze bij, en bewaart de overige lokale waarden. "+
        "Lokale instellingen, dagafsluitingen, dagaudit, terugkeerstapel en oude boekvlaggen "+
        "blijven staan; duurzame boekingshistorie wordt samengevoegd. "+
        "Een oudere back-up kan records terugbrengen die je later hebt verwijderd."+
        (mergeFout?"\n\nSamenvoegen is niet mogelijk: "+mergeFout.message:"");
      const actie=await kiesBackupActie(kop,!mergeFout);
      if(actie==="cancel"){toast("Import afgebroken — er is niets gewijzigd");return;}
      if(actie==="merge"&&mergeFout){toast("Samenvoegen afgewezen: "+mergeFout.message);return;}
      const lokaalHistory=bookingDomain.normalizeHistory(huidig.meta.bookingHistory),
        bevestiging=actie==="restore"?
          "Definitief terugzetten?\n\nDe huidige "+huidig.dossiers.length+" dossiers, "+
          huidig.regels.length+" regels en "+lokaalHistory.receipts.length+
          " duurzame boekingsbewijzen worden vervangen door de back-up."+
          (sv<10?"\n\nDeze oude back-up bevat geen duurzame boekingshistorie.":""):
          "Definitief samenvoegen?\n\nGepland: "+preview.dossiers.length+" dossiers, "+
          preview.regels.length+" regels, "+preview.overboekingen.length+
          " overboekingen, "+preview.templates.length+" sjablonen en "+preview.codes.length+
          " werkcodes toevoegen of bijwerken.";
      if(!confirm(bevestiging)){toast("Import afgebroken — er is niets gewijzigd");return;}

      const open=R.goed.filter(r=>!r.eind);let hervatId=null;
      if(open.length){
        const vandaagBackup=str(d.exported,40).slice(0,10)===today(),
          mag3=actie==="restore"&&vandaagBackup&&open.length===1;
        const keuze=(prompt("Dit bestand bevat "+open.length+" regel(s) zonder eindtijd.\n\n"+
          "1 = afsluiten op de eigen starttijd\n"+
          "2 = afsluiten en markeren als te controleren\n"+
          (mag3?"3 = hervatten als lopende timer (terugzetten, back-up van vandaag)\n":
            "(hervatten kan alleen bij terugzetten van één open regel van vandaag)\n")+
          "\nKies een nummer","2")||"").trim();
        if(keuze!=="1"&&keuze!=="2"&&!(mag3&&keuze==="3")){
          toast("Import afgebroken — er is niets gewijzigd");return;}
        if(mag3&&keuze==="3")hervatId=open[0].id;
        else open.forEach(r=>{const orig={eind:null,uren:r.uren,urenHand:r.urenHand};
          r.eind=r.start;r.uren=0.1;r.urenHand=false;
          if(keuze==="2"){r.hersteld=true;r.herstelOp=Date.now();r.herstelOrigineel=orig;}});}

      const importGelukt=await metImportGrens(async()=>{let uit,succesmelding="";
      if(actie==="restore"){
        const mDag=sv>=11?kloon(M.dagEinde):(isObject(M.dagEinde)?M.dagEinde:{}),
          mAudit=sv>=11?kloon(M.dagAudit):keurDagAudit(M.dagAudit),
          mCode=sv>=11?kloon(M.codeGebruik):(isObject(M.codeGebruik)?M.codeGebruik:{}),
          mBoek=sv>=11?kloon(M.geboekt):(isObject(M.geboekt)?M.geboekt:{}),mHistory=H.goed,
          mRond=M.rondMode==="regel"?"regel":"groep",
          mThema=["licht","donker","auto"].includes(M.thema)?M.thema:"auto",
          mStack=Array.isArray(M.stack)?M.stack:[],neemStack=mStack.length?
            confirm("Het bestand bevat een terugkeerstapel met "+mStack.length+
              " geparkeerde taak(en).\n\nOK = ook terugzetten\nAnnuleren = leeg beginnen"):false;
        uit=await HH.storage.indexedDB.atomicWrite({
          stores:["dossiers","regels","templates","codes","overboekingen"],
          metaKeys:["running","pending","stack","dagEinde","dagAudit","rondMode","codeGebruik",
            "geboekt","bookingHistory","thema"]},(snapshot,writer)=>{
          if(importVingerafdruk(snapshot,restoreMeta)!==restoreVinger)
            return{ok:false,error:"data_changed"};
          if(snapshot.meta.running||snapshot.regels.some(r=>!r.eind))
            return{ok:false,error:"timer_open"};
          const o=writer.stores;o.dossiers.clear();D.goed.forEach(x=>o.dossiers.put(x));
          o.regels.clear();R.goed.forEach(x=>o.regels.put(x));
          o.templates.clear();T.goed.forEach(x=>o.templates.put(x));
          o.codes.clear();C.goed.forEach(x=>o.codes.put(x));
          o.overboekingen.clear();O.goed.forEach(x=>o.overboekingen.put(x));
          o.meta.delete("pending");if(hervatId)o.meta.put(hervatId,"running");else o.meta.delete("running");
          o.meta.put(neemStack?mStack:[],"stack");o.meta.put(mDag,"dagEinde");
          o.meta.put(mAudit,"dagAudit");o.meta.put(mRond,"rondMode");o.meta.put(mCode,"codeGebruik");
          o.meta.put(mBoek,"geboekt");o.meta.put(mHistory,"bookingHistory");o.meta.put(mThema,"thema");
          return{ok:true,neemStack};});
        if(!uit.ok){toast(uit.error==="data_changed"?
          "Import afgebroken: de lokale gegevens zijn intussen gewijzigd — controleer opnieuw":
          "Import afgebroken: sluit of herstel eerst de lopende regel");return false;}
        succesmelding="Teruggezet: "+D.goed.length+" dossiers, "+R.goed.length+" regels"+
          (hervatId?" · lopende timer hervat":"")+(uit.neemStack?" · stapel meegenomen":"");
      }else{
        uit=await HH.storage.indexedDB.atomicWrite({
          stores:["dossiers","regels","templates","codes","overboekingen"],
          metaKeys:["running","bookingHistory"]},(snapshot,writer)=>{
          if(importVingerafdruk(snapshot,mergeMeta)!==mergeVinger)
            return{ok:false,error:"data_changed"};
          if(snapshot.meta.running||snapshot.regels.some(r=>!r.eind))
            return{ok:false,error:"timer_open"};
          const plan=maakMergePlan(snapshot,D.goed,R.goed,T.goed,C.goed,O.goed,H.goed),o=writer.stores;
          plan.dossiers.forEach(x=>o.dossiers.put(x));plan.regels.forEach(x=>o.regels.put(x));
          plan.overboekingen.forEach(x=>o.overboekingen.put(x));
          plan.templates.forEach(x=>o.templates.put(x));plan.codes.forEach(x=>o.codes.put(x));
          o.meta.put(plan.history,"bookingHistory");return Object.assign({ok:true},plan);});
        if(!uit.ok){toast(uit.error==="data_changed"?
          "Import afgebroken: de lokale gegevens zijn intussen gewijzigd — controleer opnieuw":
          "Import afgebroken: sluit of herstel eerst de lopende regel");return false;}
        succesmelding="Samengevoegd: "+uit.dossiers.length+" dossiers, "+uit.regels.length+" regels, "+
          uit.overboekingen.length+" overboekingen · overige lokale sjablonen en werkcodes behouden";}

      try{undoStack=[];await zorgVoorI7();await laadInstellingen();await herlaad();
        pending=null;announce();toast(succesmelding);}
      catch(error){
        /* De transactie is al duurzaam. Laat geen enkele invoer meer toe met de oude
           runtime-arrays; een gewone importfoutmelding zou ten onrechte retry suggereren. */
        importHerlaadGeblokkeerd=true;
        try{await HH.storage.indexedDB.pauseWrites();}catch(ignore){}
        L("FOUT-import-herladen",String(error));
        toast("Import is opgeslagen, maar het scherm kon niet worden bijgewerkt — de pagina wordt herladen");
        try{location.reload();}catch(ignore){}
        return false;}
      return true;});
      if(!importGelukt)return;herladen=true;
      soort=actie==="restore"?"teruggezet":"samengevoegd";
      L("import",soort+" · "+R.goed.length+" regels · "+R.fout.length+
        " afgekeurd · open "+open.length+(hervatId?" · hervat":""));}
    else{toast("Onbekend bestand");return;}
    if(!herladen){await herlaad();announce();}
  }catch(err){L("FOUT-import",String(err));toast("Import mislukt: "+err);}}
$("b-export").onclick=async()=>{
  try{
    const snapshot=await leesVeiligeSnapshot(),m=snapshot.meta,dump={app:"hourhound",
      schemaVersion:BACKUPVERSIE,exported:new Date().toISOString(),
      dossiers:snapshot.dossiers,regels:snapshot.regels,templates:snapshot.templates,
      codes:snapshot.codes,overboekingen:snapshot.overboekingen,
      meta:{dagEinde:m.dagEinde||{},dagAudit:m.dagAudit||{},stack:m.stack||[],
        rondMode:m.rondMode||"groep",codeGebruik:m.codeGebruik||{},geboekt:m.geboekt||{},
        bookingHistory:bookingDomain.normalizeHistory(m.bookingHistory),
        thema:m.thema||"auto",running:m.running||null}};
    dump.manifest={dossiers:dump.dossiers.length,regels:dump.regels.length,
      templates:dump.templates.length,codes:dump.codes.length,
      overboekingen:dump.overboekingen.length,
      bookingReceipts:dump.meta.bookingHistory.receipts.length,
      bookingResolutions:dump.meta.bookingHistory.resolutions.length,
      uren:Math.round(dump.regels.reduce((s,r)=>s+(+r.uren||0),0)*10)/10,
      open:dump.regels.filter(r=>!r.eind).length,checksumType:"fnv1a32-canonical-v1"};
    dump.manifest.checksum=checksumInhoud(dump);
    const url=URL.createObjectURL(new Blob([JSON.stringify(dump,null,2)],{type:"application/json"}));
    const a=document.createElement("a");a.href=url;a.download="hourhound-"+today()+".json";
    a.click();URL.revokeObjectURL(url);L("export",dump.regels.length+" regels");
    toast("Export gedownload — "+dump.regels.length+" regels, "+uu(dump.manifest.uren)+" uur");
  }catch(error){L("FOUT-export",String(error));toast("Export mislukt: "+error.message);}};
