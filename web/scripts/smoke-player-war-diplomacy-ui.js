'use strict';
// Player-only diplomacy/war UI contracts: no instant treaty, no unearned troops, no unauthorized war.
const assert=require('assert/strict'), fs=require('fs'), path=require('path'), vm=require('vm');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'tm-war-diplomacy-ui.js'),'utf8');
const war=fs.readFileSync(path.join(root,'tm-political-actions.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const game=fs.readFileSync(path.join(root,'tm-game-loop.js'),'utf8');
assert(index.includes('tm-war-diplomacy-ui.js?v=20261016-edict-diplomacy'));
assert(index.includes('tm-political-actions.js?v=20261016-war-diplomacy'));
assert(index.includes('tm-game-loop.js?v=20261016-edict-diplomacy'));
assert(index.includes('tm-game-loop-wentian-hardchange.js?v=20261016-edict-diplomacy'),'split-game-loop family must be atomically cache-bumped');
assert(index.includes('tm-faction-diplomacy.js?v=20261016-war-diplomacy'),'diplomacy runtime cache key stale');
assert(game.includes("action:'TM.WarDiplomacy.open()'"));
assert(game.includes("action:'TM.WarDiplomacy.openEdictDiplomacy()'"),
  'diplomacy entry should now go to edict diplomacy');
assert(game.includes('传统遣使仅登记使臣行程'),'legacy envoy entry must not look like an effective treaty');
const world={
  turn:3,chars:[{id:'pc',name:'玩家',isPlayer:true,alive:true,factionId:'us'}],
  facs:[{id:'us',name:'我朝',isPlayer:true},{id:'them',name:'敌国'}],
  armies:[{id:'a1',name:'京营',factionId:'us',location:'京师',soldiers:2000},{name:'旧制军',factionId:'us',location:'京师',soldiers:100}],
  activeWars:[]
};
const inputs={};
function el(id){return inputs[id]||null;}
function put(id,value){inputs[id]={value:value,focus(){this.focused=true;},textContent:'',setAttribute(n,v){this[n]=v;}};}
['tm-war-home','tm-war-target','tm-war-cb','tm-war-treaty','tm-war-terms','tm-war-army','tm-war-destination','tm-war-recruits'].forEach((id,i)=>put(id,['us','them','border','alliance','协定互保','a1','并州','1000'][i]));
put('edict-mil','');put('tm-war-flow-status','');
const calls={diplomacy:0,war:0,march:0,edicts:0},demo={
  GM:world,P:{playerInfo:{factionName:'我朝'}},
  document:{getElementById:el},
  showTurnResult(html){this.lastPanel=html;},
  closeTurnResult(){},switchGTab(){calls.edicts++;},
  toast(){},confirm(){return true;},
  TM:{
    PoliticalActions:{controlled:(ch)=>ch.isPlayer,
      recordPlayerWarDeclaration(org,enemy,cb,origin){
        calls.war++;assert.equal(org.id,'us');assert.equal(enemy.id,'them');assert.equal(cb,'border');assert(origin);
        world.activeWars.push({id:'war1',attacker:'我朝',defender:'敌国'});
        return {outcome:'started',operationRefs:[{kind:'war',id:'war1'}]};}},
    FactionDiplomacy:{TYPE_CN:{alliance:'结盟'},
      recordPlayerProposal(org,raw,origin){
        calls.diplomacy++;assert.equal(org.id,'us');assert.equal(raw.toFactionId,'them');
        assert.equal(raw.proposalType,'alliance');assert(origin);return {outcome:'submitted'};}},
    NPC:{ActionLedger:{state:()=>({sequence:5})}}
  },
  MarchSystem:{orderMarch(id,to){calls.march++;assert.equal(id,'a1');assert.equal(to,'并州');return {ok:true};}}
};
demo.window=demo;vm.runInNewContext(ui,demo);
assert.equal(demo.TM.WarDiplomacy.open(),true);
assert(demo.lastPanel.includes('外交与军政行动'));
assert(demo.lastPanel.includes('value="旧制军"'),'older armies without IDs must remain selectable by unique name');
assert.equal(demo.TM.WarDiplomacy.propose(),true);
assert.equal(world.activeWars.length,0,'proposal cannot secretly create a war');
assert.equal(demo.TM.WarDiplomacy.declare(),true);
assert.equal(world.activeWars.length,1,'verified response starts one war');
assert.equal(demo.TM.WarDiplomacy.march(),true);
const before=world.armies[0].soldiers;
assert.equal(demo.TM.WarDiplomacy.draftRecruit(),true);
assert.equal(world.armies[0].soldiers,before,'draft must never mint soldiers');
assert(inputs['edict-mil'].value.includes('拟募兵1000人'));
assert.equal(calls.diplomacy,1);assert.equal(calls.war,1);
assert.equal(calls.march,1);assert.equal(calls.edicts,1);
put('tm-war-army','enemy-army');assert.equal(demo.TM.WarDiplomacy.march(),false);
assert.equal(calls.march,1,'foreign army cannot be ordered');
put('tm-war-army','旧制军');
world.armies.push({name:'旧制军',factionId:'them',location:'境外',soldiers:100});
assert.equal(demo.TM.WarDiplomacy.march(),false,'duplicated ID-less army name must be denied');
assert.equal(calls.march,1,'duplicated army name must not reach real march system');
put('tm-war-army','a1');
const originalDraft='已有军令：守卫京师';
inputs['edict-mil'].value=originalDraft;
demo.confirm=()=>false;
assert.equal(demo.TM.WarDiplomacy.draftRecruit(),false,'cancelling append should preserve draft');
assert.equal(inputs['edict-mil'].value,originalDraft);
demo.confirm=()=>true;
assert.equal(demo.TM.WarDiplomacy.draftRecruit(),true);
assert(inputs['edict-mil'].value.startsWith(originalDraft+'\n\n'),'new draft must append, not overwrite');
assert(inputs['edict-mil'].value.includes('拟募兵1000人'));
demo.P.playerInfo.factionName='敌国'; // stale label cannot authorize another faction
assert.equal(demo.TM.WarDiplomacy._playerFactions().length,1);
assert.equal(demo.TM.WarDiplomacy._playerFactions()[0].id,'us');
world.armies.push({id:'misowned',name:'敌方部队误标我方',factionId:'them',faction:'我朝',soldiers:300});
assert(!demo.TM.WarDiplomacy._ownedArmies(world.facs[0]).some(a=>a.id==='misowned'),
  'authoritative foreign factionId overrides stale friendly display label');
demo.P.warConfig={casusBelliTypes:[{id:'claim',name:'宣称领土'}]};
demo.CasusBelliSystem={findCB:(id)=>id==='claim'?{id:id}:null};
demo.TM.WarDiplomacy.open();
assert(demo.lastPanel.includes('value="claim"'),'scenario-legal casus belli should be available');
assert(!demo.lastPanel.includes('<option value="border">'),'unconfigured border CB must not be displayed');
put('tm-war-cb','border');
assert.equal(demo.TM.WarDiplomacy.declare(),false,'unsupported scenario CB must block before authorization');
assert.equal(calls.war,1,'unsupported CB must not reach war engine');
put('tm-war-cb','claim');
assert(war.includes('recordPlayerWarDeclaration:recordPlayerWarDeclaration'));
assert(war.includes("ledger().executeHuman(actor,d,null,function(ch,to,x){return performWar(ch,x,'declare_war');});"));

const actor={id:'pc',name:'玩家',isPlayer:true,alive:true},fac={id:'us',name:'我朝'},opponent={id:'them',name:'邻国'};
let allowed=true,issued=false,started=0,executed=0;
const ag={turn:7,chars:[actor],facs:[fac,opponent],activeWars:[]},ls={sequence:0};
let scenarioCBEnabled=true;
const guard={GM:ag,P:{playerInfo:{characterId:'pc',factionName:'我朝'}},
  CasusBelliSystem:{findCB:id=>scenarioCBEnabled?{id:id}:null},
  TM:{
    NPC:{ActionLedger:{
      result:(outcome,reason,refs,extra)=>Object.assign({outcome,reason,operationRefs:refs||[]},extra||{}),
      state:()=>ls,
      executeHuman:(ch,d,scope,handler)=>{executed++;return handler(ch,null,d);}
    }},
    OfficeHolderState:{
      activeAssignments:(g,ch,opts)=>allowed?[{pos:{id:'ruler-seat',powers:{declareWar:true},status:'active'},node:{id:'court'},holder:{},organizationId:opts.organizationId,delegated:false}]:[],
      availability:(g,ch,pos)=>({char:ch,capacity:true})
    },
    FactionActionEngine:{_applyDeclareWar:(f,a)=>{
      issued=guard.TM.PoliticalActions.verifyIssued(a);
      if(!issued)return {ok:false,reason:'not-issued'};
      const id='verified-war-'+(++started);
      ag.activeWars.push({id,attacker:f.name,defender:opponent.name});
      return {ok:true,detail:{warId:id,casusBelli:a.payload.casusBelli},worldEvent:{kind:'declare_war'}};
    }}
  }
};
guard.window=guard;
vm.runInNewContext(war,guard);
const PA=guard.TM.PoliticalActions;
let sr=PA.recordPlayerWarDeclaration({id:'us'},{id:'them'},'border','ui-test-1');
assert.equal(sr.outcome,'started');
assert.equal(issued,true,'must issue the internal validated action');
assert.equal(started,1);assert.equal(executed,1);
allowed=false;
sr=PA.recordPlayerWarDeclaration({id:'us'},{id:'them'},'border','ui-test-2');
assert.equal(sr.outcome,'blocked','unprivileged player must be denied');
assert.equal(started,1);assert.equal(executed,1);
allowed=true;
assert.equal(PA.recordPlayerWarDeclaration({id:'us'},{id:'us'},'border','same-party').outcome,'blocked');
assert.equal(PA.recordPlayerWarDeclaration({id:'us'},{id:'them'},'nonsense','bad-cb').outcome,'blocked');
ag.busy=true;
assert.equal(PA.recordPlayerWarDeclaration({id:'us'},{id:'them'},'border','during-turn').outcome,'blocked');
assert.equal(started,1,'busy game must not create a war');
ag.busy=false;
scenarioCBEnabled=false;
assert.equal(PA.recordPlayerWarDeclaration({id:'us'},{id:'them'},'border','unconfigured-reason').outcome,'blocked',
  'unconfigured CB should never silently fall back to none');
assert.equal(started,1,'missing CB must not create a war');
assert.equal(executed,1,'missing CB must not reach the action ledger');


// Real diplomacy domain must not turn a missing recipient into a phantom message.
// In the old implementation this produced a "submitted" receipt with toId:''.
const diplomacy=fs.readFileSync(path.join(root,'tm-faction-diplomacy.js'),'utf8');
const visitor={id:'pc',name:'玩家',isPlayer:true,alive:true},home={id:'us',name:'我朝'},foreign={id:'them',name:'邻国'};
const noRecipientWorld={turn:1,chars:[visitor],facs:[home,foreign]},dipState={sequence:0};
let canSign=false;
const dipHost={GM:noRecipientWorld,P:{playerInfo:{characterId:'pc'}},TM:{
  PoliticalActions:{
    controlled:c=>!!c?.isPlayer,live:c=>!!c&&c.alive!==false,
    resolve:(kind,ref)=>kind==='organization'
      ?noRecipientWorld.facs.find(f=>f.id===ref?.id||f.name===ref?.name)
      :kind==='character'?noRecipientWorld.chars.find(c=>c.id===ref?.id):null,
    authority:(ch,scope,power)=>canSign&&ch.id==='rep'&&scope.organizationId==='us'&&power==='treatySign'?{actorId:'rep'}:null,
    signature:v=>JSON.stringify(v)
  },
  OfficeHolderState:{activeAssignments:()=>[]},
  NPC:{ActionLedger:{
    state:()=>dipState,
    result:(outcome,reason,refs,extra)=>Object.assign({outcome,reason,operationRefs:refs||[]},extra||{}),
    executeHuman:(ch,d,scope,handler)=>handler(ch,null,d)
  }}
}};
dipHost.window=dipHost;
vm.runInNewContext(diplomacy,dipHost);
let dp=dipHost.TM.FactionDiplomacy.recordPlayerProposal(home,{toFactionId:'them',proposalType:'alliance',terms:'双方互保'},'no-rep');
assert.equal(dp.outcome,'blocked','unroutable proposals must be blocked');
assert.equal((foreign._incomingProposals||[]).length,0,'no undeliverable queued proposals');
canSign=true;
noRecipientWorld.chars.push({id:'rep',name:'本朝外交代表',alive:true});
dp=dipHost.TM.FactionDiplomacy.recordPlayerProposal(home,{toFactionId:'them',proposalType:'alliance',terms:'双方互保'},'with-rep');
assert.equal(dp.outcome,'submitted','real representative should still receive private suggestion');
assert.equal(foreign._incomingProposals[0].recipientId,'rep');

console.log('[smoke-player-war-diplomacy-ui] PASS · authority/recipient/diplomacy/war/recruit/march contracts');
