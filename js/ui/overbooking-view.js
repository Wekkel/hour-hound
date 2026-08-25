"use strict";
/* ---------- gewone dossiers: tijdelijk i7, later overboeken ---------- */
let overboekPostIds=[];
function overboekingLijnen(o){
  const ls=Array.isArray(o&&o.targetLines)?o.targetLines:[];
  return ls.length?ls:[{werkcode:"",omschrijving:o&&o.description||"",uren:+(o&&o.hours)||0}];}
function overboekingHuidig(o){
  const rs=bronIdsVan(o).map(id=>alle.find(r=>r.id===id)).filter(Boolean);
  if(rs.length!==bronIdsVan(o).length)return{regels:rs,rows:[],lijnen:[],uren:0};
  const rows=sumVan(rs);
  const lijnen=rows.map(x=>({werkcode:x.code||"",omschrijving:x.oms||"",uren:x.u}));
  return{regels:rs,rows,lijnen,uren:lijnen.reduce((s,x)=>s+(+x.uren||0),0)};}
function overboekingKaartHtml(o){
  const st=overboekingState(o),wijz=overboekingWijzigingen(o),cur=overboekingHuidig(o);
  const opgeslagen=overboekingLijnen(o),d=dosOf(o.targetDossierId);
  const regels=opgeslagen.map(x=>'<tr><td class="mono">'+esc(kortDag(o.sourceDate))+
    '</td><td class="mono">'+esc(x.werkcode||'—')+'</td><td>'+esc(x.omschrijving||'')+'</td><td class="mono" style="text-align:right">'+
    uu(+x.uren||0)+'</td></tr>').join("");
  const controle=st==="needs_check"?'<div class="closewarn on" style="margin-top:.55rem">'+
    '<strong>Gewijzigd:</strong> '+esc(wijz.join(', '))+'.<br>Was: '+
    esc(o.targetNumberSnapshot+' · '+o.targetNameSnapshot+' · '+uu(o.hours)+' u')+
    '<br>Nu: '+esc((d?(d.nummer||'—')+' · '+d.naam:'doeldossier ontbreekt')+
      ' · '+uu(cur.uren)+' u')+'</div>':'';
  return '<div class="overcard" data-over-card="'+esc(o.id)+'"><div class="overhead">'+
    '<span class="pill'+(st==="needs_check"?' wait':'')+'">'+esc(overboekingStatusTekst(o))+'</span>'+
    '<strong>'+esc(o.targetNumberSnapshot||'—')+' · '+esc(o.targetNameSnapshot||'')+'</strong>'+
    '<span class="mono">'+bronIdsVan(o).length+' regel(s) · '+uu(o.hours)+' u</span></div>'+controle+
    (st==="done"&&o.targetBookedDate?'<div class="hint">Op dossier geboekt op '+esc(kortDag(o.targetBookedDate))+'</div>':'')+
    '<div class="overactions">'+(st==="needs_check"?'<button class="sm go" data-over-refresh="'+
      esc(o.id)+'">Bijgewerkte gegevens gebruiken</button>':'')+
    (overboekingOpen(o)?'<button class="sm ghost warn" data-over-final="'+esc(o.id)+'">Naar definitief i7</button>':'')+'</div>'+ 
    '<details><summary>Toon regels</summary><div class="tw"><table><thead><tr><th>Werkdatum</th><th>Werkcode</th><th>Omschrijving</th><th style="text-align:right">Uren</th></tr></thead><tbody>'+regels+
    '</tbody></table></div></details></div>';}
function renderOverboekingen(){
  const el=$("overboek-intapp");if(!el)return;
  const open=stateSelectors.overbookings({openOnly:true,isOpen:overboekingOpen}),
    klaar=stateSelectors.overbookings().filter(o=>o.status==="done"),groepen={};
  open.forEach(o=>{(groepen[o.targetDossierId]||(groepen[o.targetDossierId]=[])).push(o);});
  const ids=Object.keys(groepen);
  const openHtml=!ids.length?'<div class="hint">Geen regels die nog naar een dossier moeten.</div>':ids.map(id=>{const os=groepen[id].sort((a,b)=>a.sourceDate.localeCompare(b.sourceDate));
    const d=dosOf(id),blok=os.some(o=>overboekingState(o)==="needs_check");
    const totaal=os.reduce((s,o)=>s+(+o.hours||0),0),regels=os.reduce((s,o)=>s+bronIdsVan(o).length,0);
    return '<div class="dvncard"><div class="dvnhead"><div><strong>'+esc((d&&d.nummer)||os[0].targetNumberSnapshot||'—')+
      ' · '+esc((d&&d.naam)||os[0].targetNameSnapshot||'')+'</strong> <span class="tag">'+
      os.length+' item(s) · '+regels+' regel(s)</span></div><span class="mono">'+uu(totaal)+' u</span></div>'+ 
      '<div class="bar mini"><button class="sm go" data-over-post="'+esc(id)+'"'+
      (blok?' disabled title="Controleer eerst de gewijzigde items"':'')+'>Boeken op dossier</button></div>'+
      os.map(overboekingKaartHtml).join("")+'</div>';}).join("");
  const klaarHtml=klaar.length?'<details style="margin-top:.8rem"><summary>Afgehandeld ('+
    klaar.length+')</summary>'+klaar.sort((a,b)=>(b.doneAt||"").localeCompare(a.doneAt||""))
      .map(overboekingKaartHtml).join("")+'</details>':'';
  el.innerHTML=openHtml+klaarHtml;}
