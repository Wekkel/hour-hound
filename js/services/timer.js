"use strict";
/* Enige productie-eigenaar van de lopende-timerpointer en de geserialiseerde
   timerketting. Presentatiecode levert klok, ids en actuele runtimecontext expliciet
   aan; geheugen wordt pas met de geretourneerde effecten bijgewerkt. */
(function(HH){
  if(!HH||!HH.services||!HH.storage||!HH.domain||!HH.domain.time||
    !HH.domain.booking||!HH.domain.dvn)
    throw new Error("HH-lagen ontbreken vóór services/timer.js");
  const gateway=HH.storage.indexedDB,time=HH.domain.time,booking=HH.domain.booking;
  const dvn=HH.domain.dvn;
  const ok=effects=>Object.assign({ok:true},effects||{});
  const fail=(error,details)=>Object.assign({ok:false,error},details||{});
  const copy=value=>JSON.parse(JSON.stringify(value==null?null:value));
  const idOf=timer=>timer&&timer.id||null;
  const byId=(rows,id)=>(rows||[]).find(row=>row.id===id)||null;
  const waitFor=(input,ids)=>typeof input.waitForRules==="function"
    ?input.waitForRules((ids||[]).filter(Boolean)):Promise.resolve();
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
    let updated=map.get(dossier.id)||copy(dossier);
    if(dvn.isDvn(updated)&&dvn.intappState(updated,input.dossiers)==="posted")
      updated=dvn.markNeedsCheck(updated,reason,{dossiers:input.dossiers,
        needsAt:input.nowIso,auditAt:input.nowIso,modifiedAt:input.nowMs});
    map.set(updated.id,updated);return updated;
  }

  async function startNow(input,token){
    if(!tokenValid(token,input))return fail("timer_changed");
    const current=readTimer(input),created=input.createdDossier?copy(input.createdDossier):null;
    const dossier=created||byId(input.dossiers,input.dossierId);
    if(input.dossierId&&!dossier)return fail("dossier_missing");
    const rule={id:input.id,datum:input.date,start:input.time,eind:null,
      dossierId:dossier?dossier.id:null,code:input.code||null,
      omschrijving:input.description||"",uren:0.1,urenHand:false,
      soort:input.kind||"werk",gemaakt:input.nowMs,gewijzigd:input.nowMs};
    const closed=current?closeRule(current,input,null):null;
    let nextStack=copy(input.stack)||[],stackChanged=false;
    if(Object.prototype.hasOwnProperty.call(input,"stackAfter")){
      nextStack=copy(input.stackAfter)||[];stackChanged=true;
    }else if(rule.soort==="werk"&&!input.preserveStack&&nextStack.length){
      nextStack=[];stackChanged=true;
    }
    const dayEnds=copy(input.dayEnds)||{},dayAudit=copy(input.dayAudit)||{};
    const dayWasClosed=dayEnds[input.date]!=null;
    const autoRemoved=dayWasClosed?(input.rules||[])
      .filter(item=>item.datum===input.date&&item.autoAanvul):[];
    let nextDayAudit=dayAudit;
    if(dayWasClosed){
      const previousEnd=dayEnds[input.date];delete dayEnds[input.date];
      nextDayAudit=HH.services.dayRules.dayAuditAfter(dayAudit,input.date,"heropend",{
        reden:"nieuwe timer gestart",autoVerwijderd:autoRemoved.length,
        vorigeEind:previousEnd},input.nowIso);
    }
    const dossierMap=new Map();let updatedDossier=null;
    if(dossier){
      updatedDossier=Object.assign({},dossier,{used:(dossier.used||0)+1,
        gewijzigd:input.nowMs});
      updatedDossier=markDvn(input,dossierMap,updatedDossier,"tijdregel toegevoegd");
    }
    if(closed){
      const oldDossier=byId(input.dossiers,closed.dossierId);
      if(!updatedDossier||!oldDossier||oldDossier.id!==updatedDossier.id)
        markDvn(input,dossierMap,oldDossier,"tijdregel gewijzigd");
    }
    const codeUsage=Object.assign({},input.codeUsage||{});
    if(rule.code)codeUsage[rule.code]=(codeUsage[rule.code]||0)+1;
    await waitFor(input,[rule.id,closed&&closed.id].concat(autoRemoved.map(item=>item.id)));
    if(!tokenValid(token,input))return fail("timer_changed");
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      stores.meta.delete("pending");autoRemoved.forEach(item=>stores.regels.delete(item.id));
      if(closed)stores.regels.put(closed);stores.regels.put(rule);writePointer(stores,rule.id);
      if(stackChanged)stores.meta.put(nextStack,"stack");
      if(dayWasClosed){stores.meta.put(dayEnds,"dagEinde");stores.meta.put(nextDayAudit,"dagAudit");}
      dossierMap.forEach(item=>stores.dossiers.put(item));
      if(rule.code)stores.meta.put(codeUsage,"codeGebruik");
    });
    return ok({rule,closedRule:closed,dossiers:[...dossierMap.values()],createdDossier:created,
      stack:nextStack,stackChanged,dayEnds,nextDayAudit,dayWasClosed,autoRemoved,
      codeUsage,currentTimerId:rule.id,invalidateTimerUndo:true});
  }
  function start(input){return enqueue("starten",input,token=>startNow(input,token));}
  function switchTask(input){return enqueue("wisselen",input,token=>startNow(input,token));}
  function interrupt(input){return enqueue("onderbreken",input,token=>startNow(input,token));}
  function pause(input){return enqueue("pauzeren",input,token=>startNow(input,token));}

  async function stopNow(input,token){
    if(!tokenValid(token,input))return fail("timer_changed");
    const current=readTimer(input);if(!current)return ok({noChange:true,currentTimerId:null});
    const closed=closeRule(current,input,input.end);
    const dossierMap=new Map();markDvn(input,dossierMap,
      byId(input.dossiers,closed.dossierId),"tijdregel gewijzigd");
    await waitFor(input,[closed.id]);if(!tokenValid(token,input))return fail("timer_changed");
    await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
      stores.regels.put(closed);dossierMap.forEach(item=>stores.dossiers.put(item));
      writePointer(stores,null);
    });
    return ok({closedRule:closed,beforeRule:copy(current),dossiers:[...dossierMap.values()],
      currentTimerId:null});
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

  function restoreUndo(input){
    return enqueue("timer-undo",input,async token=>{
      if(!tokenValid(token,input))return fail("timer_changed");
      await waitFor(input,(input.rules||[]).map(rule=>rule.id).concat(input.remove||[]));
      if(!tokenValid(token,input))return fail("timer_changed");
      await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
        (input.rules||[]).forEach(rule=>stores.regels.put(rule));
        (input.remove||[]).forEach(id=>stores.regels.delete(id));
        writePointer(stores,input.restoreRunningId||null);
      });
      return ok({rules:(input.rules||[]).map(copy),remove:(input.remove||[]).slice(),
        currentTimerId:input.restoreRunningId||null});
    });
  }

  function repairInvariant(input){
    return enqueue("timer-invariant herstellen",input,async token=>{
      const open=(input.rules||[]).filter(rule=>!rule.eind),wanted=open[0]||null;
      if(open.length>1){
        if(input.pendingId)await gateway.tx(gateway.TIMER_STORES,"readwrite",
          stores=>stores.meta.delete("pending"));
        const current=byId(open,input.pointerId);
        blocked=true;return ok({blocked:true,currentTimer:current,
        currentTimerId:idOf(current),openRules:open.map(copy),pointerChanged:false});}
      const pointer=idOf(wanted),pointerChanged=(input.pointerId||null)!==pointer;
      if(pointerChanged||input.pendingId){
        await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
          writePointer(stores,pointer);if(input.pendingId)stores.meta.delete("pending");
        });
      }
      blocked=false;
      return ok({blocked:false,currentTimer:wanted?copy(wanted):null,
        currentTimerId:pointer,openRules:open.map(copy),pointerChanged,
        pendingRemoved:!!input.pendingId});
    },true,true);
  }

  function confirmRecovery(input){
    return enqueue("timerherstel bevestigen",input,async token=>{
      const chosen=input.chosenId?byId(input.rules,input.chosenId):null;
      if(input.chosenId&&(!chosen||chosen.eind))return fail("invalid_recovery");
      const replacements=input.replacements||[],replacementIds=new Set(replacements.map(r=>r.id));
      if(replacements.some(rule=>!rule||!rule.id||!rule.eind))return fail("invalid_recovery");
      if(input.chosenId&&replacementIds.has(input.chosenId))return fail("invalid_recovery");
      const remaining=(input.rules||[]).filter(rule=>!rule.eind&&rule.id!==input.chosenId&&
        !replacementIds.has(rule.id));
      if(remaining.length)return fail("invalid_recovery");
      await waitFor(input,replacements.map(rule=>rule.id));
      await gateway.tx(gateway.TIMER_STORES,"readwrite",stores=>{
        replacements.forEach(rule=>stores.regels.put(rule));writePointer(stores,input.chosenId||null);
      });
      blocked=false;
      return ok({rules:replacements.map(copy),currentTimer:chosen?copy(chosen):null,
        currentTimerId:input.chosenId||null,invalidateTimerUndo:true});
    },true);
  }

  HH.services.timer=Object.freeze({writePointer,isBlocked,tokenValid,
    start,switchTask,interrupt,pause,returnToStack,stop,stopOldTimer,keepOldTimer,
    inspectOldTimer,editRule,deleteRule,reopenRule,closeDay,restoreUndo,
    repairInvariant,confirmRecovery});
})(globalThis.HH);
