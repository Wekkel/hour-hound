"use strict";
/* ---------- import en export ---------- */
$("b-import").onclick=()=>$("file").click();
$("file").onchange=e=>{const f=e.target.files[0];if(f)importFile(f);e.target.value="";};
const str=(v,max)=>typeof v==="string"?v.slice(0,max||400):"";
const BACKUPVERSIE=5;
/* Een datum is pas geldig als hij na parsen exact dezelfde tekst oplevert: zo vallen
   2026-02-30 en 2026-13-01 er ook uit.                                          */
const isDatum=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  !isNaN(parseD(s).getTime())&&ymd(parseD(s))===s;
/* Eenvoudige FNV-1a over de kernvelden. Hiermee is te zien of een back-upbestand
   onderweg is aangepast of afgekapt.                                            */
function checksumVan(dos,reg,tpl,cod){
  const stuk=[
    (dos||[]).map(d=>d&&(d.id+"|"+(d.nummer||"")+"|"+(d.naam||""))).sort().join(";"),
    (reg||[]).map(r=>r&&(r.id+"|"+r.datum+"|"+r.start+"|"+(r.eind||"")+"|"+r.uren))
      .sort().join(";"),
    (tpl||[]).map(t=>t&&t.id).sort().join(";"),
    (cod||[]).map(c=>c&&c.code).sort().join(";")].join("#");
  let h=0x811c9dc5;
  for(let i=0;i<stuk.length;i++){h^=stuk.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
  return("0000000"+h.toString(16)).slice(-8);}
const SOORTEN=["werk","pauze","telefoon","onderbreking"];
/* Elke tijdregel wordt afzonderlijk gekeurd. Wat niet klopt gaat de database niet in,
   en de gebruiker ziet vóór het importeren hoeveel er afvalt en waarom.         */
function keurRegels(arr){
  const goed=[],fout=[],gezien={};
  (Array.isArray(arr)?arr:[]).forEach((x,i)=>{
    const nr="regel "+(i+1);
    if(!x||typeof x!=="object"||typeof x.id!=="string"||!x.id){
      fout.push(nr+": geen bruikbaar id");return;}
    if(gezien[x.id]){fout.push(nr+": dubbel id");return;}
    if(!isDatum(x.datum)){fout.push(nr+": ongeldige datum");return;}
    if(hm2m(x.start)==null){fout.push(nr+": ongeldige starttijd");return;}
    if(x.eind!=null&&hm2m(x.eind)==null){fout.push(nr+": ongeldige eindtijd");return;}
    if(x.eind!=null&&hm2m(x.eind)<hm2m(x.start)){
      fout.push(nr+": eindtijd ligt vóór de starttijd");return;}
    const u=Number(x.uren);
    if(!isFinite(u)||u<0||u>DAGMAX){fout.push(nr+": ongeldig aantal uren");return;}
    gezien[x.id]=1;
    goed.push({id:x.id,datum:x.datum,start:m2hm(hm2m(x.start)),
      eind:x.eind?m2hm(hm2m(x.eind)):null,
      dossierId:typeof x.dossierId==="string"?x.dossierId:null,
      code:x.code?str(x.code,60):null,omschrijving:str(x.omschrijving,2000),
      uren:Math.round(u*10)/10,urenHand:!!x.urenHand,autoAanvul:!!x.autoAanvul,
      soort:SOORTEN.indexOf(x.soort)>=0?x.soort:"werk",
      gemaakt:+x.gemaakt||Date.now(),gewijzigd:+x.gewijzigd||0});});
  return{goed,fout};}
function keurDossiers(arr){
  const goed=[],fout=[],gezien={},nummers={};let i7gezien=false;
  (Array.isArray(arr)?arr:[]).forEach((x,i)=>{
    const nr="dossier "+(i+1);
    if(!x||typeof x.id!=="string"||!x.id){fout.push(nr+": geen bruikbaar id");return;}
    if(gezien[x.id]){fout.push(nr+": dubbel id");return;}
    const nummer=x.nummer?str(x.nummer,60):null;
    const sleutel=(nummer||"").toLowerCase();
    if(sleutel&&nummers[sleutel]){
      fout.push(nr+": dossiernummer "+nummer+" komt meer dan één keer voor");return;}
    gezien[x.id]=1;if(sleutel)nummers[sleutel]=1;
    let isI7=!!x.isI7;
    if(isI7&&i7gezien){isI7=false;
      fout.push(nr+": tweede i7-dossier — als gewoon dossier overgenomen");}
    if(isI7)i7gezien=true;
    goed.push({id:x.id,nummer,naam:str(x.naam,200)||"Zonder naam",
      lang:x.lang==="en"?"en":"nl",
      voorlopig:!!x.voorlopig,archief:!!x.archief,isI7,
      c:+x.c||0,used:+x.used||0,gewijzigd:+x.gewijzigd||0,
      codes:Array.isArray(x.codes)?x.codes.filter(c=>c&&c.code)
        .map(c=>({code:str(c.code,60),naam:str(c.naam,120)||str(c.code,60)})):[]});});
  return{goed,fout};}
function keurTemplates(arr){
  const goed=[],fout=[],gezien={};
  (Array.isArray(arr)?arr:[]).forEach((x,i)=>{
    if(!x||typeof x.id!=="string"||!x.id||typeof x.nl!=="string"||!x.nl.trim()){
      fout.push("sjabloon "+(i+1));return;}
    if(gezien[x.id]){fout.push("sjabloon "+(i+1)+": dubbel id");return;}
    gezien[x.id]=1;
    goed.push({id:str(x.id,120),cat:str(x.cat,60)||"Overig",
      min:Math.max(6,Math.min(600,+x.min||6)),
      code:x.code?str(x.code,60):null,nl:str(x.nl),en:x.en?str(x.en):null});});
  return{goed,fout};}
function keurCodes(arr){
  const goed=[],fout=[],gezien={};
  (Array.isArray(arr)?arr:[]).forEach((x,i)=>{
    if(!x||typeof x.code!=="string"||!x.code.trim()){
      fout.push("werkcode "+(i+1));return;}
    if(gezien[x.code]){fout.push("werkcode "+(i+1)+": dubbele code");return;}
    gezien[x.code]=1;
    goed.push({code:str(x.code,60),naam:str(x.naam,120)||str(x.code,60),
      favoriet:!!x.favoriet});});
  return{goed,fout};}
async function importFile(file){
  if(file.size>20*1024*1024){toast("Bestand te groot");return;}
  let d;try{d=JSON.parse(await file.text());}catch(err){toast("Geen geldig JSON");return;}
  if(!d||typeof d!=="object"){toast("Onbruikbaar bestand");return;}
  let soort="";
  try{
    if(d.schema==="hourhound/sjablonen"&&Array.isArray(d.sjablonen)){
      const rows=d.sjablonen.filter(t=>t&&t.id&&t.nl).slice(0,2000).map(t=>({
        id:str(t.id,120),cat:str(t.cat,60)||"Overig",min:Math.max(6,Math.min(600,+t.min||6)),
        code:t.code?str(t.code,60):null,nl:str(t.nl),en:t.en?str(t.en):null}));
      await replaceAll("templates",rows);soort="sjablonen";
      toast(rows.length+" sjablonen geïmporteerd");}
    else if(d.schema==="hourhound/werkcodes"&&Array.isArray(d.codes)){
      const rows=d.codes.filter(c=>c&&c.code).slice(0,500).map(c=>({
        code:str(c.code,60),naam:str(c.naam,120)||str(c.code,60),favoriet:!!c.favoriet}));
      await replaceAll("codes",rows);soort="werkcodes";
      toast(rows.length+" werkcodes geïmporteerd");}
    else if(d.app==="hourhound"){
      if(running){toast("Sluit eerst de lopende regel af (E)");return;}
      const sv=+d.schemaVersion||0;
      if(sv>BACKUPVERSIE){
        toast("Deze back-up komt uit een nieuwere versie van hourhound");return;}
      const D=keurDossiers(d.dossiers),R=keurRegels(d.regels);
      const T=keurTemplates(d.templates),C=keurCodes(d.codes);
      const M=(d.meta&&typeof d.meta==="object")?d.meta:{};
      const let_op=[];

      /* verwijzingen: een regel mag niet naar een niet-bestaand dossier wijzen */
      const bekend={};D.goed.forEach(x=>{bekend[x.id]=1;});
      let losgekoppeld=0;
      R.goed.forEach(r=>{if(r.dossierId&&!bekend[r.dossierId]){
        r.dossierId=null;losgekoppeld++;}});
      if(losgekoppeld)let_op.push("• "+losgekoppeld+
        " regel(s) verwijzen naar een dossier dat niet in het bestand staat; die "+
        "komen binnen zonder dossier en worden als blokkerende fout gemeld");

      /* dagtotalen */
      const perDag={};
      R.goed.forEach(r=>{perDag[r.datum]=(perDag[r.datum]||0)+(+r.uren||0);});
      const teVol=Object.keys(perDag).filter(k=>Math.round(perDag[k]*10)/10>DAGMAX);
      if(teVol.length)let_op.push("• "+teVol.length+" dag(en) tellen meer dan "+
        uu(DAGMAX)+" uur: "+teVol.slice(0,4).map(dmy).join(", ")+
        (teVol.length>4?" …":""));

      /* manifest en checksum */
      const man=d.manifest&&typeof d.manifest==="object"?d.manifest:null;
      const ruwD=Array.isArray(d.dossiers)?d.dossiers:[];
      const ruwR=Array.isArray(d.regels)?d.regels:[];
      const ruwT=Array.isArray(d.templates)?d.templates:[];
      const ruwC=Array.isArray(d.codes)?d.codes:[];
      if(!man)let_op.push("• geen integriteitsmanifest in dit bestand");
      else{
        const mis=[];
        if(man.dossiers!==ruwD.length)mis.push("dossiers "+man.dossiers+
          " ≠ "+ruwD.length);
        if(man.regels!==ruwR.length)mis.push("regels "+man.regels+" ≠ "+ruwR.length);
        if(man.templates!==ruwT.length)mis.push("sjablonen "+man.templates+
          " ≠ "+ruwT.length);
        if(man.codes!==ruwC.length)mis.push("werkcodes "+man.codes+" ≠ "+ruwC.length);
        if(mis.length)let_op.push("• het manifest komt niet overeen met de inhoud: "+
          mis.join(", "));
        if(man.checksum){
          const eigen=checksumVan(ruwD,ruwR,ruwT,ruwC);
          if(eigen!==man.checksum)
            let_op.push("• de checksum klopt niet ("+man.checksum+" ≠ "+eigen+
              ") — het bestand is na de export gewijzigd");}
        else let_op.push("• geen checksum in dit bestand");}

      if(!D.goed.some(x=>x.isI7))
        let_op.push("• geen i7-dossier — hourhound maakt er zelf een aan");
      [["dossier",D.fout],["tijdregel",R.fout],["sjabloon",T.fout],
       ["werkcode",C.fout]].forEach(([naam,f])=>{
        if(f.length)let_op.push("• "+f.length+" "+naam+"(s) worden overgeslagen:\n    "+
          f.slice(0,4).join("\n    ")+(f.length>4?"\n    …":""));});

      const open=R.goed.filter(r=>!r.eind);
      const kop="Back-up van "+(str(d.exported,40)||"onbekende datum")+
        "  ·  versie "+(sv||"onbekend")+"\n\n"+
        D.goed.length+" dossiers · "+R.goed.length+" tijdregels · "+
        T.goed.length+" sjablonen · "+C.goed.length+" werkcodes\n"+
        (let_op.length?"\n"+let_op.join("\n")+"\n":"");
      const herstel=confirm(kop+
        "\nOK = terugzetten: alles wordt vervangen door dit bestand."+
        "\nAnnuleren = samenvoegen: tijdregels en dossiers volgens nieuwste versie, "+
        "sjablonen en werkcodes worden door het bestand overschreven.");

      /* Een open regel wordt nooit automatisch de lopende timer. */
      let hervatId=null;
      if(open.length){
        const vandaagBackup=str(d.exported,40).slice(0,10)===today();
        const mag3=vandaagBackup&&open.length===1;
        const keuze=(prompt("Dit bestand bevat "+open.length+
          " regel(s) zonder eindtijd.\n\n"+
          "1 = afsluiten op de eigen starttijd\n"+
          "2 = afsluiten en markeren als te controleren\n"+
          (mag3?"3 = hervatten als lopende timer (deze back-up is van vandaag)\n":
            "(hervatten is niet mogelijk: dat kan alleen bij één open regel in een "+
            "back-up van vandaag)\n")+
          "\nKies een nummer","2")||"").trim();
        if(keuze!=="1"&&keuze!=="2"&&!(mag3&&keuze==="3")){
          toast("Import afgebroken — er is niets gewijzigd");return;}
        if(mag3&&keuze==="3")hervatId=open[0].id;
        else open.forEach(r=>{
          const orig={eind:null,uren:r.uren,urenHand:r.urenHand};
          r.eind=r.start;r.uren=0.1;r.urenHand=false;
          if(keuze==="2"){r.hersteld=true;r.herstelOp=Date.now();
            r.herstelOrigineel=orig;}});}

      if(herstel){
        if(!confirm("Terugzetten wist de huidige "+alle.length+" tijdregels en "+
          dossiers.length+" dossiers.\n\nZeker weten?"))return;
        /* Expliciet: wat gaat er wel en niet mee terug?
           altijd terug : dagafsluitingen, afrondingsmodus, codegebruik, boekstatus, thema
           op keuze     : de geparkeerde terugkeerstapel en een lopende timer
           nooit        : het logboek (dat zit niet in de back-up)              */
        const mDag=(M.dagEinde&&typeof M.dagEinde==="object")?M.dagEinde:{};
        const mCode=(M.codeGebruik&&typeof M.codeGebruik==="object")?M.codeGebruik:{};
        const mBoek=(M.geboekt&&typeof M.geboekt==="object")?M.geboekt:{};
        const mRond=M.rondMode==="regel"?"regel":"groep";
        const mThema=["licht","donker","auto"].indexOf(M.thema)>=0?M.thema:"auto";
        const mStack=Array.isArray(M.stack)?M.stack:[];
        const neemStack=mStack.length?
          confirm("Het bestand bevat een terugkeerstapel met "+mStack.length+
            " geparkeerde taak(en).\n\nOK = ook terugzetten\nAnnuleren = leeg beginnen"):
          false;
        await tx(["dossiers","regels","templates","codes","meta"],"readwrite",o=>{
          o.dossiers.clear();D.goed.forEach(x=>o.dossiers.put(x));
          o.regels.clear();R.goed.forEach(x=>o.regels.put(x));
          o.templates.clear();T.goed.forEach(x=>o.templates.put(x));
          o.codes.clear();C.goed.forEach(x=>o.codes.put(x));
          o.meta.delete("pending");
          if(hervatId)o.meta.put(hervatId,"running");else o.meta.delete("running");
          o.meta.put(neemStack?mStack:[],"stack");
          o.meta.put(mDag,"dagEinde");
          o.meta.put(mRond,"rondMode");
          o.meta.put(mCode,"codeGebruik");
          o.meta.put(mBoek,"geboekt");
          o.meta.put(mThema,"thema");});
        running=null;pending=null;stack=neemStack?mStack:[];
        toast("Teruggezet: "+D.goed.length+" dossiers, "+R.goed.length+" regels"+
          (hervatId?" · lopende timer hervat":"")+
          (neemStack?" · stapel meegenomen":""));
      }else{
        const hR={},hD={};
        alle.forEach(r=>{hR[r.id]=r;});
        dossiers.forEach(x=>{hD[x.id]=x;});
        const nR=R.goed.filter(r=>!hR[r.id]||(r.gewijzigd||0)>(hR[r.id].gewijzigd||0));
        const nD=D.goed.filter(x=>!hD[x.id]||(x.gewijzigd||0)>(hD[x.id].gewijzigd||0));
        const overR=R.goed.length-nR.length,overD=D.goed.length-nD.length;
        if(!confirm("Samenvoegen:\n\n"+
          nR.length+" tijdregel(s) toevoegen of bijwerken ("+overR+
          " blijven ongewijzigd omdat de huidige versie nieuwer is)\n"+
          nD.length+" dossier(s) toevoegen of bijwerken ("+overD+" ongewijzigd)\n"+
          T.goed.length+" sjablonen en "+C.goed.length+
          " werkcodes worden overschreven door het bestand\n\n"+
          "Instellingen, dagafsluitingen en boekstatus blijven zoals ze nu zijn."+
          "\n\nDoorgaan?"))return;
        await tx(["dossiers","regels","templates","codes"],"readwrite",o=>{
          nD.forEach(x=>o.dossiers.put(x));nR.forEach(x=>o.regels.put(x));
          T.goed.forEach(x=>o.templates.put(x));C.goed.forEach(x=>o.codes.put(x));});
        toast("Samengevoegd: "+nD.length+" dossiers, "+nR.length+" regels");}
      /* De ongedaan-stapel hoort bij de vorige dataset en mag daar niet overheen. */
      undoStack=[];
      await zorgVoorI7();await laadInstellingen();
      soort=herstel?"teruggezet":"samengevoegd";
      L("import",soort+" · "+R.goed.length+" regels · "+R.fout.length+
        " afgekeurd · open "+open.length+(hervatId?" · hervat":""));}
    else{toast("Onbekend bestand");return;}
    await herlaad();announce();
  }catch(err){L("FOUT-import",String(err));toast("Import mislukt: "+err);}}
$("b-export").onclick=async()=>{
  await flushOmschr();
  const dump={app:"hourhound",schemaVersion:BACKUPVERSIE,
    exported:new Date().toISOString(),
    dossiers:await getAll("dossiers"),regels:await getAll("regels"),
    templates:await getAll("templates"),codes:await getAll("codes"),
    meta:{dagEinde:(await get("meta","dagEinde"))||{},
      stack:(await get("meta","stack"))||[],
      rondMode:(await get("meta","rondMode"))||"groep",
      codeGebruik:(await get("meta","codeGebruik"))||{},
      geboekt:(await get("meta","geboekt"))||{},
      thema:(await get("meta","thema"))||"auto",
      running:(await get("meta","running"))||null}};
  /* meta.dagEinde, rondMode, codeGebruik, geboekt en thema worden bij terugzetten
     altijd hersteld; stack en running alleen na een expliciete keuze.          */
  /* Integriteitsmanifest: bij terugzetten kun je zien of het bestand compleet is.
     Het logboek gaat bewust niet mee in de back-up.                             */
  dump.manifest={dossiers:dump.dossiers.length,regels:dump.regels.length,
    templates:dump.templates.length,codes:dump.codes.length,
    uren:Math.round(dump.regels.reduce((s,r)=>s+(+r.uren||0),0)*10)/10,
    open:dump.regels.filter(r=>!r.eind).length,
    checksum:checksumVan(dump.dossiers,dump.regels,dump.templates,dump.codes)};
  const url=URL.createObjectURL(new Blob([JSON.stringify(dump,null,2)],
    {type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download="hourhound-"+today()+".json";
  a.click();URL.revokeObjectURL(url);
  L("export",dump.regels.length+" regels");
  toast("Export gedownload — "+dump.regels.length+" regels, "+
    uu(dump.manifest.uren)+" uur");};

