// 新前端入口：index.html 在开关开着（?ui=new 或 localStorage tm_ui=new）时动态载入这里。
// 老内核照旧由 index.html 载入；这里挂上新前端自己的样式与根节点，再按模式起步。
//   默认：应用壳（启幕 → 御案 …）
//   ?bench=kernel：适配层台（开天启、读数、存读档），开发自检用
import { installViewport } from './core/viewport.js';
import { installSettings, setSetting } from './core/settings.js';
import { installOrnaments, installTiao } from './kit/index.js';

const base = new URL('./', import.meta.url).href;

function addStyle(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = base + href;
  link.dataset.newui = '1';                     // 停用老样式表时认得出自己的
  document.head.append(link);
  return new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; });
}

async function start() {
  await Promise.all(['kit/tokens.css', 'kit/fonts.css', 'kit/qi.css', 'scene/scene.css', 'screens/screens.css', 'screens/docket.css', 'screens/issues.css', 'screens/atlas.css', 'screens/edict.css', 'screens/letters.css', 'screens/audience.css', 'screens/offices.css', 'screens/fiscal.css', 'screens/court.css', 'screens/army.css', 'screens/guoshi.css', 'screens/realm.css', 'screens/archive.css', 'screens/bio.css', 'screens/mizhao.css', 'screens/prison.css', 'screens/endgame.css', 'screens/fangzhi.css', 'screens/wenyuan.css', 'screens/keju.css', 'screens/gaizhi.css', 'screens/turnveil.css', 'screens/battle.css', 'screens/keyi.css', 'screens/wentian.css', 'screens/gongwei.css', 'screens/help.css', 'screens/world.css', 'screens/mapmarks.css', 'screens/renwu.css'].map(addStyle));
  const root = document.createElement('div');
  root.id = 'tm-newui-root';
  root.className = 'q-root';
  document.body.append(root);
  installViewport();
  installSettings();
  // One-tap safe mode on mobile: smaller render targets and CPU terrain path.
  // Never overwrite the user's saved quality preference on a normal start.
  if (new URLSearchParams(location.search).get('newui_safe') === '1') {
    setSetting('quality', 'low');
    window.__tmForceCpuFields = true;
  }
  installOrnaments();
  installTiao();
  const mode = new URLSearchParams(location.search).get('bench');
  if (mode === 'kernel') {
    const { runKernelBench } = await import('./dev/kernel-bench.js');
    await runKernelBench(root);
    return;
  }
  const { startApp } = await import('./app.js');
  await startApp(root);
}

// The new UI hides every legacy body child. A console-only error looks like
// a black screen with functioning audio on Android; always show a recovery UI.
function showStartupFailure(reason, error) {
  if (document.getElementById('tm-newui-failure')) return;
  let root = document.getElementById('tm-newui-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'tm-newui-root';
    document.body.append(root);
  }
  const message = String(error && error.message || error || '未知错误').slice(0, 1400);
  document.body.dataset.newuiError = message;
  const panel = document.createElement('section');
  panel.id = 'tm-newui-failure';
  panel.setAttribute('role', 'alert');
  Object.assign(panel.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647', display: 'flex',
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '1rem', padding: '1.5rem', overflow: 'auto', boxSizing: 'border-box',
    color: '#f4e8d1', background: '#170d09', fontFamily: 'sans-serif'
  });
  const heading = document.createElement('h2');
  heading.textContent = '天命新界面启动遇到问题';
  heading.style.margin = '0';
  const text = document.createElement('p');
  text.textContent = '声音可能仍在播放，但画面未正常启动。可以先试低画质；若仍失败，切换旧界面。';
  text.style.maxWidth = '42rem';
  text.style.lineHeight = '1.8';
  const detail = document.createElement('pre');
  detail.textContent = reason + ': ' + message;
  Object.assign(detail.style, {
    whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: '42rem',
    maxHeight: '30vh', overflow: 'auto', padding: '1rem', fontSize: '12px',
    background: '#33231b', border: '1px solid #765a3b',
    userSelect: 'text', WebkitUserSelect: 'text'
  });
  const actions = document.createElement('div');
  Object.assign(actions.style, { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '.75rem' });
  function button(label, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    Object.assign(b.style, {
      fontSize: '1rem', padding: '.8rem 1.1rem', color: '#fff2d8',
      border: '1px solid #a98a53', background: '#63432e', borderRadius: '.4rem'
    });
    b.addEventListener('click', fn);
    actions.append(b);
  }
  button('低画质重试', () => {
    const url = new URL(location.href);
    url.searchParams.set('newui_safe', '1');
    url.searchParams.delete('tm_legacy');
    location.replace(url.href);
  });
  button('切换旧界面', () => {
    const url = new URL(location.href);
    url.searchParams.set('tm_legacy', '1');
    url.searchParams.delete('newui_safe');
    location.replace(url.href);
  });
  button('复制诊断', () => {
    const info = ['新界面启动故障', reason, message, navigator.userAgent].join('\\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(info).catch(() => { detail.textContent = info; });
    } else {
      detail.textContent = info;
    }
  });
  panel.append(heading, text, detail, actions);
  root.append(panel);
}

window.addEventListener('tm-newui-fatal', (event) => {
  const info = event.detail || {};
  showStartupFailure(info.reason || '渲染失败', info.message || '未知错误');
});
start().catch((err) => {
  console.error('[newui] 启动失败', err);
  showStartupFailure('启动失败', err);
});
