'use strict';
// Free Gemini Web remains NPC-only; no full endturn path may hijack paid keys.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
async function main(){
  const code=read('tm-utils.js'),a=code.indexOf('function _getAITier(tier) {'),b=code.indexOf('// 存档脱敏',a);
  assert(a>=0&&b>a,'AI tier accessor located');
  const scene={
    P:{ai:{url:'https://generativelanguage.googleapis.com/v1beta/openai',
      key:'GOOGLE_OFFICIAL_KEY',model:'gemini-3.8-flash',
      secondary:{url:'https://relay.example/v1',key:'SECONDARY_KEY',model:'fast-model'}},
      conf:{geminiWebNpcEnabled:true,geminiWebTurnEnabled:true}},
    GM:{busy:true,_endTurnBusy:true},_tmFreeGeminiTurnActive:true
  };
  scene.globalThis=scene;vm.runInNewContext(code.slice(a,b),scene);
  assert.equal(scene._getAITier('primary').key,'GOOGLE_OFFICIAL_KEY');
  assert.equal(scene._getAITier('secondary').key,'SECONDARY_KEY');
  assert.equal(scene._getAITier().key,'GOOGLE_OFFICIAL_KEY');
  assert.equal(scene._getAITier('geminiweb').key,'LOCAL_GEMINI_WEB_NO_API_KEY');
  const core=read('tm-endturn-core.js'),ai=read('tm-endturn-ai.js'),retry=read('tm-ai-infra-retry.js');
  const ui=read('tm-patches.js'),html=read('index.html');
  for(const [name,s]of [['core',core],['ai',ai],['retry',retry],
    ['infer',read('tm-endturn-ai-infer.js')],['reliability',read('tm-endturn-reliability.js')],
    ['adapter',read('tm-gemini-web-adapter.js')],['utils',code]])
    assert(!/GeminiTurn|_tmFreeGeminiTurnActive/.test(s),name+' still references retired free full-turn routing');
  assert(core.includes('/gemini-web\\.tianming\\.invalid/'),'endturn must reject a virtual main API');
  assert(ui.includes('delete P.conf.geminiWebTurnEnabled'),'old experimental toggle must be removed when settings are saved');
  assert(!/s-free-turn|sTestGeminiWebTurn/.test(ui),'free endturn UI and test must disappear');
  assert(!/tm-gemini-turn\.js/.test(html),'free endturn module must not load');
  assert(!fs.existsSync(path.join(root,'tm-gemini-turn.js')),'free endturn module must be removed');
  const ctx={console,Response,URL,TM:{},P:{conf:{geminiWebNpcEnabled:true}},
    GM:{busy:false},_tmAIFetch:async()=>new Response('official network')};
  ctx.window=ctx;vm.runInNewContext(read('tm-gemini-web-adapter.js'),ctx);
  assert.equal(ctx._tmNpcDialogueAITier(),'geminiweb','free NPC must continue working');
  assert.equal(ctx.TM.AITransportHooks.geminiWeb('https://generativelanguage.googleapis.com/v1beta/models',{method:'GET'}),null,'Google official model GET must not be intercepted');
  ctx.GM.busy=true;
  assert.equal(ctx._tmNpcDialogueAITier(),undefined,'no free NPC during a turn');
  console.log('[smoke-gemini-web-turn] PASS official key for endturn, old flags inert, NPC still free');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
