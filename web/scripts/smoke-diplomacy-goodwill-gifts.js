'use strict';
// Run the REAL diplomacy + public-treasury + faction-relations modules inside
// an isolated simulated game. No fake gift payment or direct GM treasury writes.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
const code=name=>fs.readFileSync(path.join(root,name),'utf8');
const ours={id:'us',name:'我朝'},theirs={id:'them',name:'邻国',
  treasury:{money:1000,grain:0,cloth:0,ledgers:{money:{stock:1000,available:1000},grain:{stock:0,available:0},cloth:{stock:0,available:0}}}};
const player={id:'pc',name:'君主',isPlayer:true,alive:true,location:'京师'};
const envoy={id:'em',name:'邻国外交官',alive:true,location:'邻国'};
const GM={turn:1,playerInfo:{factionId:'us',characterId:'pc'},chars:[player,envoy],
  facs:[ours,theirs],treaties:[],factionRelations:[],armies:[],
  guoku:{money:12000,grain:0,cloth:0,ledgers:{
    money:{stock:12000,available:12000},grain:{stock:0,available:0},cloth:{stock:0,available:0}
  }},
  publicTreasuryConfig:{schema:'tm-public-treasury/2',accounts:[
    {id:'us-public',name:'我朝国库',scope:'central',kind:'physical',factionId:'us',source:{kind:'guoku',id:'us'}},
    {id:'them-public',name:'邻国公库',scope:'central',kind:'physical',factionId:'them',source:{kind:'faction',id:'them'}}
  ]}
};
let sequence=0,canSpend=true;
const h={GM,P:{playerInfo:{characterId:'pc',factionId:'us'}},console,TM:{
  OfficeHolderState:{activeAssignments:()=>[]},
  NPC:{ActionLedger:{
    result:(outcome,reason,refs,extra)=>Object.assign({outcome,reason,operationRefs:refs||[]},extra||{}),
    state:()=>ledger,
    executeHuman:(ch,d,scope,fn)=>fn(ch,null,d)
  }},
  PoliticalActions:{
    controlled:(ch)=>ch&&ch.id==='pc',
    live:(ch)=>!!ch&&ch.alive!==false,
    resolve:(kind,ref)=>{
      if(kind==='organization')return GM.facs.find(x=>x.id===ref?.id||x.name===ref?.name)||null;
      if(kind==='character')return GM.chars.find(x=>x.id===ref?.id)||null;
      return null;
    },
    authority:(ch,scope,power)=>{
      if(!ch||!scope)return null;
      if(ch.id==='pc'&&scope.organizationId==='us'){
        if(power==='treasurySpend')return canSpend?{pos:{treasuryBinding:{accountRef:'us-public'}}}:null;
        if(power==='diplomacy'||power==='treatySign')return {actorId:'pc'};
      }
      if(ch.id==='em'&&scope.organizationId==='them'&&(power==='diplomacy'||power==='treatySign'))return {actorId:'em'};
      return null;
    },
    signature:value=>JSON.stringify(value),
    execute:(context,raw,fn)=>{
      const actor=GM.chars.find(c=>c.id===context.actorId);
      return fn(actor,null,Object.assign({actorId:actor.id,organizationId:context.organizationId,
        actionId:'npc-action:'+ ++sequence,phase:'execute'},raw));
    }
  }
}};
const ledger={sequence:0};
h.window=h;h.globalThis=h;
h.TreatySystem={createTreaty:(type,a,b,terms)=>{
  const t={id:'treaty-'+(++sequence),type,parties:[a,b],terms,active:true};
  GM.treaties.push(t);return t;
}};
function load(name){vm.runInNewContext(code(name),h,{filename:name});}
load('tm-relations.js');load('tm-public-treasury.js');load('tm-faction-diplomacy.js');
const D=h.TM.FactionDiplomacy,T=h.TM.PublicTreasury;
const before=()=>({mine:GM.guoku.money,theirs:theirs.treasury.money,relation:(GM.factionRelations.find(x=>x.from==='我朝'&&x.to==='邻国')||{}).value||0});
const submit=(purpose,terms,obligation)=>{
  const input={toFactionId:'them',proposalType:'deal',diplomacyPurpose:purpose,terms,
    ...(obligation?{obligations:[obligation]}:{})};
  const result=D.recordPlayerProposal(ours,input,'submit:'+purpose+':'+(++sequence));
  assert.equal(result.outcome,'submitted',JSON.stringify(result));
  return result.proposalId;
};
const accept=id=>{
  const p=D.get(id);assert(p);
  GM.turn++;
  D.advance();
  assert.equal(p.knowledge.em,p.version,'must deliver actual proposal before foreign signature');
  const r=D.submit(theirs,{proposalId:p.id,proposalVersion:p.version,response:'accept'},
    {actorId:'em',organizationId:'them'});
  assert.equal(r.outcome,'completed','two actual signatures should create a treaty: '+JSON.stringify(r));
  assert.equal(p.status,'accepted');
  assert.equal(GM.treaties.filter(t=>t.id===p.treatyId&&t.active).length,1);
  return p;
};
const initial=before();
const goodwillId=submit('goodwill','相互亲善，遣使往来');
assert.equal(before().relation,initial.relation,'proposal cannot create trust');
const goodwill=accept(goodwillId);
assert.equal(before().relation,initial.relation+4,'only effective treaty increases relation');
assert.equal(GM.treaties.length,1);
assert.equal(goodwill.obligations.length,0);
const accounts={fromAccount:T.getFactionAccountRef({game:GM,factionId:'us',kind:'central'}),
  toAccount:T.getFactionAccountRef({game:GM,factionId:'them',kind:'central'})};
assert.equal(accounts.fromAccount,'us-public');assert.equal(accounts.toAccount,'them-public');
const obligation={kind:'public_transfer',...accounts,amounts:{money:2000}};
const giftId=submit('gift','正式赠礼银两',obligation);
assert.equal(before().mine,initial.mine,'negotiating a gift must never debit cash');
assert.equal(before().relation,initial.relation+4,'proposing a gift cannot raise reputation');
const gift=accept(giftId);
assert.equal(before().mine,initial.mine,'signed gift is still unpaid');
assert.equal(before().relation,initial.relation+4);
assert.equal(gift.obligations[0].status,'unfulfilled');
const paid=D.fulfillPlayerGift({id:'us'},giftId,gift.obligations[0].id);
assert.equal(paid.outcome,'completed',JSON.stringify(paid));
assert.equal(paid.paid,2000);
assert.equal(before().mine,initial.mine-2000,'player treasury must be actually debited');
assert.equal(before().theirs,initial.theirs+2000,'foreign treasury must actually receive it');
assert.equal(before().relation,initial.relation+4+3,'trust reflects paid gift only');
assert.equal(gift.obligations[0].status,'fulfilled');
assert.equal(gift.obligations[0].relationApplied,true);
const receipt=GM._publicTreasuryTransfers.find(x=>x.id===paid.transferId);
assert(receipt&&receipt.result&&receipt.result.paid.money===2000,'real treasury transaction receipt required');
const dup=D.fulfillPlayerGift({id:'us'},giftId,gift.obligations[0].id);
assert.equal(dup.outcome,'noop','replays may not debit again');
assert.equal(before().mine,initial.mine-2000);
assert.equal(before().relation,initial.relation+7);
// Lack of delegated spend authority prevents real payment.
const gift2=submit('gift','次笔礼金',obligation),p2=accept(gift2),beforeDeny=before();
canSpend=false;
const denied=D.fulfillPlayerGift({id:'us'},gift2,p2.obligations[0].id);
assert.equal(denied.outcome,'blocked');
assert.equal(before().mine,beforeDeny.mine);
assert.equal(before().relation,beforeDeny.relation);
canSpend=true;
// Insufficient funds must not half pay or improve relations.
const expensive=submit('gift','数额不足的礼金',{kind:'public_transfer',...accounts,amounts:{money:20000}});
const exp=accept(expensive),beforePoor=before();
const failed=D.fulfillPlayerGift({id:'us'},expensive,exp.obligations[0].id);
assert.equal(failed.outcome,'blocked');
assert.equal(before().mine,beforePoor.mine);
assert.equal(before().theirs,beforePoor.theirs);
assert.equal(before().relation,beforePoor.relation);
// Illegal model-supplied gift obligation is blocked at creation.
const bad=D.recordPlayerProposal(ours,{toFactionId:'them',proposalType:'deal',diplomacyPurpose:'gift',terms:'无效礼金',
  obligations:[{kind:'public_transfer',...accounts,amounts:{money:-100}}]},'invalid-gift');
assert.equal(bad.outcome,'blocked');
const malicious=D.recordPlayerProposal(ours,{toFactionId:'them',proposalType:'deal',diplomacyPurpose:'gift',
  terms:'伪造收付账户的错误建议',
  obligations:[{kind:'public_transfer',fromAccount:'them-public',toAccount:'us-public',amounts:{money:100}}]},
  'wrong-account-parties');
assert.equal(malicious.outcome,'blocked','swapped treasury accounts cannot become signed gift');
assert.equal(malicious.reason,'gift_public_account_parties_mismatch');
const oldAccounts=GM.publicTreasuryConfig.accounts;
GM.publicTreasuryConfig.accounts=oldAccounts.filter(a=>a.id!=='them-public');
const noRecipientTreasury=D.recordPlayerProposal(ours,{toFactionId:'them',proposalType:'deal',
  diplomacyPurpose:'gift',terms:'对方没有实账',
  obligations:[{kind:'public_transfer',...accounts,amounts:{money:100}}]},'missing-bank');
assert.equal(noRecipientTreasury.outcome,'blocked','unconfigured foreign treasury must block fake gift');
GM.publicTreasuryConfig.accounts=oldAccounts;
const sovereigntySnapshot=JSON.stringify(GM.facs.map(x=>({id:x.id,name:x.name})));
const sub=accept(submit('submission_talks','讨论称臣、岁贡、城防条款'));
assert.equal(sub.type,'deal');
assert.equal(JSON.stringify(GM.facs.map(x=>({id:x.id,name:x.name}))),sovereigntySnapshot,
  'negotiating submission cannot silently annex or reassign faction');
assert.equal(GM.armies.length,0);
assert.equal(before().relation,beforePoor.relation,'mere submission talks should not change relation');
console.log('[smoke-diplomacy-goodwill-gifts] PASS · signed goodwill +4, real fiscal gift receipt +3, no free money, replay & authority safe, submission is talks only');
