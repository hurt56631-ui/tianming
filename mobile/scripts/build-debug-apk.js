'use strict';
// One-command DEBUG APK: no release signing, version mutation, or update publishing.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
// Some Windows users have mobile/ as a junction on a different volume.
// Resolve the *repository* by stable markers, not by assuming __dirname/../.. .
function findRepoRoot() {
  const candidates = [
    process.env && process.env.TIANMING_REPO_ROOT,
    process.env && process.env.INIT_CWD,
    typeof process.cwd === 'function' && process.cwd(),
    __dirname
  ];
  for (const start of candidates) {
    if (!start) continue;
    let dir = path.resolve(start);
    for (let depth = 0; depth < 24; depth++) {
      if (fs.existsSync(path.join(dir, 'scripts', 'stage-web-release.js')) &&
          fs.existsSync(path.join(dir, 'web', 'index.html'))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  throw new Error('Could not find Tianming repo root. Run from the repository mobile/ folder, or set TIANMING_REPO_ROOT.');
}
const ROOT = findRepoRoot();
const MOBILE = path.join(ROOT, 'mobile');
const NATIVE = path.join(MOBILE, 'android');
const GRADLE = path.join(NATIVE, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const OUTPUT = path.join(NATIVE, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

function run(command, args, cwd) {
  const windows = process.platform === 'win32';
  const bin = windows ? 'cmd.exe' : command;
  const argv = windows ? ['/d', '/c', [command].concat(args).join(' ')] : args;
  console.log('[apk-debug] ' + [command].concat(args).join(' '));
  const result = spawnSync(bin, argv, { cwd, stdio: 'inherit', windowsHide: false });
  if (result.error) throw result.error;
  if (result.signal) throw new Error('Build interrupted: ' + result.signal);
  if (result.status !== 0) throw new Error(command + ' failed (exit ' + result.status + '). Fix the error above; the APK is not ready.');
}
function checkArtAssets() {
  // The canonical hot manifest includes many untracked art/audio files. A Git-only
  // checkout could otherwise stage an APK that silently lacks all portraits.
  const manifestFile = path.join(ROOT, 'web', '.hot-update-manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error('Missing canonical asset manifest.');
  let data;
  try { data = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); }
  catch (_) { throw new Error('Malformed canonical asset manifest.'); }
  const art = Array.isArray(data.files) ? data.files.filter(row =>
    row && typeof row.path === 'string' && /^assets\//.test(row.path) &&
    /\.(?:png|jpg|jpeg|webp|gif|mp3|wav|glb|gltf|bin)$/i.test(row.path)) : [];
  if (art.length < 100) throw new Error('Unexpectedly incomplete asset manifest.');
  const missing = art.filter(row => !fs.existsSync(path.join(ROOT, 'web', row.path)));
  if (missing.length) throw new Error('Missing ' + missing.length + '/' + art.length +
    ' essential artwork/audio files. Restore web/assets from your complete original folder. First missing: ' +
    missing.slice(0,3).map(row => row.path).join(', '));
  console.log('[apk-debug] Source media verified: ' + art.length + ' files.');
}
function main() {

  if (!fs.existsSync(path.join(ROOT, 'web', 'index.html')) ||
      !fs.existsSync(path.join(ROOT, 'scripts', 'stage-web-release.js'))) {
    throw new Error('Run this in the full Tianming repository with web/ and scripts/.');
  }
  if (!fs.existsSync(path.join(MOBILE, 'node_modules', '@capacitor', 'cli'))) {
    throw new Error('Capacitor is not installed. Run: cd mobile && npm install');
  }
  checkArtAssets();
  const exists = fs.existsSync(NATIVE), hasGradle = fs.existsSync(GRADLE);
  if (exists && !hasGradle) {
    throw new Error('mobile/android is present but the Gradle wrapper is missing. Inspect the native directory before proceeding.');
  }
  if (!hasGradle) {
    // add:android includes stage -> cap add -> cap sync -> native verify.
    run('npm', ['run', 'add:android'], MOBILE);
  } else {
    // Never bypass the required staging/native content integrity check.
    run('npm', ['run', 'sync'], MOBILE);
  }
  if (!fs.existsSync(GRADLE)) throw new Error('Android Gradle wrapper was not generated.');
  run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
      [':app:assembleDebug', '--no-daemon'], NATIVE);
  if (!fs.existsSync(OUTPUT)) throw new Error('Gradle finished, but app-debug.apk is missing.');
  const info = fs.statSync(OUTPUT);
  if (!info.isFile() || info.size <= 0) throw new Error('The resulting debug APK is invalid.');
  console.log('[apk-debug] Local test build finished. This is NOT a signed production release.');
  console.log('[apk-debug] ' + OUTPUT);
  console.log('[apk-debug] ' + (info.size / 1048576).toFixed(1) + ' MiB');
  console.log('[apk-debug] Back up your saves before uninstalling an older differently-signed APK.');
}
if (require.main === module) {
  try { main(); } catch (e) {
    console.error('[apk-debug] FAILED: ' + (e && e.message || String(e)));
    process.exitCode = 1;
  }
}
module.exports = { main, run, checkArtAssets, MOBILE, ROOT, NATIVE, OUTPUT };
