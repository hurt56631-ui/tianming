/* One deterministic world tick per GM.turn, independently owned modules, zero network. */
(function(root){'use strict';
var TM=root.TM=root.TM||{};
function tick(g){
 var C=TM.LivingCore;if(!g||!C)return {ok:false,reason:'world_not_loaded'};
 var s=C.state(g),turn=Number(g.turn)||0;
 if(s.lastTick.full===turn)return {ok:true,duplicate:true,turn:turn};
 var domains=[['memory',TM.WorldMemory&&TM.WorldMemory.tick],
 ['dynasty',TM.DynastyWorld&&TM.DynastyWorld.tick],
 ['marriage',TM.MarriageAI&&null],
 ['diplomacy',TM.ForeignInitiative&&TM.ForeignInitiative.tick],
 ['intrigue',TM.WorldIntrigue&&TM.WorldIntrigue.tick],
 ['intrigue_ideas',TM.WorldIntrigue&&TM.WorldIntrigue.initiative],
 ['delegation',TM.LegionAutonomy&&TM.LegionAutonomy.tick]];
 var result={ok:true,turn:turn,domains:[],errors:[]};
 domains.forEach(function(row){
  var name=row[0],f=row[1];if(typeof f!=='function')return;
  if(s.lastTick[name]===turn)return;
  try{f(g);s.lastTick[name]=turn;result.domains.push(name);}catch(e){
    C.error(g,name,e);result.errors.push({domain:name,reason:String(e&&e.message||e)});
  }
 });
 if(!result.errors.length)s.lastTick.full=turn;else result.ok=false;
 return result;
}
TM.LivingWorld={tick:tick};
})(typeof window!=='undefined'?window:globalThis);
