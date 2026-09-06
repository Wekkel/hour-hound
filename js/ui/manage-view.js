"use strict";
/* ---------- beheer ---------- */
let bookingCorrectionMap=new Map();
function alleBookingSnapshots(){
  const out=[],rules=HH.state.read().rules,dates=[...new Set(rules.map(r=>r.datum))];
  dates.forEach(date=>sumVanData(rules.filter(r=>r.datum===date)).forEach(row=>
    out.push(bookingSnapshotVan(row,date))));return out;}
function bookingRegelHtml(s){return !s?'<span class="hint">Regels verwijderd</span>':
  '<span class="mono">'+esc(dmy(s.date))+' · '+esc(s.targetNumber||'—')+' · '+
  esc(s.code||'—')+' · '+uu(s.hours)+' u</span><br>'+esc(s.description||'');}
function renderBookingCorrections(){
  const el=$("booking-corrections");if(!el)return;
  const corrections=bookingCorrectionsFor(alleBookingSnapshots());bookingCorrectionMap=new Map(corrections.map(c=>[c.receiptId,c]));
  const history=HH.state.read().bookingHistory,legacy=(history.receipts||[]).some(r=>r.legacyInferred)||
    (history.legacyOrphans||[]).length,notice=legacy?
      '<div class="hint">Oude boekmarkeringen zijn behouden. De oorspronkelijke inhoud was niet volledig opgeslagen; gereconstrueerde boekingen zijn geen bewijs van het destijds gebruikte dossiernummer.</div>':"";
  if(!corrections.length){el.innerHTML=notice+'<div class="hint">Geen boekingscorrecties.</div>';return;}
  el.innerHTML=notice+corrections.map(c=>'<div class="dvncard needs_check">'+
    '<div class="dvnhead"><strong>Gewijzigd na boeken</strong><span class="tag warn">controle nodig</span></div>'+
    '<div class="cols"><div><span class="cap">Eerder bevestigd</span><div style="margin-top:.35rem">'+
    (c.beforeSnapshots||[c.before]).map(bookingRegelHtml).join("<hr>")+'</div></div><div><span class="cap">Huidig</span><div style="margin-top:.35rem">'+
    (c.currentOptions.length?c.currentOptions.map(bookingRegelHtml).join('<hr>'):
      '<span class="hint">Regels verwijderd</span>')+'</div></div></div>'+
    '<div class="bar mini"><button class="sm go" data-booking-resolve="'+esc(c.receiptId)+
    '">Correctie in Intapp afgehandeld</button></div></div>').join("");}
function renderBeheer(){
  renderBookingCorrections();
  renderDvnIntapp();
  renderOverboekingen();
  $("b-list").innerHTML=HH.state.read().dossiers.filter(d=>!dvnDefinitiefI7(d)).map(d=>{
    const inGebruik=HH.state.read().rules.some(r=>r.dossierId===d.id);
    const cs=(d.codes||[]).map(c=>'<span class="tag">'+esc(c.naam)+
      ' <button class="sm ghost warn" data-rmcode="'+esc(d.id)+"|"+esc(c.code)+
      '">&#10005;</button></span>').join(" ");
    return '<div style="padding:.7rem 0;border-top:1px solid var(--line)'+
      (d.archief?";opacity:.55":"")+'">'+
      '<div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">'+
      '<input class="mono" value="'+esc(d.nummer||"")+'" placeholder="nummer" data-dn="'+esc(d.id)+
      '" style="width:180px"'+(d.isI7||isDvn(d)?" disabled":"")+">"+
      '<input value="'+esc(d.naam)+'" data-dnm="'+esc(d.id)+'" style="flex:1;min-width:170px">'+
      '<select data-dl="'+esc(d.id)+'"><option value="nl"'+(d.lang!=="en"?" selected":"")+
      '>NL</option><option value="en"'+(d.lang==="en"?" selected":"")+">EN</option></select>"+
      (isDvn(d)?'<span class="tag dvn">'+esc(dvnStatusTekst(d))+'</span>'+ 
        '<button class="sm" data-nr="'+esc(d.id)+'">'+(d.voorlopig?'Nummer toekennen':'Nummer aanpassen')+'</button>'+ 
        ((dvnIntappState(d)==="ready"||dvnIntappState(d)==="needs_check")?'<button class="sm go" data-post="'+esc(d.id)+'">Boeken in Intapp</button>':"")+
        (dvnIntappState(d)==="missing"?'<button class="sm ghost warn" data-final-i7="'+esc(d.id)+'">Naar definitief i7</button>':""):"")+ 
      (d.archief?'<span class="tag">archief</span>'+
        '<button class="sm" data-unarch="'+esc(d.id)+'">Activeren</button>':"")+
      (d.isI7||d.archief?"":'<button class="sm ghost warn" data-deldos="'+esc(d.id)+'">'+
        (inGebruik?"Archiveren":"Verwijderen")+"</button>")+
      "</div>"+
      (isIndirect(d)?'<div class="hint" style="margin-top:.4rem">Gebruikt de i7-werklijst ('+
        HH.state.read().codes.length+" codes), "+(d.voorlopig?
          "vast op "+esc(codeNaam(d,defaultCode(d))):
          "per regel te kiezen")+"</div>":(d.dvn?'<div class="hint" style="margin-top:.4rem">Oorspronkelijke DVN-identiteit blijft bewaard; dossiercodes zijn nu optioneel.</div>':'' )+
      '<div style="margin-top:.45rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">'+
      cs+'<input placeholder="code" data-nc="'+esc(d.id)+'" style="width:110px" class="mono">'+
      '<input placeholder="naam" data-ncn="'+esc(d.id)+'" style="width:180px">'+
      '<button class="sm" data-addcode="'+esc(d.id)+'">+</button></div>')+"</div>";}).join("");
  $("libstat").textContent=HH.state.read().templates.length+" sjablonen · "+HH.state.read().codes.length+
    " i7-codes (vaste lijst uit werkcodes.json) · "+HH.state.read().rules.length+" regels";}
