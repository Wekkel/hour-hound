"use strict";
/* ---------- Nieuwe taak: timer eerst, metadata daarna ----------
   N sluit de vorige regel en opent ONMIDDELLIJK een lege nieuwe werkregel. De
   focus-wizard die daarna in het live-eiland verschijnt, wijzigt uitsluitend de
   metadata van die reeds lopende regel. Daardoor kan invoer nooit de tijdknip
   uitstellen.                                                                  */
function ntNieuwState(){
  return{id:running?running.id:null,step:"kind",kind:null,hi:0,query:"",
    newNr:"",newNaam:"",dvnNaam:"",dvnHi:-1,i7q:"",draft:"",descHi:-1,
    codeOpen:false,codeHi:0};}
const ntRauw=()=>ntWizard&&ntWizard.draft!=null?ntWizard.draft:
  (running?(running.omschrijving||"").replace(VOOR,"").trim():"");
function ntSoort(){
  const d=running?dosOf(running.dossierId):null,k=ntWizard&&ntWizard.kind;
  if(k==="gewoon"||(!k&&d&&!isIndirect(d)))return["Gewoon dossier","declarabel"];
  if(k==="i7"||(!k&&d&&d.isI7))return["Indirect (i7)","werkcode verplicht"];
  if(k==="volgt"||(!k&&d&&d.voorlopig))return["Dossier volgt nog","i7 · Commercieel"];
  return["—","nog niet gekozen"];}
function ntActiefVak(){
  if(!ntWizard)return"";
  if(ntWizard.step==="kind")return"soort";
  if(ntWizard.step==="dossier"||ntWizard.step==="nieuw"||ntWizard.step==="volgt")return"dos";
  if(ntWizard.step==="i7")return"code";
  return"oms";}
function ntRenderSamenvatting(){
  const box=$("nt-summary");if(!box)return;
  box.classList.toggle("on",!!ntWizard);
  if(!ntWizard)return;
  const d=running?dosOf(running.dossierId):null,s=ntSoort(),vak=ntActiefVak();
  $("nt-v-soort").textContent=s[0];$("nt-x-soort").textContent=s[1];
  $("nt-v-dos").textContent=d?d.naam:"—";
  $("nt-x-dos").textContent=d?(d.nummer||"nummer volgt nog"):"nog niet gekozen";
  const dvnVast=ntWizard.kind==="volgt"?i7CodeOp(VAST_VOORLOPIG,"-704"):null;
  const dvnCode=dvnVast?i7codes.find(c=>c.code===dvnVast):null;
  $("nt-v-code").textContent=running&&running.code?codeNaam(d,running.code):
    (ntWizard.kind==="volgt"?(dvnCode?dvnCode.naam:"Commercieel"):"—");
  $("nt-x-code").textContent=running&&running.code?running.code:
    (ntWizard.kind==="volgt"?(dvnVast?"automatisch":"ontbreekt in werklijst"):
      (d&&d.isI7?"verplicht":"optioneel"));
  $("nt-v-oms").textContent=ntRauw()||"—";
  $("nt-x-oms").textContent=ntRauw()?"":"mag tijdens de lopende timer worden aangevuld";
  ["soort","dos","code","oms"].forEach(x=>$("nt-s-"+x).classList.toggle("active",x===vak));}
function ntGewoneDossiers(q){
  const lo=schoon(q).toLowerCase();
  return actief().filter(d=>!d.isI7&&!d.voorlopig&&
    (!lo||((d.nummer||"")+" "+d.naam).toLowerCase().includes(lo)))
    .sort((a,b)=>(b.used||0)-(a.used||0)||a.naam.localeCompare(b.naam)).slice(0,10);}
function ntI7Codes(q){
  const lo=schoon(q).toLowerCase();
  return codesGesorteerd().filter(c=>!lo||(c.code+" "+c.naam).toLowerCase().includes(lo))
    .slice(0,20);}
function ntVoorlopigeDossiers(q){
  const lo=normOms(q),laatst={};
  vandaagRegels().filter(r=>r.dossierId).forEach(r=>{
    if(!laatst[r.dossierId]||r.start>laatst[r.dossierId])laatst[r.dossierId]=r.start;});
  return actief().filter(d=>d.voorlopig&&(!lo||normOms(d.naam).includes(lo)))
    .sort((a,b)=>(laatst[b.id]||"").localeCompare(laatst[a.id]||"")||
      (b.used||0)-(a.used||0)||a.naam.localeCompare(b.naam)).slice(0,8);}
function ntDvnVandaag(id){
  return vandaagRegels().filter(r=>r.dossierId===id&&r.soort!=="pauze")
    .reduce((u,r)=>u+urenOf(r),0);}
function ntOmsSuggesties(){
  const q=ntRauw();if(q.length<2)return[];
  const d=dosOf(running&&running.dossierId);
  return omschrItems(d,q).slice(0,6);}
function ntNieuweVoorinvulling(){
  const q=schoon(ntWizard.query),p=splitsDossier(q);
  if(p)return{nummer:p.nummer,naam:p.naam};
  /* Alleen als voorinvulheuristiek (niet als validatie): een uitsluitend numerieke
     losse invoer is waarschijnlijk het dossiernummer; tekst is waarschijnlijk naam. */
  if(/^\d+$/.test(q))return{nummer:q,naam:""};
  return{nummer:"",naam:q};}
function ntHtml(){
  if(!ntWizard||!running)return"";
  const t=ntWizard.step;
  if(t==="kind")return '<span class="nttimer">timer loopt al</span>'+
    '<div class="ntq">Waar schrijf je op?</div>'+
    '<div class="nthint">Alle drie zijn gelijkwaardige keuzes. De focus staat op de eerste kaart; één keer <kbd>→</kbd> gaat direct naar i7.</div>'+
    '<div class="ntcats">'+[
      ["gewoon","Gewoon dossier","Declarabel · werkcode meestal leeg"],
      ["i7","Indirect (i7)","Kies een verplichte kantoorwerkcode"],
      ["volgt","Dossier volgt nog (i7)","Zaaknaam nu · Commercieel automatisch"]
    ].map((x,i)=>'<button class="ntcat'+(i===ntWizard.hi?" hi":"")+'" data-ntkind="'+x[0]+'">'+
      '<span class="k">'+(i+1)+'</span><div class="n">'+x[1]+'</div><div class="d">'+x[2]+
      '</div></button>').join("")+'</div>'+
    '<div class="nthelp"><span><kbd>←</kbd>/<kbd>→</kbd> kiezen</span><span><kbd>Enter</kbd> bevestigen</span>'+
    '<span><kbd>Esc</kbd> sluit alleen de invoer; timer blijft lopen</span></div>';

  if(t==="dossier"){
    const rows=ntGewoneDossiers(ntWizard.query),p=splitsDossier(schoon(ntWizard.query));
    return '<span class="nttimer">timer loopt</span><div class="ntq">Welk dossier?</div>'+
      '<div class="nthint">Zoek op nummer óf naam. Dossiernummer staat bewust prominent. Nieuw dossier: typ desgewenst meteen <span class="mono">123456789 - Levering Kerkstraat</span>.</div>'+
      '<input class="ntfield mono" id="nt-dos-q" autocomplete="off" value="'+esc(ntWizard.query)+
      '" placeholder="123456789 - dossiernaam · of zoek nummer/naam">'+
      '<div class="ntlist" id="nt-dos-list">'+
      (rows.length?'<div class="ntgroup">'+(ntWizard.query?"Gevonden":"Veel gebruikt")+'</div>':"")+
      rows.map((d,i)=>'<div class="ntitem'+(i===ntWizard.hi?" hi":"")+'" data-ntdos="'+esc(d.id)+'">'+
        '<div class="nr">'+esc(d.nummer||"—")+'</div><div class="nm">'+esc(d.naam)+'</div>'+
        '<div class="meta">'+(d.used||0)+'×</div></div>').join("")+
      '<div class="ntitem new'+(ntWizard.hi===rows.length?" hi":"")+'" data-ntnieuw="1">'+
        '<div class="nr">'+(p?esc(p.nummer):"＋ NIEUW")+'</div>'+
        '<div class="nm">'+(p?"Nieuw dossier: "+esc(p.naam):"Nieuw dossier toevoegen")+'</div>'+
        '<div class="meta">'+(p?"nummer + naam herkend":"Enter")+'</div></div></div>'+
      '<div class="nthelp"><span><kbd>↑</kbd>/<kbd>↓</kbd> kiezen</span>'+
      '<span><kbd>Enter</kbd> → omschrijving</span><span><kbd>Tab</kbd> → optionele werkcode</span>'+
      '<span><kbd>Esc</kbd> terug</span></div>';}

  if(t==="nieuw"){
    const klaar=schoon(ntWizard.newNr)&&schoon(ntWizard.newNaam);
    return '<span class="nttimer">timer loopt</span><div class="ntq">Nieuw dossier</div>'+
      '<div class="nthint">'+(klaar?
        'Nummer en naam zijn uit je invoer gesplitst. Controleer ze; er wordt bewust niet gevalideerd of het nummer negen cijfers heeft.':
        'Vul alleen aan wat nog ontbreekt. Dossiernummers worden bewust niet op formaat gevalideerd.')+'</div>'+
      '<div class="nttwocol"><div class="ntwrap"><label>Dossiernummer</label>'+
      '<input class="ntfield mono" id="nt-new-nr" value="'+esc(ntWizard.newNr)+'" placeholder="123456789"></div>'+
      '<div class="ntwrap"><label>Dossiernaam</label>'+
      '<input class="ntfield" id="nt-new-naam" value="'+esc(ntWizard.newNaam)+'" placeholder="Levering Kerkstraat"></div></div>'+
      '<div class="nthelp"><span><kbd>Tab</kbd> volgend veld</span><span><kbd>Enter</kbd> bevestigen</span><span><kbd>Esc</kbd> terug</span></div>';}

  if(t==="i7"){
    const rows=ntI7Codes(ntWizard.i7q);
    return '<span class="nttimer">timer loopt</span><div class="ntq">Welke i7-werkcode?</div>'+
      '<div class="nthint">De tekst is leidend; de technische code staat kleiner ter controle. Meest gebruikt staat bovenaan.</div>'+
      '<input class="ntfield" id="nt-i7-q" autocomplete="off" value="'+esc(ntWizard.i7q)+'" placeholder="typen mag, maar hoeft niet">'+
      '<div class="ntlist">'+(rows.length?rows.map((c,i)=>'<div class="ntitem'+(i===ntWizard.hi?" hi":"")+
        '" data-nti7="'+esc(c.code)+'"><div class="nr">'+esc(c.code.split("-").pop())+
        '</div><div class="nm">'+esc(c.naam)+'</div><div class="meta">i7</div></div>').join(""):
        '<div class="ntnotice bad">Geen i7-werkcodes beschikbaar — importeer werkcodes.json onder Beheer.</div>')+
      '</div><div class="nthelp"><span><kbd>↑</kbd>/<kbd>↓</kbd> kiezen</span>'+
      '<span><kbd>Enter</kbd> of <kbd>Tab</kbd> bevestigen</span><span><kbd>Esc</kbd> terug</span></div>';}

  if(t==="volgt"){
    const vast=i7CodeOp(VAST_VOORLOPIG,"-704"),vc=i7codes.find(c=>c.code===vast);
    const rows=ntVoorlopigeDossiers(ntWizard.dvnNaam);
    return '<span class="nttimer">timer loopt</span><div class="ntq">Welke zaak (cliënt + aanduiding)?</div>'+
      '<div class="nthint">Typ een herkenbare werknaam. Bestaande DVN-dossiers verschijnen meteen, zodat dezelfde zaak niet per ongeluk dubbel wordt aangemaakt.</div>'+
      '<input class="ntfield" id="nt-volgt-naam" autocomplete="off" value="'+esc(ntWizard.dvnNaam)+
      '" placeholder="bijv. Bouwfonds - project Zuid">'+
      (rows.length?'<div class="ntlist"><div class="ntgroup">Bestaand · dossiernummer volgt nog</div>'+
        rows.map((d,i)=>'<div class="ntitem'+(i===ntWizard.dvnHi?" hi":"")+'" data-ntdvn="'+esc(d.id)+'">'+
          '<div class="nr">DVN</div><div class="nm">'+esc(d.naam)+'</div><div class="meta">'+
          (ntDvnVandaag(d.id)>0?uu(ntDvnVandaag(d.id))+' u vandaag':(d.used||0)+'× gebruikt')+
          '</div></div>').join("")+'</div>':"")+
      '<div class="ntauto"><div><div class="a">Dossier</div><div class="v">Indirecte uren</div>'+
      '<div class="s">'+esc((i7()&&i7().nummer)||"I700000000")+'</div></div>'+
      '<div><div class="a">Werkcode</div><div class="v">'+esc(vc?vc.naam:"Commercieel ontbreekt")+
      '</div><div class="s">'+(vc?"automatisch":"herstel werkcodes.json")+'</div></div></div>'+
      '<div class="ntnotice'+(vc?"":" bad")+'">'+(vc?
        'Ook het Intapp-voorvoegsel wordt automatisch opgebouwd; jij typt hier alleen cliënt + aanduiding.':
        'DVN kan pas worden gekoppeld zodra de vaste werkcode Commercieel weer in de i7-werklijst staat.')+'</div>'+
      '<div class="nthelp"><span><kbd>↑</kbd>/<kbd>↓</kbd> bestaand kiezen</span>'+
      '<span><kbd>Enter</kbd> of <kbd>Tab</kbd> verder</span><span><kbd>Esc</kbd> terug</span></div>';}


  const d=dosOf(running.dossierId),gewoon=d&&!isIndirect(d),codes=gewoon?codesFor(d):[];
  const sugs=ntOmsSuggesties();
  return '<span class="nttimer">timer loopt</span><div class="ntq">Wat heb je gedaan?</div>'+
    '<div class="nthint">De tijd liep al vanaf NT. '+(gewoon?
      'Werkcode is optioneel en wordt nooit automatisch ingevuld. <kbd>Shift</kbd>+<kbd>Tab</kbd> brengt je erheen.':
      '')+'</div>'+
    (gewoon?'<div class="ntordinary"><div class="ntwrap"><label>Werkcode <span class="ntopt">optioneel · vrij veld</span></label>'+
      '<input class="ntfield mono" id="nt-code" autocomplete="off" value="'+esc(running.code||"")+
      '" placeholder="meestal leeg">'+(codes.length?'<div class="ntremember">'+codes.length+
      ' eerder zelf gebruikte '+(codes.length===1?"code":"codes")+' beschikbaar met ↓</div>':"")+
      '</div><div class="ntwrap"><label>Omschrijving</label>'+
      '<input class="ntfield" id="nt-oms" autocomplete="off" value="'+esc(ntRauw())+
      '" placeholder="korte omschrijving"></div></div>':
      '<div class="ntwrap"><label>Omschrijving</label><input class="ntfield" id="nt-oms" autocomplete="off" value="'+
      esc(ntRauw())+'" placeholder="korte omschrijving"></div>')+
    (gewoon&&ntWizard.codeOpen&&codes.length?'<div class="ntlist" id="nt-code-list"><div class="ntgroup">Eerder zelf gebruikt bij dit dossier</div>'+
      codes.map((c,i)=>'<div class="ntitem'+(i===ntWizard.codeHi?" hi":"")+'" data-ntcode="'+esc(c.code)+
        '"><div class="nr">'+esc(c.code)+'</div><div class="nm">'+esc(c.naam||c.code)+'</div><div class="meta">onthouden</div></div>').join("")+
      '</div>':"")+
    (sugs.length&&ntWizard.descHi>=0?'<div class="ntlist">'+sugs.map((x,i)=>
      '<div class="ntitem'+(i===ntWizard.descHi?" hi":"")+'" data-ntoms="'+i+'"><div class="nr">suggestie</div>'+
      '<div class="nm">'+esc(x.value)+'</div><div class="meta">'+esc(x.sub||"")+'</div></div>').join("")+'</div>':"")+
    '<div class="nthelp"><span><kbd>Enter</kbd> of <kbd>Tab</kbd> gegevens gereed — timer loopt door</span>'+
    '<span><kbd>Esc</kbd> stap terug</span>'+(gewoon?'<span><kbd>Shift</kbd>+<kbd>Tab</kbd> naar werkcode</span>':"")+'</div>';
}
function ntFocus(wat){
  if(!ntWizard)return;
  setTimeout(()=>{
    if(!ntWizard)return;
    if(ntWizard.step==="kind"){
      const bs=[...$("nt-wizard").querySelectorAll("[data-ntkind]")];
      (bs[Math.max(0,Math.min(ntWizard.hi,bs.length-1))]||bs[0])?.focus();return;}
    let id=wat==="code"?"nt-code":null;
    if(!id)id=ntWizard.step==="dossier"?"nt-dos-q":ntWizard.step==="nieuw"?
      (schoon(ntWizard.newNr)?"nt-new-naam":"nt-new-nr"):
      ntWizard.step==="i7"?"nt-i7-q":ntWizard.step==="volgt"?"nt-volgt-naam":"nt-oms";
    const el=$(id);if(el){el.focus();if(el.setSelectionRange)el.setSelectionRange(el.value.length,el.value.length);}
  },20);}
function ntRender(){
  const box=$("nt-wizard");if(!box)return;
  box.classList.toggle("on",!!ntWizard);
  if(!ntWizard){box.innerHTML="";box.dataset.sig="";ntRenderSamenvatting();return;}
  const a=document.activeElement,inWizard=!!(a&&box.contains(a));
  const bewaar=inWizard?{id:a.id||"",kind:a.dataset.ntkind||"",dos:a.dataset.ntdos||"",
    i7:a.dataset.nti7||"",dvn:a.dataset.ntdvn||"",code:a.dataset.ntcode||"",
    oms:a.dataset.ntoms||"",start:typeof a.selectionStart==="number"?a.selectionStart:null,
    end:typeof a.selectionEnd==="number"?a.selectionEnd:null}:null;
  /* De werklijst is externe wizard-state: een import onder Beheer kan i7codes
     wijzigen zonder dat ntWizard zelf verandert. Neem daarom ook een compacte
     fingerprint van de codes op in de render-signatuur. Anders blijft een reeds
     geopend i7-scherm na import ten onrechte "geen werkcodes" tonen. */
  const codeSig=i7codes.map(c=>c.code+"\u001f"+c.naam+"\u001f"+(c.favoriet?1:0)).join("\u001e");
  const sig=[ntWizard.id,ntWizard.step,ntWizard.hi,ntWizard.query,ntWizard.newNr,
    ntWizard.newNaam,ntWizard.dvnNaam,ntWizard.dvnHi,ntWizard.i7q,ntWizard.descHi,
    ntWizard.codeOpen?1:0,ntWizard.codeHi,codeSig].join("|");
  if(box.dataset.sig===sig){ntRenderSamenvatting();return;}
  box.dataset.sig=sig;box.innerHTML=ntHtml();ntRenderSamenvatting();ntBind();
  if(bewaar){
    let terug=bewaar.id?$(bewaar.id):null;
    if(!terug&&bewaar.kind)terug=box.querySelector('[data-ntkind="'+CSS.escape(bewaar.kind)+'"]');
    if(!terug&&bewaar.dos)terug=box.querySelector('[data-ntdos="'+CSS.escape(bewaar.dos)+'"]');
    if(!terug&&bewaar.i7)terug=box.querySelector('[data-nti7="'+CSS.escape(bewaar.i7)+'"]');
    if(!terug&&bewaar.dvn)terug=box.querySelector('[data-ntdvn="'+CSS.escape(bewaar.dvn)+'"]');
    if(!terug&&bewaar.code)terug=box.querySelector('[data-ntcode="'+CSS.escape(bewaar.code)+'"]');
    if(!terug&&bewaar.oms)terug=box.querySelector('[data-ntoms="'+CSS.escape(bewaar.oms)+'"]');
    if(terug){terug.focus({preventScroll:true});
      if(bewaar.start!=null&&terug.setSelectionRange){const n=terug.value.length;
        terug.setSelectionRange(Math.min(bewaar.start,n),Math.min(bewaar.end,n));}}}}
async function ntWisIdentiteit(){
  if(!running)return null;
  return await koppelRegel(running,{dossierId:null,code:null,omschrijving:ntRauw()});}
async function ntKiesSoort(k){
  if(!running||!ntWizard)return;
  if(!await ntWisIdentiteit())return;
  ntWizard.kind=k;ntWizard.hi=0;ntWizard.codeOpen=false;ntWizard.descHi=-1;
  if(k==="gewoon"){ntWizard.step="dossier";ntRender();ntFocus();return;}
  if(k==="volgt"){ntWizard.step="volgt";ntRender();ntFocus();return;}
  const ind=i7();
  if(!ind){toast("Het i7-dossier ontbreekt");ntWizard.step="kind";ntRender();ntFocus();return;}
  if(!await koppelRegel(running,{dossierId:ind.id,code:null,telUsed:true}))return;
  ntWizard.step="i7";ntRender();ntFocus();}
async function ntKiesDossier(id,naarCode){
  if(!running||!ntWizard)return;
  const d=dosOf(id);if(!d)return;
  if(!await koppelRegel(running,{dossierId:id,code:null,telUsed:true,omschrijving:ntRauw()}))return;
  ntWizard.step="omschrijving";ntWizard.hi=0;ntWizard.descHi=-1;ntWizard.codeOpen=!!naarCode;
  ntRender();ntFocus(naarCode?"code":null);}
function ntOpenNieuw(){
  const p=ntNieuweVoorinvulling();
  ntWizard.newNr=p.nummer;ntWizard.newNaam=p.naam;ntWizard.step="nieuw";ntWizard.hi=0;
  ntRender();ntFocus();}
async function ntBevestigNieuw(){
  const nr=schoon(ntWizard.newNr),naam=schoon(ntWizard.newNaam);
  if(!nr||!naam){toast("Dossiernummer en dossiernaam zijn beide nodig");ntFocus();return;}
  if(nummerBezet(nr,null)){toast("Dat dossiernummer bestaat al — kies het bestaande dossier");return;}
  const uit=await koppelRegel(running,{nieuwDossier:{naam,nummer:nr,lang:"nl"},code:null,
    omschrijving:ntRauw(),telUsed:true});
  if(!uit)return;
  ntWizard.step="omschrijving";ntWizard.codeOpen=false;ntWizard.descHi=-1;
  ntRender();ntFocus();}
async function ntKiesI7(code){
  if(!running||!ntWizard)return;
  /* Een reeds gerenderde keuzeregel kan verouderd raken wanneer de werklijst in een
     andere tab of via Beheer wordt vervangen. Alleen een code uit de actuele lijst
     mag de wizard daarom naar de omschrijving laten doorgaan. */
  if(!i7codes.some(c=>c.code===code)){
    toast("De i7-werklijst is gewijzigd — kies de werkcode opnieuw");
    ntWizard.step="i7";ntWizard.hi=0;ntRender();ntFocus();return;}
  if(!await koppelRegel(running,{code}))return;
  if(running.code!==code){
    toast("Werkcode is niet opgeslagen — kies hem opnieuw");
    ntWizard.step="i7";ntWizard.hi=0;ntRender();ntFocus();return;}
  ntWizard.step="omschrijving";ntWizard.descHi=-1;ntRender();ntFocus();}
function vervangDvnPrefix(tekst,naam){
  return String(tekst||"").replace(/^(\d{2}\.\d{2}\.\d{4} · )[^·]*( · )/,
    (_,a,b)=>a+naam+b);}
async function hernoemVoorlopig(id,naam,opt){
  const d=dosOf(id),nieuw=schoon(naam),o=opt||{};
  if(!d||!d.voorlopig)return null;
  if(!nieuw){toast("De DVN-naam kan niet leeg zijn");return null;}
  const dubbel=actief().find(x=>x.id!==id&&x.voorlopig&&normOms(x.naam)===normOms(nieuw));
  if(dubbel){toast('Er bestaat al een DVN met de naam "'+kort(dubbel.naam,28)+'"');return null;}
  if(nieuw===d.naam)return{dossier:d,regels:[]};
  if(omsWacht)await flushOmschr();
  const nwD=stempel(Object.assign({},d,{naam:nieuw}));
  const oudRs=alle.filter(r=>r.dossierId===id),nwRs=oudRs.map(r=>Object.assign({},r,{
    omschrijving:prefixVoor(nwD,r.datum,(r.omschrijving||"").replace(VOOR,"")),
    gewijzigd:Date.now()}));
  const stackRaakt=stack.some(x=>x.dossierId===id);
  const nwStack=stack.map(x=>x.dossierId!==id?x:
    Object.assign({},x,{omschrijving:vervangDvnPrefix(x.omschrijving,nieuw)}));
  try{
    await rustig(oudRs.map(r=>r.id));
    await txAll(s=>{s.dossiers.put(nwD);nwRs.forEach(r=>s.regels.put(r));
      if(stackRaakt)s.meta.put(nwStack,"stack");});
  }catch(e){L("FOUT-voorlopig-hernoemen",String(e));toast("DVN-naam wijzigen mislukt");return null;}
  const nextRules=mergeById(alle,nwRs),delta={dossiers:mergeById(dossiers,[nwD]),
    rules:nextRules};
  if(stackRaakt)delta.stack=nwStack;
  if(running&&running.dossierId===id)
    delta.running=nextRules.find(r=>r.id===running.id)||running;
  appState.commit(delta);
  if(ntWizard&&running&&running.dossierId===id)ntWizard.dvnNaam=nieuw;
  liveId=null;refreshDay();
  L("voorlopig-hernoemd","dos"+idKort(id)+" · "+nwRs.length+" regel(s)");
  if(!o.stil){renderAll();renderWeek();announce();toast("DVN-naam gewijzigd");}
  return{dossier:nwD,regels:nwRs};}
async function vraagHernoemVoorlopig(id){
  const d=dosOf(id);if(!d||!d.voorlopig)return;
  const naam=prompt("Nieuwe werknaam voor dit dossier waarvan het nummer nog volgt:",d.naam);
  if(naam==null)return;
  await hernoemVoorlopig(id,naam);}
async function ntBevestigVolgt(kiesId){
  const naam=schoon(ntWizard.dvnNaam);if(!naam&&!kiesId){toast("Vul de zaak in");ntFocus();return;}
  if(!i7CodeOp(VAST_VOORLOPIG,"-704")){
    toast("Werkcode Commercieel ontbreekt — herstel werkcodes.json onder Beheer");return;}
  const huidig=dosOf(running.dossierId);
  const best=kiesId?dosOf(kiesId):actief().find(x=>x.voorlopig&&normOms(x.naam)===normOms(naam));
  let uit=null;
  if(best&&best.voorlopig){ntWizard.dvnNaam=best.naam;
    uit=await koppelRegel(running,{dossierId:best.id,telUsed:true,omschrijving:ntRauw()});}
  else if(huidig&&huidig.voorlopig&&!huidig.isI7){
    const her=await hernoemVoorlopig(huidig.id,naam,{stil:true});
    uit=her?{regel:running,dossier:her.dossier}:null;}
  else uit=await koppelRegel(running,{nieuwDossier:{naam,nummer:null,lang:"nl"},
    telUsed:true,omschrijving:ntRauw()});
  if(!uit)return;
  ntWizard.step="omschrijving";ntWizard.descHi=-1;ntWizard.dvnHi=-1;ntRender();ntFocus();}

async function ntBewaarGewoneCode(){
  if(!running)return true;
  const d=dosOf(running.dossierId);if(!d||isIndirect(d))return true;
  const el=$("nt-code"),v=schoon(el?el.value:(running.code||""));
  if(!v){
    if(running.code)await koppelRegel(running,{code:null});
    return true;}
  return await codeUitVeld(running,v);}
async function ntKlaar(){
  if(!running||!ntWizard)return;
  const d=dosOf(running.dossierId);
  /* Laat een i7-wizard nooit afronden zonder de verplichte vaste-lijstkeuze. Dit is
     de laatste invariant achter de UI: ook een stale DOM of onverwachte statewissel
     kan daardoor niet ongemerkt een i7-regel zonder werkcode opleveren. */
  if(d&&d.isI7&&!running.code){
    toast(i7codes.length?"Kies eerst de verplichte i7-werkcode":
      "Geen i7-werkcodes beschikbaar — importeer werkcodes.json onder Beheer");
    ntWizard.step="i7";ntWizard.hi=0;ntRender();ntFocus();return;}
  const el=$("nt-oms"),v=schoon(el?el.value:ntRauw());
  if(!v){toast("Omschrijving ontbreekt — vul hem in of sluit de invoer met Esc");ntFocus();return;}
  if(!await ntBewaarGewoneCode())return;
  if(!await koppelRegel(running,{omschrijving:v}))return;
  ntWizard=null;liveId=null;closeAC();renderAll();announce();
  toast("Taakgegevens gereed — timer loopt door");}
async function ntTerug(){
  if(!ntWizard)return;
  if(ntWizard.step==="kind"){ntWizard=null;renderAll();
    toast("Invoer gesloten — de nieuwe timer loopt door");return;}
  if(ntWizard.step==="nieuw")ntWizard.step="dossier";
  else if(ntWizard.step==="omschrijving")
    ntWizard.step=ntWizard.kind==="i7"?"i7":(ntWizard.kind==="volgt"?"volgt":"dossier");
  else ntWizard.step="kind";
  ntWizard.hi=0;ntWizard.descHi=-1;ntWizard.codeOpen=false;ntRender();ntFocus();}
function ntBind(){
  if(!ntWizard)return;
  const box=$("nt-wizard");
  box.querySelectorAll("[data-ntkind]").forEach((b,i)=>{
    b.onfocus=()=>{ntWizard.hi=i;box.querySelectorAll("[data-ntkind]").forEach((x,j)=>
      x.classList.toggle("hi",i===j));ntRenderSamenvatting();};
    b.onclick=()=>ntKiesSoort(b.dataset.ntkind);
    b.onkeydown=e=>{
      if(e.key==="ArrowRight"||e.key==="ArrowLeft"){
        e.preventDefault();e.stopPropagation();
        const bs=[...box.querySelectorAll("[data-ntkind]")],d=e.key==="ArrowRight"?1:-1;
        ntWizard.hi=(i+d+bs.length)%bs.length;bs[ntWizard.hi].focus();return;}
      if(e.key==="Enter"){e.preventDefault();e.stopPropagation();ntKiesSoort(b.dataset.ntkind);return;}
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();ntTerug();}};});
  const dq=$("nt-dos-q");
  if(dq){
    dq.oninput=e=>{ntWizard.query=e.target.value;ntWizard.hi=0;ntRender();};
    dq.onkeydown=e=>{
      const rows=ntGewoneDossiers(ntWizard.query),n=rows.length+1;
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();e.stopPropagation();
        ntWizard.hi=(ntWizard.hi+(e.key==="ArrowDown"?1:-1)+n)%n;ntRender();ntFocus();return;}
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();ntTerug();return;}
      if(e.key==="Enter"||e.key==="Tab"){
        const naarCode=e.key==="Tab";e.preventDefault();e.stopPropagation();
        if(ntWizard.hi<rows.length)ntKiesDossier(rows[ntWizard.hi].id,naarCode);
        else ntOpenNieuw();}};}
  box.querySelectorAll("[data-ntdos]").forEach(x=>x.onclick=()=>ntKiesDossier(x.dataset.ntdos,false));
  const nieuw=box.querySelector("[data-ntnieuw]");if(nieuw)nieuw.onclick=ntOpenNieuw;
  const nr=$("nt-new-nr"),nm=$("nt-new-naam");
  if(nr){nr.oninput=e=>{ntWizard.newNr=e.target.value;};
    nr.onkeydown=e=>{if(e.key==="Escape"){e.preventDefault();ntTerug();}
      else if(e.key==="Enter"){e.preventDefault();if(schoon(ntWizard.newNaam))ntBevestigNieuw();else nm&&nm.focus();}};}
  if(nm){nm.oninput=e=>{ntWizard.newNaam=e.target.value;};
    nm.onkeydown=e=>{if(e.key==="Escape"){e.preventDefault();ntTerug();}
      else if(e.key==="Enter"){e.preventDefault();ntBevestigNieuw();}};}
  const iq=$("nt-i7-q");
  if(iq){
    iq.oninput=e=>{ntWizard.i7q=e.target.value;ntWizard.hi=0;ntRender();};
    iq.onkeydown=e=>{const rows=ntI7Codes(ntWizard.i7q),n=rows.length;
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){if(!n)return;e.preventDefault();e.stopPropagation();
        ntWizard.hi=(ntWizard.hi+(e.key==="ArrowDown"?1:-1)+n)%n;ntRender();ntFocus();return;}
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();ntTerug();return;}
      if((e.key==="Enter"||e.key==="Tab")&&n){e.preventDefault();e.stopPropagation();
        ntKiesI7(rows[Math.min(ntWizard.hi,n-1)].code);}};}
  box.querySelectorAll("[data-nti7]").forEach(x=>x.onclick=()=>ntKiesI7(x.dataset.nti7));
  const vn=$("nt-volgt-naam");
  if(vn){vn.oninput=e=>{ntWizard.dvnNaam=e.target.value;ntWizard.dvnHi=-1;ntRender();};
    vn.onkeydown=e=>{const rows=ntVoorlopigeDossiers(ntWizard.dvnNaam),n=rows.length;
      if((e.key==="ArrowDown"||e.key==="ArrowUp")&&n){e.preventDefault();e.stopPropagation();
        if(ntWizard.dvnHi<0)ntWizard.dvnHi=e.key==="ArrowDown"?0:n-1;
        else ntWizard.dvnHi=(ntWizard.dvnHi+(e.key==="ArrowDown"?1:-1)+n)%n;
        ntRender();ntFocus();return;}
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();ntTerug();}
      else if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();e.stopPropagation();
        const d=ntWizard.dvnHi>=0?rows[ntWizard.dvnHi]:null;ntBevestigVolgt(d?d.id:null);}};}
  box.querySelectorAll("[data-ntdvn]").forEach(x=>x.onclick=()=>ntBevestigVolgt(x.dataset.ntdvn));
  const cd=$("nt-code"),om=$("nt-oms");
  if(cd){
    cd.onfocus=()=>{if(!ntWizard.codeOpen){ntWizard.codeOpen=true;ntWizard.codeHi=0;ntRender();ntFocus("code");}};
    cd.onkeydown=e=>{
      const d=dosOf(running.dossierId),rows=codesFor(d);
      if((e.key==="ArrowDown"||e.key==="ArrowUp")&&rows.length){e.preventDefault();e.stopPropagation();
        ntWizard.codeHi=(ntWizard.codeHi+(e.key==="ArrowDown"?1:-1)+rows.length)%rows.length;
        const gekozen=rows[ntWizard.codeHi];cd.value=gekozen.code;
        const its=[...box.querySelectorAll("[data-ntcode]")];
        its.forEach(x=>x.classList.toggle("hi",x.dataset.ntcode===gekozen.code));
        const hi=its.find(x=>x.dataset.ntcode===gekozen.code);
        if(hi)hi.scrollIntoView({block:"nearest"});return;}
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();ntWizard.codeOpen=false;ntRender();ntFocus();return;}
      if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();e.stopPropagation();
        ntBewaarGewoneCode().then(()=>{ntWizard.codeOpen=false;ntRender();ntFocus();});}};
  }
  box.querySelectorAll("[data-ntcode]").forEach(x=>x.onclick=async()=>{
    await codeUitVeld(running,x.dataset.ntcode);ntWizard.codeOpen=false;ntRender();ntFocus();});
  if(om){
    om.oninput=e=>{ntWizard.draft=e.target.value;
      planOmschr(running.id,prefixVoor(dosOf(running.dossierId),running.datum,ntWizard.draft));
      ntWizard.descHi=-1;ntRenderSamenvatting();};
    om.onkeydown=e=>{
      const sugs=ntOmsSuggesties();
      if((e.key==="ArrowDown"||e.key==="ArrowUp")&&sugs.length){e.preventDefault();e.stopPropagation();
        if(ntWizard.descHi<0)ntWizard.descHi=0;
        else ntWizard.descHi=(ntWizard.descHi+(e.key==="ArrowDown"?1:-1)+sugs.length)%sugs.length;
        ntRender();ntFocus();return;}
      if(e.key==="Escape"){e.preventDefault();e.stopPropagation();ntTerug();return;}
      if(e.key==="Tab"&&e.shiftKey&&dosOf(running.dossierId)&&!isIndirect(dosOf(running.dossierId))){
        e.preventDefault();e.stopPropagation();ntWizard.codeOpen=true;ntRender();ntFocus("code");return;}
      if(e.key==="Enter"||e.key==="Tab"){e.preventDefault();e.stopPropagation();
        if(ntWizard.descHi>=0&&sugs[ntWizard.descHi]){
          const x=sugs[ntWizard.descHi];ntWizard.draft=x.value;
          planOmschr(running.id,prefixVoor(dosOf(running.dossierId),running.datum,x.value));
          ntWizard.descHi=-1;ntRender();ntFocus();return;}
        ntKlaar();}};
  }
  box.querySelectorAll("[data-ntoms]").forEach(x=>x.onclick=()=>{
    const sugs=ntOmsSuggesties(),it=sugs[+x.dataset.ntoms];if(!it)return;
    ntWizard.draft=it.value;
    planOmschr(running.id,prefixVoor(dosOf(running.dossierId),running.datum,it.value));
    ntWizard.descHi=-1;ntRender();ntFocus();});
}
async function nieuweTaak(){
  const nieuw=await startRegel({dossierId:null,code:null,omschrijving:"",soort:"werk"});
  if(!nieuw)return;
  ntWizard=ntNieuwState();liveId=null;renderAll();ntFocus();
  L("nieuwe-taak","timer direct gestart om "+nieuw.start+" · metadata volgt");
}
async function kiesDossierItem(it){
  const w=itemNaarOpdracht(it);
  if(!w||!running)return;
  const uit=await koppelRegel(running,w);
  if(!uit){const hd=dosOf(running.dossierId);
    $("l-dossier").value=dosVeld(hd);
    $("l-code").value=codeNaam(hd,running.code);
    $("l-omschr").value=running.omschrijving||"";return;}
  const d=uit.dossier;
  $("l-dossier").value=dosVeld(d);
  $("l-code").value=codeNaam(d,running.code);
  $("l-omschr").value=running.omschrijving;
  liveId=null;renderLive();renderRecent();renderTot();verversDag();announce();
  setTimeout(()=>{const el=$("l-omschr");el.focus();
    const m=/\{[^}]+\}/.exec(el.value);
    if(m)el.setSelectionRange(m.index,m.index+m[0].length);
    else el.setSelectionRange(el.value.length,el.value.length);},10);}
