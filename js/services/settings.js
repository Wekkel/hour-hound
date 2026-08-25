"use strict";
/* Kleine configuratieservice. UI-componenten kennen hierdoor geen meta-store of
   IndexedDB-adapter; state wordt door de aanroeper pas na deze Promise bijgewerkt. */
(function(HH){
  if(!HH||!HH.services||!HH.storage)throw new Error("HH-opslag ontbreekt vóór settings.js");
  const gateway=HH.storage.indexedDB;
  const save=(key,value)=>gateway.putKey("meta",value,key);
  HH.services.settings=Object.freeze({save});
})(globalThis.HH);
