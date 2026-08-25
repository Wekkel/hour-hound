"use strict";
/* ---------- weergave: NU ---------- */
function renderLive(){
  /* Een wizard hoort altijd bij precies de regel die op dit moment loopt. Iedere
     andere timeractie maakt de wizard daardoor vanzelf ongeldig. */
  if(ntWizard&&(!HH.state.read().running||ntWizard.id!==HH.state.read().running.id))ntWizard=null;
  const d=HH.state.read().running?dosOf(HH.state.read().running.dossierId):null;
  $("live").className="live"+(HH.state.read().running?" "+HH.state.read().running.soort:"");
  document.body.dataset.run=HH.state.read().running?HH.state.read().running.soort:"";
  $("l-fields").style.display=HH.state.read().running&&HH.state.read().running.soort!=="pauze"&&!ntWizard?"grid":"none";
  $("b-back").style.display=HH.state.read().stack.length&&!ntWizard?"":"none";
  $("b-dvn-rename").style.display=HH.state.read().running&&d&&d.voorlopig&&!ntWizard?"":"none";
  if(HH.state.read().stack.length)$("b-back").innerHTML="Terug naar "+
    esc(((dosOf(HH.state.read().stack[HH.state.read().stack.length-1].dossierId)||{}).naam||"vorige taak"))+" <kbd>R</kbd>";

  if(!HH.state.read().running){
    $("l-who").className="who idle";$("l-who").textContent="Er loopt niets";
    $("l-uren").textContent="";
    $("l-run").innerHTML="Druk <b>N</b> of kies hieronder waar je mee begint";
    liveId=null;hideWake();ntRender();return;}

  $("l-who").className="who";
  $("l-who").textContent=HH.state.read().running.soort==="werk"?(d?d.naam:"Nieuwe taak"):
    HH.state.read().running.soort==="pauze"?"Pauze":(HH.state.read().running.soort==="telefoon"?"Telefoon":"Onderbreking");
  const mins=Math.max(0,(hm2m(eindOf(HH.state.read().running))||0)-(hm2m(HH.state.read().running.start)||0));
  $("l-uren").textContent=HH.state.read().running.soort==="pauze"?"":uu(urenOf(HH.state.read().running));
  $("l-run").innerHTML="loopt sinds "+HH.state.read().running.start+" · "+mins+" min"+
    (HH.state.read().running.datum!==today()?" · op "+dmy(HH.state.read().running.datum)+" (niet doortellen naar vandaag)":"")+
    (d&&d.voorlopig?" · dossier volgt nog":"")+(d&&d.lang==="en"?" · EN":"")+
    (ntWizard?" · gegevens worden nu ingevuld":"");

  const stempel=HH.state.read().running.id+"|"+(HH.state.read().running.gewijzigd||0);
  if(liveId!==stempel){liveId=stempel;
    if(document.activeElement!==$("l-dossier"))$("l-dossier").value=d?dosVeld(d):"";
    if(document.activeElement!==$("l-code"))$("l-code").value=codeNaam(d,HH.state.read().running.code);
    if(document.activeElement!==$("l-omschr"))$("l-omschr").value=HH.state.read().running.omschrijving||"";}
  $("l-code").classList.toggle("miss",isIndirect(d)&&!HH.state.read().running.code);

  /* Alleen buiten de NT-wizard mag het gewone live-veld automatisch de verplichte
     i7-keuzelijst opeisen. Tijdens de wizard beheert die zelf de focus. */
  if(HH.state.read().running.code)codeGevraagd=null;
  else if(!ntWizard&&isIndirect(d)&&!d.voorlopig&&codeGevraagd!==HH.state.read().running.id)eisCode();

  $("l-code").readOnly=!!(d&&(d.voorlopig||dvnDefinitiefI7(d)));
  $("l-code").placeholder=isIndirect(d)&&!d.voorlopig?"verplicht":"—";
  $("l-code").title=d&&(d.voorlopig||dvnDefinitiefI7(d))?
    "Deze tijd boekt altijd op "+codeNaam(d,defaultCode(d)):
    (isIndirect(d)?"Een i7-regel moet een werkcode hebben":"");
  hideWake();ntRender();}
