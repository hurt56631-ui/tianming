(function(root){
'use strict';
var TM=root.TM=root.TM||{},C=TM.LivingCore;
function choose(g,f,gender,minAge,maxAge){
 return C.arr(g.chars).filter(function(c){
  var married=C.arr(c&&c._dynasty&&c._dynasty.marriages).some(function(m){return m.active&&m.role==='spouse';});
  return C.live(c)&&c.faction===f.name&&c.gender===gender&&Number(c.age)>=minAge&&Number(c.age)<=maxAge&&!married;
 }).sort(function(a,b){return String(a.id||a.name).localeCompare(String(b.id||b.name));})[0]||null;
}
function newcomer(g,f,offer){
 var sid='lwbride:'+String(g.sid||'world')+':'+offer.id,prior=C.chr(g,sid);
 if(prior)return prior;
 var surname=String(f.name||'家').replace(/氏|家|朝|国/g,'').slice(0,2)||'氏';
 var n=surname+'姬'+String(C.roll(g,offer.id)%100).padStart(2,'0');
 if(C.arr(g.chars).some(function(c){return c&&c.name===n;}))n+='女';
 var ch={id:sid,name:n,gender:'女',age:17+C.roll(g,offer.id+':age')%15,alive:true,faction:f.name,factionId:f.id||'',
 family:surname+'氏',familyId:'house:'+String(f.id||f.name),loyalty:65,ambition:35+C.roll(g,offer.id+':amb')%45,
 intelligence:40+C.roll(g,offer.id+':int')%35,diplomacy:40+C.roll(g,offer.id+':dip')%35,
 _dynasty:{generatedBy:'foreign_marriage',offerId:offer.id,houseId:'house:'+String(f.id||f.name)}};
 g.chars.push(ch); // arch-ok: MarriageAI owns uniquely identified generated spouse roster insertion after acceptance
 C.refresh();return ch;
}
function accept(g,offer){
 var sender=C.fac(g,offer.fromId),receiver=C.fac(g,offer.toId);
 if(!sender||!receiver)return {ok:false,reason:'外交家族不存在'};
 var recipient=choose(g,receiver,'男',18,65);if(!recipient)return {ok:false,reason:'目标势力暂无合适的未婚人物'};
 var spouse=choose(g,sender,'女',17,37),made=!spouse;
 if(!spouse)spouse=newcomer(g,sender,offer);
 if(!spouse)return {ok:false,reason:'未找到联姻人选'};
 var outcome=TM.DynastyWorld&&TM.DynastyWorld.marry(g,recipient,spouse,'spouse');
 if(!outcome||!outcome.ok){if(made){var index=g.chars.indexOf(spouse);if(index>=0)g.chars.splice(index,1);}return {ok:false,reason:outcome&&outcome.reason||'婚配失败'};}
 offer.spouseId=C.id(spouse);offer.partnerId=C.id(recipient);
 if(typeof root.applyFactionInteraction==='function')try{root.applyFactionInteraction(sender.name,receiver.name,'royal_marriage',{description:'两家联姻·'+spouse.name+'嫁'+recipient.name});}catch(_){}
 C.put(g,'家族','foreign_marriage',C.id(spouse),C.id(recipient),sender.name+'与'+receiver.name+'联姻，'+spouse.name+'与'+recipient.name+'成婚');
 return {ok:true,spouse:spouse,partner:recipient,newCharacter:made};
}
TM.MarriageAI={accept:accept,choose:choose,newcomer:newcomer};
})(typeof window!=='undefined'?window:globalThis);
