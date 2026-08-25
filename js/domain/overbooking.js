"use strict";
/* Pure statuslogica voor tijdelijk niet-boekbare dossierregels. Geen UI, opslag of
   runtime-arrays: regels, dossiers en samenvattingsfunctie zijn expliciete invoer. */
(function(HH){
  if(!HH||!HH.domain)throw new Error("HH-bootstrap ontbreekt vóór domain/overbooking.js");

  const isOpen=record=>!!record&&record.status==="waiting";
  const isTerminal=record=>!!record&&
    (record.status==="done"||record.status==="final_i7");
  const sourceIds=record=>(record&&Array.isArray(record.sourceRuleIds)?record.sourceRuleIds:[])
    .filter(Boolean).slice().sort();
  const openForRule=(id,records)=>(records||[]).find(record=>isOpen(record)&&
    sourceIds(record).indexOf(id)>=0)||null;
  const forSourceId=(id,records)=>openForRule(id,records)||(records||[]).slice().reverse()
    .find(record=>sourceIds(record).indexOf(id)>=0)||null;
  function sourceMatches(row,record,date){
    const ids=(row&&Array.isArray(row.bron)?row.bron.map(item=>item.id):[])
      .filter(Boolean).sort(),source=sourceIds(record);
    return !!ids.length&&record.sourceDate===date&&ids.every(id=>source.indexOf(id)>=0);
  }
  const waitingForRow=(row,date,records)=>(records||[])
    .find(record=>isOpen(record)&&sourceMatches(row,record,date))||null;
  function fingerprints(record){
    if(!record)return[];
    const list=record.status==="final_i7"?record.finalI7Fingerprints:record.sourceFingerprints;
    if(Array.isArray(list)&&list.length)return list.filter(value=>typeof value==="string");
    return record.sourceFingerprint?[record.sourceFingerprint]:[];
  }
  function terminalForRow(row,date,records){
    if(!row||!row.fp)return null;
    return(records||[]).find(record=>isTerminal(record)&&record.sourceDate===date&&
      fingerprints(record).indexOf(row.fp)>=0)||null;
  }
  function changeCodes(record,options){
    if(!isOpen(record))return[];
    const o=Object.assign({rules:[],dossiers:[],summarize:()=>[]},options||{});
    const result=[],snapshot=Array.isArray(record.sourceSnapshot)?record.sourceSnapshot:[],actual={};
    o.rules.forEach(rule=>{actual[rule.id]=rule;});
    snapshot.forEach(saved=>{
      const rule=actual[saved.id];
      if(!rule){result.push("source_rule_removed");return;}
      if((rule.gewijzigd||0)!==(saved.gewijzigd||0))result.push("source_rule_changed");
      if(rule.dossierId!==record.targetDossierId)
        result.push("source_rule_target_changed");
    });
    const ids=sourceIds(record);
    if(snapshot.length!==ids.length)result.push("source_selection_changed");
    const source=ids.map(id=>actual[id]).filter(Boolean);
    if(source.length===ids.length){
      const old=fingerprints(record).slice().sort();
      const current=o.summarize(source).map(row=>row.fp).sort();
      if(old.length&&old.join("\n")!==current.join("\n"))
        result.push("summary_changed");
    }
    const target=o.dossiers.find(dossier=>dossier.id===record.targetDossierId);
    if(!target)result.push("target_missing");
    else{
      if((target.nummer||"")!==(record.targetNumberSnapshot||""))
        result.push("target_number_changed");
      if((target.naam||"")!==(record.targetNameSnapshot||""))
        result.push("target_name_changed");
    }
    return[...new Set(result)];
  }
  function state(record,options){
    if(!record)return"";
    if(isTerminal(record))return record.status;
    return changeCodes(record,options).length?"needs_check":"waiting";
  }
  const canFinish=(record,targetStatus)=>isOpen(record)&&
    (targetStatus==="done"||targetStatus==="final_i7");

  HH.domain.overbooking=Object.freeze({isOpen,isTerminal,sourceIds,openForRule,
    forSourceId,sourceMatches,waitingForRow,fingerprints,terminalForRow,changeCodes,state,
    canFinish});
})(globalThis.HH);
