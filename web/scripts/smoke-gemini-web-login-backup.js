'use strict';
// Simulated cross-platform Gemini Web anonymous -> signed-in self-hosted gateway,
// no Google credentials in the game and no paid primary API fallback.
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const WEB=path.resolve(__dirname,'..');
function read(name){return fs.readFileSync(path.join(WEB,name),'utf8');}
function ctxForTest(){
  const local=new Map(),outbound=[];
  let anon='denied',gateway='ok';
  const ctx={
    URL,Response,TextEncoder,AbortController,console,Uint8Array,
    TM:{},P:{conf:{geminiWebNpcEnabled:true},ai:{key:'PAID_PRIMARY_KEY'}},GM:{busy:false},
    localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
    tianming:{isDesktop:true,geminiWebChat:async()=>anon==='denied'
      ?{ok:false,status:403,message:'Anonymous blocked'}
      :anon==='rate'?{ok:false,status:429,message:'Anonymous rate-limited'}
      :{ok:true,text:'匿名正常',model:'gemini-3.5-flash-lite'}},
    _tmAIFetch:async function(url,options){
      outbound.push({url,options});
      if(gateway==='unauthorized')return new Response(JSON.stringify({error:{message:'invalid'}}),{status:401});
      if(gateway==='unavailable')return new Response('unavailable',{status:503});
      return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:'已登录网关回答'}}]}),
        {status:200,headers:{'content-type':'application/json'}});
    }
  };
  ctx.window=ctx;
  vm.runInNewContext(read('tm-gemini-login-backup.js'),ctx);
  vm.runInNewContext(read('tm-gemini-web-adapter.js'),ctx);
  const original=ctx._tmAIFetch;
  ctx._tmAIFetch=function(url,opts){
    const hook=ctx.TM.AITransportHooks.geminiWeb(url,opts);
    return hook==null?original(url,opts):hook;
  };
  return {ctx,local,outbound,setAnon:x=>anon=x,setGateway:x=>gateway=x};
}
async function main(){
  const {ctx,local,outbound,setAnon,setGateway}=ctxForTest();
  const backup=ctx.TM.GeminiLoginBackup;
  const URL_VIRTUAL='https://gemini-web.tianming.invalid/v1/chat/completions';
  const sample={messages:[{role:'user',content:'陛下请问'}]};
  const send=opts=>ctx._tmAIFetch(URL_VIRTUAL,Object.assign({body:JSON.stringify(sample)},opts||{}));
  assert(!backup.configured(),'backup must start off, never on by default');
  const without=await send();
  assert.strictEqual(without.status,403);
  assert.strictEqual(outbound.length,0,'without opt-in must not contact gateway');
  for(const bad of ['http://public.example/v1','https://gemini.google.com/app',
    'https://accounts.google.com/v1','https://google.com/v1',
    'https://gemini.google.com./v1','https://generativelanguage.googleapis.com/v1',
    'https://example.com/v1?key=secret']) {
    assert.throws(()=>backup.save({enabled:true,url:bad,apiKey:'KEY'}),/HTTPS|不是 Google|无查询参数/);
  }
  backup.save({enabled:true,url:'https://my-private-relay.example/v1',apiKey:'SCOPED_GATEWAY_KEY',
    model:'gemini-3.5-flash-lite'});
  assert(backup.configured());
  assert(!JSON.stringify(backup.summary()).includes('SCOPED_GATEWAY_KEY'),'settings must never echo gateway key');
  assert.strictEqual(ctx.P.ai.key,'PAID_PRIMARY_KEY','formal turn key must not change');
  setAnon('ok');
  const stillAnon=await send();
  assert.strictEqual((await stillAnon.json()).choices[0].message.content,'匿名正常');
  assert.strictEqual(outbound.length,0,'anonymous success never uses gateway');
  assert.strictEqual(backup.summary().lastRoute,'anonymous','anonymous success should identify its real route');
  setAnon('denied');
  const result=await send();
  assert.strictEqual((await result.json()).choices[0].message.content,'已登录网关回答');
  assert.strictEqual(outbound.length,1,'only one fallback request');
  assert.strictEqual(backup.summary().lastRoute,'login-gateway','fallback response should identify its real route');
  assert.strictEqual(outbound[0].url,'https://my-private-relay.example/v1/chat/completions');
  assert.strictEqual(outbound[0].options.headers.Authorization,'Bearer SCOPED_GATEWAY_KEY');
  assert(!outbound[0].options.headers.Cookie && !outbound[0].options.headers['X-Goog-AuthUser'],
    'Google credentials may not enter the app');
  assert.strictEqual(JSON.parse(outbound[0].options.body).model,'gemini-3.5-flash-lite');
  const sse=await ctx._tmAIFetch(URL_VIRTUAL,{body:JSON.stringify(Object.assign({},sample,{stream:true}))});
  assert((await sse.text()).includes('data: [DONE]'),'stream compatibility');
  const countBeforeAbort=outbound.length;
  const aborter=new AbortController();
  aborter.abort();
  await assert.rejects(send({signal:aborter.signal}),/取消|aborted/i);
  assert.strictEqual(outbound.length,countBeforeAbort,'cancelled call cannot send credentials');
  setGateway('unauthorized');
  const denied=await send();
  assert.strictEqual(denied.status,401,'wrong scoped key is not hidden');
  const countAfterDenied=outbound.length;
  const cooldown=await send();
  assert.strictEqual(cooldown.status,429,'gateway auth failure should cool down');
  assert.strictEqual(outbound.length,countAfterDenied);
  backup.clear();
  assert(!backup.configured());
  assert.strictEqual(local.size,0,'clear removes local API key and URL');
  const noBackup=await send();
  assert.strictEqual(noBackup.status,403);
  assert.strictEqual(outbound.length,countAfterDenied,'no post-clear relay traffic');
  // On older Electron (or a web browser), the optional HTTPS gateway still works
  // even if the unofficial anonymous native bridge has not been installed yet.
  const old={...ctx.tianming};
  ctx.tianming={isDesktop:false};
  const missingBridge=(await send());
  assert.strictEqual(missingBridge.status,503,'no gateway configured must fail closed on unsupported platform');
  ctx.tianming=old;
  assert.strictEqual(ctx.P.ai.key,'PAID_PRIMARY_KEY');
  const index=read('index.html');
  assert(index.indexOf('tm-gemini-login-backup.js')<index.indexOf('tm-gemini-web-adapter.js'),
    'load capture of original fetch before free adapter');
  assert(!read('tm-endturn-core.js').includes('GeminiLoginBackup'),'formal turn must not reference NPC fallback');
  console.log('[smoke-gemini-web-login-backup] PASS: opt-in, HTTPS/key isolation, no paid fallback, failover, SSE, 401 cooldown, abort and clear');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
