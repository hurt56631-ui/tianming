#!/usr/bin/env node
'use strict';
// Called only in the isolated Android Demo build workspace, before "cap add android".
// Production mobile/capacitor.config.json is not modified in Git.
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const configPath = path.join(ROOT, 'capacitor.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.appId !== 'com.tianming.history') throw new Error('unexpected production appId: ' + config.appId);
config.appId = 'com.tianming.history.newuidemo';
config.appName = '天命新界面测试';
config.plugins = config.plugins || {};
config.plugins.CapacitorUpdater = {
  ...(config.plugins.CapacitorUpdater || {}),
  autoUpdate: false, directUpdate: false
};
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log('[newui-android] demo appId=' + config.appId);
