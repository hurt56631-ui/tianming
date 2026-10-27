/* One deterministic world tick per GM.turn, independently owned modules, zero network. */
(function(root){'use strict';
var TM=root.TM=root.TM||{};
function tick(g){
 var C=TM.LivingCore;if(!g||!C)return {ok:false,reason:'world_not_loaded'};
 var s=C.state(g),turn=Number(g.turn)||0;
 if(s.lastTick.full===turn)return {ok:true,duplicate:true,turn:turn};
 var domains=[['memory',TM.WorldMemory&&TM.WorldMemory.tick],
 ['dynasty',TM.DynastyWorld&&TM.DynastyWorld.tick],
 ['marriage',TM.MarriageAI&&null],
 ['diplomacy',TM.ForeignInitiative&&TM.ForeignInitiative.tick],
 ['intrigue',TM.WorldIntrigue&&TM.WorldIntrigue.tick],
 ['intrigue_ideas',TM.WorldIntrigue&&TM.WorldIntrigue.initiative],
 ['delegation',TM.LegionAutonomy&&TM.LegionAutonomy.tick]];
 var result={ok:true,turn:turn,domains:[],errors:[]};
 domains.forEach(function(row){
  var name=row[0],f=row[1];if(typeof f!=='function')return;
  if(s.lastTick[name]===turn)return;
  try{f(g);s.lastTick[name]=turn;result.domains.push(name);}catch(e){
    C.error(g,name,e);result.errors.push({domain:name,reason:String(e&&e.message||e)});
  }
 });
 if(!result.errors.length)s.lastTick.full=turn;else result.ok=false;
 return result;
}

function panel(){
 var C=TM.LivingCore,g=C.world();if(!g)return false;
 var previous=root.document.getElementById('tm-living-world-panel');if(previous)previous.remove();
 var backdrop=root.document.createElement('div');backdrop.id='tm-living-world-panel';
 backdrop.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:100200;display:flex;align-items:center;justify-content:center;padding:15px;';
 var body=root.document.createElement('section');body.style.cssText='background:#221b13;color:#ebd5ac;border:1px solid #9d7e4e;border-radius:8px;padding:16px;max-width:530px;width:100%;max-height:84vh;overflow:auto;';
 function line(tag,value){var el=root.document.createElement(tag);el.textContent=value;body.appendChild(el);return el;}
 line('h3','世局 · 自主外交与家族');
 var pf=C.playerFac(g),offers=C.arr(C.state(g).diplomacy.offers).filter(function(p){return p.status==='pending'&&p.deliverTurn<=(g.turn||0)&&pf&&C.fac(g,p.toId)===pf;});
 if(!offers.length)line('p','当前没有需要答复的外交使节。');
 offers.forEach(function(p){
  var from=C.fac(g,p.fromId),wrap=root.document.createElement('div');wrap.style.cssText='border-top:1px solid #6a5739;padding:10px 0;';
  var heading=root.document.createElement('p');heading.textContent=(from?from.name:'来使')+'提出：'+p.type+'　'+p.terms;wrap.appendChild(heading);
  var msg=root.document.createElement('p');msg.style.fontSize='12px';wrap.appendChild(msg);
  [['接受',true],['拒绝',false]].forEach(function(opt){
   var b=root.document.createElement('button');b.type='button';b.className='bt bs bsm';b.textContent=opt[0];b.style.marginRight='10px';
   b.onclick=function(){
    if(C.world()!==g){msg.textContent='世界已切换，须重新打开';return;}
    if(opt[1]&&p.type==='marriage'&&!root.confirm('同意由两家符合条件的真实人物联姻？'))return;
    var r=TM.ForeignInitiative.decide(g,p,opt[1]);
    msg.textContent=r.ok?(r.needsTreaty?'双方已同意磋商，仍需正式缔约':r.accepted?'已接受并写入游戏':'已拒绝'):'处理失败：'+(r.reason||'未知');
    if(r.ok){Array.from(wrap.querySelectorAll('button')).forEach(function(x){x.disabled=true;});C.refresh();}
   };wrap.appendChild(b);
  });
  body.appendChild(wrap);
 });
 line('h4','近期世局');
 C.history(g).slice(-12).reverse().filter(function(x){return !x.hidden;}).forEach(function(e){line('p','第'+e.turn+'回合 · '+e.details);});
 var close=root.document.createElement('button');close.className='bt bs bsm';close.textContent='关闭';close.onclick=function(){backdrop.remove();};body.appendChild(close);
 backdrop.onclick=function(e){if(e.target===backdrop)backdrop.remove();};
 backdrop.appendChild(body);root.document.body.appendChild(backdrop);return true;
}
TM.LivingWorld={tick:tick,openPanel:panel};
})(typeof window!=='undefined'?window:globalThis);
