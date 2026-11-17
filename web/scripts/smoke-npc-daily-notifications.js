'use strict';
// Only real, delivered and currently actionable NPC activity appears in the new rail inbox.
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {dailyFixture}=require('./lib-npc-daily-fixture');
const bridge=fs.readFileSync(path.join(__dirname,'..','phase8-formal-bridge.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
assert(bridge.includes('data-phase8-badge="daily"'),'rail badge not wired');
assert(bridge.includes("slot === 'letter'"),'rail navigation not wired');
assert(index.includes('tm-npc-daily-ui.js?v=20261016-daily-inbox'),'daily UI cache key stale');
assert(index.includes('phase8-formal-bridge.js?v=20261016-daily-inbox'),'formal rail cache key stale');
const c=dailyFixture(),npc=c.add('npc','将军甲'),player=c.add('player','玩家',{isPlayer:true});
const other1=c.add('other1','官员乙'),other2=c.add('other2','官员丙');
c.GM.playerInfo={characterId:player.id};c.load('tm-npc-daily-ui.js');
const ui=c.TM.NPC.DailyUI,D=c.TM.NPC.DailyActivities;
assert.equal(ui.pendingForPlayer().length,0,'no request must not create a badge');
const hidden=D.submitNPC(other1,{actionId:'private-between-npcs',activityKind:'greeting',targetId:other2.id});
assert.equal(hidden.outcome,'submitted',JSON.stringify(hidden));c.deliver();
assert.equal(ui.pendingForPlayer().length,0,'another pair of NPCs cannot leak into player inbox');
const request=D.submitNPC(npc,{actionId:'npc-to-player',activityKind:'greeting',targetId:player.id});
assert.equal(request.outcome,'submitted',JSON.stringify(request));
assert.equal(ui.pendingForPlayer().length,0,'undelivered request must not be announced');
c.deliver();
const rows=ui.pendingForPlayer();
assert.equal(rows.length,1,'delivered request should produce one pending reminder');
assert.equal(rows[0].id,request.planId);
assert.equal(rows[0].name,'将军甲');
assert.equal(rows[0].incoming,true);
assert.equal(rows[0].kind,'greeting');
assert(!JSON.stringify(rows).includes('官员乙'),'other NPC private details must stay hidden');
assert.equal(c.apiAttempts.length,0,'inbox is zero API');
// Exercise the actual overlay navigation and the visible actionable summary with a
// minimal DOM host; this must not dispatch a simulated game action by itself.
let visible=false,openCalls=0,scrollCalls=0,badgeCalls=0;
const detail={open:true,addEventListener(){}};
const row={dataset:{dailyPlan:request.planId},scrollIntoView(){scrollCalls++;}};
const panel={innerHTML:'',contains(){return true;},
  querySelector(selector){return selector==='details'?detail:null;},
  querySelectorAll(selector){return selector==='[data-daily-plan]'?[row]:[];}};
c.document.querySelector=(selector)=>visible&&selector.indexOf('[data-npc-daily-panel]')>=0?panel:null;
c.TMPhase8FormalBridge={openHongyan(){visible=true;openCalls++;},_updateRailBadges(){badgeCalls++;}};
assert.equal(ui.openPending(),true,'pending entry should open a real daily overlay');
assert.equal(openCalls,1,'only one overlay opening');
assert.equal(scrollCalls,1,'selected item should be visible');
assert(badgeCalls>0,'render should refresh the independent pending badge');
assert(panel.innerHTML.includes('待你处理 1 项'),'summarized pending count must be visible even when details were folded');
assert(panel.innerHTML.includes('将军甲 · 通问'),'actual incoming NPC must be named');
assert.equal(c.apiAttempts.length,0,'opening a notification must not call AI');
const ticket=D.ticket(D.person('player'),{planId:request.planId,phase:'respond'});
assert(ticket,'real player choice should have ticket');
const receipt=D.submitHuman(ticket,{response:'warm'});
assert.equal(receipt.outcome,'submitted',JSON.stringify(receipt));
assert.equal(ui.pendingForPlayer().length,0,'response must clear current actionable reminder');
console.log('[smoke-npc-daily-notifications] PASS · recipient projection / response / 0 API');
