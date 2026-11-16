#!/usr/bin/env node
'use strict';
// Audit bundled asset files against the committed manifest.
// Generated binary assets may be intentionally ignored by Git.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const flags = new Set(process.argv.slice(2));
const assetRoot = path.join(root, 'web/ui/assets');
const manifestPath = path.join(assetRoot, 'manifest.json');
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!m || m.schema !== 'tm-ui-assets/1' || !m.files || typeof m.files !== 'object') {
  throw new Error('unexpected new UI asset manifest');
}
const rows = Object.entries(m.files);
let count = 0;
let bytes = 0;
const missing = [];
const incorrect = [];
for (const [relative, meta] of rows) {
  if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(relative)) throw new Error('unexpected asset path: ' + relative);
  const file = path.resolve(assetRoot, relative);
  if (!file.startsWith(assetRoot + path.sep)) throw new Error('unsafe asset path');
  if (!fs.existsSync(file)) { missing.push(relative); continue; }
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size !== meta.bytes) { incorrect.push(relative + ' (size)'); continue; }
  if (flags.has('--hash')) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (hash !== meta.sha256) { incorrect.push(relative + ' (SHA-256)'); continue; }
  }
  count++;
  bytes += stat.size;
}
const essential = missing.concat(incorrect).filter(p => p.startsWith('study/') || p.startsWith('map/'));
const summary = [
  'New UI assets: ' + count + '/' + rows.length + ' files present',
  'Expected bytes: ' + m.totalBytes,
  'Present bytes: ' + bytes,
  'Missing: ' + missing.length + ', incorrect: ' + incorrect.length,
  'Essential study/map assets missing or incorrect: ' + essential.length
];
console.log('[android-newui-assets] ' + summary.join(' | '));
for (const p of missing) console.log('[android-newui-assets] MISSING ' + p);
for (const p of incorrect) console.log('[android-newui-assets] BAD ' + p);
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [
    '## Android 新 UI 素材审计',
    '',
    '| 项目 | 结果 |',
    '| --- | ---: |',
    '| 已发现 / 应有 | ' + count + ' / ' + rows.length + ' |',
    '| 缺失 | ' + missing.length + ' |',
    '| 大小或校验不符 | ' + incorrect.length + ' |',
    '| 地图 / 书房关键文件缺失 | ' + essential.length + ' |',
    '',
    essential.length ? '**当前 APK 不具备完整新 UI 启动资源；仅作代码构建测试。**' : '关键地图与书房文件齐全。',
    '',
    '缺失详情见 Audit new UI binary assets 步骤日志。'
  ];
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}
if (flags.has('--strict') && (missing.length || incorrect.length)) process.exitCode = 1;
