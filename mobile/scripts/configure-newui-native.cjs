#!/usr/bin/env node
'use strict';
// Only run on the generated mobile/android project for the isolated Demo APK.
const fs = require('node:fs');
const path = require('node:path');
const file = path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml');
const xml = fs.readFileSync(file, 'utf8');
const activity = /<activity\b[^>]*android:name="\.MainActivity"[^>]*>/;
const matches = xml.match(activity);
if (!matches || matches.length !== 1) throw new Error('MainActivity missing in generated AndroidManifest.xml');
if (/android:screenOrientation=/.test(matches[0])) throw new Error('MainActivity orientation is already set; review instead of overwriting');
const next = xml.replace(activity, matches[0].replace(/>$/, ' android:screenOrientation="sensorLandscape">'));
if (next === xml) throw new Error('failed to configure landscape orientation');
fs.writeFileSync(file, next);
console.log('[newui-android] orientation=sensorLandscape');
