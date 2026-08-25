"use strict";
function dvnAuditTekst(d){
  const st=dvnIntappState(d);
  if(st==="posted"&&d.dvnIntappPostedAt)return "Afgehandeld op "+
    new Date(d.dvnIntappPostedAt).toLocaleString("nl-NL",{dateStyle:"short",timeStyle:"short"});
  if(st==="needs_check")return "Controle nodig"+(d.dvnIntappNeedsCheckReason?
    " na "+d.dvnIntappNeedsCheckReason:"");
  return "";}
function dvnKaartHtml(d,afgehandeld){
  const rs=dvnRegels(d),info=intappDossierInfo(d),dagen={},st=dvnIntappState(d);
  rs.forEach(r=>{dagen[r.datum]=(dagen[r.datum]||0)+urenOf(r);});
  const totaal=rs.reduce((s,r)=>s+urenOf(r),0);
  const det=rs.slice().sort((a,b)=>(a.datum+a.start)<(b.datum+b.start)?-1:1)
    .map(r=>'<tr><td class="mono">'+esc(kortDag(r.datum))+'</td><td class="mono">'+
      esc(r.start+'–'+(r.eind||'loopt'))+'</td><td>'+esc((r.omschrijving||'').replace(VOOR,''))+
      '</td><td class="mono" style="text-align:right">'+uu(urenOf(r))+'</td></tr>').join("");
  const dagtekst=Object.keys(dagen).sort().map(k=>kortDag(k)+" "+uu(dagen[k])).join(" · ")||"nog geen uren";
  const audit=dvnAuditTekst(d);
  const nummerActie=d.voorlopig?'<button class="sm go" data-dvn-num="'+esc(d.id)+'">Dossiernummer toekennen</button>':
    '<button class="sm" data-dvn-num="'+esc(d.id)+'">Dossiernummer aanpassen</button>';
  const boekActie=!afgehandeld&&(st==="ready"||st==="needs_check")?
    '<button class="sm go" data-dvn-post="'+esc(d.id)+'">Boeken in Intapp</button>':'';
  const eindActie=!afgehandeld&&st==="missing"?
    '<button class="sm ghost warn" data-dvn-final-i7="'+esc(d.id)+'">Naar definitief i7</button>':'';
  const acties=nummerActie+boekActie+eindActie+
    (rs.length?'<button class="sm" data-dvn-day="'+esc(rs[0].datum)+'">Toon eerste dag</button>':'');
  return '<div class="dvncard '+esc(st||'dvn')+'" data-dvn-card="'+esc(d.id)+'">'+
    '<div class="dvnhead"><div><strong>'+esc(d.naam)+'</strong> '+
    '<span class="tag dvn">'+esc(dvnStatusTekst(d))+'</span></div>'+ 
    '<span class="mono">'+rs.length+' regel(s) · '+uu(totaal)+' u</span></div>'+ 
    '<div class="hint">Intapp: '+esc(info.nummer||'geen nummer')+' · '+esc(info.naam||'geen naam')+
    ' · '+esc(dagtekst)+'</div>'+(audit?'<div class="hint">'+esc(audit)+'</div>':'')+
    '<div class="bar mini">'+acties+
    '</div><details><summary>Toon regels</summary><div class="tw"><table><thead><tr><th>Dag</th><th>Tijd</th><th>Omschrijving</th><th style="text-align:right">Uren</th></tr></thead><tbody>'+ 
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
