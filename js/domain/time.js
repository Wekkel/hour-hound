"use strict";
/* Pure tijd-, datum- en teksthelpers. Geen DOM, IndexedDB of runtime-state. */
(function(HH){
  if(!HH||!HH.domain)throw new Error("HH-bootstrap ontbreekt vóór domain/time.js");

  const pad=n=>String(n).padStart(2,"0");
  const uu=n=>(Math.round(n*10)/10).toFixed(1).replace(".",",");
  const ymd=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  const today=()=>ymd(new Date());
  const nowHM=()=>{const d=new Date();return pad(d.getHours())+":"+pad(d.getMinutes());};
  function hm2m(s){const m=/^(\d{1,2}):(\d{2})$/.exec(s||"");if(!m)return null;
    const h=+m[1],mi=+m[2];if(h>23||mi>59)return null;return h*60+mi;}
  const m2hm=m=>{const v=Math.max(0,Math.min(1439,Math.round(m)));
    return pad(Math.floor(v/60))+":"+pad(v%60);};
  const dmy=s=>{const[y,m,d]=s.split("-");return d+"."+m+"."+y;};
  const parseD=s=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);};
  const addD=(s,n)=>{const d=parseD(s);d.setDate(d.getDate()+n);return ymd(d);};
  const dagLabel=s=>parseD(s).toLocaleDateString("nl-NL",
    {weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const kortDag=s=>parseD(s).toLocaleDateString("nl-NL",{weekday:"short"})+" "+
    dmy(s).replace(/\./g,"-");
  const weekend=s=>{const d=parseD(s).getDay();return d===0||d===6;};
  const werkdag=s=>!weekend(s);
  const schoon=s=>String(s==null?"":s).replace(/[\t\r\n\u0000-\u001f]/g," ").trim();

  HH.domain.time=Object.freeze({
    pad,uu,ymd,today,nowHM,hm2m,m2hm,dmy,parseD,addD,dagLabel,kortDag,
    weekend,werkdag,schoon
  });
})(globalThis.HH);
