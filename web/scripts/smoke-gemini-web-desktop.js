'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const {createGeminiWebTransport,wire,frameText}=require('../../main-gemini-web');
function frame(text){const p=Array(5).fill(null);p[4]=[[null,[text]]];return ")]}'\n"+JSON.stringify([['wrb.fr','',JSON.stringify(p)]])+'\n';}
async function run(){
  const w=wire('你好','boq_assistant-bard-web-server_20261017.01_p0',1000000000,()=> '00000000-0000-4000-8000-000000000001');
  assert(w.url.startsWith('https://gemini.google.com/'));
  assert(!('Cookie' in w.options.headers)&&!('Authorization' in w.options.headers));
  assert.strictEqual(JSON.parse(w.options.headers['x-goog-ext-525001261-jspb'])[4], 'cf41b0e0dd7d53e5');
  assert.strictEqual(JSON.parse(w.options.headers['x-goog-ext-525001261-jspb'])[14], 6);
  const inPayload=JSON.parse(JSON.parse(new URLSearchParams(w.options.body).get('f.req'))[1]);
  assert.strictEqual(inPayload[79],6);
  assert.strictEqual(frameText(frame('天命已收到。')),'天命已收到。');
  let calls=[];
  const bl='boq_assistant-bard-web-server_20261017.01_p0';
  const fetchImpl=async (url,opts)=>{calls.push({url,opts});return url.endsWith('/app')
    ?new Response('"'+bl+'"',{status:200,headers:{'content-type':'text/html'}})
    :new Response(frame('臣愿意议和。'),{status:200,headers:{'content-type':'application/json'}});};
  const bridge=createGeminiWebTransport({fetchImpl,now:()=>1792250000000});
  const res=await bridge.generate({messages:[{role:'system',content:'你是史官'},{role:'user',content:'议和'}]});
  assert.strictEqual(res.text,'臣愿意议和。');
  assert.strictEqual(calls.length,2);
  // Prefer explicit cfb2h field when an older build marker also appears in HTML.
  const tagged='boq_gemini-web-uiserver_20261017.02_p0';
  const buildCalls=[];
  const taggedBridge=createGeminiWebTransport({fetchImpl:async(url,opts)=>{
    buildCalls.push({url,opts});
    return url.endsWith('/app')
      ? new Response('"'+bl+'" data-old; {"cfb2h":"'+tagged+'"}',{status:200})
      : new Response(frame('版本选择正确。'),{status:200});
  },now:()=>1792250000000});
  assert.strictEqual((await taggedBridge.generate({messages:[{role:'user',content:'hi'}]})).text,'版本选择正确。');
  assert(buildCalls[1].url.includes('bl='+encodeURIComponent(tagged)),'cfb2h must take priority');
  // A failed HTML lookup is cached so two NPC messages do not create two extra GETs.
  let missingBuildGets=0;
  const fallback=createGeminiWebTransport({now:()=>1792250000000,fetchImpl:async url=>
    url.endsWith('/app')
      ? (missingBuildGets++,new Response('no build marker',{status:200}))
      : new Response(frame('备用版本可用。'),{status:200})
  });
  await fallback.generate({messages:[{role:'user',content:'甲'}]});
  await fallback.generate({messages:[{role:'user',content:'乙'}]});
  assert.strictEqual(missingBuildGets,1,'failed HTML lookups should be throttled');
  let redirectedCalls=0;
  const redirected=createGeminiWebTransport({now:()=>1792250000000,fetchImpl:async()=>{
    redirectedCalls++;return new Response(null,{status:302,headers:{Location:'https://accounts.google.com/'}});
  }});
  await assert.rejects(redirected.generate({messages:[{role:'user',content:'甲'}]}),/登录验证/);
  await assert.rejects(redirected.generate({messages:[{role:'user',content:'乙'}]}),/限流/);
  assert.strictEqual(redirectedCalls,1,'redirects must cool down before next request');
  assert(JSON.parse(new URLSearchParams(calls[1].opts.body).get('f.req'))[1].includes('议和'));
  let limitedCalls=0;
  const limited=createGeminiWebTransport({now:()=>1792250000000,fetchImpl:async(url)=>{
    limitedCalls++;return url.endsWith('/app')?new Response(bl,{status:200}):new Response('',{status:429,headers:{'retry-after':'120'}});
  }});
  await assert.rejects(limited.generate({messages:[{role:'user',content:'a'}]}),/限流/);
  const after=limitedCalls;
  await assert.rejects(limited.generate({messages:[{role:'user',content:'b'}]}),/限流/);
  assert.strictEqual(limitedCalls,after);
  await assert.rejects(bridge.generate({messages:[{role:'user',content:'x'.repeat(100000)}]}),/95KB/);
  const script=fs.readFileSync(path.join(__dirname,'../tm-gemini-web-adapter.js'),'utf8');
  let native=0;
  const context={Response,URL,console,_tmAIFetch:async()=>{native++;return new Response('native');},
    tianming:{isDesktop:true,geminiWebChat:async()=>({ok:true,text:'皇上，可以议和。'})},TM:{}};
  context.window=context;
  vm.runInNewContext(script,context,{filename:'tm-gemini-web-adapter.js'});
  // Real tm-ai-infra-retry owns _tmAIFetch and invokes AITransportHooks.
  // This fixture stubs the transport, so explicitly mirror that hook dispatch.
  const networkFetch=context._tmAIFetch;
  context._tmAIFetch=async function(url,opts){
    const hook=context.TM.AITransportHooks.geminiWeb(url,opts);
    return hook==null?networkFetch(url,opts):hook;
  };
  const fake='https://gemini-web.tianming.invalid/v1/chat/completions';
  const a=await context._tmAIFetch(fake,{body:JSON.stringify({messages:[{role:'user',content:'议和'}]})});
  assert.strictEqual((await a.json()).choices[0].message.content,'皇上，可以议和。');
  const b=await context._tmAIFetch(fake,{body:JSON.stringify({stream:true,messages:[{role:'user',content:'议和'}]})});
  assert((await b.text()).includes('[DONE]'));
  const c=await context._tmAIFetch(fake,{body:JSON.stringify({tools:[{type:'function'}],messages:[{role:'user',content:'a'}]})});
  assert.strictEqual(c.status,422);
  await context._tmAIFetch('https://api.deepseek.com/v1/chat/completions');
  assert.strictEqual(native,1);
  context.tianming={isDesktop:false};
  const d=await context._tmAIFetch(fake,{body:JSON.stringify({messages:[]})});
  assert.strictEqual(d.status,503);
  console.log('[smoke-gemini-web-desktop] PASS');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
