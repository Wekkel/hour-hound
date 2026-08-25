"use strict";
$("d-probs").addEventListener("click",e=>{
  const b=e.target.closest("[data-goto]");if(!b)return;
  openRegelEditor(b.dataset.goto,"dag");});
$("d-mode").onchange=async e=>{const next=e.target.value;
  await HH.services.settings.save("rondMode",next);
  HH.state.commit({roundingMode:next});verversDag();};
$("d-copy").onclick=()=>{
  const rs=sumRows(),probs=controleer(),blok=probs.filter(x=>x.blok);
  if(!rs.length){toast("Niets te kopiëren");return;}
  if(blok.length){toonBlokkade(blok,"tabtekst");return;}
  const waar=probs.filter(x=>!x.blok);
  if(waar.length&&!confirm(waar.length+" waarschuwing(en) op deze dag.\nToch kopiëren?"))return;
  const kop="Dag\tDossiernummer\tDossiernaam\tWerkcode\nOmschrijving\nUren";
  const tekst=rs.map(x=>
    [kortDag(HH.state.read().viewDate),schoon(x.nummer),schoon(x.naam),schoon(x.code)].join("\t")+"\n"+
    schoon(x.oms)+"\n"+uu(x.u)).join("\n\n");
  navigator.clipboard.writeText(kop+"\n\n"+tekst+"\n").then(
    ()=>{L("kopieer-intapp",rs.length+" regels · "+uu(rs.reduce((a,x)=>a+x.u,0))+" u");
      toast(rs.length+" regel(s) gekopieerd");},()=>toast("Kopiëren mislukt"));};

const intappTotaal=()=>sumRows().reduce((s,x)=>s+x.u,0);
/* Dagbudget. hourhound is een voorportaal voor Intapp: wat telt zijn de uren. De
   kloktijden hoeven alleen plausibel te zijn en binnen dezelfde datum te vallen.
   Meer dan 24 uur op één datum wordt nergens weggeschreven.                     */
function dagRuimte(datum,extra,exclId){
  const ruimte=dagCapaciteit(datum,extra,exclId);
  if(ruimte.allowed)return true;
  toast("Dat zou "+uu(ruimte.hours)+" uur op één dag maken — meer dan "+uu(DAGMAX)+
    " uur kan niet");
  return false;}
function nieuweRegel(o){
  return Object.assign({id:uid(),datum:HH.state.read().viewDate,start:nowHM(),eind:null,dossierId:null,
    code:null,omschrijving:"",uren:0.1,urenHand:false,soort:"werk",
    gemaakt:Date.now(),gewijzigd:Date.now()},o);}

/* Auto-aanvullen is bewust een administratieve totaalaanvulling, geen poging om
   achteraf te reconstrueren op welke kloktijden niet is gewerkt/geregistreerd. De
   gebruiker vult inhoudelijke ontbrekende regels eerst zelf aan; daarna vult deze
   functie uitsluitend het resterende verschil tot 8,0 uur met i7/Diversen. */
function maakAanvulPlan(){
  const ind=i7(),code=i7Standaard(),ds=dagSluitStatus(HH.state.read().viewDate),nowMs=Date.now();
  const input={date:HH.state.read().viewDate,isWorkday:werkdag(HH.state.read().viewDate),
    dayEnds:HH.state.read().dayEnds,dayAudit:HH.state.read().dayAudit,
    dayEnd:ds.eind||voorstelDagEinde(HH.state.read().viewDate),rules:HH.state.read().rules,
    dossiers:HH.state.read().dossiers,
    overbookings:HH.state.read().overbookings,runningId:HH.state.read().running?HH.state.read().running.id:null,i7Dossier:ind,code,
    currentTotal:simIntappTotaal(HH.state.selectors.day(HH.state.read().viewDate)),
    bookingContext:boekRekenContext(),
    id:uid(),batchId:uid(),nowMs,nowIso:new Date(nowMs).toISOString(),waitForRules:rustig};
  return Object.assign({input,ind,code},HH.services.dayRules.planAutoFill(input));}
async function vulAanTot8(){
  if(HH.services.timer.isBlocked()){toast("Rond eerst het herstelvenster af");return false;}
  if(!werkdag(HH.state.read().viewDate)){toast("Weekenddagen hebben geen 8-uursaanvulling");return false;}
  if(dagSluitStatus(HH.state.read().viewDate).open){toast("Sluit deze werkdag eerst af met E");return false;}
  if(HH.state.read().running&&HH.state.read().running.datum===HH.state.read().viewDate){
    toast("Sluit eerst de lopende regel af met E");return false;}
  const plan=maakAanvulPlan();
  if(!plan.ok){meldDagRegelFout(plan,"Aanvullen is niet uitgevoerd");
    L("aanvullen-geblokkeerd",plan.error||"onbekend");return false;}
  if(plan.noChange){
    toast("Er was al "+uu(plan.currentTotal)+" uur verantwoord. Er is daarom geen Diversen toegevoegd.");
    L("aanvullen-niet-nodig",uu(plan.currentTotal)+" u");return true;}
  const extra=plan.shortfall;
  const waarschuwing=extra>=7.95?
    "\n\nLET OP: hiermee wordt vrijwel de hele werkdag als Diversen verantwoord." :
    (extra>1.0?"\n\nLet op: hiermee wordt "+uu(extra)+" uur als Diversen verantwoord.":"");
  if(!confirm("Automatisch aanvullen tot "+uu(NORM)+" uur:\n\n"+
    "Er is "+uu(plan.currentTotal)+" uur verantwoord.\n"+
    "Hour Hound voegt "+uu(extra)+" uur toe als i7 · "+codeNaam(plan.ind,plan.code)+" · Diversen.\n"+
    "Dagtotaal daarna: "+uu(plan.finalTotal)+" uur."+waarschuwing+
    "\n\nBestaande tijdregels en kloktijden worden niet aangepast.\n\nDoorgaan?"))return false;
  let uit;
  try{
    uit=await HH.services.dayRules.autoFillDay(plan.input);
  }catch(e){L("FOUT-aanvullen",String(e));
    toast("Aanvullen mislukt — er is niets gewijzigd: "+e);return false;}
  if(meldDagRegelFout(uit,"Aanvullen is niet uitgevoerd"))return false;
  HH.state.commit({dayAudit:uit.dayAudit,rules:mergeById(HH.state.read().rules,[uit.rule])});
  pasMutatieUndoToe(uit.undo);HH.renderCoordinator.render(["day","totals","openDays"]);announce();
  const werkelijk=Math.round(intappTotaal()*10)/10;
  L("aanvullen","1 administratieve regel · +"+uu(extra)+" u · nu "+uu(werkelijk)+" u");
  toast("Er was "+uu(plan.currentTotal)+" uur verantwoord. Hour Hound heeft "+uu(extra)+
    " uur Diversen toegevoegd. Totaal: "+uu(werkelijk)+" uur.");
  return true;}
async function heropenWerkdag(datum){
  if(HH.services.timer.isBlocked()){toast("Rond eerst het herstelvenster af");return;}
  if(dagSluitStatus(datum).open){toast("Deze dag is al open");return;}
  if(HH.state.read().running&&HH.state.read().running.datum===datum){toast("Er loopt nog een regel op deze dag");return;}
  const autos=autoAanvulRegels(datum);
  let verwijder=false;
  if(autos.length){
    const keuze=prompt("Je heropent "+dagLabel(datum)+".\n\n"+
      "Deze dag bevat "+autos.length+" automatische Diversen-regel"+(autos.length===1?"":"s")+".\n\n"+
      "1 = heropenen en automatische Diversen-regels verwijderen\n"+
      "2 = heropenen maar automatische regels laten staan\n\n"+
      "Kies 1 of 2.","1");
    if(keuze===null)return;
    const k=keuze.trim();
    if(k!=="1"&&k!=="2"){toast("Heropenen geannuleerd");return;}
    verwijder=k==="1";
  }else if(!confirm("Werkdag "+dagLabel(datum)+" heropenen?"))return;
  let uit;
  try{
    uit=await HH.services.dayRules.reopenDay({date:datum,removeAutomatic:verwijder,
      rules:HH.state.read().rules,dossiers:HH.state.read().dossiers,
      overbookings:HH.state.read().overbookings,
      runningId:HH.state.read().running?HH.state.read().running.id:null,
      dayEnds:HH.state.read().dayEnds,dayAudit:HH.state.read().dayAudit,waitForRules:rustig,
      nowMs:Date.now(),nowIso:new Date().toISOString()});
  }catch(e){L("FOUT-heropen",String(e));toast("Heropenen mislukt — niets gewijzigd: "+e);return;}
  if(meldDagRegelFout(uit,"Heropenen is niet uitgevoerd"))return;
  const delta={dayEnds:uit.dayEnds,dayAudit:uit.dayAudit,viewDate:datum};
  if(verwijder&&autos.length){
    const ids=new Set(uit.removedRules.map(r=>r.id));delta.rules=zonderIds(HH.state.read().rules,[...ids]);
    undoStack=undoStack.filter(a=>!(a.soort==="data"&&(a.weg||[]).some(id=>ids.has(id))));}
  HH.state.commit(delta);HH.app.render(["day","live","recent","totals","openDays"]);announce();
  L("dag-heropend",datum+" · auto verwijderd "+(verwijder?autos.length:0));
  toast("Werkdag heropend"+(verwijder&&autos.length?" — automatische Diversen-regels verwijderd":""));}
$("d-fill").onclick=vulAanTot8;
$("d-status").addEventListener("click",async e=>{
  if(e.target.closest("[data-close-current]")){await sluitWerkdag(HH.state.read().viewDate);return;}
  if(e.target.closest("[data-fill-current]")){await vulAanTot8();return;}
  if(e.target.closest("[data-reopen-current]")){await heropenWerkdag(HH.state.read().viewDate);return;}
});
