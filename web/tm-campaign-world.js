/* Terrain, treaty access and campaign logistics; no terrain shortcut or instant siege. */
(function(root){'use strict';var TM=root.TM=root.TM||{};
function A(x){return Array.isArray(x)?x:[];}function G(){return root.GM;}
function S(g){if(!g._campaignWorld)g._campaignWorld={version:1,turn:-1,rights:[],incidents:[],supplies:[],pendingBattles:[]};return g._campaignWorld;}
function access(g,from,to,region,turns){var a=A(g.facs).find(function(f){return f&&[f.id,f.name].includes(from);}),b=A(g.facs).find(function(f){return f&&[f.id,f.name].includes(to);});
 if(!a||!b||a===b||!region)return {ok:false,reason:'借道双方或地块不存在'};
 var r={from:a.id||a.name,to:b.id||b.name,region:String(region),start:g.turn,end:g.turn+Math.max(1,Math.min(70,Number(turns)||6)),status:'granted'};
 S(g).rights.push(r);if(S(g).rights.length>100)S(g).rights.shift();return {ok:true,permission:r};}
function canCross(g,faction,region){var map=g.mapData||g.map||{},entry=A(map.regions).find(function(r){return r&&[r.name,r.id].includes(region);});
 if(!entry)return {ok:false,reason:'目标地块不存在，禁止推断路线'};
 if(entry.impassable===true||entry.terrain==='mountain'&&entry.passable===false)return {ok:false,reason:'山脉不可通行'};
 var owner=entry.currentOwner||entry.owner||entry.faction||'',same=owner===faction;
 var r=S(g).rights.find(function(x){return x.status==='granted'&&x.region===String(region)&&x.start<=g.turn&&x.end>=g.turn&&x.from===faction&&x.to===owner;});
 if(!same&&owner&&!r)return {ok:false,reason:'非己方领土，尚未获得借道许可'};
 if(entry.closedPass&&!entry.passOpened)return {ok:false,reason:'关隘封锁'};
 if(entry.roadRequired&&entry.hasRoad===false)return {ok:false,reason:'无道路无法通行'};
 return {ok:true,routeType:entry.terrain||'plain'};}
function spyCross(g,faction,region,agent){var pass=canCross(g,faction,region);
 if(pass.ok)return {ok:true,secret:false};
 var ch=A(g.chars).find(function(c){return c&&[c.name,c.id].includes(agent)&&c.alive!==false;});
 if(!ch||!(ch.ninja||ch.ninjutsu||ch.spySkill))return {ok:false,reason:'无有能力的密探'};
 var s=S(g),op={faction:faction,region:region,agent:ch.id||ch.name,turn:g.turn,status:'risk_only',reason:pass.reason};
 s.incidents.push(op);if(s.incidents.length>80)s.incidents.shift();
 return {ok:true,secret:true,notice:'仅登记潜入情报，不给予军队通行权'};
}
function supply(g,army,request){var unit=A(g.armies).find(function(a){return a&&[a.id,a.name].includes(army);});
 if(!unit)return {ok:false,reason:'军团不存在'};
 var needed=Math.max(0,Math.min(4000,Math.round(Number(request)||0)));
 var stored=Number(unit.food||unit.supplies||0),available=Math.max(0,Number(g.guoku&&g.guoku.food||g.food||0));
 var granted=Math.min(needed,available);
 if(!granted)return {ok:false,reason:'国家粮库不足'};
 if(g.guoku&&Number.isFinite(Number(g.guoku.food)))g.guoku.food-=granted;
 else if(Number.isFinite(Number(g.food)))g.food-=granted;
 else return {ok:false,reason:'没有可扣减的粮食来源'};
 unit.supplies=stored+granted;S(g).supplies.push({turn:g.turn,army:unit.id||unit.name,amount:granted});
 return {ok:true,granted:granted};}
function logistics(g){var s=S(g);if(s.turn===g.turn)return {ok:true,duplicate:true};s.turn=g.turn;
 A(g.armies).forEach(function(a){if(!a||a.destroyed)return;
 var troops=Number(a.troops||a.soldiers||0),cost=Math.max(1,Math.ceil(troops/500));
 if(!Number.isFinite(Number(a.supplies)))return;
 a.supplies=Math.max(0,Number(a.supplies)-cost);if(a.supplies===0){
 a.morale=Math.max(0,Number(a.morale||55)-4);s.incidents.push({turn:g.turn,army:a.id||a.name,type:'starvation'});}
 });
 s.incidents=s.incidents.slice(-100);return {ok:true};}
TM.CampaignWorld={state:S,access:access,canCross:canCross,spyCross:spyCross,supply:supply,tick:logistics};
})(typeof window!=='undefined'?window:globalThis);
