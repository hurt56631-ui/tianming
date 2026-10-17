// Keyless Gemini Web desktop bridge: only intercepts a .invalid local virtual endpoint.
(function(global){
'use strict';
var prior = global._tmAIFetch;
if (typeof prior !== 'function') throw new Error('Gemini bridge requires tm-ai-infra-retry');
var HOST='gemini-web.tianming.invalid';
function virtual(url){
  try {var u=new URL(String(url));return u.protocol==='https:'&&u.hostname===HOST&&u.pathname==='/v1/chat/completions';}
  catch(_){return false;}
}
function failure(status,message,retry){
  var headers={'content-type':'application/json'};
  if(status===429)headers['retry-after']=String(Math.max(0,Math.ceil((Number(retry)||0)/1000)));
  return new Response(JSON.stringify({error:{message:String(message),type:'gemini_web'}}),{status:status,headers:headers});
}
global._tmAIFetch=async function(url,options){
  if(!virtual(url))return prior(url,options);
  options=options||{};
  if(options.signal&&options.signal.aborted){var abort=new Error('已取消');abort.name='AbortError';throw abort;}
  var desktop=!!(global.tianming&&global.tianming.isDesktop&&typeof global.tianming.geminiWebChat==='function');
  var mobile=!!(global.TM&&global.TM.GeminiWebMobile&&global.TM.GeminiWebMobile.available());
  if(!desktop&&!mobile)return failure(503,'免费 Gemini Web 仅支持新版 Electron 和安卓 Capacitor App');
  var input;
  try{input=JSON.parse(String(options.body||'{}'));}catch(_){return failure(400,'JSON 输入无效');}
  if(!Array.isArray(input.messages))return failure(400,'缺少 messages');
  if(input.tools&&input.tools.length)return failure(422,'Gemini Web 不支持 Agent 工具调用，请使用正式 API');
  var result;
  try{
    if(desktop)result=await global.tianming.geminiWebChat({messages:input.messages});
    else{var value=await global.TM.GeminiWebMobile.generate({messages:input.messages});result={ok:true,text:value.text,model:value.model};}
  }
  catch(e){
    var code=Number(e&&e.status)||503;
    if([400,403,405,413,422,429].indexOf(code)<0)code=503;
    return failure(code,'Gemini 网页通道失败：'+String(e&&e.message||e).slice(0,120),e&&e.retryAfterMs);
  }
  if(options.signal&&options.signal.aborted){var cancelled=new Error('已取消');cancelled.name='AbortError';throw cancelled;}
  if(!result||result.ok!==true||typeof result.text!=='string'||!result.text.trim()){
    var status=Number(result&&result.status)||503;
    if(![400,403,405,413,422,429,500,502,503,504].includes(status))status=503;
    return failure(status,result&&result.message||'没有可读回复',result&&result.retryAfterMs);
  }
  var id='chatcmpl-gemini-web-local';
  if(input.stream===true){
    var pieces=[
      {id:id,object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:result.text},finish_reason:null}]},
      {id:id,object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}]}
    ];
    var sse=pieces.map(function(p){return 'data: '+JSON.stringify(p)+'\n\n';}).join('')+'data: [DONE]\n\n';
    return new Response(sse,{status:200,headers:{'content-type':'text/event-stream; charset=utf-8'}});
  }
  return new Response(JSON.stringify({id:id,object:'chat.completion',model:result.model||'gemini-3.5-flash-lite',
    choices:[{index:0,message:{role:'assistant',content:result.text},finish_reason:'stop'}]}),
    {status:200,headers:{'content-type':'application/json'}});
};
global.TM=global.TM||{};
global.TM.GeminiWeb={isVirtual:virtual,desktopAvailable:function(){return !!(global.tianming&&global.tianming.isDesktop&&global.tianming.geminiWebChat);},
mobileAvailable:function(){return !!(global.TM.GeminiWebMobile&&global.TM.GeminiWebMobile.available());}};
global._tmNpcDialogueAITier=function(){
  var normal=typeof global._useSecondaryTier==='function'&&global._useSecondaryTier()?'secondary':undefined;
  if(global.P&&global.P.conf&&global.P.conf.geminiWebNpcEnabled===true
     &&!(global.GM&&(global.GM.busy||global.GM._endTurnBusy))
     &&!(global.endTurn&&global.endTurn._preSubmitInFlight))return 'geminiweb';
  return normal;
};
})(window);
