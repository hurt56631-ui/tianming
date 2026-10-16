/* 玩家军政行动：基于真实外交提案、宣战与行军领域，不制造战争或凭空增兵。 */
(function(root){
  'use strict';
  var TM=root.TM=root.TM||{}, api={},seq=0;
  function world(){return root.GM||null;}
  function list(rows){return Array.isArray(rows)?rows:[];}
  function str(s){return String(s==null?'':s);}
  function esc(s){return str(s).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  function player(){
    var g=world(),p=TM.PoliticalActions;
    if(!g||!p||!p.controlled)return null;
    var found=list(g.chars).filter(function(c){return c&&c.alive!==false&&!c.dead&&p.controlled(c,g);});
    return found.length===1?found[0]:null;
  }
  function facs(){
    var g=world(),ch=player();
    if(!g||!ch)return [];
    var pi=(root.P&&root.P.playerInfo)||{},gi=g.playerInfo||{};
    return list(g.facs).filter(function(f){
      if(!f||!f.id||!f.name||f.hidden||f._hidden)return false;
      return f.isPlayer||f.playerControlled||f.controlledBy==='player'||f.controller==='player'
        ||ch.factionId===f.id||ch.faction===f.name
        ||(pi.factionId&&pi.factionId===f.id)||(pi.factionName&&pi.factionName===f.name)
        ||(gi.factionId&&gi.factionId===f.id)||(gi.factionName&&gi.factionName===f.name)
        ||g.playerFactionId===f.id||g.playerFactionName===f.name;
    });
  }
  function factionById(id){return list(world()&&world().facs).find(function(f){return f&&str(f.id)===str(id)&&!f.hidden&&!f._hidden;})||null;}
  function selected(id){var el=root.document&&root.document.getElementById(id);return el?str(el.value).trim():'';}
  function ownedArmies(org){
    if(!org)return [];
    return list(world()&&world().armies).filter(function(a){
      return a&&(a.factionId&&str(a.factionId)===str(org.id)
        ||a.faction&&str(a.faction)===str(org.name)
        ||a.owner&&str(a.owner)===str(org.name)
        ||a.ownerFaction&&str(a.ownerFaction)===str(org.name));
    });
  }
  function resultMessage(result,good,bad){
    var outcome=result&&result.outcome,ok=result&&(result.ok===true||/^(submitted|started|completed)$/.test(outcome||''));
    var message=(ok?good:bad)+(result&&result.reason?'（'+result.reason+'）':'');
    var box=root.document&&root.document.getElementById('tm-war-flow-status');
    if(box){box.textContent=message;box.setAttribute('data-ok',ok?'true':'false');}
    if(typeof root.toast==='function')root.toast(message);
    return !!ok;
  }
  function inputOrigin(prefix){
    var g=world(),l=TM.NPC&&TM.NPC.ActionLedger,st=l&&l.state&&g?l.state(g):null;
    return 'player-war-ui:'+prefix+':'+str(g&&g.turn||0)+':'+str(st&&st.sequence||0)+':'+(++seq);
  }
  function options(rows){return rows.map(function(r){return '<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>';}).join('');}
  function open(){
    if(!root.document||!world()||typeof root.showTurnResult!=='function')return false;
    var mine=facs(),g=world(),publicF=list(g.facs).filter(function(f){return f&&f.id&&f.name&&!f.hidden&&!f._hidden;});
    var home=mine[0],others=publicF.filter(function(f){return !mine.some(function(m){return m.id===f.id;});});
    var troops=ownedArmies(home),wars=list(g.activeWars).filter(function(w){return w&&w.active!==false&&!w.hidden&&!w.ended;});
    var summary=wars.length?wars.slice(0,8).map(function(w){return esc(w.attacker||'?')+' 对 '+esc(w.defender||'?');}).join('；'):'当前没有公开的进行中战争';
    var html='<div style="padding:14px;max-height:76vh;overflow:auto"><h3 style="margin-top:0">外交与军政行动</h3>'
      +'<p style="opacity:.8">正式外交必须送达并获签署；宣战须有职权、理由且不在停战期。募兵需先走诏令，不能凭空给军队加人。</p>'
      +'<label>我方势力 <select id="tm-war-home">'+options(mine)+'</select></label> '
      +'<label>目标势力 <select id="tm-war-target">'+options(others)+'</select></label>'
      +'<fieldset style="margin-top:10px"><legend>外交谈判</legend>'
      +'<label>目标 <select id="tm-war-treaty"><option value="alliance">结盟</option><option value="nonaggression">互不侵犯</option><option value="joint_action">共同行动</option><option value="peace">议和</option><option value="deal">交易</option><option value="ultimatum">最后通牒</option></select></label>'
      +'<textarea id="tm-war-terms" rows="2" style="display:block;width:100%;margin:8px 0" placeholder="写明谈判条款、期限及条件"></textarea>'
      +'<button type="button" class="bt" onclick="TM.WarDiplomacy.propose()">递交外交提案</button>'
      +'<small style="display:block;opacity:.7">提案送出不等于对方签约，后续须等待真实送达、答复和签署。</small></fieldset>'
      +'<fieldset style="margin-top:10px"><legend>宣战与战局</legend><div style="font-size:.85rem;opacity:.8;margin:5px 0">'+summary+'</div>'
      +'<label>宣战理由 <select id="tm-war-cb"><option value="rebellion">平叛讨逆</option><option value="border">边境争端</option><option value="claim">领土声索</option><option value="holy">讨伐不臣</option><option value="subjugation">征服</option></select></label> '
      +'<button type="button" class="bt" onclick="TM.WarDiplomacy.declare()">核准并正式宣战</button>'
      +'<small style="display:block;opacity:.7">没有宣战权限、停战尚在或目标不合法时必须拒绝，不改战争名册。</small></fieldset>'
      +'<fieldset style="margin-top:10px"><legend>募兵与移防</legend>'
      +'<label>我方军队 <select id="tm-war-army">'+options(troops)+'</select></label> '
      +'<label>募兵人数 <input id="tm-war-recruits" type="number" min="1" max="50000" step="100" value="1000" style="width:100px"></label> '
      +'<button type="button" class="bt" onclick="TM.WarDiplomacy.draftRecruit()">拟募兵诏令</button>'
      +'<small style="display:block;opacity:.7">仅草拟诏令；是否增加兵源池、能否补入此军，以正式诏令和实际军队账为准。</small>'
      +'<label style="display:block;margin-top:8px">目的地 <input id="tm-war-destination" placeholder="现有地图中的城池/地区名"></label> '
      +'<button type="button" class="bt" onclick="TM.WarDiplomacy.march()">向所选军队发移防令</button>'
      +'<small style="display:block;opacity:.7">移防由行军系统审查归属、道路与军中回报，不等于自动攻城。</small></fieldset>'
      +'<p id="tm-war-flow-status" role="status" aria-live="polite" style="margin:12px 0"></p></div>';
    if(!home||!others.length){html='<div style="padding:18px">当前存档没有可核实的玩家势力或外交目标，无法发起军事外交操作。</div>';}
    root.showTurnResult(html);
    return !!home&&!!others.length;
  }
  function parties(){
    var org=factionById(selected('tm-war-home')),target=factionById(selected('tm-war-target'));
    if(!org||!target||org.id===target.id||!facs().some(function(f){return f.id===org.id;}))return null;
    return {org:org,target:target};
  }
  function propose(){
    var p=parties(),type=selected('tm-war-treaty'),terms=selected('tm-war-terms');
    var domain=TM.FactionDiplomacy;
    if(!p||!domain||typeof domain.recordPlayerProposal!=='function'||!terms||!domain.TYPE_CN||!domain.TYPE_CN[type])
      return resultMessage(null,'','外交目标、提案类型或条款无效');
    var r=domain.recordPlayerProposal(p.org,{toFactionId:p.target.id,proposalType:type,terms:terms},inputOrigin('diplomacy'));
    return resultMessage(r,'外交提案已按真实送达流程登记，等待对方回应','外交提案未登记');
  }
  function declare(){
    var p=parties(),cb=selected('tm-war-cb'),api=TM.PoliticalActions;
    if(!p||!api||typeof api.recordPlayerWarDeclaration!=='function')
      return resultMessage(null,'','宣战双方或领域尚未就绪');
    if(typeof root.confirm==='function'&&!root.confirm('确定以「'+cb+'」为由向「'+p.target.name+'」正式宣战？宣战会改变战争状态。'))return false;
    var r=api.recordPlayerWarDeclaration({id:p.org.id},{id:p.target.id},cb,inputOrigin('declare'));
    var started=r&&r.outcome==='started'&&list(world()&&world().activeWars).some(function(w){
      return w&&list(r.operationRefs).some(function(ref){return ref.kind==='war'&&ref.id===w.id;});
    });
    if(!started)return resultMessage(r,'','宣战未成功；请核实职权、理由与停战状态');
    return resultMessage(r,'已建立正式战争记录；下一步仍需募兵与行军','宣战未成功');
  }
  function armyContext(){
    var org=factionById(selected('tm-war-home')),armyId=selected('tm-war-army');
    if(!org||!facs().some(function(f){return f.id===org.id;}))return null;
    var matches=ownedArmies(org).filter(function(a){return str(a.id)===armyId;});
    return matches.length===1?{org:org,army:matches[0]}:null;
  }
  function draftRecruit(){
    var c=armyContext(),count=Number(selected('tm-war-recruits'));
    if(!c||!Number.isSafeInteger(count)||count<1||count>50000)
      return resultMessage(null,'','请选择我方军队，并输入 1～50000 的整数兵额');
    if(typeof root.switchGTab!=='function'||!root.document)return resultMessage(null,'','诏令入口未加载');
    if(typeof root.closeTurnResult==='function')root.closeTurnResult();
    root.switchGTab(null,'gt-edict');
    var el=root.document.getElementById('edict-mil');
    if(!el)return resultMessage(null,'','军令输入框尚未生成');
    var loc=str(c.army.garrison||c.army.location||'本军驻地');
    el.value='命有司核查'+loc+'兵源、军饷与军械，拟募兵'+count+'人补充'+c.army.name+'。核定实际可募人数，先登记兵源与开销，再依军令办理入营和整编；未完成不得虚报此军兵力增加。';
    if(typeof el.focus==='function')el.focus();
    if(typeof root.toast==='function')root.toast('募兵诏令已填入军令栏，请审核后按原流程执行；当前未直接增加兵力');
    return true;
  }
  function march(){
    var c=armyContext(),destination=selected('tm-war-destination'),domain=root.MarchSystem;
    if(!c||!destination||!domain||typeof domain.orderMarch!=='function')
      return resultMessage(null,'','我军、目的地或行军系统未就绪');
    var r=domain.orderMarch(c.army.id||c.army.name,destination);
    var ok=r&&r.ok===true;
    var feedback=ok?'移防命令已登记，请查看行军进度':r&&r.pending?'军令已传出，须等掌兵者回报':'行军命令被拒绝';
    return resultMessage({outcome:ok?'started':'blocked',reason:r&&r.reason||''},feedback,feedback);
  }
  api={open:open,propose:propose,declare:declare,draftRecruit:draftRecruit,march:march,
    _playerFactions:facs,_ownedArmies:ownedArmies};
  TM.WarDiplomacy=api;
})(typeof window!=='undefined'?window:globalThis);
