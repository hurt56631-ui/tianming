/* Modular living-world primitives. No AI/HTTP calls and no duplicate faction/military owners.
 * Persistent state is namespaced under GM._livingWorld; each subsystem owns only its own slice.
 */
(function(root){
'use strict';
var TM=root.TM=root.TM||{};
function arr(x){return Array.isArray(x)?x:[];}
function world(){return root.GM||null;}
function state(g){g=g||world();if(!g)return null;if(!g._livingWorld||g._livingWorld.schema!==1)g._livingWorld={schema:1,seq:0,ledger:[],lastTick:{},errors:[],dynasty:{houses:{},pregnancies:[]},marriages:{offers:[]},diplomacy:{offers:[],coalitions:[]},intrigue:{plots:[]},delegation:{missions:[]}}; // arch-ok: living-world core owns its namespaced persisted ledger
return g._livingWorld;}
function fac(g,ref){var v=ref&&typeof ref==='object'?(ref.id||ref.name):ref;return arr(g&&g.facs).filter(function(f){return f&&[f.id,f.name].some(function(k){return k!=null&&String(k)===String(v);});})[0]||null;}
function chr(g,ref){if(!g)return null;if(ref&&typeof ref==='object')return arr(g.chars).indexOf(ref)>=0?ref:null;var v=String(ref==null?'':ref);if(!v)return null;var exact=arr(g.chars).filter(function(c){return c&&c.id!=null&&String(c.id)===v;});if(exact.length)return exact.length===1?exact[0]:null;exact=arr(g.chars).filter(function(c){return c&&c.name===v;});return exact.length===1?exact[0]:null;}
function live(c){return !!(c&&c.alive!==false&&!c.dead&&!c._missing&&!c._imprisoned&&!c.imprisoned&&!c.capturedBy&&!c._captured);}
function playerChar(g){var c=arr(g&&g.chars).filter(function(x){return x&&x.isPlayer;});if(c.length===1)return c[0];var inf=root.P&&root.P.playerInfo||{};return chr(g,inf.characterId||inf.characterName);}
function playerFac(g){var c=playerChar(g),i=root.P&&root.P.playerInfo||{};return fac(g,c&&(c.factionId||c.faction)||i.factionId||i.factionName||g&&g.playerFactionId);}
function familyKey(c){return String(c&&c._dynasty&&c._dynasty.houseId||c&&c.familyId||c&&c.family||c&&c.clan||c&&c.surname||((c&&c.name)?c.name.slice(0,1)+'氏':'')||'');}
function id(c){return String(c&&(c.id!=null?c.id:c.name)||'');}
function roll(g,key){var txt=String(g&&g.sid||'world')+'|'+String(g&&g.turn||0)+'|'+String(key);var h=2166136261;for(var i=0;i<txt.length;i++){h=Math.imul(h^txt.charCodeAt(i),16777619);}return (h>>>0)%100;}
function chance(g,key,percent){return roll(g,key)<Math.max(0,Math.min(100,Math.round(percent)));}
function days(){var d=typeof root._getDaysPerTurn==='function'?root._getDaysPerTurn():typeof root.getTurnDays==='function'?root.getTurnDays():(root.P&&root.P.time&&root.P.time.daysPerTurn)||30;return Math.max(1,Math.min(365,Number(d)||30));}
function put(g,domain,type,actor,target,details,hidden){var s=state(g);if(!s)return null;var row={id:'living:'+String(g.sid||'')+':'+(++s.seq),turn:g.turn||0,domain:domain,type:type,actor:actor||'',target:target||'',details:String(details||'').slice(0,320),hidden:!!hidden};s.ledger.push(row);if(s.ledger.length>220)s.ledger.splice(0,s.ledger.length-220); // arch-ok: bounded living-world event ledger
if(!hidden&&typeof root.addEB==='function')try{root.addEB(domain,row.details);}catch(_){}
return row;}
function remember(g,ch,kind,other,text,weight){if(TM.WorldMemory&&TM.WorldMemory.record)return TM.WorldMemory.record(g,ch,{kind:kind,target:other,text:text,weight:weight||6});if(root.NpcMemorySystem&&typeof root.NpcMemorySystem.remember==='function')try{root.NpcMemorySystem.remember(ch.name,text,kind==='grudge'?'恨':'喜',weight||6,other&&other.name||'');}catch(_){}return null;}
function ledgerError(g,module,e){var s=state(g);if(!s)return;var msg=String(e&&e.message||e).slice(0,250);s.errors.push({turn:g.turn||0,module:module,reason:msg});if(s.errors.length>35)s.errors.shift();try{root.console&&root.console.warn('[living-world]',module,msg);}catch(_){}}
function refresh(){try{if(root.TMZhi&&typeof root.TMZhi.invalidatePeople==='function')root.TMZhi.invalidatePeople();}catch(_){}}
function compact(g,domain){return arr(state(g)&&state(g).ledger).filter(function(x){return !domain||x.domain===domain;}).slice(-40);}
TM.LivingCore={arr:arr,world:world,state:state,fac:fac,chr:chr,live:live,playerChar:playerChar,playerFac:playerFac,familyKey:familyKey,id:id,roll:roll,chance:chance,days:days,put:put,remember:remember,error:ledgerError,refresh:refresh,history:compact};
})(typeof window!=='undefined'?window:globalThis);
