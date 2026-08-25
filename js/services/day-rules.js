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
  const byId=(rows,id)=>(rows||[]).find(row=>row.id===id)||null;

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
    const map=new Map((writes||[]).filter(Boolean).map(dossier=>[dossier.id,copy(dossier)]));
    [...new Set((ids||[]).filter(Boolean))].forEach(id=>{
      const dossier=map.get(id)||byId(input.dossiers,id);
      if(dossier&&dvn.isDvn(dossier)&&dvn.intappState(dossier,input.dossiers)==="posted")
        map.set(id,dvn.markNeedsCheck(dossier,reason,{dossiers:input.dossiers,
          needsAt:input.nowIso,auditAt:input.nowIso,modifiedAt:input.nowMs}));
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

  async function addRule(input){
    const rule=copy(input.rule),valid=validateRule(rule,input,!!input.allowOpen);
    if(!valid.ok)return valid;
    rule.gewijzigd=input.nowMs;
    const dossiers=dossierUpdates(input,[rule.dossierId],"tijdregel toegevoegd",input.dossierWrites);
    await waitFor(input,[rule.id]);
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      dossiers.forEach(dossier=>stores.dossiers.put(dossier));stores.regels.put(rule);
    });
    return ok({rule,dossiers,undo:{kind:"data",label:input.undoLabel||"regel toevoegen",
      rules:[],remove:[rule.id]}});
  }

  async function editRule(input){
    const current=byId(input.rules,input.before&&input.before.id);
    if(!current||current.id!==input.rule.id)return fail("rule_changed");
    const running=input.runningId===current.id,closing=running&&!!input.rule.eind;
    const valid=validateRule(input.rule,input,running&&!closing);if(!valid.ok)return valid;
    if(running&&time.hm2m(input.rule.start)>time.hm2m(input.nowTime))
      return fail("running_start_future");
    const warningCheck=requireWarnings(input,current);if(!warningCheck.ok)return warningCheck;
    const rule=Object.assign({},copy(input.rule),{gewijzigd:input.nowMs});delete rule.hersteld;
    const dossiers=dossierUpdates(input,[current.dossierId,rule.dossierId],
      "tijdregel gewijzigd",input.dossierWrites);
    await waitFor(input,[rule.id]);
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      dossiers.forEach(dossier=>stores.dossiers.put(dossier));stores.regels.put(rule);
      if(closing){stores.meta.delete("running");stores.meta.delete("pending");}
    });
    const undo=closing?{kind:"timer",label:"regel bewerken",rules:[copy(current)],remove:[],
      restoreRunning:current.id,expectedRunning:null,
      expected:[{id:rule.id,modified:rule.gewijzigd}]}:
      {kind:"data",label:"regel bewerken",rules:[copy(current)],remove:[]};
    return ok({rule,dossiers,warnings:warningCheck.warnings,closedRunning:closing,undo});
  }

  async function deleteRule(input){
    const current=byId(input.rules,input.rule&&input.rule.id);
    if(!current)return fail("rule_changed");
    if(over.openForRule(current.id,input.overbookings||[]))return fail("parked_rule");
    const wasRunning=input.runningId===current.id;
    const dossiers=dossierUpdates(input,[current.dossierId],"tijdregel verwijderd");
    await waitFor(input,[current.id]);
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      stores.regels.delete(current.id);dossiers.forEach(dossier=>stores.dossiers.put(dossier));
      if(wasRunning)stores.meta.delete("running");
    });
    const undo=wasRunning?{kind:"timer",label:"regel verwijderen",rules:[copy(current)],remove:[],
      restoreRunning:current.id,expectedRunning:null,expected:[{id:current.id,modified:null}]}:
      {kind:"data",label:"regel verwijderen",rules:[copy(current)],remove:[]};
    return ok({deletedId:current.id,deletedRule:copy(current),dossiers,wasRunning,undo,
      warnings:ruleWarnings({rule:current,dossiers:input.dossiers,
        overbookings:input.overbookings,isBooked:!!input.isBooked})});
  }

  async function reopenRule(input){
    const current=byId(input.rules,input.rule&&input.rule.id);
    if(!current)return fail("rule_changed");
    const warningCheck=requireWarnings(input,current);if(!warningCheck.ok)return warningCheck;
    const rule=Object.assign({},copy(input.rule),{eind:null,urenHand:false,
      gewijzigd:input.nowMs});delete rule.hersteld;
    const valid=validateRule(rule,input,true);if(!valid.ok)return valid;
    if(rule.datum!==input.today)return fail("not_today");
    if(time.hm2m(rule.start)>time.hm2m(input.nowTime))return fail("start_future");
    const closed=input.closedRule?copy(input.closedRule):null;
    const dossiers=dossierUpdates(input,[rule.dossierId,closed&&closed.dossierId],
      "tijdregel opnieuw lopend gemaakt");
    await waitFor(input,[rule.id,closed&&closed.id]);
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      if(closed)stores.regels.put(closed);dossiers.forEach(dossier=>stores.dossiers.put(dossier));
      stores.regels.put(rule);stores.meta.put(rule.id,"running");stores.meta.delete("pending");
    });
    return ok({rule,closedRule:closed,dossiers,warnings:warningCheck.warnings,
      runningId:rule.id,invalidateTimerUndo:true});
  }

  async function closeDay(input){
    const status=dayStatus(input.date,input.dayEnds,input.dayAudit);
    if(status.closed)return fail("day_closed",{end:status.end});
    const dayRules=(input.rules||[]).filter(rule=>rule.datum===input.date);
    if(!dayRules.length)return fail("day_empty");
    if(time.hm2m(input.end)==null)return fail("invalid_end");
    const closed=input.closedRule?copy(input.closedRule):null;
    if(closed){const valid=validateRule(closed,input,false);if(!valid.ok)return valid;}
    const dayEnds=copy(input.dayEnds);dayEnds[input.date]=input.end;
    const dayAudit=dayAuditAfter(input.dayAudit,input.date,"gesloten",{
      eind:input.end,totaalVoor:input.totalBefore},input.nowIso);
    const dossiers=dossierUpdates(input,[closed&&closed.dossierId],"tijdregel gewijzigd");
    await waitFor(input,[closed&&closed.id]);
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      if(closed)stores.regels.put(closed);dossiers.forEach(dossier=>stores.dossiers.put(dossier));
      if(input.runningId&&closed){stores.meta.delete("running");stores.meta.delete("pending");
        stores.meta.put([],"stack");}
      stores.meta.put(dayEnds,"dagEinde");stores.meta.put(dayAudit,"dagAudit");
    });
    return ok({closedRule:closed,dossiers,dayEnds,dayAudit,
      stoppedRunning:!!(input.runningId&&closed),stack:input.runningId&&closed?[]:input.stack,
      invalidateTimerUndo:!!(input.runningId&&closed)});
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
    const plan=planAutoFill(input);if(!plan.ok||plan.noChange)return plan;
    const dayAudit=dayAuditAfter(input.dayAudit,input.date,"aangevuld",{
      uren:plan.shortfall,regels:1,ids:[plan.rule.id],batch:input.batchId,
      totaalVoor:plan.currentTotal,totaalNa:plan.finalTotal},input.nowIso);
    await waitFor(input,[plan.rule.id]);
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      stores.regels.put(plan.rule);stores.meta.put(dayAudit,"dagAudit");
    });
    return ok(Object.assign({},plan,{dayAudit,
      undo:{kind:"data",label:"dag aanvullen",rules:[],remove:[plan.rule.id]}}));
  }

  async function reopenDay(input){
    const status=dayStatus(input.date,input.dayEnds,input.dayAudit);
    if(status.open)return fail("day_open_already");
    if(input.runningId&&byId(input.rules,input.runningId)&&
      byId(input.rules,input.runningId).datum===input.date)return fail("timer_running");
    const automatic=(input.rules||[]).filter(rule=>rule.datum===input.date&&rule.autoAanvul);
    const removed=input.removeAutomatic?automatic:[];
    if(removed.some(rule=>over.openForRule(rule.id,input.overbookings||[])))
      return fail("parked_rule");
    const dayEnds=copy(input.dayEnds),previousEnd=dayEnds[input.date];delete dayEnds[input.date];
    const dayAudit=dayAuditAfter(input.dayAudit,input.date,"heropend",{
      vorigeEind:previousEnd,autoVerwijderd:removed.length,
      autoBehouden:input.removeAutomatic?0:automatic.length},input.nowIso);
    await waitFor(input,removed.map(rule=>rule.id));
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      removed.forEach(rule=>stores.regels.delete(rule.id));
      stores.meta.put(dayEnds,"dagEinde");stores.meta.put(dayAudit,"dagAudit");
    });
    return ok({dayEnds,dayAudit,removedRules:removed,automaticRules:automatic});
  }

  HH.services.dayRules=Object.freeze({dayStatus,dayAuditAfter,ruleWarnings,addRule,
    editRule,deleteRule,reopenRule,closeDay,planAutoFill,autoFillDay,reopenDay});
})(globalThis.HH);
