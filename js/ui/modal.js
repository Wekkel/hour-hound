"use strict";
/* Eén lijst bepaalt zowel de zichtbare modalstatus als de globale keyboardguard.
   Componenten blijven hun eigen open/sluitactie bezitten; de guard voorkomt dat
   een vergeten ID ondertussen timer- of navigatiesneltoetsen doorlaat. */
(function(HH){
  const ids=Object.freeze(["dayclose","oldrun","editregel","dvnnum","dvnpost",
    "boek","parkboek","overboekpost","herstel"]);
  const element=id=>document.getElementById(id);
  const isOpen=id=>{const el=element(id);return !!(el&&el.classList.contains("on"));};
  const active=()=>ids.find(isOpen)||null;
  HH.ui.modals=Object.freeze({ids,isOpen,active,anyOpen:()=>active()!==null,
    blocksGlobalKeyboard:()=>active()});
})(globalThis.HH);
