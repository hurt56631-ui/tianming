// Character dialogue API and speech-style settings. Independent of end-turn AI providers.
(function(root) {
  'use strict';
  root.TM = root.TM || {};
  var STORAGE_KEY = 'tm_dialogue_gemini_v1';
  var ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  var slots = Object.create(null);
  var cursor = 0;
  var defaults = { enabled:false, model:'gemini-3.5-flash-lite', keys:[], minIntervalSec:10, style:'natural' };
  function clean(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var input = Array.isArray(raw.keys) ? raw.keys : String(raw.keys || '').split(/[\r\n,]+/);
    var keys = [];
    input.forEach(function(x) { var k = String(x || '').trim(); if(k && keys.indexOf(k)<0 && keys.length<8)keys.push(k); });
    var style = ['natural','period','classical'].indexOf(raw.style)>=0 ? raw.style : 'natural';
    return { enabled:raw.enabled === true, model:/^gemini-[a-z0-9._-]{2,70}$/i.test(raw.model || '') ? raw.model : defaults.model,
      keys:keys, minIntervalSec:Math.min(60,Math.max(6,Math.floor(Number(raw.minIntervalSec)||10))), style:style };
  }
  function read() {
    try { return clean(JSON.parse(root.localStorage.getItem(STORAGE_KEY) || '{}')); }
    catch(_) { return clean(defaults); }
  }
  function save(next) {
    var cfg = clean(next);
    root.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    slots = Object.create(null); cursor = 0;
    return cfg;
  }
  function stylePrompt(mode) {
    var style = read().style, formal = mode !== 'private';
    if(style === 'classical') return '【人物口吻最终规则】人物可用自然的文言或半文言，但要符合时代、身份与性格；勿机械堆砌辞藻。';
    if(style === 'period') return '【人物口吻最终规则】对话使用清楚易懂的古风白话，保留符合朝代的称谓和礼节，不写整段艰涩文言。';
    return '【人物口吻最终规则·优先于上文任何“文言为主”要求】这是人物面对面的说话，不是史书、奏章或小说旁白。'
      + (formal ? '在正式场合保留陛下、臣、官家等时代恰当称谓和尊卑礼数，' : '在私下交谈时自然亲切，')
      + '但所有实际台词用流畅的自然白话短句。不要满篇“臣窃以为、伏惟、诚恐、盖、乃、乎、之”或书面腔；'
      + '不要替人物写长篇旁白。允许不同人物因学识、性格、立场表现出措辞差异。';
  }
  function retryable(error) {
    var status = Number(error && error.status);
    return status === 429 || status === 503 || status === 502 || status === 504;
  }
  async function stream(messages, maxTokens, options) {
    if(typeof root.callAIMessagesStream !== 'function') throw new Error('角色聊天 AI 尚未加载');
    var cfg = read();
    if(!cfg.enabled || !cfg.keys.length) return root.callAIMessagesStream(messages,maxTokens,options || {});
    var tried = [], lastError = null, partial = false;
    for(var i=0; i<cfg.keys.length; i++) {
      var now = Date.now(), selected = -1;
      for(var j=0; j<cfg.keys.length; j++) {
        var idx = (cursor+j)%cfg.keys.length, key = cfg.keys[idx];
        if(tried.indexOf(key)<0 && (!slots[key] || slots[key]<=now)) { selected=idx; break; }
      }
      if(selected<0) break;
      var key = cfg.keys[selected]; tried.push(key); cursor=(selected+1)%cfg.keys.length;
      slots[key]=Date.now()+cfg.minIntervalSec*1000;
      partial=false;
      var opts=Object.assign({}, options || {}, {
        id:'wendui_gemini', tier:'primary', maxRetries:0,
        apiConfigOverride:{key:key,model:cfg.model,url:ENDPOINT,thinking:false}
      });
      var originalChunk=opts.onChunk;
      opts.onChunk=function(text) { if(text)partial=true; if(originalChunk)originalChunk(text); };
      try {
        return await root.callAIMessagesStream(messages,maxTokens,opts);
      } catch(error) {
        lastError=error;
        if(!retryable(error) || partial) throw error;
        var retryAfter=Number(error && error.retryAfterMs);
        slots[key]=Date.now()+Math.max(60000,Number.isFinite(retryAfter)?Math.min(retryAfter,3600000):0);
      }
    }
    var remaining=cfg.keys.reduce(function(min,key){
      return Math.min(min,Math.max(0,(slots[key]||0)-Date.now()));
    },Infinity);
    var wait=Number.isFinite(remaining)?Math.ceil(remaining/1000):60;
    var err=new Error('角色对话 Gemini 当前全部 Key 暂时限流，请约 '+Math.max(1,wait)+' 秒后重试；不会自动消耗主 API 配额。');
    err.code='DIALOGUE_GEMINI_COOLDOWN';err.status=429;err.cause=lastError;
    throw err;
  }
  function el(tag, text, className) {
    var x=document.createElement(tag);
    if(text!=null)x.textContent=text;
    if(className)x.className=className;
    return x;
  }
  function mount() {
    var before=document.getElementById('tm-dialogue-gemini-panel');if(before)before.remove();
    var modelField=document.getElementById('s-sec-model') || document.getElementById('s-model');
    if(!modelField || !modelField.parentElement || !modelField.parentElement.parentElement)return;
    var host=modelField.parentElement, section=el('div');section.id='tm-dialogue-gemini-panel';
    section.style.cssText='margin-top:14px;padding:12px;border:1px solid var(--bdr,#66543a);border-radius:8px;line-height:1.6;';
    var heading=el('strong','人物对话 · 独立 Gemini Key 轮询');section.appendChild(heading);
    var note=el('div','仅角色问对使用；回合结算仍走原主/次 API。多个 Key 的额度是否独立由 Google 项目配额决定。密钥保存在当前设备，不写入剧本。');
    note.style.cssText='font-size:12px;color:var(--txt-d);margin:5px 0 10px;';section.appendChild(note);
    var cfg=read(), enable=el('input'), lab=el('label');enable.type='checkbox';enable.checked=cfg.enabled;
    lab.style.cssText='display:flex;align-items:center;gap:7px;margin-bottom:8px;';lab.append(enable,el('span','启用独立 Gemini 角色对话'));section.appendChild(lab);
    function field(title,control){var wrap=el('label');wrap.style.cssText='display:block;margin:8px 0;';var titleEl=el('span',title);titleEl.style.cssText='display:block;font-size:12px;';wrap.append(titleEl,control);section.appendChild(wrap);return control;}
    var model=el('input');model.type='text';model.value=cfg.model;model.placeholder='gemini-3.5-flash-lite';model.style.width='100%';field('Gemini 模型名称',model);
    var keys=el('textarea');keys.rows=3;keys.value=cfg.keys.join('\n');keys.placeholder='每行一个 Google AI Studio API Key，最多 8 个';keys.style.cssText='width:100%;font-family:monospace;resize:vertical;-webkit-text-security:disc;';field('API Key 列表（每行一个）',keys);
    var visible=el('input'), showLabel=el('label');visible.type='checkbox';showLabel.style.cssText='display:flex;align-items:center;gap:7px;font-size:12px;';showLabel.append(visible,el('span','显示密钥'));section.append(showLabel);
    visible.addEventListener('change',function(){keys.style.webkitTextSecurity=visible.checked?'none':'disc';});
    var interval=el('input');interval.type='number';interval.min='6';interval.max='60';interval.value=String(cfg.minIntervalSec);interval.style.cssText='width:85px;';field('同一 Key 最短请求间隔（秒，6～60）',interval);
    var style=el('select');[['natural','自然白话（推荐）'],['period','古风白话'],['classical','文言文']].forEach(function(row){var o=el('option',row[1]);o.value=row[0];style.appendChild(o);});style.value=cfg.style;field('人物对话语言风格',style);
    var saveButton=el('button','保存人物对话设置','bt bp bsm');saveButton.type='button';section.append(saveButton);
    saveButton.addEventListener('click',function(){
      try {
        var next=save({enabled:enable.checked,model:model.value.trim(),keys:keys.value,minIntervalSec:interval.value,style:style.value});
        if(typeof root.toast==='function')root.toast('人物对话设置已保存 · '+next.keys.length+' 个 Gemini Key');
      } catch(e) { if(typeof root.toast==='function')root.toast('人物对话设置保存失败：'+(e.message||e)); }
    });
    host.parentElement.insertBefore(section,host.nextSibling);
  }
  root.TM.DialogueGemini={read:read,save:save,stream:stream,stylePrompt:stylePrompt,mount:mount,configured:function(){var c=read();return c.enabled && c.keys.length>0;}};
})(window);
