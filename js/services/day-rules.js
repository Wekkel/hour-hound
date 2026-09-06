"use strict";
/* Dag- en regelmutaties voor de Dag-tab. De UI verzamelt waarden en bevestigingen;
   deze service valideert de actuele invoer, schrijft de volledige transactie en
   retourneert daarna uitsluitend expliciete geheugeneffecten. */
(function(HH){
  if(!HH||!HH.services||!HH.storage||!HH.domain||!HH.domain.time||
    !HH.domain.booking||!HH.domain.dvn||!HH.domain.overbooking)
    throw new Error("HH-lagen ontbreken vóór services/day-rules.js");
  const gateway=HH.storage.indexedDB,time=HH.domain.time,booking=HH.domain.booking;
  const dvn=HH.domain.dvn,over=HH.domain.overbooking;
  const ok=effects=>Object.assign({ok:true},effects||{});
  const fail=(error,details)=>Object.assign({ok:false,error},details||{});
  const copy=value=>JSON.parse(JSON.stringify(value||{}));
  const waitFor=(input,ids)=>typeof input.waitForRules==="function"
    ?input.waitForRules((ids||[]).filter(Boolean)):Promise.resolve();
  const writeTimerPointer=(stores,id)=>{
    if(!HH.services.timer)throw new Error("TimerService ontbreekt");
    HH.services.timer.writePointer(stores,id);
  };
  const byId=(rows,id)=>(rows||[]).find(row=>row.id===id)||null;
  const fresh=(input,snapshot)=>Object.assign({},input,{rules:snapshot.regels||[],
    dossiers:snapshot.dossiers||[],beforeDossiers:input.dossiers||[],overbookings:snapshot.overboekingen||[]});
  const metaValue=(snapshot,input,key,inputKey)=>snapshot.meta[key];
  const atomic=(input,metaKeys,prepare)=>gateway.atomicWrite({
    stores:["regels","dossiers","overboekingen"],metaKeys:metaKeys||[],
    operationId:input.operationId,completedAt:input.nowIso},prepare);
  const revisionMatches=(current,expected)=>gateway.revisionOf(current)===gateway.revisionOf(expected);

  function dayAuditAfter(audit,date,type,extra,nowIso){
    const next=copy(audit),current=next[date],events=current&&
      Array.isArray(current.events)?current.events.slice():[];
    events.push(Object.assign({type,t:nowIso},extra||{}));
    next[date]={events:events.slice(-20)};
    return next;
  }
  function dayStatus(date,dayEnds,dayAudit){
    const has=Object.prototype.hasOwnProperty.call(dayEnds||{},date),end=has?dayEnds[date]:null;
    const audit=dayAudit&&dayAudit[date],events=audit&&Array.isArray(audit.events)?audit.events:[];
    const lastEvent=events.length?events[events.length-1]:null;
    return{open:end==null,closed:end!=null,end:end||null,lastEvent};
  }
  function ruleWarnings(input){
    const rule=input&&input.rule;if(!rule)return[];
    const dossier=byId(input.dossiers,rule.dossierId),warnings=[];
    if(rule.autoAanvul)warnings.push("auto_fill");
    if(dossier&&dvn.isDvn(dossier)&&dvn.intappState(dossier,input.dossiers)==="posted")
      warnings.push("dvn_posted");
    if(input.isBooked)warnings.push("booked");
    if(over.openForRule(rule.id,input.overbookings||[]))warnings.push("parked");
    return warnings;
  }
  function dossierUpdates(input,ids,reason,writes){
    const map=new Map();
    for(const desired of (writes||[]).filter(Boolean)){
      const current=byId(input.dossiers,desired.id),before=byId(input.beforeDossiers,desired.id);
      if(!current){
        if(before)throw new Error("Het dossier is intussen verwijderd");
        map.set(desired.id,gateway.createdRule(copy(desired),input.nowMs));continue;}
      const merged=gateway.mergeRule(current,before,desired,input.nowMs);
      if(!merged.ok)throw new Error("Het dossier is intussen gewijzigd");
      if(!merged.noChange)map.set(desired.id,merged.rule);
    }
    [...new Set((ids||[]).filter(Boolean))].forEach(id=>{
      const dossier=map.get(id)||byId(input.dossiers,id);
      if(dossier&&dvn.isDvn(dossier)&&dvn.intappState(dossier,input.dossiers)==="posted"){
        const updated=dvn.markNeedsCheck(dossier,reason,{dossiers:input.dossiers,
          needsAt:input.nowIso,auditAt:input.nowIso,modifiedAt:input.nowMs});
        map.set(id,gateway.replaceRule(byId(input.dossiers,id),updated,input.nowMs));}
    });
    return[...map.values()];
  }

  function validateRule(rule,input,allowOpen){
    if(!rule||!rule.id)return fail("rule_missing");
    const start=time.hm2m(rule.start),end=rule.eind?time.hm2m(rule.eind):null;
    if(start==null)return fail("invalid_start");
    if(rule.eind&&end==null)return fail("invalid_end");
    if(rule.eind&&end<start)return fail("end_before_start");
    if(!rule.eind&&!allowOpen)return fail("stored_rule_requires_end");
    const context=input.bookingContext||{},hours=booking.hoursOf(rule,context);
    const capacity=booking.dayCapacity(input.rules||[],rule.datum,hours,rule.id,context);
    if(!capacity.allowed)return fail("day_limit",{hours:capacity.hours});
    return ok({hours});
  }
  function requireWarnings(input,rule){
    const warnings=ruleWarnings({rule,dossiers:input.dossiers,
      overbookings:input.overbookings,isBooked:!!input.isBooked});
    return warnings.length&&!input.confirmedWarnings?fail("confirmation_required",{warnings}):
      ok({warnings});
  }

  function protectedAutomatic(snapshot,rule){
    if((snapshot.meta.geboekt&&snapshot.meta.geboekt[rule.datum]||[]).length)return true;
    if((snapshot.overboekingen||[]).some(record=>over.sourceIds(record).includes(rule.id)))return true;
    const dossier=byId(snapshot.dossiers,rule.dossierId);
    return !!(dossier&&dvn.isDvn(dossier)&&dvn.intappState(dossier,snapshot.dossiers)==="posted");
  }
  function reopenAfterChange(snapshot,writer,date,input,keepId){
    const dayEnds=copy(snapshot.meta.dagEinde),previousEnd=dayEnds[date];
    if(previousEnd==null)return{dayWasClosed:false,autoRemoved:[],autoPreserved:[]};
    const automatic=(snapshot.regels||[]).filter(r=>r.datum===date&&r.autoAanvul&&r.id!==keepId),
      autoRemoved=automatic.filter(r=>!protectedAutomatic(snapshot,r)),
      autoPreserved=automatic.filter(r=>protectedAutomatic(snapshot,r));
    delete dayEnds[date];
    const dayAudit=dayAuditAfter(snapshot.meta.dagAudit,date,"heropend",{
      reden:"tijdregistratie gewijzigd",vorigeEind:previousEnd,
      autoVerwijderd:autoRemoved.length,autoBehouden:autoPreserved.length},input.nowIso);
    autoRemoved.forEach(r=>writer.remove("regels",r.id));
    writer.stores.meta.put(dayEnds,"dagEinde");writer.stores.meta.put(dayAudit,"dagAudit");
    return{dayWasClosed:true,dayEnds,dayAudit,autoRemoved,autoPreserved};
  }

  async function addRule(input){
    await waitFor(input,[input.rule&&input.rule.id]);
    return atomic(input,["dagEinde","dagAudit","geboekt"],(snapshot,writer)=>{
      const actual=fresh(input,snapshot);
      if(byId(actual.rules,input.rule.id))return fail("rule_changed");
      const rule=gateway.createdRule(copy(input.rule),input.nowMs),valid=validateRule(rule,actual,!!input.allowOpen);
      if(!valid.ok)return valid;
      const dossiers=dossierUpdates(actual,[rule.dossierId],"tijdregel toegevoegd",input.dossierWrites);
      dossiers.forEach(dossier=>writer.put("dossiers",dossier));writer.put("regels",rule);
      const day=reopenAfterChange(snapshot,writer,rule.datum,input,rule.id);
      return ok(Object.assign({rule,dossiers,undo:day.dayWasClosed?null:{kind:"data",label:input.undoLabel||"regel toevoegen",
        rules:[],remove:[rule.id],expected:[{id:rule.id,revision:rule.revision}]}},day));
    });
  }

  async function editRule(input){
    if(!input.before||!input.rule)return fail("rule_changed");
    const preWarnings=requireWarnings(input,input.before);if(!preWarnings.ok)return preWarnings;
    await waitFor(input,[input.rule.id]);
    return atomic(input,["running","geboekt","dagEinde","dagAudit"],(snapshot,writer)=>{
      const actual=fresh(input,snapshot),current=byId(actual.rules,input.before.id);
      if(!current||current.id!==input.rule.id)return fail("rule_changed");
      const merged=gateway.mergeRule(current,input.before,input.rule,input.nowMs);
      if(!merged.ok)return merged;
      const storedRunning=metaValue(snapshot,input,"running","runningId")||null,
        rule=merged.rule,running=storedRunning===current.id,
        closing=running&&!!rule.eind;
      const valid=validateRule(rule,actual,running&&!closing);if(!valid.ok)return valid;
      if(running&&time.hm2m(rule.start)>time.hm2m(input.nowTime))return fail("running_start_future");
      const warningCheck=requireWarnings(Object.assign({},actual,{isBooked:input.isBooked,
        confirmedWarnings:input.confirmedWarnings}),current);if(!warningCheck.ok)return warningCheck;
      if(merged.noChange)return ok({noChange:true,rule,dossiers:[],warnings:warningCheck.warnings});
      delete rule.hersteld;
      const dossiers=dossierUpdates(actual,[current.dossierId,rule.dossierId],
        "tijdregel gewijzigd",input.dossierWrites);
      dossiers.forEach(dossier=>writer.put("dossiers",dossier));writer.put("regels",rule);
      if(closing){writeTimerPointer(writer.stores,null);writer.stores.meta.delete("pending");}
      const undo=closing?{kind:"timer",label:"regel bewerken",rules:[copy(current)],remove:[],
        restoreRunning:current.id,expectedRunning:null,
        expected:[{id:rule.id,revision:rule.revision}]}:
        {kind:"data",label:"regel bewerken",rules:[copy(current)],remove:[],
          expected:[{id:rule.id,revision:rule.revision}]};
      const day=reopenAfterChange(snapshot,writer,rule.datum,input,rule.id);
      return ok(Object.assign({rule,dossiers,warnings:warningCheck.warnings,closedRunning:closing,
        undo:day.dayWasClosed?null:undo},day));
    });
  }

  async function deleteRule(input){
    if(!input.rule)return fail("rule_changed");
    if(over.openForRule(input.rule.id,input.overbookings||[]))return fail("parked_rule");
    await waitFor(input,[input.rule.id]);
    return atomic(input,["running","geboekt","dagEinde","dagAudit"],(snapshot,writer)=>{
      const actual=fresh(input,snapshot),current=byId(actual.rules,input.rule.id);
      if(!current||!revisionMatches(current,input.rule))return fail("rule_changed");
      if(over.openForRule(current.id,actual.overbookings))return fail("parked_rule");
      const dateBooked=(snapshot.meta.geboekt&&snapshot.meta.geboekt[current.datum]||[]).length>0;
      if(input.isBooked||dateBooked)return fail("booked_rule");
      const wasRunning=(snapshot.meta.running||null)===current.id;
      const dossiers=dossierUpdates(actual,[current.dossierId],"tijdregel verwijderd");
      writer.remove("regels",current.id);dossiers.forEach(dossier=>writer.put("dossiers",dossier));
      if(wasRunning)writeTimerPointer(writer.stores,null);
      const undo=wasRunning?{kind:"timer",label:"regel verwijderen",rules:[copy(current)],remove:[],
        restoreRunning:current.id,expectedRunning:null,expected:[{id:current.id,revision:null}]}:
        {kind:"data",label:"regel verwijderen",rules:[copy(current)],remove:[],
          expected:[{id:current.id,revision:null}]};
      const day=reopenAfterChange(snapshot,writer,current.datum,input,current.id);
      return ok(Object.assign({deletedId:current.id,deletedRule:copy(current),dossiers,wasRunning,
        undo:day.dayWasClosed?null:undo,warnings:ruleWarnings({rule:current,dossiers:actual.dossiers,
          overbookings:actual.overbookings,isBooked:!!input.isBooked})},day));
    });
  }

  async function reopenRule(input){
    if(!input.rule)return fail("rule_changed");
    await waitFor(input,[input.rule.id,input.closedRule&&input.closedRule.id]);
    return atomic(input,["running","dagEinde","dagAudit","geboekt"],(snapshot,writer)=>{
      const actual=fresh(input,snapshot),current=byId(actual.rules,input.rule.id);
      if(!current||!revisionMatches(current,input.rule))return fail("rule_changed");
      const warningCheck=requireWarnings(Object.assign({},input,actual),current);if(!warningCheck.ok)return warningCheck;
      const desired=Object.assign({},input.rule,{eind:null,urenHand:false});delete desired.hersteld;
      const merged=gateway.mergeRule(current,input.rule,desired,input.nowMs);if(!merged.ok)return merged;
      const rule=merged.rule,valid=validateRule(rule,actual,true);if(!valid.ok)return valid;
      if(rule.datum!==input.today)return fail("not_today");
      if(time.hm2m(rule.start)>time.hm2m(input.nowTime))return fail("start_future");
      let closed=null;
      const runningId=snapshot.meta.running||null;
      if(runningId&&runningId!==rule.id){
        const actualRunning=byId(actual.rules,runningId),before=input.currentTimer;
        if(!actualRunning||!before||before.id!==runningId||!input.closedRule)return fail("timer_changed");
        const closeMerge=gateway.mergeRule(actualRunning,before,input.closedRule,input.nowMs);
        if(!closeMerge.ok)return fail("timer_changed",{conflicts:closeMerge.conflicts});closed=closeMerge.rule;
      }
      const day=reopenAfterChange(snapshot,writer,rule.datum,input,rule.id);
      const dossiers=dossierUpdates(actual,[rule.dossierId,closed&&closed.dossierId],
        "tijdregel opnieuw lopend gemaakt");
      if(closed)writer.put("regels",closed);
      dossiers.forEach(d=>writer.put("dossiers",d));writer.put("regels",rule);
      writeTimerPointer(writer.stores,rule.id);writer.stores.meta.delete("pending");
      return ok(Object.assign({rule,closedRule:closed,dossiers,warnings:warningCheck.warnings,runningId:rule.id,
        invalidateTimerUndo:true},day));
    });
  }

  async function closeDay(input){
    if(time.hm2m(input.end)==null)return fail("invalid_end");
    await waitFor(input,[input.closedRule&&input.closedRule.id]);
    return atomic(input,["running","dagEinde","dagAudit","stack"],(snapshot,writer)=>{
      const storedEnds=metaValue(snapshot,input,"dagEinde","dayEnds"),
        storedAudit=metaValue(snapshot,input,"dagAudit","dayAudit"),
        actual=fresh(input,snapshot),status=dayStatus(input.date,storedEnds,storedAudit);
      if(status.closed)return fail("day_closed",{end:status.end});
      let actualRules=actual.rules.slice();
      if(!actualRules.some(rule=>rule.datum===input.date))return fail("day_empty");
      const runningId=snapshot.meta.running||null,actualRunning=runningId?byId(actualRules,runningId):null;
      let closed=null;
      if(actualRunning&&actualRunning.datum===input.date){
        if(!input.closedRule||!input.currentTimer||input.currentTimer.id!==runningId)return fail("timer_changed");
        const merged=gateway.mergeRule(actualRunning,input.currentTimer,input.closedRule,input.nowMs);
        if(!merged.ok)return fail("timer_changed",{conflicts:merged.conflicts});closed=merged.rule;
        const valid=validateRule(closed,actual,false);if(!valid.ok)return valid;
        actualRules=actualRules.map(r=>r.id===closed.id?closed:r);
      }
      const dayEnds=copy(storedEnds);dayEnds[input.date]=input.end;
      const totalBefore=Math.round((typeof input.totalForRules==="function"?
        input.totalForRules(actualRules.filter(r=>r.datum===input.date)):
        booking.totalHours(actualRules.filter(r=>r.datum===input.date),input.bookingContext||{}))*10)/10;
      let dayAudit=dayAuditAfter(storedAudit,input.date,"gesloten",{
        eind:input.end,totaalVoor:totalBefore},input.nowIso),fill=null;
      if(input.fill&&input.isWorkday){
        const fillInput=Object.assign({},actual,{date:input.date,isWorkday:true,dayEnds,dayAudit,
          rules:actualRules,runningId:null,i7Dossier:byId(actual.dossiers,input.i7Dossier&&input.i7Dossier.id),code:input.code,
          currentTotal:totalBefore,dayEnd:input.end,id:input.autoFillId,batchId:input.batchId,
          nowMs:input.nowMs,bookingContext:input.bookingContext});
        fill=planAutoFill(fillInput);
        if(!fill.ok)return fill;
        if(!fill.noChange){fill.rule=gateway.createdRule(fill.rule,input.nowMs);actualRules.push(fill.rule);
          dayAudit=dayAuditAfter(dayAudit,input.date,"aangevuld",{
            uren:fill.shortfall,regels:1,ids:[fill.rule.id],batch:input.batchId,
            totaalVoor:fill.currentTotal,totaalNa:fill.finalTotal},input.nowIso);}
      }
      const dossiers=dossierUpdates(actual,[closed&&closed.dossierId],"tijdregel gewijzigd");
      if(closed)writer.put("regels",closed);if(fill&&!fill.noChange)writer.put("regels",fill.rule);
      dossiers.forEach(d=>writer.put("dossiers",d));
      if(actualRunning&&actualRunning.datum===input.date){writeTimerPointer(writer.stores,null);
        writer.stores.meta.delete("pending");writer.stores.meta.put([],"stack");}
      writer.stores.meta.put(dayEnds,"dagEinde");writer.stores.meta.put(dayAudit,"dagAudit");
      return ok({closedRule:closed,dossiers,dayEnds,dayAudit,fill,
        stoppedRunning:!!(actualRunning&&actualRunning.datum===input.date),
        stack:actualRunning&&actualRunning.datum===input.date?[]:(snapshot.meta.stack||[]),
        invalidateTimerUndo:!!(actualRunning&&actualRunning.datum===input.date)});
    });
  }

  function planAutoFill(input){
    if(!input.isWorkday)return fail("weekend");
    if(dayStatus(input.date,input.dayEnds,input.dayAudit).open)return fail("day_open");
    if(input.runningId&&byId(input.rules,input.runningId)&&
      byId(input.rules,input.runningId).datum===input.date)return fail("timer_running");
    if(!input.i7Dossier)return fail("i7_missing");
    if(!input.code)return fail("admin_code_missing");
    const current=Math.round((+input.currentTotal||0)*10)/10;
    const shortfall=booking.autoFillShortfall(current);
    if(shortfall<=0.05)return ok({noChange:true,currentTotal:current,shortfall:0,finalTotal:current});
    const capacity=booking.dayCapacity(input.rules||[],input.date,shortfall,null,
      input.bookingContext||{});
    if(!capacity.allowed)return fail("day_limit",{hours:capacity.hours});
    const anchor=input.dayEnd||"17:00",rule={id:input.id,datum:input.date,start:anchor,
      eind:anchor,dossierId:input.i7Dossier.id,code:input.code,omschrijving:"Diversen",
      uren:shortfall,urenHand:true,soort:"werk",gemaakt:input.nowMs,gewijzigd:input.nowMs,
      autoAanvul:true,autoAanvulOp:input.nowMs,autoAanvulReden:"dag-aanvulling",
      autoAanvulBatch:input.batchId};
    const finalTotal=Math.round((current+shortfall)*10)/10;
    if(Math.abs(finalTotal-booking.NORM)>0.05)return fail("unreliable_total");
    return ok({rule,currentTotal:current,shortfall,finalTotal});
  }

  async function autoFillDay(input){
    await waitFor(input,[input.id]);
    return atomic(input,["running","dagEinde","dagAudit","geboekt"],(snapshot,writer)=>{
      const actual=fresh(input,snapshot),dayRules=actual.rules.filter(r=>r.datum===input.date),
        currentTotal=Math.round((typeof input.totalForRules==="function"?input.totalForRules(dayRules):
          booking.totalHours(dayRules,input.bookingContext||{}))*10)/10,
        storedEnds=metaValue(snapshot,input,"dagEinde","dayEnds"),
        storedAudit=metaValue(snapshot,input,"dagAudit","dayAudit"),
        plan=planAutoFill(Object.assign({},input,actual,{dayEnds:storedEnds,
          dayAudit:storedAudit,runningId:snapshot.meta.running||null,currentTotal,
          i7Dossier:byId(actual.dossiers,input.i7Dossier&&input.i7Dossier.id)}));
      if(!plan.ok||plan.noChange)return plan;
      plan.rule=gateway.createdRule(plan.rule,input.nowMs);
      const dayAudit=dayAuditAfter(storedAudit,input.date,"aangevuld",{
        uren:plan.shortfall,regels:1,ids:[plan.rule.id],batch:input.batchId,
        totaalVoor:plan.currentTotal,totaalNa:plan.finalTotal},input.nowIso);
      writer.put("regels",plan.rule);writer.stores.meta.put(dayAudit,"dagAudit");
      return ok(Object.assign({},plan,{dayAudit,
        undo:{kind:"data",label:"dag aanvullen",rules:[],remove:[plan.rule.id],
          expected:[{id:plan.rule.id,revision:plan.rule.revision}]}}));
    });
  }

  async function reopenDay(input){
    await waitFor(input,(input.rules||[]).filter(r=>r.datum===input.date&&r.autoAanvul).map(r=>r.id));
    return atomic(input,["running","dagEinde","dagAudit","geboekt"],(snapshot,writer)=>{
      const storedEnds=metaValue(snapshot,input,"dagEinde","dayEnds"),
        storedAudit=metaValue(snapshot,input,"dagAudit","dayAudit"),
        actual=fresh(input,snapshot),status=dayStatus(input.date,storedEnds,storedAudit);
      if(status.open)return fail("day_open_already");
      const running=byId(actual.rules,snapshot.meta.running);
      if(running&&running.datum===input.date)return fail("timer_running");
      const automatic=actual.rules.filter(rule=>rule.datum===input.date&&rule.autoAanvul),
        bookedIds=new Set(input.bookedAutoIds||[]),dateBooked=(snapshot.meta.geboekt&&
          snapshot.meta.geboekt[input.date]||[]).length>0,removed=input.removeAutomatic&&!dateBooked?
          automatic.filter(r=>!bookedIds.has(r.id)&&!protectedAutomatic(snapshot,r)):[];
      if(removed.some(rule=>over.openForRule(rule.id,actual.overbookings)))return fail("parked_rule");
      const dayEnds=copy(storedEnds),previousEnd=dayEnds[input.date];delete dayEnds[input.date];
      const dayAudit=dayAuditAfter(storedAudit,input.date,"heropend",{
        vorigeEind:previousEnd,autoVerwijderd:removed.length,
        autoBehouden:automatic.length-removed.length},input.nowIso);
      removed.forEach(rule=>writer.remove("regels",rule.id));
      writer.stores.meta.put(dayEnds,"dagEinde");writer.stores.meta.put(dayAudit,"dagAudit");
      return ok({dayEnds,dayAudit,removedRules:removed,automaticRules:automatic,
        preservedBooked:automatic.filter(r=>!removed.some(x=>x.id===r.id))});
    });
  }

  HH.services.dayRules=Object.freeze({dayStatus,dayAuditAfter,ruleWarnings,addRule,
    editRule,deleteRule,reopenRule,closeDay,planAutoFill,autoFillDay,reopenDay});
})(globalThis.HH);
