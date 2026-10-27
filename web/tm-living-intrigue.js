(function(root){
'use strict';var TM=root.TM=root.TM||{},C=TM.LivingCore;
function start(g,from,target){var a=C.fac(g,from),c=C.chr(g,target),s=C.state(g);
 if(!a||!C.live(c)||!c.faction||c.faction===a.name||c.isPlayer)return {ok:false,reason:'不可对该武将策反'};
 if(s.intrigue.plots.some(function(p){return p.status==='active'&&p.targetId===C.id(c)&&p.fromId===a.id;}))return {ok:false,reason:'已有正在进行的秘密接触'};
 var p={id:'plot:'+ (++s.seq),fromId:a.id||a.name,targetId:C.id(c),originalFaction:c.faction,progress:0,turn:g.turn||0,status:'active',exposed:false};
 s.intrigue.plots.push(p); // arch-ok: Intrigue owns secret plots
 C.put(g,'阴谋','contact',a.id||a.name,C.id(c),a.name+'派人秘密接触'+c.name,true);
 return {ok:true,plot:p};
}
function tick(g){var s=C.state(g),completed=0;s.intrigue.plots.filter(function(p){return p.status==='active';}).slice(0,20).forEach(function(p){
 var inst=C.fac(g,p.fromId),target=C.chr(g,p.targetId);
 if(!inst||!C.live(target)||target.faction!==p.originalFaction){p.status='lapsed';return;}
 var resentment=TM.WorldMemory?Math.max(0,-TM.WorldMemory.score(g,target,C.playerChar(g))):0;
 var loy=Number(target.loyalty);if(!Number.isFinite(loy))loy=60;
 var ambition=Number(target.ambition);if(!Number.isFinite(ambition))ambition=50;
 var gain=Math.max(0,Math.round((100-loy)*0.18+ambition*0.08+resentment*0.18-10));
 p.progress+=gain;
 if(!p.exposed&&C.chance(g,p.id+':expose',Math.max(3,Math.min(32,Math.round((loy-30)/3))))){
  p.exposed=true;p.status='exposed';
  C.put(g,'阴谋','exposed',p.fromId,p.targetId,inst.name+'试图收买'+target.name+'，密谋败露');
  C.remember(g,target,'betrayal',inst,target.name+'发现'+inst.name+'试图收买自己',7);return;
 }
 if(p.progress<100)return;
 var membership=TM.FactionMembership;if(!membership||typeof membership.assignChar!=='function'){p.status='blocked';return;}
 if(target._imprisoned||target.capturedBy){p.status='blocked';return;}
 var former=target.faction;
 if(C.chance(g,p.id+':refusal',Math.max(10,Math.min(90,loy-ambition*0.3)))){p.status='refused';C.put(g,'阴谋','refusal',p.fromId,p.targetId,target.name+'拒绝投效'+inst.name,true);return;}
 // City transfer requires an independently verified governorship and the canonical province mutator.
 var isGovernor=!!(target.governorOf||target.governedProvince),province=target.governorOf||target.governedProvince;
 if(isGovernor&&province&&TM.FactionMembership.applyProvinceTransfers){
  try{
   var transferred=TM.FactionMembership.applyProvinceTransfers([{regionRef:String(province),newOwner:inst.id||inst.name,reason:'守将暗中归附'}],{reason:'守将倒戈',mutate:function(){
    return membership.assignChar(target,inst.name,{reason:'策反倒戈',byTurn:g.turn||0});
   }});
   if(!transferred||transferred.ok===false){p.status='blocked';return;}
  }catch(e){C.error(g,'intrigue-city-defection',e);p.status='blocked';return;}
 }else{
  var done=membership.assignChar(target,inst.name,{reason:'策反倒戈',byTurn:g.turn||0});
  if(!done){p.status='blocked';return;}
 }
 p.status='defected';p.completedTurn=g.turn||0;completed++;
 C.put(g,'阴谋','defection',p.fromId,p.targetId,target.name+'背弃'+former+'，转投'+inst.name);
 C.remember(g,target,'betrayal',C.fac(g,former),target.name+'投奔'+inst.name+'，与旧主决裂',8);
 C.refresh();
 });return {completed:completed};
}
function initiative(g){var facs=C.arr(g.facs);if(facs.length<2||g.turn%4!==0)return;
 var selected=facs.filter(function(f){return f&&C.chance(g,'intrigue-ai:'+f.id,14);}).slice(0,2);
 selected.forEach(function(f){
  var targets=C.arr(g.chars).filter(function(c){return C.live(c)&&!c.isPlayer&&c.faction!==f.name&&Number(c.loyalty||55)<55&&Number(c.age||20)>=18;});
  if(targets.length)start(g,f,targets[C.roll(g,'intrigue-target:'+f.id)%targets.length]);
 });
}
TM.WorldIntrigue={start:start,tick:tick,initiative:initiative};
})(typeof window!=='undefined'?window:globalThis);
