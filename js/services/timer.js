"use strict";
/* Enige productie-eigenaar van de lopende-timerpointer en de geserialiseerde
   timerketting. Presentatiecode levert klok, ids en actuele runtimecontext expliciet
   aan; geheugen wordt pas met de geretourneerde effecten bijgewerkt. */
(function(HH){
  if(!HH||!HH.services||!HH.storage||!HH.domain||!HH.domain.time||
    !HH.domain.booking||!HH.domain.dvn)
    throw new Error("HH-lagen ontbreken vóór services/timer.js");
  const gateway=HH.storage.indexedDB,time=HH.domain.time,booking=HH.domain.booking;
  const dvn=HH.domain.dvn,over=HH.domain.overbooking;
  const ok=effects=>Object.assign({ok:true},effects||{});
  const fail=(error,details)=>Object.assign({ok:false,error},details||{});
  const copy=value=>JSON.parse(JSON.stringify(value==null?null:value));
  const idOf=timer=>timer&&timer.id||null;
  const byId=(rows,id)=>(rows||[]).find(row=>row.id===id)||null;
  const sameTimer=(current,expected)=>!!current&&!!expected&&current.id===expected.id&&
    current.datum===expected.datum&&current.start===expected.start&&
    (current.eind||null)===(expected.eind||null);
  const waitFor=(input,ids)=>typeof input.waitForRules==="function"
    ?input.waitForRules((ids||[]).filter(Boolean)):Promise.resolve();
  const revisionMatches=(rule,expected)=>{
    if(!expected)return false;
    if(Object.prototype.hasOwnProperty.call(expected,"revision"))
      return expected.revision==null?!rule:!!rule&&gateway.revisionOf(rule)===expected.revision;
    const modified=expected.modified==null?expected.gewijzigd:expected.modified;
    return modified==null?!rule:!!rule&&(rule.gewijzigd||0)===modified;
  };
  let counter=0,currentToken=0,chain=Promise.resolve(),blocked=false,knownTimerId;

  function writePointer(stores,id){
    if(id)stores.meta.put(id,"running");else stores.meta.delete("running");
  }
  function readTimer(input){
    return typeof input.readCurrentTimer==="function"?input.readCurrentTimer():input.currentTimer;
  }
  function tokenValid(token,input){
    return !!token&&token.id===currentToken&&knownTimerId===token.expectedRunningId;
  }
  function enqueue(name,input,work,allowBlocked,resync){
    const expected=idOf(input&&input.currentTimer);
    const execute=async()=>{
      if(blocked&&!allowBlocked)return fail("blocked");
      if(resync||knownTimerId===undefined)knownTimerId=expected;
      const token={id:++counter,name:name||"timer",expectedRunningId:expected};
      currentToken=token.id;
      if(knownTimerId!==expected)return fail("timer_changed");
      try{
        const result=await work(token);
        if(result&&result.ok&&Object.prototype.hasOwnProperty.call(result,"currentTimerId"))
          knownTimerId=result.currentTimerId||null;
        return result;
      }
      catch(error){return fail("write_failed",{cause:String(error&&error.message||error)});}
    };
    const result=chain.then(execute,execute);chain=result.then(()=>{},()=>{});return result;
  }
  function isBlocked(){return blocked;}

  function closeRule(rule,input,endValue){
    if(!rule)return null;
    const closed=Object.assign({},rule);
    if(input.pendingDescription!=null)closed.omschrijving=input.pendingDescription;
    let end=endValue;
    if(end==null||time.hm2m(end)==null)
      end=closed.datum!==input.date?"23:59":input.time;
    if(time.hm2m(end)==null||time.hm2m(end)<time.hm2m(closed.start))end="23:59";
    closed.eind=end;
    if(!closed.urenHand)closed.uren=Math.ceil(Math.max(1,
      time.hm2m(end)-time.hm2m(closed.start))/6)/10;
    closed.gewijzigd=input.nowMs;
    return closed;
  }
  function markDvn(input,map,dossier,reason){
    if(!dossier)return null;
    const persisted=byId(input.dossiers,dossier.id),existing=map.get(dossier.id);
    let updated=existing||copy(dossier);
    if(dvn.isDvn(updated)&&dvn.intappState(updated,input.dossiers)==="posted")
      updated=dvn.markNeedsCheck(updated,reason,{dossiers:input.dossiers,
        needsAt:input.nowIso,auditAt:input.nowIso,modifiedAt:input.nowMs});
    updated=Object.assign({},updated,{gewijzigd:input.nowMs,
      revision:persisted?gateway.revisionOf(persisted)+1:
        Math.max(1,gateway.revisionOf(updated))});
    map.set(updated.id,updated);return updated;
  }

  async function startNow(input,token){
    if(!tokenValid(token,input))return fail("timer_changed");
    const expected=idOf(input.currentTimer);
    await waitFor(input,[input.id,expected]);
    if(!tokenValid(token,input))return fail("timer_changed");
    return gateway.atomicWrite({stores:["regels","dossiers","overboekingen"],
      metaKeys:["running","pending","stack","dagEinde","dagAudit","codeGebruik","geboekt"],
      operationId:input.operationId,completedAt:input.nowIso},(snapshot,writer)=>{
      const currentId=snapshot.meta.running||null;
      if(currentId!==expected)return fail("timer_changed");
      const current=currentId?byId(snapshot.regels,currentId):null;
      if(currentId&&!current)return fail("timer_missing");
      /* Metadatawrites mogen na de klik nog afronden. De transitie sluit daarom de
         actuele record en bewaart diens nieuwste metadata; alleen een wijziging aan
         de timeridentiteit/tijdlijn is een echt conflict. */
      if(current&&!sameTimer(current,input.currentTimer))return fail("timer_changed");
      const created=input.createdDossier?copy(input.createdDossier):null,
        dossier=created||byId(snapshot.dossiers,input.dossierId);
      if(input.dossierId&&!dossier)return fail("dossier_missing");
      const rule=gateway.createdRule({id:input.id,datum:input.date,start:input.time,eind:null,
        dossierId:dossier?dossier.id:null,code:input.code||null,
        omschrijving:input.description||"",uren:0.1,urenHand:false,
        soort:input.kind||"werk",gemaakt:input.nowMs},input.nowMs);
      const closed=current?gateway.replaceRule(current,closeRule(current,input,null),input.nowMs):null;
      let nextStack=copy(snapshot.meta.stack)||[],stackChanged=false;
      if(Object.prototype.hasOwnProperty.call(input,"stackAfter")){
        nextStack=copy(input.stackAfter)||[];stackChanged=true;
      }else if(rule.soort==="werk"&&!input.preserveStack&&nextStack.length){nextStack=[];stackChanged=true;}
      const dayEnds=copy(snapshot.meta.dagEinde)||{},dayAudit=copy(snapshot.meta.dagAudit)||{},
        dayWasClosed=dayEnds[input.date]!=null,dateBooked=(snapshot.meta.geboekt&&
          snapshot.meta.geboekt[input.date]||[]).length>0,
        automatic=dayWasClosed?snapshot.regels.filter(r=>r.datum===input.date&&r.autoAanvul):[],
        protectedIds=new Set((snapshot.overboekingen||[])
          .flatMap(record=>over.sourceIds(record))),
        autoRemoved=dateBooked?[]:automatic.filter(rule=>!protectedIds.has(rule.id));
      let nextDayAudit=dayAudit;
      if(dayWasClosed){const previousEnd=dayEnds[input.date];delete dayEnds[input.date];
        nextDayAudit=HH.services.dayRules.dayAuditAfter(dayAudit,input.date,"heropend",{
          reden:"nieuwe timer gestart",autoVerwijderd:autoRemoved.length,
          autoBehouden:automatic.length-autoRemoved.length,vorigeEind:previousEnd},input.nowIso);}
      const actualInput=Object.assign({},input,{dossiers:snapshot.dossiers}),dossierMap=new Map();
      let updatedDossier=null;
      if(dossier){updatedDossier=Object.assign({},dossier,{used:(dossier.used||0)+1,gewijzigd:input.nowMs});
        updatedDossier=markDvn(actualInput,dossierMap,updatedDossier,"tijdregel toegevoegd");}
      if(closed){const oldDossier=byId(snapshot.dossiers,closed.dossierId);
        if(!updatedDossier||!oldDossier||oldDossier.id!==updatedDossier.id)
          markDvn(actualInput,dossierMap,oldDossier,"tijdregel gewijzigd");}
      const codeUsage=Object.assign({},snapshot.meta.codeGebruik||{});
      if(rule.code)codeUsage[rule.code]=(codeUsage[rule.code]||0)+1;
      writer.stores.meta.delete("pending");autoRemoved.forEach(item=>writer.remove("regels",item.id));
      if(closed)writer.put("regels",closed);writer.put("regels",rule);writePointer(writer.stores,rule.id);
      if(stackChanged)writer.stores.meta.put(nextStack,"stack");
      if(dayWasClosed){writer.stores.meta.put(dayEnds,"dagEinde");writer.stores.meta.put(nextDayAudit,"dagAudit");}
      dossierMap.forEach(item=>writer.put("dossiers",item));
      if(rule.code)writer.stores.meta.put(codeUsage,"codeGebruik");
      return ok({rule,closedRule:closed,dossiers:[...dossierMap.values()],createdDossier:created,
        stack:nextStack,stackChanged,dayEnds,nextDayAudit,dayWasClosed,autoRemoved,
        autoPreserved:automatic.filter(r=>!autoRemoved.includes(r)),codeUsage,currentTimerId:rule.id,
        invalidateTimerUndo:true});
    });
  }
  function start(input){return enqueue("starten",input,token=>startNow(input,token));}
  function switchTask(input){return enqueue("wisselen",input,token=>startNow(input,token));}
  function interrupt(input){return enqueue("onderbreken",input,token=>startNow(input,token));}
  function pause(input){return enqueue("pauzeren",input,token=>startNow(input,token));}

  async function stopNow(input,token){
    if(!tokenValid(token,input))return fail("timer_changed");
    const expected=idOf(input.currentTimer);if(!expected)return ok({noChange:true,currentTimerId:null});
    await waitFor(input,[expected]);if(!tokenValid(token,input))return fail("timer_changed");
    return gateway.atomicWrite({stores:["regels","dossiers","overboekingen"],metaKeys:["running"],
      operationId:input.operationId,completedAt:input.nowIso},(snapshot,writer)=>{
      if((snapshot.meta.running||null)!==expected)return fail("timer_changed");
      const current=byId(snapshot.regels,expected);if(!current)return fail("timer_missing");
      if(!sameTimer(current,input.currentTimer))return fail("timer_changed");
      const closed=gateway.replaceRule(current,closeRule(current,input,input.end),input.nowMs),
        actualInput=Object.assign({},input,{dossiers:snapshot.dossiers}),dossierMap=new Map();
      markDvn(actualInput,dossierMap,byId(snapshot.dossiers,closed.dossierId),"tijdregel gewijzigd");
      writer.put("regels",closed);dossierMap.forEach(item=>writer.put("dossiers",item));writePointer(writer.stores,null);
      return ok({closedRule:closed,beforeRule:copy(current),dossiers:[...dossierMap.values()],currentTimerId:null});
    });
  }
  function stop(input){return enqueue(input.name||"stoppen",input,token=>stopNow(input,token));}
  function stopOldTimer(input){return enqueue("oude timer stoppen",input,
    token=>stopNow(input,token));}
  function keepOldTimer(input){return enqueue("oude timer door laten lopen",input,token=>{
    if(!tokenValid(token,input))return fail("timer_changed");
    const current=readTimer(input);return current?ok({rule:copy(current),currentTimerId:current.id}):
      fail("timer_missing");
  });}
  function inspectOldTimer(input){
    const current=input&&input.currentTimer;
    return{old:!!(current&&current.datum<input.date),rule:current?copy(current):null};
  }

  function returnToStack(input){
    const name="terugkeren";
    return enqueue(name,input,token=>input.returnEmpty?stopNow(input,token):startNow(input,token));
  }

  function dayTransition(name,method,input){
    return enqueue(name,input,async token=>{
      if(!tokenValid(token,input))return fail("timer_changed");
      const result=await HH.services.dayRules[method](input);
      if(!result||!result.ok)return result;
      let next=idOf(input.currentTimer);
      if(method==="editRule"&&result.closedRunning)next=null;
      if(method==="deleteRule"&&result.wasRunning)next=null;
      if(method==="reopenRule")next=result.runningId||null;
      if(method==="closeDay"&&result.stoppedRunning)next=null;
      return Object.assign({},result,{currentTimerId:next});
    });
  }
  const editRule=input=>dayTransition("regel bewerken","editRule",input);
  const deleteRule=input=>dayTransition("regel verwijderen","deleteRule",input);
  const reopenRule=input=>dayTransition("regel opnieuw laten lopen","reopenRule",input);
  const closeDay=input=>dayTransition("werkdag afsluiten","closeDay",input);

  function validateUndoRules(rules,runningId,input){
    const open=(rules||[]).filter(rule=>!rule.eind);
    if(open.length>1||((open[0]&&open[0].id)||null)!==(runningId||null))
      return fail("invalid_undo");
    const dates=new Set();
    for(const rule of rules||[]){
      const start=time.hm2m(rule.start),end=rule.eind?time.hm2m(rule.eind):null;
      if(!rule.id||!rule.datum||start==null||rule.eind&&end==null||
        rule.eind&&end<start)return fail("invalid_undo");
      dates.add(rule.datum);
    }
    for(const date of dates){
      const day=(rules||[]).filter(rule=>rule.datum===date),total=
        booking.totalHours(day,Object.assign({},input.bookingContext||{},
          {runningId:runningId||null}));
      if(total>booking.DAGMAX+0.0001)return fail("day_limit",{hours:total});
    }
    return ok();
  }

  function restoreUndo(input){
    return enqueue("timer-undo",input,async token=>{
      if(!tokenValid(token,input))return fail("timer_changed");
      await waitFor(input,(input.rules||[]).map(rule=>rule.id).concat(input.remove||[]));
      if(!tokenValid(token,input))return fail("timer_changed");
      return gateway.atomicWrite({stores:["regels","dossiers","overboekingen"],
        metaKeys:["running","geboekt","dagEinde","dagAudit"]},(snapshot,writer)=>{
        const current=snapshot.regels||[],expected=input.expected||[],
          expectedRunning=input.expectedRunning===undefined?
            idOf(input.currentTimer):input.expectedRunning,
          actualRunning=snapshot.meta.running||null;
        if(actualRunning!==(expectedRunning||null))return fail("timer_changed");
        const affected=[...new Set((input.rules||[]).map(rule=>rule.id)
          .concat(input.remove||[]))];
        if(affected.some(id=>!expected.some(item=>item.id===id)))return fail("invalid_undo");
        const conflict=expected.find(item=>!revisionMatches(byId(current,item.id),item));
        if(conflict)return fail("rule_changed",{conflict:conflict.id});
        const overbookingSources=new Set((snapshot.overboekingen||[])
          .flatMap(record=>over.sourceIds(record)));
        if(affected.some(id=>overbookingSources.has(id)))
          return fail("parked_rule");
        const affectedDates=new Set();
        affected.forEach(id=>{const rule=byId(current,id)||(input.rules||[])
          .find(item=>item.id===id);if(rule)affectedDates.add(rule.datum);});
        if([...affectedDates].some(date=>
          ((snapshot.meta.geboekt&&snapshot.meta.geboekt[date])||[]).length))
          return fail("booked_rule");
        const affectedDossiers=new Set();
        affected.forEach(id=>{const before=byId(current,id),after=(input.rules||[])
          .find(item=>item.id===id);if(before&&before.dossierId)affectedDossiers.add(before.dossierId);
          if(after&&after.dossierId)affectedDossiers.add(after.dossierId);});
        if((snapshot.dossiers||[]).some(dossier=>affectedDossiers.has(dossier.id)&&
          dvn.isDvn(dossier)&&(dvn.isFinalI7(dossier)||
            ["posted","needs_check"].includes(dossier.dvnIntappStatus)||
            ["posted","needs_check","final_i7"]
              .includes(dvn.intappState(dossier,snapshot.dossiers||[])))))
          return fail("admin_changed");
        const removed=new Set(input.remove||[]),restored=(input.rules||[]).map(rule=>{
          const now=byId(current,rule.id);
          return Object.assign({},copy(rule),{gewijzigd:input.nowMs||Date.now(),
            revision:gateway.revisionOf(now||rule)+1});
        });
        if(restored.some(rule=>rule.dossierId&&!byId(snapshot.dossiers,rule.dossierId)))
          return fail("dossier_missing");
        let next=current.filter(rule=>!removed.has(rule.id));
        restored.forEach(rule=>{next=next.filter(item=>item.id!==rule.id);next.push(rule);});
        const restoreRunning=input.kind==="data"?actualRunning:(input.restoreRunningId||null),
          valid=validateUndoRules(next,restoreRunning,input);
        if(!valid.ok)return valid;
        const dayEnds=copy(snapshot.meta.dagEinde)||{},dayAudit=copy(snapshot.meta.dagAudit)||{},
          opensClosedDay=next.some(rule=>!rule.eind&&dayEnds[rule.datum]!=null);
        if(opensClosedDay)return fail("day_closed");
        const removedAutomatic=[...removed].map(id=>byId(current,id))
          .filter(rule=>rule&&rule.autoAanvul),auditDates=[...new Set(removedAutomatic
            .map(rule=>rule.datum).filter(date=>dayEnds[date]!=null))];
        let nextDayAudit=dayAudit;
        auditDates.forEach(date=>{
          const rows=removedAutomatic.filter(rule=>rule.datum===date);
          nextDayAudit=HH.services.dayRules.dayAuditAfter(nextDayAudit,date,
            "aanvulling-ongedaan",{regels:rows.length,ids:rows.map(rule=>rule.id),
              uren:Math.round(rows.reduce((sum,rule)=>sum+
                (+booking.hoursOf(rule,input.bookingContext||{})||0),0)*10)/10},
            input.nowIso||new Date(input.nowMs||Date.now()).toISOString());
        });
        restored.forEach(rule=>writer.put("regels",rule));
        removed.forEach(id=>writer.remove("regels",id));
        if(input.kind!=="data")writePointer(writer.stores,restoreRunning);
        if(auditDates.length)writer.stores.meta.put(nextDayAudit,"dagAudit");
        return ok({rules:restored,remove:[...removed],currentTimerId:restoreRunning,
          dayEnds:auditDates.length?dayEnds:undefined,
          dayAudit:auditDates.length?nextDayAudit:undefined});
      });
    });
  }

  function repairInvariant(input){
    return enqueue("timer-invariant herstellen",input,async token=>{
      if(input.allowWrite===false){
        const open=(input.rules||[]).filter(rule=>!rule.eind),wanted=open[0]||null;
        blocked=open.length>1;return ok({blocked,currentTimer:blocked?
          byId(open,input.pointerId):wanted,currentTimerId:blocked?
          idOf(byId(open,input.pointerId)):idOf(wanted),openRules:open.map(copy),
          pointerChanged:false,pendingRemoved:false});
      }
      return gateway.atomicWrite({stores:["regels"],metaKeys:["running","pending"]},
        (snapshot,writer)=>{
      const open=(snapshot.regels||[]).filter(rule=>!rule.eind),wanted=open[0]||null,
        pointerId=snapshot.meta.running||null,pendingId=snapshot.meta.pending||null;
      if(open.length>1){
        if(pendingId)writer.stores.meta.delete("pending");
        const current=byId(open,pointerId);
        blocked=true;return ok({blocked:true,currentTimer:current,
        currentTimerId:idOf(current),openRules:open.map(copy),pointerChanged:false});}
      const pointer=idOf(wanted),pointerChanged=pointerId!==pointer;
      if(pointerChanged)writePointer(writer.stores,pointer);
      if(pendingId)writer.stores.meta.delete("pending");
      blocked=false;
      return ok({blocked:false,currentTimer:wanted?copy(wanted):null,
        currentTimerId:pointer,openRules:open.map(copy),pointerChanged,
        pendingRemoved:!!pendingId});
      });
    },true,true);
  }

  function confirmRecovery(input){
    return enqueue("timerherstel bevestigen",input,async token=>{
      const replacements=input.replacements||[],replacementIds=new Set(replacements.map(r=>r.id));
      if(replacements.some(rule=>!rule||!rule.id||!rule.eind))return fail("invalid_recovery");
      if(input.chosenId&&replacementIds.has(input.chosenId))return fail("invalid_recovery");
      await waitFor(input,replacements.map(rule=>rule.id));
      return gateway.atomicWrite({stores:["regels","dossiers","overboekingen"],
        metaKeys:["running","geboekt"]},(snapshot,writer)=>{
        const current=snapshot.regels||[],chosen=input.chosenId?byId(current,input.chosenId):null;
        if(input.chosenId&&(!chosen||chosen.eind))return fail("invalid_recovery");
        const merged=[];
        for(const desired of replacements){
          const actual=byId(current,desired.id),before=byId(input.rules,desired.id);
          if(!actual||!before)return fail("invalid_recovery");
          const result=gateway.mergeRule(actual,before,desired,input.nowMs||Date.now());
          if(!result.ok)return fail("invalid_recovery");
          merged.push(result.rule);
        }
        const affected=new Set(replacements.map(rule=>rule.id));
        if([...affected].some(id=>over.openForRule(id,snapshot.overboekingen||[])))
          return fail("parked_rule");
        if(merged.some(rule=>((snapshot.meta.geboekt&&snapshot.meta.geboekt[rule.datum])||[]).length))
          return fail("booked_rule");
        const dossierIds=new Set(merged.map(rule=>rule.dossierId).filter(Boolean));
        if((snapshot.dossiers||[]).some(dossier=>dossierIds.has(dossier.id)&&dvn.isDvn(dossier)&&
          (dvn.isFinalI7(dossier)||["posted","needs_check"].includes(dossier.dvnIntappStatus))))
          return fail("admin_changed");
        const remaining=current.filter(rule=>!rule.eind&&rule.id!==input.chosenId&&
          !replacementIds.has(rule.id));
        if(remaining.length)return fail("invalid_recovery");
        let next=current.slice();merged.forEach(rule=>{next=next.filter(item=>item.id!==rule.id);
          next.push(rule);});
        const valid=validateUndoRules(next,input.chosenId||null,input);
        if(!valid.ok)return fail("invalid_recovery");
        merged.forEach(rule=>writer.put("regels",rule));writePointer(writer.stores,input.chosenId||null);
        blocked=false;
        return ok({rules:merged.map(copy),currentTimer:chosen?copy(chosen):null,
          currentTimerId:input.chosenId||null,invalidateTimerUndo:true});
      });
    },true);
  }

  HH.services.timer=Object.freeze({writePointer,isBlocked,tokenValid,idle:()=>chain,
    start,switchTask,interrupt,pause,returnToStack,stop,stopOldTimer,keepOldTimer,
    inspectOldTimer,editRule,deleteRule,reopenRule,closeDay,restoreUndo,
    repairInvariant,confirmRecovery});
})(globalThis.HH);
