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
 var body=root.document.createElement('section');body.style.cssText='background:var(--color-elevated);color:var(--color-foreground);border:1px solid var(--color-border-subtle);border-radius:8px;padding:16px;max-width:530px;width:100%;max-height:84vh;overflow:auto;';
 function line(tag,value){var el=root.document.createElement(tag);el.textContent=value;body.appendChild(el);return el;}
 line('h3','世局 · 自主外交与家族');
 var pf=C.playerFac(g),offers=C.arr(C.state(g).diplomacy.offers).filter(function(p){return p.status==='pending'&&p.deliverTurn<=(g.turn||0)&&pf&&C.fac(g,p.toId)===pf;});
 if(!offers.length)line('p','当前没有需要答复的外交使节。');
 offers.forEach(function(p){
  var from=C.fac(g,p.fromId),wrap=root.document.createElement('div');wrap.style.cssText='border-top:1px solid var(--color-border-subtle);padding:10px 0;';
  var heading=root.document.createElement('p');heading.textContent=(from?from.name:'来使')+'提出：'+p.type+'　'+p.terms;wrap.appendChild(heading);
  var msg=root.document.createElement('p');msg.style.fontSize='small';wrap.appendChild(msg);
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

 line('h4','军团委任');
 var armies=C.arr(g.armies).filter(function(a){return a&&!a.destroyed&&pf&&(a.faction===pf.name||a.factionId===pf.id);});
 if(armies.length){
  var controls=root.document.createElement('div');controls.style.cssText='display:grid;gap:7px;border-top:1px solid var(--color-border-subtle);padding:10px 0;';
  function choose(rows,label){
   var select=root.document.createElement('select');select.style.width='100%';
   rows.forEach(function(pair){var op=root.document.createElement('option');op.value=pair[0];op.textContent=pair[1];select.appendChild(op);});
   controls.appendChild(select);return select;
  }
  var armySel=choose(armies.map(function(a){return [String(a.id||a.name),a.name||a.id];}));
  var generals=C.arr(g.chars).filter(function(c){return C.live(c)&&pf&&(c.faction===pf.name||c.factionId===pf.id)&&Number(c.age||0)>=16;});
  var genSel=choose(generals.map(function(c){return [String(c.id||c.name),c.name];}));
  var modeSel=choose([['defend','驻防守备'],['march','独立行军'],['siege','围困目标城池']]);
  var target=root.document.createElement('input');target.placeholder='目标城池 / 合法地图地名';target.style.width='100%';controls.appendChild(target);
  var resultNotice=root.document.createElement('p');resultNotice.style.fontSize='small';
  var issue=root.document.createElement('button');issue.type='button';issue.className='bt bs bsm';issue.textContent='下达军团任务';
  issue.onclick=function(){
   if(C.world()!==g){resultNotice.textContent='世界已变化';return;}
   var o=TM.LegionAutonomy.assign(g,armySel.value,genSel.value,modeSel.value,target.value.trim());
   resultNotice.textContent=o.ok?'任务已交付军团长，实际行动将在回合推进时核实':'无法委任：'+o.reason;
  };
  controls.appendChild(issue);controls.appendChild(resultNotice);body.appendChild(controls);
 }else line('p','当前没有可委任的本方军队。');
 line('h4','家族婚姻');
 var chars=C.arr(g.chars).filter(function(c){return C.live(c)&&pf&&(c.faction===pf.name||c.factionId===pf.id)&&Number(c.age)>=16;});
 if(chars.length>=2){
  var familyCtr=root.document.createElement('div');familyCtr.style.cssText='display:grid;gap:7px;border-top:1px solid var(--color-border-subtle);padding:10px 0;';
  var man=root.document.createElement('select'),woman=root.document.createElement('select');
  [man,woman].forEach(function(el){chars.forEach(function(c){var op=root.document.createElement('option');op.value=String(c.id||c.name);op.textContent=c.name;el.appendChild(op);});familyCtr.appendChild(el);});
  if(woman.options.length>1)woman.selectedIndex=1;
  var style=root.document.createElement('select');[['spouse','正式成婚'],['concubine','纳为侧室']].forEach(function(row){var op=root.document.createElement('option');op.value=row[0];op.textContent=row[1];style.appendChild(op);});familyCtr.appendChild(style);
  var b=root.document.createElement('button');b.type='button';b.className='bt bs bsm';b.textContent='缔结婚姻';
  var familyMsg=root.document.createElement('p');familyMsg.style.fontSize='small';
  b.onclick=function(){if(C.world()!==g){familyMsg.textContent='世界已变化';return;}
   var result=TM.DynastyWorld.marry(g,man.value,woman.value,style.value);familyMsg.textContent=result.ok?'婚姻已写入人物关系及家族日志':'不成立：'+result.reason;};
  familyCtr.appendChild(b);familyCtr.appendChild(familyMsg);body.appendChild(familyCtr);
 }
 line('h4','近期世局');
 C.history(g).slice(-12).reverse().filter(function(x){return !x.hidden;}).forEach(function(e){line('p','第'+e.turn+'回合 · '+e.details);});
 var close=root.document.createElement('button');close.className='bt bs bsm';close.textContent='关闭';close.onclick=function(){backdrop.remove();};body.appendChild(close);
 backdrop.onclick=function(e){if(e.target===backdrop)backdrop.remove();};
 backdrop.appendChild(body);root.document.body.appendChild(backdrop);return true;
}
TM.LivingWorld={tick:tick,openPanel:panel};
})(typeof window!=='undefined'?window:globalThis);
