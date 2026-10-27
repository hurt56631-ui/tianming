(function(root){
'use strict';var TM=root.TM=root.TM||{},C=TM.LivingCore;
function assign(g,armyRef,generalRef,objective,destination){
 var army=C.arr(g&&g.armies).filter(function(x){return x&&[x.id,x.name].indexOf(armyRef)>=0;})[0],general=C.chr(g,generalRef),s=C.state(g);
 if(!army||!C.live(general)||!destination||['defend','march','siege'].indexOf(objective)<0)return {ok:false,reason:'军队、统帅或目标无效'};
 if(general.faction!==army.faction&&general.factionId!==army.factionId)return {ok:false,reason:'军团长不属于该势力'};
 if(s.delegation.missions.some(function(m){return m.status==='active'&&m.armyId===(army.id||army.name);}))return {ok:false,reason:'该军团已有进行中任务'};
 var mission={id:'legion:'+ ++s.seq,armyId:army.id||army.name,generalId:C.id(general),faction:army.faction,objective:objective,destination:String(destination),
  issuedTurn:g.turn||0,status:'active',phase:'assigned',lastTurn:0,policy:'cautious',report:''};
 s.delegation.missions.push(mission); // arch-ok: delegation owns persistent missions
 C.put(g,'军事','delegation',C.id(general),mission.armyId,general.name+'受命率'+army.name+'执行'+objective+'任务');
 return {ok:true,mission:mission};
}
function tick(g){var s=C.state(g),out=[];
 s.delegation.missions.filter(function(m){return m.status==='active'&&m.lastTurn!==g.turn;}).slice(0,15).forEach(function(m){
  m.lastTurn=g.turn;var army=C.arr(g.armies).find(function(x){return x&&[x.id,x.name].indexOf(m.armyId)>=0;});
  var general=C.chr(g,m.generalId);
  if(!army||!C.live(general)||general.faction!==m.faction||army.faction!==m.faction){m.status='cancelled';m.report='军团不再具备原有指挥条件';return;}
  var loyalty=Number(general.loyalty||55),ambition=Number(general.ambition||45),risk=Math.max(0,Math.min(45,Math.round((70-loyalty)*0.34+ambition*0.1)));
  if(C.chance(g,m.id+':refuse',risk)){m.status='refused';m.report=general.name+'以军粮不足或军情不明为由拒绝执行';C.put(g,'军事','refused',m.generalId,m.armyId,m.report);out.push(m);return;}
  if(m.objective==='defend'){m.phase='defending';m.report=general.name+'已在'+(army.location||army.garrison||m.destination)+'维持守备';return;}
  if(m.objective==='march' || m.objective==='siege'){
   if(army.destination===m.destination&&army.state==='marching'){m.phase='marching';return;}
   if((army.location||army.garrison)===m.destination&&m.objective==='march'){m.status='completed';m.report='军团抵达'+m.destination;C.put(g,'军事','arrived',m.generalId,m.armyId,m.report);return;}
   if(m.objective==='siege'&&(army.location||army.garrison)===m.destination){
    if(!root.SiegeSystem||typeof root.SiegeSystem.createSiege!=='function'){m.phase='pending_siege';return;}
    if(!C.arr(g.activeSieges).some(function(x){return x&&x.status==='ongoing'&&x.attackerArmy===army.name&&x.targetCity===m.destination;})){
     var owner=C.arr(g.cities).find(function(x){return x&&x.name===m.destination;});
     if(owner&&owner.owner===army.faction){m.status='completed';m.report='目标已经归属本势力';return;}
     var siege=root.SiegeSystem.createSiege(army,m.destination,Number(owner&&owner.fortLevel)||1,Number(owner&&owner.garrison)||3000);
     if(siege){m.phase='sieging';m.report=general.name+'已开始围困'+m.destination;C.put(g,'军事','siege',m.generalId,m.armyId,m.report);}
    }return;
   }
   if(root.MarchSystem&&typeof root.MarchSystem.createMarchOrder==='function'){
    // Canonical command authority is enforced by the existing MarchSystem; null means awaiting approval or no legal route.
    var order=root.MarchSystem.createMarchOrder(army,army.location||army.garrison||'',m.destination,null);
    if(order){m.phase='marching';m.report=general.name+'依令开拔至'+m.destination;}
    else {m.phase='awaiting_authority';m.report='行军权限、地形或军令回执尚未满足';}
   }else{m.phase='awaiting_authority';}
  }
 });
 return out;
}
TM.LegionAutonomy={assign:assign,tick:tick};
})(typeof window!=='undefined'?window:globalThis);
