// 战俘处置：战场 commanderFate.captured → 关押/招降/释放/处决。
// State owner: character._warCaptive and GM._warCaptiveActions. All nationality changes
// MUST go through TM.FactionMembership, all executions through applyOneDeath.
// Never let an NPC text model change these states directly.
(function(root){
  'use strict';
  root.TM=root.TM||{};
  function world(){return root.GM&&typeof root.GM==='object'?root.GM:null;}
  function byFactionRef(ref,g){
    if(!ref)return '';
    var s=String(ref).trim();
    var fac=(g&&g.facs||[]).find(function(f){return f&&(String(f.id||'')===s||f.name===s);});
    return fac?fac.name:s;
  }
  function playerFaction(g){
    var p=root.P||{}, info=(p.playerInfo||{});
    if(root.TM&&root.TM.Player&&typeof root.TM.Player.getInfo==='function'){
      try{info=root.TM.Player.getInfo(g)||info;}catch(_){}
    }
    var name=byFactionRef(info.factionId||info.factionName||(g&&g.startContext&&g.startContext.playerFactionId)||'',g);
    return (g&&g.facs||[]).some(function(f){return f&&f.name===name;})?name:'';
  }
  function exact(ref,g){
    if(!g||!Array.isArray(g.chars))return null;
    if(ref&&typeof ref==='object')return g.chars.indexOf(ref)>=0?ref:null;
    var s=String(ref==null?'':ref).trim();if(!s)return null;
    var ids=g.chars.filter(function(c){return c&&c.id!=null&&String(c.id)===s;});
    if(ids.length)return ids.length===1?ids[0]:null;
    var names=g.chars.filter(function(c){return c&&c.name===s;});
    return names.length===1?names[0]:null;
  }
  function allowed(ch,g){
    if(!g||!ch||ch.alive===false||ch.dead===true||ch.isPlayer)return {ok:false,reason:'人物不存在、已故或不可处置'};
    if((g.chars||[]).indexOf(ch)<0)return {ok:false,reason:'人物已离开当前名册'};
    var ours=playerFaction(g),holder=byFactionRef(ch.capturedBy,g);
    if(!ours||holder!==ours)return {ok:false,reason:'战俘不在我方控制下'};
    if(byFactionRef(ch.factionId||ch.faction,g)===ours)return {ok:false,reason:'已属我方，不能作为敌军战俘处置'};
    return {ok:true,ours:ours,origin:byFactionRef(ch.factionId||ch.faction,g)};
  }
  function onCapture(ref,captor,g,meta){
    g=g||world();var ch=exact(ref,g);if(!ch||ch.alive===false||ch.dead||ch.isPlayer)return false;
    var captorName=byFactionRef(captor,g),origin=byFactionRef(ch.factionId||ch.faction,g);
    if(!captorName||origin===captorName)return false;
    var old=ch._warCaptive||{};
    if(old.status==='captured'&&old.by===captorName&&old.battleId===(meta&&meta.battleId||''))return false;
    ch.capturedBy=captorName; // arch-ok: WarCaptives owns battle capture provenance, compatible with existing .capturedBy consumers.
    ch._warCaptive={status:'captured',by:captorName,origin:origin,turn:g.turn||0,battleId:meta&&meta.battleId||'',attemptTurn:-1}; // arch-ok: WarCaptives-owned character status.
    return true;
  }
  function chance(ch){
    var loyalty=Number.isFinite(+ch.loyalty)?+ch.loyalty:55;
    var ambition=Number.isFinite(+ch.ambition)?+ch.ambition:45;
    var integrity=Number.isFinite(+ch.integrity)?+ch.integrity:55;
    var diplomacy=Number.isFinite(+ch.diplomacy)?+ch.diplomacy:50;
    return Math.max(5,Math.min(65,Math.round(5+(100-loyalty)*0.32+ambition*0.13+diplomacy*0.07-integrity*0.15)));
  }
  function roll(ch,g){
    var seed=String(g.sid||'')+'|'+String(g.turn||0)+'|'+String(ch.id||ch.name)+'|recruit';
    var hash=2166136261;for(var i=0;i<seed.length;i++){hash^=seed.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return (hash>>>0)%100+1;
  }
  function history(g,ch,action,result,details){
    if(!Array.isArray(g._warCaptiveActions))g._warCaptiveActions=[]; // arch-ok: WarCaptives is owner of this capped, serialized world ledger.
    var row={turn:g.turn||0,characterId:ch.id||'',name:ch.name,action:action,result:result,
      origin:ch._warCaptive&&ch._warCaptive.origin||'',captor:ch._warCaptive&&ch._warCaptive.by||'',details:details||''};
    g._warCaptiveActions.push(row); // arch-ok: append-only history bounded below.
    if(g._warCaptiveActions.length>120)g._warCaptiveActions.splice(0,g._warCaptiveActions.length-120);
    if(typeof root.addEB==='function')try{root.addEB('战俘',ch.name+'·'+details);}catch(_){}
    return row;
  }
  function refresh(){
    if(root.TMZhi&&typeof root.TMZhi.invalidatePeople==='function')try{root.TMZhi.invalidatePeople();}catch(_){}
  }
  function clearHeld(ch,g,status){
    ch.capturedBy=''; // arch-ok: this module owns the release of a battle captive.
    if(ch._warCaptive&&ch._warCaptive.status==='detained')ch._imprisoned=false; // arch-ok: bridge to existing prison flag, only for our own captive detention.
    if(ch._warCaptive)ch._warCaptive.status=status; // arch-ok: WarCaptives character status.
    ch._releasedTurn=g.turn||0; // arch-ok: court release marker aligned with WenduiPrison.
  }
  function adjudicate(ref,action,opts){
    var g=world(),ch=exact(ref,g),check=allowed(ch,g), c=ch&&ch._warCaptive||{};
    if(!check.ok)return {ok:false,reason:check.reason};
    if(g.busy||g._endTurnBusy)return {ok:false,reason:'回合结算中，不能处置战俘'};
    if(['detain','recruit','release','execute'].indexOf(action)<0)return {ok:false,reason:'无效的战俘处置指令'};
    if(action==='recruit'){
      if(c.attemptTurn===g.turn)return {ok:false,reason:'本回合已尝试招降此人'};
      var membership=root.TM&&root.TM.FactionMembership;
      if(!membership||typeof membership.assignChar!=='function')return {ok:false,reason:'势力归属接口未准备好'};
      c=ch._warCaptive=c&&c.by?c:{status:'captured',by:check.ours,origin:check.origin,turn:g.turn||0,attemptTurn:-1}; // arch-ok: WarCaptives-owned status for imported old saves.
      var probability=chance(ch),die=roll(ch,g);
      c.attemptTurn=g.turn; // arch-ok: single attempt per character per turn, saved in world.
      if(die>probability){
        history(g,ch,'recruit','refused','劝降未成（成功机会 '+probability+'%）');refresh();
        return {ok:true,success:false,reason:'对方不愿归降',chance:probability};
      }
      // Remove former government offices before nationality transfer, avoiding an enemy minister seated in both courts.
      if(ch.id&&typeof root._offVacateByCharId==='function'){
        var vacated=root._offVacateByCharId(ch.id,'war-captive-defection',g.officeTree,{leaveVacancy:true,world:g});
        if(vacated&&vacated.ok===false)return {ok:false,reason:'原任官职未能卸任：'+String(vacated.reason||'未知原因')};
      }else if(typeof root.PostTransfer!=='undefined'&&root.PostTransfer&&typeof root.PostTransfer.cascadeVacate==='function'){
        root.PostTransfer.cascadeVacate(ch.name);
      }
      var changed=membership.assignChar(ch,check.ours,{reason:'战俘劝降入仕',byTurn:g.turn||0});
      if(!changed||byFactionRef(ch.factionId||ch.faction,g)!==check.ours)return {ok:false,reason:'人物转籍失败，未认定登用成功'};
      var targetLoy=40, oldLoy=Number.isFinite(+ch.loyalty)?+ch.loyalty:50;
      if(typeof root.adjustCharacterLoyalty==='function'){
        try{root.adjustCharacterLoyalty(ch,targetLoy-oldLoy,'战俘初降·待观后效',{source:'war-captive-recruit'});}catch(_){}
      }
      clearHeld(ch,g,'recruited');
      ch._warCaptive.recruitedTurn=g.turn||0; // arch-ok: WarCaptives reconciliation.
      history(g,ch,'recruit','success','招降入仕，已由'+check.origin+'转入'+check.ours);
      refresh();return {ok:true,success:true,reason:'招降成功',chance:probability};
    }
    if(action==='detain'){
      if(ch._warCaptive&&ch._warCaptive.status==='detained')return {ok:false,reason:'该人物已被关押'};
      ch._warCaptive=c&&c.by?c:{status:'captured',by:check.ours,origin:check.origin,turn:g.turn||0,attemptTurn:-1}; // arch-ok: WarCaptives provenance.
      ch._warCaptive.status='detained'; // arch-ok: WarCaptives owns detention subtype.
      ch._imprisoned=true;ch._imprisonedTurn=g.turn||0;ch._imprisonReason='战场被俘·待决'; // arch-ok: existing prison subsystem bridge, not a sentence for ordinary citizens.
      history(g,ch,'detain','success','暂押待决');refresh();return {ok:true,success:true,reason:'已关押'};
    }
    if(action==='release'){
      ch._warCaptive=c&&c.by?c:{status:'captured',by:check.ours,origin:check.origin,turn:g.turn||0};
      clearHeld(ch,g,'released');
      history(g,ch,'release','success','释放归还'+check.origin);refresh();return {ok:true,success:true,reason:'已释放'};
    }
    if(action==='execute'){
      if(typeof root.applyOneDeath!=='function')return {ok:false,reason:'人物死亡级联处理未加载，禁止处决'};
      ch._warCaptive=c&&c.by?c:{status:'captured',by:check.ours,origin:check.origin,turn:g.turn||0};
      try{root.applyOneDeath({name:ch.name,characterId:ch.id||undefined,reason:'战俘处决'});}
      catch(e){return {ok:false,reason:'处决写入失败：'+String(e&&e.message||e)};}
      if(ch.alive!==false&&ch.dead!==true)return {ok:false,reason:'人物死亡未写入，处决未执行'};
      ch.capturedBy='';ch._imprisoned=false;ch._warCaptive.status='executed'; // arch-ok: WarCaptives clears battle custody after canonical death sink.
      history(g,ch,'execute','success','处决战俘·其原有势力及家族可能记恨');
      var ledger=root.TM&&root.TM.MinxinLedger;
      if(ledger&&typeof ledger.recordAndApply==='function')try{
        ledger.recordAndApply(g,{sourceSystem:'war-captives',kind:'judicialFairness',delta:-2,reason:'战俘处决引发朝野争议'});
      }catch(_){}
      refresh();return {ok:true,success:true,reason:'已处决'};
    }
    return {ok:false,reason:'处置失败'};
  }
  function onPrisonRelease(ch){
    var g=world(),v=exact(ch,g);
    if(!v||!v.capturedBy||!(v._warCaptive&&v._warCaptive.status==='detained'))return false;
    var check=allowed(v,g);if(!check.ok)return false;
    // WenduiPrison already applied its own energy/reputation effects.
    v._warCaptive.status='released';v.capturedBy='';v._imprisoned=false;v._releasedTurn=g.turn||0; // arch-ok: prisoner release bridge owns battle custody.
    history(g,v,'release','success','诏狱赦免/释放战俘');refresh();return true;
  }
  function owned(ref){var g=world(),ch=exact(ref,g);return allowed(ch,g).ok;}
  function list(){var g=world();return (g&&g.chars||[]).filter(function(ch){return allowed(ch,g).ok;});}
  function open(ref){
    var g=world(),ch=exact(ref,g),v=allowed(ch,g);
    if(!v.ok){if(typeof root.toast==='function')root.toast(v.reason);return false;}
    if(!root.document||!root.document.body)return false;
    var old=root.document.getElementById('tm-war-captive-modal');if(old)old.remove();
    var cover=root.document.createElement('div');cover.id='tm-war-captive-modal';
    cover.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:100100;display:flex;align-items:center;justify-content:center;padding:16px;';
    var panel=root.document.createElement('section');
    panel.style.cssText='background:#201911;color:#e5d1ad;border:1px solid #97774c;border-radius:10px;padding:18px;max-width:430px;width:100%;display:grid;gap:10px;max-height:85vh;overflow:auto;';
    function line(tag,msg){var e=root.document.createElement(tag);e.textContent=msg;panel.appendChild(e);return e;}
    line('h3','战俘处置 · '+ch.name);
    line('p','原属 '+v.origin+'　｜　现被 '+v.ours+' 俘获');
    line('p','忠诚 '+(ch.loyalty==null?'未知':ch.loyalty)+'　｜　招降成功机会约 '+chance(ch)+'%（同一回合不可重复尝试）');
    var result=line('p','选择处置方式。');
    result.style.cssText='font-size:13px;color:#b3a180;';
    var actions=[['recruit','劝降登用'],['detain','继续关押'],['release','释放归还'],['execute','处决战俘']];
    var entryWorld=g,entryChar=ch;
    actions.forEach(function(row){
      var btn=root.document.createElement('button');btn.textContent=row[1];btn.type='button';btn.className='bt bs bsm';
      btn.addEventListener('click',function(){
        if(world()!==entryWorld||exact(entryChar,world())!==entryChar){result.textContent='世界已变化，请重新打开';return;}
        if(row[0]==='execute'&&!root.confirm('处决 '+ch.name+'？此举不可撤销，并可能影响朝野与家族关系。'))return;
        if(row[0]==='release'&&!root.confirm('释放 '+ch.name+' 返回 '+v.origin+'？'))return;
        var outcome=adjudicate(entryChar,row[0]);
        result.textContent=outcome.reason||'处置完毕';
        if(outcome.success||!owned(entryChar))actions.forEach(function(){});
        if(!owned(entryChar))Array.from(panel.querySelectorAll('button')).forEach(function(b){if(b!==close)b.disabled=true;});
        if(row[0]==='detain'&&outcome.ok)btn.disabled=true;
        if(row[0]==='recruit'&&outcome.ok)btn.disabled=true;
      });
      panel.appendChild(btn);
    });
    var close=root.document.createElement('button');close.className='bt bs bsm';close.textContent='关闭';close.onclick=function(){cover.remove();};panel.appendChild(close);
    cover.onclick=function(e){if(e.target===cover)cover.remove();};
    cover.appendChild(panel);root.document.body.appendChild(cover);return true;
  }
  root.TM.WarCaptives={onCapture:onCapture,canManage:owned,list:list,resolve:adjudicate,recruitChance:chance,onPrisonRelease:onPrisonRelease,open:open};
})(typeof window!=='undefined'?window:globalThis);
