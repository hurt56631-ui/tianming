// Tianming: opt-in authenticated Google Gemini Web gateway fallback for NPC dialogue.
// Google session cookies and password stay ONLY in the user's own gateway, never in the game.
// No shared account, no automatic paid-API routing, no account/IP cycling.
(function (g) {
  'use strict';
  var STORAGE = 'tm_gemini_login_backup_v1';
  var nativeFetch = g._tmAIFetch; // Capture before the virtual Gemini Web adapter is installed.
  if (typeof nativeFetch !== 'function') throw new Error('Gemini login backup must load after AI transport');
  var blockedUntil = 0, inFlight = 0, lastRoute = 'anonymous';
  function fail(message, status, code) {
    var err = new Error(message); err.status = status || 503; err.code = code || 'GEMINI_LOGIN_BACKUP'; return err;
  }
  function load() {
    try {
      var raw = JSON.parse(g.localStorage.getItem(STORAGE) || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      return raw;
    } catch (_) { return {}; }
  }
  function summary() {
    var saved = load();
    return {
      enabled: saved.enabled === true,
      url: typeof saved.url === 'string' ? saved.url : '',
      model: typeof saved.model === 'string' ? saved.model : 'gemini-3.5-flash-lite',
      hasKey: typeof saved.apiKey === 'string' && saved.apiKey.length > 0,
      lastRoute: lastRoute
    };
  }
  function normalize(draft, previous) {
    draft = draft || {};
    previous = previous || {};
    var rawUrl = String(draft.url || '').trim(), parsed;
    if (!rawUrl) throw fail('请填写你自己部署的 Google 登录态网关 HTTPS 地址', 400);
    try { parsed = new URL(rawUrl); } catch (_) { throw fail('备用网关 URL 无效', 400); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.search || parsed.hash || !parsed.hostname || parsed.port && !/^\d+$/.test(parsed.port)) {
      throw fail('备用网关只允许无账号密码、无查询参数的 HTTPS 地址', 400);
    }
    // The gateway is controlled by the user. Google login pages and the anonymous virtual
    // endpoint are not OpenAI API gateways. Never POST game prompts/keys to them.
    var host = parsed.hostname.toLowerCase();
    if (host === 'gemini.google.com' || host === 'accounts.google.com' ||
        host.endsWith('.google.com') || host.endsWith('.googleusercontent.com') ||
        host.endsWith('.invalid')) throw fail('这里要填自己部署的 API 网关，不是 Google 登录页面', 400);
    var pathname = parsed.pathname.replace(/\/+$/, '');
    if (pathname === '') pathname = '/v1';
    if (pathname === '/v1/chat/completions') pathname = '/v1';
    if (pathname !== '/v1') throw fail('备用网关 URL 请以 /v1 结尾', 400);
    var key = String(draft.apiKey || previous.apiKey || '').trim();
    if (!key || key.length > 1024 || /[\r\n]/.test(key)) throw fail('请填写网关自己的 API Key（不是 Google Cookie）', 400);
    var model = String(draft.model || 'gemini-3.5-flash-lite').trim();
    if (!/^[A-Za-z0-9._-]{1,90}$/.test(model)) throw fail('备用模型 ID 格式无效', 400);
    return { enabled: draft.enabled === true, url: parsed.origin + pathname, apiKey: key, model: model };
  }
  function save(draft) {
    var prior = load();
    var next;
    if (draft && draft.enabled !== true && !String(draft.url || prior.url || '').trim()) {
      next = {enabled:false};
    } else next = normalize(draft, prior);
    try { g.localStorage.setItem(STORAGE, JSON.stringify(next)); }
    catch (_) { throw fail('设备本地存储不可写，备用配置未保存', 503); }
    blockedUntil = 0;
    return summary(); // No API key is ever echoed to settings UI.
  }
  function clear() {
    try { g.localStorage.removeItem(STORAGE); }
    catch (_) { throw fail('清除本地备用配置失败', 503); }
    blockedUntil = 0;
    return summary();
  }
  function configured() {
    var cfg = load();
    return cfg.enabled === true && !!cfg.url && !!cfg.apiKey;
  }
  function timeoutOrCancelled(signal) {
    if (signal && signal.aborted) {
      var e = fail('人物对话已取消', 499, 'AI_ABORTED'); e.name = 'AbortError'; throw e;
    }
  }
  function cooldown(resp) {
    var seconds = parseInt(resp && resp.headers && resp.headers.get('retry-after') || '0', 10);
    blockedUntil = Math.max(blockedUntil, Date.now() + Math.min(3600000,Math.max(60000,seconds>0?seconds*1000:60000)));
  }
  async function send(cfg, messages, opts) {
    opts = opts || {};
    timeoutOrCancelled(opts.signal);
    if (Date.now() < blockedUntil) throw fail('登录态备用暂时受限，请稍后再试',429,'GEMINI_LOGIN_COOLDOWN');
    if (inFlight >= 2) throw fail('登录态备用正在处理其他对话',429);
    if (!Array.isArray(messages) || !messages.length || messages.length > 200)
      throw fail('备用对话的消息格式无效',400);
    if (opts.tools && opts.tools.length) throw fail('登录态备用不支持 Agent 工具',422);
    var request = JSON.stringify({
      model: cfg.model, messages: messages, stream: false,
      max_tokens: Math.min(4096,Math.max(64,Number(opts.maxTokens) || 1024))
    });
    if (new TextEncoder().encode(request).length > 95000) throw fail('备用通道输入超过 95KB',413);
    inFlight++;
    try {
      var response = await nativeFetch(cfg.url + '/chat/completions', {
        method: 'POST', redirect: 'manual', credentials: 'omit',
        headers: {'Content-Type':'application/json', 'Accept':'application/json', 'Authorization':'Bearer ' + cfg.apiKey},
        body: request, signal: opts.signal, timeoutMs:75000,
        waitForCompleteResponse:true,totalResponseTimeoutMs:75000
      });
      timeoutOrCancelled(opts.signal);
      if (response.status >= 300 && response.status < 400) {
        cooldown(response);
        throw fail('备用网关发生重定向，已拒绝携带密钥跳转', 403);
      }
      if (!response.ok) {
        if ([401,403,429].includes(response.status)) cooldown(response);
        var msg = response.status === 401 || response.status === 403
          ? '登录态备用鉴权失败，请检查网关 Key 或 Google 登录状态'
          : response.status === 429 ? '登录态备用也被限流'
          : '登录态备用 HTTP ' + response.status;
        throw fail(msg,response.status);
      }
      var text = await response.text();
      timeoutOrCancelled(opts.signal);
      if (text.length > 4*1024*1024) throw fail('备用网关返回内容过大',413);
      var obj;
      try {obj=JSON.parse(text);}catch(_) {throw fail('备用网关没有返回 OpenAI 兼容 JSON',502);}
      var message=obj && obj.choices && obj.choices[0] && obj.choices[0].message;
      var content=message && message.content;
      if (typeof content !== 'string' || !content.trim()) throw fail('备用网关没有可读的文本回复',502);
      lastRoute = 'login-gateway';
      return {text:content.trim(),model:cfg.model};
    } catch(e) {
      if (opts.signal && opts.signal.aborted) timeoutOrCancelled(opts.signal);
      if (e && e.code === 'AI_ABORTED') throw e;
      // Do not print request body, Authorization header, gateway key or Google cookies.
      if (e && e.code === 'GEMINI_LOGIN_BACKUP') throw e;
      throw fail('登录态备用连接失败；请检查网关 HTTPS、CORS 和网络',503);
    } finally { inFlight--; }
  }
  async function tryReply(messages, opts) {
    if (!configured()) throw fail('未启用登录态备用',503);
    return send(normalize(load()), messages, opts);
  }
  async function test(draft) {
    var cfg = normalize(draft, load());
    return send(cfg, [{role:'user',content:'请只回复：连接成功'}],{maxTokens:64});
  }
  g.TM=g.TM||{};
  g.TM.GeminiLoginBackup = {
    summary:summary, configured:configured, save:save, clear:clear,
    tryReply:tryReply, test:test,
    markAnonymous:function(){lastRoute='anonymous';},
    canFallback:function(status) {
      return [401,403,405,429,500,502,503,504].includes(Number(status));
    }
  };
})(window);
