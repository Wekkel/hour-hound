"use strict";
/* Administratieve use-cases voor DVN en tijdelijk niet-boekbare dossiers.
   De UI verzamelt invoer en bevestiging; deze services valideren opnieuw, bezitten
   de volledige IndexedDB-transactie en retourneren pas daarna geheugeneffecten. */
(function(HH){
  if(!HH||!HH.services||!HH.storage||!HH.domain)
    throw new Error("HH-lagen ontbreken vóór services/admin.js");
  const gateway=HH.storage.indexedDB,dvn=HH.domain.dvn,over=HH.domain.overbooking,
    booking=HH.domain.booking;
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
  const byId=(rows,id)=>(rows||[]).find(row=>row.id===id)||null;
  const entityMatches=(current,expected)=>!!current&&!!expected&&current.id===expected.id&&
    (gateway.revisionOf(current)||gateway.revisionOf(expected)?
      gateway.revisionOf(current)===gateway.revisionOf(expected):
      (current.gewijzigd||0)===(expected.gewijzigd||0));
  const replaceEntity=(current,desired,nowMs)=>Object.assign({},desired,{gewijzigd:nowMs,
    revision:gateway.revisionOf(current)+1});
  const recordMatches=(current,expected)=>!!current&&!!expected&&current.id===expected.id&&
    (gateway.revisionOf(current)||gateway.revisionOf(expected)?
      gateway.revisionOf(current)===gateway.revisionOf(expected):
      (current.updatedAt||"")===(expected.updatedAt||""));
  const replaceRecord=(current,desired)=>Object.assign({},desired,
    {revision:gateway.revisionOf(current)+1});
  const atomic=(input,stores,metaKeys,prepare)=>gateway.atomicWrite({stores,
    metaKeys:metaKeys||[],operationId:input.operationId,completedAt:input.nowIso},prepare);
  const sameIds=(a,b)=>a.length===b.length&&a.every(id=>b.includes(id));
  function mergeRules(current,expected,desired,nowMs){
    const results=[];
    for(const wanted of desired){
      const actual=byId(current,wanted.id),before=byId(expected,wanted.id);
      if(!actual||!before)return fail("source_changed",{conflict:wanted.id});
      const merged=gateway.mergeRule(actual,before,wanted,nowMs);
      if(!merged.ok)return fail("source_changed",{conflict:wanted.id});
      results.push(merged.rule);
    }
    return ok({rules:results});
  }
  const ruleSnapshot=(rule,hoursOf)=>({
    id:rule.id,datum:rule.datum,start:rule.start,eind:rule.eind,
    dossierId:rule.dossierId,code:rule.code||null,omschrijving:rule.omschrijving||"",
    uren:typeof hoursOf==="function"?hoursOf(rule):booking.hoursOf(rule),gewijzigd:rule.gewijzigd||0
  });
  function addBooked(booked,date,fingerprints){
    const next=copy(booked),list=(next[date]||[]).concat(fingerprints||[]);
    next[date]=[...new Set(list)];
    return next;
  }
  const removeBooked=(booked,date,fp)=>{const next=copy(booked),list=(next[date]||[])
    .filter(value=>value!==fp);if(list.length)next[date]=list;else delete next[date];return next;};
  const receipt=(id,channel,snapshot,input,extra)=>Object.assign({id,channel,
    snapshot:copy(snapshot),confirmedAt:input.nowIso||new Date().toISOString(),
    confirmedContent:booking.semanticKey(snapshot)},extra||{});
  const rowIds=row=>booking.rowSourceIds(row);
  function snapshotsFor(input,rules,dossiers,history,onlyDate){
    const dates=[...new Set((rules||[]).filter(r=>r.soort!=="pauze"&&(!onlyDate||r.datum===onlyDate))
      .map(r=>r.datum))],out=[];
    dates.forEach(date=>{
      const day=(rules||[]).filter(r=>r.datum===date);
      (input.aggregateRows(day,dossiers,input.roundingMode,null,history)||[]).forEach(row=>
        out.push(input.snapshotRow(row,date,rules,input.roundingMode)));
    });return out;
  }

  async function setRegularBooking(input){
    const expected=input.snapshot;
    if(!expected||!expected.date||!rowIds(expected).length)return fail("source_changed");
    await waitFor(input,rowIds(expected));
    return atomic(input,["regels","dossiers"],["geboekt","bookingHistory","rondMode"],
      (snapshot,writer)=>{
      const mode=snapshot.meta.rondMode||"groep",ctx=Object.assign({},input,{roundingMode:mode}),
        current=snapshotsFor(ctx,snapshot.regels,snapshot.dossiers,snapshot.meta.bookingHistory,
          expected.date).find(item=>sameIds(rowIds(item),rowIds(expected)));
      if(!current||!booking.semanticEqual(current,expected))return fail("source_changed");
      const contributing=rowIds(current).map(id=>byId(snapshot.regels,id)).filter(Boolean);
      if(contributing.length!==rowIds(current).length||contributing.some(rule=>!rule.eind)||
        !current.targetNumber||!current.description.trim()||!(current.hours>0)||
        typeof input.validateRules==="function"&&input.validateRules(contributing,
          snapshot.dossiers).some(problem=>problem.blok))return fail("invalid_booking");
      let history=booking.normalizeHistory(snapshot.meta.bookingHistory),
        booked=copy(snapshot.meta.geboekt);
      if(input.enabled){
        const allCurrent=snapshotsFor(ctx,snapshot.regels,snapshot.dossiers,history),ids=rowIds(current);
        if(booking.corrections(history,allCurrent).some(item=>item.beforeSnapshots.flatMap(rowIds)
          .some(id=>ids.includes(id))))return fail("correction_required");
        if(!booking.evidenceForSnapshot(history,current))history.receipts.push(receipt(
          input.receiptId,"day",current,input));
        booked=addBooked(booked,current.date,[input.fingerprint]);
      }else{
        const found=booking.evidenceForSnapshot(history,current);
        if(found){const remaining=booking.evidence(history).filter(item=>item.receiptId===found.receiptId&&
          !booking.semanticEqual(item.snapshot,current)).map(item=>item.snapshot);
          history.resolutions.push({id:input.resolutionId,receiptId:found.receiptId,
            type:remaining.length?"corrected":"reopened",currentSnapshots:remaining,
            resolvedAt:input.nowIso,comparedContent:remaining.length?
              remaining.map(booking.semanticKey):booking.semanticKey(current)});}

        booked=removeBooked(booked,current.date,input.fingerprint);
      }
      writer.stores.meta.put(history,"bookingHistory");
      writer.stores.meta.put(booked,"geboekt");
      return ok({history,booked,snapshot:current});
    });
  }

  async function bootstrapLegacyBookings(input){
    return atomic(input,["regels","dossiers","overboekingen"],["geboekt","bookingHistory","rondMode"],
      (snapshot,writer)=>{
      const booked=snapshot.meta.geboekt||{},history=booking.normalizeHistory(snapshot.meta.bookingHistory),
        mode=snapshot.meta.rondMode||"groep",ctx=Object.assign({},input,{roundingMode:mode});
      let added=0;
      // Een oude afgeronde overboeking bewaart wél het werkelijke doelnummer en
      // de geboekte regel. Gebruik die gegevens vóór afgeleide oude vlaggen.
      for(const old of snapshot.overboekingen.filter(o=>o.status==="done")){
        const lines=old.targetLines||[],ids=over.sourceIds(old);
        if(lines.length!==1||!ids.length||!old.targetNumberSnapshot||
          history.receipts.some(r=>r.overbookingId===old.id))continue;
        const line=lines[0],snap=booking.bookingSnapshot({targetNumber:old.targetNumberSnapshot,
          targetName:old.targetNameSnapshot||"",code:line.werkcode||"",description:line.omschrijving||"",
          hours:line.uren,sourceIds:ids},old.sourceDate,{roundingMode:old.rondModeSnapshot,
            sources:old.sourceSnapshot||[]});
        if(!snap.hours||booking.hasHistoricalSource(history,snap))continue;
        history.receipts.push(receipt("legacy-over-"+old.id,"overbooking_target",snap,input,
          {overbookingId:old.id,bookedDate:old.targetBookedDate||null,
            confirmedAt:old.targetBookedAt||old.doneAt||input.nowIso}));added++;
      }
      Object.keys(booked).forEach(date=>{
        const rows=input.aggregateRows((snapshot.regels||[]).filter(r=>r.datum===date),
          snapshot.dossiers,mode,null,history)||[];
        rows.filter(row=>(booked[date]||[]).includes(row.fp)).forEach((row,index)=>{
          const current=input.snapshotRow(row,date,snapshot.regels,mode);
          if(booking.evidenceForSnapshot(history,current)||booking.hasHistoricalSource(history,current))return;
          history.receipts.push(receipt("legacy-"+date+"-"+index+"-"+history.receipts.length,
            "legacy",current,input,{legacyInferred:true,legacyFingerprint:row.fp,
              inferenceNote:"Doelnummer gereconstrueerd uit de eerste nog overeenkomende lokale regel"}));added++;
        });
        (booked[date]||[]).filter(fp=>!rows.some(row=>row.fp===fp)).forEach(fp=>{
          const marker=date+"\u0000"+fp;if(!history.legacyOrphans.includes(marker)){
            history.legacyOrphans.push(marker);added++;}});
      });
      // Oude DVN-sheet bevestigde losse regels. Reconstrueer alleen een nog exact
      // herkenbare afgesloten bronset en bewaar die oude afrondingsgrenzen.
      for(const d of snapshot.dossiers.filter(d=>d.dvnIntappStatus==="posted")){
        const ids=d.dvnIntappPostedRuleIds||[],rules=ids.map(id=>byId(snapshot.regels,id));
        if(!ids.length||rules.some(r=>!r||!r.eind||r.dossierId!==d.id))continue;
        const total=rules.reduce((n,r)=>n+booking.hoursOf(r),0);
        if(Math.abs(total-(+d.dvnIntappPostedHours||0))>0.001)continue;
        rules.forEach((r,index)=>{
          const row=input.aggregateRows([r],snapshot.dossiers,mode,null,history)[0];if(!row)return;
          const current=input.snapshotRow(row,r.datum,snapshot.regels,mode);
          if(!current.targetNumber||booking.hasHistoricalSource(history,current))return;
          history.receipts.push(receipt("legacy-dvn-"+d.id+"-"+index,"legacy",current,input,
            {dossierId:d.id,legacyInferred:true,inferenceNote:"Gereconstrueerd uit de oude DVN-bevestiging; oorspronkelijk doelnummer niet afzonderlijk bewaard"}));added++;
        });
      }
      if(added)writer.stores.meta.put(history,"bookingHistory");
      return ok({history,added});
    });
  }

  async function resolveBookingCorrection(input){
    return atomic(input,["regels","dossiers"],["bookingHistory","rondMode"],
      (snapshot,writer)=>{
      const history=booking.normalizeHistory(snapshot.meta.bookingHistory),
        receiptRow=history.receipts.find(item=>item.id===input.receiptId);
      if(!receiptRow)return fail("correction_changed");
      const mode=snapshot.meta.rondMode||"groep",ctx=Object.assign({},input,{roundingMode:mode}),
        all=snapshotsFor(ctx,snapshot.regels,snapshot.dossiers,history),
        correction=booking.corrections(history,all).find(item=>item.receiptId===input.receiptId);
      if(!correction)return fail("correction_changed");
      const selectedKeys=Array.isArray(input.currentKeys)?input.currentKeys.slice().sort():[],
        actualKeys=correction.currentOptions.map(booking.semanticKey).sort();
      if(selectedKeys.length!==actualKeys.length||selectedKeys.some((key,index)=>key!==actualKeys[index]))
        return fail("correction_changed");
      const resolved=correction.currentOptions,sourceIds=new Set(resolved.flatMap(rowIds)),
        contributing=snapshot.regels.filter(rule=>sourceIds.has(rule.id));
      if(contributing.some(rule=>!rule.eind)||resolved.some(item=>!item.targetNumber||!item.description.trim()||item.hours<=0)||
        typeof input.validateRules==="function"&&input.validateRules(contributing,snapshot.dossiers).some(p=>p.blok))
        return fail("invalid_booking");
      history.resolutions.push({id:input.resolutionId,receiptId:input.receiptId,type:"corrected",
        resolvedAt:input.nowIso,currentSnapshots:resolved,
        comparedContent:resolved.length?resolved.map(booking.semanticKey):["deleted"]});
      writer.stores.meta.put(history,"bookingHistory");return ok({history});
    });
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
    const dossier=input.dossier,number=(input.number||"").trim();
    if(!dossier||!dvn.isDvn(dossier)||dvn.isFinalI7(dossier))return fail("invalid_dvn");
    if(!number)return fail("number_required");
    const inputTarget=(input.dossiers||[]).find(item=>item.id!==dossier.id&&
      (item.nummer||"").toLowerCase()===number.toLowerCase());
    if(inputTarget&&inputTarget.voorlopig)return fail("target_is_dvn");
    const expectedRules=(input.rules||[]).filter(rule=>rule.dossierId===dossier.id);
    await waitFor(input,expectedRules.map(rule=>rule.id));
    return atomic(input,["dossiers","regels"],["stack"],(snapshot,writer)=>{
    const actual=byId(snapshot.dossiers,dossier.id);
    if(!entityMatches(actual,dossier)||!dvn.isDvn(actual)||dvn.isFinalI7(actual))
      return fail("invalid_dvn");
    const lower=number.toLowerCase(),target=(snapshot.dossiers||[]).find(item=>item.id!==actual.id&&
      (item.nummer||"").toLowerCase()===lower)||null;
    if(target&&target.voorlopig)return fail("target_is_dvn");
    const rules=(snapshot.regels||[]).filter(rule=>rule.dossierId===actual.id),
      ids=rules.map(rule=>rule.id),expectedIds=expectedRules.map(rule=>rule.id);
    if(!sameIds(ids,expectedIds))return fail("source_changed");
    const previous=dvn.resolvedNumber(actual,snapshot.dossiers||[]),numberChanged=
      actual.dvnIntappStatus==="posted"&&previous&&previous!==number;
    let updated=Object.assign({},actual,{
      naam:target?dossier.naam:((input.name||"").trim()||dossier.naam),
      nummer:target?null:number,voorlopig:false,dvn:true,
      dvnOriginalName:actual.dvnOriginalName||actual.naam,
      dvnResolvedAt:input.nowIso,dvnResolvedNr:number,dvnTo:target?target.id:null,
      dvnIntappStatus:numberChanged?"needs_check":actual.dvnIntappStatus,
      dvnIntappNeedsCheckAt:numberChanged?input.nowIso:actual.dvnIntappNeedsCheckAt,
      dvnIntappNeedsCheckReason:numberChanged?"dossiernummer aangepast":
        actual.dvnIntappNeedsCheckReason,
      dvnIntappAudit:numberChanged?dvn.auditAdd(actual,"controle-nodig",{
        reden:"dossiernummer aangepast",van:previous,naar:number},input.nowIso):
        actual.dvnIntappAudit
    });
    if(!target)delete updated.dvnTo;
    updated=replaceEntity(actual,updated,input.nowMs);
    const desired=expectedRules.map(rule=>Object.assign({},rule,{code:null,
      omschrijving:cleanDescription(rule.omschrijving,dossier.naam)})),
      merged=mergeRules(rules,expectedRules,desired,input.nowMs);
    if(!merged.ok)return merged;
    const updatedRules=merged.rules,stack=snapshot.meta.stack||[],
      stackChanged=stack.some(item=>item.dossierId===actual.id);
    const updatedStack=stack.map(item=>item.dossierId!==actual.id?item:
      Object.assign({},item,{code:null,
        omschrijving:cleanDescription(item.omschrijving,dossier.naam)}));
    writer.put("dossiers",updated);updatedRules.forEach(rule=>writer.put("regels",rule));
    if(stackChanged)writer.stores.meta.put(updatedStack,"stack");
    return ok({dossier:updated,rules:updatedRules,stack:updatedStack,stackChanged,
      target,number});
    });
  }

  async function markDvnPosted(input){
    const dossier=input.dossier;
    if(!dossier||!dvn.isDvn(dossier)||dvn.isFinalI7(dossier))return fail("invalid_dvn");
    const number=dvn.resolvedNumber(dossier,input.dossiers||[]);
    if(!number)return fail("number_required");
    const expected=dvn.rulesFor(dossier,input.rules||[]);
    await waitFor(input,expected.map(rule=>rule.id));
    return atomic(input,["dossiers","regels"],["running","bookingHistory","rondMode"],(snapshot,writer)=>{
    const actual=byId(snapshot.dossiers,dossier.id);
    if(!entityMatches(actual,dossier)||!dvn.isDvn(actual)||dvn.isFinalI7(actual))
      return fail("invalid_dvn");
    const actualNumber=dvn.resolvedNumber(actual,snapshot.dossiers||[]);
    if(!actualNumber)return fail("number_required");
    const rules=dvn.rulesFor(actual,snapshot.regels||[]);
    if(!sameIds(rules.map(r=>r.id),expected.map(r=>r.id))||rules.some(rule=>{
      const old=byId(expected,rule.id);return !old||gateway.revisionOf(old)!==gateway.revisionOf(rule)||
        (!gateway.revisionOf(rule)&&(old.gewijzigd||0)!==(rule.gewijzigd||0));}))
      return fail("source_changed");
    if(rules.some(rule=>!rule.eind||rule.id===(snapshot.meta.running||null)))
      return fail("timer_running");
    if(!rules.length||typeof input.validateRules==="function"&&input.validateRules(rules,
      snapshot.dossiers).some(problem=>problem.blok))return fail("invalid_booking");
    const mode=snapshot.meta.rondMode||"groep",history=booking.normalizeHistory(
      snapshot.meta.bookingHistory),ctx=Object.assign({},input,{roundingMode:mode}),
      current=snapshotsFor(ctx,rules,snapshot.dossiers,history),unhandled=current.filter(item=>
        !booking.evidenceForSnapshot(history,item)),expectedSnapshots=input.snapshots||[];
    if(expectedSnapshots.length!==unhandled.length||expectedSnapshots.some(item=>!unhandled.some(actual=>
      booking.semanticEqual(item,actual))))return fail("source_changed");
    const currentIds=new Set(rules.map(r=>r.id));
    if(booking.evidence(history).some(item=>(item.receipt.dossierId===actual.id||
      (item.receipt.snapshot.sources||[]).some(r=>r.dossierId===actual.id)||
      rowIds(item.snapshot).some(id=>currentIds.has(id)))&&
      !current.some(now=>booking.semanticEqual(item.snapshot,now))))return fail("correction_required");
    const legacyCorrection=actual.dvnIntappStatus==="needs_check"&&
      (actual.dvnIntappPostedRuleIds||[]).length&&!history.receipts.some(r=>r.dossierId===actual.id||
        (r.snapshot.sources||[]).some(source=>source.dossierId===actual.id));
    if(legacyCorrection&&!input.legacyReviewed)return fail("correction_required");
    unhandled.forEach((item,index)=>history.receipts.push(receipt(
      (input.receiptIds||[])[index]||("dvn-"+actual.id+"-"+input.nowIso+"-"+index),"dvn",item,input,
      {dossierId:actual.id,legacyCorrection:!!legacyCorrection})));
    const total=current.reduce((sum,item)=>sum+(+item.hours||0),0);
    const updated=replaceEntity(actual,Object.assign({},actual,{dvnIntappStatus:"posted",
      dvnIntappPostedAt:input.nowIso,dvnIntappPostedCount:current.length,
      dvnIntappPostedHours:total,dvnIntappPostedRuleIds:rules.map(rule=>rule.id),
      dvnIntappNeedsCheckAt:null,dvnIntappNeedsCheckReason:null,
      dvnIntappAudit:dvn.auditAdd(actual,"ingevoerd",{
        regels:current.length,uren:total,nummer:actualNumber},input.nowIso)}),input.nowMs);
    writer.put("dossiers",updated);writer.stores.meta.put(history,"bookingHistory");
    return ok({dossier:updated,rules,rows:current,total,number:actualNumber,history});
    });
  }

  async function finalizeDvnI7(input){
    const dossier=input.dossier;
    if(!dossier||!dvn.isDvn(dossier)||dvn.isFinalI7(dossier))return fail("invalid_dvn");
    if(dvn.resolvedNumber(dossier,input.dossiers||[]))return fail("number_exists");
    if(input.runningId&&(input.rules||[]).some(rule=>rule.id===input.runningId&&
      rule.dossierId===dossier.id))return fail("timer_running");
    if(!input.commercialCode)return fail("commercial_code_missing");
    const expected=dvn.rulesFor(dossier,input.rules||[]);
    await waitFor(input,expected.map(rule=>rule.id));
    return atomic(input,["dossiers","regels"],["running","stack"],(snapshot,writer)=>{
    const actual=byId(snapshot.dossiers,dossier.id);
    if(!entityMatches(actual,dossier)||!dvn.isDvn(actual)||dvn.isFinalI7(actual))return fail("invalid_dvn");
    if(dvn.resolvedNumber(actual,snapshot.dossiers||[]))return fail("number_exists");
    const rules=dvn.rulesFor(actual,snapshot.regels||[]);
    if(!sameIds(rules.map(r=>r.id),expected.map(r=>r.id)))return fail("source_changed");
    if((snapshot.meta.running||null)&&rules.some(rule=>rule.id===snapshot.meta.running))return fail("timer_running");
    const total=hours(rules,input.hoursOf);
    let updated=Object.assign({},actual,{voorlopig:false,archief:true,dvn:true,
      dvnOriginalName:dossier.dvnOriginalName||dossier.naam,dvnDisposition:"final_i7",
      dvnFinalI7At:input.nowIso,dvnFinalI7RuleIds:rules.map(rule=>rule.id),
      dvnIntappStatus:null,dvnIntappPostedAt:null,dvnIntappPostedCount:0,
      dvnIntappPostedHours:0,dvnIntappPostedRuleIds:[],dvnIntappNeedsCheckAt:null,
      dvnIntappNeedsCheckReason:null,
      dvnIntappAudit:dvn.auditAdd(actual,"definitief-i7",{
        regels:rules.length,uren:total},input.nowIso)});
    delete updated.dvnTo;delete updated.dvnResolvedNr;delete updated.dvnResolvedAt;
    updated=replaceEntity(actual,updated,input.nowMs);
    const desired=expected.filter(rule=>rule.code!==input.commercialCode)
      .map(rule=>Object.assign({},rule,{code:input.commercialCode})),
      merged=mergeRules(rules,expected,desired,input.nowMs);if(!merged.ok)return merged;
    const updatedRules=merged.rules,stack=snapshot.meta.stack||[],
      stackChanged=stack.some(item=>item.dossierId===actual.id),
      updatedStack=stack.filter(item=>item.dossierId!==actual.id);
    writer.put("dossiers",updated);updatedRules.forEach(rule=>writer.put("regels",rule));
    if(stackChanged)writer.stores.meta.put(updatedStack,"stack");
    return ok({dossier:updated,rules:updatedRules,allRules:rules,total,
      stack:updatedStack,stackChanged});
    });
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
    return atomic(input,["regels","dossiers","overboekingen"],["running","bookingHistory"],(snapshot,writer)=>{
    const actualTarget=byId(snapshot.dossiers,target.id),actualIndirect=byId(snapshot.dossiers,indirect.id),
      source=ids.map(id=>byId(snapshot.regels,id)).filter(Boolean);
    if(!entityMatches(actualTarget,target)||!entityMatches(actualIndirect,indirect)||
      source.length!==ids.length||source.some(rule=>!rule.eind||rule.dossierId!==actualTarget.id||
        rule.id===(snapshot.meta.running||null)))
      return fail("source_changed");
    const rows=input.summarize(source);
    if(rows.length!==1||rows[0].fp!==row.fp)return fail("source_changed");
    if(ids.some(id=>over.openForRule(id,snapshot.overboekingen||[])))return fail("already_parked");
    const record={id:input.id,status:"waiting",revision:1,targetDossierId:actualTarget.id,
      targetNumberSnapshot:actualTarget.nummer||"",targetNameSnapshot:actualTarget.naam||"",
      sourceDate:input.sourceDate,sourceRuleIds:ids,sourceFingerprint:row.fp,
      sourceFingerprints:[row.fp],rondModeSnapshot:input.roundingMode,
      sourceSnapshot:source.map(rule=>ruleSnapshot(rule,input.hoursOf)),
      targetLines:[{werkcode:row.code||"",omschrijving:row.oms||"",uren:row.u}],
      description:row.oms||"",hours:row.u,i7DossierId:actualIndirect.id,
      i7NumberSnapshot:actualIndirect.nummer||"",i7Code:input.commercialCode,
      temporaryDescription:"Tijdelijk i7 voor "+HH.domain.time.schoon(row.nummer)+" · "+
        HH.domain.time.schoon(row.naam)+" · "+HH.domain.time.schoon(row.oms),
      parkedAt:input.nowIso,updatedAt:input.nowIso,
      audit:[{type:"op-i7-geboekt-geparkeerd",t:input.nowIso}]};
    const history=booking.normalizeHistory(snapshot.meta.bookingHistory),temporary=
      booking.bookingSnapshot({nummer:actualIndirect.nummer||"",naam:actualIndirect.naam||"",
        code:input.commercialCode,oms:record.temporaryDescription,u:row.u,bron:source},input.sourceDate,
        {roundingMode:input.roundingMode,sources:record.sourceSnapshot});
    history.receipts.push(receipt(input.receiptId||("over-i7-"+input.id),"overbooking_i7",
      temporary,input,{overbookingId:input.id}));
    writer.put("overboekingen",record);writer.stores.meta.put(history,"bookingHistory");
    return ok({overbooking:record,history});
    });
  }

  async function refreshOverbooking(input){
    const record=input.overbooking;
    if(!over.isOpen(record))return fail("not_open");
    const ids=over.sourceIds(record);await waitFor(input,ids);
    return atomic(input,["overboekingen","regels","dossiers"],["running"],(snapshot,writer)=>{
    const actualRecord=byId(snapshot.overboekingen,record.id);
    if(!recordMatches(actualRecord,record)||!over.isOpen(actualRecord))return fail("not_open");
    const actualInput=Object.assign({},input,{rules:snapshot.regels||[],dossiers:snapshot.dossiers||[]}),
      current=currentOverbooking(actualRecord,actualInput),rules=current.rules;
    if(rules.length!==ids.length)return fail("source_missing");
    if(rules.some(rule=>!rule.eind||rule.id===(snapshot.meta.running||null)))return fail("timer_running");
    const targets=[...new Set(rules.map(rule=>rule.dossierId))];
    if(targets.length!==1)return fail("multiple_targets");
    const target=(actualInput.dossiers||[]).find(dossier=>dossier.id===targets[0]);
    if(!target||dvn.isIndirect(target)||dvn.isDvn(target)||!target.nummer)
      return fail("invalid_target");
    const updated=replaceRecord(actualRecord,Object.assign({},actualRecord,{targetDossierId:target.id,
      targetNumberSnapshot:target.nummer||"",targetNameSnapshot:target.naam||"",
      sourceSnapshot:rules.map(rule=>ruleSnapshot(rule,input.hoursOf)),
      targetLines:current.lines,sourceFingerprints:current.rows.map(row=>row.fp),
      sourceFingerprint:current.rows.length===1?current.rows[0].fp:"",
      rondModeSnapshot:input.roundingMode,
      description:current.lines.map(line=>line.omschrijving).join(" / "),
      hours:current.hours,updatedAt:input.nowIso,
      audit:(actualRecord.audit||[]).slice(-49).concat([{
        type:"bijgewerkte-gegevens-gebruikt",t:input.nowIso}])}));
    writer.put("overboekingen",updated);
    return ok({overbooking:updated,target,current});
    });
  }

  async function completeOverbookings(input){
    const wanted=input.ids||[],records=wanted.map(id=>(input.overbookings||[])
      .find(record=>record.id===id)).filter(Boolean);
    if(!records.length||records.length!==wanted.length)return fail("queue_changed");
    return atomic(input,["overboekingen","regels","dossiers"],["geboekt","bookingHistory"],(snapshot,writer)=>{
    const actualRecords=wanted.map(id=>byId(snapshot.overboekingen,id)).filter(Boolean);
    if(actualRecords.length!==wanted.length||actualRecords.some((record,index)=>
      !recordMatches(record,records[index])))return fail("queue_changed");
    const actualInput=Object.assign({},input,{rules:snapshot.regels||[],dossiers:snapshot.dossiers||[]}),
      context={rules:actualInput.rules,dossiers:actualInput.dossiers,summarize:input.summarize};
    if(actualRecords.some(record=>over.state(record,context)!=="waiting"))return fail("queue_changed");
    const targets=[...new Set(actualRecords.map(record=>record.targetDossierId))],
      target=byId(actualInput.dossiers,targets[0]);
    if(targets.length!==1||!target||!target.nummer)return fail("invalid_target");
    let booked=copy(snapshot.meta.geboekt),updates=[],history=booking.normalizeHistory(
      snapshot.meta.bookingHistory);
    actualRecords.forEach(record=>{
      const current=currentOverbooking(record,actualInput),fingerprints=current.rows.map(row=>row.fp);
      booked=addBooked(booked,record.sourceDate,fingerprints);
      current.rows.forEach((row,index)=>{const snap=booking.bookingSnapshot(row,record.sourceDate,
        {roundingMode:input.roundingMode,sources:current.rules.map(rule=>
          ruleSnapshot(rule,input.hoursOf)).filter(rule=>rowIds(row).includes(rule.id))});
        if(!booking.evidenceForSnapshot(history,snap))history.receipts.push(receipt(
          "over-target-"+record.id+"-"+index,"overbooking_target",snap,input,
          {overbookingId:record.id,bookedDate:input.bookedDate}));});
      updates.push(replaceRecord(record,Object.assign({},record,{status:"done",sourceFingerprints:fingerprints,
        sourceFingerprint:fingerprints.length===1?fingerprints[0]:(record.sourceFingerprint||""),
        rondModeSnapshot:input.roundingMode,targetBookedAt:input.nowIso,
        targetBookedDate:input.bookedDate,doneAt:input.nowIso,updatedAt:input.nowIso,
        audit:(record.audit||[]).slice(-49).concat([{
          type:"op-dossier-geboekt",t:input.nowIso,boekdatum:input.bookedDate}])})));
    });
    updates.forEach(record=>writer.put("overboekingen",record));
    writer.stores.meta.put(booked,"geboekt");writer.stores.meta.put(history,"bookingHistory");
    return ok({overbookings:updates,booked,target,history});
    });
  }

  async function finalizeOverbookingI7(input){
    const record=input.overbooking,indirect=input.i7Dossier;
    if(!over.isOpen(record))return fail("not_open");
    if(!indirect)return fail("i7_missing");
    if(!input.commercialCode)return fail("commercial_code_missing");
    const ids=over.sourceIds(record),expectedRules=ids.map(id=>byId(input.rules,id)).filter(Boolean);
    await waitFor(input,ids);
    return atomic(input,["overboekingen","regels","dossiers"],["running","geboekt","bookingHistory"],
      (snapshot,writer)=>{
    const actualRecord=byId(snapshot.overboekingen,record.id),actualIndirect=byId(snapshot.dossiers,indirect.id);
    if(!recordMatches(actualRecord,record)||!over.isOpen(actualRecord)||
      !entityMatches(actualIndirect,indirect))return fail("not_open");
    const actualInput=Object.assign({},input,{rules:snapshot.regels||[]}),
      current=currentOverbooking(actualRecord,actualInput),rules=current.rules;
    if(rules.length!==ids.length)return fail("source_missing");
    if(rules.some(rule=>!rule.eind||rule.id===(snapshot.meta.running||null)))return fail("timer_running");
    const desired=expectedRules.map(rule=>Object.assign({},rule,{dossierId:actualIndirect.id,
      code:input.commercialCode})),merged=mergeRules(rules,expectedRules,desired,input.nowMs);
    if(!merged.ok)return merged;
    const updatedRules=merged.rules;
    const fingerprints=input.summarize(updatedRules).map(row=>row.fp);
    const booked=addBooked(snapshot.meta.geboekt,actualRecord.sourceDate,fingerprints);
    const history=booking.normalizeHistory(snapshot.meta.bookingHistory);
    input.summarize(updatedRules).forEach((row,index)=>{const snap=booking.bookingSnapshot(row,
      actualRecord.sourceDate,{roundingMode:input.roundingMode,sources:updatedRules
        .filter(rule=>rowIds(row).includes(rule.id)).map(rule=>ruleSnapshot(rule,input.hoursOf))});
      history.receipts.push(receipt("over-final-i7-"+actualRecord.id+"-"+index,
        "overbooking_final_i7",snap,input,{overbookingId:actualRecord.id}));});
    const updated=replaceRecord(actualRecord,Object.assign({},actualRecord,{status:"final_i7",finalI7At:input.nowIso,
      updatedAt:input.nowIso,finalI7Fingerprints:fingerprints,
      audit:(actualRecord.audit||[]).slice(-49).concat([{
        type:"definitief-i7",t:input.nowIso}])}));
    updatedRules.forEach(rule=>writer.put("regels",rule));
    writer.put("overboekingen",updated);writer.stores.meta.put(booked,"geboekt");
    writer.stores.meta.put(history,"bookingHistory");
    return ok({overbooking:updated,rules:updatedRules,booked,history});
    });
  }

  const dossierNumber=value=>String(value==null?"":value).trim();
  const dossierNumberKey=value=>dossierNumber(value).toLowerCase();
  const generatedDossierId=()=>"dos-"+Date.now().toString(36)+"-"+
    Math.random().toString(36).slice(2,10);

  /* Nieuwe dossiers en het vaste i7-dossier worden hier aangemaakt. De volledige
     read/check/write vindt plaats binnen één IDB-transactie; gelijktijdige
     aanroepen van deze routes zien daardoor steeds een verse snapshot. */
  async function createDossier(input){
    const spec=input||{},naam=String(spec.naam||"").trim();
    if(!naam)return fail("name_required");
    const nummer=dossierNumber(spec.nummer),numberKey=dossierNumberKey(nummer);
    const requestedId=spec.id||null;
    return atomic(spec,["dossiers"],[],(snapshot,writer)=>{
      const dossiers=snapshot.dossiers||[];
      if(dossiers.some(d=>requestedId&&d.id===requestedId))return fail("id_exists");
      if(numberKey&&dossiers.some(d=>dossierNumberKey(d.nummer)===numberKey))
        return fail("number_exists");
      let id=requestedId;
      if(!id){for(let attempt=0;attempt<12&&!id;attempt++){
        const candidate=generatedDossierId();if(!dossiers.some(d=>d.id===candidate))id=candidate;}
        if(!id)return fail("id_exists");}
      const d={id,nummer:nummer||null,naam,lang:spec.lang||"nl",voorlopig:!nummer,
        codes:Array.isArray(spec.codes)?copy(spec.codes):[],c:dossiers.length,used:
        Number.isFinite(spec.used)?spec.used:1,isI7:false,archief:false,
        gewijzigd:spec.nowMs||Date.now(),revision:1};
      writer.put("dossiers",d);return ok({dossier:d});
    });
  }

  async function ensureI7(input){
    const spec=input||{};
    return atomic(spec,["dossiers"],[],(snapshot,writer)=>{
      const dossiers=snapshot.dossiers||[];
      const marked=dossiers.find(d=>d.isI7);
      if(marked)return ok({dossier:marked,noChange:true});
      /* Oude imports gebruikten alleen de I7-prefix. Claim precies die bestaande
         record, behoud de inhoud en verhoog de revisie voor deze wijziging. */
      const legacy=dossiers.find(d=>/^I7/i.test(d.nummer||""));
      if(legacy){const updated=replaceEntity(legacy,Object.assign({},legacy,{isI7:true}),spec.nowMs||Date.now());
        writer.put("dossiers",updated);return ok({dossier:updated});}
      const standard="I700000000",byNumber=dossiers.find(d=>
        dossierNumberKey(d.nummer)===dossierNumberKey(standard));
      if(byNumber)return fail("i7_number_occupied");
      let id="d-i7";
      if(dossiers.some(d=>d.id===id)){id=null;for(let attempt=0;attempt<12&&!id;attempt++){
        const candidate=generatedDossierId();if(!dossiers.some(d=>d.id===candidate))id=candidate;}
        if(!id)return fail("id_exists");}
      const d={id,nummer:standard,naam:"Indirecte uren",lang:"nl",voorlopig:false,
        codes:[],c:dossiers.length,used:999,isI7:true,archief:false,
        gewijzigd:spec.nowMs||Date.now(),revision:1};
      writer.put("dossiers",d);return ok({dossier:d});
    });
  }

  async function saveDossier(input){
    const dossier=input&&input.dossier;
    if(!dossier||!dossier.id)return fail("invalid_dossier");
    return atomic(input,["dossiers"],[],(snapshot,writer)=>{
      const current=byId(snapshot.dossiers,dossier.id);
      /* Ook een oud schermmodel zonder revision mag een inmiddels gemigreerde
         record niet overschrijven. Twee echte revision-zero records worden bij de
         eerste geldige save naar de monotone revisiereeks gepromoveerd. */
      if(current&&(gateway.revisionOf(current)||gateway.revisionOf(dossier))&&
        !entityMatches(current,dossier))
        return fail("admin_changed");
      const updated=replaceEntity(current||dossier,dossier,input.nowMs||dossier.gewijzigd||Date.now());
      writer.put("dossiers",updated);return ok({dossier:updated});
    });
  }

  async function deleteDossier(input){
    const id=input&&input.id;
    if(!id)return fail("invalid_dossier");
    return atomic(input,["dossiers","regels","overboekingen"],[],(snapshot,writer)=>{
      if(!byId(snapshot.dossiers,id))return fail("invalid_dossier");
      if((snapshot.regels||[]).some(rule=>rule.dossierId===id)||
        (snapshot.overboekingen||[]).some(record=>over.isOpen(record)&&record.targetDossierId===id))
        return fail("admin_changed");
      writer.remove("dossiers",id);return ok({id});
    });
  }

  async function saveDvnRename(input){
    const dossier=input&&input.dossier,rules=input&&input.rules||[],
      beforeDossier=input&&input.beforeDossier||null,beforeRules=input&&input.beforeRules||[];
    if(!dossier||!dossier.id||!dvn.isDvn(dossier))return fail("invalid_dvn");
    await waitFor(input,rules.map(rule=>rule.id));
    return atomic(input,["dossiers","regels"],["stack"],(snapshot,writer)=>{
      const actual=byId(snapshot.dossiers,dossier.id),expectedDossier=beforeDossier||dossier;
      if(!actual||!entityMatches(actual,expectedDossier)||!dvn.isDvn(actual))return fail("invalid_dvn");
      const actualRules=(snapshot.regels||[]).filter(rule=>rule.dossierId===actual.id),
        expected=beforeRules.length?beforeRules:rules;
      if(!sameIds(actualRules.map(rule=>rule.id),expected.map(rule=>rule.id)))return fail("source_changed");
      const merged=mergeRules(actualRules,expected,rules,input.nowMs||dossier.gewijzigd||Date.now());
      if(!merged.ok)return merged;
      const updatedDossier=replaceEntity(actual,Object.assign({},actual,{naam:dossier.naam}),
          input.nowMs||dossier.gewijzigd||Date.now()),stack=snapshot.meta.stack||[],
        stackChanged=stack.some(item=>item.dossierId===actual.id),
        updatedStack=stack.map(item=>item.dossierId!==actual.id?item:
          Object.assign({},item,{omschrijving:String(item.omschrijving||"")
            .replace(/^([0-9]{2}\.[0-9]{2}\.[0-9]{4} · )[^·]*( · )/,
              (_,a,b)=>a+dossier.naam+b)}));
      writer.put("dossiers",updatedDossier);merged.rules.forEach(rule=>writer.put("regels",rule));
      if(stackChanged)writer.stores.meta.put(updatedStack,"stack");
      return ok({dossier:updatedDossier,rules:merged.rules,stack:updatedStack,stackChanged});
    });
  }

  async function clearTrackedData(){
    return atomic({},["dossiers","regels","overboekingen"],
      ["running","pending","stack","dagEinde","dagAudit","geboekt","bookingHistory"],(snapshot,writer)=>{
      writer.stores.dossiers.clear();writer.stores.regels.clear();writer.stores.overboekingen.clear();
      ["running","pending","stack","dagEinde","dagAudit","geboekt","bookingHistory"]
        .forEach(key=>writer.stores.meta.delete(key));
      return ok();
    });
  }

  HH.services.admin=Object.freeze({assignDvnNumber,markDvnPosted,finalizeDvnI7,
    parkOverbooking,refreshOverbooking,completeOverbookings,finalizeOverbookingI7,
    setRegularBooking,bootstrapLegacyBookings,resolveBookingCorrection,
    saveDossier,createDossier,ensureI7,deleteDossier,saveDvnRename,clearTrackedData});
})(globalThis.HH);
