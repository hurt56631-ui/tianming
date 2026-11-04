// Tianming Android DeepSeek Web adapter. No network proxy, API key or cookie export.
// An explicit .invalid endpoint prevents accidental requests to a third-party host.
(function (global) {
  'use strict';
  var ORIGIN = 'https://tm-deepseek-web.invalid';
  var BASE = ORIGIN + '/v1';
  var MAX_PROMPT_BYTES = 230000;
  var work = Promise.resolve();
  var quarantined = new Map();
  var realFetch = global.fetch.bind(global);

  function isEndpoint(resource) {
    try {
      var url = new URL(typeof resource === 'string' ? resource : resource.url, location.href);
      return url.origin === ORIGIN && url.pathname.replace(/\/+$/, '') === '/v1/chat/completions';
    } catch (_) { return false; }
  }
  function plugin() {
    var cap = global.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return null;
    return cap.Plugins && cap.Plugins.TianmingDeepSeekWeb || null;
  }
  function requirePlugin() {
    var p = plugin();
    if (!p || typeof p.generate !== 'function') {
      throw new Error('当前安装包没有 DeepSeek 网页插件。需要同步原生工程并安装新版 Android APK；网页热更新无法添加原生插件。');
    }
    return p;
  }
  function errorWithCode(message, code) {
    var error = new Error(message);
    error.code = code;
    return error;
  }
  function fingerprint(body) {
    // Replay guard is session-local; never persist prompts, cookies or responses.
    var s = JSON.stringify([body.model, body.messages, body.tools, body.tool_choice]);
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16) + ':' + s.length;
  }
  function promptFor(body) {
    var messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) throw errorWithCode('DeepSeek 网页需要 OpenAI messages', 'WEB_BAD_REQUEST');
    var prompt = '你是一个历史模拟游戏的推演模型。以下 JSON 是按顺序排列的完整聊天消息（含 system/user/assistant/tool 角色）。'
      + '严格遵守 system 消息规定的格式、字数和数据约束。只输出游戏所需的最终回答，不要解释、寒暄或附加前后缀。\n'
      + '消息 JSON：\n' + JSON.stringify(messages);
    if (Array.isArray(body.tools) && body.tools.length) {
      prompt += '\n可用工具定义：\n' + JSON.stringify(body.tools)
        + '\n如果必须调用工具，只输出合法 JSON：{"tool_calls":[{"name":"工具名","input":{}}]}。'
        + '否则按 system 指令正常回答。不要声称工具已执行。';
    }
    if (body.response_format && body.response_format.type === 'json_object') {
      prompt += '\n最终必须输出合法 JSON 对象，不要 Markdown 代码块。';
    }
    if (new TextEncoder().encode(prompt).length > MAX_PROMPT_BYTES) {
      throw errorWithCode('DeepSeek 网页提示词超过 230KB；本次未发送。请减小游戏 AI 上下文或记忆档位。', 'WEB_PROMPT_TOO_LONG');
    }
    return prompt;
  }
  function completion(raw, model) {
    var text = String(raw || '').trim();
    if (!text) throw errorWithCode('DeepSeek 网页未产生可用回答；游戏未应用本次结算', 'WEB_EMPTY_REPLY');
    var message = { role: 'assistant', content: text };
    var finish = 'stop';
    var maybe = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      var parsed = JSON.parse(maybe);
      var list = parsed && parsed.tool_calls;
      if (Array.isArray(list) && list.length && list.every(function(t) {
        return t && typeof t.name === 'string' && t.name && t.input && typeof t.input === 'object' && !Array.isArray(t.input);
      })) {
        message.content = null;
        message.tool_calls = list.map(function(t, i) {
          return { id: 'call_web_' + i, type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.input) } };
        });
        finish = 'tool_calls';
      }
    } catch (_) { /* Narrative and code-fenced JSON are returned verbatim. */ }
    return {
      id: 'chatcmpl-tianming-deepseek-web', object: 'chat.completion',
      created: Math.floor(Date.now() / 1000), model: model || 'deepseek-web',
      choices: [{ index: 0, message: message, finish_reason: finish }]
    };
  }
  function abortError() {
    return errorWithCode('本次 DeepSeek 网页任务已取消，不会继续结算', 'AI_ABORTED');
  }
  async function invoke(body, options) {
    var native = requirePlugin();
    var signal = options && options.signal;
    if (signal && signal.aborted) throw abortError();
    var key = fingerprint(body);
    if (quarantined.has(key)) {
      throw errorWithCode('上次网页执行结果不确定，已禁止自动重复提交相同提示词。请检查 DeepSeek 网页会话，然后在配置里手动解锁。', 'WEB_REPLAY_BLOCKED');
    }
    var prompt = promptFor(body);
    var requestId = (global.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + String(Math.random()).slice(2);
    // All browser requests are serialized: the game may issue three parallel AI subcalls,
    // but they must not read each other's answer or reuse the same chat panel.
    var run = work.then(async function() {
      if (signal && signal.aborted) throw abortError();
      var onAbort = function() { if (typeof native.cancel === 'function') native.cancel({ requestId: requestId }).catch(function() {}); };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        // Quarantine until an explicit successful response. A timed-out/unknown POST
        // cannot be auto-retried: it might have been accepted by the website.
        quarantined.set(key, Date.now());
        if (quarantined.size > 32) quarantined.delete(quarantined.keys().next().value);
        var reply = await native.generate({ prompt: prompt, requestId: requestId, timeoutMs: 600000 });
        if (signal && signal.aborted) throw abortError();
        var result = completion(reply && reply.text, body.model);
        quarantined.delete(key);
        return result;
      } finally {
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    });
    work = run.catch(function() {});
    return run;
  }
  async function send(resource, options) {
    options = options || {};
    if (String(options.method || 'GET').toUpperCase() !== 'POST') {
      throw errorWithCode('DeepSeek Web 仅支持 POST /chat/completions', 'WEB_METHOD');
    }
    var body = JSON.parse(typeof options.body === 'string' ? options.body : '{}');
    var result = await invoke(body, options);
    // The existing game recognizes application/json as a non-SSE fallback for streamed calls.
    return new Response(JSON.stringify(result), {
      status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
  global.fetch = function(resource, options) {
    return isEndpoint(resource) ? send(resource, options) : realFetch(resource, options);
  };

  function choose(tier) {
    var prefix = tier === 'secondary' ? 's-sec-' : 's-';
    [['url', BASE], ['model', 'deepseek-web'], ['key', 'local-web-session']].forEach(function(pair) {
      var el = document.getElementById(prefix + pair[0]);
      if (!el) return;
      el.value = pair[1];
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    var status = document.getElementById('tm-deepseek-web-status');
    if (status) status.textContent = '已填写' + (tier === 'secondary' ? '次' : '主') + ' AI 网页选项。请点击本页「保存所有设置」后生效。';
  }
  function mountSettings() {
    var el = document.getElementById('s-model');
    var section = el && el.closest('.settings-section');
    if (!section || section.querySelector('#tm-deepseek-web-settings')) return;
    var box = document.createElement('div');
    box.id = 'tm-deepseek-web-settings';
    box.style.cssText = 'padding:12px;margin:8px 0 14px;border:1px solid var(--bdr);border-radius:8px;line-height:1.7;';
    var title = document.createElement('div');
    title.textContent = 'DeepSeek 免费聊天网页 · Android 实验模式';
    title.style.cssText = 'font-weight:700;color:var(--gold);margin-bottom:5px;';
    var info = document.createElement('div');
    info.textContent = '需先在设备内登录 DeepSeek；选择网页后保存配置，游戏将自动提交并读取网页答案。单次请求串行执行。官方网页并非 API，限额、页面更新、长提示词与登录限制可能导致回合失败；不自动绕过验证。';
    info.style.cssText = 'font-size:.76rem;color:var(--txt-d);margin-bottom:8px;';
    var actions = document.createElement('div'); actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
    function add(label, fn) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'bt bs bsm';
      b.textContent = label; b.addEventListener('click', fn); actions.appendChild(b); return b;
    }
    var login = add('登录 DeepSeek', async function() {
      try { await requirePlugin().openLogin(); if (status) status.textContent = '登录窗口已关闭。是否成功请用下方「测试连接」验证。'; }
      catch (e) { if (status) status.textContent = e.message || String(e); }
    });
    add('用作主 AI', function() { choose('primary'); });
    add('测试网页生成', async function() {
      try {
        var response = await send(BASE + '/chat/completions', { method:'POST', body: JSON.stringify({ model:'deepseek-web', messages:[{role:'user', content:'只输出这个 JSON 对象：{"ok":true}'}], response_format:{type:'json_object'} }) });
        var data = await response.json();
        var answer = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (!answer || !JSON.parse(answer).ok) throw new Error('生成结果不符合 JSON 格式');
        if (status) status.textContent = '网页生成测试通过；完整游戏回合仍需单独测试。';
      } catch(e) { if (status) status.textContent = '网页测试失败：' + (e.message || String(e)); }
    });
    add('主次 AI 都使用', function() { choose('primary'); choose('secondary'); });
    add('解锁失败任务', function() {
      quarantined.clear();
      if (status) status.textContent = '已解除本次运行的重复发送保护。请先确认网页没有上一条请求仍在生成。';
    });
    var status = document.createElement('div'); status.id = 'tm-deepseek-web-status';
    status.setAttribute('role', 'status');
    status.style.cssText = 'font-size:.76rem;color:var(--txt-d);margin-top:7px;';
    if (!plugin()) {
      login.disabled = true;
      status.textContent = '当前平台未检测到原生插件。必须重新构建安装 Android APK；桌面版/普通网页不可使用这个插件。';
    } else if (global.P && P.ai && String(P.ai.url || '').indexOf(ORIGIN) === 0) {
      status.textContent = '当前主 AI 已配置为 DeepSeek Web；登录状态须通过实际请求验证。';
    }
    box.append(title, info, actions, status);
    section.insertBefore(box, section.firstChild.nextSibling);
  }
  global.TM = global.TM || {};
  global.TM.DeepSeekWeb = { BASE: BASE, isEndpoint: isEndpoint, fetch: send,
    available: function() { return !!plugin(); }, mountSettings: mountSettings,
    promptFor: promptFor, completion: completion, clearBlocked: function() { quarantined.clear(); } };
})(window);
