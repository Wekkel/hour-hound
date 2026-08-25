"use strict";
function sluitOverboekPost(){overboekPostIds=[];$("overboekpost").classList.remove("on");}
function openOverboekPost(targetId){
  const os=overboekingen.filter(o=>overboekingOpen(o)&&o.targetDossierId===targetId);
  if(!os.length){toast("Geen open regels voor dit dossier");return;}
  if(os.some(o=>overboekingState(o)==="needs_check")){
    toast("Controleer eerst de gewijzigde items");return;}
  const d=dosOf(targetId);if(!d||!d.nummer){toast("Het doeldossier heeft geen bruikbaar nummer");return;}
  overboekPostIds=os.map(o=>o.id);$("op-status").textContent="Wacht op dossierboeking";
  $("op-meta").innerHTML='<div><span class="cap">Boeken op actuele Intapp-datum</span><strong>'+esc(kortDag(today()))+
    '</strong></div><div><span class="cap">Doeldossier</span><strong>'+esc(d.nummer+' · '+d.naam)+'</strong></div>';
  let regels="",totaal=0;os.forEach(o=>overboekingLijnen(o).forEach(x=>{totaal+=+x.uren||0;
    regels+='<tr><td class="mono">'+esc(kortDag(o.sourceDate))+'</td><td class="mono">'+esc(x.werkcode||'—')+'</td><td>'+esc(x.omschrijving||'')+
      '</td><td class="mono" style="text-align:right">'+uu(+x.uren||0)+'</td></tr>';}));
  $("op-lines").innerHTML=regels;$("op-total").innerHTML='<strong>Totaal '+uu(totaal)+' u</strong>';
  $("overboekpost").classList.add("on");}
async function handelOverboekingenAf(){
  const ids=overboekPostIds.slice(),os=ids.map(id=>overboekingen.find(o=>o.id===id)).filter(Boolean);
  if(!os.length||os.some(o=>overboekingState(o)!=="waiting")){
    toast("De wachtrij is gewijzigd — open de boekingswizard opnieuw");sluitOverboekPost();return;}
  const nowIso=new Date().toISOString(),bookedDate=today();let uit;
  try{uit=await adminServices.completeOverbookings({ids,overbookings:overboekingen,
    rules:alle,dossiers,summarize:sumVan,roundingMode:rondMode,booked:geboekt,
    nowIso,bookedDate});}
  catch(e){L("FOUT-overboeking-afhandelen",String(e));toast("Afhandelen mislukt — er is niets gewijzigd");return;}
  if(meldAdminFout(uit,"Afhandelen is niet uitgevoerd")){sluitOverboekPost();return;}
  appState.commit({booked:uit.booked,
    overbookings:mergeById(overboekingen,uit.overbookings)});
  sluitOverboekPost();renderBeheer();boekStat();
  L("overboeking-afgehandeld",uit.overbookings.length+" item(s)");
  toast("Afgehandeld — de eerdere i7-boeking blijft staan");}
async function verversOverboeking(id){
  const o=overboekingen.find(x=>x.id===id);if(!o||!overboekingOpen(o))return;
  const nowIso=new Date().toISOString();let uit;
  try{uit=await adminServices.refreshOverbooking({overbooking:o,rules:alle,dossiers,
    runningId:running?running.id:null,summarize:sumVan,hoursOf,roundingMode:rondMode,
    waitForRules:rustig,nowIso});}
  catch(e){L("FOUT-overboeking-verversen",String(e));
    toast("Bijwerken mislukt — er is niets gewijzigd");return;}
  if(meldAdminFout(uit,"Gegevens kunnen niet worden bijgewerkt"))return;
  vervangOverboekingenGeheugen([uit.overbooking]);renderBeheer();
  toast("Bijgewerkte gegevens gecontroleerd en opgeslagen");}
async function maakOverboekingDefinitiefI7(id){
  const o=overboekingen.find(x=>x.id===id);if(!o||!overboekingOpen(o))return;
  const rs=bronIdsVan(o).map(rid=>alle.find(r=>r.id===rid)).filter(Boolean),ind=i7();
  const com=i7CodeOp(VAST_VOORLOPIG,"-704");
  if(!ind){toast("Het i7-dossier ontbreekt");return;}
  if(!com){toast("Werkcode Commercieel ontbreekt in de i7-werklijst");return;}
  if(rs.length!==bronIdsVan(o).length){toast("Niet alle bronregels bestaan nog — omzetting is geblokkeerd");return;}
  if(rs.some(r=>!r.eind||(running&&running.id===r.id))){toast("Stop eerst alle betrokken timers");return;}
  if(!confirm("Deze "+rs.length+" bronregel(s) worden in Hour Hound definitief i7 · Commercieel. "+
    "Ze verdwijnen uit de overboekingswachtrij; de al ingevoerde i7-regel in Intapp blijft staan.\n\nDoorgaan?"))return;
  const nowMs=Date.now(),nowIso=new Date(nowMs).toISOString();let uit;
  try{uit=await adminServices.finalizeOverbookingI7({overbooking:o,rules:alle,
    i7Dossier:ind,commercialCode:com,runningId:running?running.id:null,
    summarize:sumVan,booked:geboekt,waitForRules:rustig,nowMs,nowIso});}
  catch(e){L("FOUT-overboeking-definitief-i7",String(e));toast("Omzetten mislukt — er is niets gewijzigd");return;}
  if(meldAdminFout(uit,"Omzetten is niet uitgevoerd"))return;
  appState.commit({booked:uit.booked,rules:mergeById(alle,uit.rules),
    overbookings:mergeById(overboekingen,[uit.overbooking])});renderAll();
  L("overboeking-definitief-i7",uit.rules.length+" regel(s)");
  toast("Definitief i7 · Commercieel");}
