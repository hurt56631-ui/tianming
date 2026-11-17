/* Distinct political, military and civic turn phases; no external calls or background timers. */
(function(root){'use strict';var TM=root.TM=root.TM||{};
function tick(g){
 if(!g)return {ok:false,reason:'missing_game_world'};
 var steps=[['politics',TM.PoliticalWorld],['campaign',TM.CampaignWorld],['civic',TM.CivilWorld]];
 var result={ok:true,turn:g.turn,steps:[],errors:[]};
 steps.forEach(function(row){try{if(!row[1]||typeof row[1].tick!=='function')throw Error('domain missing');var reply=row[1].tick(g);if(!reply||!reply.ok)throw Error(reply&&reply.reason||'invalid outcome');result.steps.push(row[0]);}catch(e){result.errors.push({domain:row[0],reason:String(e.message||e)});result.ok=false;}});
 return result;
}
TM.PoliticalWarWorld={tick:tick,inspect:function(g){return {politics:TM.PoliticalWorld&&TM.PoliticalWorld.state(g),campaign:TM.CampaignWorld&&TM.CampaignWorld.state(g),civic:TM.CivilWorld&&TM.CivilWorld.state(g)};}};
})(typeof window!=='undefined'?window:globalThis);
