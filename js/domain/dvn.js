"use strict";
/* Pure DVN-classificatie, resolutie en statusovergangen. Dossiers, regels en klok-
   waarden worden expliciet meegegeven; gebruikerslabels blijven in de UI-adapter. */
(function(HH){
  if(!HH||!HH.domain)throw new Error("HH-bootstrap ontbreekt vóór domain/dvn.js");

  const isDvn=dossier=>!!dossier&&(dossier.voorlopig||dossier.dvn);
  const isFinalI7=dossier=>!!dossier&&dossier.dvnDisposition==="final_i7";
  const isIndirect=dossier=>!!dossier&&
    (dossier.isI7||dossier.voorlopig||isFinalI7(dossier));
  const rulesFor=(dossier,rules)=>dossier?(rules||[])
    .filter(rule=>rule.dossierId===dossier.id&&rule.soort!=="pauze"):[];
  function resolvedTarget(dossier,dossiers){
    if(!dossier||!dossier.dvnTo)return null;
    return(dossiers||[]).find(item=>item.id===dossier.dvnTo)||null;
  }
  function resolvedNumber(dossier,dossiers){
    if(!dossier)return"";
    const target=resolvedTarget(dossier,dossiers);
    return(target&&target.nummer)||dossier.nummer||dossier.dvnResolvedNr||"";
  }
  function intappState(dossier,dossiers){
    if(!isDvn(dossier))return"";
    if(isFinalI7(dossier))return"final_i7";
    if(!resolvedNumber(dossier,dossiers))return"missing";
    if(dossier.dvnIntappStatus==="posted")return"posted";
    if(dossier.dvnIntappStatus==="needs_check")return"needs_check";
    return"ready";
  }
  function auditAdd(dossier,type,extra,timestamp){
    const events=(Array.isArray(dossier&&dossier.dvnIntappAudit)?
      dossier.dvnIntappAudit:[]).slice(-19);
    events.push(Object.assign({type,t:timestamp},extra||{}));
    return events;
  }
  function markNeedsCheck(dossier,reason,options){
    const o=Object.assign({dossiers:[],needsAt:"",auditAt:"",modifiedAt:0},options||{});
    if(!isDvn(dossier)||intappState(dossier,o.dossiers)!=="posted")return dossier;
    const why=reason||"";
    return Object.assign({},dossier,{dvnIntappStatus:"needs_check",
      dvnIntappNeedsCheckAt:o.needsAt,dvnIntappNeedsCheckReason:why,
      dvnIntappAudit:auditAdd(dossier,"controle-nodig",{reden:why},o.auditAt),
      gewijzigd:o.modifiedAt});
  }
  function intappInfo(dossier,options){
    const o=Object.assign({dossiers:[],i7Dossier:null,fallbackI7Name:""},options||{}),
      ind=o.i7Dossier;
    if(!dossier)return{nummer:"",naam:"",dvn:false,state:""};
    if(isFinalI7(dossier))return{nummer:ind?ind.nummer:"",
      naam:ind?ind.naam:o.fallbackI7Name,dvn:false,state:""};
    if(dossier.dvnTo){
      const target=resolvedTarget(dossier,o.dossiers);
      if(target)return{nummer:target.nummer||"",naam:target.naam,dvn:true,
        state:intappState(dossier,o.dossiers)};
    }
    if(dossier.voorlopig&&!dossier.nummer)return{nummer:ind?ind.nummer:"",
      naam:ind?ind.naam:o.fallbackI7Name,dvn:true,state:intappState(dossier,o.dossiers)};
    if(isDvn(dossier))return{nummer:resolvedNumber(dossier,o.dossiers),naam:dossier.naam,
      dvn:true,state:intappState(dossier,o.dossiers)};
    return{nummer:dossier.nummer||"",naam:dossier.naam,dvn:false,state:""};
  }

  HH.domain.dvn=Object.freeze({isDvn,isFinalI7,isIndirect,rulesFor,resolvedTarget,
    resolvedNumber,intappState,auditAdd,markNeedsCheck,intappInfo});
})(globalThis.HH);
