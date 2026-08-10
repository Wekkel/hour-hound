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

document.addEventListener("keydown",async e=>{
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

