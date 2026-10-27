/* AI diplomatic initiative. Proposals arrive as real pending decisions; treaty domain signs them. */
(function(root){'use strict';var TM=root.TM=root.TM||{},C=TM.LivingCore;
function relation(g,a,b){var m=g.factionRelationsMap||{},x=m[a.name]&&m[a.name][b.name]||{};return {trust:Number(x.trust)||50,hostility:Number(x.hostility)||0};}
function atWar(g,a,b){return C.arr(g.activeWars).some(function(w){return w&&[w.attacker,w.defender].some(function(k){return k===a.name||k===a.id;})&&[w.attacker,w.defender].some(function(k){return k===b.name||k===b.id;});});}
function allied(g,a,b){return C.arr(g.treaties).some(function(t){if(!t||t.active===false||t.type!=='alliance')return false;var parties=C.arr(t.parties).map(function(p){return p&&typeof p==='object'?(p.id||p.name):p;});return [a.name,a.id].some(function(x){return parties.indexOf(x)>=0;})&&[b.name,b.id].some(function(x){return parties.indexOf(x)>=0;});});}
function offer(g,a,b,type,terms){var s=C.state(g).diplomacy,turn=g.turn||0;
  if(!a||!b||a===b||s.offers.some(function(x){return x.status==='pending'&&x.fromId===a.id&&x.toId===b.id&&x.type===type;}))return null;
  var row={id:'lw-dip:'+String(g.sid||'')+':'+(++C.state(g).seq),turn:turn,fromId:a.id||a.name,toId:b.id||b.name,type:type,terms:String(terms||'').slice(0,220),
  deliverTurn:turn+1,status:'pending'};s.offers.push(row);if(s.offers.length>90)s.offers.splice(0,s.offers.length-90); // arch-ok: diplomacy AI owns initiative queue
  C.put(g,'外交','offer',a.id||a.name,b.id||b.name,a.name+'向'+b.name+'提出'+({alliance:'同盟',peace:'议和',aid:'援军',coalition:'包围网',marriage:'联姻'}[type]||type));return row;
}
function playerSide(g,a){var p=C.playerFac(g);return !!(p&&a&&p.id===a.id);}
function addAudience(g,p,from){if(!Array.isArray(g._pendingAudiences))g._pendingAudiences=[]; // arch-ok: forwarded foreign offer to existing player audience queue
  if(g._pendingAudiences.some(function(x){return x._lwDiplomaticOfferId===p.id;}))return;
  g._pendingAudiences.push({name:from.name+'使节',reason:p.terms,turn:g.turn||0,isEnvoy:true,fromFaction:from.name,interactionType:'living_world_offer',
    _lwDiplomaticOfferId:p.id});
}
function decide(g,p,accept){var s=C.state(g),a=C.fac(g,p.fromId),b=C.fac(g,p.toId);
  if(!a||!b||p.status!=='pending')return {ok:false,reason:'提案已失效'};
  if(p.deliverTurn>g.turn)return {ok:false,reason:'使节尚未送达'};
  if(playerSide(g,b)&&typeof accept!=='boolean')return {ok:false,reason:'等待玩家答复'};
  var rel=relation(g,a,b),wanted=typeof accept==='boolean'?accept:(
    p.type==='peace'?atWar(g,a,b)&&(rel.hostility<80||C.chance(g,p.id+':peace',55)):
    p.type==='alliance'?rel.trust>55&&!atWar(g,a,b)&&C.chance(g,p.id+':alliance',Math.min(90,rel.trust)):
    p.type==='aid'?allied(g,a,b)&&C.chance(g,p.id+':aid',Math.max(15,rel.trust-15)):
    p.type==='marriage'?rel.hostility<45&&C.chance(g,p.id+':marriage',Math.max(15,rel.trust-10)):
    p.type==='coalition'?rel.hostility<75&&C.chance(g,p.id+':coalition',50):false);
  if(!wanted){p.status='rejected';p.resolvedTurn=g.turn||0;C.put(g,'外交','rejected',p.fromId,p.toId,b.name+'拒绝'+a.name+'的'+p.type+'请求');return {ok:true,accepted:false};}
  // A private AI offer cannot bypass formal treaty-signature authority; use pending
  // faction proposals rather than forge a completed GM.treaties record.
  if(['alliance','peace','coalition'].indexOf(p.type)>=0){
    p.status='agreed_in_principle';p.resolvedTurn=g.turn||0; // arch-ok: diplomacy's pending political commitment, not a treaty
    C.put(g,'外交','agreed_in_principle',p.fromId,p.toId,a.name+'与'+b.name+'同意磋商'+p.type+'，仍须正式缔约');
    return {ok:true,accepted:true,needsTreaty:true};
  }
  if(p.type==='marriage'){
    var ma=TM.MarriageAI&&TM.MarriageAI.accept(g,p);
    if(!ma||!ma.ok)return {ok:false,reason:ma&&ma.reason||'婚姻当事人条件未具备'};
  }
  p.status='accepted';p.resolvedTurn=g.turn||0;
  C.put(g,'外交','accepted',p.fromId,p.toId,b.name+'同意'+a.name+'的'+p.type+'请求');return {ok:true,accepted:true};
}
function tick(g){var s=C.state(g),f=C.arr(g.facs),turn=g.turn||0,player=C.playerFac(g);
  s.offers.filter(function(o){return o.status==='pending'&&o.deliverTurn<=turn;}).forEach(function(o){
    var from=C.fac(g,o.fromId),to=C.fac(g,o.toId);if(!from||!to){o.status='lapsed';return;}
    if(player&&to.id===player.id){addAudience(g,o,from);return;}decide(g,o);
  });
  if(f.length<2||turn%3!==0)return;
  var froms=f.filter(function(x){return x&&(!player||x.id!==player.id);}).slice(0,18);
  froms.forEach(function(a){if(!C.chance(g,'foreign-initiative:'+a.id,22))return;
    var options=f.filter(function(b){return b&&b!==a;});if(!options.length)return;
    var b=options[C.roll(g,'foreign-target:'+a.id)%options.length],rel=relation(g,a,b),type='';
    if(atWar(g,a,b))type='peace';
    else if(rel.trust>58&&!allied(g,a,b))type='alliance';
    else if(allied(g,a,b)&&C.chance(g,'aid:'+a.id,18))type='aid';
    else if(rel.hostility<45&&C.chance(g,'wedding:'+a.id,25))type='marriage';
    if(type)offer(g,a,b,type,a.name+'遣使向'+b.name+'提出'+type+'事宜，等待答复和政治确认');
  });
}
TM.ForeignInitiative={offer:offer,decide:decide,tick:tick,relation:relation,atWar:atWar,allied:allied};
})(typeof window!=='undefined'?window:globalThis);
