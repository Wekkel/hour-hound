"use strict";
/* ---------- lopende velden ---------- */
const taakKey=r=>(r.dossierId||"-")+"|"+(r.code||"")+"|"+(r.omschrijving||"");
async function hervat(k){
  const t=takenVandaag().find(x=>x.k===k);if(!t)return;
  L("hervat",dosIdLog(t.dossierId)+" · "+uu(t.u)+" u tot nu");
  /* urenHand wordt bewust niet overgenomen: de nieuwe regel telt live door. */
  await kiesTaak({dossierId:t.dossierId,code:t.code,omschrijving:t.oms});
  naStart();toast("Verder op "+taakLabel(t));
}

$("l-dossier").addEventListener("input",e=>{
  if(!HH.state.read().running)return;
  openAC(e.target,dossierItems(e.target.value),kiesDossierItem);});
$("l-dossier").addEventListener("focus",e=>{
  if(HH.state.read().running&&!HH.state.read().running.dossierId&&!e.target.value)
    openAC(e.target,dossierItems(""),kiesDossierItem);});
$("l-code").addEventListener("focus",e=>{
  /* W5: laat meteen zien welke codes voor dit dossier al bekend zijn. */
  if(!HH.state.read().running||e.target.value.trim())return;
  const d=dosOf(HH.state.read().running.dossierId);
  if(codeItems(d,"").length)openAC(e.target,codeItems(d,""),kiesCodeItem);});
$("l-code").addEventListener("input",e=>{
  if(!HH.state.read().running)return;
  const d=dosOf(HH.state.read().running.dossierId);
  openAC(e.target,codeItems(d,e.target.value),kiesCodeItem);});
$("l-omschr").addEventListener("input",e=>{
  if(!HH.state.read().running)return;
  planOmschr(HH.state.read().running.id,e.target.value);
  const d=dosOf(HH.state.read().running.dossierId),q=e.target.value.replace(VOOR,"");
  if(q.length>=2)openAC(e.target,omschrItems(d,q),async it=>{
    const current=HH.state.read().running,p=(e.target.value||current.omschrijving||"").match(VOOR);
    const next=Object.assign({},current,{omschrijving:(p?p[0]:"")+it.value});
    /* Een omschrijvingssuggestie mag nooit stilzwijgend een optionele dossiercode
       invullen. i7 heeft zijn code al expliciet gekozen vóór de omschrijving. */
    if(it.code&&!next.code&&isIndirect(d))next.code=it.code;
    await saveRegel(next);liveId=null;
    $("l-omschr").value=HH.state.read().running.omschrijving;$("l-code").value=codeNaam(d,HH.state.read().running.code);
    const m=/\{[^}]+\}/.exec($("l-omschr").value);$("l-omschr").focus();
    if(m)$("l-omschr").setSelectionRange(m.index,m.index+m[0].length);
    verversDag();announce();},true);
  else closeAC();});
$("l-omschr").addEventListener("keydown",e=>{
  if(acKeys(e))return;
  if(e.key==="Enter"){e.preventDefault();e.target.blur();}});
["l-dossier","l-code"].forEach(id=>$(id).addEventListener("keydown",acKeys));
async function dossierBlur(inp,huidigId,koppel){
  const v=inp.value.trim(),d=dosOf(huidigId);
  if(v===""){inp.classList.toggle("miss",!d);if(d)inp.value=dosVeld(d);return;}
  if(d&&(v===dosVeld(d)||v===d.naam)){inp.value=dosVeld(d);inp.classList.remove("miss");return;}
  const lv=v.toLowerCase();
  const hit=actief().find(x=>(x.nummer||"").toLowerCase()===lv||
    x.naam.toLowerCase()===lv||((x.nummer||"")+" - "+x.naam).toLowerCase()===lv);
  if(hit){L("blur-dossier","gekoppeld aan bestaand "+dosLog(hit));
    const uit=await koppel({dossierId:hit.id,telUsed:true});
    inp.value=dosVeld(uit?hit:d);inp.classList.toggle("miss",!uit&&!d);return;}
  const pd=splitsDossier(v);
  if(pd&&!nummerBezet(pd.nummer,null)){
    const uit=await koppel({nieuwDossier:{naam:pd.naam,nummer:pd.nummer,lang:"nl"},
      telUsed:true});
    if(!uit){inp.value=dosVeld(d);return;}
    inp.value=dosVeld(uit.dossier);inp.classList.remove("miss");
    L("blur-dossier","aangemaakt uit vrije tekst · "+dosLog(uit.dossier));
    toast("Dossier "+pd.nummer+" aangemaakt");return;}
  /* Niet herkend. Het veld mag daarna nooit iets anders tonen dan wat er werkelijk
     aan de regel gekoppeld is, anders spreken scherm en database elkaar tegen.  */
  L("blur-dossier","niet herkend ["+v.length+" tekens]");
  if(d){inp.value=dosVeld(d);inp.classList.remove("miss");
    toast('"'+kort(v,22)+'" is geen bestaand dossier — teruggezet naar '+dosVeld(d));}
  else{inp.value="";inp.classList.add("miss");
    toast('"'+kort(v,22)+'" is geen bestaand dossier — kies er een uit de lijst');}}
$("l-dossier").addEventListener("blur",()=>setTimeout(async()=>{closeAC();
  if(pickBusy||!HH.state.read().running)return;
  await dossierBlur($("l-dossier"),HH.state.read().running.dossierId,async op=>{
    const uit=await koppelRegel(HH.state.read().running,op);
    if(!uit)return null;
    $("l-code").value=codeNaam(uit.dossier,HH.state.read().running.code);
    $("l-omschr").value=HH.state.read().running.omschrijving;
    liveId=null;renderLive();renderRecent();renderTot();verversDag();announce();
    return uit;});},220));
/* W5: op een gewoon dossier is de werkcode vrij. Wat er wordt ingetypt hoort te
   blijven staan én bij het dossier bewaard te worden — niet stilzwijgend te
   verdwijnen omdat er niet uit de lijst is gekozen. W1: op i7 kan dat juist niet,
   want die lijst ligt vast.                                                     */
async function codeUitVeld(r,v){
  const d=dosOf(r.dossierId);
  const bekend=codesFor(d).find(c=>c.code.toLowerCase()===v.toLowerCase()||
    (c.naam||"").toLowerCase()===v.toLowerCase());
  if(bekend){
    if(r.code!==bekend.code)return !!await koppelRegel(r,{code:bekend.code});
    return true;}
  if(isIndirect(d)){
    toast('"'+kort(v,22)+'" staat niet in de vaste i7-werklijst — kies er een uit');
    return false;}
  const uit=await koppelRegel(r,{nieuweCode:v});
  if(uit)toast("Werkcode "+kort(v,22)+" onthouden bij "+dosVeld(uit.dossier));
  return !!uit;}
$("l-code").addEventListener("blur",()=>setTimeout(async()=>{closeAC();
  if(pickBusy||!HH.state.read().running)return;
  const d=dosOf(HH.state.read().running.dossierId);
  const ingetypt=$("l-code").value.trim();
  if(ingetypt&&ingetypt!==codeNaam(d,HH.state.read().running.code)&&!(d&&(d.voorlopig||dvnDefinitiefI7(d)))){
    await codeUitVeld(HH.state.read().running,ingetypt);}
  else if($("l-code").value.trim()===""){
    /* Leegmaken mag niet op een indirecte regel: de code is daar verplicht. */
    if(d&&(d.voorlopig||dvnDefinitiefI7(d))){
      const vast=codeVoor(d,null);
      if(!vast)geenCodes();
      else{if(HH.state.read().running.code!==vast)await koppelRegel(HH.state.read().running,{code:vast});
        toast("Deze tijd boekt altijd op "+
          codeNaam(d,vast));}}
    else if(isIndirect(d)){
      if(HH.state.read().running.code!==null)await koppelRegel(HH.state.read().running,{code:null});
      toast("Een i7-regel moet een werkcode hebben — kies er een uit de lijst");
      eisCode();}
    else if(HH.state.read().running.code!==null)await koppelRegel(HH.state.read().running,{code:null});}
  const nd=dosOf(HH.state.read().running.dossierId);
  $("l-code").value=codeNaam(nd,HH.state.read().running.code);
  $("l-code").classList.toggle("miss",isIndirect(nd)&&!HH.state.read().running.code);
  verversDag();},160));
$("l-omschr").addEventListener("blur",()=>setTimeout(()=>{closeAC();flushOmschr();},160));
/* Een asynchrone IndexedDB-write haalt het niet meer bij het sluiten van de pagina.
   De openstaande omschrijving wordt daarom synchroon in localStorage genoteerd en bij
   de volgende start teruggezet.                                                */
window.addEventListener("beforeunload",()=>{
  if(!omsWacht)return;
  try{localStorage.setItem("hh-oms",
    JSON.stringify({id:omsWacht.id,tekst:omsWacht.tekst}));}catch(e){}});
async function herstelOmschr(){
  let n=null;
  try{n=JSON.parse(localStorage.getItem("hh-oms")||"null");}catch(e){}
  if(!n||!n.id)return;
  try{localStorage.removeItem("hh-oms");}catch(e){}
  const r=HH.state.read().rules.find(x=>x.id===n.id);
  if(!r||r.omschrijving===n.tekst)return;
  await saveRegel(Object.assign({},r,{omschrijving:n.tekst}));
  L("omschrijving-hersteld","na afsluiten · "+omsLog(n.tekst));
  toast("Laatst getypte omschrijving is alsnog opgeslagen");}
