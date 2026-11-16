// Local presentation-only portrait overrides for the November new UI.
// Does not mutate game characters, scenario JSON, dialogue prompts or saved simulation data.
import { bus } from './bus.js';

const PREFIX = 'tm_newui_portrait_v1:';
const MAX_FILE = 12 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const key = (name) => PREFIX + encodeURIComponent(String(name || '').trim());

export function customPortrait(name) {
  if (!name) return '';
  try {
    const value = localStorage.getItem(key(name)) || '';
    return value.startsWith('data:image/jpeg;base64,') ? value : '';
  } catch (_) { return ''; }
}
export function portraitFor(name, original = '') {
  return customPortrait(name) || original || '';
}

export function resetPortrait(name) {
  if (!name) return;
  try { localStorage.removeItem(key(name)); }
  catch (_) { throw new Error('无法从本机清除自定义立绘'); }
  bus.emit('portraits:changed', { name, source: 'default' });
}

// Pick JPEG/PNG/WebP from Android's file picker or a desktop browser.
// Convert to a bounded JPEG so localStorage cannot receive an unbounded image.
export async function savePortrait(name, file) {
  if (!String(name || '').trim()) throw new Error('人物名字不能为空');
  if (!file || !ALLOWED.has(file.type)) throw new Error('请选择 JPEG、PNG 或 WebP 图片');
  if (!file.size || file.size > MAX_FILE) throw new Error('图片需小于 12MB');
  const blobUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('图片无法解码'));
      image.src = blobUrl;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效');
    const width = 384, height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('设备不支持图像裁剪');
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const sw = width / scale, sh = height / scale;
    const sx = (image.naturalWidth - sw) / 2;
    const sy = Math.min(Math.max(0, image.naturalHeight * 0.07), image.naturalHeight - sh);
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
    const data = canvas.toDataURL('image/jpeg', 0.80);
    if (!data.startsWith('data:image/jpeg;base64,')) throw new Error('图片压缩失败');
    try { localStorage.setItem(key(name), data); }
    catch (_) { throw new Error('本机头像存储空间不足，请删除部分自定义立绘后再试'); }
    bus.emit('portraits:changed', { name, source: 'custom' });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
