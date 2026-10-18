'use strict';
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {patch}=require('../../mobile/scripts/ensure-debug-sdk35.js');
function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tm-sdk35-'));
  const add=(name,value)=>{const p=path.join(dir,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,value);};
  add('build.gradle',"dependencies {\n    classpath 'com.android.tools.build:gradle:8.2.1'\n}\n");
  add('variables.gradle',"ext {\n    minSdkVersion = 22\n    compileSdkVersion = 34\n    targetSdkVersion = 34\n}\n");
  add('gradle/wrapper/gradle-wrapper.properties',"distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2.1-all.zip\n");
  add('app/build.gradle',"android {\n    compileSdk rootProject.ext.compileSdkVersion\n}\n");
  return {dir,read:n=>fs.readFileSync(path.join(dir,n),'utf8'),
    write:add,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
function main(){
  const good=fixture();
  try{
    let res=patch(good.dir);
    assert.strictEqual(res.changed.length,3); // one write per generated Gradle file
    assert(good.read('build.gradle').includes("com.android.tools.build:gradle:8.6.1"));
    assert(good.read('gradle/wrapper/gradle-wrapper.properties').includes('gradle-8.7-all.zip'));
    assert(good.read('variables.gradle').includes('compileSdkVersion = 35'));
    assert(good.read('variables.gradle').includes('targetSdkVersion = 34'));
    assert(good.read('variables.gradle').includes('minSdkVersion = 23'));
    assert.strictEqual((good.read('variables.gradle').match(/minSdkVersion = 23/g)||[]).length,1);
    res=patch(good.dir);
    assert.strictEqual(res.changed.length,0,'idempotence');
  }finally{good.cleanup();}
  const bad=fixture();
  try{
    bad.write('variables.gradle',"ext { compileSdkVersion = 36\n targetSdkVersion = 34\n }\n");
    assert.throws(()=>patch(bad.dir),/Unexpected Gradle versions/);
    assert(bad.read('build.gradle').includes('gradle:8.2.1'),'preflight must be atomic');
  }finally{bad.cleanup();}
  const conflict=fixture();
  try{
    conflict.write('variables.gradle',"ext { minSdkVersion = 22\n compileSdkVersion = 34\n targetSdkVersion = 35\n }\n");
    assert.throws(()=>patch(conflict.dir),/Unexpected targetSdkVersion/);
    assert(conflict.read('build.gradle').includes('gradle:8.2.1'));
  }finally{conflict.cleanup();}
  console.log('[smoke-android-debug-sdk35] PASS: AGP8.6.1/Gradle8.7/SDK35, keep target34, idempotence, fail-closed');
}
main();
