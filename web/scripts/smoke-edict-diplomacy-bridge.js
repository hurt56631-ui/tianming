'use strict';
// Formal treaty entry lives under 诏令→外交: draft != submit != effective treaty.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'..');
function read(name){return fs.readFileSync(path.join(root,name),'utf8');}
const ui=read('tm-war-diplomacy-ui.js'),shell=read('tm-game-ui-shell.js');
const nav=read('tm-game-loop.js'),html=read('index.html');
assert(shell.includes("cat.id==='edict-dip'")&&shell.includes('renderEdictDiplomacy()'),
  'existing edict diplomacy card must host the real negotiation controls');
assert(nav.includes("action:'TM.WarDiplomacy.openEdictDiplomacy()'"),
  'foreign-policy menu should navigate into 诏令→外交');
assert(nav.includes("action:'TM.WarDiplomacy.open()'"),'military controls must remain reachable');
assert(html.includes('tm-war-diplomacy-ui.js?v=20261016-edict-diplomacy'));
assert(html.includes('tm-game-ui-shell.js?v=20261016-edict-diplomacy'));
assert(html.includes('tm-hongyan-office.js?v=20261016-edict-diplomacy'));
assert(html.includes('tm-hongyan-edict-ui.js?v=20261016-edict-diplomacy'));
assert(html.includes('tm-game-loop-wentian-hardchange.js?v=20261016-edict-diplomacy'));
assert(html.includes('tm-game-loop.js?v=20261016-edict-diplomacy'));

const host={GM:{
 turn:3,chars:[{id:'me',name:'我',alive:true,isPlayer:true,factionId:'us'}],
 facs:[{id:'us',name:'我朝'},{id:'them',name:'邻国'},{id:'far',name:'远方邦国'}],
 armies:[],activeWars:[],treaties:[]
},P:{playerInfo:{factionId:'us'}},calls:{submitted:0,switched:0,changed:0,api:0},notices:[]};
const inputs={};
for(const [k,value] of Object.entries({
 'tm-dip-target':'them','tm-dip-mode':'goodwill','tm-dip-terms':'',
 'tm-dip-action-status':'','tm-dip-receipts':'','edict-dip':'已有原本外交诏令',
 'tm-dip-edict-ops':'', 'tm-war-flow-status':''
})){
 inputs[k]={value,innerHTML:'',textContent:'',scrollIntoView(){this.scrolled=true;},
 focus(){this.focused=true;},dispatchEvent(){host.calls.changed++;},setAttribute(k,v){this[k]=v;}};
}
host.document={getElementById:id=>inputs[id]||null};
host.switchGTab=(a,id)=>{assert.equal(id,'gt-edict');host.calls.switched++;};
host.closeTurnResult=()=>{};
host.toast=x=>host.notices.push(x);
host.confirm=()=>true;
host.Event=function Event(){};
host._edictLiveForecast=id=>{assert.equal(id,'edict-dip');};
let known=[];
host.TM={
 PoliticalActions:{controlled:ch=>!!ch.isPlayer},
 NPC:{ActionLedger:{state:()=>({sequence:7})}},
 FactionDiplomacy:{
  TYPE_CN:{deal:'交易',alliance:'结盟',nonaggression:'互不侵犯',peace:'议和',
    joint_action:'联手',ultimatum:'最后通牒'},
  visible:(actor,org)=>{assert.equal(actor.id,'me');assert.equal(org.id,'us');return known;},
  recordPlayerProposal:(org,request,origin)=>{
    host.calls.submitted++;
    assert.equal(org.id,'us');
    assert.equal(request.toFactionId,'them');
    assert(origin.startsWith('player-war-ui:edict-diplomacy'));
    known.push({id:'dp:1',type:request.proposalType,toId:'them',fromId:'us',
      terms:{text:request.terms},status:'in_transit',recipientId:null});
    return {outcome:'submitted',reason:'提案已签发，等待实际送达与对方决定',proposalId:'dp:1'};
  }
 }
};
host.window=host;
vm.runInNewContext(ui,host);
const m=host.TM.WarDiplomacy;
let rendered=m.renderEdictDiplomacy();
assert(rendered.includes('tm-dip-target')&&rendered.includes('tm-dip-terms'));
assert(rendered.includes('<details id="tm-dip-edict-ops"'), 'diplomacy controls should be collapsible on mobile');
assert(rendered.includes('亲善互访')&&rendered.includes('议和停战'));
assert(rendered.includes('正式递交外交提案'));
assert(rendered.includes('亲善互访不立即加好感'));
assert.equal(host.calls.submitted,0,'opening the edict editor must not create a proposal');
assert.equal(m.openEdictDiplomacy(),true);
assert.equal(host.calls.switched,1);
assert.equal(inputs['tm-dip-edict-ops'].scrolled,true);
assert.equal(inputs['tm-dip-target'].focused,true);

assert.equal(m.applyEdictExample(),true);
assert(inputs['tm-dip-terms'].value.includes('互派使臣'));
assert.equal(host.calls.submitted,0,'sample text cannot submit a diplomatic action');
let original=inputs['edict-dip'].value;
host.confirm=()=>false;
assert.equal(m.draftEdictDiplomacy(),false,'cancel must preserve existing decree');
assert.equal(inputs['edict-dip'].value,original);
host.confirm=()=>true;
assert.equal(m.draftEdictDiplomacy(),true);
assert(inputs['edict-dip'].value.startsWith(original+'\n\n'),'decree must be appended');
assert.equal(host.GM.treaties.length,0);
assert.equal(host.calls.submitted,0,'draft must not dispatch real diplomacy');

assert.equal(m.proposeEdictDiplomacy(),true);
assert.equal(host.calls.submitted,1);
assert.equal(host.GM.treaties.length,0,'submitted proposal is not a signed treaty');
assert(/仍待|尚未/.test(inputs['tm-dip-action-status'].textContent),'receipt must not assert signed treaty');
assert(inputs['tm-dip-action-status'].textContent.includes('dp:1'),'return real proposal identifier');
assert(inputs['tm-dip-receipts'].innerHTML.includes('国书在途'),'show known projection only');

assert.equal(m.proposeEdictDiplomacy(),false,'same pending terms cannot be submitted twice');
assert.equal(host.calls.submitted,1);
host.GM.busy=true;
inputs['tm-dip-terms'].value='申请正式停战';
assert.equal(m.proposeEdictDiplomacy(),false,'during turn no proposal is submitted');
assert.equal(host.calls.submitted,1);
host.GM.busy=false;
known=[{id:'dp:2',type:'alliance',toId:'them',fromId:'us',
  terms:{text:'<img src=x onerror=alert(1)>'},status:'accepted'}];
rendered=m.renderEdictDiplomacy();
assert(rendered.includes('&lt;img'),'status UI must escape source terms');
assert(!rendered.includes('<img src=x'),'no HTML insertion from diplomacy terms');
console.log('[smoke-edict-diplomacy-bridge] PASS · edict menu, sample/draft/submit split, visible receipts, duplicate and privacy-safe rendering');
