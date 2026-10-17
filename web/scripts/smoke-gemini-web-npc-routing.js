'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const WEB=path.resolve(__dirname,'..');
function read(name){return fs.readFileSync(path.join(WEB,name),'utf8');}
async function main(){
  const utils=read('tm-utils.js'),m=utils.match(/function _getAITier\(tier\) \{[\s\S]*?(?=function _buildAIUrlForTier\(tier\))/);
  assert(m&&m[0],'tier mapping is present');
  const world={P:{ai:{key:'PAID_PRIMARY_KEY',url:'https://api.deepseek.com/v1',model:'deepseek-chat',
    secondary:{key:'PAID_SECONDARY_KEY',url:'https://api.qwen.example/v1',model:'qwen-chat'}}}};
  vm.runInNewContext(m[0],world);
  assert.strictEqual(world._getAITier('primary').key,'PAID_PRIMARY_KEY');
  assert.strictEqual(world._getAITier('secondary').key,'PAID_SECONDARY_KEY');
  const free=world._getAITier('geminiweb');
  assert.strictEqual(free.model,'gemini-3.5-flash-lite');
  assert(free.url.endsWith('.invalid/v1'));
  assert.strictEqual(world.P.ai.key,'PAID_PRIMARY_KEY','NPC free toggle cannot change primary API');
  const ctx={Response,URL,console,TM:{},P:{conf:{geminiWebNpcEnabled:true}},GM:{busy:false,_endTurnBusy:false},
    _useSecondaryTier:()=>true,_tmAIFetch:async()=>new Response('untouched')};
  ctx.window=ctx;
  vm.runInNewContext(read('tm-gemini-web-adapter.js'),ctx);
  assert.strictEqual(ctx._tmNpcDialogueAITier(),'geminiweb');
  ctx.GM.busy=true;
  assert.strictEqual(ctx._tmNpcDialogueAITier(),'secondary','game turn must use configured API');
  ctx.GM.busy=false;ctx.GM._endTurnBusy=true;
  assert.strictEqual(ctx._tmNpcDialogueAITier(),'secondary');
  ctx.GM._endTurnBusy=false;ctx.P.conf.geminiWebNpcEnabled=false;
  assert.strictEqual(ctx._tmNpcDialogueAITier(),'secondary');
  for(const name of ['tm-wendui.js','tm-chaoyi-yuqian.js','tm-chaoyi-tinyi.js','tm-chaoyi-changchao-adapter.js']) {
    assert(read(name).includes('_tmNpcDialogueAITier()'),name+' does not use NPC route');
  }
  const court=read('tm-chaoyi-changchao-adapter.js');
  const start=court.indexOf('async function _cc3_aiGenReact(');
  const end=court.indexOf('// 解析 JSON（截断/畸形',start);
  assert(start>=0&&end>start,'NPC court reply function exists');
  const react=court.slice(start,end);
  assert(react.includes("const npcTier = _tmNpcDialogueAITier();"),'normal court NPC speech must route through the free tier');
  assert(!react.includes("'secondary'"),'no hardcoded secondary API for NPC court speech');
  assert(react.includes("npcTier === 'geminiweb'"),'free failure should not silently resend');
  assert(court.includes("if (tier === 'geminiweb') return"),'plain system prompt must skip Anthropic cache format');
  assert(read('tm-ai-infra.js').includes("tier !== 'geminiweb' && _provider === 'anthropic'"),'non-stream native Anthropic cache isolation');
  assert(read('tm-ai-infra-retry.js').includes("opts.tier !== 'geminiweb' && _providerS === 'anthropic'"),'stream native Anthropic cache isolation');
  assert(!read('tm-hongyan-office.js').includes('100-200 字古典中文'),'letters must not demand archaic Chinese');
  const settings=read('tm-patches.js');
  assert(!settings.includes('网页/APK 请使用 Gemini 正式 API'),'settings must not advertise Android as unsupported');
  const core=read('tm-endturn-core.js');
  assert(core.includes("gemini-web\\.tianming\\.invalid"),'formal endTurn must reject old virtual primary');
  assert(!core.includes("_tmNpcDialogueAITier()"),'formal endTurn must not use free NPC route');
  console.log('[smoke-gemini-web-npc-routing] PASS: free dialogue, main API preserved, turn safety, old config guard');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
