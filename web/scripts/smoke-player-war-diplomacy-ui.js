'use strict';
// Player-only diplomacy/war UI contracts: no instant treaty, no unearned troops, no unauthorized war.
const assert=require('assert/strict'), fs=require('fs'), path=require('path'), vm=require('vm');
const root=path.join(__dirname,'..');
const ui=fs.readFileSync(path.join(root,'tm-war-diplomacy-ui.js'),'utf8');
const war=fs.readFileSync(path.join(root,'tm-political-actions.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const game=fs.readFileSync(path.join(root,'tm-game-loop.js'),'utf8');
assert(index.includes('tm-war-diplomacy-ui.js?v=20261016-war-diplomacy'));
assert(index.includes('tm-political-actions.js?v=20261016-war-diplomacy'));
assert(index.includes('tm-game-loop.js?v=20261016-war-diplomacy'));
assert(game.includes("action:'TM.WarDiplomacy.open()'"));
const world={
  turn:3,chars:[{id:'pc',name:'玩家',isPlayer:true,alive:true,factionId:'us'}],
  facs:[{id:'us',name:'我朝',isPlayer:true},{id:'them',name:'敌国'}],
  armies:[{id:'a1',name:'京营',factionId:'us',location:'京师',soldiers:2000}],
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
assert(war.includes('recordPlayerWarDeclaration:recordPlayerWarDeclaration'));
assert(war.includes("ledger().executeHuman(actor,d,null,function(ch,to,x){return performWar(ch,x,'declare_war');});"));

const actor={id:'pc',name:'玩家',isPlayer:true,alive:true},fac={id:'us',name:'我朝'},opponent={id:'them',name:'邻国'};
let allowed=true,issued=false,started=0,executed=0;
const ag={turn:7,chars:[actor],facs:[fac,opponent],activeWars:[]},ls={sequence:0};
const guard={GM:ag,P:{playerInfo:{characterId:'pc',factionName:'我朝'}},
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

console.log('[smoke-player-war-diplomacy-ui] PASS · player authorization/treaty/war receipt/recruit no mint/march ownership');
