/* Structured persistent social memory: thanks, humiliation, promises, kin death and feuds.
 * Existing NpcMemorySystem remains the dialogue/memory context owner.
 */
(function(root){
'use strict';var TM=root.TM=root.TM||{}, C=TM.LivingCore;
function emotion(k){return /grudge|humiliation|betrayal|kin_death|promise_broken/.test(k)?'恨':/promise|warning/.test(k)?'忧':'喜';}
function record(g,ref,data){
  g=g||C.world();var ch=C.chr(g,ref);if(!ch||!data||!data.kind)return null;
  var related=C.chr(g,data.target),target=related&&(related.id||related.name)||String(data.target||''),kind=String(data.kind);
  var weight=Math.max(1,Math.min(10,Number(data.weight)||6));
  if(!Array.isArray(ch._worldMemory))ch._worldMemory=[]; // arch-ok: WorldMemory owns character's structured social memory
  var source=String(data.sourceId||[kind,target,g.turn,data.text].join(':'));
  if(ch._worldMemory.some(function(m){return m.sourceId===source;}))return null;
  var row={id:'wm:'+String(g.sid||'')+':'+C.id(ch)+':'+String(g.turn||0)+':'+ch._worldMemory.length,
    sourceId:source,kind:kind,targetId:related&&C.id(related)||'',targetName:related&&related.name||String(data.target||''),turn:g.turn||0,
    text:String(data.text||kind).slice(0,180),weight:weight,dueTurn:data.dueTurn||0,status:data.status||'active'};
  ch._worldMemory.push(row);if(ch._worldMemory.length>56)ch._worldMemory.splice(0,ch._worldMemory.length-56); // arch-ok: bounded per-person social memory
  if(root.NpcMemorySystem&&typeof root.NpcMemorySystem.remember==='function'){
    try{root.NpcMemorySystem.remember(ch.name,row.text,emotion(kind),weight,row.targetName,
      {characterId:ch.id||undefined,sourceId:row.id,type:/grudge|betrayal/.test(kind)?'betrayal':'general',_noMirror:true});}catch(_){}
  }
  return row;
}
function score(g,ref,target){
  g=g||C.world();var ch=C.chr(g,ref),other=C.chr(g,target);
  if(!ch||!other)return 0;var value=0;
  C.arr(ch._worldMemory).forEach(function(m){
    if(m.targetId?m.targetId!==C.id(other):m.targetName!==other.name)return;
    var a=({kindness:1,gratitude:1,promise_kept:1,marriage:0.6,adoption:0.8,humiliation:-1,grudge:-1.1,betrayal:-1.5,promise_broken:-1.1,kin_death:-0.9})[m.kind]||0;
    var decline=Math.max(0.25,1-Math.max(0,(g.turn||0)-(m.turn||0))/180);
    value+=a*m.weight*decline;
  });
  return Math.max(-50,Math.min(50,Math.round(value)));
}
function promise(g,from,to,terms,deadline){
  var actor=C.chr(g,from),recipient=C.chr(g,to);
  if(!C.live(actor)||!C.live(recipient)||!terms)return null;
  return record(g,recipient,{kind:'promise',target:actor,text:actor.name+'答应'+recipient.name+'：'+String(terms).slice(0,90),
    sourceId:'promise:'+C.id(actor)+':'+C.id(recipient)+':'+String(g.turn),dueTurn:(g.turn||0)+Math.max(1,Number(deadline)||5),weight:7});
}
function fulfill(g,recipient,sourceId){
  var ch=C.chr(g,recipient),p=ch&&C.arr(ch._worldMemory).find(function(m){return m.sourceId===sourceId&&m.kind==='promise'&&m.status==='active';});
  if(!p)return false;p.status='fulfilled';record(g,ch,{kind:'promise_kept',target:p.targetId||p.targetName,text:p.targetName+'履行了先前许诺',sourceId:'fulfilled:'+p.sourceId,weight:8});return true;
}
function kin(g,a,b){if(!a||!b||a===b)return false;
  if([a.father,a.mother,b.father,b.mother].indexOf(a.name)>=0||[a.father,a.mother,b.father,b.mother].indexOf(b.name)>=0)return true;
  if(C.arr(a.children).indexOf(b.name)>=0||C.arr(b.children).indexOf(a.name)>=0)return true;
  var am=C.arr(a._dynasty&&a._dynasty.marriages).some(function(m){return m.partnerId===C.id(b);});
  return am||!!(C.familyKey(a)&&C.familyKey(a)===C.familyKey(b));
}
function tick(g){
  var alive=C.arr(g.chars).filter(function(ch){return ch&&ch.alive!==false&&!ch.dead;});
  C.arr(g.chars).filter(function(ch){return ch&&(ch.alive===false||ch.dead)&&Number(ch.deathTurn||ch._deathTurn)===Number(g.turn);}).slice(0,12).forEach(function(dead){
    alive.filter(function(a){return kin(g,a,dead);}).slice(0,40).forEach(function(a){
      record(g,a,{kind:'kin_death',target:dead,text:dead.name+'在本回合去世；此事成为'+a.name+'难以忘怀的伤痛',
        sourceId:'kin-death:'+C.id(dead)+':'+C.id(a),weight:9});
    });
  });
  alive.forEach(function(ch){C.arr(ch._worldMemory).filter(function(m){return m.kind==='promise'&&m.status==='active'&&m.dueTurn>0&&g.turn>m.dueTurn;}).forEach(function(p){
    p.status='broken';record(g,ch,{kind:'promise_broken',target:p.targetId||p.targetName,text:p.targetName+'没有兑现对'+ch.name+'的承诺',
      sourceId:'broken:'+p.sourceId,weight:8});
  });});
}
TM.WorldMemory={record:record,score:score,promise:promise,fulfill:fulfill,tick:tick,kin:kin};
})(typeof window!=='undefined'?window:globalThis);
