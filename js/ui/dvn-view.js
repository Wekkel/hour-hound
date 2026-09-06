"use strict";
function dvnAuditTekst(d){
  const st=dvnIntappState(d);
  if(st==="posted"&&d.dvnIntappPostedAt)return "Afgehandeld op "+
    new Date(d.dvnIntappPostedAt).toLocaleString("nl-NL",{dateStyle:"short",timeStyle:"short"});
  if(st==="needs_check")return "Controle nodig"+(d.dvnIntappNeedsCheckReason?
    " na "+d.dvnIntappNeedsCheckReason:"");
  return "";}
function dvnKaartHtml(d,afgehandeld){
  const rs=dvnRegels(d),rows=dvnBoekSnapshots(d),info=intappDossierInfo(d),dagen={},st=dvnIntappState(d);
  rows.forEach(r=>{dagen[r.date]=(dagen[r.date]||0)+r.hours;});
  const totaal=rows.reduce((s,r)=>s+r.hours,0);
  const det=rows.slice().sort((a,b)=>a.date.localeCompare(b.date))
    .map(r=>'<tr><td class="mono">'+esc(kortDag(r.date))+'</td><td class="mono">'+
      esc(r.code||'—')+'</td><td>'+esc(r.description||'')+
      '</td><td class="mono" style="text-align:right">'+uu(r.hours)+'</td></tr>').join("");
  const dagtekst=Object.keys(dagen).sort().map(k=>kortDag(k)+" "+uu(dagen[k])).join(" · ")||"nog geen uren";
  const audit=dvnAuditTekst(d);
  const nummerActie=d.voorlopig?'<button class="sm go" data-dvn-num="'+esc(d.id)+'">Dossiernummer toekennen</button>':
    '<button class="sm" data-dvn-num="'+esc(d.id)+'">Dossiernummer aanpassen</button>';
  const boekActie=!afgehandeld&&(st==="ready"||st==="needs_check")?
    '<button class="sm go" data-dvn-post="'+esc(d.id)+'">Boeken in Intapp</button>':'';
  const eindActie=!afgehandeld&&st==="missing"?
    '<button class="sm ghost warn" data-dvn-final-i7="'+esc(d.id)+'">Naar definitief i7</button>':'';
  const acties=nummerActie+boekActie+eindActie+
    (rows.length?'<button class="sm" data-dvn-day="'+esc(rows[0].date)+'">Toon eerste dag</button>':'');
  return '<div class="dvncard '+esc(st||'dvn')+'" data-dvn-card="'+esc(d.id)+'">'+
    '<div class="dvnhead"><div><strong>'+esc(d.naam)+'</strong> '+
    '<span class="tag dvn">'+esc(dvnStatusTekst(d))+'</span></div>'+ 
    '<span class="mono">'+rows.length+' boekregel(s) · '+uu(totaal)+' u</span></div>'+ 
    '<div class="hint">Intapp: '+esc(info.nummer||'geen nummer')+' · '+esc(info.naam||'geen naam')+
    ' · '+esc(dagtekst)+'</div>'+(audit?'<div class="hint">'+esc(audit)+'</div>':'')+
    '<div class="bar mini">'+acties+
    '</div><details><summary>Toon boekregels</summary><div class="tw"><table><thead><tr><th>Dag</th><th>Werkcode</th><th>Omschrijving</th><th style="text-align:right">Uren</th></tr></thead><tbody>'+ 
    (det||'<tr><td colspan="4" class="hint">Geen regels.</td></tr>')+
    '</tbody></table></div></details></div>';}
function renderDvnIntapp(){
  const el=$("dvn-intapp");if(!el)return;
  const volg={needs_check:0,ready:1,missing:2,"":3};
  const ds=HH.state.selectors.dvnDossiers({isDvn,isFinalI7:dvnDefinitiefI7})
    .filter(d=>!d.archief).sort((a,b)=>
    (volg[dvnIntappState(a)]??9)-(volg[dvnIntappState(b)]??9)||a.naam.localeCompare(b.naam));
  if(!ds.length){el.innerHTML='<div class="hint">Geen DVN-dossiers.</div>';return;}
  const open=ds.filter(d=>dvnIntappState(d)!=="posted");
  const klaar=ds.filter(d=>dvnIntappState(d)==="posted").sort((a,b)=>
    (b.dvnIntappPostedAt||"").localeCompare(a.dvnIntappPostedAt||""));
  const openHtml='<div id="dvn-open"><div class="cap">Open werkvoorraad</div>'+ 
    (open.length?open.map(d=>dvnKaartHtml(d,false)).join(""):
      '<div class="hint" style="margin:.5rem 0">Geen open DVN-acties.</div>')+'</div>';
  const klaarHtml=klaar.length?'<details id="dvn-done" style="margin-top:.8rem"><summary>Afgehandeld ('+
    klaar.length+')</summary>'+klaar.map(d=>dvnKaartHtml(d,true)).join("")+'</details>':'';
  el.innerHTML=openHtml+klaarHtml;}
