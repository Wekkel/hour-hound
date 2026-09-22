"use strict";
/* ---------- beheer ---------- */
let bookingCorrectionMap=new Map();
function alleBookingSnapshots(){
  const out=[],rules=HH.state.read().rules,dates=[...new Set(rules.map(r=>r.datum))];
  dates.forEach(date=>sumVanData(rules.filter(r=>r.datum===date)).forEach(row=>
    out.push(bookingSnapshotVan(row,date))));return out;}
function bookingRegelHtml(s,copyKey){
  if(!s)return '<span class="hint">Regels verwijderd</span>';
  const field=(label,value,key)=>'<div class="booking-field"><span class="cap">'+label+
    '</span><div class="booking-value">'+esc(value)+(copyKey!=null?'</div><button class="sm ghost" data-booking-copy="'+
      esc(copyKey)+'" data-booking-field="'+key+'">Kopieer '+label.toLowerCase()+'</button>':'</div>')+'</div>';
  return '<div class="hint">Werkdatum '+esc(dmy(s.date))+'</div>'+
    field('Dossier',s.targetNumber||'—','targetNumber')+
    field('Uren',uu(s.hours),'hours')+
    (s.code?field('Werkcode',s.code,'code'):'')+
    field('Omschrijving',s.description||'','description');
}
function renderBookingCorrections(){
  const el=$("booking-corrections");if(!el)return;
  const corrections=bookingCorrectionsFor(alleBookingSnapshots());bookingCorrectionMap=new Map(corrections.map(c=>[c.receiptId,c]));
  const history=HH.state.read().bookingHistory,legacy=(history.receipts||[]).some(r=>r.legacyInferred)||
    (history.legacyOrphans||[]).length,notice=legacy?
      '<div class="hint">Oude boekmarkeringen zijn behouden. De oorspronkelijke inhoud was niet volledig opgeslagen; gereconstrueerde boekingen zijn geen bewijs van het destijds gebruikte dossiernummer.</div>':"";
  if(!corrections.length){el.innerHTML=notice+'<div class="hint">Geen boekingscorrecties.</div>';return;}
  el.innerHTML=notice+corrections.map(c=>'<div class="dvncard needs_check">'+
    '<div class="dvnhead"><strong>Gewijzigd na boeken</strong><span class="tag warn">controle nodig</span></div>'+
    '<p class="hint">Controleer de eerdere boeking in Intapp en verwerk de huidige gegevens. Bevestig hieronder pas nadat de correctie is uitgevoerd.</p>'+
    '<div class="cols"><div><span class="cap">Eerder bevestigd</span><div style="margin-top:.35rem">'+
    (c.beforeSnapshots||[c.before]).map(s=>bookingRegelHtml(s)).join("<hr>")+'</div></div><div><span class="cap">Huidig</span><div style="margin-top:.35rem">'+
    (c.currentOptions.length?c.currentOptions.map((s,i)=>bookingRegelHtml(s,c.receiptId+'|'+i)).join('<hr>'):
      '<span class="hint">Regels verwijderd</span>')+'</div></div></div>'+
    '<div class="bar mini"><button class="sm go" data-booking-resolve="'+esc(c.receiptId)+
    '">Correctie in Intapp afgehandeld</button></div></div>').join("");}
function renderBeheer(){
  if($("manage-worklist"))renderBeheerWerk();
  else{renderBookingCorrections();renderDvnIntapp();renderOverboekingen();}
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

/* Dossierwerkvoorraad: uitsluitend een afgeleide weergave, geen extra opslag. */
let beheerUi={section:"work",query:"",filter:"open",group:null,dossierIds:[],title:"",taskKey:null,line:0,seen:[],signature:"",busy:false,error:"",scroll:0,scopeDate:null,progress:{}};
let beheerGroups=[],beheerShown=null;
function beheerWerkData(){
  const state=HH.state.read(),snapshots=alleBookingSnapshots(),corrections=bookingCorrectionsFor(snapshots),
    overs=state.overbookings.filter(overboekingOpen),
    dvnTasks=state.dossiers.filter(d=>isDvn(d)&&!dvnDefinitiefI7(d)).map(d=>({dossierId:d.id,state:dvnIntappState(d)})).filter(t=>t.state!=="posted");
  const groups=groepeerBeheerWerk({dossiers:state.dossiers,rules:state.rules,corrections,overbookings:overs,dvnTasks});
  const blockedIds=new Set(corrections.flatMap(c=>(c.beforeSnapshots||[c.before]).concat(c.currentOptions||[]).flatMap(bookingBronIds))),
    parkedIds=new Set(overs.flatMap(bronIdsVan)),usedBookings=new Set();
  for(const group of groups){
    group.tasks=[];
    for(const c of group.corrections)group.tasks.push({key:"correction:"+c.receiptId,type:"correction",label:"Boekingscorrectie controleren",correction:c,
      lines:c.currentOptions.length?c.currentOptions:[null]});
    for(const item of group.dvnTasks){
      const d=dosOf(item.dossierId);if(!d)continue;
      if(group.uncertain){group.tasks.push({key:"inspect:"+d.id,type:"inspect",label:"Dossierkoppeling controleren",dossierId:d.id,lines:[]});continue;}
      if(item.state==="missing"){group.tasks.unshift({key:"number:"+d.id,type:"number",label:"Dossiernummer toekennen",dossierId:d.id,lines:[]});continue;}
      const rs=dvnRegels(d),ids=new Set(rs.map(r=>r.id));
      if(!rs.length||!dvnResolvedNummer(d)||rs.some(r=>blockedIds.has(r.id)))continue;
      const legacy=d.dvnIntappStatus==="needs_check"&&(d.dvnIntappPostedRuleIds||[]).length&&
        !state.bookingHistory.receipts.some(r=>r.dossierId===d.id||(r.snapshot.sources||[]).some(x=>x.dossierId===d.id));
      if(legacy){group.tasks.push({key:"legacy:"+d.id,type:"legacy",label:"Oude DVN-boeking controleren",dossierId:d.id,
        lines:dvnBoekSnapshots(d).filter(s=>!bookingBewijsVoor(state.bookingHistory,s))});continue;}
      for(const snapshot of snapshots){
        const sources=bookingBronIds(snapshot),key=bookingSemanticKey(snapshot);
        if(!sources.some(id=>ids.has(id))||sources.some(id=>blockedIds.has(id)||parkedIds.has(id))||usedBookings.has(key)||
          bookingBewijsVoor(state.bookingHistory,snapshot))continue;
        usedBookings.add(key);
        const aggregate=sumVanData(state.rules.filter(r=>r.datum===snapshot.date)).find(row=>
          JSON.stringify(bookingBronIds(row))===JSON.stringify(sources));
        group.tasks.push({fingerprint:aggregate?aggregate.fp:key,key:"book:"+key,type:"book",label:"Boeken op dossier",snapshot,lines:[snapshot]});
      }
    }
    for(const record of group.overbookings){
      if(bronIdsVan(record).some(id=>blockedIds.has(id)))continue;
      const check=overboekingState(record)==="needs_check",d=dosOf(record.targetDossierId),info=d&&intappDossierInfo(d);
      group.tasks.push({key:"over:"+record.id,type:check?"overcheck":"overpost",label:check?"Geparkeerde uren controleren":"Van tijdelijk i7 naar dossier",record,
        lines:(check?overboekingHuidig(record).lijnen:overboekingLijnen(record)).map(x=>({date:record.sourceDate,targetNumber:info&&info.nummer||record.targetNumberSnapshot,
          code:x.werkcode,description:x.omschrijving,hours:x.uren}))});
    }
    if(beheerUi.scopeDate)group.tasks=group.tasks.filter(t=>(t.type==="number"||t.type==="inspect")?dvnRegels(dosOf(t.dossierId)).some(r=>r.datum===beheerUi.scopeDate):
      t.lines.some(s=>s&&s.date===beheerUi.scopeDate)||(t.correction&&(t.correction.beforeSnapshots||[t.correction.before]).some(s=>s&&s.date===beheerUi.scopeDate)));
  }
  // Dossiers zonder werk blijven vindbaar via de filters, zonder lege DVN-acties.
  for(const d of state.dossiers){
    if(d.dvnTo&&state.dossiers.some(x=>x.id===d.dvnTo))continue;
    if(!groups.some(g=>g.dossierIds.includes(d.id)))groups.push({id:d.id,name:d.naam,number:d.nummer||"",dossierIds:[d.id],tasks:[],uncertain:false});
  }
  return groups.sort((a,b)=>Number(!a.tasks.length)-Number(!b.tasks.length)||a.name.localeCompare(b.name));
}
function beheerTaakSignature(task){return JSON.stringify([task.type,task.lines,task.correction||null,task.record||null,task.dossierId||null]);}
function beheerSamenvatting(group){
  const counts={};group.tasks.forEach(t=>{counts[t.label]=(counts[t.label]||0)+1;});
  return Object.entries(counts).map(([label,n])=>n+" × "+label.toLowerCase()).join(" · ")||"Geen open acties";
}
function renderBeheerWerk(){
  const list=$("manage-worklist");if(!list)return;
  beheerGroups=beheerWerkData();
  if(beheerUi.group){
    const match=beheerGroups.find(g=>g.id===beheerUi.group)||beheerGroups.find(g=>!g.uncertain&&g.dossierIds.some(id=>beheerUi.dossierIds.includes(id)));
    if(match){beheerUi.group=match.id;beheerUi.dossierIds=match.dossierIds.slice();beheerUi.title=(match.number?match.number+" · ":"")+match.name;}
  }
  $("manage-work").hidden=beheerUi.section!=="work";$("manage-dossiers").hidden=beheerUi.section!=="dossiers";$("manage-settings").hidden=beheerUi.section!=="settings";
  document.querySelectorAll("[data-manage-section]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.manageSection===beheerUi.section)));
  $("manage-overview").hidden=!!beheerUi.group;$("manage-flow").hidden=!beheerUi.group;
  const q=beheerUi.query.trim().toLowerCase(),visible=beheerGroups.filter(g=>(beheerUi.filter==="all"||(beheerUi.filter==="done"?!g.tasks.length:!!g.tasks.length))&&
    (g.name+" "+g.number+" "+g.dossierIds.map(id=>{const d=dosOf(id);return d?d.naam:"";}).join(" ")).toLowerCase().includes(q));
  $("manage-scope").hidden=!beheerUi.scopeDate;
  $("manage-scope-text").textContent=beheerUi.scopeDate?"Acties bij "+dmy(beheerUi.scopeDate):"";
  $("manage-count").textContent=visible.length+" dossier(s) · "+visible.reduce((n,g)=>n+g.tasks.length,0)+" open actie(s)";
  list.innerHTML=visible.map(g=>'<div class="manage-row"><div><strong>'+esc(g.number?g.number+' · '+g.name:g.name)+
    '</strong><div class="hint">'+esc(beheerSamenvatting(g))+'</div></div><button class="sm'+(g.tasks.length?' go':'')+'" data-manage-open="'+esc(g.id)+'">'+
    (g.tasks.length?'Afhandelen':'Bekijken')+'</button></div>').join("")||'<p class="hint">Geen dossiers binnen dit filter.</p>';
  if(beheerUi.group)renderBeheerFlow();
}
function beheerHistorieHtml(group){
  if(!group)return "";
  const state=HH.state.read(),ids=new Set(group.dossierIds),ruleIds=new Set(state.rules.filter(r=>ids.has(r.dossierId)).map(r=>r.id));
  state.dossiers.filter(d=>d.dvnTo===group.id).forEach(d=>ids.add(d.id));
  state.rules.filter(r=>ids.has(r.dossierId)).forEach(r=>ruleIds.add(r.id));
  const receipts=state.bookingHistory.receipts.filter(r=>ids.has(r.dossierId)||
    (r.snapshot.sources||[]).some(x=>ids.has(x.dossierId))||bookingBronIds(r.snapshot).some(id=>ruleIds.has(id))),
    completed=state.overbookings.filter(o=>ids.has(o.targetDossierId)&&!overboekingOpen(o));
  return '<details class="manage-history"><summary>Historie ('+(receipts.length+completed.length)+')</summary>'+ 
    receipts.map(r=>'<div class="booking-field"><span class="hint">Eerdere bevestiging'+(r.channel==="overbooking_i7"?' op tijdelijk i7':'')+
      '</span>'+bookingRegelHtml(r.snapshot)+'</div>').join('')+
    completed.map(o=>'<p>'+esc(overboekingStatusTekst(o)+' · '+(o.targetNumberSnapshot||'')+' · '+uu(o.hours)+' u')+'</p>').join('')+
    (!receipts.length&&!completed.length?'<p class="hint">Geen eerdere bevestigingen voor dit dossier.</p>':'')+'</details>';
}
function renderBeheerFlow(){
  const group=beheerGroups.find(g=>g.id===beheerUi.group),tasks=group?group.tasks:[];
  let task=tasks.find(t=>t.key===beheerUi.taskKey)||tasks[0];
  if(task){const signature=beheerTaakSignature(task);if(signature!==beheerUi.signature){
      const saved=beheerUi.progress[task.key];beheerUi.taskKey=task.key;
      beheerUi.line=saved&&saved.signature===signature?saved.line:0;
      beheerUi.seen=saved&&saved.signature===signature?saved.seen.slice():[];beheerUi.signature=signature;
    }
    beheerUi.line=Math.min(beheerUi.line,Math.max(0,task.lines.length-1));}
  if(task)beheerUi.progress[task.key]={signature:beheerUi.signature,line:beheerUi.line,seen:beheerUi.seen.slice()};
  beheerShown=task?JSON.parse(JSON.stringify(task)):null;
  const top='<div class="manage-flow-head"><button class="sm ghost" data-manage-back>← Dossiers</button><strong>'+esc(beheerUi.title)+
    '</strong><span class="hint">'+tasks.length+' open actie(s)</span></div>';
  if(!task){$("manage-flow").innerHTML=top+'<div class="manage-flow-body"><h2>Geen open acties voor dit dossier</h2><p>Er staan binnen deze selectie geen acties meer open.</p>'+beheerHistorieHtml(group)+'</div>'+ 
    '<div class="manage-flow-foot"><button class="go" data-manage-back>Terug naar dossiers</button></div>';return;}
  const line=task.lines[beheerUi.line],multi=task.lines.length>1,last=beheerUi.line>=task.lines.length-1;
  const field=(label,value,key)=>'<div class="booking-field"><span class="cap">'+label+'</span><div class="booking-value">'+esc(value)+
    '</div><button class="sm ghost" data-manage-copy="'+key+'">Kopieer '+label.toLowerCase()+'</button></div>';
  let body='<h2>'+esc(task.label)+'</h2>';
  if(task.type==="inspect")body+='<p>De dossierkoppeling is niet eenduidig. Controleer het dossiernummer en de bronregels voordat je uren boekt.</p>';
  else if(task.type==="number")body+='<p>Deze DVN wacht op een definitief dossiernummer. Na toekennen worden de boekingsacties opnieuw bepaald.</p>';
  else{
    if(task.type==="correction")body+='<p class="hint">Pas de bestaande Intapp-boeking aan. Voeg deze uren niet nogmaals als nieuwe boeking toe.</p>';
    if(task.type==="legacy")body+='<p class="closewarn on">Eerdere invoer is niet volledig bewaard. Controleer de bestaande Intapp-boeking; voeg deze uren niet opnieuw toe.</p>';
    if(task.type==="overpost")body+='<p class="hint">Boek op het echte dossier. De eerdere tijdelijke i7-boeking blijft in de historie staan.</p>';
    if(task.type==="overcheck")body+='<p class="closewarn on">Controleer eerst de gewijzigde brongegevens: '+esc(overboekingWijzigingen(task.record).join(', '))+'. Na bevestiging volgt de actuele boekregel.</p>';
    if(multi)body+='<p class="hint">Regel '+(beheerUi.line+1)+' van '+task.lines.length+' · Deze regels vormen samen één bevestiging, die pas na de laatste regel wordt opgeslagen. Controleer eerder ingevoerde regels; voer ze niet dubbel in.</p>';
    body+=line?'<div class="hint">Werkdatum '+esc(dmy(line.date))+'</div>'+field('Dossier',line.targetNumber||'—','targetNumber')+
      field('Uren',uu(line.hours),'hours')+(line.code?field('Werkcode',line.code,'code'):'')+field('Omschrijving',line.description||'','description'):
      '<p>De oorspronkelijke tijdregels zijn verwijderd. Controleer de bijbehorende verwijdering in Intapp.</p>';
    if(task.correction){
      const before=task.correction.beforeSnapshots||[task.correction.before],old=before[0],changed=[];
      if(!line)changed.push("tijdregels verwijderd");
      else if(old){if(old.targetNumber!==line.targetNumber)changed.push("dossier "+(old.targetNumber||"—")+" → "+(line.targetNumber||"—"));
        if(old.code!==line.code)changed.push("werkcode gewijzigd");if(old.hours!==line.hours)changed.push("uren gewijzigd");
        if(old.description!==line.description)changed.push("omschrijving gewijzigd");}
      body+='<p class="hint"><strong>Gewijzigd:</strong> '+esc(changed.join(" · ")||"indeling van de boeking")+'</p>';
    }
    if(task.correction)body+='<details'+(!line?' open':'')+'><summary>Eerder bevestigd — volledige gegevens</summary>'+(task.correction.beforeSnapshots||[task.correction.before]).map(s=>bookingRegelHtml(s)).join('<hr>')+'</details>';
  }
  const complete=last&&Array.from({length:Math.max(0,task.lines.length-1)},(_,i)=>i).every(i=>beheerUi.seen.includes(i));
  const label=task.type==="inspect"?"Dossiergegevens openen":task.type==="number"?'Nummer toekennen':!last?'Gecontroleerd · volgende':!complete?'Controleer eerst de eerdere regels':
    task.type==="overcheck"?'Gegevens gecontroleerd':task.type==="correction"||task.type==="legacy"?'Correctie in Intapp afgehandeld':'In Intapp geboekt';
  $("manage-flow").innerHTML=top+'<div class="manage-flow-body">'+
    '<label class="hint">Actie <select id="manage-task"'+(beheerUi.busy?' disabled':'')+'>'+tasks.map(t=>'<option value="'+esc(t.key)+'"'+(t.key===task.key?' selected':'')+'>'+esc(t.label)+'</option>').join('')+'</select></label>'+body+
    beheerHistorieHtml(group)+(beheerUi.error?'<p class="closewarn on" role="alert">'+esc(beheerUi.error)+'</p>':'')+'</div><div class="manage-flow-foot">'+
    (beheerUi.line?'<button class="sm" data-manage-prev>Vorige regel</button>':'')+
    '<button class="sm ghost" data-manage-later>Later doen</button>'+ 
    (task.type==="number"?'<button class="sm ghost warn" data-manage-final>Definitief i7</button>':task.record?'<button class="sm ghost warn" data-manage-final>Definitief i7</button>':'')+
    '<button class="go" data-manage-confirm'+(beheerUi.busy||(last&&!complete&&task.type!=="number")?' disabled':'')+'>'+label+'</button></div>';
}

/* Pure grouping for the Beheer work queue.  Keep this here (instead of in a
   service worker asset) so callers can use the same small contract in a
   browserless check and in the view. */
function groepeerBeheerWerk(input){
  const o=input&&typeof input==="object"?input:{},ds=Array.isArray(o.dossiers)?o.dossiers:[],
    rules=Array.isArray(o.rules)?o.rules:[],byId=new Map(ds.filter(d=>d&&d.id!=null).map(d=>[String(d.id),d])),
    ruleDossiers=new Map(),reviewId="__manage_review__";
  rules.forEach(r=>{
    if(!r||r.id==null||r.dossierId==null)return;
    const id=String(r.id),did=String(r.dossierId),list=ruleDossiers.get(id)||[];
    if(!list.includes(did))list.push(did);ruleDossiers.set(id,list);
  });

  /* Resolve aliases defensively. A broken link stays attached to its source;
     a cycle gets one stable key so all members remain together. */
  const resolvedCache=new Map();
  function resolve(id){
    const start=String(id==null?"":id);if(!start)return{key:"",uncertain:true};
    if(resolvedCache.has(start))return resolvedCache.get(start);
    const path=[],seen=new Map();let cur=start,uncertain=false,key="";
    while(cur){
      if(resolvedCache.has(cur)){const tail=resolvedCache.get(cur);key=tail.key;uncertain=uncertain||tail.uncertain;break;}
      if(seen.has(cur)){
        const cycle=path.slice(seen.get(cur));key=cycle.slice().sort()[0]||cur;uncertain=true;break;
      }
      seen.set(cur,path.length);path.push(cur);
      const d=byId.get(cur);if(!d){key=cur;uncertain=true;break;}
      if(d.dvnTo!=null&&String(d.dvnTo)){const next=String(d.dvnTo);
        if(!byId.has(next)){key=cur;uncertain=true;break;}cur=next;continue;}
      key=cur;break;
    }
    const result={key:key||start,uncertain};path.forEach(p=>resolvedCache.set(p,result));
    return result;
  }
  const groups=new Map(), copies=x=>Array.isArray(x)?x.map(v=>v&&typeof v==="object"?Object.assign({},v):v):[];
  function groupFor(key,uncertain){
    if(key===reviewId){let g=groups.get(reviewId);if(!g){g={id:reviewId,name:"Toewijzing controleren",number:"",dossierIds:[],corrections:[],overbookings:[],dvnTasks:[],uncertain:true};groups.set(reviewId,g);}return g;}
    let g=groups.get(key),d=byId.get(key);
    if(!g){g={id:key,name:d&&d.naam||"Dossier niet meer beschikbaar",number:d&&d.nummer||"",dossierIds:[],corrections:[],overbookings:[],dvnTasks:[],uncertain:!!uncertain};groups.set(key,g);}
    g.uncertain=g.uncertain||!!uncertain;return g;
  }
  function addDossierIds(g,ids){ids.forEach(id=>{const s=String(id);if(s&&!g.dossierIds.includes(s))g.dossierIds.push(s);});}
  function candidates(ids,fallbackSources){
    const out=[],all=Array.isArray(ids)?ids:[];
    all.forEach(sourceId=>{
      const sid=String(sourceId),mapped=ruleDossiers.get(sid);
      if(mapped&&mapped.length)mapped.forEach(x=>out.push(x));
      else (fallbackSources||[]).forEach(s=>{if(s&&String(s.id||"")===sid&&s.dossierId!=null)out.push(String(s.dossierId));});
    });
    return [...new Set(out)];
  }
  function snapshotCandidates(snapshots){
    const out=[];(Array.isArray(snapshots)?snapshots:[]).forEach(s=>{
      if(!s||typeof s!=="object")return;
      const sources=Array.isArray(s.sources)?s.sources:[];
      let ids=Array.isArray(s.sourceIds)?s.sourceIds.slice():sources.map(x=>x&&x.id).filter(Boolean);
      out.push(...candidates(ids,sources));
      if(!ids.length)sources.forEach(x=>{if(x&&x.dossierId!=null)out.push(String(x.dossierId));});
    });return [...new Set(out)];
  }
  function choose(ids){
    const canon=[],uncertain=ids.length===0;
    ids.forEach(id=>{const r=resolve(id);canon.push(r);});
    const keys=[...new Set(canon.map(x=>x.key).filter(Boolean))];
    return{keys,uncertain:uncertain||canon.some(x=>x.uncertain)||keys.length!==1};
  }
  function addItem(kind,item,ids){
    const choice=choose(ids);
    if(choice.uncertain||choice.keys.length!==1){const g=groupFor(reviewId,true);g[kind].push(item);
      addDossierIds(g,ids);choice.keys.forEach(key=>addDossierIds(g,[key]));return;}
    const g=groupFor(choice.keys[0],false);g[kind].push(item);addDossierIds(g,ids);
    ids.forEach(id=>{const r=resolve(id);addDossierIds(g,[id,r.key]);});
  }
  (Array.isArray(o.corrections)?o.corrections:[]).forEach(c=>{
    const current=Array.isArray(c&&c.currentOptions)?c.currentOptions:[],ids=[];
    current.forEach(s=>{if(!s||typeof s!=="object")return;
      const sources=Array.isArray(s.sources)?s.sources:[],sourceIds=Array.isArray(s.sourceIds)?s.sourceIds:sources.map(x=>x&&x.id).filter(Boolean);
      ids.push(...candidates(sourceIds,sources));
      if(!sourceIds.length)sources.forEach(x=>{if(x&&x.dossierId!=null)ids.push(String(x.dossierId));});
    });
    const sourceIds=ids.length?ids:snapshotCandidates(c&&((c.beforeSnapshots&&c.beforeSnapshots.length)?c.beforeSnapshots:[c.before]));
    addItem("corrections",Object.assign({},c),sourceIds);
  });
  (Array.isArray(o.overbookings)?o.overbookings:[]).forEach(b=>{
    const ids=Array.isArray(b&&b.sourceRuleIds)?b.sourceRuleIds:[];
    addItem("overbookings",Object.assign({},b),[...new Set((ids.length?candidates(ids):[]).concat(b&&b.targetDossierId!=null?[String(b.targetDossierId)]:[]))]);
  });
  (Array.isArray(o.dvnTasks)?o.dvnTasks:[]).forEach(t=>addItem("dvnTasks",Object.assign({},t),t&&t.dossierId!=null?[String(t.dossierId)]:[]));
  return [...groups.values()].map(g=>Object.assign({},g,{dossierIds:g.dossierIds.slice(),corrections:copies(g.corrections),overbookings:copies(g.overbookings),dvnTasks:copies(g.dvnTasks)}));
}
