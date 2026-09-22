"use strict";
async function bewaarBeheerDossier(next){
  const uit=await HH.services.admin.saveDossier({dossier:next});
  if(meldAdminFout(uit,"Dossierwijziging is niet opgeslagen"))return false;
  HH.state.upsert("dossiers",uit.dossier);return true;}
$("booking-corrections").addEventListener("click",async e=>{
  const copyButton=e.target.closest("[data-booking-copy]");
  if(copyButton){
    const key=copyButton.dataset.bookingCopy,split=key.lastIndexOf("|"),
      correction=bookingCorrectionMap.get(key.slice(0,split)),
      row=correction&&correction.currentOptions[Number(key.slice(split+1))],
      field=copyButton.dataset.bookingField;
    if(!row||!["targetNumber","hours","code","description"].includes(field))return;
    await kopieer(field==="hours"?uu(row.hours):String(row[field]||""),copyButton,copyButton.innerHTML);
    return;
  }
  const button=e.target.closest("[data-booking-resolve]");if(!button)return;
  const correction=bookingCorrectionMap.get(button.dataset.bookingResolve);if(!correction)return;
  if(!confirm("Bevestig dat deze wijziging of verwijdering in Intapp is gecontroleerd en afgehandeld."))return;
  const nowIso=new Date().toISOString(),uit=await HH.services.admin.resolveBookingCorrection({
    receiptId:correction.receiptId,currentKeys:correction.currentOptions.map(bookingSemanticKey),
    resolutionId:uid(),nowIso,aggregateRows:sumVanData,snapshotRow:bookingSnapshotVan,validateRules:valideerBoekData});
  if(meldAdminFout(uit,"Correctie is niet afgehandeld"))return;
  HH.state.commit({bookingHistory:uit.history});renderBeheer();announce();
  toast("Correctie afgehandeld en vastgelegd");});
$("dvn-intapp").addEventListener("click",async e=>{
  const num=e.target.closest("[data-dvn-num]");
  if(num){await kenNummerToe(num.dataset.dvnNum);return;}
  const post=e.target.closest("[data-dvn-post]");
  if(post){await openDvnPostSheet(post.dataset.dvnPost);return;}
  const finalI7=e.target.closest("[data-dvn-final-i7]");
  if(finalI7){await maakDvnDefinitiefI7(finalI7.dataset.dvnFinalI7);return;}
  const day=e.target.closest("[data-dvn-day]");
  if(day){HH.state.commit({viewDate:day.dataset.dvnDay});HH.app.showTab("dag");return;}
});
$("overboek-intapp").addEventListener("click",async e=>{
  const post=e.target.closest("[data-over-post]");if(post){openOverboekPost(post.dataset.overPost);return;}
  const ref=e.target.closest("[data-over-refresh]");if(ref){await verversOverboeking(ref.dataset.overRefresh);return;}
  const fin=e.target.closest("[data-over-final]");if(fin){await maakOverboekingDefinitiefI7(fin.dataset.overFinal);return;}
});
$("op-save").onclick=handelOverboekingenAf;$("op-cancel").onclick=sluitOverboekPost;
$("op-x").onclick=sluitOverboekPost;
$("overboekpost").addEventListener("mousedown",e=>{if(e.target.id==="overboekpost")sluitOverboekPost();});
document.addEventListener("keydown",e=>{if($("overboekpost").classList.contains("on")&&e.key==="Escape"){
  e.preventDefault();sluitOverboekPost();}},true);
$("b-list").addEventListener("change",async e=>{
  const t=e.target;
  if(t.dataset.dn){const d=dosOf(t.dataset.dn);const nr=t.value.trim();
    if(!nr){toast("Leegmaken kan niet — gebruik Nummer toekennen");t.value=d.nummer||"";return;}
    if(nummerBezet(nr,d.id)){toast("Dat dossiernummer hoort al bij een ander dossier");
      t.value=d.nummer||"";return;}
    const next=stempel(Object.assign({},d,{nummer:nr}));
    if(await bewaarBeheerDossier(next))HH.app.render();}
  if(t.dataset.dnm){const d=dosOf(t.dataset.dnm),naam=t.value.trim();
    if(d.voorlopig){if(!naam){t.value=d.naam;toast("De DVN-naam kan niet leeg zijn");return;}
      const oud=d.naam,uit=await hernoemVoorlopig(d.id,naam);if(!uit)t.value=oud;}
    else{const gewijzigd=stempel(Object.assign({},d,{naam:naam||d.naam}));
      const next=dvnPutIfPosted(gewijzigd,"dossiernaam gewijzigd")||gewijzigd;
      if(await bewaarBeheerDossier(next))HH.app.render();}}
  if(t.dataset.dl){const d=dosOf(t.dataset.dl),next=stempel(Object.assign({},d,{lang:t.value}));
    await bewaarBeheerDossier(next);}});
$("b-list").addEventListener("click",async e=>{
  const post=e.target.closest("[data-post]");if(post){openDvnPostSheet(post.dataset.post);return;}
  const finalI7=e.target.closest("[data-final-i7]");
  if(finalI7){await maakDvnDefinitiefI7(finalI7.dataset.finalI7);return;}
  const nr=e.target.closest("[data-nr]");if(nr){kenNummerToe(nr.dataset.nr);return;}
  const ua=e.target.closest("[data-unarch]");
  if(ua){const d=dosOf(ua.dataset.unarch),next=stempel(Object.assign({},d,{archief:false}));
    if(await bewaarBeheerDossier(next))HH.app.render();return;}
  const a=e.target.closest("[data-addcode]");
  if(a){const d=dosOf(a.dataset.addcode);
    const c=document.querySelector('[data-nc="'+d.id+'"]').value.trim();
    const n=document.querySelector('[data-ncn="'+d.id+'"]').value.trim();
    if(!c){toast("Vul een code in");return;}
    const next=stempel(Object.assign({},d,{codes:(d.codes||[]).concat([{code:c,naam:n||c}])}));
    if(await bewaarBeheerDossier(next))renderBeheer();return;}
  const rm=e.target.closest("[data-rmcode]");
  if(rm){const[id,code]=rm.dataset.rmcode.split("|");const d=dosOf(id);
    const next=stempel(Object.assign({},d,{codes:(d.codes||[]).filter(x=>x.code!==code)}));
    if(await bewaarBeheerDossier(next))renderBeheer();return;}
  const dd=e.target.closest("[data-deldos]");
  if(dd){const d=dosOf(dd.dataset.deldos);
    if(HH.state.read().overbookings.some(o=>overboekingOpen(o)&&o.targetDossierId===d.id)){
      toast("Rond eerst de open overboekingen naar dit dossier af");return;}
    const inGebruik=HH.state.read().rules.some(r=>r.dossierId===d.id);
    if(inGebruik){
      if(!confirm('"'+d.naam+'" heeft regels en wordt gearchiveerd in plaats van verwijderd.\nDoorgaan?'))return;
      const next=stempel(Object.assign({},d,{archief:true}));
      if(!await bewaarBeheerDossier(next))return;}
    else{if(!confirm("Dossier verwijderen?"))return;
      const uit=await HH.services.admin.deleteDossier({id:d.id});
      if(meldAdminFout(uit,"Dossier is niet verwijderd"))return;
      HH.state.remove("dossiers",uit.id);}
    HH.app.render();}});
$("b-logoms").onchange=async e=>{
  const next=e.target.checked;await HH.services.settings.save("logOms",next);logOms=next;
  /* Uitzetten wist wat er al staat: anders blijven eerder gelogde namen achter. */
  if(!logOms&&logboek.length){logboek=[];await HH.services.settings.save("log",logboek);
    $("logstat").textContent="0 regels";
    toast("Uitgebreid loggen uit — het bestaande logboek is gewist");}
  L("instelling","uitgebreid loggen: "+logOms);};
$("b-logcopy").onclick=()=>{
  const kop="hourhound logboek · "+appVer+" · "+new Date().toLocaleString("nl-NL")+
    "\n"+navigator.userAgent+"\ndossiers "+HH.state.read().dossiers.length+" · regels "+HH.state.read().rules.length+
    " · vandaag "+vandaagRegels().length+"\n"+"-".repeat(60);
  navigator.clipboard.writeText(kop+"\n"+logboek.join("\n")+"\n").then(
    ()=>toast(logboek.length+" logregels gekopieerd"),()=>toast("Kopiëren mislukt"));};
$("b-logclear").onclick=async()=>{await HH.services.settings.save("log",[]);logboek=[];
  $("logstat").textContent="0 regels";toast("Logboek leeg");};
$("b-wipe").onclick=async()=>{
  if(HH.state.read().running){toast("Sluit eerst de lopende regel af met E");return;}
  if(!confirm("Alle dossiers en tijdregels wissen? Sjablonen en werkcodes blijven staan."))return;
  if(!confirm("Zeker weten? Maak eerst een export als je iets wilt bewaren."))return;
  const uit=await HH.services.admin.clearTrackedData();
  if(meldAdminFout(uit,"Gegevens zijn niet gewist"))return;
  HH.state.commit({stack:[],dayEnds:{},dayAudit:{},booked:{},
    bookingHistory:legeBookingHistory(),overbookings:[],running:null});
  undoStack=[];
  await zorgVoorI7();await herlaad();
  L("alles-gewist","");toast("Gewist — hourhound begint schoon");};
$("b-adddos").onclick=async()=>{
  const naam=$("b-naam").value.trim();if(!naam){toast("Naam is verplicht");return;}
  const nr=$("b-nr").value.trim();
  if(nummerBezet(nr,null)){toast("Dat dossiernummer bestaat al");return;}
  try{await makeDossier(naam,nr||null,$("b-lang").value);}
  catch(error){toast("Dossier niet toegevoegd — "+String(error.message||error));return;}
  $("b-nr").value="";$("b-naam").value="";HH.app.render();toast("Dossier toegevoegd");};

function sluitBeheerFlow(){
  if(beheerUi.busy)return;
  beheerUi.group=null;beheerUi.taskKey=null;beheerUi.error="";renderBeheerWerk();
  window.scrollTo&&window.scrollTo(0,beheerUi.scroll);
}
async function bevestigBeheerTaak(){
  if(beheerUi.busy||!beheerShown)return;
  const shown=beheerShown,current=beheerWerkData().flatMap(g=>g.tasks).find(t=>t.key===shown.key);
  if(!current||beheerTaakSignature(current)!==beheerTaakSignature(shown)){
    beheerUi.error="De gegevens zijn gewijzigd. Controleer de opnieuw getoonde actie.";renderBeheerWerk();return;
  }
  if(beheerUi.line<shown.lines.length-1){beheerUi.seen.push(beheerUi.line);beheerUi.line++;renderBeheerFlow();return;}
  if(Array.from({length:Math.max(0,shown.lines.length-1)},(_,i)=>i).some(i=>!beheerUi.seen.includes(i)))return;
  beheerUi.busy=true;beheerUi.error="";renderBeheerFlow();
  try{
    if(shown.type==="inspect"){beheerUi.section="dossiers";return;}
    if(shown.type==="number"){await kenNummerToe(shown.dossierId);return;}
    if(shown.type==="overcheck"){await verversOverboeking(shown.record.id);return;}
    const nowMs=Date.now(),nowIso=new Date(nowMs).toISOString(),s=HH.state.read();let out;
    if(shown.type==="correction"){
      if(!confirm("Zijn alle getoonde wijzigingen of verwijderingen in Intapp afgehandeld?"))return;
      out=await HH.services.admin.resolveBookingCorrection({receiptId:shown.correction.receiptId,
        currentKeys:shown.correction.currentOptions.map(bookingSemanticKey),resolutionId:uid(),nowIso,
        aggregateRows:sumVanData,snapshotRow:bookingSnapshotVan,validateRules:valideerBoekData});
    }else if(shown.type==="book"){
      out=await HH.services.admin.setRegularBooking({snapshot:shown.snapshot,fingerprint:shown.fingerprint,enabled:true,
        receiptId:uid(),resolutionId:uid(),nowIso,rules:s.rules,aggregateRows:sumVanData,snapshotRow:bookingSnapshotVan,
        validateRules:valideerBoekData,waitForRules:rustig});
    }else if(shown.type==="legacy"){
      if(!confirm("Bevestig dat de bestaande Intapp-boeking volledig is gecontroleerd en gecorrigeerd; de uren zijn niet nogmaals toegevoegd."))return;
      out=await HH.services.admin.markDvnPosted({dossier:dosOf(shown.dossierId),dossiers:s.dossiers,rules:s.rules,snapshots:shown.lines,
        legacyReviewed:true,hoursOf:urenOf,nowMs,nowIso,aggregateRows:sumVanData,snapshotRow:bookingSnapshotVan,validateRules:valideerBoekData});
    }else if(shown.type==="overpost"){
      out=await HH.services.admin.completeOverbookings({ids:[shown.record.id],overbookings:[shown.record],rules:s.rules,dossiers:s.dossiers,
        summarize:sumVan,roundingMode:s.roundingMode,booked:s.booked,hoursOf:urenOf,nowIso,bookedDate:today()});
    }
    if(!out||!out.ok){beheerUi.error="Opslaan is niet gelukt. De actie blijft open. "+(out&&adminFoutTekst[out.error]||"Controleer de gegevens en probeer opnieuw.");return;}
    const delta={bookingHistory:out.history};
    if(out.booked)delta.booked=out.booked;
    if(out.dossier)delta.dossiers=mergeById(s.dossiers,[out.dossier]);
    if(out.overbookings)delta.overbookings=mergeById(s.overbookings,out.overbookings);
    HH.state.commit(delta);beheerUi.taskKey=null;beheerUi.signature="";beheerUi.seen=[];announce();boekStat();
  }catch(error){beheerUi.error="Opslaan mislukt. Er is geen bevestiging gegeven; probeer opnieuw.";}
  finally{beheerUi.busy=false;renderBeheerWerk();}
}
$("v-beheer").addEventListener("click",async e=>{
  if(e.target.closest("[data-manage-clear-scope]")){if(beheerUi.busy)return;beheerUi.scopeDate=null;renderBeheerWerk();return;}
  const section=e.target.closest("[data-manage-section]");if(section){if(beheerUi.busy)return;beheerUi.section=section.dataset.manageSection;renderBeheerWerk();return;}
  const open=e.target.closest("[data-manage-open]");if(open){
    const g=beheerGroups.find(x=>x.id===open.dataset.manageOpen);if(!g)return;
    beheerUi.group=g.id;beheerUi.dossierIds=g.dossierIds.slice();beheerUi.title=(g.number?g.number+" · ":"")+g.name;
    beheerUi.taskKey=null;beheerUi.signature="";beheerUi.error="";beheerUi.scroll=window.scrollY||0;renderBeheerWerk();return;
  }
  if(e.target.closest("[data-manage-back]")){sluitBeheerFlow();return;}
  if(beheerUi.busy)return;
  const copy=e.target.closest("[data-manage-copy]");if(copy){const s=beheerShown&&beheerShown.lines[beheerUi.line],key=copy.dataset.manageCopy;
    if(s&&["hours","targetNumber","code","description"].includes(key))await kopieer(key==="hours"?uu(s.hours):String(s[key]||""),copy,copy.innerHTML);return;}
  if(e.target.closest("[data-manage-prev]")){beheerUi.line=Math.max(0,beheerUi.line-1);renderBeheerFlow();return;}
  if(e.target.closest("[data-manage-later]")){
    const group=beheerGroups.find(g=>g.id===beheerUi.group),tasks=group?group.tasks:[],i=tasks.findIndex(t=>t.key===beheerUi.taskKey);
    if(tasks.length<2){sluitBeheerFlow();return;}
    beheerUi.taskKey=tasks[(i+1)%tasks.length].key;beheerUi.error="";renderBeheerFlow();return;
  }
  if(e.target.closest("[data-manage-final]")){
    const task=beheerShown;if(!task)return;beheerUi.busy=true;
    try{if(task.type==="number")await maakDvnDefinitiefI7(task.dossierId);else if(task.record)await maakOverboekingDefinitiefI7(task.record.id);}
    finally{beheerUi.busy=false;renderBeheerWerk();}return;
  }
  if(e.target.closest("[data-manage-confirm]"))await bevestigBeheerTaak();
});
$("v-beheer").addEventListener("input",e=>{if(e.target.id==="manage-search"){beheerUi.query=e.target.value;renderBeheerWerk();}});
$("v-beheer").addEventListener("change",e=>{
  if(beheerUi.busy)return;
  if(e.target.id==="manage-filter"){beheerUi.filter=e.target.value;renderBeheerWerk();}
  if(e.target.id==="manage-task"){beheerUi.taskKey=e.target.value;beheerUi.error="";renderBeheerFlow();}
});
HH.ui.manageKeyboard=e=>{
  if(HH.state.read().tab!=="beheer"||!beheerUi.group||beheerUi.section!=="work")return false;
  if(e.key==="Escape"){e.preventDefault();sluitBeheerFlow();}
  return true;
};

function openBeheerVoorDag(datum,row){
  beheerUi.section="work";beheerUi.scopeDate=datum;beheerUi.query="";beheerUi.filter="open";
  beheerUi.group=null;beheerUi.taskKey=null;beheerUi.signature="";beheerUi.error="";
  $("manage-search").value="";$("manage-filter").value="open";
  HH.app.showTab("beheer");renderBeheerWerk();
  const ids=row?new Set(bookingBronIds(row)):null;
  const groups=beheerGroups.filter(g=>g.tasks.some(t=>t.type==="correction"&&(!ids||
    (t.correction.beforeSnapshots||[t.correction.before]).concat(t.correction.currentOptions).some(s=>bookingBronIds(s).some(id=>ids.has(id))))));
  if(groups.length===1){const g=groups[0];beheerUi.group=g.id;beheerUi.dossierIds=g.dossierIds.slice();
    beheerUi.taskKey=g.tasks.find(t=>t.type==="correction"&&(!ids||(t.correction.beforeSnapshots||[t.correction.before]).concat(t.correction.currentOptions).some(s=>bookingBronIds(s).some(id=>ids.has(id))))).key;
    renderBeheerWerk();}
}
