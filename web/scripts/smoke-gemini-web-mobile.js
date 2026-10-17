'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
function sample(text){const p=Array(5).fill(null);p[4]=[[null,[text]]];return ")]}'\n"+JSON.stringify([['wrb.fr','',JSON.stringify(p)]])+'\n';}
async function main(){
  const source=fs.readFileSync(path.join(__dirname,'../tm-gemini-web-mobile.js'),'utf8');
  const ctx={console,URLSearchParams,TextEncoder,Uint8Array,Response,setTimeout,Promise,Date,
    Capacitor:{isNativePlatform:()=>true},crypto:{randomUUID:()=> '125891fe-d605-42e8-89a4-999a6303d001'},
    _tmAIFetch:async()=>new Response('unused'),TM:{}};
  ctx.window=ctx;
  vm.runInNewContext(source,ctx,{filename:'tm-gemini-web-mobile.js'});
  const m=ctx.TM.GeminiWebMobile;
  assert.strictEqual(m.available(),true);
  const w=m.wire('你好','boq_gemini-web-uiserver_20261007.01_p0',1792250000000,()=>ctx.crypto.randomUUID());
  const fields=JSON.parse(new URLSearchParams(w.body).get('f.req'));
  const inner=JSON.parse(fields[1]);
  const header=JSON.parse(w.headers['x-goog-ext-525001261-jspb']);
  assert.strictEqual(header[4],'cf41b0e0dd7d53e5');
  assert.strictEqual(header[14],6);
  assert.strictEqual(inner[79],6);
  assert(!('Cookie' in w.headers)&&!('Authorization' in w.headers));
  assert.strictEqual(m.extract(sample('朕已收到。')),'朕已收到。');
  const bl='boq_gemini-web-uiserver_20261007.01_p0';
  let calls=[];
  const t=m.createTransport({now:()=>1792250000000,uuid:()=>ctx.crypto.randomUUID(),delay:async()=>{},
    request:async(url,options)=>{
      calls.push({url,options});
      if(url.endsWith('/app'))return new Response('"'+bl+'"',{status:200,headers:{'content-type':'text/html'}});
      return new Response(sample('你好，陛下。'),{status:200,headers:{'content-type':'text/plain'}});
    }
  });
  const r=await t.generate({messages:[{role:'user',content:'自然现代白话'}]});
  assert.strictEqual(r.model,'gemini-3.5-flash-lite');
  assert.strictEqual(r.text,'你好，陛下。');
  assert.strictEqual(calls.length,2);
  assert(JSON.parse(new URLSearchParams(calls[1].options.body).get('f.req'))[1].includes('现代白话'));
  let deniedCount=0;
  const limited=m.createTransport({now:()=>1792250000000,delay:async()=>{},request:async url=>{
    deniedCount++;
    return url.endsWith('/app')?new Response(bl,{status:200}):new Response('',{status:429,headers:{'retry-after':'120'}});
  }});
  await assert.rejects(limited.generate({messages:[{role:'user',content:'a'}]}),/限流/);
  const after=deniedCount;
  await assert.rejects(limited.generate({messages:[{role:'user',content:'b'}]}),/限流/);
  assert.strictEqual(deniedCount,after,'429 cooldown must prevent additional upstream traffic');
  await assert.rejects(t.generate({messages:[{role:'user',content:'中'.repeat(35000)}]}),/95KB/);
  await assert.rejects(t.generate({messages:[{role:'user',content:'x'}],tools:[{}]}),/Agent/);
  // Integration: virtual OpenAI endpoint -> Android adapter -> native HTTP -> Gemini frames.
  let nativeCalls=0;
  ctx._tmAIFetch=async function(url){
    nativeCalls++;
    return url.endsWith('/app')
      ? new Response('"'+bl+'"',{status:200,headers:{'content-type':'text/html'}})
      : new Response(sample('安卓已连通。'),{status:200,headers:{'content-type':'text/plain'}});
  };
  const adapter=fs.readFileSync(path.join(__dirname,'../tm-gemini-web-adapter.js'),'utf8');
  vm.runInNewContext(adapter,ctx,{filename:'tm-gemini-web-adapter.js'});
  const response=await ctx._tmAIFetch('https://gemini-web.tianming.invalid/v1/chat/completions',
    {body:JSON.stringify({messages:[{role:'user',content:'你好'}]})});
  assert.strictEqual(response.status,200,'mobile virtual endpoint should return ChatCompletion JSON');
  assert.strictEqual((await response.json()).choices[0].message.content,'安卓已连通。');
  assert.strictEqual(nativeCalls,2,'native upstream should see 1 GET + 1 POST without recursive loops');
  ctx.Capacitor={isNativePlatform:()=>false};
  assert.strictEqual(m.available(),false);
  await assert.rejects(m.generate({messages:[{role:'user',content:'x'}]}),/安卓/);
  console.log('[smoke-gemini-web-mobile] PASS: 3.5, wire, anonymous, native, 429, size, tool, non-mobile');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
