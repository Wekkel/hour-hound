"use strict";
function dagAfsluitKeuze(datum){
  const dlg=$("dayclose");
  if(!dlg){
    const eind=datum!==today()?prompt("Je sluit "+dagLabel(datum)+" af.\n\nEindtijd?",voorstelDagEinde(datum)):nowHM();
    if(eind===null)return Promise.resolve(null);
    return Promise.resolve({actie:werkdag(datum)?"fill":"nofill",eind});}
  const isWerkdag=werkdag(datum),huidig=dagIntappTotaal(datum),tekort=dagTekort(datum),
    ds=dagSluitStatus(datum),gesloten=ds.gesloten,kanAanvullen=isWerkdag&&tekort>0.05;
  const eindVoorstel=voorstelDagEinde(datum),warnings=dagAfsluitWaarschuwing(datum,tekort);
  $("dc-date").textContent=dagLabel(datum);
  $("dc-status").textContent=!isWerkdag?"weekenddag":
    (gesloten?"al afgesloten":(datum===today()?"vandaag open":"eerdere dag open"));
  $("dc-done").textContent=uu(huidig)+" u";
  $("dc-miss").textContent=uu(tekort)+" u";
  $("dc-missing-wrap").style.display=isWerkdag?"":"none";
  $("dc-end").value=eindVoorstel;
  $("dc-help").textContent=!isWerkdag?
    "Weekenddagen hebben geen 8,0-uursnorm. Er wordt geen Diversen toegevoegd." : tekort>0.05?
    "Aanvullen voegt administratief precies het ontbrekende aantal uren toe als i7 · Praktijkorganisatie/administratie · Diversen. Bestaande tijdregels en kloktijden worden niet aangepast." :
    "Er is al 8,0 uur of meer verantwoord. Auto-aanvullen voegt daarom niets toe.";
  $("dc-warn").innerHTML=warnings.map(esc).join("<br>");
  $("dc-warn").classList.toggle("on",warnings.length>0);
  $("dc-fill").textContent=kanAanvullen?"Afsluiten + aanvullen":"Afsluiten";
  $("dc-fill").classList.toggle("strong",isWerkdag&&tekort>=7.95);
  $("dc-nofill").style.display=kanAanvullen?"":"none";
  const returnFocus=document.activeElement;
  dlg.classList.add("on");dlg.setAttribute("aria-hidden","false");
  setTimeout(()=>$("dc-end").focus(),0);
  return new Promise(resolve=>{
    const done=v=>{dlg.classList.remove("on");
      document.removeEventListener("keydown",key,true);
      if(returnFocus&&typeof returnFocus.focus==="function")returnFocus.focus();
      dlg.setAttribute("aria-hidden","true");resolve(v);};
    const valid=actie=>{const eind=$("dc-end").value.trim();
      if(hm2m(eind)==null){toast("Ongeldige eindtijd");$("dc-end").focus();return;}
      done({actie,eind});};
    const key=e=>{if(!dlg.classList.contains("on"))return;
      if(e.key==="Escape"){e.preventDefault();done(null);}
      if(e.key==="Enter"&&e.target===$("dc-end")){e.preventDefault();valid(kanAanvullen?"fill":"nofill");}};
    document.addEventListener("keydown",key,true);
    $("dc-fill").onclick=()=>valid(kanAanvullen?"fill":"nofill");
    $("dc-nofill").onclick=()=>valid("nofill");
    $("dc-goday").onclick=()=>done({actie:"day",eind:null});
    $("dc-cancel").onclick=()=>done(null);
    $("dc-x").onclick=()=>done(null);});}
async function sluitWerkdag(datum){
  if(HH.services.timer.isBlocked()){toast("Rond eerst het herstelvenster af");return false;}
  const ds=dagSluitStatus(datum);
  if(ds.gesloten){toast("Deze werkdag is al afgesloten om "+ds.eind);return false;}
  const list=dagRegels(datum);
  if(!list.length){toast("Geen regels op "+dmy(datum));return false;}
  const keuze=await dagAfsluitKeuze(datum);
  if(!keuze)return false;
  if(keuze.actie==="day"){
    HH.state.commit({viewDate:datum});HH.app.showTab("dag");HH.renderCoordinator.render("openDays");return false;}
  const eind=keuze.eind.trim();
  if(hm2m(eind)==null){toast("Ongeldige eindtijd");return false;}
  const wasRunning=HH.state.read().running&&HH.state.read().running.datum===datum,dicht=wasRunning?sluitObj(HH.state.read().running,eind):null;
  const uit=await HH.services.timer.closeDay({currentTimer:HH.state.read().running,readCurrentTimer:()=>HH.state.read().running,
      date:datum,end:eind,closedRule:dicht,
      runningId:wasRunning?HH.state.read().running.id:null,rules:HH.state.read().rules,
      dossiers:HH.state.read().dossiers,overbookings:HH.state.read().overbookings,
      dayEnds:HH.state.read().dayEnds,dayAudit:HH.state.read().dayAudit,
      stack:HH.state.read().stack,totalBefore:dagIntappTotaal(datum),
      bookingContext:boekRekenContext(),waitForRules:rustig,
      nowMs:Date.now(),nowIso:new Date().toISOString()});
  if(await meldTimerFout(uit,"Werkdag afsluiten is niet uitgevoerd")||
    meldDagRegelFout(uit,"Werkdag afsluiten is niet uitgevoerd"))return false;
  if(dicht&&dicht._omsVersie)bevestigOmschr(dicht.id,dicht._omsVersie);
  const delta={dossiers:mergeById(HH.state.read().dossiers,uit.dossiers),
    rules:mergeById(HH.state.read().rules,[uit.closedRule]),dayEnds:uit.dayEnds,dayAudit:uit.dayAudit,
    viewDate:datum};
  if(wasRunning){pending=null;delta.running=null;delta.stack=[];
    vergeetTimerUndo("einde werkdag");liveId=null;}
  HH.state.commit(delta);HH.app.showTab("dag");HH.app.render();announce();
  const totaalNaSluit=dagIntappTotaal(datum),naTekort=dagTekort(datum);
  L("einde-werkdag",datum+" om "+dagSluitStatus(datum).eind+" · "+uu(totaalNaSluit)+" u");
  if(!werkdag(datum))toast("Weekendregistratie afgesloten. "+uu(totaalNaSluit)+
    " uur verantwoord; geen 8-uursaanvulling toegepast.");
  else if(keuze.actie==="fill"&&naTekort>0.05)setTimeout(vulAanTot8,120);
  else if(keuze.actie==="fill")toast("Werkdag afgesloten. Er was al "+uu(totaalNaSluit)+
    " uur verantwoord. Er is daarom geen Diversen toegevoegd.");
  else if(naTekort>0.05)toast("Werkdag afgesloten zonder aanvullen. Er is "+uu(totaalNaSluit)+
    " uur verantwoord; "+uu(naTekort)+" uur ontbreekt nog tot "+uu(NORM)+" uur.");
  else toast("Werkdag afgesloten. Er is "+uu(totaalNaSluit)+
    " uur verantwoord; er was geen Diversen-aanvulling nodig.");
  return true;}
