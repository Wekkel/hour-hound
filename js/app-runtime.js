"use strict";
/* Stabiele runtime-ingang voor renderen en tabnavigatie. Dit bestand staat vóór
   alle klassieke productieconsumenten, zodat zij geen voorwaartse globale
   functiereferenties meer nodig hebben. */
(function(root){
  const HH=root.HH;
  if(!HH||!HH.state||!HH.renderCoordinator)
    throw new Error("HH app-runtime mist state of rendercoördinator");
  const byId=id=>root.document.getElementById(id);
  function visibleRender(){
    const tab=HH.state.read().tab;
    return tab==="dag"?"day":tab==="week"?"week":tab==="beheer"?"manage":null;
  }
  function render(targets){
    HH.renderCoordinator.render(targets||
      ["live","recent","totals","openDays",visibleRender()].filter(Boolean));
  }
  function showTab(value){
    HH.state.commit({tab:value});
    ["nu","dag","week","beheer"].forEach(name=>{
      const view=byId("v-"+name);if(view)view.classList.toggle("on",name===value);
    });
    const tabs=byId("tabs");
    if(tabs)[...tabs.children].forEach(button=>
      button.setAttribute("aria-pressed",button.dataset.v===value));
    /* De recentelijst wordt opnieuw gemeten nadat Nu zichtbaar is. */
    if(value==="nu")HH.renderCoordinator.render("recent");
    if(value==="dag")HH.renderCoordinator.render("day");
    if(value==="week")HH.renderCoordinator.render("week");
    if(value==="beheer")HH.renderCoordinator.render("manage");
  }
  function assertReady(){
    const required={
      "domain.time":HH.domain.time,"domain.booking":HH.domain.booking,
      "domain.dvn":HH.domain.dvn,"domain.overbooking":HH.domain.overbooking,
      "storage.indexedDB":HH.storage.indexedDB,
      "services.admin":HH.services.admin,"services.dayRules":HH.services.dayRules,
      "services.timer":HH.services.timer,"services.settings":HH.services.settings,
      "ui.modals":HH.ui.modals,"ui.newTask":HH.ui.newTask,
      "ui.bookingKeys":HH.ui.bookingKeys
    };
    const missing=Object.keys(required).filter(name=>!required[name]);
    const registered=new Set(HH.renderCoordinator.registered());
    ["live","recent","totals","openDays","day","week","manage"].forEach(name=>{
      if(!registered.has(name))missing.push("renderer."+name);
    });
    if(missing.length)throw new Error("HH runtime-dependencies ontbreken: "+missing.join(", "));
    return true;
  }
  HH.app=Object.freeze({render,showTab,visibleRender,assertReady});
})(globalThis);
