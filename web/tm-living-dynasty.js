/* Family simulation for non-royal factions; crown/harem heirs remain owned by HaremSettlement. */
(function(root){
'use strict';var TM=root.TM=root.TM||{},C=TM.LivingCore;
function house(g,ch){var s=C.state(g).dynasty,key=C.familyKey(ch)||C.id(ch);if(!s.houses[key])s.houses[key]={id:key,headId:C.id(ch),branchOf:'',foundedTurn:g.turn||0,prestige:35};return s.houses[key];} // arch-ok: Dynasty owns house registry
function marital(ch){return C.arr(ch._dynasty&&ch._dynasty.marriages);}
function marry(g,a,b,kind){
  a=C.chr(g,a);b=C.chr(g,b);kind=kind==='concubine'?'concubine':'spouse';
  if(!C.live(a)||!C.live(b)||a===b||Math.min(Number(a.age)||0,Number(b.age)||0)<16)return {ok:false,reason:'婚姻双方须在世且达到成年'};
  if(marital(a).some(function(m){return m.partnerId===C.id(b)&&m.active;}))return {ok:false,reason:'双方已有有效婚约'};
  if(kind==='spouse'&&(marital(a).some(function(m){return m.role==='spouse'&&m.active;})||marital(b).some(function(m){return m.role==='spouse'&&m.active;})))return {ok:false,reason:'已有正室，不能重复正婚'};
  if(TM.WorldMemory&&TM.WorldMemory.kin(g,a,b))return {ok:false,reason:'近亲或同宗关系，禁止婚配'};
  if(!a._dynasty)a._dynasty={};if(!b._dynasty)b._dynasty={}; // arch-ok: Dynasty owns chartered kinship edges
  var turn=g.turn||0,recA={partnerId:C.id(b),partnerName:b.name,role:kind,turn:turn,active:true},recB={partnerId:C.id(a),partnerName:a.name,role:kind,turn:turn,active:true};
  if(!Array.isArray(a._dynasty.marriages))a._dynasty.marriages=[];
  if(!Array.isArray(b._dynasty.marriages))b._dynasty.marriages=[];
  a._dynasty.marriages.push(recA);b._dynasty.marriages.push(recB);
  house(g,a);house(g,b);
  C.remember(g,a,'marriage',b,a.name+'与'+b.name+'结为姻亲',7);
  C.remember(g,b,'marriage',a,b.name+'与'+a.name+'结为姻亲',7);
  C.put(g,'家族','marriage',C.id(a),C.id(b),a.name+'与'+b.name+(kind==='spouse'?'成婚':'纳为侧室'));
  return {ok:true,spouse:a.name,partner:b.name};
}
function child(g,father,mother,adopt){
  father=C.chr(g,father);mother=C.chr(g,mother);
  if(!C.live(father)||!C.live(mother))return {ok:false,reason:'双亲必须在世'};
  if(!adopt&&!marital(father).some(function(x){return x.partnerId===C.id(mother)&&x.active;}))return {ok:false,reason:'须有已登记的婚姻关系'};
  var s=C.state(g),serial=++s.seq,gender=C.roll(g,'sex:'+serial)%2?'男':'女';
  var prefix=String(father.name||'').slice(0,1),given=['承','光','明','昭','仁','信','秀','宁','仪','良','衡','真','文','景','昌','正'];
  var nm=prefix+given[C.roll(g,'name:'+serial)%given.length]+given[C.roll(g,'name2:'+serial)%given.length];
  if(C.arr(g.chars).some(function(x){return x&&x.name===nm;}))nm=nm+serial;
  var h=house(g,father),obj={id:'lwchild:'+String(g.sid||'world')+':'+serial,name:nm,age:adopt?Math.max(2,Math.min(16,C.roll(g,'adoptage:'+serial)%15+2)):0,gender:gender,alive:true,
    father:father.name,mother:mother.name,fatherId:C.id(father),motherId:C.id(mother),parentOf:father.name,faction:father.faction||'',factionId:father.factionId||'',
    family:father.family||prefix+'氏',familyId:father.familyId||'',intelligence:45+C.roll(g,'int:'+serial)%20,military:40+C.roll(g,'mil:'+serial)%25,
    loyalty:70,ambition:35+C.roll(g,'amb:'+serial)%45,_dynasty:{houseId:h.id,adopted:!!adopt,bornTurn:g.turn||0}};
  g.chars.push(obj); // arch-ok: Dynasty owns strictly verified new generated character insertion; no external roster IDs overwritten.
  [father,mother].forEach(function(p){if(!Array.isArray(p.children))p.children=[];if(p.children.indexOf(nm)<0)p.children.push(nm);});
  C.put(g,'家族',adopt?'adoption':'birth',C.id(father),obj.id,(adopt?'收养':'诞生')+'子女 '+nm+'（'+father.name+'家）');
  C.refresh();return {ok:true,character:obj};
}
function adopt(g,parent,ref){
  var p=C.chr(g,parent),ch=C.chr(g,ref);if(!C.live(p)||!C.live(ch)||p===ch||Number(ch.age)>19||Number(p.age)<Number(ch.age)+15)return {ok:false,reason:'收养关系不符年龄及身份条件'};
  if(ch.fatherId||ch.motherId)return {ok:false,reason:'已有明确双亲，需先处理原监护关系'};
  ch.father=p.name;ch.fatherId=C.id(p);ch.parentOf=p.name;
  if(!ch._dynasty)ch._dynasty={};ch._dynasty.houseId=house(g,p).id;ch._dynasty.adopted=true; // arch-ok: Dynasty-owned legal parent link
  if(!Array.isArray(p.children))p.children=[];if(p.children.indexOf(ch.name)<0)p.children.push(ch.name);
  C.put(g,'家族','adoption',C.id(p),C.id(ch),p.name+'收'+ch.name+'为养子女');C.refresh();return {ok:true,character:ch};
}
function branch(g,head,successor){
  var p=C.chr(g,head),s=C.chr(g,successor);if(!C.live(p)||!C.live(s)||p===s)return {ok:false,reason:'家主和分家之人须在世'};
  if(!C.arr(p.children).some(function(n){return n===s.name;})&&s.fatherId!==C.id(p))return {ok:false,reason:'只能给子嗣分家'};
  var old=house(g,p),registry=C.state(g).dynasty.houses,k=old.id+':branch:'+C.id(s);
  if(registry[k])return {ok:false,reason:'此支家已经成立'};
  registry[k]={id:k,headId:C.id(s),branchOf:old.id,foundedTurn:g.turn||0,prestige:15}; // arch-ok: Dynasty owns house creation
  if(!s._dynasty)s._dynasty={};s._dynasty.houseId=k;
  C.put(g,'家族','branch',C.id(p),C.id(s),p.name+'为'+s.name+'另立分家');return {ok:true,house:registry[k]};
}
function heirs(g,h){
  return C.arr(g.chars).filter(function(c){return C.live(c)&&c._dynasty&&c._dynasty.houseId===h.id&&c.age>=15;})
    .sort(function(a,b){var pa=Number(a.ambition)||40,pb=Number(b.ambition)||40;
      var aPref=C.id(a)===h.designatedHeirId?100:0,bPref=C.id(b)===h.designatedHeirId?100:0;
      return bPref-aPref+(pb-pa)*0.2+(Number(b.age)||0)-(Number(a.age)||0);});
}
function designate(g,head,target){
  var p=C.chr(g,head),s=C.chr(g,target),h=p&&house(g,p);
  if(!h||h.headId!==C.id(p)||!C.live(s)||s._dynasty&&s._dynasty.houseId!==h.id)return {ok:false,reason:'须由家主指定本家合法继承候选'};
  h.designatedHeirId=C.id(s);C.put(g,'家族','heir',C.id(p),C.id(s),p.name+'指定'+s.name+'为家督继承人');return {ok:true};
}
function tick(g){
  var dt=C.days(),s=C.state(g).dynasty;
  C.arr(s.pregnancies).forEach(function(p){if(p.status!=='waiting')return;
    var mother=C.chr(g,p.motherId),father=C.chr(g,p.fatherId);
    if(!C.live(mother)||!C.live(father)){p.status='cancelled';return;}
    p.days+=dt;if(p.days>=270){var born=child(g,father,mother,false);p.status=born.ok?'born':'unresolved';p.childId=born.character&&born.character.id||'';}
  });
  s.pregnancies=s.pregnancies.filter(function(p){return p.status==='waiting';}); // arch-ok: Dynasty owns pregnancy queue
  if(C.roll(g,'dynasty-birth-tick')%100<16){var possible=C.arr(g.chars).filter(function(c){return C.live(c)&&Number(c.age)>=18&&Number(c.age)<=45&&c.gender==='女'&&marital(c).some(function(m){return m.active;})&&!s.pregnancies.some(function(p){return p.motherId===C.id(c);});});
    if(possible.length){var mother=possible[C.roll(g,'birth-mother')%possible.length],m=marital(mother).find(function(x){return x.active;}),father=C.chr(g,m&&m.partnerId);
      if(C.live(father)&&father.gender!=='女')s.pregnancies.push({motherId:C.id(mother),fatherId:C.id(father),days:0,status:'waiting',startTurn:g.turn||0}); // arch-ok: Dynasty owns pregnancy queue
    }
  }
  Object.keys(s.houses).forEach(function(key){var h=s.houses[key],head=C.chr(g,h.headId);if(C.live(head))return;
    var contenders=heirs(g,h);if(!contenders.length)return;
    var successor=contenders[0];if(contenders.length>1){var second=contenders[1];if((Number(second.ambition)||0)>65&&C.chance(g,'succession-feud:'+h.id,40))C.put(g,'家族','succession_dispute',C.id(second),C.id(successor),second.name+'不服'+successor.name+'继任家督，家中生隙');}
    h.headId=C.id(successor);C.put(g,'家族','succession',C.id(successor),key,successor.name+'继任'+key+'家督');
  });
}
TM.DynastyWorld={house:house,marry:marry,child:child,adopt:adopt,branch:branch,heirs:heirs,designate:designate,tick:tick};
})(typeof window!=='undefined'?window:globalThis);
