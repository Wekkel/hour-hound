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
