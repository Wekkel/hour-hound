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
    const oud=regels.find(x=>x.id===id);if(!oud)return;
    if(overboekingOpenVoorRegel(id)){
      toast("Deze regel wacht nog op dossierboeking — rond de overboeking eerst af onder Beheer");return;}
    const mutatieWarnings=dayRuleServices.ruleWarnings({rule:oud,dossiers,
      overbookings:overboekingen,isBooked:regelIsGeboekt(oud)});
    if(!confirm("Deze regel verwijderen?"+(mutatieWarnings.length?
      "\n\nDeze regel heeft een administratieve status. De status valt terug naar controleren.":"")))return;
    const wasRunning=!!(running&&running.id===id);
    const uit=await timerServices.deleteRule({currentTimer:running,readCurrentTimer:()=>running,
      rule:oud,rules:alle,dossiers,
        overbookings:overboekingen,runningId:running?running.id:null,
        isBooked:regelIsGeboekt(oud),waitForRules:rustig,
        nowMs:Date.now(),nowIso:new Date().toISOString()});
    if(await meldTimerFout(uit,"Verwijderen is niet uitgevoerd")||
      meldDagRegelFout(uit,"Verwijderen is niet uitgevoerd"))return;
    const delta={dossiers:mergeById(dossiers,uit.dossiers),rules:zonderIds(alle,[id])};
    if(wasRunning)delta.running=null;appState.commit(delta);pasMutatieUndoToe(uit.undo);
    L("regel-weg",oud.start+"-"+(oud.eind||"loopt")+" · "+uu(urenOf(oud))+" u");
    bouwDag();renderAll();announce();return;}
  const mk=e.target.closest("[data-maaklopend]");
  if(mk){await maakLopend(mk.dataset.maaklopend);return;}
  const fl=e.target.closest("[data-fill]");
  if(fl){const[a,b]=fl.dataset.fill.split("-").map(Number);
    const u=Math.ceil((b-a)/6)/10;
    if(!dagRuimte(viewDate,u,null))return;
    const r=nieuweRegel({start:m2hm(a),eind:m2hm(b),uren:u});
    let uit;
    try{uit=await dayRuleServices.addRule({rule:r,rules:alle,dossiers,
      overbookings:overboekingen,bookingContext:boekRekenContext(),waitForRules:rustig,
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
  const r=alle.find(x=>x.id===id);
  if(!r)return;
  if(r.datum!==today()){toast("Alleen een regel van vandaag kan de lopende timer worden");
    return;}
  if(hm2m(r.start)>hm2m(nowHM())){toast("De starttijd ligt in de toekomst");return;}
  if(running&&running.id===id){toast("Deze regel loopt al");return;}
  const nu=hm2m(nowHM());
  const overlap=alle.filter(x=>x.datum===r.datum&&x.id!==r.id&&hm2m(x.start)!=null)
    .some(x=>hm2m(x.start)<nu&&Math.max(hm2m(x.start),hm2m(eindOf(x))||0)>hm2m(r.start));
  const mutatieWarnings=dayRuleServices.ruleWarnings({rule:r,dossiers,
    overbookings:overboekingen,isBooked:regelIsGeboekt(r)});
  if(!confirm("Deze regel weer laten lopen?\n\n"+r.start+" · "+
    ((dosOf(r.dossierId)||{}).naam||"geen dossier")+
    "\n\nDe eindtijd vervalt en de regel telt weer live door"+
    (running?".\nDe regel die nu loopt wordt afgesloten op dit moment.":".")+
    (overlap?"\n\nLet op: dit overlapt met een andere regel van vandaag.":"")+
    (mutatieWarnings.length?"\n\nDeze regel heeft een administratieve status. De status valt terug naar controleren.":"")))return;
  const dicht=running?sluitObj(running):null;
  const uit=await timerServices.reopenRule({currentTimer:running,readCurrentTimer:()=>running,
      rule:r,closedRule:dicht,rules:alle,
      dossiers,overbookings:overboekingen,runningId:running?running.id:null,
      isBooked:regelIsGeboekt(r),confirmedWarnings:true,today:today(),nowTime:nowHM(),
      bookingContext:boekRekenContext(),waitForRules:rustig,
      nowMs:Date.now(),nowIso:new Date().toISOString()});
  if(await meldTimerFout(uit,"Regel opnieuw starten is niet uitgevoerd")||
    meldDagRegelFout(uit,"Regel opnieuw starten is niet uitgevoerd"))return;
  pending=null;ntWizard=null;const nextRules=mergeById(alle,[uit.closedRule,uit.rule]);
  appState.commit({dossiers:mergeById(dossiers,uit.dossiers),rules:nextRules,
    running:nextRules.find(x=>x.id===uit.rule.id)});
  vergeetTimerUndo("timer overgezet");liveId=null;bouwDag();renderAll();announce();
  L("timer-overgezet",dosIdLog(uit.rule.dossierId)+" · sinds "+uit.rule.start);
  toast("Deze regel loopt weer sinds "+uit.rule.start);}
$("d-prev").onclick=()=>{appState.commit({viewDate:addD(viewDate,-1)});bouwDag();};
$("d-next").onclick=()=>{appState.commit({viewDate:addD(viewDate,1)});bouwDag();};
$("d-today").onclick=()=>{appState.commit({viewDate:today()});bouwDag();};
$("d-add").onclick=async()=>{
  if(!dagRuimte(viewDate,0.1,null))return;
  const r=nieuweRegel({start:nowHM(),eind:nowHM()});
  let uit;
  try{uit=await dayRuleServices.addRule({rule:r,rules:alle,dossiers,
    overbookings:overboekingen,bookingContext:boekRekenContext(),waitForRules:rustig,
    nowMs:Date.now(),nowIso:new Date().toISOString(),undoLabel:"regel toevoegen"});}
  catch(x){L("FOUT-regel-toevoegen",String(x));toast("Regel toevoegen mislukt — niets gewijzigd");return;}
  if(meldDagRegelFout(uit,"Regel toevoegen is niet uitgevoerd"))return;
  uit.dossiers.forEach(memDossier);memRegel(uit.rule);pasMutatieUndoToe(uit.undo);
  bouwDag();announce();await openRegelEditor(uit.rule.id,"dag");};
