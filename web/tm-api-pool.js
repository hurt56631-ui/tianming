// Experimental multi-API pool. Opt-in only; keys stay in local tm_api_pool,
// never inside game saves or world state. Only OpenAI-compatible chat endpoints.
(function(global) {
'use strict';
var STORE='tm_api_pool', MAX=3, state={cursor:0};
function getStore() {
  try {
    var item=JSON.parse(global.localStorage.getItem(STORE)||'{}');
    var rows=Array.isArray(item.rows)?item.rows.slice(0,MAX):[];
    return {enabled:item.enabled===true, mode:item.mode==='round_robin'?'round_robin':'failover',
      rows:rows.filter(function(r){return r&&typeof r==='object';}).map(function(r){
        return {url:String(r.url||''),model:String(r.model||''),key:String(r.key||'')};
      })};
  } catch(_) { return {enabled:false,mode:'failover',rows:[]}; }
}
function escapeHtml(v) {
  return String(v||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
}
function chatUrl(base) {
  var text=String(base||'').trim().replace(/\/+$/,'');
  var u=new URL(text);
  if(u.protocol!=='https:' && !(u.protocol==='http:'&&/^(localhost|127\.0\.0\.1)$/.test(u.hostname)))
    throw Error('备用 API 只能使用 HTTPS（本机调试地址除外）');
  if(u.username||u.password||u.hash)throw Error('API 地址不能包含账号、密码或锚点');
  if(!/\/chat\/completions$/.test(u.pathname)) {
    if(/\/(?:messages|generateContent)$/.test(u.pathname))throw Error('轮询仅支持 OpenAI 兼容 /chat/completions 接口');
    u.pathname=u.pathname.replace(/\/+$/,'')+'/chat/completions';
  }
  return u.href;
}
function normalize(config) {
  var rows=Array.isArray(config.rows)?config.rows:[];
  if(rows.length>MAX)throw Error('最多配置三个备用 API');
  var saved=[];
  for(var i=0;i<rows.length;i++){
    var row=rows[i]||{},url=String(row.url||'').trim(),model=String(row.model||'').trim(),key=String(row.key||'').trim();
    if(!url&&!model&&!key)continue;
    if(!url||!model||!key)throw Error('备用 API '+(i+1)+' 必须同时填写 URL、Model_ID 和 Key');
    chatUrl(url);
    if(key.length>512||model.length>180||url.length>1800)throw Error('备用 API '+(i+1)+' 配置过长');
    saved.push({url:url,model:model,key:key});
  }
  var mode=config.mode==='round_robin'?'round_robin':'failover';
  if(config.enabled===true&&!saved.length)throw Error('开启轮询前至少配置一个备用 API');
  return {enabled:config.enabled===true,mode:mode,rows:saved};
}
function slotDraft(index,saved) {
  var n=index+1,find=function(field){var el=global.document.getElementById('s-pool-'+n+'-'+field);return el&&String(el.value||'').trim()||'';};
  var url=find('url'),model=find('model'),key=find('key'),prior=saved.rows[index];
  // Avoid reusing a previously stored key for a DIFFERENT destination.
  if(!key&&prior&&url===prior.url)key=prior.key;
  return {url:url,model:model,key:key};
}
function draft() {
  var stored=getStore(),doc=global.document;
  var enabled=doc&&doc.getElementById('s-pool-enabled'),mode=doc&&doc.getElementById('s-pool-mode');
  if(!enabled||!mode)return stored;
  var rows=[];for(var i=0;i<MAX;i++)rows.push(slotDraft(i,stored));
  return normalize({enabled:!!enabled.checked,mode:mode.value,rows:rows});
}
function validateUI(){return draft();}
function saveUI(){
  var cfg=draft();
  try { global.localStorage.setItem(STORE,JSON.stringify(cfg)); }
  catch(_) { throw Error('备用 API 无法保存在本机，请检查存储空间和权限'); }
  state.cursor=0;
  return cfg;
}
function render(){
  var cfg=getStore(),s='<section class="settings-section" style="border-left:3px solid var(--gold);padding:0.55rem;margin-top:0.7rem;">'+
    '<h4>多 API 轮询 / 故障切换（实验）</h4>'+
    '<p style="color:var(--txt-d);">额外最多三个 OpenAI 兼容 API。默认关闭。仅作用于正式主 API 的聊天和回合请求，不影响免费 NPC、次 API、模型查询。调用可能产生费用；切换服务商会把该次提示词发送给对应服务商。不会跨 API 绕过限流或在收到部分内容后重发。</p>'+
    '<label><input type="checkbox" id="s-pool-enabled"'+(cfg.enabled?' checked':'')+'> 启用多个 API</label>'+
    '<select id="s-pool-mode" style="margin-left:0.6rem;">'+
      '<option value="failover"'+(cfg.mode==='failover'?' selected':'')+'>主 API 优先，故障自动切换</option>'+
      '<option value="round_robin"'+(cfg.mode==='round_robin'?' selected':'')+'>每次请求依次轮换</option>'+
    '</select>';
  for(var i=0;i<MAX;i++){
    var c=cfg.rows[i]||{},label=i+1;
    s+='<div style="border-top:1px dashed var(--bdr);padding:0.45rem 0;margin-top:0.35rem;">'+
      '<strong style="">备用 API '+label+'</strong>'+
      '<div class="rw"><div class="fd"><label>HTTPS Base URL</label><input id="s-pool-'+label+'-url" value="'+escapeHtml(c.url)+'" placeholder="https://api.example.com/v1"></div>'+
      '<div class="fd"><label>Model_ID</label><input id="s-pool-'+label+'-model" value="'+escapeHtml(c.model)+'" placeholder="填写此线路专用模型 ID"></div></div>'+
      '<div class="fd"><label>API Key（留空保留同地址现有 Key）</label><input type="password" id="s-pool-'+label+'-key" autocomplete="off" placeholder="'+(c.key?'已保存，留空不改变':'输入该 API 的 Key')+'"></div>'+
      '<button type="button" class="bt bs bsm" onclick="sTestPoolAPI('+i+')">单独测试第 '+label+' 路（会发生一次小额调用）</button>'+
      '<span id="s-pool-'+label+'-status" style="margin-left:0.3rem;"></span></div>';
  }
  return s+'<p style="color:var(--txt-d);">轮换仅发送一次；在网络异常或 502/503/504 且尚未收到有效响应时，最多向另一条线路再试一次。401/403/429 不跨号重试，需尊重服务商限制。Key 只保存在此设备，与主 API 类似，不写入游戏存档。请点击下方“保存所有设置”。</p></section>';
}
function isAborted(signal) {return !!(signal&&signal.aborted);}
function networkFail(err){
  return err && err._tmNativeTransport!==true && err.name!=='AbortError' &&
    /TypeError|Failed to fetch|NetworkError|ECONNRESET|ENOTFOUND|ECONNREFUSED/i.test(String(err.name||'')+' '+String(err.message||''));
}
function route(resource,options,next){
  if(typeof next!=='function')throw Error('API pool transport missing');
  var cfg=getStore(),settings=global.P&&global.P.ai;
  if(!cfg.enabled||!cfg.rows.length||!settings||!settings.key||!settings.url||
      !options||String(options.method||'GET').toUpperCase()!=='POST'||isAborted(options.signal))
    return next(resource,options);
  var target;
  try { target=chatUrl(settings.url); }
  catch(_){return next(resource,options);}
  if(String(resource)!==target||/gemini-web\.tianming\.invalid/.test(String(resource)))return next(resource,options);
  var body,headerKey;
  try {
    body=JSON.parse(String(options.body||''));
    var headers=new Headers(options.headers||{});
    headerKey=headers.get('Authorization');
  }catch(_){return next(resource,options);}
  if(!body||!Array.isArray(body.messages)||!headerKey||headerKey!=='Bearer '+settings.key)
    return next(resource,options);
  // The original primary route is always one candidate; each alternate is
  // chosen explicitly by the user, and no Google login Cookie is transferred.
  var candidates=[{url:target,model:body.model,key:settings.key}].concat(cfg.rows.map(function(r){
    return {url:chatUrl(r.url),model:r.model,key:r.key};
  }));
  var current=cfg.mode==='round_robin' ? (state.cursor++%candidates.length) : 0;
  function send(index) {
    var pick=candidates[index],h=new Headers(options.headers||{});
    h.set('Authorization','Bearer '+pick.key);
    var payload=Object.assign({},body,{model:pick.model});
    return next(pick.url,Object.assign({},options,{headers:h,body:JSON.stringify(payload)}));
  }
  return (async function(){
    var res;
    try {res=await send(current);}
    catch(e) {
      if(isAborted(options.signal)||!networkFail(e)||candidates.length<=1)throw e;
      console.warn('[API pool] 主线路未建立连接，尝试其他已配置线路');
      return send((current+1)%candidates.length);
    }
    // No retries on auth errors, rate limits, or after HTTP 200 (including SSE).
    if(res && [502,503,504].indexOf(Number(res.status))>=0 && candidates.length>1 &&
       !isAborted(options.signal)) {
      try{if(res.body&&typeof res.body.cancel==='function')await res.body.cancel();}catch(_){}
      console.warn('[API pool] 线路 '+Number(res.status)+'，自动切换下一条已配置 API');
      return send((current+1)%candidates.length);
    }
    return res;
  })();
}
async function testSlot(i){
  var idx=Number(i),stored=getStore(),row=slotDraft(idx,stored);
  if(!Number.isInteger(idx)||idx<0||idx>=MAX)throw Error('备用线路编号无效');
  if(!row.url||!row.model||!row.key)throw Error('此备用线路未完整配置');
  normalize({enabled:true,rows:[row]});
  var endpoint=chatUrl(row.url),body={model:row.model,messages:[{role:'user',content:'只回答：正常'}],max_tokens:16,stream:false};
  // Bypass round-robin: test EXACTLY this configured endpoint once.
  var fetcher=typeof global._tmAIFetchDirect==='function'?global._tmAIFetchDirect:global.fetch;
  var res=await fetcher(endpoint,{method:'POST',headers:{Authorization:'Bearer '+row.key,'Content-Type':'application/json'},
    body:JSON.stringify(body),timeoutMs:12000});
  if(!res.ok)throw Error('HTTP '+res.status);
  var data=await res.json();
  if(!data||!data.choices||!data.choices[0]||!data.choices[0].message)throw Error('模型没有返回有效内容');
  return '成功';
}
global.TM=global.TM||{};
global.TM.APIPool={render:render,route:route,get:getStore,validateUI:validateUI,saveUI:saveUI,testSlot:testSlot,
  chatUrl:chatUrl,normalize:normalize,_reset:function(){state.cursor=0;}};
global.sTestPoolAPI=async function(i){
  var el=global.document.getElementById('s-pool-'+(i+1)+'-status');
  if(el)el.textContent='正在测试…';
  try{var msg=await testSlot(i);if(el)el.textContent=msg;}
  catch(e){if(el)el.textContent='失败：'+String(e&&e.message||e).slice(0,90);}
};
})(window);
