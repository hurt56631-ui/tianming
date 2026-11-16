#!/usr/bin/env node
'use strict';
// After generating demo-only resources, validate the files actually needed to
// boot the Android new UI. Never treat the original fixed-size manifest as
// satisfied when the source files are missing.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const ui = path.join(root, 'web/ui/assets');
const needed = [
  'map/dem.png', 'study/room.glb', 'study/props.glb',
  ...['brocade','caihua','carpet','carved-clouds','ceiling','cinnabar',
      'clouds','door-skirt','fan-face','floor-tiles','huanghuali',
      'lantern-painting','plaque-frame','porcelain-wrap','screen-qianli',
      'silk','throne-back','wallpaper','window-court','zitan'].map(n => 'study/tex/' + n + '.jpg'),
  ...['TM-WenKai','TM-MaShanZheng','TM-Qiji','TM-Syuku','TM-Boku',
      'TM-Xing','TM-Seal'].map(n => 'fonts/' + n + '/00.woff2')
];
const missing = [], bad = [];
for (const name of needed) {
  const file = path.join(ui, name);
  if (!fs.existsSync(file)) { missing.push(name); continue; }
  const s = fs.statSync(file);
  if (!s.isFile() || s.size < 1000) { bad.push(name + ': empty or truncated'); continue; }
  const fd = fs.openSync(file, 'r');
  const magic = Buffer.alloc(12);
  try { fs.readSync(fd, magic, 0, 12, 0); } finally { fs.closeSync(fd); }
  if (name.endsWith('.png') && !magic.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) bad.push(name + ': invalid PNG');
  if (name.endsWith('.glb') && magic.toString('ascii', 0, 4) !== 'glTF') bad.push(name + ': invalid GLB');
  if (name.endsWith('.woff2') && magic.toString('ascii', 0, 4) !== 'wOF2') bad.push(name + ': invalid WOFF2');
  if (name.endsWith('.jpg') && !(magic[0] === 0xff && magic[1] === 0xd8)) bad.push(name + ': invalid JPEG');
}
const css = fs.readFileSync(path.join(root, 'web/ui/kit/fonts.css'), 'utf8');
for (const n of ['TM-WenKai','TM-MaShanZheng','TM-Qiji','TM-Syuku','TM-Boku','TM-Xing','TM-Seal']) {
  if (!css.includes("font-family: '" + n + "'")) bad.push(n + ': CSS alias missing');
}
if (missing.length || bad.length) {
  for (const n of missing) console.error('[newui-demo-verify] MISSING', n);
  for (const n of bad) console.error('[newui-demo-verify] BAD', n);
  console.error('[newui-demo-verify] FAIL', missing.length, 'missing', bad.length, 'bad');
  process.exit(1);
}
console.log('[newui-demo-verify] PASS', needed.length, 'required demo runtime binaries');
console.log('[newui-demo-verify] NOTE original art and room-lightmap.hdr are not included; real-time lighting fallback applies');
