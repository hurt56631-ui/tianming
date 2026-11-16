#!/usr/bin/env node
'use strict';
// Independent Android tablet Demo staging. Never changes the official release
// exclusion list or the desktop/Pages/Capgo publishing pipeline.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const release = require('../../scripts/lib/release-tree.js');

const ROOT = path.resolve(__dirname, '../..');
const WEB = path.join(ROOT, 'web');
const DEFAULT_TARGET = path.join(ROOT, 'mobile', 'www');
const MANIFEST = '.tm-release-manifest.json';
const PROFILE = 'android-newui-demo-v1';
const has = flag => process.argv.includes('--' + flag);
const value = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? fallback : process.argv[i + 1];
};
function assert(ok, detail) { if (!ok) throw new Error(detail); }
function profile() {
  const original = release.loadConfig(ROOT);
  const globs = original.config.globs.filter(p => p !== 'ui/**' && p !== 'vendor/three/**');
  assert(globs.length === original.config.globs.length - 2, 'official exclusion list changed; review Android Demo rules');
  const config = { ...original.config, globs };
  const signature = release.sha256(Buffer.from(JSON.stringify({
    sourceExcludes: original.sha256, profile: PROFILE, globs
  })));
  return { config, signature };
}
// Transformation happens in the *staged* APK only: the original web/index.html
// remains byte-for-byte unchanged so official desktop and web releases are safe.
function demoIndex(contents) {
  const needle = "  try { on = /[?&]ui=new(&|$)/.test(location.search) || localStorage.getItem('tm_ui') === 'new'; } catch (_e) { on = false; }";
  const count = contents.split(needle).length - 1;
  assert(count === 1, 'new-UI bootstrap changed; refuse to build an APK with the old UI');
  return contents.replace(needle,
    "  try { on = true; /* isolated Android Demo always opens the new UI */ } catch (_e) { on = true; }");
}
function sourceRows(config) {
  const tree = release.walkTree(WEB, config);
  const problems = release.validateSource(WEB, tree, config)
    .concat(release.enforceLimits(tree.kept, config).problems);
  assert(!problems.length, 'source invalid: ' + problems.join('; '));
  const index = path.join(WEB, 'index.html');
  demoIndex(fs.readFileSync(index, 'utf8'));
  const paths = new Set(tree.kept.map(f => f.rel));
  assert(paths.has('ui/boot.js') && paths.has('vendor/three/three.module.js'),
    'new UI or Three.js not included in Android staging');
  return tree;
}
function expected(row) {
  if (row.rel !== 'index.html') return { size: row.size, hash: release.sha256File(row.abs) };
  const text = demoIndex(fs.readFileSync(row.abs, 'utf8'));
  const buf = Buffer.from(text, 'utf8');
  return { size: buf.length, hash: release.sha256(buf) };
}
function manifestRows(entries) {
  return entries.map(row => ({ path: row.rel, size: row.size, sha256: release.sha256File(row.abs) }));
}
function stage(target, cfg) {
  release.assertSafeStageTarget(ROOT, WEB, target);
  const source = sourceRows(cfg.config);
  fs.rmSync(target, { force: true, recursive: true });
  fs.mkdirSync(target, { recursive: true });
  for (const file of source.kept) {
    const dest = path.join(target, file.rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (file.rel === 'index.html') fs.writeFileSync(dest, demoIndex(fs.readFileSync(file.abs, 'utf8')));
    else fs.copyFileSync(file.abs, dest);
  }
  const staged = release.walkTree(target, cfg.config);
  const rows = manifestRows(staged.kept);
  const manifest = {
    schemaVersion: 1, label: PROFILE, releaseExcludesSha256: cfg.signature,
    sourceTreeSha256: release.treeHash(rows), fileCount: rows.length,
    totalBytes: rows.reduce((n, row) => n + row.size, 0), files: rows
  };
  fs.writeFileSync(path.join(target, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  console.log('[newui-android] STAGE PASS ' + manifest.fileCount + ' files, ' + manifest.totalBytes + ' bytes');
}
function verify(target, cfg, native) {
  assert(fs.existsSync(target), 'staging missing: ' + target);
  const source = sourceRows(cfg.config);
  const targetTree = release.walkTree(target, cfg.config);
  const sourceMap = new Map(source.kept.map(row => [row.rel, row]));
  const targetMap = new Map(targetTree.kept.map(row => [row.rel, row]));
  const errors = [];
  for (const [rel, row] of sourceMap) {
    const got = targetMap.get(rel);
    if (!got) { errors.push('missing ' + rel); continue; }
    const want = expected(row);
    if (got.size !== want.size || release.sha256File(got.abs) !== want.hash)
      errors.push('different ' + rel);
  }
  const nativeExtras = new Set(native ? ['cordova.js', 'cordova_plugins.js'] : []);
  for (const row of targetTree.kept)
    if (!sourceMap.has(row.rel) && !nativeExtras.has(row.rel)) errors.push('extra ' + row.rel);
  const files = targetTree.kept.filter(row => sourceMap.has(row.rel));
  const limits = release.enforceLimits(files, cfg.config);
  errors.push(...limits.problems);
  const hashed = manifestRows(files);
  const mpath = path.join(target, MANIFEST);
  let m;
  try { m = JSON.parse(fs.readFileSync(mpath, 'utf8')); }
  catch (_) { errors.push('manifest missing or invalid'); }
  if (m && (m.label !== PROFILE || m.releaseExcludesSha256 !== cfg.signature ||
    m.sourceTreeSha256 !== release.treeHash(hashed) || m.fileCount !== hashed.length ||
    m.totalBytes !== limits.totalBytes)) errors.push('manifest mismatch');
  assert(!errors.length, errors.slice(0, 30).join('; '));
  console.log('[newui-android] VERIFY PASS ' + hashed.length + ' files, ' + limits.totalBytes + ' bytes');
}
try {
  const target = path.resolve(value('target', DEFAULT_TARGET));
  const cfg = profile();
  if (has('dry-run')) {
    const source = sourceRows(cfg.config);
    console.log('[newui-android] DRY RUN PASS ' + source.kept.length + ' files');
  } else if (has('verify')) verify(target, cfg, has('native'));
  else { stage(target, cfg); verify(target, cfg, false); }
} catch (err) {
  console.error('[newui-android] FAIL ' + err.message);
  process.exitCode = 1;
}
