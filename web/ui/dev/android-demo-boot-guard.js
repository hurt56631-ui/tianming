// Android isolated new-UI debug splash: runs BEFORE the optional new UI module.
// Keep this file free of imports so even a failed importmap/Three.js still reports
// the problem on screen. This is NOT a production UI component.
(function () {
  'use strict';
  if (!window.TM_NEW_UI) return;
  var history = [];
  var startupAt = Date.now();
  var dismissed = false;
  var root = document.getElementById('tm-newui-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'tm-newui-root';
    document.body.appendChild(root);
  }
  var guard = document.createElement('div');
  guard.id = 'tm-newui-loading-guard';
  guard.setAttribute('role', 'status');
  guard.style.cssText = 'position:fixed;inset:0;z-index:2147483640;display:flex;' +
    'align-items:center;justify-content:center;box-sizing:border-box;padding:18px;' +
    'background:#1b100c;color:#f3e6d2;font:16px/1.65 system-ui,sans-serif;' +
    '-webkit-user-select:text;user-select:text;overflow:auto;';
  var pane = document.createElement('div');
  pane.style.cssText = 'width:min(580px,94vw);margin:auto;text-align:left';
  var heading = document.createElement('h2');
  heading.textContent = '天命 · 安卓新版启动检测';
  heading.style.cssText = 'margin:0 0 12px;font-size:22px;font-weight:600';
  var phase = document.createElement('p');
  phase.id = 'tm-newui-loading-phase';
  phase.textContent = '正在载入新版界面……';
  var tip = document.createElement('p');
  tip.textContent = '本测试包会加载 3D 书房和大地图，首次进入可能较慢。出现黑屏或一直不动时，可立即查看诊断。';
  tip.style.cssText = 'font-size:13px;opacity:.8';
  var detail = document.createElement('pre');
  detail.id = 'tm-newui-loading-detail';
  detail.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;display:none;' +
    'max-height:35vh;overflow:auto;background:#33241b;border:1px solid #7c5d43;' +
    'border-radius:6px;padding:10px;font:12px/1.6 monospace';
  var buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:16px';
  function button(label, callback) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'padding:9px 14px;color:#fff3dc;background:#65452f;' +
      'border:1px solid #ad8d5d;border-radius:6px;font:14px system-ui';
    b.addEventListener('click', callback);
    buttons.appendChild(b);
    return b;
  }
  function retry(safe) {
    var url = new URL(location.href);
    url.searchParams.delete('tm_legacy');
    if (safe) url.searchParams.set('newui_safe', '1');
    else url.searchParams.delete('newui_safe');
    location.replace(url.href);
  }
  var safe = button('最低画质重试', function () { retry(true); });
  button('切换旧界面', function () {
    var url = new URL(location.href);
    url.searchParams.set('tm_legacy', '1');
    url.searchParams.delete('newui_safe');
    location.replace(url.href);
  });
  var show = button('查看诊断', function () {
    detail.style.display = 'block';
    refreshDetail();
  });
  button('复制诊断', function () {
    var report = makeReport();
    detail.textContent = report;
    detail.style.display = 'block';
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(report).catch(function () { /* report visible */ });
  });
  pane.appendChild(heading);
  pane.appendChild(phase);
  pane.appendChild(tip);
  pane.appendChild(detail);
  pane.appendChild(buttons);
  guard.appendChild(pane);
  root.appendChild(guard);

  function line(type, content) {
    history.push(new Date().toISOString() + ' [' + type + '] ' + String(content || '').slice(0, 600));
    if (history.length > 30) history.shift();
  }
  function makeReport() {
    var ua = navigator.userAgent || '(unknown)';
    return [
      '天命 Android 新界面启动诊断',
      'URL: ' + location.pathname + location.search,
      'User-Agent: ' + ua,
      'elapsed: ' + Math.round((Date.now() - startupAt) / 1000) + 's',
      'phase: ' + phase.textContent,
      'ready: ' + (document.body && document.body.dataset.ready || 'no'),
      'newuiError: ' + (document.body && document.body.dataset.newuiError || '-'),
      'logs:',
      history.join('\\n')
    ].join('\\n');
  }
  function refreshDetail() { detail.textContent = makeReport(); }
  function fail(type, err) {
    if (dismissed) return;
    var msg = err && err.message ? err.message : String(err || '未知错误');
    line(type, msg);
    guard.style.background = '#27110d';
    phase.textContent = type + '：' + msg.slice(0, 300);
    tip.textContent = '脚本或图形初始化失败。请截屏或复制诊断信息发给我，不需要反复下载完整 APK。';
    detail.style.display = 'block';
    refreshDetail();
  }
  window.TM_AndroidDemo = { fail: fail, log: line, report: makeReport };
  window.addEventListener('error', function (e) {
    var src = e && e.filename || '';
    var msg = e && e.message || '';
    line('javascript', src + ': ' + msg);
    // Legacy script errors are noisy; only a new-UI module failure is fatal.
    if (/\\/ui\\/|\\/three\\/|three\\.module|GLTFLoader/.test(src))
      fail('新版脚本错误', src + ': ' + msg);
  });
  window.addEventListener('unhandledrejection', function (e) {
    var cause = e && e.reason;
    line('promise', cause && cause.message || cause);
  });
  window.addEventListener('tm-newui-fatal', function (e) {
    var info = e && e.detail || {};
    fail(info.reason || '图形渲染错误', info.message || 'WebGL 初始化失败');
  });
  var interval = setInterval(function () {
    if (document.body && document.body.dataset.ready === '1') {
      clearInterval(interval);
      dismissed = true;
      guard.remove();
      return;
    }
    var elapsed = Math.round((Date.now() - startupAt) / 1000);
    var loading = document.querySelector('#tm-newui-root .scr-load .cap');
    var sub = document.querySelector('#tm-newui-root .scr-load .sub');
    var step = loading && loading.textContent ? loading.textContent.trim() : '初始化中';
    var extra = sub && sub.textContent ? sub.textContent.trim() : '';
    var initial = phase.textContent;
    if (!/失败|错误/.test(initial)) phase.textContent =
      '运行 ' + elapsed + ' 秒｜' + step + (extra ? ' · ' + extra : '');
    if (elapsed >= 25) {
      tip.textContent = '加载超过25秒：可能是地形计算、老内核等待或设备 WebGL 不兼容。可选最低画质重试或切换旧版界面。';
      safe.disabled = false;
    }
    if (detail.style.display !== 'none') refreshDetail();
  }, 850);
})();
