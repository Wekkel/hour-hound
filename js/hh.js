"use strict";
/* Kleine, expliciete namespace voor de stapsgewijze modularisering.
   Dit bestand registreert alleen lagen; boot en runtime-state blijven elders. */
(function(root){
  const HH=root.HH||(root.HH={});
  HH.domain=HH.domain||{};
  HH.storage=HH.storage||{};
  HH.services=HH.services||{};
  HH.state=HH.state||{};
  HH.ui=HH.ui||{};
  HH.app=HH.app||{};
})(globalThis);
