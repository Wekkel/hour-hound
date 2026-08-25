"use strict";
/* ---------- boeken in Intapp ---------- */
/* hourhound is het voorportaal, Intapp is de waarheid. Dit venster loopt de
   samengevatte dagregels één voor één af: dossiernummer, naam, werkcode en uren staan
   groot in beeld om over te typen, en de enige tekst die werkelijk gekopieerd wordt —
   de omschrijving — zit achter één knop en één toets. Wat al in Intapp staat wordt per
   dag onthouden, zodat een onderbreking niet betekent dat je opnieuw moet zoeken waar
   je gebleven was. Met L schakel je naar de hele lijst om buiten de volgorde om een
   willekeurige regel te pakken.                                                  */
let geboekt={};
let boek={aan:false,i:0,rows:[],datum:"",lijst:false};
let parkBoek=null;
/* De boekstatus hangt aan de vingerafdruk van een Intapp-regel: dossieridentiteit,
   werkcode, genormaliseerde omschrijving, afgeronde uren, afrondingsmodus en de ID's
   plus gewijzigd-waarden van alle onderliggende tijdregels. Wijzigt er iets aan de
   uren, de bronregels of de afrondingsmodus, dan valt de regel automatisch terug op
   niet-geboekt.                                                                */
const isGeboekt=fp=>(geboekt[boek.datum]||[]).indexOf(fp)>=0;
const isGeparkeerd=row=>!!overboekingVoorRow(row,boek.datum);
const isAfgehandeld=row=>isGeboekt(row.fp)||isGeparkeerd(row);
function kanParkeren(row){
  if(!row||isAfgehandeld(row)||!Array.isArray(row.dosIds)||row.dosIds.length!==1)return false;
  const d=dosOf(row.dosIds[0]);
  return !!d&&!isIndirect(d)&&!isDvn(d)&&!!d.nummer;
}
async function zetGeboekt(fp,aan){
  const had=Object.prototype.hasOwnProperty.call(geboekt,boek.datum);
  const oud=had?geboekt[boek.datum].slice():null;
  const lijst=(geboekt[boek.datum]||[]).filter(x=>x!==fp);
  if(aan)lijst.push(fp);
  if(lijst.length)geboekt[boek.datum]=lijst;else delete geboekt[boek.datum];
  const dagen=Object.keys(geboekt).sort();
  while(dagen.length>60)delete geboekt[dagen.shift()];
  try{await putK("meta",geboekt,"geboekt");return true;}
  catch(e){
    if(had)geboekt[boek.datum]=oud;else delete geboekt[boek.datum];
    L("FOUT-geboekt",String(e));
    toast("Boekstatus kon niet worden opgeslagen — de markering is teruggedraaid");
    tekenBoek();boekStat();return false;}}
function boekStat(){
  const el=$("d-boekstat");if(!el)return;
  const rs=sumRows(),k=geboekt[viewDate]||[];
  const n=rs.filter(x=>k.indexOf(x.fp)>=0).length;
  const p=rs.filter(x=>overboekingVoorRow(x,viewDate)).length,open=rs.length-n-p;
  el.textContent=!rs.length?"":n+" geboekt · "+p+" geparkeerd · "+open+" open";}
async function kopieer(tekst,btn,label){
  try{await navigator.clipboard.writeText(tekst);
    if(btn){btn.textContent="Gekopieerd \u2713";clearTimeout(btn._h);
      btn._h=setTimeout(()=>{btn.innerHTML=label;},1400);}
    return true;}
  catch(e){toast("Kopiëren mislukt — het venster moet actief zijn");return false;}}
function openBoek(){
  const rs=sumRows();
  if(!rs.length){toast("Niets te boeken op deze dag");return;}
  const probs=controleer(),blok=probs.filter(x=>x.blok);
  if(blok.length){toonBlokkade(blok,"boekvenster");return;}
  const waar=probs.filter(x=>!x.blok);
  if(waar.length&&!confirm(waar.length+" waarschuwing(en):\n\n"+
    waar.slice(0,6).map(x=>"• "+x.tekst).join("\n")+(waar.length>6?"\n• …":"")+
    "\n\nDoorgaan met boeken?"))return;
  boek={aan:true,i:0,rows:rs,datum:viewDate,lijst:false};
  const eerste=rs.findIndex(x=>!isAfgehandeld(x));
  boek.i=eerste<0?0:eerste;
  $("boek").classList.add("on");tekenBoek();
  L("boekvenster",rs.length+" regels · "+uu(rs.reduce((s,x)=>s+x.u,0))+" u");}
function sluitBoek(){boek.aan=false;$("boek").classList.remove("on");boekStat();}
function boekGa(n){
  if(!boek.rows.length)return;
  boek.i=(n+boek.rows.length)%boek.rows.length;tekenBoek();}
function volgendeOpen(){
  const n=boek.rows.length;
  for(let s=1;s<=n;s++){const j=(boek.i+s)%n;
    if(!isAfgehandeld(boek.rows[j])){boek.i=j;tekenBoek();return true;}}
  return false;}
function tekenBoek(){
  const rs=boek.rows,x=rs[boek.i];if(!x)return;
  const geboekte=rs.filter(r=>isGeboekt(r.fp)),geparkeerde=rs.filter(isGeparkeerd);
  const klaar=rs.filter(isAfgehandeld);
  const uTot=rs.reduce((s,r)=>s+r.u,0),uKlaar=klaar.reduce((s,r)=>s+r.u,0);
  $("bk-titel").textContent="Boeken in Intapp · "+kortDag(boek.datum);
  $("bk-tel").innerHTML='<span class="pill'+(klaar.length>=rs.length?" ok":"")+'">'+
    geboekte.length+" geboekt · "+geparkeerde.length+" geparkeerd · "+
    (rs.length-klaar.length)+" open · "+uu(uKlaar)+" van "+uu(uTot)+" u</span>";
  $("bk-toggle").innerHTML=(boek.lijst?"Eén voor één":"Hele lijst")+" <kbd>L</kbd>";
  $("bk-kaart").style.display=boek.lijst?"none":"block";
  $("bk-lijst").style.display=boek.lijst?"block":"none";
  const g=isGeboekt(x.fp),p=isGeparkeerd(x);
  $("bk-kaart").className="kaart"+(g||p?" gedaan":"");
  $("bk-kaart").innerHTML=
    '<div class="rij"><span class="nr">'+esc(x.nummer||"—")+"</span>"+
    '<button class="sm ghost" id="bk-nrcopy" title="Dossiernummer kopiëren">kopieer</button>'+
    '<span class="uu">'+uu(x.u)+"</span></div>"+
    '<div class="rij"><span class="nm">'+esc(x.naam||"geen dossier")+"</span>"+
    '<span class="cd">'+esc(x.code||"geen werkcode")+"</span>"+
    (g?'<span class="pill ok">geboekt</span>':(p?'<span class="pill wait">geparkeerd</span>':""))+"</div>"+
    '<span class="cap">Omschrijving — de enige tekst die je plakt</span>'+
    '<div class="oms">'+esc(x.oms||"(leeg)")+"</div>"+
    (x.mist?'<div class="hint bad" style="margin-top:.55rem">Deze regel mist nog een '+
      "dossier, een werkcode of een omschrijving.</div>":"");
  let h="";
  rs.forEach((r,i)=>{
    const rg=isGeboekt(r.fp),rp=isGeparkeerd(r);
    h+='<div class="bkrow'+(i===boek.i?" nu":"")+(rg||rp?" gedaan":"")+
      '" data-i="'+i+'">'+
      '<span class="bn">'+esc(r.nummer||"—")+"</span>"+
      '<span class="bo">'+esc(r.oms||"(leeg)")+"</span>"+
      '<span class="bu">'+uu(r.u)+"</span>"+
      '<button class="sm ghost" data-copy="'+i+'">kopieer</button>'+
      (rp?'<span class="pill wait">geparkeerd</span>':
        '<input type="checkbox" data-done="'+i+'"'+(rg?" checked":"")+
        ' style="width:auto;min-width:0" title="Staat in Intapp">')+
      (!rg&&!rp&&kanParkeren(r)?'<button class="sm ghost warn" data-park="'+i+'">tijdelijk niet boekbaar</button>':"")+
      '</div>';});
  $("bk-lijst").innerHTML=h;
  const allesKlaar=klaar.length>=rs.length;
  $("bk-done").classList.toggle("go",allesKlaar);
  $("bk-done").innerHTML=(allesKlaar?"Alles geboekt &#183; sluiten":
    (g||p?"Volgende openstaande":"Geboekt &#183; volgende"))+' <kbd>&#9166;</kbd>';
  $("bk-done").title=allesKlaar?"Alle regels staan in Intapp — sluit dit venster":
    (g||p?"Ga naar de volgende openstaande regel":"Markeer als geboekt en ga verder");
  $("bk-park").style.display=kanParkeren(x)?"":"none";}

function tijdelijkI7Omschrijving(row){
  return "Tijdelijk i7 voor "+schoon(row.nummer)+" · "+schoon(row.naam)+" · "+
    schoon(row.oms);
}
function openParkeer(row){
  if(!kanParkeren(row)){toast("Alleen een open regel van een gewoon dossier kan worden geparkeerd");return;}
  const ind=i7(),com=i7CodeOp(VAST_VOORLOPIG,"-704");
  if(!ind){toast("Het i7-dossier ontbreekt");return;}
  if(!com){toast("Werkcode Commercieel ontbreekt in de i7-werklijst");return;}
  const doel=dosOf(row.dosIds[0]);parkBoek={row,doel,ind,com};
  $("pb-target").textContent=(doel.nummer||"—")+" · "+doel.naam;
  $("pb-i7").textContent=(ind.nummer||"—")+" · "+ind.naam+" · "+codeNaam(ind,com);
  $("pb-hours").textContent=uu(row.u)+" u";
  $("pb-oms").textContent=tijdelijkI7Omschrijving(row);
  $("pb-source").innerHTML=(row.bron||[]).map(b=>{const r=alle.find(x=>x.id===b.id);
    return r?'<tr><td class="mono">'+esc(r.start+'–'+(r.eind||'loopt'))+'</td><td>'+esc(r.omschrijving||'')+
      '</td><td class="mono" style="text-align:right">'+uu(urenOf(r))+'</td></tr>':"";}).join("");
  $("parkboek").classList.add("on");
}
function sluitParkeer(){parkBoek=null;$("parkboek").classList.remove("on");}
async function bevestigParkeer(){
  const p=parkBoek;if(!p)return;
  const ids=(p.row.bron||[]).map(b=>b.id),bron=ids.map(id=>alle.find(r=>r.id===id)).filter(Boolean);
  if(bron.length!==ids.length||bron.some(r=>!r.eind||r.dossierId!==p.doel.id)){
    toast("De bronregels zijn intussen gewijzigd — open de boekwizard opnieuw");sluitParkeer();return;}
  await rustig(ids);
  const nu=new Date().toISOString(),o={id:uid(),status:"waiting",targetDossierId:p.doel.id,
    targetNumberSnapshot:p.doel.nummer||"",targetNameSnapshot:p.doel.naam||"",
    sourceDate:boek.datum,sourceRuleIds:ids,sourceFingerprint:p.row.fp,
    sourceSnapshot:bron.map(r=>({id:r.id,datum:r.datum,start:r.start,eind:r.eind,
      dossierId:r.dossierId,code:r.code||null,omschrijving:r.omschrijving||"",
      uren:urenOf(r),gewijzigd:r.gewijzigd||0})),
    targetLines:[{werkcode:p.row.code||"",omschrijving:p.row.oms||"",uren:p.row.u}],description:p.row.oms||"",
    hours:p.row.u,i7DossierId:p.ind.id,i7NumberSnapshot:p.ind.nummer||"",i7Code:p.com,
    temporaryDescription:tijdelijkI7Omschrijving(p.row),parkedAt:nu,updatedAt:nu,
    audit:[{type:"op-i7-geboekt-geparkeerd",t:nu}]};
  try{await put("overboekingen",o);overboekingen.push(o);}
  catch(e){L("FOUT-overboeking-parkeren",String(e));toast("Parkeren mislukt — er is niets gewijzigd");return;}
  L("overboeking-geparkeerd","regels "+ids.length+" · "+uu(o.hours)+" u");
  sluitParkeer();tekenBoek();boekStat();
  if(!volgendeOpen())toast("Alle regels zijn geboekt of geparkeerd");
}
async function kopieerHuidig(){
  const x=boek.rows[boek.i];if(!x)return;
  await kopieer(schoon(x.oms),$("bk-copy"),'Kopieer omschrijving <kbd>C</kbd>');
  L("boek-kopieer","regel "+(boek.i+1)+" van "+boek.rows.length);}
$("bk-close").onclick=sluitBoek;
$("boek").addEventListener("mousedown",e=>{if(e.target.id==="boek")sluitBoek();});
$("bk-toggle").onclick=()=>{boek.lijst=!boek.lijst;tekenBoek();};
$("bk-prev").onclick=()=>boekGa(boek.i-1);
$("bk-next").onclick=()=>boekGa(boek.i+1);
$("bk-copy").onclick=kopieerHuidig;
$("bk-park").onclick=()=>openParkeer(boek.rows[boek.i]);
$("bk-done").onclick=async()=>{
  const x=boek.rows[boek.i];if(!x)return;
  if(boek.rows.every(isAfgehandeld)){
    sluitBoek();toast("Alle regels van deze dag zijn geboekt of geparkeerd");return;}
  if(!isAfgehandeld(x)){if(!await zetGeboekt(x.fp,true))return;}
  if(!volgendeOpen()){
    tekenBoek();
    toast("Alles geboekt of geparkeerd — Enter of klik sluit het venster");
  }
  boekStat();};
$("bk-tab").onclick=()=>{
  const kop="Dag\tDossiernummer\tDossiernaam\tWerkcode\nOmschrijving\nUren";
  const blok=boek.rows.map(x=>
    [kortDag(boek.datum),schoon(x.nummer),schoon(x.naam),schoon(x.code)].join("\t")+"\n"+
    schoon(x.oms)+"\n"+uu(x.u)).join("\n\n");
  kopieer(kop+"\n\n"+blok+"\n",$("bk-tab"),"Hele tabel");};
$("bk-lijst").addEventListener("click",async e=>{
  const c=e.target.closest("[data-copy]");
  if(c){const i=+c.dataset.copy;boek.i=i;
    await kopieer(schoon(boek.rows[i].oms),c,"kopieer");
    L("boek-kopieer","regel "+(i+1)+" van "+boek.rows.length);return;}
  const d=e.target.closest("[data-done]");
  if(d){const i=+d.dataset.done;boek.i=i;
    await zetGeboekt(boek.rows[i].fp,d.checked);tekenBoek();boekStat();return;}
  const p=e.target.closest("[data-park]");
  if(p){boek.i=+p.dataset.park;openParkeer(boek.rows[boek.i]);return;}
  const r=e.target.closest("[data-i]");
  if(r){boek.i=+r.dataset.i;boek.lijst=false;tekenBoek();}});
$("bk-kaart").addEventListener("click",async e=>{
  if(e.target.id==="bk-nrcopy"){const x=boek.rows[boek.i];
    await kopieer(schoon(x.nummer),e.target,"kopieer");}});
function boekKeys(e){
  const k=e.key.toLowerCase();
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(k==="escape"){e.preventDefault();sluitBoek();return;}
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
  if(k==="c"||k===" "){e.preventDefault();kopieerHuidig();return;}
  if(k==="enter"){e.preventDefault();$("bk-done").click();return;}
  if(k==="arrowdown"||k==="arrowright"){e.preventDefault();boekGa(boek.i+1);return;}
  if(k==="arrowup"||k==="arrowleft"){e.preventDefault();boekGa(boek.i-1);return;}
  if(k==="l"){e.preventDefault();boek.lijst=!boek.lijst;tekenBoek();}}
$("d-boek").onclick=openBoek;
$("pb-copy").onclick=()=>parkBoek&&kopieer(tijdelijkI7Omschrijving(parkBoek.row),
  $("pb-copy"),"Kopieer tijdelijke omschrijving");
$("pb-save").onclick=bevestigParkeer;
$("pb-cancel").onclick=sluitParkeer;$("pb-x").onclick=sluitParkeer;
$("parkboek").addEventListener("mousedown",e=>{if(e.target.id==="parkboek")sluitParkeer();});
document.addEventListener("keydown",e=>{if($("parkboek").classList.contains("on")&&e.key==="Escape"){
  e.preventDefault();sluitParkeer();}},true);
