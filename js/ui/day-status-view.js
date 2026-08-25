"use strict";
function dagRegels(datum){return stateSelectors.day(datum);} 
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
