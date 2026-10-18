'use strict';
const assert=require('assert');
const fs=require('fs'),path=require('path'),vm=require('vm');
const WEB=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(WEB,name),'utf8');
async function run(){
  let charged=0,requested=[];
  const sandbox={
    console,TextEncoder,Response,URL,
    P:{ai:{url:'https://paid-provider.example/v1',key:'PAID_PRIMARY_KEY',
      model:'paid-model',secondary:{url:'https://secondary-provider.example/v1',key:'PAID_SECONDARY_KEY',model:'paid-secondary'}},
      conf:{geminiWebTurnEnabled:true}},
    GM:{busy:true,_endTurnBusy:true,turn:8},
    TM:{Endturn:{ModeContract:{selectedMode:()=> 'llm'}}},
    _tmAIFetch:async()=>{charged++;throw Error('paid network unexpectedly called');},
    tianming:{isDesktop:true,geminiWebChat:async()=>({ok:true,text:'{"events":[]}',model:'gemini-3.5-flash-lite'})}
  };
  sandbox.window=sandbox;
  vm.runInNewContext(read('tm-gemini-turn.js'),sandbox);
  const u=read('tm-utils.js'),start=u.indexOf('function _getAITier(tier) {'),end=u.indexOf('// 存档脱敏',start);
  assert(start>=0&&end>start,'tier owner found');
  vm.runInNewContext(u.slice(start,end),sandbox);
  vm.runInNewContext(read('tm-gemini-web-adapter.js'),sandbox);
  const turn=sandbox.TM.GeminiTurn;
  assert(turn.selected()&&!turn.active());
  assert.strictEqual(sandbox._getAITier('primary').key,'PAID_PRIMARY_KEY');
  assert(turn.begin()&&turn.active());
  assert.throws(()=>turn.assertBeforeSave(),/空回合提交/,'a free turn with zero model requests must not silently commit');
  assert.strictEqual(sandbox._getAITier('primary').tier,'geminiweb');
  assert.strictEqual(sandbox._getAITier('secondary').tier,'geminiweb');
  const body={model:'paid-model',messages:[
    {role:'system',content:[{type:'text',text:'请推演朝局',cache_control:{type:'ephemeral'}}]},
    {role:'user',content:'返回 {"events":[]}'}],
    response_format:{type:'json_object'},temperature:0.7,max_tokens:3000};
  const routed=turn.route('https://paid-provider.example/v1/chat/completions',body,{tier:'primary',maxRetries:6});
  assert.strictEqual(routed.url,'https://gemini-web.tianming.invalid/v1/chat/completions');
  assert.strictEqual(routed.opts.tier,'geminiweb');
  assert.strictEqual(routed.opts.maxRetries,0);
  assert.strictEqual(routed.body.model,'gemini-3.5-flash-lite');
  assert(!routed.body.response_format);
  assert(typeof routed.body.messages[0].content==='string');
  assert(routed.body.messages[0].content.includes('完整、合法的 JSON'));
  assert(!JSON.stringify(routed).includes('PAID_PRIMARY_KEY'),'do not send paid token in free request');
  await assert.rejects(sandbox._tmAIFetch('https://paid-provider.example/v1/chat/completions',{method:'POST'}),/禁止暗中使用付费 API/);
  assert.strictEqual(charged,0,'blocking must happen before original network transport');
  assert(turn.failed(),'paid route attempt poisons the free turn');
  assert.throws(()=>turn.assertBeforeSave(),/停止写入/);
  turn.end();
  assert(!turn.active());
  // Restart a fresh turn and exercise the real wrapper with a stub network.
  turn.begin();
  const lib=read('tm-ai-infra-retry.js');
  const a=lib.indexOf('async function _aiFetchWithRetry(url, body, signal, opts) {');
  const b=lib.indexOf('async function _aiFetchWithRetryUncached(url, body, signal, opts)',a);
  assert(a>=0&&b>a);
  vm.runInNewContext(lib.slice(a,b),sandbox);
  sandbox._aiFetchWithRetryUncached=async (url,request,signal,opts)=>{
    requested.push({url,request,opts});
    return {choices:[{message:{content:'{"resource_changes":{},"events":[]}'}}]};
  };
  const reply=await sandbox._aiFetchWithRetry('https://paid-provider.example/v1/chat/completions',
    {model:'paid-model',messages:[{role:'user',content:'模拟回合数据'}],response_format:{type:'json_object'}},null,{tier:'primary',maxRetries:6});
  assert(reply.choices[0].message.content.includes('events'));
  assert.strictEqual(requested.length,1);
  assert.strictEqual(requested[0].url,'https://gemini-web.tianming.invalid/v1/chat/completions');
  assert.strictEqual(requested[0].opts.maxRetries,0);
  assert.strictEqual(charged,0);
  // 95 KB end-turn input cap fails CLOSED and poisons commit, rather than
  // silently truncating edicts/history or silently using official API.
  await assert.rejects(sandbox._aiFetchWithRetry('https://paid-provider.example/v1/chat/completions',
    {messages:[{role:'user',content:'朝'.repeat(42000)}]},null,{tier:'primary'}),/最多约 95KB/);
  assert.strictEqual(requested.length,1);
  assert(turn.failed());
  assert.throws(()=>turn.assertBeforeSave(),/停止写入/);
  turn.end();
  sandbox.TM.Endturn.ModeContract.selectedMode=()=> 'agent';
  assert.throws(()=>turn.begin(),/不支持 Agent/);
  sandbox.TM.Endturn.ModeContract.selectedMode=()=> 'llm';
  sandbox.P.conf.geminiWebTurnEnabled=false;
  assert(!turn.selected());
  assert.strictEqual(sandbox._getAITier('primary').key,'PAID_PRIMARY_KEY');
  assert(read('tm-endturn-core.js').includes('TM.GeminiTurn.assertBeforeSave()'),'turn commit owner must assert');
  const infer=read('tm-endturn-ai.js');
  assert(infer.includes("var _freeTurn=global.TM&&TM.GeminiTurn&&TM.GeminiTurn.active();"),'endturn setup must resolve a free virtual URL without a paid key');
  assert(infer.includes("opts.tier='geminiweb'"),'endturn subcall tier must be free');
  assert(infer.includes("key='LOCAL_GEMINI_WEB_NO_API_KEY'"),'no paid key in free subcall');
  assert(infer.includes("!opts.url && opts.id && _SEC_SUBCALLS"),'secondary-model routing must be conditional');
  assert(infer.includes("TM.GeminiTurn.fail('关键 JSON 无法验证"),'invalid JSON must block commit');

  assert(read('tm-endturn-core.js').includes('TM.GeminiTurn.end()'),'turn scope must end in finally');
  assert(read('tm-endturn-ai-infer.js').includes('TM.GeminiTurn.active()'),'keyless inference must not skip AI');
  assert(read('tm-endturn-reliability.js').includes('TM.GeminiTurn.selected()'),'keyless preflight must check required helpers');
  const html=read('index.html');
  assert(html.indexOf('tm-gemini-web-adapter.js')<html.indexOf('tm-gemini-turn.js'),'loader order');
  assert(read('tm-patches.js').includes('s-free-turn'),'separate opt-in UI');
  console.log('[smoke-gemini-web-turn] PASS: routing, no paid leak, JSON, 95KB fail/abort, keyless, agent guard, rollback');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
