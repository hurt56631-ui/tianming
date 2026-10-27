/* Local powers, trade, population, wandering talents and world events. No invented territorial ownership. */
(function(root){'use strict';var TM=root.TM=root.TM||{};
function A(x){return Array.isArray(x)?x:[];}
function S(g){if(!g._civilWorld)g._civilWorld={version:1,turn:-1,powers:[],markets:[],events:[],talents:[]};return g._civilWorld;}
function random(g,key){var txt=String(g.sid||'world')+'|'+g.turn+'|'+key,h=2166136261;for(var i=0;i<txt.length;i++)h=Math.imul(h^txt.charCodeAt(i),16777619);return(h>>>0)%100;}
function initialize(g){var s=S(g);if(s.powers.length)return s;
 var types=['国人众','忍者众','水军众','寺社','自治都市'];var places=A(g.cities).slice(0,10);
 places.forEach(function(p,i){var type=types[i%types.length];s.powers.push({id:'independent:'+String(p.id||p.name),name:p.name+' '+type,type:type,
 base:p.name,allegiance:'independent',influence:30+random(g,p.name)%40,cooperation:25,hostility:15});});
 return s;}
function negotiate(g,id,kind,amount){var s=initialize(g),p=s.powers.find(function(x){return x.id===id;});
 if(!p||!['trade','hire','appease','influence'].includes(kind))return {ok:false,reason:'诸势力或行动无效'};
 var payment=Math.max(100,Math.min(20000,Math.floor(Number(amount)||1000)));
 if(!g.guoku||Number(g.guoku.money||g.guoku.gold||0)<payment)return {ok:false,reason:'国库不足，不能凭空付钱'};
 if(Number.isFinite(+g.guoku.money))g.guoku.money-=payment;else g.guoku.gold-=payment;
 p.cooperation=Math.min(100,p.cooperation+Math.ceil(payment/650));p.hostility=Math.max(0,p.hostility-Math.ceil(payment/1200));
 s.events.push({turn:g.turn,type:'local_deal',power:p.name,kind:kind,payment:payment});
 return {ok:true,power:p.name,cooperation:p.cooperation};}
function trade(g,from,to,goods,price){var src=A(g.cities).find(function(c){return c&&(c.id===from||c.name===from);}),dst=A(g.cities).find(function(c){return c&&(c.id===to||c.name===to);});
 if(!src||!dst||src===dst)return {ok:false,reason:'真实贸易城市不合法'};
 var s=S(g);if(s.markets.some(function(m){return m.active&&m.from===src.name&&m.to===dst.name&&m.goods===goods}))return {ok:false,reason:'商路已存在'};
 s.markets.push({id:'route:'+s.markets.length+':'+g.turn,from:src.name,to:dst.name,goods:String(goods||'粮食'),active:true,start:g.turn,volume:Math.max(1,Math.min(100,Number(price)||15)),risk:20});
 return {ok:true};}
function talent(g,type){var roles=['浪人','商人','谋士','僧侣','忍者','武家子女'];if(!roles.includes(type))return {ok:false,reason:'人才类型无效'};
 var s=S(g),serial=s.talents.length+1,id='civil:'+String(g.sid||'')+':'+g.turn+':'+serial;
 if(A(g.chars).some(function(c){return c.id===id}))return {ok:false,reason:'重复人物'};
 var name=['藤原','源','平','橘','佐久间','松本'][random(g,id+'name')%6]+['忠义','光秀','晴信','宗景','定纲','长政'][random(g,id+'given')%6];
 if(A(g.chars).some(function(c){return c.name===name}))name+=String(g.turn)+'之'+serial;
 var c={id:id,name:name,alive:true,age:19+random(g,id+'age')%39,gender:random(g,id+'gender')<82?'男':'女',
 faction:'',factionId:'',occupation:type,loyalty:40,ambition:20+random(g,id+'amb')%65,
 military:15+random(g,id+'mil')%75,politics:15+random(g,id+'pol')%75,intelligence:20+random(g,id+'intel')%70,
 _civilTalent:true};
 if(!Array.isArray(g.chars))return {ok:false,reason:'人物名册未准备好'};
 g.chars.push(c);s.talents.push({id:c.id,type:type,turn:g.turn,status:'wandering'});
 s.events.push({turn:g.turn,type:'talent',name:name,role:type});return {ok:true,person:c};}
function settle(g){var s=initialize(g);if(s.turn===g.turn)return {ok:true,duplicate:true};s.turn=g.turn;
 A(g.cities).forEach(function(city){
  if(!city||!Number.isFinite(Number(city.population)))return;
  var pop=Math.max(0,Math.floor(Number(city.population))),tax=Math.max(0,Number(city.taxRate||0)),plague=city.plague===true?0.014:0,
    famine=city.famine===true?0.019:0,security=Number(city.security||50);
  var growth=Math.round(pop*(0.0015+Math.max(-.002,Math.min(.002,(security-50)/40000))-plague-famine-Math.max(0,tax-20)/30000));
  city.population=Math.max(0,pop+growth);city.prosperity=Math.max(0,Math.min(100,Number(city.prosperity||50)+(growth>0?1:-2)));
  if((plague||famine)&&random(g,city.name+'distress')<25)s.events.push({turn:g.turn,type:plague?'plague':'famine',city:city.name,loss:Math.max(0,-growth)});
 });
 s.markets.filter(function(x){return x.active;}).forEach(function(route){
  var src=A(g.cities).find(function(c){return c&&c.name===route.from;}),dst=A(g.cities).find(function(c){return c&&c.name===route.to;});
  if(!src||!dst){route.active=false;return;}
  var safe=random(g,'route-risk:'+route.id)>=route.risk;
  if(safe){src.prosperity=Math.min(100,Number(src.prosperity||45)+1);dst.prosperity=Math.min(100,Number(dst.prosperity||45)+1);}
  else s.events.push({turn:g.turn,type:'caravan_raid',route:route.id});
 });
 if(random(g,'new-wanderer')<17)talent(g,['浪人','商人','谋士','僧侣','忍者','武家子女'][random(g,'wanderer-kind')%6]);
 if(random(g,'dynastic-crisis')<5){var household=A(g.facs)[random(g,'dynasty-target')%Math.max(1,A(g.facs).length)];
   if(household)s.events.push({turn:g.turn,type:'succession_crisis',faction:household.name});}
 s.events=s.events.slice(-160);return {ok:true,events:s.events.filter(function(e){return e.turn===g.turn;})};}
TM.CivilWorld={state:S,initialize:initialize,negotiate:negotiate,trade:trade,talent:talent,tick:settle};
})(typeof window!=='undefined'?window:globalThis);
