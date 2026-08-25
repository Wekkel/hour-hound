"use strict";
async function bewaarBeheerDossier(next){
  const uit=await HH.services.admin.saveDossier({dossier:next});
  if(meldAdminFout(uit,"Dossierwijziging is niet opgeslagen"))return false;
  HH.state.upsert("dossiers",uit.dossier);return true;}
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
  HH.state.commit({stack:[],dayEnds:{},dayAudit:{},booked:{},overbookings:[],running:null});
  undoStack=[];
  await zorgVoorI7();await herlaad();
  L("alles-gewist","");toast("Gewist — hourhound begint schoon");};
$("b-adddos").onclick=async()=>{
  const naam=$("b-naam").value.trim();if(!naam){toast("Naam is verplicht");return;}
  const nr=$("b-nr").value.trim();
  if(nummerBezet(nr,null)){toast("Dat dossiernummer bestaat al");return;}
  await makeDossier(naam,nr||null,$("b-lang").value);
  $("b-nr").value="";$("b-naam").value="";HH.app.render();toast("Dossier toegevoegd");};
