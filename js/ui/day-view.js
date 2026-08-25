"use strict";
function renderDagStatus(){
  const el=$("d-status");if(!el)return;
  const isWerkdag=werkdag(viewDate);
  const huidig=dagIntappTotaal(viewDate),tekort=dagTekort(viewDate),ds=dagSluitStatus(viewDate),gesloten=ds.gesloten;
  const oudOpen=isWerkdag&&viewDate<today()&&!gesloten&&dagRegels(viewDate).some(r=>r.soort!=="pauze");
  const loopt=running&&running.datum===viewDate;
  const cls=gesloten?"closed":"open";
  el.className="daystatus "+cls;
  const status=!isWerkdag?(gesloten?("Weekenddag · afgesloten om "+ds.eind):"Weekenddag"):
    (gesloten?("Afgesloten om "+ds.eind):(ds.heropend?"Heropende werkdag":(oudOpen?"Open eerdere werkdag":"Open werkdag")));
  let h='<span class="main">Status: '+esc(status)+'</span>'+ 
    (isWerkdag?'<span>Verantwoord <b class="metric">'+uu(huidig)+'</b> / '+uu(NORM)+' u</span>'+ 
      '<span>Nog nodig <b class="metric">'+uu(tekort)+'</b> u</span>':
      '<span>Verantwoord <b class="metric">'+uu(huidig)+'</b> u · geen 8,0-uursnorm</span>');
  const autos=autoAanvulRegels(viewDate),audit=auditSamenvatting(viewDate);
  if(autos.length)h+='<span class="warnline">Automatische Diversen-regels: '+autos.length+'</span>';
  if(audit)h+='<span class="auditline">'+esc(audit)+'</span>';
  if(loopt)h+='<span class="warnline">Er loopt nog een regel op deze dag.</span>';
  if(oudOpen)h+='<span class="warnline">Deze dag staat nog open.</span>';
  h+='<div class="spacer"></div>';
  if(!gesloten){
    if(isWerkdag)h+='<button class="sm go" data-close-current="1">Sluit deze dag af</button>';
  }else{
    h+='<button class="sm ghost" data-reopen-current="1">Heropen dag</button>';
    if(tekort>0.05&&!(running&&running.datum===viewDate))h+='<button class="sm" data-fill-current="1">Aanvullen tot 8,0</button>';
  }
  el.innerHTML=h;}

/* ---------- weergave: DAG ---------- */
function bouwDag(){
  $("d-label").textContent=dagLabel(viewDate)+
    (dagSluitStatus(viewDate).gesloten?" · afgesloten om "+dagSluitStatus(viewDate).eind:"");
  const gaps=gapsFor(regels,viewDate),rows=[];
  regels.forEach(r=>rows.push({t:"r",r,k:hm2m(r.start)||0}));
  gaps.forEach(g=>rows.push({t:"g",g,k:g[0]}));
  rows.sort((a,b)=>a.k-b.k);
  let h='<thead><tr><th>Van</th><th>Tot</th><th>Dossier</th><th>Werkcode</th>'+
    '<th>Omschrijving</th><th style="text-align:right">Uren</th><th></th></tr></thead><tbody>';
  rows.forEach(row=>{
    if(row.t==="g"){
      h+='<tr class="void"><td class="t mono">'+m2hm(row.g[0])+'</td><td class="t mono">'+
        m2hm(row.g[1])+'</td><td colspan="3">niet verantwoord</td>'+
        '<td class="mono" style="text-align:right">'+uu(Math.ceil((row.g[1]-row.g[0])/6)/10)+
        '</td><td class="x"><button class="sm ghost" data-fill="'+row.g[0]+"-"+row.g[1]+
        '" title="Deze tijd invullen">&#9998;</button></td></tr>';return;}
    const r=row.r,d=dosOf(r.dossierId),run=running&&running.id===r.id,booked=regelIsGeboekt(r);
    h+='<tr class="'+(run?"isrun ":"")+(r.soort==="pauze"?"ispauze ":"")+(r.autoAanvul?"isauto ":"")+(booked?"needsreview":"")+'" data-id="'+esc(r.id)+'">'+
      (r.autoAanvul?'<td class="t"><span class="muted">admin.</span></td><td class="t"><span class="muted">—</span></td>':
        '<td class="t"><input data-f="start" readonly title="Open bewerksheet" value="'+esc(r.start)+'"></td>'+
        '<td class="t"><input data-f="eind" readonly title="Open bewerksheet" value="'+esc(run?"":(r.eind||""))+
          '" placeholder="'+(run?"loopt":"")+'"></td>')+
      '<td><input data-f="dossier" readonly title="Open bewerksheet" value="'+esc(dosVeld(d))+'" placeholder="&mdash;" autocomplete="off"></td>'+
      '<td><input data-f="code" readonly title="Open bewerksheet" class="'+(codeFout(d,r)?"miss":"")+'" value="'+
        esc(codeNaam(d,r.code))+'" placeholder="'+
        (isIndirect(d)&&!d.voorlopig?"verplicht":"&mdash;")+'" autocomplete="off"'+
        (d&&(d.voorlopig||dvnDefinitiefI7(d))?' readonly title="Vast op '+esc(codeNaam(d,defaultCode(d)))+
          '"':"")+"></td>"+
      '<td><input data-f="omschrijving" readonly title="Open bewerksheet" value="'+esc(r.omschrijving)+'" autocomplete="off"></td>'+
      '<td class="u"><input data-f="uren" readonly title="Open bewerksheet" value="'+uu(urenOf(r))+'"></td>'+
      '<td class="x">'+
      (r.autoAanvul?'<span class="autobadge" title="Automatisch aangemaakt bij dagaanvulling">auto</span>':"")+
      '<button class="sm ghost" data-edit="'+esc(r.id)+'" title="Tijdregel bewust bewerken">bewerk</button>'+ 
      ((!run&&r.eind&&viewDate===today()&&r.soort!=="pauze")?
        '<button class="sm ghost" data-maaklopend="'+esc(r.id)+
        '" title="Maak dit de lopende timer">&#9654;</button>':"")+
      '<button class="sm ghost warn" data-del="'+esc(r.id)+'">&#10005;</button></td></tr>';});
  $("d-table").innerHTML=h+"</tbody>";verversDag();}
function verversDag(){
  renderRecent();renderTot();renderDagStatus();
  $("d-tot").textContent=uu(totaal(regels));
  $("d-void").textContent=uu(gapHours(gapsFor(regels,viewDate)));
  $("d-pauze").textContent=uu(pauzeUren(regels));
  const vulMag=werkdag(viewDate)&&dagSluitStatus(viewDate).gesloten&&!(running&&running.datum===viewDate);
  $("d-fill").style.display=werkdag(viewDate)?"":"none";
  $("d-fill").disabled=!vulMag;
  $("d-fill").title=!werkdag(viewDate)?"Weekenddagen hebben geen 8-uursaanvulling":
    (vulMag?"Vul het administratieve dagtotaal aan tot 8,0 uur":
    "Beschikbaar nadat deze werkdag met E is afgesloten");
  bouwSum();boekStat();}

function sumRows(){return sumVan(regels);}

/* Blokkerende fouten maken de dag onboekbaar: die kunnen niet met "toch boeken"
   worden gepasseerd. Waarschuwingen mogen wel bevestigd worden.                */
function controleer(){
  return valideerBoekDag(regels);}
const blokFouten=()=>controleer().filter(x=>x.blok);
const waarschuwingen=()=>controleer().filter(x=>!x.blok);
function toonBlokkade(probs,wat){
  L("boeken-geblokkeerd",wat+" · "+probs.length+" fout(en)");
  alert("Deze dag kan nog niet naar Intapp:\n\n"+
    probs.slice(0,10).map(x=>"• "+x.tekst).join("\n")+
    (probs.length>10?"\n• …":"")+
    "\n\nDit zijn blokkerende fouten. Los ze eerst op onder Dag.");}

function bouwSum(){
  const rs=sumRows(),probs=controleer();
  const box=$("d-probs");
  box.className="probs"+(probs.length?" on":"");
  const nBlok=probs.filter(x=>x.blok).length;
  box.innerHTML=probs.length?"<strong>"+(nBlok?nBlok+" blokkerend"+
    (nBlok>1?"e fouten":"e fout"):"Nog te controleren")+
    (nBlok&&probs.length>nBlok?" · "+(probs.length-nBlok)+" waarschuwing"+
      (probs.length-nBlok>1?"en":""):"")+"</strong>"+
    probs.map(x=>'<div class="pb'+(x.blok?" blok":"")+'" data-goto="'+esc(x.id)+'">'+
      (x.blok?"⛔ ":"⚠ ")+esc(x.tekst)+"</div>").join(""):"";
  if(!rs.length){$("d-sum").innerHTML='<tbody><tr><td class="hint">Nog niets.</td></tr></tbody>';return;}
  const tot=rs.reduce((s,x)=>s+x.u,0);
  $("d-sum").innerHTML='<thead><tr><th>Dag</th><th>Dossiernummer</th><th>Dossiernaam</th>'+
    '<th>Werkcode</th><th>Omschrijving</th><th style="text-align:right">Uren</th></tr></thead><tbody>'+
    rs.map(x=>'<tr><td class="mono">'+esc(kortDag(viewDate))+'</td><td class="mono">'+esc(x.nummer)+
      "</td><td>"+esc(x.naam)+(x.dvnStatus?' <span class="tag dvn">'+esc(x.dvnStatus)+"</span>":"")+
      '</td><td'+(x.mist?' class="bad"':"")+">"+
      esc(x.code||(x.mist?"ontbreekt":""))+"</td><td>"+esc(x.oms)+
      '</td><td class="mono" style="text-align:right">'+uu(x.u)+"</td></tr>").join("")+
    '</tbody><tfoot><tr><td colspan="5">Totaal</td><td class="mono" style="text-align:right">'+
    uu(tot)+"</td></tr></tfoot>";}
