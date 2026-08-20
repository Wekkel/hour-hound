"use strict";
/* ---------- knoppen en toetsen ---------- */
window.addEventListener("focus",()=>{document.body.dataset.focus="1";});
window.addEventListener("blur",()=>{document.body.dataset.focus="0";});
document.body.dataset.focus=document.hasFocus()?"1":"0";
function zetThema(t){
  document.documentElement.dataset.thema=t;
  document.documentElement.classList.toggle("licht",t==="licht");
  document.documentElement.classList.toggle("donker",t==="donker");}
$("b-thema").onclick=async()=>{
  const nu=document.documentElement.dataset.thema||"auto";
  const v=nu==="auto"?"licht":(nu==="licht"?"donker":"auto");
  zetThema(v);await putK("meta",v,"thema");toast("Thema: "+v);};
$("b-switch").onclick=nieuweTaak;
$("b-back").onclick=terug;
$("b-phone").onclick=()=>interrupt("telefoon","Telefoon");
$("b-brk").onclick=()=>interrupt("onderbreking","Onderbreking");
$("b-volgt").onclick=markeerVolgt;
$("b-dvn-rename").onclick=()=>{const d=running?dosOf(running.dossierId):null;
  if(d&&d.voorlopig)vraagHernoemVoorlopig(d.id);};
$("b-pause").onclick=pauze;
$("b-end").onclick=eindeWerkdag;
$("recent").addEventListener("click",async e=>{
  const b=e.target.closest("[data-taak]");if(!b)return;await hervat(b.dataset.taak);});
$("i7row").addEventListener("click",async e=>{
  const b=e.target.closest("[data-i7]");if(!b)return;
  const ind=i7();await kiesTaak({dossierId:ind?ind.id:null,code:b.dataset.i7});
  naStart();});
$("tabs").addEventListener("click",e=>{const b=e.target.closest("[data-v]");
  if(b)showTab(b.dataset.v);});
$("open-days").addEventListener("click",async e=>{
  const later=e.target.closest("[data-open-later]");
  if(later){openDagenSnooze=Date.now()+6*60*60*1000;renderOpenDagen();return;}
  const view=e.target.closest("[data-open-view]");
  if(view){viewDate=view.dataset.openView;refreshDay();showTab("dag");renderOpenDagen();return;}
  const close=e.target.closest("[data-open-close]");
  if(close)await sluitWerkdag(close.dataset.openClose);});

document.addEventListener("keydown",async e=>{
  if(["dayclose","oldrun","editregel","dvnnum","dvnpost"].some(id=>$(id)&&$(id).classList.contains("on")))return;
  if(boek.aan){boekKeys(e);return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"&&!e.shiftKey){
    const t=e.target;
    if(!(/^(INPUT|TEXTAREA)$/.test(t.tagName)&&t.value!==t.defaultValue)){
      e.preventDefault();await undo();return;}}

  if(/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)){
    if(e.key==="Escape"&&!ac.el)e.target.blur();return;}
  /* Tijdens de NT-wizard zijn globale sneltoetsen altijd uit. Ook als de browser
     onverhoopt focus op body zet, kan een getypte T/N/E dus geen timeractie starten. */
  if(ntWizard){if(e.key==="Escape"){e.preventDefault();await ntTerug();}return;}
  if(e.ctrlKey||e.metaKey||e.altKey||e.repeat)return;
  const k=e.key.toLowerCase();
  /* 1–4 zijn de taken die op het scherm staan, 5–9 de i7-codes eronder. Er zit geen
     onzichtbare terugval meer achter: een cijfer doet wat er bij staat.         */
  if(k>="1"&&k<="4"){
    const tk=takenVandaag().filter(t=>!running||t.k!==taakKey(running)).slice(0,4);
    const t=tk[+k-1];
    if(!t){toast("Niets op die toets");e.preventDefault();return;}
    await hervat(t.k);e.preventDefault();return;}
  if(k>="5"&&k<="9"){
    const c=favCodes()[+k-5];
    if(!c){toast("Niets op die toets");e.preventDefault();return;}
    const ind=i7();
    await kiesTaak({dossierId:ind?ind.id:null,code:c.code});
    naStart();e.preventDefault();return;}
  if(k==="n"){await nieuweTaak();e.preventDefault();}
  else if(k==="t"){await interrupt("telefoon","Telefoon");e.preventDefault();}
  else if(k==="o"){await interrupt("onderbreking","Onderbreking");e.preventDefault();}
  else if(k==="r"){if(stack.length)await terug();else toast("Niets geparkeerd");e.preventDefault();}
  else if(k==="v"){await markeerVolgt();e.preventDefault();}
  else if(k==="p"){await pauze();e.preventDefault();}
  else if(k==="e"){await eindeWerkdag();e.preventDefault();}
  else if(k==="b"){showTab("dag");openBoek();e.preventDefault();}
  else if(k==="d"){showTab("dag");}
  else if(k==="u"){showTab("week");}});


/* ---------- DVN dossiernummer-sheet ---------- */
if($("dvnnum")){
  $("dn-x").onclick=()=>sluitDvnNummerSheet(false);
  $("dn-cancel").onclick=()=>sluitDvnNummerSheet(false);
  $("dn-save").onclick=slaDvnNummerOp;
  $("dn-num").addEventListener("input",()=>{
    const d=dosOf($("dvnnum").dataset.id),b=dvnDossierVoorNummer($("dn-num").value,d&&d.id);
    const w=$("dn-warn");
    if(b){w.textContent='Dit nummer bestaat al bij "'+b.naam+'". Opslaan koppelt deze DVN voor Intapp aan dat dossier, zonder de DVN-regels te verplaatsen.';w.classList.add("on");}
    else{w.textContent="";w.classList.remove("on");}
  });
  document.addEventListener("keydown",e=>{
    if(!$("dvnnum").classList.contains("on"))return;
    if(e.key==="Escape"){e.preventDefault();sluitDvnNummerSheet(false);}
    if(e.key==="Enter"&&e.target&&e.target.tagName==="INPUT"){e.preventDefault();slaDvnNummerOp();}
  },true);
}

/* ---------- DVN Intapp-markering ---------- */
if($("dvnpost")){
  $("dp-x").onclick=()=>sluitDvnPostSheet(false);
  $("dp-cancel").onclick=()=>sluitDvnPostSheet(false);
  $("dp-save").onclick=markeerDvnIngevoerd;
  document.addEventListener("keydown",e=>{
    if(!$("dvnpost").classList.contains("on"))return;
    if(e.key==="Escape"){e.preventDefault();sluitDvnPostSheet(false);}
    if(e.key==="Enter"){e.preventDefault();markeerDvnIngevoerd();}
  },true);
}


/* ---------- oude lopende taak en bewerksheets ---------- */
if($("oldrun")){
  const sluitOudeTaak=()=>{$("oldrun").classList.remove("on");$("oldrun").setAttribute("aria-hidden","true");};
  $("xr-x").onclick=()=>{oldRunSnooze=Date.now()+60*60*1000;sluitOudeTaak();};
  $("xr-cancel").onclick=()=>{oldRunSnooze=Date.now()+60*60*1000;sluitOudeTaak();};
  $("xr-continue").onclick=()=>{oldRunSnooze=Date.now()+24*60*60*1000;sluitOudeTaak();toast("Lopende taak blijft doorlopen");};
  $("xr-edit").onclick=async()=>{const id=running&&running.id;sluitOudeTaak();if(id)await openRegelEditor(id,"oldrun");};
  document.addEventListener("keydown",e=>{if($("oldrun").classList.contains("on")&&e.key==="Escape"){e.preventDefault();oldRunSnooze=Date.now()+60*60*1000;sluitOudeTaak();}},true);
  $("xr-stop").onclick=async()=>{
    if(!running){sluitOudeTaak();return;}
    const r=running,e=$("xr-end").value.trim(),m=hm2m(e);
    if(m==null){toast("Ongeldige eindtijd");$("xr-end").focus();return;}
    if(hm2m(r.start)!=null&&m<hm2m(r.start)){toast("Eindtijd ligt vóór de starttijd");$("xr-end").focus();return;}
    const oud=kopie1(r),dicht=await stopRunning(m2hm(m),"oude lopende taak stoppen");
    if(!dicht)return;
    undoTimer("oude lopende taak stoppen",[oud],{herstelRunning:oud.id,verwachtRunning:null,
      verwacht:[{id:oud.id,gewijzigd:dicht.gewijzigd}]});
    sluitOudeTaak();viewDate=dicht.datum;refreshDay();showTab("dag");renderAll();announce();
    toast("Taak gestopt op "+dmy(dicht.datum)+" om "+dicht.eind);};
}
