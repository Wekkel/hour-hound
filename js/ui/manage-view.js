"use strict";
/* ---------- beheer ---------- */
function renderBeheer(){
  renderDvnIntapp();
  renderOverboekingen();
  $("b-list").innerHTML=dossiers.filter(d=>!dvnDefinitiefI7(d)).map(d=>{
    const inGebruik=alle.some(r=>r.dossierId===d.id);
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
        i7codes.length+" codes), "+(d.voorlopig?
          "vast op "+esc(codeNaam(d,defaultCode(d))):
          "per regel te kiezen")+"</div>":(d.dvn?'<div class="hint" style="margin-top:.4rem">Oorspronkelijke DVN-identiteit blijft bewaard; dossiercodes zijn nu optioneel.</div>':'' )+
      '<div style="margin-top:.45rem;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">'+
      cs+'<input placeholder="code" data-nc="'+esc(d.id)+'" style="width:110px" class="mono">'+
      '<input placeholder="naam" data-ncn="'+esc(d.id)+'" style="width:180px">'+
      '<button class="sm" data-addcode="'+esc(d.id)+'">+</button></div>')+"</div>";}).join("");
  $("libstat").textContent=templates.length+" sjablonen · "+i7codes.length+
    " i7-codes (vaste lijst uit werkcodes.json) · "+alle.length+" regels";}
