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
// WorkManager 2.10+ requires compileSdk >= 35. The official Capacitor 6
// generated shell is still on 34; adjust only the generated Demo project.
const variables = path.resolve(__dirname, '../android/variables.gradle');
let settings = fs.readFileSync(variables, 'utf8');
const sdk = /compileSdkVersion\s*=\s*34\b/;
if ((settings.match(new RegExp(sdk.source, 'g')) || []).length !== 1)
  throw new Error('unexpected compileSdk in generated variables.gradle');
settings = settings.replace(sdk, 'compileSdkVersion = 35');
fs.writeFileSync(variables, settings);
const properties = path.resolve(__dirname, '../android/gradle.properties');
let flags = fs.readFileSync(properties, 'utf8');
if (!flags.includes('android.suppressUnsupportedCompileSdk=35'))
  flags += '\nandroid.suppressUnsupportedCompileSdk=35\n';
fs.writeFileSync(properties, flags);
console.log('[newui-android] orientation=sensorLandscape, compileSdk=35 (demo only)');
