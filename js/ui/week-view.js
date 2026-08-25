"use strict";
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
