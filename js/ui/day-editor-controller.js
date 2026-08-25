"use strict";
/* ---------- bewuste regelbewerking en oude lopende timer ---------- */
const isModalOpen=()=>HH.ui.modals.anyOpen();
function voorstelOudeTimerEind(r){
  const na=HH.state.read().rules.filter(x=>x.datum===r.datum&&x.id!==r.id&&hm2m(x.start)!=null&&
      hm2m(x.start)>hm2m(r.start)).sort((a,b)=>hm2m(a.start)-hm2m(b.start))[0];
  if(na)return na.start;
  const s=hm2m(r.start),e17=hm2m("17:00");
  if(s!=null&&s<e17)return "17:00";
  return r.start;}
function regelBoekRow(r){
  return sumVan(HH.state.selectors.day(r.datum)).find(x=>
    x.bron&&x.bron.some(b=>b.id===r.id))||null;}
function regelBoekFingerprint(r){const hit=regelBoekRow(r);return hit?hit.fp:null;}
function regelIsGeboekt(r){const hit=regelBoekRow(r);return !!(hit&&
  ((HH.state.read().booked[r.datum]||[]).indexOf(hit.fp)>=0||overboekingAfgerondVoorRow(hit,r.datum)));}
function opdrachtUitDossierTekst(v,huidigId){
  const txt=(v||"").trim(),h=dosOf(huidigId);
  if(!txt)return{dossierId:null,code:null};
  if(h&&(txt===dosVeld(h)||txt===h.naam||txt===(h.nummer||"")))return{};
  const lo=txt.toLowerCase();
  const hit=actief().find(x=>(x.nummer||"").toLowerCase()===lo||x.naam.toLowerCase()===lo||
    ((x.nummer||"")+" - "+x.naam).toLowerCase()===lo);
  if(hit)return{dossierId:hit.id,telUsed:false};
  const pd=splitsDossier(txt);
  if(pd&&!nummerBezet(pd.nummer,null))
    return{nieuwDossier:{naam:pd.naam,nummer:pd.nummer,lang:"nl"},telUsed:false};
  return{fout:'"'+kort(txt,28)+'" is geen bestaand dossier. Gebruik exact nummer, naam of "nummer - naam".'};}
function normaliseerCodeVoorOpslag(d,r,txt){
  const v=(txt||"").trim();
  if(!d)return v?{fout:"Kies eerst een dossier voordat je een werkcode invult"}:{code:null};
  if(d.voorlopig||dvnDefinitiefI7(d)){const vast=defaultCode(d);return vast?{code:vast}:{fout:"Werkcode Commercieel ontbreekt in de i7-werklijst"};}
  if(isIndirect(d)){
    if(!v)return{fout:"Een i7-regel moet een werkcode uit de vaste lijst hebben"};
    const hit=codesFor(d).find(c=>c.code.toLowerCase()===v.toLowerCase()||
      (c.naam||"").toLowerCase()===v.toLowerCase());
    return hit?{code:hit.code}:{fout:'"'+kort(v,28)+'" staat niet in de vaste i7-werklijst'};}
  if(!v)return{code:null};
  const hit=codesFor(d).find(c=>c.code.toLowerCase()===v.toLowerCase()||
    (c.naam||"").toLowerCase()===v.toLowerCase());
  return hit?{code:hit.code}:{code:v,nieuweCode:v};}
function openRegelEditor(id,bron){
  const r=HH.state.read().rules.find(x=>x.id===id);if(!r)return Promise.resolve(false);
  const dlg=$("editregel");if(!dlg)return Promise.resolve(false);
  const d=dosOf(r.dossierId),loopt=HH.state.read().running&&HH.state.read().running.id===r.id;
  $("er-date").textContent=dagLabel(r.datum);
  $("er-start").value=r.start||"";
  $("er-eind").value=loopt?"":(r.eind||"");
  $("er-eind").placeholder=loopt?"loopt":"";
  $("er-dossier").value=dosVeld(d);
  $("er-code").value=codeNaam(d,r.code);
  $("er-oms").value=r.omschrijving||"";
  $("er-uren").value=loopt?"":uu(urenOf(r));
  $("er-uren").disabled=!!loopt;
  const waars=[];
  if(loopt)waars.push("Deze regel is de lopende timer. Een eindtijd invullen stopt hem bewust op die tijd.");
  if(r.autoAanvul)waars.push("Dit is een automatische Diversen-aanvulregel. Aanpassen kan de dagafsluiting veranderen.");
  if(d&&isDvn(d)&&dvnIntappState(d)==="posted")
    waars.push("Deze regel hoort bij een DVN die als ingevoerd in Intapp is gemarkeerd. Opslaan zet die DVN terug naar controle nodig.");
  if(regelIsGeboekt(r))waars.push("Deze regel hoort bij een Intapp-regel die als geboekt is gemarkeerd. Door wijzigen valt die boekstatus automatisch terug naar controle nodig.");
  if(overboekingOpenVoorRegel(r.id))waars.push("Deze regel staat geparkeerd voor latere dossierboeking. Wijzigen zet de overboeking op Gewijzigd — controleren.");
  if(bron==="oldrun")waars.push("Deze taak is op een eerdere datum gestart. Kies expliciet een eindtijd als hij niet werkelijk moet doorlopen.");
  $("er-warn").innerHTML=waars.map(esc).join("<br>");
  $("er-warn").classList.toggle("on",waars.length>0);
  dlg.classList.add("on");dlg.setAttribute("aria-hidden","false");
  setTimeout(()=>$("er-start").focus(),0);
  return new Promise(resolve=>{
    const sluit=v=>{dlg.classList.remove("on");dlg.setAttribute("aria-hidden","true");
      document.removeEventListener("keydown",key,true);resolve(v);};
    const key=e=>{if(!dlg.classList.contains("on"))return;
      if(e.key==="Escape"){e.preventDefault();sluit(false);}
      if(e.key==="Enter"&&e.target&&e.target.tagName==="INPUT"){e.preventDefault();$("er-save").click();}};
    document.addEventListener("keydown",key,true);
    $("er-x").onclick=()=>sluit(false);$("er-cancel").onclick=()=>sluit(false);
    $("er-save").onclick=async()=>{
      const cur=HH.state.read().rules.find(x=>x.id===id);if(!cur){toast("Regel bestaat niet meer");sluit(false);return;}
      const voor=kopie1(cur),looptNu=HH.state.read().running&&HH.state.read().running.id===cur.id;
      const start=$("er-start").value.trim(),eind=$("er-eind").value.trim();
      const sm=hm2m(start),em=eind?hm2m(eind):null;
      if(sm==null){toast("Ongeldige starttijd");$("er-start").focus();return;}
      if(eind&&em==null){toast("Ongeldige eindtijd");$("er-eind").focus();return;}
      if(eind&&em<sm){toast("Eindtijd ligt vóór de starttijd");$("er-eind").focus();return;}
      if(!eind&&!looptNu){toast("Een opgeslagen regel moet een eindtijd hebben. Gebruik ▶ om hem lopend te maken.");$("er-eind").focus();return;}
      if(looptNu&&sm>hm2m(nowHM())){toast("De starttijd van een lopende regel kan niet in de toekomst liggen");return;}
      const op=opdrachtUitDossierTekst($("er-dossier").value,cur.dossierId);
      if(op.fout){toast(op.fout);$("er-dossier").focus();return;}
      let tmpD=null,tmpRule=Object.assign({},cur);
      if(op.nieuwDossier)tmpD=bouwDossier(op.nieuwDossier);
      else if(op.dossierId!==undefined)tmpD=op.dossierId?dosOf(op.dossierId):null;
      else tmpD=dosOf(cur.dossierId);
      if(op.dossierId!==undefined||op.nieuwDossier)tmpRule.dossierId=tmpD?tmpD.id:null;
      const c=normaliseerCodeVoorOpslag(tmpD,tmpRule,$("er-code").value);
      if(c.fout){toast(c.fout);$("er-code").focus();return;}
      tmpRule.code=c.code;
      tmpRule.start=m2hm(sm);
      tmpRule.omschrijving=prefixVoor(tmpD,tmpRule.datum,$("er-oms").value||"");
      if(eind){tmpRule.eind=m2hm(em);tmpRule.urenHand=false;tmpRule.uren=Math.ceil(Math.max(1,em-sm)/6)/10;}
      if(!looptNu){
        const uv=$("er-uren").value.trim();
        if(uv){const n=Number(uv.replace(",","."));
          if(!isFinite(n)||n<=0||n>DAGMAX){toast("Ongeldig aantal uren");$("er-uren").focus();return;}
          tmpRule.uren=Math.max(0.1,Math.round(n*10)/10);tmpRule.urenHand=true;}
        else tmpRule.urenHand=false;}
      if(!dagRuimte(tmpRule.datum,urenOf(tmpRule),tmpRule.id))return;
      const mutatieWarnings=HH.services.dayRules.ruleWarnings({rule:cur,
        dossiers:HH.state.read().dossiers,
        overbookings:HH.state.read().overbookings,isBooked:regelIsGeboekt(cur)});
      if(mutatieWarnings.length&&
        !confirm("Je wijzigt een bestaande tijdregel met administratieve status.\n\nDoorgaan en bewust opslaan?"))return;
      if(c.nieuweCode&&tmpD&&!isIndirect(tmpD)&&!(tmpD.codes||[]).some(x=>x.code===c.nieuweCode)){
        tmpD=Object.assign({},tmpD,{codes:(tmpD.codes||[]).concat([{code:c.nieuweCode,naam:c.nieuweCode}])});stempel(tmpD);}
      const schrijf=async()=>{
        const uit=await HH.services.timer.editRule({currentTimer:HH.state.read().running,readCurrentTimer:()=>HH.state.read().running,
          before:voor,rule:tmpRule,rules:HH.state.read().rules,
          dossiers:HH.state.read().dossiers,overbookings:HH.state.read().overbookings,
          dossierWrites:tmpD?[tmpD]:[],
          runningId:looptNu?cur.id:null,isBooked:regelIsGeboekt(cur),confirmedWarnings:true,
          bookingContext:boekRekenContext(),waitForRules:rustig,nowTime:nowHM(),
          nowMs:Date.now(),nowIso:new Date().toISOString()});
        if(await meldTimerFout(uit,"Opslaan is niet uitgevoerd")||
          meldDagRegelFout(uit,"Opslaan is niet uitgevoerd"))return false;
        const delta={dossiers:mergeById(HH.state.read().dossiers,uit.dossiers),
          rules:mergeById(HH.state.read().rules,[uit.rule])};tmpRule=uit.rule;
        if(uit.closedRunning){delta.running=null;pending=null;
          vergeetTimerUndo("regel gestopt via bewerksheet");}
        else if(looptNu){delta.running=delta.rules.find(x=>x.id===uit.rule.id);liveId=null;}
        HH.state.commit(delta);
        pasMutatieUndoToe(uit.undo);
        return true;};
      try{
        if(!await schrijf())return;
      }catch(e){L("FOUT-regel-editor",String(e));toast("Opslaan mislukt — niets gewijzigd: "+e);return;}
      L("regel-editor",tmpRule.start+"-"+(tmpRule.eind||"loopt")+" · "+dosIdLog(tmpRule.dossierId));
      HH.state.commit({viewDate:tmpRule.datum});
      HH.app.render(["day","live","recent","totals"]);announce();
      toast("Tijdregel opgeslagen");sluit(true);};});}
function controleerOudeLopendeTaak(){
  if(!HH.state.read().running||HH.state.read().running.datum>=today()||HH.services.timer.isBlocked()||
    Date.now()<oldRunSnooze||isModalOpen())return;
  const dlg=$("oldrun");if(!dlg)return;
  const r=HH.state.read().running,d=dosOf(r.dossierId),tekst=(r.omschrijving||"geen omschrijving");
  $("xr-date").textContent=dagLabel(r.datum);
  $("xr-text").innerHTML="Deze taak loopt nog sinds "+esc(dagLabel(r.datum))+" om "+
    esc(r.start)+". Laat hem alleen doorlopen als dit echt dezelfde werksessie is.";
  $("xr-meta").innerHTML="<b>"+esc(d?dosVeld(d):"geen dossier")+"</b><br>"+
    esc(codeNaam(d,r.code)||"geen werkcode")+"<br>"+esc(tekst);
  $("xr-end").value=voorstelOudeTimerEind(r);
  dlg.classList.add("on");dlg.setAttribute("aria-hidden","false");
  setTimeout(()=>$("xr-end").focus(),0);
}
