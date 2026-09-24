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
let editorUrenHand=false,editorUrenInitial="",editorUrenWasHand=false,editorBegin=null,
  editorBefore=null;
function toonBerekendeEditorUren(){
  const a=hm2m($("er-start").value.trim()),b=hm2m($("er-eind").value.trim());
  if(a!=null&&b!=null&&b>=a)$("er-uren").value=uu(Math.ceil(Math.max(1,b-a)/6)/10);}
$("er-uren").addEventListener("input",e=>{
  if(!e.target.value.trim()){editorUrenHand=false;toonBerekendeEditorUren();}
  else editorUrenHand=true;
});
["er-start","er-eind"].forEach(id=>$(id).addEventListener("input",()=>{
  if(editorUrenHand)return;
  toonBerekendeEditorUren();
}));
/* ---------- Patch AF: soort kiezen in de bewerksheet ----------
   Een tijdregel hoort in precies één van drie soorten: gewoon dossier, i7 of DVN.
   De bewerksheet laat die soort expliciet kiezen en helpt daarna met een keuzelijst:
   bij i7 staat het dossiernummer vast en kies je de werkcode uit de i7-werklijst, bij
   DVN kies of maak je de werknaam en staat Commercieel vast. Niemand hoeft meer het
   i7-nummer of de exacte werkcodetekst uit het hoofd te weten. */
let editorSoort=null,editorKeuze=null,editorRegel=null;
function editorSoortVan(d){
  if(!d)return null;
  if(d.isI7||dvnDefinitiefI7(d))return"i7";
  if(d.voorlopig)return"dvn";
  return"gewoon";}
const editorSoortUitleg={
  gewoon:"Gewoon dossier: kies uit de lijst of typ nieuw als 123456789 - naam. Werkcode is optioneel.",
  i7:"i7: het dossiernummer staat vast. Kies de werkcode uit de i7-werklijst.",
  dvn:"DVN (dossiernummer volgt): kies een bestaande DVN of typ een nieuwe werknaam. Werkcode is altijd Commercieel.",
  geen:"Deze regel heeft nog geen soort. Kies Dossier, i7 of DVN; daarna helpt de lijst met dossier en werkcode."};
function editorDvnItems(q){
  const lo=normOms(q),rows=actief().filter(d=>d.voorlopig&&(!lo||normOms(d.naam).includes(lo)))
    .sort((a,b)=>(b.used||0)-(a.used||0)||a.naam.localeCompare(b.naam)).slice(0,12)
    .map(d=>({t:"dvn",id:d.id,label:d.naam,sub:"DVN",group:"Bestaande DVN"}));
  const naam=dvnNaamSchoon(q);
  if(naam&&!actief().some(d=>d.voorlopig&&normOms(d.naam)===normOms(naam)))
    rows.push({t:"nieuwdvn",naam,label:'Nieuwe DVN: "'+naam+'"',sub:"aanmaken",isNew:true,group:"Aanmaken"});
  return rows;}
function editorCodeDossier(){
  if(editorSoort==="i7")return i7();
  if(editorSoort==="dvn")return null;
  if(editorKeuze&&editorKeuze.id)return dosOf(editorKeuze.id);
  const h=editorRegel&&dosOf(editorRegel.dossierId);
  return h&&editorSoortVan(h)==="gewoon"?h:null;}
function zetEditorSoort(soort,opt){
  const o=opt||{},d=editorRegel?dosOf(editorRegel.dossierId):null,zelfde=editorSoortVan(d)===soort;
  editorSoort=soort;editorKeuze=null;closeAC();
  const dos=$("er-dossier"),code=$("er-code");
  document.querySelectorAll("[data-er-soort]").forEach(b=>{
    const aan=b.dataset.erSoort===soort;b.classList.toggle("go",aan);b.setAttribute("aria-pressed",aan?"true":"false");});
  if($("er-soort-hint"))$("er-soort-hint").textContent=editorSoortUitleg[soort||"geen"];
  if(soort==="i7"){const ind=i7();
    dos.value=ind?(ind.nummer||ind.naam):"";dos.readOnly=true;dos.placeholder="i7-dossier ontbreekt";
    code.readOnly=false;code.placeholder="kies uit de i7-werklijst";
    if(!(zelfde&&editorRegel&&editorRegel.code&&HH.state.read().codes.some(c=>c.code===editorRegel.code)))code.value="";
    if(o.focus)setTimeout(()=>{code.focus();openAC(code,codeItems(ind,code.value),kiesEditorCode);},0);}
  else if(soort==="dvn"){
    dos.readOnly=false;dos.placeholder="werknaam: cliënt + aanduiding";
    if(!zelfde)dos.value="";
    const vast=i7CodeOp(VAST_VOORLOPIG,"-704"),vc=HH.state.read().codes.find(c=>c.code===vast);
    code.value=vc?vc.naam:"";code.readOnly=true;code.placeholder=vc?"":"Commercieel ontbreekt in de werklijst";
    if(o.focus)setTimeout(()=>{dos.focus();openAC(dos,editorDvnItems(dos.value),kiesEditorDossier);},0);}
  else if(soort==="gewoon"){
    dos.readOnly=false;dos.placeholder="nummer of naam · nieuw: 123456789 - naam";
    if(!zelfde){dos.value="";code.value="";}
    code.readOnly=false;code.placeholder="optioneel";
    if(o.focus)setTimeout(()=>{dos.focus();openAC(dos,dossierItems(dos.value),kiesEditorDossier);},0);}
  else{dos.readOnly=true;code.readOnly=true;dos.placeholder="kies eerst de soort";code.placeholder="";}}
function kiesEditorDossier(it){
  const dos=$("er-dossier");if(!it)return;
  if(it.t==="dos"){dos.value=it.d.nummer||it.d.naam;editorKeuze={id:it.id,label:dos.value};}
  else if(it.t==="nieuw"){dos.value=it.nummer+" - "+it.naam;editorKeuze={nieuw:{nummer:it.nummer,naam:it.naam},label:dos.value};}
  else if(it.t==="dvn"){dos.value=it.label;editorKeuze={id:it.id,label:dos.value};}
  else if(it.t==="nieuwdvn"){dos.value=it.naam;editorKeuze={nieuw:{nummer:null,naam:it.naam},label:dos.value};}
  setTimeout(()=>$(editorSoort==="gewoon"?"er-code":"er-oms").focus(),0);}
function kiesEditorCode(it){
  if(!it)return;const code=$("er-code");
  code.value=it.isNew?it.newCode:it.label;setTimeout(()=>$("er-oms").focus(),0);}
function editorDossierLijst(){
  const dos=$("er-dossier");if(dos.readOnly)return;
  if(editorSoort==="gewoon")openAC(dos,dossierItems(dos.value),kiesEditorDossier);
  else if(editorSoort==="dvn")openAC(dos,editorDvnItems(dos.value),kiesEditorDossier);}
function editorCodeLijst(){
  const code=$("er-code");if(code.readOnly)return;
  const d=editorCodeDossier();if(editorSoort==="i7"||d)openAC(code,codeItems(d,code.value),kiesEditorCode);}
if($("er-dossier")){
  $("er-dossier").addEventListener("focus",editorDossierLijst);
  $("er-dossier").addEventListener("input",()=>{editorKeuze=null;editorDossierLijst();});
  $("er-dossier").addEventListener("blur",()=>setTimeout(()=>{if(ac.el===$("er-dossier")&&!pickBusy)closeAC();},180));}
if($("er-code")){
  $("er-code").addEventListener("focus",editorCodeLijst);
  $("er-code").addEventListener("input",editorCodeLijst);
  $("er-code").addEventListener("blur",()=>setTimeout(()=>{if(ac.el===$("er-code")&&!pickBusy)closeAC();},180));}
if($("er-soort"))$("er-soort").addEventListener("click",e=>{
  const b=e.target.closest?e.target.closest("[data-er-soort]"):null;if(!b)return;
  zetEditorSoort(b.dataset.erSoort,{focus:true});});
/* Vertaalt de gekozen soort en de dossiertekst naar een koppelopdracht. Een tekst
   die niet eenduidig bij de gekozen soort hoort, wordt geweigerd met uitleg. */
function editorDossierOpdracht(soort,v,huidigId){
  const txt=(v||"").trim(),h=dosOf(huidigId);
  if(!soort)return txt?{fout:"Kies eerst de soort: Dossier, i7 of DVN"}:{dossierId:null,code:null};
  if(soort==="i7"){const ind=i7();if(!ind)return{fout:"Het i7-dossier ontbreekt — maak het aan onder Beheer"};
    if(h&&editorSoortVan(h)==="i7")return{};
    return{dossierId:ind.id,telUsed:false};}
  if(!txt)return{fout:soort==="dvn"?"Vul de werknaam van de DVN in of kies er een uit de lijst":
    "Kies een dossier uit de lijst of typ nieuw als 123456789 - naam"};
  if(editorKeuze&&editorKeuze.label===txt){
    if(editorKeuze.id)return editorKeuze.id===huidigId?{}:{dossierId:editorKeuze.id,telUsed:false};
    if(editorKeuze.nieuw)return{nieuwDossier:Object.assign({lang:"nl"},editorKeuze.nieuw),telUsed:false};}
  if(h&&editorSoortVan(h)===soort&&(txt===dosVeld(h)||txt===h.naam||txt===(h.nummer||"")))return{};
  if(soort==="dvn"){
    const naam=dvnNaamSchoon(txt),best=actief().find(d=>d.voorlopig&&normOms(d.naam)===normOms(naam));
    if(best)return best.id===huidigId?{}:{dossierId:best.id,telUsed:false};
    if(!i7CodeOp(VAST_VOORLOPIG,"-704"))return{fout:"Werkcode Commercieel ontbreekt in de i7-werklijst"};
    return{nieuwDossier:{naam,nummer:null,lang:"nl"},telUsed:false};}
  /* Patch AE: bij gelijke namen nooit stil de eerste treffer kiezen. */
  const gevonden=zoekDossierExact(txt,isGewoonDossier),hit=gevonden.hit;
  if(gevonden.ambiguous)return{fout:'Meerdere dossiers heten "'+kort(txt,28)+'". Gebruik het dossiernummer.'};
  if(hit)return{dossierId:hit.id,telUsed:false};
  const pd=splitsDossier(txt);
  if(pd&&!nummerBezet(pd.nummer,null))
    return{nieuwDossier:{naam:pd.naam,nummer:pd.nummer,lang:"nl"},telUsed:false};
  return{fout:'"'+kort(txt,28)+'" is geen bestaand gewoon dossier. Kies uit de lijst of typ "nummer - naam".'};}
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
/* draft: Patch AF — een nog niet opgeslagen nieuwe regel (knop "+ regel" of een gat
   invullen). Die bestaat pas na "Regel toevoegen"; annuleren laat niets achter. */
function openRegelEditor(id,bron,draft){
  const nieuw=!!draft,r=nieuw?Object.assign({},draft):HH.state.read().rules.find(x=>x.id===id);
  if(!r)return Promise.resolve(false);
  editorBefore=kopie1(r);editorRegel=r;
  const dlg=$("editregel");if(!dlg)return Promise.resolve(false);
  const d=dosOf(r.dossierId),loopt=HH.state.read().running&&HH.state.read().running.id===r.id;
  $("er-date").textContent=dagLabel(r.datum);
  $("er-start").value=r.start||"";
  $("er-eind").value=loopt?"":(r.eind||"");
  $("er-eind").placeholder=loopt?"loopt":"";
  $("er-dossier").value=dosVeld(d);
  $("er-code").value=codeNaam(d,r.code);
  $("er-oms").value=r.omschrijving||"";
  /* Keep the persisted mode. The displayed calculated value is not an edit. */
  editorUrenHand=!!r.urenHand;
  editorUrenWasHand=editorUrenHand;
  editorUrenInitial=loopt?"":uu(urenOf(r));
  $("er-uren").value=editorUrenInitial;
  const werkRegel=r.soort!=="pauze";
  if($("er-soort"))$("er-soort").hidden=!werkRegel;
  if($("er-title"))$("er-title").textContent=nieuw?"Tijdregel toevoegen":"Tijdregel bewerken";
  $("er-save").textContent=nieuw?"Regel toevoegen":"Wijzigingen opslaan";
  zetEditorSoort(werkRegel?editorSoortVan(d):null);
  if(!werkRegel){$("er-dossier").placeholder="pauze heeft geen dossier";}
  editorBegin=["er-start","er-eind","er-dossier","er-code","er-oms","er-uren"]
    .map(id=>$(id).value);
  $("er-uren").disabled=!!loopt;
  const waars=[];
  if(werkRegel&&!d&&!nieuw)waars.push("Deze regel heeft nog geen soort (Dossier, i7 of DVN) en kan daardoor niet naar Intapp. Kies hierboven de soort; daarna helpt de lijst met dossier en werkcode.");
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
  setTimeout(()=>{const eerste=werkRegel&&!d?document.querySelector('[data-er-soort="gewoon"]'):null;
    (eerste||$("er-start")).focus();},0);
  return new Promise(resolve=>{
    const sluit=v=>{closeAC();editorRegel=null;editorKeuze=null;dlg.classList.remove("on");dlg.setAttribute("aria-hidden","true");
      document.removeEventListener("keydown",key,true);resolve(v);};
    const key=e=>{if(!dlg.classList.contains("on"))return;
      /* Een open keuzelijst krijgt pijltjes, Enter, Tab en Escape voorrang. */
      if(ac.el&&ac.el===e.target&&["ArrowDown","ArrowUp","Enter","Tab","Escape"].includes(e.key)){
        if(acKeys(e)){e.stopImmediatePropagation&&e.stopImmediatePropagation();return;}}
      if(e.key==="Escape"){e.preventDefault();sluit(false);}
      if(e.key==="Enter"&&e.target&&e.target.tagName==="INPUT"){e.preventDefault();$("er-save").click();}};
    document.addEventListener("keydown",key,true);
    $("er-x").onclick=()=>sluit(false);$("er-cancel").onclick=()=>sluit(false);
    $("er-save").onclick=async()=>{
      const cur=nieuw?Object.assign({},draft):HH.state.read().rules.find(x=>x.id===id);
      if(!cur){toast("Regel bestaat niet meer");sluit(false);return;}
      const nu=["er-start","er-eind","er-dossier","er-code","er-oms","er-uren"].map(x=>$(x).value);
      if(!nieuw&&editorBegin&&nu.every((v,i)=>v===editorBegin[i])&&editorUrenHand===editorUrenWasHand){sluit(true);return;}
      const voor=kopie1(editorBefore),looptNu=HH.state.read().running&&HH.state.read().running.id===cur.id;
      const start=$("er-start").value.trim(),eind=$("er-eind").value.trim();
      const sm=hm2m(start),em=eind?hm2m(eind):null;
      if(sm==null){toast("Ongeldige starttijd");$("er-start").focus();return;}
      if(eind&&em==null){toast("Ongeldige eindtijd");$("er-eind").focus();return;}
      if(eind&&em<sm){toast("Eindtijd ligt vóór de starttijd");$("er-eind").focus();return;}
      if(!eind&&!looptNu){toast("Een opgeslagen regel moet een eindtijd hebben. Gebruik ▶ om hem lopend te maken.");$("er-eind").focus();return;}
      if(looptNu&&sm>hm2m(nowHM())){toast("De starttijd van een lopende regel kan niet in de toekomst liggen");return;}
      const op=editorDossierOpdracht(werkRegel?editorSoort:null,werkRegel?$("er-dossier").value:"",cur.dossierId);
      if(op.fout){toast(op.fout);(editorSoort?$("er-dossier"):document.querySelector('[data-er-soort="gewoon"]')||$("er-dossier")).focus();return;}
      let tmpD=null,tmpRule=Object.assign({},voor);
      if(op.nieuwDossier)tmpD=bouwDossier(op.nieuwDossier);
      else if(op.dossierId!==undefined)tmpD=op.dossierId?dosOf(op.dossierId):null;
      else tmpD=dosOf(cur.dossierId);
      if(op.dossierId!==undefined||op.nieuwDossier)tmpRule.dossierId=tmpD?tmpD.id:null;
      const c=normaliseerCodeVoorOpslag(tmpD,tmpRule,$("er-code").value);
      if(c.fout){toast(c.fout);$("er-code").focus();return;}
      tmpRule.code=c.code;
      tmpRule.start=m2hm(sm);
      tmpRule.omschrijving=prefixVoor(tmpD,tmpRule.datum,$("er-oms").value||"");
      /* Patch AF: een afgesloten werkregel wordt alleen opgeslagen als hij in één van de
         drie soorten valt en een omschrijving heeft; anders blijft hij een blokkade. */
      if(werkRegel&&!looptNu&&!tmpRule.dossierId){toast("Kies eerst de soort: Dossier, i7 of DVN");
        (document.querySelector('[data-er-soort="gewoon"]')||$("er-dossier")).focus();return;}
      if(werkRegel&&!looptNu&&!String($("er-oms").value||"").replace(VOOR,"").trim()){
        toast("Vul een omschrijving in");$("er-oms").focus();return;}
      if(eind){tmpRule.eind=m2hm(em);
        if(!editorUrenHand){tmpRule.urenHand=false;tmpRule.uren=Math.ceil(Math.max(1,em-sm)/6)/10;}}
      if(!looptNu){
        const uv=$("er-uren").value.trim();
        if(editorUrenHand&&uv){const n=Number(uv.replace(",","."));
          if(!isFinite(n)||n<=0||n>DAGMAX){toast("Ongeldig aantal uren");$("er-uren").focus();return;}
          tmpRule.uren=Math.max(0.1,Math.round(n*10)/10);tmpRule.urenHand=true;}
        else if(!editorUrenHand)tmpRule.urenHand=false;}
      const gelijk=Object.keys(tmpRule).every(k=>k==="gewijzigd"||
        JSON.stringify(tmpRule[k])===JSON.stringify(cur[k])) &&
        Object.keys(cur).every(k=>k==="gewijzigd"||Object.prototype.hasOwnProperty.call(tmpRule,k));
      if(gelijk&&!nieuw){sluit(true);return;}
      if(!dagRuimte(tmpRule.datum,urenOf(tmpRule),tmpRule.id))return;
      const mutatieWarnings=nieuw?[]:HH.services.dayRules.ruleWarnings({rule:cur,
        dossiers:HH.state.read().dossiers,
        overbookings:HH.state.read().overbookings,isBooked:regelIsGeboekt(cur)});
      if(mutatieWarnings.length&&
        !confirm("Je wijzigt een bestaande tijdregel met administratieve status.\n\nDoorgaan en bewust opslaan?"))return;
      if(c.nieuweCode&&tmpD&&!isIndirect(tmpD)&&!(tmpD.codes||[]).some(x=>x.code===c.nieuweCode)){
        tmpD=Object.assign({},tmpD,{codes:(tmpD.codes||[]).concat([{code:c.nieuweCode,naam:c.nieuweCode}])});stempel(tmpD);}
      const voegToe=async()=>{
        const uit=await HH.services.dayRules.addRule({rule:tmpRule,rules:HH.state.read().rules,
          dossiers:HH.state.read().dossiers,overbookings:HH.state.read().overbookings,
          dossierWrites:tmpD?[tmpD]:[],bookingContext:boekRekenContext(),waitForRules:rustig,
          nowMs:Date.now(),nowIso:new Date().toISOString(),undoLabel:"regel toevoegen"});
        if(meldDagRegelFout(uit,"Regel toevoegen is niet uitgevoerd"))return false;
        HH.state.commit({dossiers:mergeById(HH.state.read().dossiers,uit.dossiers),
          rules:mergeById(HH.state.read().rules,[uit.rule])});tmpRule=uit.rule;
        pasMutatieUndoToe(uit.undo);
        if(uit.dayWasClosed){undoStack=[];await herlaad(true);}
        return true;};
      const schrijf=async()=>{
        const omsConcept=looptNu?pakOmschr(cur.id):null;
        const uit=await HH.services.timer.editRule({currentTimer:HH.state.read().running,readCurrentTimer:()=>HH.state.read().running,
          before:voor,rule:tmpRule,rules:HH.state.read().rules,
          dossiers:HH.state.read().dossiers,overbookings:HH.state.read().overbookings,
          dossierWrites:tmpD?[tmpD]:[],
          runningId:looptNu?cur.id:null,isBooked:regelIsGeboekt(cur),confirmedWarnings:true,
          bookingContext:boekRekenContext(),waitForRules:rustig,nowTime:nowHM(),
          nowMs:Date.now(),nowIso:new Date().toISOString()});
        if(await meldTimerFout(uit,"Opslaan is niet uitgevoerd")||
          meldDagRegelFout(uit,"Opslaan is niet uitgevoerd"))return false;
        if(omsConcept)bevestigOmschr(cur.id,omsConcept.versie);
        const delta={dossiers:mergeById(HH.state.read().dossiers,uit.dossiers),
          rules:mergeById(HH.state.read().rules,[uit.rule])};tmpRule=uit.rule;
        if(uit.closedRunning){delta.running=null;pending=null;
          vergeetTimerUndo("regel gestopt via bewerksheet");}
        else if(looptNu){delta.running=delta.rules.find(x=>x.id===uit.rule.id);liveId=null;}
        HH.state.commit(delta);
        pasMutatieUndoToe(uit.undo);
        if(uit.dayWasClosed){undoStack=[];await herlaad(true);}
        return true;};
      try{
        if(!await (nieuw?voegToe():schrijf()))return;
      }catch(e){L("FOUT-regel-editor",String(e));toast("Opslaan mislukt — niets gewijzigd: "+e);return;}
      L("regel-editor",tmpRule.start+"-"+(tmpRule.eind||"loopt")+" · "+dosIdLog(tmpRule.dossierId));
      HH.state.commit({viewDate:tmpRule.datum});
      HH.app.render(["day","live","recent","totals"]);announce();
      toast(nieuw?"Tijdregel toegevoegd":"Tijdregel opgeslagen");sluit(true);};});}
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
