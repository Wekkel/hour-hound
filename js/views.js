"use strict";
/* ---------- weergave: NU ---------- */
function renderLive(){
  /* Een wizard hoort altijd bij precies de regel die op dit moment loopt. Iedere
     andere timeractie maakt de wizard daardoor vanzelf ongeldig. */
  if(ntWizard&&(!running||ntWizard.id!==running.id))ntWizard=null;
  const d=running?dosOf(running.dossierId):null;
  $("live").className="live"+(running?" "+running.soort:"");
  document.body.dataset.run=running?running.soort:"";
  $("l-fields").style.display=running&&running.soort!=="pauze"&&!ntWizard?"grid":"none";
  $("b-back").style.display=stack.length&&!ntWizard?"":"none";
  $("b-dvn-rename").style.display=running&&d&&d.voorlopig&&!ntWizard?"":"none";
  if(stack.length)$("b-back").innerHTML="Terug naar "+
    esc(((dosOf(stack[stack.length-1].dossierId)||{}).naam||"vorige taak"))+" <kbd>R</kbd>";

  if(!running){
    $("l-who").className="who idle";$("l-who").textContent="Er loopt niets";
    $("l-uren").textContent="";
    $("l-run").innerHTML="Druk <b>N</b> of kies hieronder waar je mee begint";
    liveId=null;hideWake();ntRender();return;}

  $("l-who").className="who";
  $("l-who").textContent=running.soort==="werk"?(d?d.naam:"Nieuwe taak"):
    running.soort==="pauze"?"Pauze":(running.soort==="telefoon"?"Telefoon":"Onderbreking");
  const mins=Math.max(0,(hm2m(eindOf(running))||0)-(hm2m(running.start)||0));
  $("l-uren").textContent=running.soort==="pauze"?"":uu(urenOf(running));
  $("l-run").innerHTML="loopt sinds "+running.start+" · "+mins+" min"+
    (running.datum!==today()?" · op "+dmy(running.datum)+" (niet doortellen naar vandaag)":"")+
    (d&&d.voorlopig?" · dossier volgt nog":"")+(d&&d.lang==="en"?" · EN":"")+
    (ntWizard?" · gegevens worden nu ingevuld":"");

  const stempel=running.id+"|"+(running.gewijzigd||0);
  if(liveId!==stempel){liveId=stempel;
    if(document.activeElement!==$("l-dossier"))$("l-dossier").value=d?dosVeld(d):"";
    if(document.activeElement!==$("l-code"))$("l-code").value=codeNaam(d,running.code);
    if(document.activeElement!==$("l-omschr"))$("l-omschr").value=running.omschrijving||"";}
  $("l-code").classList.toggle("miss",isIndirect(d)&&!running.code);

  /* Alleen buiten de NT-wizard mag het gewone live-veld automatisch de verplichte
     i7-keuzelijst opeisen. Tijdens de wizard beheert die zelf de focus. */
  if(running.code)codeGevraagd=null;
  else if(!ntWizard&&isIndirect(d)&&!d.voorlopig&&codeGevraagd!==running.id)eisCode();

  $("l-code").readOnly=!!(d&&(d.voorlopig||dvnDefinitiefI7(d)));
  $("l-code").placeholder=isIndirect(d)&&!d.voorlopig?"verplicht":"—";
  $("l-code").title=d&&(d.voorlopig||dvnDefinitiefI7(d))?
    "Deze tijd boekt altijd op "+codeNaam(d,defaultCode(d)):
    (isIndirect(d)?"Een i7-regel moet een werkcode hebben":"");
  hideWake();ntRender();}
function dagRegels(datum){return alle.filter(r=>r.datum===datum);} 
function dagIntappTotaal(datum){return simIntappTotaal(dagRegels(datum));}
function openWerkdagen(){
  const nu=today(),map={};
  alle.forEach(r=>{if(r.datum<nu&&werkdag(r.datum)&&dagSluitStatus(r.datum).open&&r.soort!=="pauze")map[r.datum]=true;});
  return Object.keys(map).sort((a,b)=>b.localeCompare(a));}
function renderOpenDagen(){
  const box=$("open-days");if(!box)return;
  const dagen=Date.now()<openDagenSnooze?[]:openWerkdagen();
  if(!dagen.length){box.classList.remove("on");box.innerHTML="";return;}
  const d=dagen[0],n=dagRegels(d).filter(r=>r.soort!=="pauze").length;
  box.innerHTML='<span><strong>Nog niet afgesloten:</strong> '+esc(dagLabel(d))+', '+
    n+' regel'+(n===1?'':'s')+' en '+uu(dagIntappTotaal(d))+
    ' uur in de Intapp-samenvatting'+(dagen.length>1?' · '+(dagen.length-1)+' oudere dag(en) daarna':'')+'</span>'+ 
    '<div class="spacer"></div>'+ 
    '<button class="sm" data-open-view="'+esc(d)+'">Bekijk</button>'+ 
    '<button class="sm go" data-open-close="'+esc(d)+'">Sluit '+esc(kortDag(d))+'</button>'+ 
    '<button class="sm ghost" data-open-later="1">Later</button>';
  box.classList.add("on");}
function voorstelDagEinde(datum){
  const list=dagRegels(datum),mins=list.map(r=>hm2m(eindOf(r))||hm2m(r.start)||0);
  let m=mins.length?Math.max(...mins):null;
  if(datum<today())m=Math.max(m||0,17*60);
  if(datum===today())m=hm2m(nowHM())||m||17*60;
  return m2hm(m==null?17*60:m);}
function dagTekort(datum){return werkdag(datum)?autoAanvulTekort(dagIntappTotaal(datum)):0;}
function auditDag(datum,type,extra){
  const bestaand=dagAudit&&dagAudit[datum]&&Array.isArray(dagAudit[datum].events)?
    dagAudit[datum].events.slice():[];
  bestaand.push(Object.assign({type:type,t:new Date().toISOString()},extra||{}));
  return{events:bestaand.slice(-20)};}
function auditSamenvatting(datum){
  const a=dagAudit&&dagAudit[datum];
  const ev=a&&Array.isArray(a.events)?a.events:[];
  if(!ev.length)return"";
  return ev.slice(-3).map(e=>{
    const t=e.t?new Date(e.t).toLocaleString("nl-NL",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
    if(e.type==="gesloten")return "Afgesloten"+(e.eind?" om "+e.eind:"")+(t?" ("+t+")":"");
    if(e.type==="aangevuld")return "Automatisch aangevuld: "+uu(e.uren||0)+" u"+(e.regels?" in "+e.regels+" regel(s)":"");
    if(e.type==="heropend")return "Heropend"+(e.autoVerwijderd?"; "+e.autoVerwijderd+" automatische regel(s) verwijderd":"");
    return e.type||"audit";
  }).join(" · " );}
function autoAanvulRegels(datum){return dagRegels(datum).filter(r=>r.autoAanvul);}
function dagAfsluitWaarschuwing(datum,tekort){
  if(!werkdag(datum))return[];
  const oud=datum!==today(),openOud=datum===today()?openWerkdagen():[];
  const p=[];
  if(oud)p.push("Dit is een eerdere dag, niet vandaag. Controleer de eindtijd voordat je afsluit.");
  if(!oud&&openOud.length)p.push("Er "+(openOud.length===1?"staat":"staan")+" nog "+openOud.length+
    " eerdere open werkdag"+(openOud.length===1?"":"en")+", te beginnen met "+dmy(openOud[0])+
    ". Je sluit nu vandaag af.");
  if(tekort>=7.95)p.push("Je staat op het punt vrijwel een hele werkdag als Diversen te kunnen aanvullen.");
  else if(tekort>3.0)p.push("Er ontbreekt meer dan 3 uur. Gebruik aanvullen alleen als dit echt algemene i7-tijd was.");
  else if(tekort>1.0)p.push("Er ontbreekt meer dan 1 uur. Controleer of je geen inhoudelijke taakregels mist.");
  return p;}
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
  dlg.classList.add("on");dlg.setAttribute("aria-hidden","false");
  setTimeout(()=>$("dc-end").focus(),0);
  return new Promise(resolve=>{
    const done=v=>{dlg.classList.remove("on");dlg.setAttribute("aria-hidden","true");
      document.removeEventListener("keydown",key,true);resolve(v);};
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
  if(opBlok){toast("Rond eerst het herstelvenster af");return false;}
  const ds=dagSluitStatus(datum);
  if(ds.gesloten){toast("Deze werkdag is al afgesloten om "+ds.eind);return false;}
  const list=dagRegels(datum);
  if(!list.length){toast("Geen regels op "+dmy(datum));return false;}
  const keuze=await dagAfsluitKeuze(datum);
  if(!keuze)return false;
  if(keuze.actie==="day"){
    viewDate=datum;refreshDay();showTab("dag");renderOpenDagen();return false;}
  const eind=keuze.eind.trim();
  if(hm2m(eind)==null){toast("Ongeldige eindtijd");return false;}
  const klaar=await timerOp("einde werkdag",async t=>{
    if(!opGeldig(t,running?running.id:null))return false;
    const wasRunning=running&&running.datum===datum;
    const dicht=wasRunning?sluitObj(running,eind):null;
    const uit=await dayRuleServices.closeDay({date:datum,end,closedRule:dicht,
      runningId:wasRunning?running.id:null,rules:alle,dossiers,overbookings:overboekingen,
      dayEnds:dagEinde,dayAudit,stack,totalBefore:dagIntappTotaal(datum),
      bookingContext:boekRekenContext(),waitForRules:rustig,
      nowMs:Date.now(),nowIso:new Date().toISOString()});
    if(meldDagRegelFout(uit,"Werkdag afsluiten is niet uitgevoerd"))return false;
    uit.dossiers.forEach(memDossier);if(uit.closedRule)memRegel(uit.closedRule);
    if(wasRunning){pending=null;running=null;stack=[];vergeetTimerUndo("einde werkdag");liveId=null;}
    dagEinde=uit.dayEnds;dagAudit=uit.dayAudit;viewDate=datum;refreshDay();showTab("dag");renderAll();announce();
    return true;});
  if(!klaar)return false;
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



/* ---------- bewuste regelbewerking en oude lopende timer ---------- */
const isModalOpen=()=>["dayclose","oldrun","editregel","dvnnum","dvnpost","boek",
  "parkboek","overboekpost","herstel"].some(id=>{
  const el=$(id);return el&&el.classList.contains("on");});
function voorstelOudeTimerEind(r){
  const na=alle.filter(x=>x.datum===r.datum&&x.id!==r.id&&hm2m(x.start)!=null&&
      hm2m(x.start)>hm2m(r.start)).sort((a,b)=>hm2m(a.start)-hm2m(b.start))[0];
  if(na)return na.start;
  const s=hm2m(r.start),e17=hm2m("17:00");
  if(s!=null&&s<e17)return "17:00";
  return r.start;}
function regelBoekRow(r){
  const oude=viewDate,oudeRegels=regels;
  viewDate=r.datum;regels=alle.filter(x=>x.datum===r.datum)
    .sort((a,b)=>(hm2m(a.start)||0)-(hm2m(b.start)||0));
  const hit=sumRows().find(x=>x.bron&&x.bron.some(b=>b.id===r.id));
  viewDate=oude;regels=oudeRegels;
  return hit||null;}
function regelBoekFingerprint(r){const hit=regelBoekRow(r);return hit?hit.fp:null;}
function regelIsGeboekt(r){const hit=regelBoekRow(r);return !!(hit&&
  ((geboekt[r.datum]||[]).indexOf(hit.fp)>=0||overboekingAfgerondVoorRow(hit,r.datum)));}
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
  const r=alle.find(x=>x.id===id);if(!r)return Promise.resolve(false);
  const dlg=$("editregel");if(!dlg)return Promise.resolve(false);
  const d=dosOf(r.dossierId),loopt=running&&running.id===r.id;
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
      const cur=alle.find(x=>x.id===id);if(!cur){toast("Regel bestaat niet meer");sluit(false);return;}
      const voor=kopie1(cur),looptNu=running&&running.id===cur.id;
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
      const mutatieWarnings=dayRuleServices.ruleWarnings({rule:cur,dossiers,
        overbookings:overboekingen,isBooked:regelIsGeboekt(cur)});
      if(mutatieWarnings.length&&
        !confirm("Je wijzigt een bestaande tijdregel met administratieve status.\n\nDoorgaan en bewust opslaan?"))return;
      if(c.nieuweCode&&tmpD&&!isIndirect(tmpD)&&!(tmpD.codes||[]).some(x=>x.code===c.nieuweCode)){
        tmpD=Object.assign({},tmpD,{codes:(tmpD.codes||[]).concat([{code:c.nieuweCode,naam:c.nieuweCode}])});stempel(tmpD);}
      const schrijf=async()=>{
        const uit=await dayRuleServices.editRule({before:voor,rule:tmpRule,rules:alle,
          dossiers,overbookings:overboekingen,dossierWrites:tmpD?[tmpD]:[],
          runningId:looptNu?cur.id:null,isBooked:regelIsGeboekt(cur),confirmedWarnings:true,
          bookingContext:boekRekenContext(),waitForRules:rustig,nowTime:nowHM(),
          nowMs:Date.now(),nowIso:new Date().toISOString()});
        if(meldDagRegelFout(uit,"Opslaan is niet uitgevoerd"))return false;
        uit.dossiers.forEach(memDossier);memRegel(uit.rule);tmpRule=uit.rule;
        if(uit.closedRunning){running=null;pending=null;
          vergeetTimerUndo("regel gestopt via bewerksheet");}
        else if(looptNu){running=alle.find(x=>x.id===uit.rule.id);liveId=null;}
        pasMutatieUndoToe(uit.undo);
        return true;};
      try{
        if(looptNu){
          const ok=await timerOp("bewerk lopende regel",async t=>{
            if(!opGeldig(t,id)){toast("De timer is inmiddels gewijzigd");return false;}
            return await schrijf();});
          if(!ok)return;
        }else if(!await schrijf())return;
      }catch(e){L("FOUT-regel-editor",String(e));toast("Opslaan mislukt — niets gewijzigd: "+e);return;}
      L("regel-editor",tmpRule.start+"-"+(tmpRule.eind||"loopt")+" · "+dosIdLog(tmpRule.dossierId));
      viewDate=tmpRule.datum;refreshDay();bouwDag();renderAll();announce();
      toast("Tijdregel opgeslagen");sluit(true);};});}
function controleerOudeLopendeTaak(){
  if(!running||running.datum>=today()||opBlok||Date.now()<oldRunSnooze||isModalOpen())return;
  const dlg=$("oldrun");if(!dlg)return;
  const r=running,d=dosOf(r.dossierId),tekst=(r.omschrijving||"geen omschrijving");
  $("xr-date").textContent=dagLabel(r.datum);
  $("xr-text").innerHTML="Deze taak loopt nog sinds "+esc(dagLabel(r.datum))+" om "+
    esc(r.start)+". Laat hem alleen doorlopen als dit echt dezelfde werksessie is.";
  $("xr-meta").innerHTML="<b>"+esc(d?dosVeld(d):"geen dossier")+"</b><br>"+
    esc(codeNaam(d,r.code)||"geen werkcode")+"<br>"+esc(tekst);
  $("xr-end").value=voorstelOudeTimerEind(r);
  dlg.classList.add("on");dlg.setAttribute("aria-hidden","false");
  setTimeout(()=>$("xr-end").focus(),0);
}

function renderRecent(){
  const recent=$("recent"),oudeScroll=recent.scrollTop;
  const tk=takenVandaag().filter(t=>!running||t.k!==taakKey(running));
  recent.innerHTML=tk.length?tk.map((t,i)=>{
    const d=dosOf(t.dossierId);
    return '<button class="taak" data-taak="'+esc(t.k)+'">'+
      '<span class="r1"><i style="background:'+dosColor(d)+'"></i>'+
      '<span class="dn">'+esc(taakLabel(t))+"</span>"+
      (t.code?'<span class="cd">'+esc(codeNaam(d,t.code))+"</span>":"")+
      '<span class="sp"></span><span class="ur">'+uu(t.u)+"</span>"+
      (i<4?"<kbd>"+(i+1)+"</kbd>":"")+"</span>"+
      '<span class="r2">'+esc(t.oms||"geen omschrijving")+"</span></button>";}).join(""):
    '<div class="hint">Nog niets vandaag — druk N om te beginnen.</div>';
  /* Alle taken van vandaag blijven beschikbaar. De viewport wordt pas begrensd als
     er meer dan vier zijn. We meten de natuurlijke hoogte van de eerste vier regels,
     zodat ook langere omschrijvingen volledig zichtbaar blijven. */
  recent.style.maxHeight="";
  recent.classList.toggle("recent-scroll",tk.length>4);
  /* Een Beheer-mutatie rendert alle globale samenvattingen terwijl Nu verborgen kan
     zijn. getBoundingClientRect() levert dan nul op; schrijf die nul nooit als
     max-height weg. showTab("nu") meet opnieuw zodra de lijst zichtbaar is. */
  const meetbaar=$("v-nu").classList.contains("on");
  if(tk.length>4&&meetbaar){
    const vierde=recent.querySelectorAll("button.taak")[3];
    const onder=parseFloat(getComputedStyle(vierde).marginBottom)||0;
    const h=Math.ceil(vierde.getBoundingClientRect().bottom-
      recent.getBoundingClientRect().top+onder);
    recent.style.maxHeight=h+"px";
    recent.scrollTop=Math.max(0,Math.min(oudeScroll,recent.scrollHeight-recent.clientHeight));}
  else if(tk.length<=4)recent.scrollTop=0;
  $("i7row").innerHTML=favCodes().map((c,i)=>'<button data-i7="'+esc(c.code)+'">'+
    '<i style="background:var(--soft)"></i><span>'+esc(c.naam)+"</span>"+
    (i<5?"<kbd>"+(i+5)+"</kbd>":"")+"</button>").join("")||
    '<div class="hint">Importeer werkcodes.json onder Beheer.</div>';}
const taakKey=r=>(r.dossierId||"-")+"|"+(r.code||"")+"|"+(r.omschrijving||"");
async function hervat(k){
  const t=takenVandaag().find(x=>x.k===k);if(!t)return;
  L("hervat",dosIdLog(t.dossierId)+" · "+uu(t.u)+" u tot nu");
  /* urenHand wordt bewust niet overgenomen: de nieuwe regel telt live door. */
  await kiesTaak({dossierId:t.dossierId,code:t.code,omschrijving:t.oms});
  naStart();
  toast("Verder op "+taakLabel(t));}
function renderTot(){
  const v=vandaagRegels(),t=totaal(v),g=gapHours(gapsFor(v,today()));
  $("t-uren").textContent=uu(t);$("t-void").textContent=uu(g);
  $("t-regels").textContent=v.filter(r=>r.soort!=="pauze").length;
  const b=nuBreakdown(v);
  $("t-breakdown").textContent="Declarabel "+uu(b.declarabel)+" · i7 "+uu(b.i7)+
    " (DVN "+uu(b.dvn)+")";
  $("t-voidwrap").className=g>0?"isbad":"";
  const isWerkdag=werkdag(today());
  $("t-progress").style.display=isWerkdag?"":"none";
  $("t-norm-label").textContent=isWerkdag?"van 8,0 verantwoord":"uur verantwoord · weekend";
  const pct=isWerkdag?Math.max(0,Math.min(1,t/NORM)):0;
  $("hond").style.left="calc("+(pct*100).toFixed(1)+"% - "+(pct*86).toFixed(0)+"px)";}

function renderDagStatus(){
  const el=$("d-status");if(!el)return;
  const isWerkdag=werkdag(viewDate);
  const huidig=dagIntappTotaal(viewDate),tekort=dagTekort(viewDate),ds=dagSluitStatus(viewDate),gesloten=ds.gesloten;
  const oudOpen=isWerkdag&&viewDate<today()&&!gesloten&&dagRegels(viewDate).some(r=>r.soort!=="pauze");
  const loopt=running&&running.datum===viewDate;
  const cls=gesloten?"closed":"open";
  el.className="daystatus "+cls;
  const status=!isWerkdag?(gesloten?("Weekenddag · afgesloten om "+ds.eind):"Weekenddag"):
    (gesloten?("Afgesloten om "+ds.eind):(ds.heropend?"Heropende werkdag":(oudOpen?"Open eerdere werkdag":"Open werkdag")));
  let h='<span class="main">Status: '+esc(status)+'</span>'+ 
    (isWerkdag?'<span>Verantwoord <b class="metric">'+uu(huidig)+'</b> / '+uu(NORM)+' u</span>'+ 
      '<span>Nog nodig <b class="metric">'+uu(tekort)+'</b> u</span>':
      '<span>Verantwoord <b class="metric">'+uu(huidig)+'</b> u · geen 8,0-uursnorm</span>');
  const autos=autoAanvulRegels(viewDate),audit=auditSamenvatting(viewDate);
  if(autos.length)h+='<span class="warnline">Automatische Diversen-regels: '+autos.length+'</span>';
  if(audit)h+='<span class="auditline">'+esc(audit)+'</span>';
  if(loopt)h+='<span class="warnline">Er loopt nog een regel op deze dag.</span>';
  if(oudOpen)h+='<span class="warnline">Deze dag staat nog open.</span>';
  h+='<div class="spacer"></div>';
  if(!gesloten){
    if(isWerkdag)h+='<button class="sm go" data-close-current="1">Sluit deze dag af</button>';
  }else{
    h+='<button class="sm ghost" data-reopen-current="1">Heropen dag</button>';
    if(tekort>0.05&&!(running&&running.datum===viewDate))h+='<button class="sm" data-fill-current="1">Aanvullen tot 8,0</button>';
  }
  el.innerHTML=h;}

/* ---------- weergave: DAG ---------- */
function bouwDag(){
  $("d-label").textContent=dagLabel(viewDate)+
    (dagSluitStatus(viewDate).gesloten?" · afgesloten om "+dagSluitStatus(viewDate).eind:"");
  const gaps=gapsFor(regels,viewDate),rows=[];
  regels.forEach(r=>rows.push({t:"r",r,k:hm2m(r.start)||0}));
  gaps.forEach(g=>rows.push({t:"g",g,k:g[0]}));
  rows.sort((a,b)=>a.k-b.k);
  let h='<thead><tr><th>Van</th><th>Tot</th><th>Dossier</th><th>Werkcode</th>'+
    '<th>Omschrijving</th><th style="text-align:right">Uren</th><th></th></tr></thead><tbody>';
  rows.forEach(row=>{
    if(row.t==="g"){
      h+='<tr class="void"><td class="t mono">'+m2hm(row.g[0])+'</td><td class="t mono">'+
        m2hm(row.g[1])+'</td><td colspan="3">niet verantwoord</td>'+
        '<td class="mono" style="text-align:right">'+uu(Math.ceil((row.g[1]-row.g[0])/6)/10)+
        '</td><td class="x"><button class="sm ghost" data-fill="'+row.g[0]+"-"+row.g[1]+
        '" title="Deze tijd invullen">&#9998;</button></td></tr>';return;}
    const r=row.r,d=dosOf(r.dossierId),run=running&&running.id===r.id,booked=regelIsGeboekt(r);
    h+='<tr class="'+(run?"isrun ":"")+(r.soort==="pauze"?"ispauze ":"")+(r.autoAanvul?"isauto ":"")+(booked?"needsreview":"")+'" data-id="'+esc(r.id)+'">'+
      (r.autoAanvul?'<td class="t"><span class="muted">admin.</span></td><td class="t"><span class="muted">—</span></td>':
        '<td class="t"><input data-f="start" readonly title="Open bewerksheet" value="'+esc(r.start)+'"></td>'+
        '<td class="t"><input data-f="eind" readonly title="Open bewerksheet" value="'+esc(run?"":(r.eind||""))+
          '" placeholder="'+(run?"loopt":"")+'"></td>')+
      '<td><input data-f="dossier" readonly title="Open bewerksheet" value="'+esc(dosVeld(d))+'" placeholder="&mdash;" autocomplete="off"></td>'+
      '<td><input data-f="code" readonly title="Open bewerksheet" class="'+(codeFout(d,r)?"miss":"")+'" value="'+
        esc(codeNaam(d,r.code))+'" placeholder="'+
        (isIndirect(d)&&!d.voorlopig?"verplicht":"&mdash;")+'" autocomplete="off"'+
        (d&&(d.voorlopig||dvnDefinitiefI7(d))?' readonly title="Vast op '+esc(codeNaam(d,defaultCode(d)))+
          '"':"")+"></td>"+
      '<td><input data-f="omschrijving" readonly title="Open bewerksheet" value="'+esc(r.omschrijving)+'" autocomplete="off"></td>'+
      '<td class="u"><input data-f="uren" readonly title="Open bewerksheet" value="'+uu(urenOf(r))+'"></td>'+
      '<td class="x">'+
      (r.autoAanvul?'<span class="autobadge" title="Automatisch aangemaakt bij dagaanvulling">auto</span>':"")+
      '<button class="sm ghost" data-edit="'+esc(r.id)+'" title="Tijdregel bewust bewerken">bewerk</button>'+ 
      ((!run&&r.eind&&viewDate===today()&&r.soort!=="pauze")?
        '<button class="sm ghost" data-maaklopend="'+esc(r.id)+
        '" title="Maak dit de lopende timer">&#9654;</button>':"")+
      '<button class="sm ghost warn" data-del="'+esc(r.id)+'">&#10005;</button></td></tr>';});
  $("d-table").innerHTML=h+"</tbody>";verversDag();}
function verversDag(){
  renderRecent();renderTot();renderDagStatus();
  $("d-tot").textContent=uu(totaal(regels));
  $("d-void").textContent=uu(gapHours(gapsFor(regels,viewDate)));
  $("d-pauze").textContent=uu(pauzeUren(regels));
  const vulMag=werkdag(viewDate)&&dagSluitStatus(viewDate).gesloten&&!(running&&running.datum===viewDate);
  $("d-fill").style.display=werkdag(viewDate)?"":"none";
  $("d-fill").disabled=!vulMag;
  $("d-fill").title=!werkdag(viewDate)?"Weekenddagen hebben geen 8-uursaanvulling":
    (vulMag?"Vul het administratieve dagtotaal aan tot 8,0 uur":
    "Beschikbaar nadat deze werkdag met E is afgesloten");
  bouwSum();boekStat();}

function sumRows(){return sumVan(regels);}

/* Blokkerende fouten maken de dag onboekbaar: die kunnen niet met "toch boeken"
   worden gepasseerd. Waarschuwingen mogen wel bevestigd worden.                */
function controleer(){
  return bookingDomain.validateDay(regels,{
    runningId:running?running.id:null,today:today(),nowHM:nowHM(),getDossier:dosOf,
    isIndirect,hasCodeError:codeFout,
    isFixedCode:d=>!!d&&(d.voorlopig||dvnDefinitiefI7(d)),getFixedCode:defaultCode,
    getCodeName:codeNaam
  });}
const blokFouten=()=>controleer().filter(x=>x.blok);
const waarschuwingen=()=>controleer().filter(x=>!x.blok);
function toonBlokkade(probs,wat){
  L("boeken-geblokkeerd",wat+" · "+probs.length+" fout(en)");
  alert("Deze dag kan nog niet naar Intapp:\n\n"+
    probs.slice(0,10).map(x=>"• "+x.tekst).join("\n")+
    (probs.length>10?"\n• …":"")+
    "\n\nDit zijn blokkerende fouten. Los ze eerst op onder Dag.");}

function bouwSum(){
  const rs=sumRows(),probs=controleer();
  const box=$("d-probs");
  box.className="probs"+(probs.length?" on":"");
  const nBlok=probs.filter(x=>x.blok).length;
  box.innerHTML=probs.length?"<strong>"+(nBlok?nBlok+" blokkerend"+
    (nBlok>1?"e fouten":"e fout"):"Nog te controleren")+
    (nBlok&&probs.length>nBlok?" · "+(probs.length-nBlok)+" waarschuwing"+
      (probs.length-nBlok>1?"en":""):"")+"</strong>"+
    probs.map(x=>'<div class="pb'+(x.blok?" blok":"")+'" data-goto="'+esc(x.id)+'">'+
      (x.blok?"⛔ ":"⚠ ")+esc(x.tekst)+"</div>").join(""):"";
  if(!rs.length){$("d-sum").innerHTML='<tbody><tr><td class="hint">Nog niets.</td></tr></tbody>';return;}
  const tot=rs.reduce((s,x)=>s+x.u,0);
  $("d-sum").innerHTML='<thead><tr><th>Dag</th><th>Dossiernummer</th><th>Dossiernaam</th>'+
    '<th>Werkcode</th><th>Omschrijving</th><th style="text-align:right">Uren</th></tr></thead><tbody>'+
    rs.map(x=>'<tr><td class="mono">'+esc(kortDag(viewDate))+'</td><td class="mono">'+esc(x.nummer)+
      "</td><td>"+esc(x.naam)+(x.dvnStatus?' <span class="tag dvn">'+esc(x.dvnStatus)+"</span>":"")+
      '</td><td'+(x.mist?' class="bad"':"")+">"+
      esc(x.code||(x.mist?"ontbreekt":""))+"</td><td>"+esc(x.oms)+
      '</td><td class="mono" style="text-align:right">'+uu(x.u)+"</td></tr>").join("")+
    '</tbody><tfoot><tr><td colspan="5">Totaal</td><td class="mono" style="text-align:right">'+
    uu(tot)+"</td></tr></tfoot>";}

$("d-probs").addEventListener("click",e=>{
  const b=e.target.closest("[data-goto]");if(!b)return;
  openRegelEditor(b.dataset.goto,"dag");});
$("d-mode").onchange=async e=>{rondMode=e.target.value;
  await putK("meta",rondMode,"rondMode");verversDag();};
$("d-copy").onclick=()=>{
  const rs=sumRows(),probs=controleer(),blok=probs.filter(x=>x.blok);
  if(!rs.length){toast("Niets te kopiëren");return;}
  if(blok.length){toonBlokkade(blok,"tabtekst");return;}
  const waar=probs.filter(x=>!x.blok);
  if(waar.length&&!confirm(waar.length+" waarschuwing(en) op deze dag.\nToch kopiëren?"))return;
  const kop="Dag\tDossiernummer\tDossiernaam\tWerkcode\nOmschrijving\nUren";
  const tekst=rs.map(x=>
    [kortDag(viewDate),schoon(x.nummer),schoon(x.naam),schoon(x.code)].join("\t")+"\n"+
    schoon(x.oms)+"\n"+uu(x.u)).join("\n\n");
  navigator.clipboard.writeText(kop+"\n\n"+tekst+"\n").then(
    ()=>{L("kopieer-intapp",rs.length+" regels · "+uu(rs.reduce((a,x)=>a+x.u,0))+" u");
      toast(rs.length+" regel(s) gekopieerd");},()=>toast("Kopiëren mislukt"));};

const intappTotaal=()=>sumRows().reduce((s,x)=>s+x.u,0);
/* Dagbudget. hourhound is een voorportaal voor Intapp: wat telt zijn de uren. De
   kloktijden hoeven alleen plausibel te zijn en binnen dezelfde datum te vallen.
   Meer dan 24 uur op één datum wordt nergens weggeschreven.                     */
const dagUren=(datum,exclId)=>bookingDomain.dayHours(alle,datum,exclId,boekRekenContext());
function dagRuimte(datum,extra,exclId){
  const ruimte=bookingDomain.dayCapacity(alle,datum,extra,exclId,boekRekenContext());
  if(ruimte.allowed)return true;
  toast("Dat zou "+uu(ruimte.hours)+" uur op één dag maken — meer dan "+uu(DAGMAX)+
    " uur kan niet");
  return false;}
function nieuweRegel(o){
  return Object.assign({id:uid(),datum:viewDate,start:nowHM(),eind:null,dossierId:null,
    code:null,omschrijving:"",uren:0.1,urenHand:false,soort:"werk",
    gemaakt:Date.now(),gewijzigd:Date.now()},o);}

/* Auto-aanvullen is bewust een administratieve totaalaanvulling, geen poging om
   achteraf te reconstrueren op welke kloktijden niet is gewerkt/geregistreerd. De
   gebruiker vult inhoudelijke ontbrekende regels eerst zelf aan; daarna vult deze
   functie uitsluitend het resterende verschil tot 8,0 uur met i7/Diversen. */
function maakAanvulPlan(){
  const ind=i7(),code=i7Standaard(),ds=dagSluitStatus(viewDate),nowMs=Date.now();
  const input={date:viewDate,isWorkday:werkdag(viewDate),dayEnds:dagEinde,dayAudit,
    dayEnd:ds.eind||voorstelDagEinde(viewDate),rules:alle,dossiers,
    overbookings:overboekingen,runningId:running?running.id:null,i7Dossier:ind,code,
    currentTotal:simIntappTotaal(regels),bookingContext:boekRekenContext(),
    id:uid(),batchId:uid(),nowMs,nowIso:new Date(nowMs).toISOString(),waitForRules:rustig};
  return Object.assign({input,ind,code},dayRuleServices.planAutoFill(input));}
async function vulAanTot8(){
  if(opBlok){toast("Rond eerst het herstelvenster af");return false;}
  if(!werkdag(viewDate)){toast("Weekenddagen hebben geen 8-uursaanvulling");return false;}
  if(dagSluitStatus(viewDate).open){toast("Sluit deze werkdag eerst af met E");return false;}
  if(running&&running.datum===viewDate){
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
    uit=await dayRuleServices.autoFillDay(plan.input);
  }catch(e){L("FOUT-aanvullen",String(e));
    toast("Aanvullen mislukt — er is niets gewijzigd: "+e);return false;}
  if(meldDagRegelFout(uit,"Aanvullen is niet uitgevoerd"))return false;
  dagAudit=uit.dayAudit;memRegel(uit.rule);pasMutatieUndoToe(uit.undo);
  bouwDag();renderTot();announce();
  const werkelijk=Math.round(intappTotaal()*10)/10;
  L("aanvullen","1 administratieve regel · +"+uu(extra)+" u · nu "+uu(werkelijk)+" u");
  toast("Er was "+uu(plan.currentTotal)+" uur verantwoord. Hour Hound heeft "+uu(extra)+
    " uur Diversen toegevoegd. Totaal: "+uu(werkelijk)+" uur.");
  return true;}
async function heropenWerkdag(datum){
  if(opBlok){toast("Rond eerst het herstelvenster af");return;}
  if(dagSluitStatus(datum).open){toast("Deze dag is al open");return;}
  if(running&&running.datum===datum){toast("Er loopt nog een regel op deze dag");return;}
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
    uit=await dayRuleServices.reopenDay({date:datum,removeAutomatic:verwijder,
      rules:alle,dossiers,overbookings:overboekingen,runningId:running?running.id:null,
      dayEnds:dagEinde,dayAudit,waitForRules:rustig,
      nowMs:Date.now(),nowIso:new Date().toISOString()});
  }catch(e){L("FOUT-heropen",String(e));toast("Heropenen mislukt — niets gewijzigd: "+e);return;}
  if(meldDagRegelFout(uit,"Heropenen is niet uitgevoerd"))return;
  dagEinde=uit.dayEnds;dagAudit=uit.dayAudit;
  if(verwijder&&autos.length){
    const ids=new Set(uit.removedRules.map(r=>r.id));
    alle=alle.filter(r=>!ids.has(r.id));
    undoStack=undoStack.filter(a=>!(a.soort==="data"&&(a.weg||[]).some(id=>ids.has(id))));}
  viewDate=datum;refreshDay();bouwDag();renderAll();announce();
  L("dag-heropend",datum+" · auto verwijderd "+(verwijder?autos.length:0));
  toast("Werkdag heropend"+(verwijder&&autos.length?" — automatische Diversen-regels verwijderd":""));}
$("d-fill").onclick=vulAanTot8;
$("d-status").addEventListener("click",async e=>{
  if(e.target.closest("[data-close-current]")){await sluitWerkdag(viewDate);return;}
  if(e.target.closest("[data-fill-current]")){await vulAanTot8();return;}
  if(e.target.closest("[data-reopen-current]")){await heropenWerkdag(viewDate);return;}
});

/* ---------- weergave: WEEK ---------- */
function renderWeek(){
  const dow=(parseD(weekAnchor).getDay()+6)%7,mon=addD(weekAnchor,-dow);
  $("w-label").textContent="Week van "+dmy(mon);
  let h="";
  for(let i=0;i<7;i++){
    const ds=addD(mon,i),list=alle.filter(r=>r.datum===ds);
    const t=totaal(list),g=gapHours(gapsFor(list,ds));
    const isWerkdag=werkdag(ds),tekort=isWerkdag?Math.max(0,Math.round((NORM-t)*10)/10):0;
    h+='<button data-day="'+ds+'"><div class="dd">'+
      parseD(ds).toLocaleDateString("nl-NL",{weekday:"short",day:"numeric",month:"short"})+
      '</div><div class="hh">'+uu(t)+"</div>"+
      (g>0?'<div class="gg">'+uu(g)+" open</div>":"")+
      (isWerkdag&&tekort>0?'<div class="dd">'+uu(tekort)+" tot norm</div>":
        (isWerkdag&&t>0?'<div class="dd">norm gehaald</div>':
          (!isWerkdag&&t>0?'<div class="dd">weekend</div>':'<div class="dd">&mdash;</div>')))+
      "</button>";}
  $("w-grid").innerHTML=h;
  const prov=actief().filter(d=>isDvn(d));
  $("w-prov").innerHTML=prov.length?prov.map(p=>{
    const rs=alle.filter(r=>r.dossierId===p.id),dagen={},info=intappDossierInfo(p);
    rs.forEach(r=>{dagen[r.datum]=(dagen[r.datum]||0)+urenOf(r);});
    const det=Object.keys(dagen).sort().map(k=>kortDag(k)+"  "+uu(dagen[k])).join("   ·   ");
    return '<div style="padding:.7rem 0;border-top:1px solid var(--line)">'+
      '<div style="display:flex;gap:.6rem;align-items:baseline;flex-wrap:wrap">'+
      "<strong>"+esc(p.naam)+'</strong><span class="tag dvn">'+esc(dvnStatusTekst(p))+'</span>'+ 
      '<span class="mono">'+uu(rs.reduce((s,r)=>s+urenOf(r),0))+' u</span>'+ 
      '<span style="flex:1"></span><span class="hint">Alleen-lezen · wijzigen onder Beheer</span></div>'+ 
      '<div class="hint mono">Intapp: '+esc(info.nummer||'geen nummer')+' · '+esc(info.naam||'geen naam')+' · '+esc(det||"nog geen uren")+"</div></div>";}).join(""):
    '<div class="hint">Geen DVN-dossiers.</div>';}
$("w-prev").onclick=()=>{weekAnchor=addD(weekAnchor,-7);renderWeek();};
$("w-next").onclick=()=>{weekAnchor=addD(weekAnchor,7);renderWeek();};
$("w-now").onclick=()=>{weekAnchor=today();renderWeek();};
$("w-grid").addEventListener("click",e=>{const b=e.target.closest("[data-day]");if(!b)return;
  viewDate=b.dataset.day;refreshDay();showTab("dag");});

function dvnAuditTekst(d){
  const st=dvnIntappState(d);
  if(st==="posted"&&d.dvnIntappPostedAt)return "Afgehandeld op "+
    new Date(d.dvnIntappPostedAt).toLocaleString("nl-NL",{dateStyle:"short",timeStyle:"short"});
  if(st==="needs_check")return "Controle nodig"+(d.dvnIntappNeedsCheckReason?
    " na "+d.dvnIntappNeedsCheckReason:"");
  return "";}
function dvnKaartHtml(d,afgehandeld){
  const rs=dvnRegels(d),info=intappDossierInfo(d),dagen={},st=dvnIntappState(d);
  rs.forEach(r=>{dagen[r.datum]=(dagen[r.datum]||0)+urenOf(r);});
  const totaal=rs.reduce((s,r)=>s+urenOf(r),0);
  const det=rs.slice().sort((a,b)=>(a.datum+a.start)<(b.datum+b.start)?-1:1)
    .map(r=>'<tr><td class="mono">'+esc(kortDag(r.datum))+'</td><td class="mono">'+
      esc(r.start+'–'+(r.eind||'loopt'))+'</td><td>'+esc((r.omschrijving||'').replace(VOOR,''))+
      '</td><td class="mono" style="text-align:right">'+uu(urenOf(r))+'</td></tr>').join("");
  const dagtekst=Object.keys(dagen).sort().map(k=>kortDag(k)+" "+uu(dagen[k])).join(" · ")||"nog geen uren";
  const audit=dvnAuditTekst(d);
  const nummerActie=d.voorlopig?'<button class="sm go" data-dvn-num="'+esc(d.id)+'">Dossiernummer toekennen</button>':
    '<button class="sm" data-dvn-num="'+esc(d.id)+'">Dossiernummer aanpassen</button>';
  const boekActie=!afgehandeld&&(st==="ready"||st==="needs_check")?
    '<button class="sm go" data-dvn-post="'+esc(d.id)+'">Boeken in Intapp</button>':'';
  const eindActie=!afgehandeld&&st==="missing"?
    '<button class="sm ghost warn" data-dvn-final-i7="'+esc(d.id)+'">Naar definitief i7</button>':'';
  const acties=nummerActie+boekActie+eindActie+
    (rs.length?'<button class="sm" data-dvn-day="'+esc(rs[0].datum)+'">Toon eerste dag</button>':'');
  return '<div class="dvncard '+esc(st||'dvn')+'" data-dvn-card="'+esc(d.id)+'">'+
    '<div class="dvnhead"><div><strong>'+esc(d.naam)+'</strong> '+
    '<span class="tag dvn">'+esc(dvnStatusTekst(d))+'</span></div>'+ 
    '<span class="mono">'+rs.length+' regel(s) · '+uu(totaal)+' u</span></div>'+ 
    '<div class="hint">Intapp: '+esc(info.nummer||'geen nummer')+' · '+esc(info.naam||'geen naam')+
    ' · '+esc(dagtekst)+'</div>'+(audit?'<div class="hint">'+esc(audit)+'</div>':'')+
    '<div class="bar mini">'+acties+
    '</div><details><summary>Toon regels</summary><div class="tw"><table><thead><tr><th>Dag</th><th>Tijd</th><th>Omschrijving</th><th style="text-align:right">Uren</th></tr></thead><tbody>'+ 
    (det||'<tr><td colspan="4" class="hint">Geen regels.</td></tr>')+
    '</tbody></table></div></details></div>';}
function renderDvnIntapp(){
  const el=$("dvn-intapp");if(!el)return;
  const volg={needs_check:0,ready:1,missing:2,"":3};
  const ds=actief().filter(d=>isDvn(d)&&!dvnDefinitiefI7(d)).sort((a,b)=>
    (volg[dvnIntappState(a)]??9)-(volg[dvnIntappState(b)]??9)||a.naam.localeCompare(b.naam));
  if(!ds.length){el.innerHTML='<div class="hint">Geen DVN-dossiers.</div>';return;}
  const open=ds.filter(d=>dvnIntappState(d)!=="posted");
  const klaar=ds.filter(d=>dvnIntappState(d)==="posted").sort((a,b)=>
    (b.dvnIntappPostedAt||"").localeCompare(a.dvnIntappPostedAt||""));
  const openHtml='<div id="dvn-open"><div class="cap">Open werkvoorraad</div>'+ 
    (open.length?open.map(d=>dvnKaartHtml(d,false)).join(""):
      '<div class="hint" style="margin:.5rem 0">Geen open DVN-acties.</div>')+'</div>';
  const klaarHtml=klaar.length?'<details id="dvn-done" style="margin-top:.8rem"><summary>Afgehandeld ('+
    klaar.length+')</summary>'+klaar.map(d=>dvnKaartHtml(d,true)).join("")+'</details>':'';
  el.innerHTML=openHtml+klaarHtml;}

/* ---------- gewone dossiers: tijdelijk i7, later overboeken ---------- */
let overboekPostIds=[];
function overboekingLijnen(o){
  const ls=Array.isArray(o&&o.targetLines)?o.targetLines:[];
  return ls.length?ls:[{werkcode:"",omschrijving:o&&o.description||"",uren:+(o&&o.hours)||0}];}
function overboekingHuidig(o){
  const rs=bronIdsVan(o).map(id=>alle.find(r=>r.id===id)).filter(Boolean);
  if(rs.length!==bronIdsVan(o).length)return{regels:rs,rows:[],lijnen:[],uren:0};
  const rows=sumVan(rs);
  const lijnen=rows.map(x=>({werkcode:x.code||"",omschrijving:x.oms||"",uren:x.u}));
  return{regels:rs,rows,lijnen,uren:lijnen.reduce((s,x)=>s+(+x.uren||0),0)};}
function overboekingKaartHtml(o){
  const st=overboekingState(o),wijz=overboekingWijzigingen(o),cur=overboekingHuidig(o);
  const opgeslagen=overboekingLijnen(o),d=dosOf(o.targetDossierId);
  const regels=opgeslagen.map(x=>'<tr><td class="mono">'+esc(kortDag(o.sourceDate))+
    '</td><td class="mono">'+esc(x.werkcode||'—')+'</td><td>'+esc(x.omschrijving||'')+'</td><td class="mono" style="text-align:right">'+
    uu(+x.uren||0)+'</td></tr>').join("");
  const controle=st==="needs_check"?'<div class="closewarn on" style="margin-top:.55rem">'+
    '<strong>Gewijzigd:</strong> '+esc(wijz.join(', '))+'.<br>Was: '+
    esc(o.targetNumberSnapshot+' · '+o.targetNameSnapshot+' · '+uu(o.hours)+' u')+
    '<br>Nu: '+esc((d?(d.nummer||'—')+' · '+d.naam:'doeldossier ontbreekt')+
      ' · '+uu(cur.uren)+' u')+'</div>':'';
  return '<div class="overcard" data-over-card="'+esc(o.id)+'"><div class="overhead">'+
    '<span class="pill'+(st==="needs_check"?' wait':'')+'">'+esc(overboekingStatusTekst(o))+'</span>'+
    '<strong>'+esc(o.targetNumberSnapshot||'—')+' · '+esc(o.targetNameSnapshot||'')+'</strong>'+
    '<span class="mono">'+bronIdsVan(o).length+' regel(s) · '+uu(o.hours)+' u</span></div>'+controle+
    (st==="done"&&o.targetBookedDate?'<div class="hint">Op dossier geboekt op '+esc(kortDag(o.targetBookedDate))+'</div>':'')+
    '<div class="overactions">'+(st==="needs_check"?'<button class="sm go" data-over-refresh="'+
      esc(o.id)+'">Bijgewerkte gegevens gebruiken</button>':'')+
    (overboekingOpen(o)?'<button class="sm ghost warn" data-over-final="'+esc(o.id)+'">Naar definitief i7</button>':'')+'</div>'+ 
    '<details><summary>Toon regels</summary><div class="tw"><table><thead><tr><th>Werkdatum</th><th>Werkcode</th><th>Omschrijving</th><th style="text-align:right">Uren</th></tr></thead><tbody>'+regels+
    '</tbody></table></div></details></div>';}
function renderOverboekingen(){
  const el=$("overboek-intapp");if(!el)return;
  const open=overboekingen.filter(overboekingOpen),klaar=overboekingen.filter(o=>o.status==="done"),groepen={};
  open.forEach(o=>{(groepen[o.targetDossierId]||(groepen[o.targetDossierId]=[])).push(o);});
  const ids=Object.keys(groepen);
  const openHtml=!ids.length?'<div class="hint">Geen regels die nog naar een dossier moeten.</div>':ids.map(id=>{const os=groepen[id].sort((a,b)=>a.sourceDate.localeCompare(b.sourceDate));
    const d=dosOf(id),blok=os.some(o=>overboekingState(o)==="needs_check");
    const totaal=os.reduce((s,o)=>s+(+o.hours||0),0),regels=os.reduce((s,o)=>s+bronIdsVan(o).length,0);
    return '<div class="dvncard"><div class="dvnhead"><div><strong>'+esc((d&&d.nummer)||os[0].targetNumberSnapshot||'—')+
      ' · '+esc((d&&d.naam)||os[0].targetNameSnapshot||'')+'</strong> <span class="tag">'+
      os.length+' item(s) · '+regels+' regel(s)</span></div><span class="mono">'+uu(totaal)+' u</span></div>'+ 
      '<div class="bar mini"><button class="sm go" data-over-post="'+esc(id)+'"'+
      (blok?' disabled title="Controleer eerst de gewijzigde items"':'')+'>Boeken op dossier</button></div>'+
      os.map(overboekingKaartHtml).join("")+'</div>';}).join("");
  const klaarHtml=klaar.length?'<details style="margin-top:.8rem"><summary>Afgehandeld ('+
    klaar.length+')</summary>'+klaar.sort((a,b)=>(b.doneAt||"").localeCompare(a.doneAt||""))
      .map(overboekingKaartHtml).join("")+'</details>':'';
  el.innerHTML=openHtml+klaarHtml;}
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
  geboekt=uit.booked;vervangOverboekingenGeheugen(uit.overbookings);
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
  geboekt=uit.booked;uit.rules.forEach(memRegel);
  vervangOverboekingenGeheugen([uit.overbooking]);refreshDay();renderAll();
  L("overboeking-definitief-i7",uit.rules.length+" regel(s)");
  toast("Definitief i7 · Commercieel");}

/* ---------- beheer ---------- */
function renderBeheer(){
  renderDvnIntapp();
  renderOverboekingen();
  $("b-list").innerHTML=dossiers.filter(d=>!dvnDefinitiefI7(d)).map(d=>{
    const inGebruik=alle.some(r=>r.dossierId===d.id);
    const cs=(d.codes||[]).map(c=>'<span class="tag">'+esc(c.naam)+
      ' <button class="sm ghost warn" data-rmcode="'+esc(d.id)+"|"+esc(c.code)+
      '">&#10005;</button></span>').join(" ");
    return '<div style="padding:.7rem 0;border-top:1px solid var(--line)'+
      (d.archief?";opacity:.55":"")+'">'+
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">'+
      '<input class="mono" value="'+esc(d.nummer||"")+'" placeholder="nummer" data-dn="'+esc(d.id)+
      '" style="width:180px"'+(d.isI7||isDvn(d)?" disabled":"")+">"+
      '<input value="'+esc(d.naam)+'" data-dnm="'+esc(d.id)+'" style="flex:1;min-width:170px">'+
      '<select data-dl="'+esc(d.id)+'"><option value="nl"'+(d.lang!=="en"?" selected":"")+
      '>NL</option><option value="en"'+(d.lang==="en"?" selected":"")+">EN</option></select>"+
      (isDvn(d)?'<span class="tag dvn">'+esc(dvnStatusTekst(d))+'</span>'+ 
        '<button class="sm" data-nr="'+esc(d.id)+'">'+(d.voorlopig?'Nummer toekennen':'Nummer aanpassen')+'</button>'+ 
        ((dvnIntappState(d)==="ready"||dvnIntappState(d)==="needs_check")?'<button class="sm go" data-post="'+esc(d.id)+'">Boeken in Intapp</button>':"")+
        (dvnIntappState(d)==="missing"?'<button class="sm ghost warn" data-final-i7="'+esc(d.id)+'">Naar definitief i7</button>':""):"")+ 
      (d.archief?'<span class="tag">archief</span>'+
        '<button class="sm" data-unarch="'+esc(d.id)+'">Activeren</button>':"")+
      (d.isI7||d.archief?"":'<button class="sm ghost warn" data-deldos="'+esc(d.id)+'">'+
        (inGebruik?"Archiveren":"Verwijderen")+"</button>")+
      "</div>"+
      (isIndirect(d)?'<div class="hint" style="margin-top:.4rem">Gebruikt de i7-werklijst ('+
        i7codes.length+" codes), "+(d.voorlopig?
          "vast op "+esc(codeNaam(d,defaultCode(d))):
          "per regel te kiezen")+"</div>":(d.dvn?'<div class="hint" style="margin-top:.4rem">Oorspronkelijke DVN-identiteit blijft bewaard; dossiercodes zijn nu optioneel.</div>':'' )+
      '<div style="margin-top:.45rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">'+
      cs+'<input placeholder="code" data-nc="'+esc(d.id)+'" style="width:110px" class="mono">'+
      '<input placeholder="naam" data-ncn="'+esc(d.id)+'" style="width:180px">'+
      '<button class="sm" data-addcode="'+esc(d.id)+'">+</button></div>')+"</div>";}).join("");
  $("libstat").textContent=templates.length+" sjablonen · "+i7codes.length+
    " i7-codes (vaste lijst uit werkcodes.json) · "+alle.length+" regels";}
$("dvn-intapp").addEventListener("click",async e=>{
  const num=e.target.closest("[data-dvn-num]");
  if(num){await kenNummerToe(num.dataset.dvnNum);return;}
  const post=e.target.closest("[data-dvn-post]");
  if(post){await openDvnPostSheet(post.dataset.dvnPost);return;}
  const finalI7=e.target.closest("[data-dvn-final-i7]");
  if(finalI7){await maakDvnDefinitiefI7(finalI7.dataset.dvnFinalI7);return;}
  const day=e.target.closest("[data-dvn-day]");
  if(day){viewDate=day.dataset.dvnDay;refreshDay();showTab("dag");return;}
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
    d.nummer=nr;stempel(d);await put("dossiers",d);
    dossiers=await getAll("dossiers");renderAll();}
  if(t.dataset.dnm){const d=dosOf(t.dataset.dnm),naam=t.value.trim();
    if(d.voorlopig){if(!naam){t.value=d.naam;toast("De DVN-naam kan niet leeg zijn");return;}
      const oud=d.naam,uit=await hernoemVoorlopig(d.id,naam);if(!uit)t.value=oud;}
    else{d.naam=naam||d.naam;stempel(d);
      const dvn=dvnPutIfPosted(d,"dossiernaam gewijzigd");
      if(dvn){memDossier(dvn);await put("dossiers",dvn);}
      else await put("dossiers",d);
      dossiers=await getAll("dossiers");renderAll();}}
  if(t.dataset.dl){const d=dosOf(t.dataset.dl);d.lang=t.value;stempel(d);
    await put("dossiers",d);
    dossiers=await getAll("dossiers");}});
$("b-list").addEventListener("click",async e=>{
  const post=e.target.closest("[data-post]");if(post){openDvnPostSheet(post.dataset.post);return;}
  const finalI7=e.target.closest("[data-final-i7]");
  if(finalI7){await maakDvnDefinitiefI7(finalI7.dataset.finalI7);return;}
  const nr=e.target.closest("[data-nr]");if(nr){kenNummerToe(nr.dataset.nr);return;}
  const ua=e.target.closest("[data-unarch]");
  if(ua){const d=dosOf(ua.dataset.unarch);d.archief=false;await put("dossiers",d);
    dossiers=await getAll("dossiers");renderAll();return;}
  const a=e.target.closest("[data-addcode]");
  if(a){const d=dosOf(a.dataset.addcode);
    const c=document.querySelector('[data-nc="'+d.id+'"]').value.trim();
    const n=document.querySelector('[data-ncn="'+d.id+'"]').value.trim();
    if(!c){toast("Vul een code in");return;}
    d.codes=d.codes||[];d.codes.push({code:c,naam:n||c});
    await put("dossiers",d);dossiers=await getAll("dossiers");renderBeheer();return;}
  const rm=e.target.closest("[data-rmcode]");
  if(rm){const[id,code]=rm.dataset.rmcode.split("|");const d=dosOf(id);
    d.codes=(d.codes||[]).filter(x=>x.code!==code);await put("dossiers",d);
    dossiers=await getAll("dossiers");renderBeheer();return;}
  const dd=e.target.closest("[data-deldos]");
  if(dd){const d=dosOf(dd.dataset.deldos);
    if(overboekingen.some(o=>overboekingOpen(o)&&o.targetDossierId===d.id)){
      toast("Rond eerst de open overboekingen naar dit dossier af");return;}
    const inGebruik=alle.some(r=>r.dossierId===d.id);
    if(inGebruik){
      if(!confirm('"'+d.naam+'" heeft regels en wordt gearchiveerd in plaats van verwijderd.\nDoorgaan?'))return;
      d.archief=true;await put("dossiers",d);}
    else{if(!confirm("Dossier verwijderen?"))return;await del("dossiers",d.id);}
    dossiers=await getAll("dossiers");renderAll();}});
$("b-logoms").onchange=async e=>{
  logOms=e.target.checked;
  await putK("meta",logOms,"logOms");
  /* Uitzetten wist wat er al staat: anders blijven eerder gelogde namen achter. */
  if(!logOms&&logboek.length){logboek=[];await putK("meta",logboek,"log");
    $("logstat").textContent="0 regels";
    toast("Uitgebreid loggen uit — het bestaande logboek is gewist");}
  L("instelling","uitgebreid loggen: "+logOms);};
$("b-logcopy").onclick=()=>{
  const kop="hourhound logboek · "+appVer+" · "+new Date().toLocaleString("nl-NL")+
    "\n"+navigator.userAgent+"\ndossiers "+dossiers.length+" · regels "+alle.length+
    " · vandaag "+vandaagRegels().length+"\n"+"-".repeat(60);
  navigator.clipboard.writeText(kop+"\n"+logboek.join("\n")+"\n").then(
    ()=>toast(logboek.length+" logregels gekopieerd"),()=>toast("Kopiëren mislukt"));};
$("b-logclear").onclick=async()=>{logboek=[];await putK("meta",logboek,"log");
  $("logstat").textContent="0 regels";toast("Logboek leeg");};
$("b-wipe").onclick=async()=>{
  if(running){toast("Sluit eerst de lopende regel af met E");return;}
  if(!confirm("Alle dossiers en tijdregels wissen? Sjablonen en werkcodes blijven staan."))return;
  if(!confirm("Zeker weten? Maak eerst een export als je iets wilt bewaren."))return;
  await txAll(o=>{o.dossiers.clear();o.regels.clear();
    o.overboekingen.clear();
    o.meta.delete("running");o.meta.delete("stack");o.meta.delete("dagEinde");
    o.meta.delete("dagAudit");o.meta.delete("geboekt");});
  stack=[];dagEinde={};dagAudit={};undoStack=[];geboekt={};overboekingen=[];running=null;
  await zorgVoorI7();await herlaad();
  L("alles-gewist","");toast("Gewist — hourhound begint schoon");};
$("b-adddos").onclick=async()=>{
  const naam=$("b-naam").value.trim();if(!naam){toast("Naam is verplicht");return;}
  const nr=$("b-nr").value.trim();
  if(nummerBezet(nr,null)){toast("Dat dossiernummer bestaat al");return;}
  await makeDossier(naam,nr||null,$("b-lang").value);
  $("b-nr").value="";$("b-naam").value="";renderAll();toast("Dossier toegevoegd");};

/* ---------- lopende velden ---------- */

$("l-dossier").addEventListener("input",e=>{
  if(!running)return;
  openAC(e.target,dossierItems(e.target.value),kiesDossierItem);});
$("l-dossier").addEventListener("focus",e=>{
  if(running&&!running.dossierId&&!e.target.value)
    openAC(e.target,dossierItems(""),kiesDossierItem);});
$("l-code").addEventListener("focus",e=>{
  /* W5: laat meteen zien welke codes voor dit dossier al bekend zijn. */
  if(!running||e.target.value.trim())return;
  const d=dosOf(running.dossierId);
  if(codeItems(d,"").length)openAC(e.target,codeItems(d,""),kiesCodeItem);});
$("l-code").addEventListener("input",e=>{
  if(!running)return;
  const d=dosOf(running.dossierId);
  openAC(e.target,codeItems(d,e.target.value),kiesCodeItem);});
$("l-omschr").addEventListener("input",e=>{
  if(!running)return;
  running.omschrijving=e.target.value;
  planOmschr(running.id,e.target.value);
  const d=dosOf(running.dossierId),q=e.target.value.replace(VOOR,"");
  if(q.length>=2)openAC(e.target,omschrItems(d,q),async it=>{
    const p=(running.omschrijving||"").match(VOOR);
    running.omschrijving=(p?p[0]:"")+it.value;
    /* Een omschrijvingssuggestie mag nooit stilzwijgend een optionele dossiercode
       invullen. i7 heeft zijn code al expliciet gekozen vóór de omschrijving. */
    if(it.code&&!running.code&&isIndirect(d))running.code=it.code;
    await saveRegel(running);liveId=null;
    $("l-omschr").value=running.omschrijving;$("l-code").value=codeNaam(d,running.code);
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
  if(pickBusy||!running)return;
  await dossierBlur($("l-dossier"),running.dossierId,async op=>{
    const uit=await koppelRegel(running,op);
    if(!uit)return null;
    $("l-code").value=codeNaam(uit.dossier,running.code);
    $("l-omschr").value=running.omschrijving;
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
  if(pickBusy||!running)return;
  const d=dosOf(running.dossierId);
  const ingetypt=$("l-code").value.trim();
  if(ingetypt&&ingetypt!==codeNaam(d,running.code)&&!(d&&(d.voorlopig||dvnDefinitiefI7(d)))){
    await codeUitVeld(running,ingetypt);}
  else if($("l-code").value.trim()===""){
    /* Leegmaken mag niet op een indirecte regel: de code is daar verplicht. */
    if(d&&(d.voorlopig||dvnDefinitiefI7(d))){
      const vast=codeVoor(d,null);
      if(!vast)geenCodes();
      else{if(running.code!==vast)await koppelRegel(running,{code:vast});
        toast("Deze tijd boekt altijd op "+
          codeNaam(d,vast));}}
    else if(isIndirect(d)){
      if(running.code!==null)await koppelRegel(running,{code:null});
      toast("Een i7-regel moet een werkcode hebben — kies er een uit de lijst");
      eisCode();}
    else if(running.code!==null){running.code=null;await saveRegel(running);}}
  const nd=dosOf(running.dossierId);
  $("l-code").value=codeNaam(nd,running.code);
  $("l-code").classList.toggle("miss",isIndirect(nd)&&!running.code);
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
  const r=alle.find(x=>x.id===n.id);
  if(!r||r.omschrijving===n.tekst)return;
  r.omschrijving=n.tekst;
  await saveRegel(r);
  L("omschrijving-hersteld","na afsluiten · "+omsLog(n.tekst));
  toast("Laatst getypte omschrijving is alsnog opgeslagen");}

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
    const gelukt=await timerOp("regel verwijderen",async t=>{
      if(!opGeldig(t,running?running.id:null))return false;
      const uit=await dayRuleServices.deleteRule({rule:oud,rules:alle,dossiers,
        overbookings:overboekingen,runningId:running?running.id:null,
        isBooked:regelIsGeboekt(oud),waitForRules:rustig,
        nowMs:Date.now(),nowIso:new Date().toISOString()});
      if(meldDagRegelFout(uit,"Verwijderen is niet uitgevoerd"))return false;
      uit.dossiers.forEach(memDossier);
      if(wasRunning)running=null;
      alle=alle.filter(r=>r.id!==id);refreshDay();
      pasMutatieUndoToe(uit.undo);
      return true;});
    if(!gelukt)return;
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
  await timerOp("timer overzetten",async t=>{
    if(!opGeldig(t,running?running.id:null))return;
    const dicht=running?sluitObj(running):null;
    const uit=await dayRuleServices.reopenRule({rule:r,closedRule:dicht,rules:alle,
      dossiers,overbookings:overboekingen,runningId:running?running.id:null,
      isBooked:regelIsGeboekt(r),confirmedWarnings:true,today:today(),nowTime:nowHM(),
      bookingContext:boekRekenContext(),waitForRules:rustig,
      nowMs:Date.now(),nowIso:new Date().toISOString()});
    if(meldDagRegelFout(uit,"Regel opnieuw starten is niet uitgevoerd"))return false;
    pending=null;ntWizard=null;
    if(uit.closedRule)memRegel(uit.closedRule);
    uit.dossiers.forEach(memDossier);memRegel(uit.rule);
    running=alle.find(x=>x.id===uit.rule.id);
    vergeetTimerUndo("timer overgezet");
    liveId=null;bouwDag();renderAll();announce();
    L("timer-overgezet",dosIdLog(uit.rule.dossierId)+" · sinds "+uit.rule.start);
    toast("Deze regel loopt weer sinds "+uit.rule.start);return true;});}
$("d-prev").onclick=()=>{viewDate=addD(viewDate,-1);refreshDay();bouwDag();};
$("d-next").onclick=()=>{viewDate=addD(viewDate,1);refreshDay();bouwDag();};
$("d-today").onclick=()=>{viewDate=today();refreshDay();bouwDag();};
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
