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
    var pi=(root.P&&root.P.playerInfo)||{},gi=g.playerInfo||{},sc=g.startContext||{};
    var publicRows=list(g.facs).filter(function(f){return f&&f.id&&f.name&&!f.hidden&&!f._hidden;});
    // Resolve one actual current player faction. A stale label or an allied
    // faction must never become a second army/diplomacy command source.
    var refs=[sc.playerFactionId,gi.factionId,g.playerFactionId,pi.factionId,ch.factionId,
      sc.playerFactionName,gi.factionName,g.playerFactionName,pi.factionName,ch.faction];
    for(var i=0;i<refs.length;i++){
      var ref=str(refs[i]).trim();if(!ref)continue;
      var hits=publicRows.filter(function(f){return str(f.id)===ref||str(f.name)===ref;});
      if(hits.length===1)return hits;
      if(hits.length>1)return [];
    }
    var flagged=publicRows.filter(function(f){
      return f.isPlayer||f.playerControlled||f.controlledBy==='player'||f.controller==='player';
    });
    return flagged.length===1?flagged:[];
  }
  function factionById(id){return list(world()&&world().facs).find(function(f){return f&&str(f.id)===str(id)&&!f.hidden&&!f._hidden;})||null;}
  function selected(id){var el=root.document&&root.document.getElementById(id);return el?str(el.value).trim():'';}
  function ownedArmies(org){
    if(!org)return [];
    var factions=list(world()&&world().facs);
    return list(world()&&world().armies).filter(function(a){
      if(!a)return false;
      // Same ownership priority as MarchSystem.orderMarch: factionId wins
      // over stale display names, and owner-only annotations grant no control.
      var ref=a.factionId||a.faction;
      if(!ref)return false;
      var matches=factions.filter(function(f){return f&&(str(f.id)===str(ref)||str(f.name)===str(ref));});
      if(matches.length===1)return matches[0].id===org.id;
      if(matches.length>1)return false;
      return str(ref)===str(org.id)||str(ref)===str(org.name);
    });
  }
  function resultMessage(result,good,bad,statusId){
    var outcome=result&&result.outcome,ok=result&&(result.ok===true||/^(submitted|started|completed)$/.test(outcome||''));
    var message=(ok?good:bad)+(result&&result.reason?'（'+result.reason+'）':'');
    var box=root.document&&root.document.getElementById(statusId||'tm-war-flow-status');
    if(box){box.textContent=message;box.setAttribute('data-ok',ok?'true':'false');}
    if(typeof root.toast==='function')root.toast(message);
    return !!ok;
  }
  function inputOrigin(prefix){
    var g=world(),l=TM.NPC&&TM.NPC.ActionLedger,st=l&&l.state&&g?l.state(g):null;
    return 'player-war-ui:'+prefix+':'+str(g&&g.turn||0)+':'+str(st&&st.sequence||0)+':'+(++seq);
  }
  function options(rows){return rows.map(function(r){return '<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>';}).join('');}
  function casusChoices(){
    var defaults=[{id:'rebellion',name:'平叛讨逆'},{id:'border',name:'边境争端'},
      {id:'claim',name:'领土声索'},{id:'holy',name:'讨伐不臣'},{id:'subjugation',name:'征服'}];
    var cfg=root.P&&root.P.warConfig&&root.P.warConfig.casusBelliTypes;
    var supported=root.CasusBelliSystem&&root.CasusBelliSystem.findCB;
    return defaults.filter(function(c){
      return (!Array.isArray(cfg)||cfg.some(function(x){return x&&x.id===c.id;}))
        && (!supported||!!root.CasusBelliSystem.findCB(c.id));
    });
  }

  // First-stage diplomacy uses only the existing proposal/treaty domain.
  // A goodwill visit is a negotiated 'deal', NOT an instant increase in opinion
  // nor a transfer of public money, gifts, provinces or troops.
  var DIP_MODES=[
    {id:'goodwill',type:'deal',purpose:'goodwill',name:'亲善互访（签约后改善关系）',
      example:'互派使臣，改善双方关系，约束边军；只有双方签署亲善协议后才改善关系，不涉及银粮交割。'},
    {id:'gift',type:'deal',purpose:'gift',name:'赠礼修好（履约才生效）',
      example:'向对方提出外交赠礼，协定签订后由有权官员从本方公库向对方公库划转指定银两。财款到账后才改善关系。'},
    {id:'submission',type:'deal',purpose:'submission_talks',name:'劝降与臣属谈判（不直接归附）',
      example:'请对方讨论归附与藩属条件、朝贡义务及保留本地官职、军权的范围；本次仅商议条件，不等于已移交主权、城池或军队。'},
    {id:'alliance',type:'alliance',name:'缔结同盟',
      example:'双方结成军事同盟，互通军情，盟约期限由双方协商确定。'},
    {id:'nonaggression',type:'nonaggression',name:'互不侵犯',
      example:'双方互不主动侵犯，约束边军，发生争端先遣使协商。'},
    {id:'peace',type:'peace',name:'议和停战',
      example:'双方停止当前敌对行动，互换俘虏，讨论停战期限与边界。'},
    {id:'joint_action',type:'joint_action',name:'联手出兵（提案）',
      example:'双方商议共同军事目标、各自行动范围与物资责任；未接受前不得擅自视为盟军参战。'},
    {id:'deal',type:'deal',name:'通商交易（提案）',
      example:'双方协商通商路线、商税和货品交割条件，具体资源转移另按正式财政流程办理。'},
    {id:'ultimatum',type:'ultimatum',name:'外交最后通牒',
      example:'要求对方就边界争端于约定期限内答复，否则我方将另行考虑军事措施；此信不等于正式宣战。'}
  ];
  var DIP_STATES={
    draft:'本方内部草案',in_transit:'国书在途',pending:'待答复',
    accepted:'双方已签署',rejected:'对方拒绝',cancelled:'已撤回',
    lapsed:'失效',needs_replan:'旧文书待重拟'
  };
  function dipMode(id){return DIP_MODES.find(function(x){return x.id===id;})||null;}
  function giftPledge(x){
    var treasury=TM.PublicTreasury,g=world(),amount=Number(selected('tm-dip-gift-money'));
    if(!Number.isSafeInteger(amount)||amount<1||amount>100000)
      return {error:'赠礼银两须为 1 至 100000 的整数'};
    if(!treasury||typeof treasury.getFactionAccountRef!=='function'||typeof treasury.getAccountView!=='function')
      return {error:'本局尚无可核实的公库结算模块，不能保证真实赠礼'};
    var from=treasury.getFactionAccountRef({game:g,factionId:x.org.id,kind:'central'}),
        to=treasury.getFactionAccountRef({game:g,factionId:x.to.id,kind:'central'});
    if(!from||!to||from===to)return {error:'双方缺少独立的实体公库账户，本局暂不能真实赠礼'};
    var src=treasury.getAccountView({game:g,ref:from}),dest=treasury.getAccountView({game:g,ref:to});
    if(!src||!dest||!src.exists||!dest.exists||!src.resources||
      !src.resources.money||!src.resources.money.known||
      !dest.resources||!dest.resources.money||!dest.resources.money.known)
      return {error:'公库余额或对方收款账户不明确，不能虚报赠礼'};
    if(src.resources.money.available==null||src.resources.money.available<amount)
      return {error:'本方可用国库银两不足；赠礼不能透支或虚增余额'};
    return {obligation:{kind:'public_transfer',fromAccount:from,toAccount:to,amounts:{money:amount}}};
  }
  function proposalPayload(x){
    var payload={toFactionId:x.to.id,proposalType:x.mode.type,terms:x.terms};
    if(x.mode.purpose)payload.diplomacyPurpose=x.mode.purpose;
    if(x.mode.id==='gift'){
      var prepared=giftPledge(x);
      if(prepared.error)return prepared;
      payload.obligations=[prepared.obligation];
      payload.terms=x.terms+'\n【国库赠礼义务】我方承诺正式签约后，自公库向'+x.to.name+'公库交割银'
        +prepared.obligation.amounts.money+'两。仅在付款回执核实后才视为已付并改善关系。';
    }
    return {payload:payload};
  }
  function relationLabel(from,to){
    var g=world(),rows=list(g&&g.factionRelations);
    var record=rows.find(function(row){return row&&(row.from===from&&row.to===to||row.from===to&&row.to===from);});
    return record&&Number.isFinite(Number(record.value))?'关系 '+Number(record.value):'关系尚无正式记录';
  }
  function statusContent(){
    var org=facs()[0],ch=player(),domain=TM.FactionDiplomacy;
    if(!org||!ch||!domain||typeof domain.visible!=='function')return '<small>暂无可核实的外交文书。</small>';
    var records=[];
    try{records=domain.visible(ch,org);}catch(e){
      if(root.console&&root.console.warn)root.console.warn('[edict-diplomacy] read-only receipt view',e);
      return '<small>外交记录暂时无法读取，请查看鸿雁与问对。</small>';
    }
    if(!records.length)return '<small>当前人物尚无已知外交文书。</small>';
    return records.slice(0,6).map(function(row){
      var dest=factionById(row.toId),source=factionById(row.fromId);
      var type=(row.terms&&row.terms.purpose==='goodwill'?'亲善互访':
        row.terms&&row.terms.purpose==='gift'?'赠礼修好':
        row.terms&&row.terms.purpose==='submission_talks'?'劝降/臣属条件协商':
        domain.TYPE_CN&&domain.TYPE_CN[row.type]||row.type||'外交');
      var state=row.recipientId?'待你处理':DIP_STATES[row.status]||row.status||'处理中';
      var terms=row.terms&&row.terms.text||'';
      var gift=row.terms&&row.terms.purpose==='gift',payments=list(row.obligations);
      var unpaid=gift&&row.status==='accepted'&&row.fromId===org.id
        ?payments.find(function(o){return o&&o.kind==='public_transfer'&&o.status==='unfulfilled';}):null;
      var giftLabel=gift&&row.status==='accepted'
        ?(unpaid?' · 已签约待付款':payments.length&&payments.every(function(o){return o.status==='fulfilled';})?' · 已实际付清':' · 尚待履约'):'';
      var subNote=row.terms&&row.terms.purpose==='submission_talks'?' · 尚未改变主权及城军归属':'';
      return '<div style="padding:5px 0;border-bottom:1px solid var(--color-border-subtle);font-size:var(--tm-text-sm,0.75rem)">'
        +'<b>'+esc(type)+'</b> · '+esc(source&&source.name||'未知势力')+' → '+esc(dest&&dest.name||'未知势力')
        +' · <span>'+esc(state+giftLabel+subNote)+'</span>'
        +(terms?'<div style="opacity:.75">'+esc(terms.slice(0,88))+'</div>':'')
        +'<small style="opacity:.7">'+esc(relationLabel(source&&source.name,dest&&dest.name))+'</small>'
        +(unpaid?'<div><button type="button" class="bt bsm" data-gift-proposal="'+esc(row.id)+'" data-gift-obligation="'+esc(unpaid.id)+'" onclick="TM.WarDiplomacy.paySignedGift(this)">核验权限并从真实公库支付赠礼</button></div>':'')
        +'</div>';
    }).join('')
      +'<small style="display:block;opacity:.7">显示的只有当前角色真正获知的文书；回应、还价请在使节请见事项中办理。</small>';
  }
  function renderEdictDiplomacy(){
    var g=world(),own=facs(),home=own[0],domain=TM.FactionDiplomacy;
    var available=list(g&&g.facs).filter(function(f){
      return f&&f.id&&f.name&&!f.hidden&&!f._hidden&&!own.some(function(x){return x.id===f.id;});
    });
    var base='<details id="tm-dip-edict-ops" aria-label="外交谈判正式操作" style="margin-top:10px;padding:10px;border:1px solid var(--color-border-subtle);background:var(--color-elevated);border-radius:4px">'
      +'<summary style="font-size:var(--tm-text-md,0.8125rem);cursor:pointer;font-weight:bold">展开正式外交谈判与回执</summary>'
      +'<p style="font-size:var(--tm-text-sm,0.75rem);opacity:.75;margin:6px 0">原文字栏为外交诏令草稿，正式递交才会创建外交文书。亲善须双方签约才改善关系；赠礼须先签约、后真实付款。劝降／臣属先协商条件，不会直接转移城池军队；策反与和亲尚未实现。</p>';
    if(!home||!available.length||!domain||typeof domain.recordPlayerProposal!=='function'){
      return base+'<p style="font-size:var(--tm-text-sm,0.75rem)">本存档暂无可核实的我方势力、其他势力或外交系统。</p></details>';
    }
    var types=DIP_MODES.map(function(mode){return '<option value="'+esc(mode.id)+'">'+esc(mode.name)+'</option>';}).join('');
    base+='<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
      +'<label style="font-size:var(--tm-text-sm,0.75rem)">我方：<b>'+esc(home.name)+'</b></label>'
      +'<label style="font-size:var(--tm-text-sm,0.75rem)">对象 <select id="tm-dip-target">'+options(available)+'</select></label>'
      +'<label style="font-size:var(--tm-text-sm,0.75rem)">方式 <select id="tm-dip-mode">'+types+'</select></label></div>'
      +'<label style="display:block;font-size:var(--tm-text-sm,0.75rem);margin-top:6px">赠礼银两（仅选择赠礼时使用） <input id="tm-dip-gift-money" type="number" min="1" max="100000" step="100" value="1000" style="width:110px" title="必须有双方真实公库账户，签约后才能付款"></label>'
      +'<label style="display:block;font-size:var(--tm-text-sm,0.75rem);margin-top:6px">谈判条款（双方同意后才生效）'
      +'<textarea id="tm-dip-terms" rows="3" style="display:block;width:100%;box-sizing:border-box;margin-top:4px" placeholder="写明期限、义务、底线、能否接受割地或赔款等。"></textarea></label>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin:7px 0">'
      +'<button type="button" class="bt bsm" onclick="TM.WarDiplomacy.applyEdictExample()">填入示例条款</button>'
      +'<button type="button" class="bt bsm" onclick="TM.WarDiplomacy.draftEdictDiplomacy()">仅起草诏令</button>'
      +'<button type="button" class="bt bsm" onclick="TM.WarDiplomacy.proposeEdictDiplomacy()">正式递交外交提案</button></div>'
      +'<p id="tm-dip-action-status" role="status" aria-live="polite" style="font-size:var(--tm-text-sm,0.75rem)"></p>'
      +'<details style="margin-top:5px"><summary style="font-size:var(--tm-text-sm,0.75rem);cursor:pointer">外交来往记录（仅当前人物已知）</summary>'
      +'<div id="tm-dip-receipts">'+statusContent()+'</div></details></details>';
    return base;
  }
  function edictDipInputs(){
    var org=facs()[0],to=factionById(selected('tm-dip-target')),mode=dipMode(selected('tm-dip-mode'));
    if(!org||!to||to.id===org.id||!mode)return null;
    return {org:org,to:to,mode:mode,terms:selected('tm-dip-terms')};
  }
  function applyEdictExample(){
    var x=edictDipInputs(),el=root.document&&root.document.getElementById('tm-dip-terms');
    if(!x||!el)return false;
    if(el.value.trim()&&typeof root.confirm==='function'
       &&!root.confirm('条款中已有内容。确定要替换为这个示例吗？'))return false;
    el.value=x.mode.example;
    if(root.Event&&el.dispatchEvent)el.dispatchEvent(new root.Event('input',{bubbles:true}));
    return true;
  }
  function dipCanSubmit(){
    var g=world();
    return !!g&&!g.busy&&!g._endTurnCommitPending;
  }
  function draftEdictDiplomacy(){
    var x=edictDipInputs(),input=root.document&&root.document.getElementById('edict-dip');
    if(!x||!input||!dipCanSubmit()||!x.terms.trim()||x.terms.length>12000){
      return resultMessage(null,'','外交目标、条款或回合状态无效','tm-dip-action-status');
    }
    var sum=x.mode.id==='gift'?'拟赠银'+selected('tm-dip-gift-money')+'两，待财政权限与实际可付库银核准；':'';
    var text='遣使与'+x.to.name+'协商'+x.mode.name.replace(/（.*?）/g,'')+'。'+sum+'谈判条件：'+x.terms+'。须经过合法使节递送及双方有效签署，未签约不得视为生效。';
    if(input.value.trim()&&typeof root.confirm==='function'
       &&!root.confirm('已有外交诏令，是否把这份草稿追加在末尾？'))return false;
    input.value=(input.value.trim()?input.value.replace(/\s*$/,'')+'\n\n':'')+text;
    if(root.Event&&input.dispatchEvent)input.dispatchEvent(new root.Event('input',{bubbles:true}));
    if(typeof root._edictLiveForecast==='function')root._edictLiveForecast('edict-dip');
    if(typeof input.focus==='function')input.focus();
    var status=root.document&&root.document.getElementById('tm-dip-action-status');
    if(status)status.textContent='仅已填入外交诏令草稿，尚未派遣使臣、提交提案或签署条约。';
    return true;
  }
  function reportProposal(r,statusId){
    var ownAdvice=r&&r.outcome==='submitted'&&/私人建议|有权代表/.test(str(r.reason));
    var msg=ownAdvice?'已交本方有权代表审批（尚未送往对方）':'国书已进入正式提案流程，仍待送达、答复和签署';
    var success=resultMessage(r,msg,'外交提案未登记',statusId);
    if(success&&r&&r.proposalId){
      var box=root.document&&root.document.getElementById(statusId);
      if(box)box.textContent+=(box.textContent?' · ':'')+'文书号：'+str(r.proposalId);
    }
    var receipts=root.document&&root.document.getElementById('tm-dip-receipts');
    if(receipts)receipts.innerHTML=statusContent();
    return success;
  }
  function proposeEdictDiplomacy(){
    var x=edictDipInputs(),domain=TM.FactionDiplomacy;
    if(!x||!dipCanSubmit()||!domain||typeof domain.recordPlayerProposal!=='function'
       ||!x.terms.trim()||x.terms.length>12000)
      return resultMessage(null,'','外交目标、条款、系统或回合状态无效','tm-dip-action-status');
    if(!domain.TYPE_CN||!domain.TYPE_CN[x.mode.type])
      return resultMessage(null,'','正式外交领域尚不支持该提案方式','tm-dip-action-status');
    var prepared=proposalPayload(x);
    if(prepared.error)return resultMessage(null,'',prepared.error,'tm-dip-action-status');
    var payload=prepared.payload;
    // Existing known proposals are the only ones safe to compare; the domain
    // remains the authority on national signatures and delivery.
    var actor=player(),existing=typeof domain.visible==='function'&&actor?domain.visible(actor,x.org):[];
    var duplicate=list(existing).some(function(row){
      var v=row.terms&&row.terms.text;
      return row.toId===x.to.id&&row.type===x.mode.type&&v===payload.terms
        &&String(row.terms&&row.terms.purpose||'')===String(payload.diplomacyPurpose||'')
        &&!(/^(accepted|rejected|cancelled|lapsed)$/.test(row.status||''));
    });
    if(duplicate)return resultMessage(null,'','已有相同条款的待处理提案，请等待回信或修改条款','tm-dip-action-status');
    if(typeof root.confirm==='function'&&!root.confirm('将以「'+x.org.name+'」名义向「'+x.to.name+'」提出「'+x.mode.name+'」？提交只是递送/本方审批，不代表双方已经同意。'))return false;
    var receipt=domain.recordPlayerProposal(x.org,payload,inputOrigin('edict-diplomacy'));
    return reportProposal(receipt,'tm-dip-action-status');
  }
  function paySignedGift(btn){
    if(!btn||!btn.dataset||!dipCanSubmit())return false;
    var org=facs()[0],domain=TM.FactionDiplomacy;
    if(!org||!domain||typeof domain.fulfillPlayerGift!=='function')
      return resultMessage(null,'','公库赠礼结算尚不可用','tm-dip-action-status');
    if(typeof root.confirm==='function'&&!root.confirm('确认从本方真实公库支付这份已签署赠礼？将即时扣除库银并记入对方国库，不可撤回。'))return false;
    var receipt=domain.fulfillPlayerGift({id:org.id},btn.dataset.giftProposal,btn.dataset.giftObligation);
    var success=resultMessage(receipt,'赠礼已真实交割并核对外交关系','赠礼尚未成功交割','tm-dip-action-status');
    var el=root.document&&root.document.getElementById('tm-dip-receipts');
    if(el)el.innerHTML=statusContent();
    return success;
  }
  function openEdictDiplomacy(){
    if(!root.document||typeof root.switchGTab!=='function')return false;
    if(typeof root.closeTurnResult==='function')root.closeTurnResult();
    root.switchGTab(null,'gt-edict');
    var el=root.document.getElementById('tm-dip-edict-ops');
    if(!el){
      var ta=root.document.getElementById('edict-dip');
      if(ta&&ta.insertAdjacentHTML){ta.insertAdjacentHTML('afterend',renderEdictDiplomacy());el=root.document.getElementById('tm-dip-edict-ops');}
    }
    if(el&&'open' in el)el.open=true;
    if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest'});
    var target=root.document.getElementById('tm-dip-target');
    if(target&&target.focus)target.focus();
    return !!el;
  }
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
      +'<p style="margin:12px 0">外交谈判已统一移到「诏令 → 外交」。<button type="button" class="bt" onclick="TM.WarDiplomacy.openEdictDiplomacy()">前往正式外交谈判</button></p>'
      +'<fieldset style="margin-top:10px"><legend>宣战与战局</legend><div style="font-size:.85rem;opacity:.8;margin:5px 0">'+summary+'</div>'
      +'<label>宣战理由 <select id="tm-war-cb">'+options(casusChoices())+'</select></label> '
      +'<button type="button" class="bt" onclick="TM.WarDiplomacy.declare()">核准并正式宣战</button>'
      +'<small style="display:block;opacity:.7">没有宣战权限、停战尚在或目标不合法时必须拒绝，不改战争名册。</small></fieldset>'
      +'<fieldset style="margin-top:10px"><legend>募兵与移防</legend>'
      +'<label>我方军队 <select id="tm-war-army">'+troops.map(function(a){return '<option value="'+esc(a.id||a.name)+'">'+esc(a.name||a.id)+'</option>';}).join('')+'</select></label> '
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
    return reportProposal(r,'tm-war-flow-status');
  }
  function declare(){
    var p=parties(),cb=selected('tm-war-cb'),api=TM.PoliticalActions;
    if(!p||!api||typeof api.recordPlayerWarDeclaration!=='function')
      return resultMessage(null,'','宣战双方或领域尚未就绪');
    if(!casusChoices().some(function(row){return row.id===cb;}))
      return resultMessage(null,'','当前剧本没有配置所选宣战理由，不能按其他理由代替');
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
    var matches=ownedArmies(org).filter(function(a){return str(a.id||a.name)===armyId;});
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
    var draft='命有司核查'+loc+'兵源、军饷与军械，拟募兵'+count+'人补充'+c.army.name+'。核定实际可募人数，先登记兵源与开销，再依军令办理入营和整编；未完成不得虚报此军兵力增加。';
    var previous=str(el.value||'');
    if(previous.trim()&&typeof root.confirm==='function'&&
       !root.confirm('军令栏已有内容，是否将这条募兵建议追加到末尾？原稿不会删除。'))return false;
    el.value=(previous.trim()?previous.replace(/\s*$/,'')+'\n\n':'')+draft;
    if(root.Event&&typeof el.dispatchEvent==='function')el.dispatchEvent(new root.Event('input',{bubbles:true}));
    if(typeof el.focus==='function')el.focus();
    if(typeof root.toast==='function')root.toast('募兵诏令已填入军令栏，请审核后按原流程执行；当前未直接增加兵力');
    return true;
  }
  function march(){
    var c=armyContext(),destination=selected('tm-war-destination'),domain=root.MarchSystem;
    if(!c||!destination||!domain||typeof domain.orderMarch!=='function')
      return resultMessage(null,'','我军、目的地或行军系统未就绪');
    var key=c.army.id||c.army.name;
    var matches=list(world()&&world().armies).filter(function(a){
      return a&&(a.id===key||a.name===key);
    });
    if(matches.length!==1||matches[0]!==c.army)
      return resultMessage(null,'','军队名称或 ID 有歧义，请先为该军设置唯一身份，不能猜测下令对象');
    var r=domain.orderMarch(key,destination);
    var ok=r&&r.ok===true;
    var feedback=ok?'移防命令已登记，请查看行军进度':r&&r.pending?'军令已传出，须等掌兵者回报':'行军命令被拒绝';
    return resultMessage({outcome:ok?'started':'blocked',reason:r&&r.reason||''},feedback,feedback);
  }
  api={open:open,openEdictDiplomacy:openEdictDiplomacy,renderEdictDiplomacy:renderEdictDiplomacy,
    applyEdictExample:applyEdictExample,draftEdictDiplomacy:draftEdictDiplomacy,
    proposeEdictDiplomacy:proposeEdictDiplomacy,paySignedGift:paySignedGift,
    propose:propose,declare:declare,draftRecruit:draftRecruit,march:march,
    _playerFactions:facs,_ownedArmies:ownedArmies};
  TM.WarDiplomacy=api;
})(typeof window!=='undefined'?window:globalThis);
