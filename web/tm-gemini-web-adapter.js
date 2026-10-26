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
async function _geminiVirtualResponse(url,options){
  options=options||{};
  if(options.signal&&options.signal.aborted){var abort=new Error('已取消');abort.name='AbortError';throw abort;}
  var desktop=!!(global.tianming&&global.tianming.isDesktop&&typeof global.tianming.geminiWebChat==='function');
  var mobile=!!(global.TM&&global.TM.GeminiWebMobile&&global.TM.GeminiWebMobile.available());
  var input;
  try{input=JSON.parse(String(options.body||'{}'));}catch(_){return failure(400,'JSON 输入无效');}
  if(!Array.isArray(input.messages))return failure(400,'缺少 messages');
  if(input.tools&&input.tools.length)return failure(422,'Gemini Web 不支持 Agent 工具调用，请使用正式 API');
  var result;
  try{
    if(desktop)result=await global.tianming.geminiWebChat({messages:input.messages});
    else if(mobile){var value=await global.TM.GeminiWebMobile.generate({messages:input.messages,signal:options.signal});result={ok:true,text:value.text,model:value.model};}
    else result={ok:false,status:503,message:'当前平台没有匿名网页桥接；若已配置登录态网关，将尝试备用'};
  }
  catch(e){
    if((options.signal&&options.signal.aborted)||(e&&(e.code==='AI_ABORTED'||e.name==='AbortError'))){
      var aborted=new Error('Gemini 人物对话已取消');aborted.name='AbortError';aborted.code='AI_ABORTED';throw aborted;
    }
    var code=Number(e&&e.status)||503;
    result={ok:false,status:code,message:'匿名 Gemini 网页失败：'+String(e&&e.message||e).slice(0,110),
      retryAfterMs:e&&e.retryAfterMs};
  }
  if(options.signal&&options.signal.aborted){var cancelled=new Error('已取消');cancelled.name='AbortError';throw cancelled;}
  if(!result||result.ok!==true||typeof result.text!=='string'||!result.text.trim()){
    var status=Number(result&&result.status)||503;
    var loginBackup=global.TM&&global.TM.GeminiLoginBackup;
    if(loginBackup&&loginBackup.configured()&&loginBackup.canFallback(status)) {
      try{
        var signed=await loginBackup.tryReply(input.messages,{signal:options.signal,
          maxTokens:input.max_tokens||input.max_completion_tokens,tools:input.tools});
        result={ok:true,text:signed.text,model:signed.model,route:'login-gateway'};
      }catch(backupErr){
        if(backupErr&&(backupErr.code==='AI_ABORTED'||backupErr.name==='AbortError'))throw backupErr;
        var backupStatus=Number(backupErr&&backupErr.status)||503;
        return failure(backupStatus,'匿名失败；'+String(backupErr&&backupErr.message||'登录态备用失败').slice(0,130));
      }
    } else {
      if(![400,401,403,405,413,422,429,500,502,503,504].includes(status))status=503;
      return failure(status,result&&result.message||'匿名 Gemini 没有可读回复',result&&result.retryAfterMs);
    }
  }
  if(result.route !== 'login-gateway' && global.TM && global.TM.GeminiLoginBackup &&
     typeof global.TM.GeminiLoginBackup.markAnonymous === 'function')global.TM.GeminiLoginBackup.markAnonymous();
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
}
global.TM=global.TM||{};
global.TM.AITransportHooks=global.TM.AITransportHooks||{};
global.TM.AITransportHooks.geminiWeb=function(url,options){
  if(!virtual(url))return null;
  return _geminiVirtualResponse(url,options);
};
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
