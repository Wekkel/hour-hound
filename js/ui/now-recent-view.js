"use strict";
function renderRecent(){
  const recent=$("recent"),oudeScroll=recent.scrollTop;
  const tk=takenVandaag().filter(t=>!running||t.k!==taakKey(running));
  recent.innerHTML=tk.length?tk.map((t,i)=>{
    const d=dosOf(t.dossierId);
    return '<button class="taak" data-taak="'+esc(t.k)+'">'+
      '<span class="r1"><i style="background:'+dosColor(d)+'"></i>'+
      '<span class="dn">'+esc(taakLabel(t))+"</span>"+
      (t.code?'<span class="cd">'+esc(codeNaam(d,t.code))+"</span>":"")+
      '<span class="sp"></span><span class="ur">'+uu(t.u)+"</span>"+
      (i<4?"<kbd>"+(i+1)+"</kbd>":"")+"</span>"+
      '<span class="r2">'+esc(t.oms||"geen omschrijving")+"</span></button>";}).join(""):
    '<div class="hint">Nog niets vandaag — druk N om te beginnen.</div>';
  /* Alle taken van vandaag blijven beschikbaar. De viewport wordt pas begrensd als
     er meer dan vier zijn. We meten de natuurlijke hoogte van de eerste vier regels,
     zodat ook langere omschrijvingen volledig zichtbaar blijven. */
  recent.style.maxHeight="";
  recent.classList.toggle("recent-scroll",tk.length>4);
  /* Een Beheer-mutatie rendert alle globale samenvattingen terwijl Nu verborgen kan
     zijn. getBoundingClientRect() levert dan nul op; schrijf die nul nooit als
     max-height weg. showTab("nu") meet opnieuw zodra de lijst zichtbaar is. */
  const meetbaar=$("v-nu").classList.contains("on");
  if(tk.length>4&&meetbaar){
    const vierde=recent.querySelectorAll("button.taak")[3];
    const onder=parseFloat(getComputedStyle(vierde).marginBottom)||0;
    const h=Math.ceil(vierde.getBoundingClientRect().bottom-
      recent.getBoundingClientRect().top+onder);
    recent.style.maxHeight=h+"px";
    recent.scrollTop=Math.max(0,Math.min(oudeScroll,recent.scrollHeight-recent.clientHeight));}
  else if(tk.length<=4)recent.scrollTop=0;
  $("i7row").innerHTML=favCodes().map((c,i)=>'<button data-i7="'+esc(c.code)+'">'+
    '<i style="background:var(--soft)"></i><span>'+esc(c.naam)+"</span>"+
    (i<5?"<kbd>"+(i+5)+"</kbd>":"")+"</button>").join("")||
    '<div class="hint">Importeer werkcodes.json onder Beheer.</div>';}
function renderTot(){
  const v=vandaagRegels(),t=totaal(v),g=gapHours(gapsFor(v,today()));
  $("t-uren").textContent=uu(t);$("t-void").textContent=uu(g);
  $("t-regels").textContent=v.filter(r=>r.soort!=="pauze").length;
  const b=nuBreakdown(v);
  $("t-breakdown").textContent="Declarabel "+uu(b.declarabel)+" · i7 "+uu(b.i7)+
    " (DVN "+uu(b.dvn)+")";
  $("t-voidwrap").className=g>0?"isbad":"";
  const isWerkdag=werkdag(today());
  $("t-progress").style.display=isWerkdag?"":"none";
  $("t-norm-label").textContent=isWerkdag?"van 8,0 verantwoord":"uur verantwoord · weekend";
  const pct=isWerkdag?Math.max(0,Math.min(1,t/NORM)):0;
  $("hond").style.left="calc("+(pct*100).toFixed(1)+"% - "+(pct*86).toFixed(0)+"px)";}
