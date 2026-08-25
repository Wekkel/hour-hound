"use strict";
/* Administratieve use-cases voor DVN en tijdelijk niet-boekbare dossiers.
   De UI verzamelt invoer en bevestiging; deze services valideren opnieuw, bezitten
   de volledige IndexedDB-transactie en retourneren pas daarna geheugeneffecten. */
(function(HH){
  if(!HH||!HH.services||!HH.storage||!HH.domain)
    throw new Error("HH-lagen ontbreken vóór services/admin.js");
  const gateway=HH.storage.indexedDB,dvn=HH.domain.dvn,over=HH.domain.overbooking;
  const PREFIX=/^\d{2}\.\d{2}\.\d{4} · [^·]* · /;
  const ok=effects=>Object.assign({ok:true},effects||{});
  const fail=(error,details)=>Object.assign({ok:false,error},details||{});
  const copy=value=>JSON.parse(JSON.stringify(value||{}));
  const waitFor=(input,ids)=>typeof input.waitForRules==="function"
    ?input.waitForRules(ids):Promise.resolve();
  const hours=(rules,hoursOf)=>Math.round((rules||[])
    .reduce((sum,rule)=>sum+(+hoursOf(rule)||0),0)*10)/10;
  const cleanDescription=(value,fallback)=>
    ((value||"").replace(PREFIX,"").trim())||fallback;
  const ruleSnapshot=(rule,hoursOf)=>({
    id:rule.id,datum:rule.datum,start:rule.start,eind:rule.eind,
    dossierId:rule.dossierId,code:rule.code||null,omschrijving:rule.omschrijving||"",
    uren:hoursOf(rule),gewijzigd:rule.gewijzigd||0
  });
  function addBooked(booked,date,fingerprints){
    const next=copy(booked),list=(next[date]||[]).concat(fingerprints||[]);
    next[date]=[...new Set(list)];
    const days=Object.keys(next).sort();while(days.length>60)delete next[days.shift()];
    return next;
  }
  function currentOverbooking(record,input){
    const ids=over.sourceIds(record),rules=ids.map(id=>(input.rules||[])
      .find(rule=>rule.id===id)).filter(Boolean);
    if(rules.length!==ids.length)return{ids,rules,rows:[],lines:[],hours:0};
    const rows=input.summarize(rules),lines=rows.map(row=>({
      werkcode:row.code||"",omschrijving:row.oms||"",uren:row.u
    }));
    return{ids,rules,rows,lines,
      hours:lines.reduce((sum,line)=>sum+(+line.uren||0),0)};
  }

  async function assignDvnNumber(input){
    const dossier=input.dossier,allDossiers=input.dossiers||[],number=(input.number||"").trim();
    if(!dossier||!dvn.isDvn(dossier)||dvn.isFinalI7(dossier))return fail("invalid_dvn");
    if(!number)return fail("number_required");
    const lower=number.toLowerCase(),target=allDossiers.find(item=>item.id!==dossier.id&&
      (item.nummer||"").toLowerCase()===lower)||null;
    if(target&&target.voorlopig)return fail("target_is_dvn");
    const rules=(input.rules||[]).filter(rule=>rule.dossierId===dossier.id);
    const previous=dvn.resolvedNumber(dossier,allDossiers),numberChanged=
      dossier.dvnIntappStatus==="posted"&&previous&&previous!==number;
    const updated=Object.assign({},dossier,{
      naam:target?dossier.naam:((input.name||"").trim()||dossier.naam),
      nummer:target?null:number,voorlopig:false,dvn:true,
      dvnOriginalName:dossier.dvnOriginalName||dossier.naam,
      dvnResolvedAt:input.nowIso,dvnResolvedNr:number,dvnTo:target?target.id:null,
      dvnIntappStatus:numberChanged?"needs_check":dossier.dvnIntappStatus,
      dvnIntappNeedsCheckAt:numberChanged?input.nowIso:dossier.dvnIntappNeedsCheckAt,
      dvnIntappNeedsCheckReason:numberChanged?"dossiernummer aangepast":
        dossier.dvnIntappNeedsCheckReason,
      dvnIntappAudit:numberChanged?dvn.auditAdd(dossier,"controle-nodig",{
        reden:"dossiernummer aangepast",van:previous,naar:number},input.nowIso):
        dossier.dvnIntappAudit,
      gewijzigd:input.nowMs
    });
    if(!target)delete updated.dvnTo;
    const updatedRules=rules.map(rule=>Object.assign({},rule,{code:null,
      omschrijving:cleanDescription(rule.omschrijving,dossier.naam),gewijzigd:input.nowMs}));
    const stackChanged=(input.stack||[]).some(item=>item.dossierId===dossier.id);
    const updatedStack=(input.stack||[]).map(item=>item.dossierId!==dossier.id?item:
      Object.assign({},item,{code:null,
        omschrijving:cleanDescription(item.omschrijving,dossier.naam)}));
    await waitFor(input,updatedRules.map(rule=>rule.id));
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      stores.dossiers.put(updated);updatedRules.forEach(rule=>stores.regels.put(rule));
      if(stackChanged)stores.meta.put(updatedStack,"stack");
    });
    return ok({dossier:updated,rules:updatedRules,stack:updatedStack,stackChanged,
      target,number});
  }

  async function markDvnPosted(input){
    const dossier=input.dossier;
    if(!dossier||!dvn.isDvn(dossier)||dvn.isFinalI7(dossier))return fail("invalid_dvn");
    const number=dvn.resolvedNumber(dossier,input.dossiers||[]);
    if(!number)return fail("number_required");
    const rules=dvn.rulesFor(dossier,input.rules||[]),total=hours(rules,input.hoursOf);
    const updated=Object.assign({},dossier,{dvnIntappStatus:"posted",
      dvnIntappPostedAt:input.nowIso,dvnIntappPostedCount:rules.length,
      dvnIntappPostedHours:total,dvnIntappPostedRuleIds:rules.map(rule=>rule.id),
      dvnIntappNeedsCheckAt:null,dvnIntappNeedsCheckReason:null,
      dvnIntappAudit:dvn.auditAdd(dossier,"ingevoerd",{
        regels:rules.length,uren:total,nummer:number},input.nowIso),gewijzigd:input.nowMs});
    await gateway.tx("dossiers","readwrite",store=>store.put(updated));
    return ok({dossier:updated,rules,total,number});
  }

  async function finalizeDvnI7(input){
    const dossier=input.dossier;
    if(!dossier||!dvn.isDvn(dossier)||dvn.isFinalI7(dossier))return fail("invalid_dvn");
    if(dvn.resolvedNumber(dossier,input.dossiers||[]))return fail("number_exists");
    if(input.runningId&&(input.rules||[]).some(rule=>rule.id===input.runningId&&
      rule.dossierId===dossier.id))return fail("timer_running");
    if(!input.commercialCode)return fail("commercial_code_missing");
    const rules=dvn.rulesFor(dossier,input.rules||[]),total=hours(rules,input.hoursOf);
    const updated=Object.assign({},dossier,{voorlopig:false,archief:true,dvn:true,
      dvnOriginalName:dossier.dvnOriginalName||dossier.naam,dvnDisposition:"final_i7",
      dvnFinalI7At:input.nowIso,dvnFinalI7RuleIds:rules.map(rule=>rule.id),
      dvnIntappStatus:null,dvnIntappPostedAt:null,dvnIntappPostedCount:0,
      dvnIntappPostedHours:0,dvnIntappPostedRuleIds:[],dvnIntappNeedsCheckAt:null,
      dvnIntappNeedsCheckReason:null,
      dvnIntappAudit:dvn.auditAdd(dossier,"definitief-i7",{
        regels:rules.length,uren:total},input.nowIso),gewijzigd:input.nowMs});
    delete updated.dvnTo;delete updated.dvnResolvedNr;delete updated.dvnResolvedAt;
    const updatedRules=rules.filter(rule=>rule.code!==input.commercialCode)
      .map(rule=>Object.assign({},rule,{code:input.commercialCode,gewijzigd:input.nowMs}));
    const stackChanged=(input.stack||[]).some(item=>item.dossierId===dossier.id);
    const updatedStack=(input.stack||[]).filter(item=>item.dossierId!==dossier.id);
    await waitFor(input,rules.map(rule=>rule.id));
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      stores.dossiers.put(updated);updatedRules.forEach(rule=>stores.regels.put(rule));
      if(stackChanged)stores.meta.put(updatedStack,"stack");
    });
    return ok({dossier:updated,rules:updatedRules,allRules:rules,total,
      stack:updatedStack,stackChanged});
  }

  async function parkOverbooking(input){
    const row=input.row,target=input.target,indirect=input.i7Dossier;
    const rowTargets=row&&Array.isArray(row.dosIds)?row.dosIds:[];
    if(!row||rowTargets.length!==1||!target||rowTargets[0]!==target.id||
      dvn.isIndirect(target)||dvn.isDvn(target)||!target.nummer||!row.fp)
      return fail("invalid_target");
    if(!indirect)return fail("i7_missing");
    if(!input.commercialCode)return fail("commercial_code_missing");
    const ids=(row.bron||[]).map(item=>item.id).filter(Boolean);
    if(!ids.length)return fail("source_changed");
    await waitFor(input,ids);
    const source=ids.map(id=>(input.rules||[]).find(rule=>rule.id===id)).filter(Boolean);
    if(source.length!==ids.length||source.some(rule=>!rule.eind||rule.dossierId!==target.id))
      return fail("source_changed");
    if(ids.some(id=>over.openForRule(id,input.overbookings||[])))return fail("already_parked");
    const record={id:input.id,status:"waiting",targetDossierId:target.id,
      targetNumberSnapshot:target.nummer||"",targetNameSnapshot:target.naam||"",
      sourceDate:input.sourceDate,sourceRuleIds:ids,sourceFingerprint:row.fp,
      sourceFingerprints:[row.fp],rondModeSnapshot:input.roundingMode,
      sourceSnapshot:source.map(rule=>ruleSnapshot(rule,input.hoursOf)),
      targetLines:[{werkcode:row.code||"",omschrijving:row.oms||"",uren:row.u}],
      description:row.oms||"",hours:row.u,i7DossierId:indirect.id,
      i7NumberSnapshot:indirect.nummer||"",i7Code:input.commercialCode,
      temporaryDescription:"Tijdelijk i7 voor "+HH.domain.time.schoon(row.nummer)+" · "+
        HH.domain.time.schoon(row.naam)+" · "+HH.domain.time.schoon(row.oms),
      parkedAt:input.nowIso,updatedAt:input.nowIso,
      audit:[{type:"op-i7-geboekt-geparkeerd",t:input.nowIso}]};
    await gateway.tx("overboekingen","readwrite",store=>store.put(record));
    return ok({overbooking:record});
  }

  async function refreshOverbooking(input){
    const record=input.overbooking;
    if(!over.isOpen(record))return fail("not_open");
    const ids=over.sourceIds(record);await waitFor(input,ids);
    const current=currentOverbooking(record,input),rules=current.rules;
    if(rules.length!==ids.length)return fail("source_missing");
    if(rules.some(rule=>!rule.eind||rule.id===input.runningId))return fail("timer_running");
    const targets=[...new Set(rules.map(rule=>rule.dossierId))];
    if(targets.length!==1)return fail("multiple_targets");
    const target=(input.dossiers||[]).find(dossier=>dossier.id===targets[0]);
    if(!target||dvn.isIndirect(target)||dvn.isDvn(target)||!target.nummer)
      return fail("invalid_target");
    const updated=Object.assign({},record,{targetDossierId:target.id,
      targetNumberSnapshot:target.nummer||"",targetNameSnapshot:target.naam||"",
      sourceSnapshot:rules.map(rule=>ruleSnapshot(rule,input.hoursOf)),
      targetLines:current.lines,sourceFingerprints:current.rows.map(row=>row.fp),
      sourceFingerprint:current.rows.length===1?current.rows[0].fp:"",
      rondModeSnapshot:input.roundingMode,
      description:current.lines.map(line=>line.omschrijving).join(" / "),
      hours:current.hours,updatedAt:input.nowIso,
      audit:(record.audit||[]).slice(-49).concat([{
        type:"bijgewerkte-gegevens-gebruikt",t:input.nowIso}])});
    await gateway.tx("overboekingen","readwrite",store=>store.put(updated));
    return ok({overbooking:updated,target,current});
  }

  async function completeOverbookings(input){
    const wanted=input.ids||[],records=wanted.map(id=>(input.overbookings||[])
      .find(record=>record.id===id)).filter(Boolean);
    if(!records.length||records.length!==wanted.length)return fail("queue_changed");
    const context={rules:input.rules||[],dossiers:input.dossiers||[],
      summarize:input.summarize};
    if(records.some(record=>over.state(record,context)!=="waiting"))
      return fail("queue_changed");
    const targets=[...new Set(records.map(record=>record.targetDossierId))];
    const target=(input.dossiers||[]).find(dossier=>dossier.id===targets[0]);
    if(targets.length!==1||!target||!target.nummer)return fail("invalid_target");
    let booked=copy(input.booked),updates=[];
    records.forEach(record=>{
      const current=currentOverbooking(record,input),fingerprints=current.rows.map(row=>row.fp);
      booked=addBooked(booked,record.sourceDate,fingerprints);
      updates.push(Object.assign({},record,{status:"done",sourceFingerprints:fingerprints,
        sourceFingerprint:fingerprints.length===1?fingerprints[0]:(record.sourceFingerprint||""),
        rondModeSnapshot:input.roundingMode,targetBookedAt:input.nowIso,
        targetBookedDate:input.bookedDate,doneAt:input.nowIso,updatedAt:input.nowIso,
        audit:(record.audit||[]).slice(-49).concat([{
          type:"op-dossier-geboekt",t:input.nowIso,boekdatum:input.bookedDate}])}));
    });
    await gateway.tx(["overboekingen","meta"],"readwrite",stores=>{
      updates.forEach(record=>stores.overboekingen.put(record));
      stores.meta.put(booked,"geboekt");
    });
    return ok({overbookings:updates,booked,target});
  }

  async function finalizeOverbookingI7(input){
    const record=input.overbooking,indirect=input.i7Dossier;
    if(!over.isOpen(record))return fail("not_open");
    if(!indirect)return fail("i7_missing");
    if(!input.commercialCode)return fail("commercial_code_missing");
    const ids=over.sourceIds(record);await waitFor(input,ids);
    const current=currentOverbooking(record,input),rules=current.rules;
    if(rules.length!==ids.length)return fail("source_missing");
    if(rules.some(rule=>!rule.eind||rule.id===input.runningId))return fail("timer_running");
    const updatedRules=rules.map(rule=>Object.assign({},rule,{dossierId:indirect.id,
      code:input.commercialCode,gewijzigd:input.nowMs}));
    const fingerprints=input.summarize(updatedRules).map(row=>row.fp);
    const booked=addBooked(input.booked,record.sourceDate,fingerprints);
    const updated=Object.assign({},record,{status:"final_i7",finalI7At:input.nowIso,
      updatedAt:input.nowIso,finalI7Fingerprints:fingerprints,
      audit:(record.audit||[]).slice(-49).concat([{
        type:"definitief-i7",t:input.nowIso}])});
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      updatedRules.forEach(rule=>stores.regels.put(rule));
      stores.overboekingen.put(updated);stores.meta.put(booked,"geboekt");
    });
    return ok({overbooking:updated,rules:updatedRules,booked});
  }

  HH.services.admin=Object.freeze({assignDvnNumber,markDvnPosted,finalizeDvnI7,
    parkOverbooking,refreshOverbooking,completeOverbookings,finalizeOverbookingI7});
})(globalThis.HH);
