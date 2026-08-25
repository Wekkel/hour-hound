"use strict";
/* Centrale runtime-state.
   IndexedDB blijft de duurzame waarheid; dit object is de enige geheugenkopie. De
   globale accessors houden de klassieke scripts tijdens de modularisering werkend,
   maar bezitten zelf geen data. `regels` is uitsluitend een pure dagselectie. */
(function(root){
  const HH=root.HH,time=HH.domain.time;
  const vandaag=time.today();
  const data={
    db:null,dossiers:[],templates:[],codes:[],rules:[],running:null,stack:[],
    overbookings:[],dayEnds:{},dayAudit:{},booked:{},roundingMode:"groep",
    codeUsage:{},viewDate:vandaag,weekAnchor:vandaag,tab:"nu"
  };
  const listeners=new Set();
  const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  function read(){return data;}
  function commit(delta){
    const changed=[];
    Object.keys(delta||{}).forEach(key=>{
      if(!has(data,key))throw new Error("Onbekend stateveld: "+key);
      if(data[key]===delta[key])return;
      data[key]=delta[key];changed.push(key);
    });
    if(changed.length)listeners.forEach(fn=>fn(changed,data));
    return data;
  }
  function upsert(field,rows,key){
    const lijst=Array.isArray(rows)?rows:[rows],idKey=key||"id";
    if(!lijst.length)return data[field];
    const vervang=new Map(lijst.filter(Boolean).map(row=>[row[idKey],row]));
    const gezien=new Set(),next=data[field].map(row=>{
      if(!vervang.has(row[idKey]))return row;
      gezien.add(row[idKey]);return vervang.get(row[idKey]);
    });
    lijst.forEach(row=>{if(row&&!gezien.has(row[idKey]))next.push(row);});
    commit({[field]:next});return next;
  }
  function remove(field,ids,key){
    const weg=new Set(Array.isArray(ids)?ids:[ids]),idKey=key||"id";
    const next=data[field].filter(row=>!weg.has(row[idKey]));
    if(next.length!==data[field].length)commit({[field]:next});
    return next;
  }
  const selectors={
    day(date,state){
      const s=state||data;
      return s.rules.filter(r=>r.datum===date).slice().sort((a,b)=>
        (time.hm2m(a.start)||0)-(time.hm2m(b.start)||0));
    },
    today(date,state){return this.day(date||time.today(),state);},
    recentTasks(options,state){
      const o=options||{},s=state||data,date=o.date||time.today(),hoursOf=o.hoursOf||(()=>0),
        dossierOf=o.dossierOf||(id=>s.dossiers.find(d=>d.id===id)),map=new Map();
      s.rules.filter(r=>r.datum===date&&r.dossierId).filter(r=>{
        const d=dossierOf(r.dossierId);
        return !(o.isFinalI7&&o.isFinalI7(d))&&
          (r.soort==="werk"||(d&&d.voorlopig));
      }).forEach(r=>{
        const k=(r.dossierId||"-")+"|"+(r.code||"")+"|"+(r.omschrijving||"");
        const g=map.get(k)||{k,dossierId:r.dossierId,code:r.code,
          oms:r.omschrijving||"",u:0,laatst:""};
        g.u+=hoursOf(r);if(r.start>g.laatst)g.laatst=r.start;map.set(k,g);
      });
      const parked=s.stack.length?s.stack[s.stack.length-1]:null;
      const parkKey=parked?(parked.dossierId||"-")+"|"+(parked.code||"")+"|"+
        (parked.omschrijving||""):null;
      return [...map.values()].sort((a,b)=>a.k===parkKey?-1:b.k===parkKey?1:
        (a.laatst<b.laatst?1:a.laatst>b.laatst?-1:0));
    },
    recentDossiers(options,state){
      const o=options||{},s=state||data,addDays=o.addDays||time.addD,
        date=o.date||time.today(),grens=addDays(date,-11),seen=new Set();
      s.rules.filter(r=>r.datum>=grens&&r.dossierId)
        .slice().sort((a,b)=>(a.datum+a.start)<(b.datum+b.start)?1:-1)
        .forEach(r=>seen.add(r.dossierId));
      return [...seen].map(id=>s.dossiers.find(d=>d.id===id))
        .filter(d=>d&&!d.isI7&&!d.archief).slice(0,o.limit||9);
    },
    dvnRules(dossier,state){
      const s=state||data;
      return dossier?s.rules.filter(r=>r.dossierId===dossier.id&&r.soort!=="pauze"):[];
    },
    dvnDossiers(options,state){
      const o=options||{},s=state||data,isDvn=o.isDvn||(()=>false),
        isFinal=o.isFinalI7||(()=>false);
      return s.dossiers.filter(d=>isDvn(d)&&!isFinal(d));
    },
    overbookings(options,state){
      const o=options||{},s=state||data;
      return o.openOnly&&o.isOpen?s.overbookings.filter(o.isOpen):s.overbookings.slice();
    }
  };
  const renderers=new Map();
  const coordinator={
    register(name,fn){renderers.set(name,fn);return coordinator;},
    render(names){
      const wanted=names==null?[...renderers.keys()]:
        [...new Set(Array.isArray(names)?names:[names])];
      wanted.forEach(name=>{const fn=renderers.get(name);if(fn)fn();});
    },
    registered(){return [...renderers.keys()];}
  };
  const api={read,commit,upsert,remove,selectors,subscribe(fn){listeners.add(fn);
    return()=>listeners.delete(fn);}};
  HH.state=Object.freeze(api);HH.renderCoordinator=Object.freeze(coordinator);

  const aliases={db:"db",dossiers:"dossiers",templates:"templates",i7codes:"codes",
    alle:"rules",running:"running",stack:"stack",overboekingen:"overbookings",
    dagEinde:"dayEnds",dagAudit:"dayAudit",geboekt:"booked",rondMode:"roundingMode",
    codeGebruik:"codeUsage",viewDate:"viewDate",weekAnchor:"weekAnchor",tab:"tab"};
  Object.keys(aliases).forEach(name=>Object.defineProperty(root,name,{configurable:false,
    enumerable:false,get(){return data[aliases[name]];},set(value){commit({[aliases[name]]:value});}}));
  Object.defineProperty(root,"regels",{configurable:false,enumerable:false,
    get(){return selectors.day(data.viewDate);},set(){
      throw new Error("regels is afgeleid; wijzig HH.state.rules");}});
})(globalThis);
