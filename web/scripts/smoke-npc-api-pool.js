'use strict';
// Standalone Node fixture: no real keys, no outbound internet or billable API.
const assert=require('assert'),vm=require('vm'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function loadPool(){
  const state=new Map();
  const localStorage={getItem:k=>state.get(k)||null,setItem:(k,v)=>{state.set(k,String(v));},removeItem:k=>state.delete(k)};
  const ctx={TM:{},Headers,URL,Response,console,localStorage,
    P:{ai:{url:'https://generativelanguage.googleapis.com/v1beta/openai',
      key:'PRIMARY_SECRET',model:'gemini-primary',
      secondary:{url:'https://secondary.example/v1',key:'SECONDARY_SECRET',model:'sec-model'}},
      conf:{geminiWebNpcEnabled:true}}};
  ctx.window=ctx;ctx.globalThis=ctx;
  vm.runInNewContext(read('tm-api-pool.js'),ctx,{filename:'tm-api-pool.js'});
  return {ctx,store:state,pool:ctx.TM.APIPool};
}
const post=(url='https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',key='PRIMARY_SECRET',model='gemini-primary')=>({
  url,options:{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({model,messages:[{role:'user',content:'测试'}],stream:false})}
});
const r=(status,body='{}')=>new Response(body,{status});
async function main(){
  const {ctx,store,pool}=loadPool();
  assert(!store.has('tm_api_pool'),'pool disabled until explicitly enabled');
  assert.equal(pool.chatUrl('https://generativelanguage.googleapis.com/v1beta/openai'),
    'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.throws(()=>pool.chatUrl('http://untrusted.example/v1'),/HTTPS/);
  assert.throws(()=>pool.chatUrl('https://secret:password@example.com/v1'),/账号/);
  assert.throws(()=>pool.normalize({enabled:true,rows:[]}),/至少/);
  const conf=pool.normalize({enabled:true,mode:'failover',rows:[
    {url:'https://backup-a.example/v1',key:'BACKUP_SECRET_A',model:'backup-model'},
    {url:'https://backup-b.example/v1',key:'BACKUP_SECRET_B',model:'backup-model-b'}
  ]});
  const p=post();
  let count=0;
  const off=await pool.route(p.url,p.options,async()=>{count++;return r(503);});
  assert.equal(off.status,503);assert.equal(count,1,'disabled => single original request');
  store.set('tm_api_pool',JSON.stringify(conf));
  const calls=[];
  const direct=async(url,opts)=>{
    calls.push({url,authorization:new Headers(opts.headers).get('Authorization'),body:JSON.parse(opts.body)});
    return r(calls.length===1?503:200);
  };
  let res=await pool.route(p.url,p.options,direct);
  assert.equal(res.status,200);assert.equal(calls.length,2,'one immediate failover');
  assert.equal(calls[0].url,p.url);assert.equal(calls[1].url,'https://backup-a.example/v1/chat/completions');
  assert.equal(calls[0].authorization,'Bearer PRIMARY_SECRET');
  assert.equal(calls[1].authorization,'Bearer BACKUP_SECRET_A');
  assert.equal(calls[1].body.model,'backup-model');
  assert.equal(ctx.P.ai.key,'PRIMARY_SECRET','primary key never overwritten');
  assert.equal(ctx.P.ai.secondary.key,'SECONDARY_SECRET','secondary not overwritten');
  for(const status of [400,401,403,404,429]){
    let n=0;res=await pool.route(p.url,p.options,async()=>{n++;return r(status);});
    assert.equal(res.status,status);assert.equal(n,1,'no automatic key switching for HTTP '+status);
  }
  let n=0;
  res=await pool.route(p.url,p.options,async()=>{n++;return r(200,'event-stream');});
  assert.equal(res.status,200);assert.equal(n,1,'no replay after 200 or partial stream');
  n=0;res=await pool.route(p.url,{...p.options,method:'GET'},async()=>{n++;return r(503);});
  assert.equal(n,1,'model discovery GET not pooled');
  n=0;res=await pool.route('https://secondary.example/v1/chat/completions',
    post('https://secondary.example/v1/chat/completions','SECONDARY_SECRET','sec-model').options,
    async()=>{n++;return r(503);});
  assert.equal(n,1,'independent secondary not routed through main pool');
  n=0;res=await pool.route('https://gemini-web.tianming.invalid/v1/chat/completions',
    post('https://gemini-web.tianming.invalid/v1/chat/completions','LOCAL_GEMINI_WEB_NO_API_KEY','free').options,
    async()=>{n++;return r(503);});
  assert.equal(n,1,'NPC free Gemini transport stays independent');
  n=0;
  await assert.rejects(pool.route(p.url,p.options,async()=>{n++;throw Object.assign(new Error('AI native failed'),{_tmNativeTransport:true});}),/native failed/);
  assert.equal(n,1,'native uncertain delivery never replays');
  n=0;res=await pool.route(p.url,p.options,async()=>{n++;if(n===1)throw new TypeError('Failed to fetch');return r(200);});
  assert.equal(res.status,200);assert.equal(n,2,'one failover on pre-header browser network failure');
  const ctrl=new AbortController();ctrl.abort();
  n=0;await pool.route(p.url,{...p.options,signal:ctrl.signal},async()=>{n++;return r(503);});
  assert.equal(n,1,'already aborted request does not pool');
  store.set('tm_api_pool',JSON.stringify({...conf,mode:'round_robin'}));pool._reset();
  const first=[],second=[];
  await pool.route(p.url,p.options,async(url,opts)=>{first.push(url);return r(200)});
  await pool.route(p.url,p.options,async(url,opts)=>{second.push(url);return r(200)});
  assert.equal(first[0],p.url);assert.equal(second[0],'https://backup-a.example/v1/chat/completions');
  assert(!pool.render().includes('BACKUP_SECRET_A'),'render must never echo stored keys');
  assert(!pool.render().includes('PRIMARY_SECRET'),'render must never echo primary key');
  assert(!read('tm-utils.js').includes('tm_api_pool'),'game save scrub must not serialize the local private store');
  const src=read('tm-ai-infra-retry.js');
  assert(src.includes('async function _tmAIFetchDirect(resource, options)'), 'native transport retained');
  assert(src.includes('pool.route(resource,options,_tmAIFetchDirect)'), 'pool wraps actual HTTP transport');
  assert(read('tm-wendui.js').includes("P.conf&&P.conf.geminiWebNpcEnabled"),'NPC chat should work with no main API key');
  assert(read('tm-wendui.js').includes("人物 AI 暂时无法回复："),'NPC error must stay visible');
  assert(read('tm-gemini-web-adapter.js').includes("geminiWebNpcFallbackPrimary===true"),'paid NPC fallback must be opt-in only');
  assert(read('index.html').includes('tm-api-pool.js')&&read('index.html').includes('tm-npc-speech.js'),'both modules are loaded by mobile and desktop');
  const speechCtx={TM:{},console};speechCtx.window=speechCtx;
  vm.runInNewContext(read('tm-npc-speech.js'),speechCtx);
  const old='陛下政务倥偬，日夜操劳，臣妾虽居后宫，亦深感忧心。臣妾近来在宫中常亲操针黹，也算略尽绵薄之力。陛下要珍重龙体，莫要过于操劳，若陛下有空，不妨小憩片刻，朝堂上乾纲独断。';
  const speech=speechCtx.TM.NPCSpeech.clean(old,{consort:true});
  for(const phrase of ['倥偬','臣妾','针黹','绵薄','龙体','莫要','小憩','乾纲'])assert(!speech.includes(phrase),'archaic residue '+phrase);
  assert(speech.includes('我')&&speech.includes('政务繁忙')&&speech.includes('休息一会儿'),'meaningful modern output preserved');
  assert.equal(speechCtx.TM.NPCSpeech.clean(speech,{consort:true}),speech,'repeat render idempotent');
  assert(speechCtx.TM.NPCSpeech.hint(true,true).includes('夫妻'),'spouse modern voice enforced');
  console.log('[smoke-npc-api-pool] PASS pool/keys/paid opt-in/failover/no rate-limit bypass/modern queen/dialogue-error');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
