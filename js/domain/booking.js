"use strict";
/* Pure dag- en Intapp-berekeningen. Alle klok-, dossier- en lifecyclecontext wordt
   expliciet meegegeven; deze laag leest geen DOM, IndexedDB of runtime-globals. */
(function(HH){
  if(!HH||!HH.domain||!HH.domain.time)
    throw new Error("HH.domain.time ontbreekt vóór domain/booking.js");

  const time=HH.domain.time;
  const NORM=8.0;
  const DAGMAX=24.0;
  const context=o=>Object.assign({runningId:null,today:"",nowHM:"00:00",dayEnd:null},o||{});

  function endOf(rule,options){
    const o=context(options);
    return rule.eind||(o.runningId===rule.id?
      (rule.datum===o.today?o.nowHM:"23:59"):rule.start);
  }
  function rawMinutes(rule,options){
    const a=time.hm2m(rule.start),b=time.hm2m(endOf(rule,options));
    if(a==null||b==null)return 1;
    return Math.max(1,b-a);
  }
  function hoursOf(rule,options){
    const o=context(options);
    if(rule.soort==="pauze")return 0;
    if(rule.urenHand&&rule.uren&&o.runningId!==rule.id)return rule.uren;
    return Math.ceil(rawMinutes(rule,o)/6)/10;
  }
  const pauseHours=(rules,options)=>(rules||[]).filter(r=>r.soort==="pauze")
    .reduce((sum,rule)=>sum+Math.ceil(rawMinutes(rule,options)/6)/10,0);
  const totalHours=(rules,options)=>(rules||[])
    .reduce((sum,rule)=>sum+hoursOf(rule,options),0);
  const gapHours=gaps=>(gaps||[])
    .reduce((sum,gap)=>sum+Math.ceil((gap[1]-gap[0])/6)/10,0);

  function gapsFor(rules,options){
    const o=context(options),datum=o.date||"";
    const intervals=(rules||[]).filter(r=>time.hm2m(r.start)!=null)
      .map(r=>[time.hm2m(r.start),Math.max(time.hm2m(r.start),
        time.hm2m(endOf(r,o))||time.hm2m(r.start))])
      .sort((a,b)=>a[0]-b[0]);
    if(!intervals.length)return[];
    const merged=[intervals[0].slice()];
    for(let i=1;i<intervals.length;i++){
      const last=merged[merged.length-1];
      if(intervals[i][0]<=last[1])last[1]=Math.max(last[1],intervals[i][1]);
      else merged.push(intervals[i].slice());
    }
    const dayEnd=o.dayEnd!=null?time.hm2m(o.dayEnd):null;
    const end=dayEnd!=null?Math.max(dayEnd,merged[merged.length-1][1]):
      (datum===o.today?time.hm2m(o.nowHM):merged[merged.length-1][1]);
    const gaps=[];
    for(let i=0;i<merged.length-1;i++)
      if(merged[i+1][0]>merged[i][1])gaps.push([merged[i][1],merged[i+1][0]]);
    const last=merged[merged.length-1][1];
    if(end>last)gaps.push([last,end]);
    return gaps.filter(gap=>gap[1]-gap[0]>=6);
  }

  const autoFillShortfall=total=>Math.max(0,Math.round((NORM-(+total||0))*10)/10);
  const dayHours=(rules,date,excludeId,options)=>(rules||[])
    .filter(r=>r.datum===date&&r.id!==excludeId)
    .reduce((sum,r)=>sum+hoursOf(r,options),0);
  function dayCapacity(rules,date,extra,excludeId,options){
    const hours=Math.round((dayHours(rules,date,excludeId,options)+extra)*10)/10;
    return{hours,allowed:hours<=DAGMAX};
  }

  const normalizeDescription=value=>String(value==null?"":value)
    .replace(/\s+/g," ").trim().toLowerCase();
  function aggregateIntapp(rules,options){
    const o=Object.assign({roundingMode:"groep",getDossier:()=>null,
      getIntappInfo:()=>({nummer:"",naam:"",status:""}),getCodeName:(d,c)=>c||"",
      hasCodeError:()=>false,getBoundaryId:()=>""},options||{});
    const groups={};
    (rules||[]).filter(r=>r.soort!=="pauze").forEach(r=>{
      const dossier=o.getDossier(r.dossierId),info=o.getIntappInfo(dossier)||{};
      const nummer=info.nummer||"",naam=info.naam||"",boundary=o.getBoundaryId(r)||"";
      const key=nummer+"|"+(r.code||"")+"|"+(r.omschrijving||"")+"|"+boundary;
      if(!groups[key])groups[key]={k:key,nummer,naam,
        code:o.getCodeName(dossier,r.code),oms:r.omschrijving||"",min:0,hand:0,los:0,
        dosIds:[],bron:[],dvnStatus:info.status||"",
        mist:(!dossier)||o.hasCodeError(dossier,r)||!(r.omschrijving||"").trim()};
      const group=groups[key];
      if(info.status&&!group.dvnStatus)group.dvnStatus=info.status;
      if(r.urenHand&&r.uren)group.hand+=r.uren;else group.min+=rawMinutes(r,o);
      group.los+=hoursOf(r,o);
      if(group.dosIds.indexOf(r.dossierId||"-")<0)group.dosIds.push(r.dossierId||"-");
      group.bron.push({id:r.id,gewijzigd:r.gewijzigd||0});
    });
    return Object.values(groups).map(group=>{
      const hours=o.roundingMode==="groep"?
        group.hand+(group.min>0?Math.max(0.1,Math.ceil(group.min/6)/10):0):group.los;
      const fingerprint=[group.dosIds.slice().sort().join("+"),group.code||"",
        normalizeDescription(group.oms),time.uu(hours),o.roundingMode,
        group.bron.map(b=>b.id+":"+b.gewijzigd).sort().join(",")].join("|");
      return Object.assign({},group,{u:hours,fp:fingerprint});
    }).sort((a,b)=>b.u-a.u);
  }

  function validateDay(rules,options){
    const o=Object.assign({runningId:null,today:"",nowHM:"00:00",getDossier:()=>null,
      isIndirect:()=>false,hasCodeError:()=>false,isFixedCode:()=>false,
      getFixedCode:()=>null,getCodeName:(d,c)=>c||""},options||{});
    const problems=[],add=(r,text,blocking)=>problems.push({id:r.id,blok:!!blocking,
      tekst:r.start+"–"+(r.eind||"loopt")+" — "+text});
    (rules||[]).forEach(r=>{
      if(r.hersteld)add(r,"automatisch afgesloten na een onderbreking — controleer de tijden",false);
      if(!r.eind)add(r,o.runningId===r.id?
        "de timer loopt nog op deze regel":"open regel zonder lopende timer",true);
      if(r.soort==="pauze")return;
      const dossier=o.getDossier(r.dossierId);
      if(!dossier)add(r,"geen dossier gekozen",true);
      else if(o.isIndirect(dossier)&&!r.code)add(r,"i7-regel zonder werkcode",true);
      else if(o.hasCodeError(dossier,r)){
        const fixed=o.isFixedCode(dossier)?o.getFixedCode(dossier):null;
        add(r,o.isFixedCode(dossier)?(fixed?
          "een DVN- of definitief-i7-regel moet op "+o.getCodeName(dossier,fixed)+" staan":
          "werkcode Commercieel ontbreekt in de i7-werklijst"):
          "werkcode staat niet in de i7-werklijst",true);
      }
      if(!(r.omschrijving||"").trim())add(r,"lege omschrijving",true);
      if(time.hm2m(r.start)==null)add(r,"ongeldige starttijd",true);
      if(r.eind&&time.hm2m(r.eind)==null)add(r,"ongeldige eindtijd",true);
      if(r.eind&&time.hm2m(r.eind)!=null&&time.hm2m(r.start)!=null&&
          time.hm2m(r.eind)<time.hm2m(r.start))add(r,"eindtijd ligt vóór de starttijd",true);
      if(r.datum===o.today&&time.hm2m(r.start)!=null&&time.hm2m(r.start)>time.hm2m(o.nowHM))
        add(r,"starttijd ligt in de toekomst",true);
      if(r.datum===o.today&&r.eind&&time.hm2m(r.eind)!=null&&
          time.hm2m(r.eind)>time.hm2m(o.nowHM))add(r,"eindtijd ligt in de toekomst",true);
      if(!r.autoAanvul&&r.urenHand&&r.eind&&Math.abs(hoursOf(r,o)-
          Math.ceil(rawMinutes(r,o)/6)/10)>0.05)
        add(r,"handmatige uren wijken af van de ingevulde tijden",false);
    });
    const intervals=(rules||[]).filter(r=>!r.autoAanvul&&time.hm2m(r.start)!=null)
      .map(r=>({a:time.hm2m(r.start),b:Math.max(time.hm2m(r.start),
        time.hm2m(endOf(r,o))||time.hm2m(r.start)),r})).sort((a,b)=>a.a-b.a);
    let furthest=null;
    intervals.forEach(current=>{
      if(furthest&&current.a<furthest.b)
        problems.push({id:current.r.id,tekst:furthest.r.start+"–"+
          (furthest.r.eind||"loopt")+" overlapt met "+current.r.start+"–"+
          (current.r.eind||"loopt")+
          (current.r.soort==="pauze"||furthest.r.soort==="pauze"?" (pauze)":"")});
      if(!furthest||current.b>furthest.b)furthest=current;
    });
    const day=Math.round(totalHours(rules,o)*10)/10;
    if(day>DAGMAX&&(rules||[]).length)problems.push({id:rules[0].id,blok:true,
      tekst:"deze dag telt "+time.uu(day)+" uur — meer dan "+time.uu(DAGMAX)+
        " uur op één datum kan niet"});
    return problems;
  }

  HH.domain.booking=Object.freeze({NORM,DAGMAX,endOf,rawMinutes,hoursOf,pauseHours,
    totalHours,gapsFor,gapHours,autoFillShortfall,dayHours,dayCapacity,
    normalizeDescription,aggregateIntapp,validateDay});
})(globalThis.HH);
