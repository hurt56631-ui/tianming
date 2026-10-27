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
assert(html.includes('tm-war-diplomacy-ui.js?v=20261016-diplo-relations'));
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
 'tm-dip-action-status':'','tm-dip-receipts':'','tm-dip-gift-money':'2000','edict-dip':'已有原本外交诏令',
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
    known.push({id:'dp:'+host.calls.submitted,type:request.proposalType,toId:'them',fromId:'us',
      terms:{text:request.terms,purpose:request.diplomacyPurpose||'',obligations:request.obligations||[]},
      status:'in_transit',recipientId:null});
    return {outcome:'submitted',reason:'提案已签发，等待实际送达与对方决定',proposalId:'dp:'+host.calls.submitted};
  }
 }
};
host.TM.PublicTreasury={
  getFactionAccountRef:({factionId})=>factionId==='us'?'us-public':factionId==='them'?'them-public':null,
  getAccountView:({ref})=>({exists:true,resources:{money:{known:true,available:ref==='us-public'?6000:0}}})
};
host.window=host;
vm.runInNewContext(ui,host);
const m=host.TM.WarDiplomacy;
let rendered=m.renderEdictDiplomacy();
assert(rendered.includes('tm-dip-target')&&rendered.includes('tm-dip-terms'));
assert(rendered.includes('<details id="tm-dip-edict-ops"'), 'diplomacy controls should be collapsible on mobile');
assert(rendered.includes('亲善互访')&&rendered.includes('议和停战'));
assert(rendered.includes('正式递交外交提案'));
assert(rendered.includes('亲善须双方签约才改善关系'));
assert(rendered.includes('赠礼修好'));
assert(rendered.includes('劝降与臣属谈判'));
assert(rendered.includes('劝降／臣属先协商条件'));
assert(html.includes('tm-faction-diplomacy.js?v=20261016-diplo-relations'));
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
// Gift offers must be typed public-transfer obligations: no immediate payment.
inputs['tm-dip-mode'].value='gift';
inputs['tm-dip-terms'].value='赠礼两千两以示善意';
assert.equal(m.proposeEdictDiplomacy(),true);
assert.equal(host.calls.submitted,2);
const gift=known[1];
assert.equal(gift.terms.purpose,'gift');
assert.equal(gift.terms.obligations.length,1);
assert.equal(gift.terms.obligations[0].kind,'public_transfer');
assert.equal(gift.terms.obligations[0].amounts.money,2000);
assert.equal(gift.terms.obligations[0].fromAccount,'us-public');
assert.equal(gift.terms.obligations[0].toAccount,'them-public');
assert.equal(host.GM.treaties.length,0,'offered gift never creates treaty by itself');
inputs['tm-dip-gift-money'].value='9000';
assert.equal(m.proposeEdictDiplomacy(),false,'insufficient fiscal account balance must block offer');
assert.equal(host.calls.submitted,2);
inputs['tm-dip-gift-money'].value='2000';
host.TM.PublicTreasury.getFactionAccountRef=()=>null;
assert.equal(m.proposeEdictDiplomacy(),false,'gift with no real target account must be blocked');
assert.equal(host.calls.submitted,2);
host.TM.PublicTreasury.getFactionAccountRef=({factionId})=>factionId==='us'?'us-public':factionId==='them'?'them-public':null;
inputs['tm-dip-mode'].value='submission';
inputs['tm-dip-terms'].value='臣属条件协商，不涉及立即主权交割';
assert.equal(m.proposeEdictDiplomacy(),true);
assert.equal(host.calls.submitted,3);
assert.equal(known[2].terms.purpose,'submission_talks');
assert.equal(host.GM.facs.length,3,'requesting submission must not annex a faction');
host.GM.busy=true;
inputs['tm-dip-terms'].value='申请正式停战';
assert.equal(m.proposeEdictDiplomacy(),false,'during turn no proposal is submitted');
assert.equal(host.calls.submitted,3);
host.GM.busy=false;
known=[{id:'dp:2',type:'alliance',toId:'them',fromId:'us',
  terms:{text:'<img src=x onerror=alert(1)>'},status:'accepted'}];
rendered=m.renderEdictDiplomacy();
assert(rendered.includes('&lt;img'),'status UI must escape source terms');
assert(!rendered.includes('<img src=x'),'no HTML insertion from diplomacy terms');
console.log('[smoke-edict-diplomacy-bridge] PASS · edict menu, sample/draft/submit split, visible receipts, duplicate and privacy-safe rendering');
