"use strict";
/* ---------- dagtabel ----------
   Bestaande tijdregels worden uitsluitend via de bewerksheet gewijzigd. De
   tabelvelden zijn read-only; focus/input/change mogen geen ruwe mutatie meer
   doen, ook niet via autocomplete.                                            */
$("d-table").addEventListener("click",async e=>{
  const ed=e.target.closest("[data-edit], input[data-f][readonly]");
  if(ed){const tr=ed.closest("tr[data-id]");if(tr)await openRegelEditor(tr.dataset.id,"dag");return;}
  const dl=e.target.closest("[data-del]");
  if(dl){const id=dl.dataset.del;
    const oud=HH.state.selectors.day(HH.state.read().viewDate).find(x=>x.id===id);
    if(!oud)return;
    if(overboekingOpenVoorRegel(id)){
      toast("Deze regel wacht nog op dossierboeking — rond de overboeking eerst af onder Beheer");return;}
    const mutatieWarnings=HH.services.dayRules.ruleWarnings({rule:oud,
      dossiers:HH.state.read().dossiers,
      overbookings:HH.state.read().overbookings,isBooked:regelIsGeboekt(oud)});
    if(!confirm("Deze regel verwijderen?"+(mutatieWarnings.length?
      "\n\nDeze regel heeft een administratieve status. De status valt terug naar controleren.":"")))return;
    const wasRunning=!!(HH.state.read().running&&HH.state.read().running.id===id);
    const uit=await HH.services.timer.deleteRule({currentTimer:HH.state.read().running,readCurrentTimer:()=>HH.state.read().running,
      rule:oud,rules:HH.state.read().rules,dossiers:HH.state.read().dossiers,
        overbookings:HH.state.read().overbookings,runningId:HH.state.read().running?HH.state.read().running.id:null,
        isBooked:regelIsGeboekt(oud),waitForRules:rustig,
        nowMs:Date.now(),nowIso:new Date().toISOString()});
    if(await meldTimerFout(uit,"Verwijderen is niet uitgevoerd")||
      meldDagRegelFout(uit,"Verwijderen is niet uitgevoerd"))return;
    const delta={dossiers:mergeById(HH.state.read().dossiers,uit.dossiers),rules:zonderIds(HH.state.read().rules,[id])};
    if(wasRunning)delta.running=null;HH.state.commit(delta);pasMutatieUndoToe(uit.undo);
    L("regel-weg",oud.start+"-"+(oud.eind||"loopt")+" · "+uu(urenOf(oud))+" u");
    bouwDag();HH.app.render();announce();return;}
  const mk=e.target.closest("[data-maaklopend]");
  if(mk){await maakLopend(mk.dataset.maaklopend);return;}
  const fl=e.target.closest("[data-fill]");
  if(fl){const[a,b]=fl.dataset.fill.split("-").map(Number);
    const u=Math.ceil((b-a)/6)/10;
    if(!dagRuimte(HH.state.read().viewDate,u,null))return;
    const r=nieuweRegel({start:m2hm(a),eind:m2hm(b),uren:u});
    let uit;
    try{uit=await HH.services.dayRules.addRule({rule:r,rules:HH.state.read().rules,
      dossiers:HH.state.read().dossiers,
      overbookings:HH.state.read().overbookings,bookingContext:boekRekenContext(),waitForRules:rustig,
      nowMs:Date.now(),nowIso:new Date().toISOString(),undoLabel:"gat invullen"});}
    catch(x){L("FOUT-gat-invullen",String(x));toast("Regel toevoegen mislukt — niets gewijzigd");return;}
    if(meldDagRegelFout(uit,"Regel toevoegen is niet uitgevoerd"))return;
    uit.dossiers.forEach(memDossier);memRegel(uit.rule);pasMutatieUndoToe(uit.undo);
    bouwDag();renderTot();announce();
    await openRegelEditor(uit.rule.id,"dag");}});
/* De enige manier om een afgesloten regel weer te laten lopen. Sluit de huidige timer
   af, opent de gekozen regel en zet meta.running om — atomisch, met controle op datum,
   starttijd en overlap. urenHand gaat er af, anders bevriest de teller.        */
async function maakLopend(id){
  const r=HH.state.read().rules.find(x=>x.id===id);
  if(!r)return;
  if(r.datum!==today()){toast("Alleen een regel van vandaag kan de lopende timer worden");
    return;}
  if(hm2m(r.start)>hm2m(nowHM())){toast("De starttijd ligt in de toekomst");return;}
  if(HH.state.read().running&&HH.state.read().running.id===id){toast("Deze regel loopt al");return;}
  const nu=hm2m(nowHM());
  const overlap=HH.state.read().rules.filter(x=>x.datum===r.datum&&x.id!==r.id&&hm2m(x.start)!=null)
    .some(x=>hm2m(x.start)<nu&&Math.max(hm2m(x.start),hm2m(eindOf(x))||0)>hm2m(r.start));
  const mutatieWarnings=HH.services.dayRules.ruleWarnings({rule:r,
    dossiers:HH.state.read().dossiers,
    overbookings:HH.state.read().overbookings,isBooked:regelIsGeboekt(r)});
  if(!confirm("Deze regel weer laten lopen?\n\n"+r.start+" · "+
    ((dosOf(r.dossierId)||{}).naam||"geen dossier")+
    "\n\nDe eindtijd vervalt en de regel telt weer live door"+
    (HH.state.read().running?".\nDe regel die nu loopt wordt afgesloten op dit moment.":".")+
    (overlap?"\n\nLet op: dit overlapt met een andere regel van vandaag.":"")+
    (mutatieWarnings.length?"\n\nDeze regel heeft een administratieve status. De status valt terug naar controleren.":"")))return;
  const dicht=HH.state.read().running?sluitObj(HH.state.read().running):null;
  const uit=await HH.services.timer.reopenRule({currentTimer:HH.state.read().running,readCurrentTimer:()=>HH.state.read().running,
      rule:r,closedRule:dicht,rules:HH.state.read().rules,
      dossiers:HH.state.read().dossiers,overbookings:HH.state.read().overbookings,
      runningId:HH.state.read().running?HH.state.read().running.id:null,
      isBooked:regelIsGeboekt(r),confirmedWarnings:true,today:today(),nowTime:nowHM(),
      bookingContext:boekRekenContext(),waitForRules:rustig,
      nowMs:Date.now(),nowIso:new Date().toISOString()});
  if(await meldTimerFout(uit,"Regel opnieuw starten is niet uitgevoerd")||
    meldDagRegelFout(uit,"Regel opnieuw starten is niet uitgevoerd"))return;
  pending=null;ntWizard=null;const nextRules=mergeById(HH.state.read().rules,[uit.closedRule,uit.rule]);
  HH.state.commit({dossiers:mergeById(HH.state.read().dossiers,uit.dossiers),rules:nextRules,
    running:nextRules.find(x=>x.id===uit.rule.id)});
  vergeetTimerUndo("timer overgezet");liveId=null;bouwDag();HH.app.render();announce();
  L("timer-overgezet",dosIdLog(uit.rule.dossierId)+" · sinds "+uit.rule.start);
  toast("Deze regel loopt weer sinds "+uit.rule.start);}
$("d-prev").onclick=()=>{HH.state.commit({viewDate:addD(HH.state.read().viewDate,-1)});bouwDag();};
$("d-next").onclick=()=>{HH.state.commit({viewDate:addD(HH.state.read().viewDate,1)});bouwDag();};
$("d-today").onclick=()=>{HH.state.commit({viewDate:today()});bouwDag();};
$("d-add").onclick=async()=>{
  if(!dagRuimte(HH.state.read().viewDate,0.1,null))return;
  const r=nieuweRegel({start:nowHM(),eind:nowHM()});
  let uit;
  try{uit=await HH.services.dayRules.addRule({rule:r,rules:HH.state.read().rules,
    dossiers:HH.state.read().dossiers,
    overbookings:HH.state.read().overbookings,bookingContext:boekRekenContext(),waitForRules:rustig,
    nowMs:Date.now(),nowIso:new Date().toISOString(),undoLabel:"regel toevoegen"});}
  catch(x){L("FOUT-regel-toevoegen",String(x));toast("Regel toevoegen mislukt — niets gewijzigd");return;}
  if(meldDagRegelFout(uit,"Regel toevoegen is niet uitgevoerd"))return;
  uit.dossiers.forEach(memDossier);memRegel(uit.rule);pasMutatieUndoToe(uit.undo);
  bouwDag();announce();await openRegelEditor(uit.rule.id,"dag");};
