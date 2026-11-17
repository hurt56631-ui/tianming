/* Faction court dynamics and covert intelligence; deterministic, serializable and no additional AI calls. */
(function(root){'use strict';var TM=root.TM=root.TM||{};
function A(x){return Array.isArray(x)?x:[];}function W(){return root.GM;}
function S(g){if(!g._politicalWorld)g._politicalWorld={schema:1,turn:-1,events:[],operations:[],court:{legitimacy:55,rankRequests:[],campaignOrders:[]}};return g._politicalWorld;}
function h(g,key){var a=2166136261,text=String(g.sid||'')+'|'+g.turn+'|'+key;for(var i=0;i<text.length;i++)a=Math.imul(a^text.charCodeAt(i),16777619);return(a>>>0)%100;}
function log(g,type,description,secret){var q=S(g).events;q.push({turn:g.turn,type:type,text:description,secret:!!secret});if(q.length>140)q.shift();if(!secret&&typeof root.addEB==='function')root.addEB('政争',description);}
function fac(g,c){return A(g.facs).find(function(f){return f&&[f.id,f.name].some(function(v){return String(v)===String(c.factionId||c.faction);});});}
function active(c){return c&&c.alive!==false&&!c.dead&&Number(c.age||30)>=16&&!c.capturedBy;}
function faction(ch){var ambition=Number(ch.ambition)||45,loyalty=Number(ch.loyalty)||50,age=Number(ch.age)||30;
 if(ch._politicalFaction)return ch._politicalFaction;
 return ambition>72&&loyalty<60?'新兴':age>48&&loyalty>65?'谱代':Number(ch.military||ch.war||40)>65?'主战':'主和';}
function posture(g,ch){var name=faction(ch),s=S(g);if(!ch._politicalFaction)ch._politicalFaction=name;
 var p=ch._politicalPower||Math.max(5,Math.min(90,Math.round((Number(ch.politics)||45)*.7+(Number(ch.loyalty)||55)*.2)));ch._politicalPower=p;return {name:name,power:p};}
function covert(g,instigator,target,kind){var from=fac(g,instigator)||A(g.facs).find(function(f){return f.name===instigator||f.id===instigator;});
 var victim=A(g.chars).find(function(c){return c&&(c.id===target||c.name===target);});
 if(!from||!active(victim)||from.name===victim.faction||!['rumor','counterintel','bribe','forge','infiltrate'].includes(kind))return {ok:false,reason:'势力、目标或谍报行动不合法'};
 var s=S(g),id='covert:'+s.operations.length+':'+g.turn;
 s.operations.push({id:id,actor:from.id||from.name,target:victim.id||victim.name,kind:kind,progress:0,discovered:false,status:'active',since:g.turn});if(s.operations.length>60)s.operations.shift();
 log(g,'secret',from.name+'派遣密探执行'+kind+'，目标'+victim.name,true);return {ok:true,id:id};}
function advance(g){
 var s=S(g);if(s.turn===g.turn)return {ok:true,duplicate:true};s.turn=g.turn;
 A(g.chars).filter(active).forEach(function(c){var p=posture(g,c);if(h(g,'faction:'+c.id)<8){var delta=p.name==='谱代'?1:p.name==='新兴'?2:-1;
 c._politicalPower=Math.max(3,Math.min(95,c._politicalPower+delta));}});
 s.operations.filter(function(o){return o.status==='active';}).forEach(function(o){
  var target=A(g.chars).find(function(c){return c&&(c.id===o.target||c.name===o.target);});if(!active(target)){o.status='lapsed';return;}
  var intelligence=Number(target.intelligence)||50;
  if(h(g,'detect:'+o.id)<Math.max(6,Math.min(50,intelligence/3))){o.discovered=true;o.status='discovered';log(g,'exposed',target.name+'发现敌方间谍活动');return;}
  o.progress+=15+h(g,'progress:'+o.id)%22;
  if(o.progress<100)return;
  // Intelligence outcomes do NOT directly rewrite army orders, treaty or ownership.
  if(o.kind==='bribe'){target._briberyPressure=Math.min(100,(target._briberyPressure||0)+25);}
  if(o.kind==='rumor'){target._rumorPressure=Math.min(100,(target._rumorPressure||0)+20);}
  if(o.kind==='forge')target._suspectForgedOrders=true;
  if(o.kind==='counterintel')target._counterintelligence=30;
  if(o.kind==='infiltrate')target._enemyIntelRisk=35;
  o.status='resolved';log(g,'covert',o.kind+'行动已产生实际情报/压力效果',true);
 });
 s.court.legitimacy=Math.max(0,Math.min(100,s.court.legitimacy+(h(g,'court')<12?-1:0)));
 return {ok:true,actions:s.operations.filter(function(o){return o.status==='resolved';}).length};
}
function courtAction(g,kind,person,amount){
 var s=S(g),c=A(g.chars).find(function(x){return x&&(x.name===person||x.id===person);});
 if(!['rank','shogunal_post','punitive_order','declare_enemy'].includes(kind)||!c||!active(c))return {ok:false,reason:'官位或人物不合法'};
 var price=kind==='rank'?8:kind==='shogunal_post'?12:kind==='punitive_order'?20:30;
 if(s.court.legitimacy<price)return {ok:false,reason:'朝廷合法性不足'};
 s.court.legitimacy-=price;
 var x={kind:kind,personId:c.id||c.name,turn:g.turn,status:'petition',legitimacyCost:price};
 s.court.rankRequests.push(x);if(s.court.rankRequests.length>40)s.court.rankRequests.shift();
 log(g,'petition',c.name+'递交'+kind+'奏请，等待有效朝廷或幕府裁决');
 return {ok:true,petition:x};
}
TM.PoliticalWorld={state:S,posture:posture,covert:covert,courtAction:courtAction,tick:advance};
})(typeof window!=='undefined'?window:globalThis);
