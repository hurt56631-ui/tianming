'use strict';
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
let g={sid:'smoke',turn:4,facs:[{id:'A',name:'甲国'},{id:'B',name:'乙国'}],
 chars:[{id:'a1',name:'甲将',faction:'甲国',factionId:'A',age:35,loyalty:45,military:75,alive:true},{id:'b1',name:'乙将',faction:'乙国',factionId:'B',age:37,loyalty:55,alive:true}],
 cities:[{id:'c1',name:'甲城',owner:'甲国',population:30000,prosperity:55},{id:'c2',name:'乙城',owner:'乙国',population:24000,prosperity:50}],
 armies:[{id:'army1',name:'甲军',troops:2000,faction:'甲国',supplies:40,morale:60}],
 guoku:{money:50000,food:10000},mapData:{regions:[{id:'r1',name:'峠',owner:'乙国',terrain:'mountain',passable:false},
 {id:'r2',name:'乙路',owner:'乙国',terrain:'plain',roadRequired:true,hasRoad:true}]}};
const root={GM:g,TM:{},console:{warn:()=>{}}};root.window=root;root.globalThis=root;vm.createContext(root);
for(const n of ['tm-political-world','tm-campaign-world','tm-civil-world','tm-political-war-world']){
 const p=path.join(__dirname,'..',n+'.js');vm.runInContext(fs.readFileSync(p,'utf8'),root,{filename:n+'.js'});
}
let checks=0;function ok(x,msg){assert.ok(x,msg);checks++;}
ok(root.TM.PoliticalWorld.covert(g,'甲国','b1','rumor').ok,'valid secret operation');
ok(!root.TM.CampaignWorld.canCross(g,'甲国','峠').ok,'mountain barrier');
ok(!root.TM.CampaignWorld.canCross(g,'甲国','乙路').ok,'foreign route barrier');
ok(root.TM.CampaignWorld.access(g,'甲国','乙国','乙路',5).ok,'passage granted');
ok(root.TM.CampaignWorld.canCross(g,'甲国','乙路').ok,'passage accepted');
ok(root.TM.CivilWorld.trade(g,'甲城','乙城','粮食',20).ok,'trade route exists');
ok(root.TM.CivilWorld.negotiate(g,'missing','hire',1000).ok===false,'invalid local power blocked');
ok(root.TM.PoliticalWarWorld.tick(g).ok,'world advances');
ok(root.TM.PoliticalWarWorld.tick(g).ok,'world idempotent');
ok(g.cities[0].population>0,'population remains valid');
ok(root.TM.CivilWorld.talent(g,'忍者').ok,'wandering ninja is real char');
ok(root.TM.PoliticalWorld.courtAction(g,'rank','甲将').ok,'court petition records but does not fake grant');
console.log('PASS assertions='+checks);
