'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const files=['core','memory','dynasty','marriage','diplomacy','intrigue','legions','world'];
function makeWorld(){
 const obj={GM:{sid:'smoke-world',turn:6,facs:[{id:'A',name:'甲国'},{id:'B',name:'乙国'}],chars:[
 {id:'a1',name:'甲大名',faction:'甲国',factionId:'A',isPlayer:true,gender:'男',age:34,alive:true,loyalty:60,ambition:45},
 {id:'b1',name:'乙姬',faction:'乙国',factionId:'B',gender:'女',age:22,alive:true,loyalty:67},
 {id:'b2',name:'乙武将',faction:'乙国',factionId:'B',gender:'男',age:40,alive:true,loyalty:22,ambition:72}
 ],armies:[],activeWars:[],treaties:[]},P:{playerInfo:{characterId:'a1',factionName:'甲国'}},TM:{},console:{warn:()=>{}},setTimeout:setTimeout};
 obj.window=obj;obj.globalThis=obj;vm.createContext(obj);
 files.forEach(name=>vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../tm-living-'+name+'.js'),'utf8'),obj,{filename:name+'.js'}));
 return obj;
}
let checks=0;function ok(c,msg){assert.ok(c,msg);checks++;}
{
 const r=makeWorld(),t=r.TM,c=t.LivingCore,g=r.GM;
 const f=t.ForeignInitiative.offer(g,g.facs[1],g.facs[0],'marriage','联姻婚事');
 ok(f&&f.status==='pending','marriage envoy created');
 ok(t.LivingWorld.tick(g).ok,'first living tick succeeds');
 ok(t.LivingWorld.tick(g).duplicate,'tick once per turn');
 g.turn++;let v=t.ForeignInitiative.decide(g,f,true);ok(v.ok&&v.accepted,'player accepts marriage');
 ok(c.chr(g,'a1')._dynasty.marriages.length===1,'marriage persisted');
 let child=t.DynastyWorld.child(g,'a1','b1');ok(child.ok&&g.chars.some(x=>x.id===child.character.id),'real child in roster');
 ok(!t.DynastyWorld.marry(g,'a1','b1','spouse').ok,'duplicate marriage blocked');
 let heir=t.DynastyWorld.designate(g,'a1',child.character);ok(heir.ok,'heir designation');
 let mem=t.WorldMemory.record(g,'a1',{kind:'humiliation',target:'b2',text:'乙武将当众羞辱了甲大名',weight:9});
 ok(!!mem&&t.WorldMemory.score(g,'a1','b2')<0,'negative memory affects decisions');
 ok(t.WorldMemory.record(g,'a1',{kind:'humiliation',target:'b2',sourceId:mem.sourceId,text:'duplicate'})===null,'memory source dedupe');
}
{
 const r=makeWorld(),t=r.TM,g=r.GM;
 let p=t.WorldIntrigue.start(g,'甲国','b2');ok(p.ok,'secret bribe plot started');
 ok(!t.WorldIntrigue.start(g,'甲国','b2').ok,'duplicate secret plots blocked');
 ok(t.LivingWorld.tick(g).ok,'intrigue tick without network requests');
 let m=t.LegionAutonomy.assign(g,'missing','a1','march','乙国');ok(!m.ok,'fake army not accepted');
}
console.log('PASS living-world focused smoke assertions='+checks);
