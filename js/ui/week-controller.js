"use strict";
$("w-prev").onclick=()=>{HH.state.commit({weekAnchor:addD(HH.state.read().weekAnchor,-7)});
  HH.renderCoordinator.render("week");};
$("w-next").onclick=()=>{HH.state.commit({weekAnchor:addD(HH.state.read().weekAnchor,7)});
  HH.renderCoordinator.render("week");};
$("w-now").onclick=()=>{HH.state.commit({weekAnchor:today()});
  HH.renderCoordinator.render("week");};
$("w-grid").addEventListener("click",e=>{const b=e.target.closest("[data-day]");if(!b)return;
  HH.state.commit({viewDate:b.dataset.day});HH.app.showTab("dag");});
