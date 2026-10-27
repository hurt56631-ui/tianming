'use strict';
// Capacitor 6 creates an ignored SDK34 / AGP8.2.1 / Gradle8.2.1 native template.
// Capgo WorkManager 2.10.5 requires compileSdk35, and AGP8.2.1 supports only 34.
// Upgrade only locally generated DEBUG Android build metadata, not the source APK
// versionCode, targetSdk (runtime behavior) or signed production release.
// Minimum Android for THIS DEBUG APK is raised from 22 to 23: play-services-tasks:18.4.1.
const fs=require('fs');
const path=require('path');
const NATIVE=path.resolve(__dirname,'..','android');
const SPECS=[
 {name:'build.gradle',
  old:"classpath 'com.android.tools.build:gradle:8.2.1'",
  replacement:"classpath 'com.android.tools.build:gradle:8.6.1'"},
 {name:'variables.gradle',
  old:'compileSdkVersion = 34',replacement:'compileSdkVersion = 35'},
 // Google Play Services tasks 18.4.1 requires API 23 at runtime.
 {name:'variables.gradle',
  old:'minSdkVersion = 22',replacement:'minSdkVersion = 23'},
 {name:path.join('gradle','wrapper','gradle-wrapper.properties'),
  old:'gradle-8.2.1-all.zip',replacement:'gradle-8.7-all.zip'}
];
function patch(dir=NATIVE){
  const appGradle=path.join(dir,'app','build.gradle');
  if(!fs.existsSync(appGradle) ||
     !/compileSdk\s+rootProject\.ext\.compileSdkVersion/.test(fs.readFileSync(appGradle,'utf8')))
    throw Error('Unknown Capacitor app Gradle template. Refusing to patch SDK versions.');
  const planned=new Map();
  for(const spec of SPECS){
    const file=path.join(dir,spec.name);
    if(!fs.existsSync(file))throw Error('Missing generated Gradle file: '+spec.name);
    // Multiple version changes can target the same variables.gradle. Accumulate
    // against the same original bytes, then write once, avoiding lost updates.
    const existing=planned.get(file);
    const before=existing?existing.after:fs.readFileSync(file,'utf8');
    const oldCount=before.split(spec.old).length-1;
    const newCount=before.split(spec.replacement).length-1;
    if(oldCount===1 && newCount===0){
      if(existing){
        existing.after=before.replace(spec.old,spec.replacement);
      }else{
        planned.set(file,{file,before,after:before.replace(spec.old,spec.replacement),label:spec.name});
      }
    }else if(oldCount===0 && newCount===1){
      // Reruns and existing SDK35/min23 templates are safe and idempotent.
    }else{
      throw Error('Unexpected Gradle versions in '+spec.name+
        '; expected Capacitor6 defaults or SDK35 debug toolchain. No files changed.');
    }
  }
  const plan=[...planned.values()];
  // Changing compileSdk has no reason to silently change target/min SDK, which can
  // alter Android runtime permission/update behavior. Preserve existing values.
  const vars=fs.readFileSync(path.join(dir,'variables.gradle'),'utf8');
  if(!/\btargetSdkVersion\s*=\s*34\b/.test(vars))throw Error('Unexpected targetSdkVersion; not changing build environment.');
  const written=[];
  try{
    for(const row of plan){fs.writeFileSync(row.file,row.after,'utf8');written.push(row);}
  }catch(err){
    for(const row of written.reverse())try{fs.writeFileSync(row.file,row.before,'utf8');}catch(_){}
    throw err;
  }
  const out={changed:plan.map(x=>x.label),compileSdk:35,targetSdk:34,minSdk:23,agp:'8.6.1',gradle:'8.7'};
  console.log('[apk-debug-sdk35] '+JSON.stringify(out));
  return out;
}
if(require.main===module){
  try{patch();}catch(e){console.error('[apk-debug-sdk35] FAIL: '+(e&&e.message||e));process.exitCode=1;}
}
module.exports={patch,NATIVE,SPECS};
