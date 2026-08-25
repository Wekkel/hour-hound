"use strict";
$("w-prev").onclick=()=>{appState.commit({weekAnchor:addD(weekAnchor,-7)});renderWeek();};
$("w-next").onclick=()=>{appState.commit({weekAnchor:addD(weekAnchor,7)});renderWeek();};
$("w-now").onclick=()=>{appState.commit({weekAnchor:today()});renderWeek();};
$("w-grid").addEventListener("click",e=>{const b=e.target.closest("[data-day]");if(!b)return;
  appState.commit({viewDate:b.dataset.day});showTab("dag");});
