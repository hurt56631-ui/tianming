'use strict';
const assert=require('assert');
const fs=require('fs'), path=require('path'), vm=require('vm');
const ROOT=path.resolve(__dirname,'..','..');
const HELPER=path.join(ROOT,'mobile','scripts','build-debug-apk.js');
const SOURCE=fs.readFileSync(HELPER,'utf8');
const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'mobile','package.json'),'utf8'));
function runMock({first=false,missingArt=false,missingCap=false,stageExit=0,partialNative=false}={}){
  let native=!first,apk=false;
  const commands=[],mobile=path.join(ROOT,'mobile'),android=path.join(mobile,'android');
  const manifest={files:Array.from({length:101},(_,i)=>({path:'assets/test/asset'+i+'.png'}))};
  const fakeFs={
    existsSync(p){
      p=String(p);
      if(p===path.join(ROOT,'web','index.html')||p===path.join(ROOT,'scripts','stage-web-release.js'))return true;
      if(p===path.join(mobile,'node_modules','@capacitor','cli'))return !missingCap;
      if(p===path.join(ROOT,'web','.hot-update-manifest.json'))return true;
      if(p.includes(path.join(ROOT,'web','assets','test')))return !missingArt;
      if(p===android)return native||partialNative;
      if(p===path.join(android,process.platform==='win32'?'gradlew.bat':'gradlew'))return native;
      if(p.endsWith(path.join('app','build','outputs','apk','debug','app-debug.apk')))return apk;
      return false;
    },
    readFileSync(p){if(String(p).endsWith('.hot-update-manifest.json'))return JSON.stringify(manifest);throw new Error('unexpected read '+p);},
    statSync(){return {size:12345678,isFile(){return true;}};}
  };
  const fakeSpawn=(cmd,args)=>{
    const line=[cmd].concat(args).join(' ');
    commands.push(line);
    if(line.includes('run add:android'))native=true;
    if(line.includes('run sync')&&stageExit)return{status:stageExit};
    if(line.includes('assembleDebug'))apk=true;
    return{status:0};
  };
  const module={exports:{}};
  const requireFn=name=>name==='fs'?fakeFs:name==='path'?path:name==='child_process'?{spawnSync:fakeSpawn}:(()=>{throw new Error('unrecognized mock require '+name);})();
  vm.runInNewContext(SOURCE,{require:requireFn,module,__dirname:path.join(mobile,'scripts'),
    process:{platform:process.platform},console:{log(){},error(){}}},{filename:HELPER});
  let error=null;
  try{module.exports.main();}catch(e){error=e;}
  return{error,commands,apk};
}
function run(){
  assert.strictEqual(pkg.scripts['build:apk:debug'],'node scripts/build-debug-apk.js');
  assert(!SOURCE.includes('release.js --publish'),'builder must never publish');
  let r=runMock({first:true});
  assert.ifError(r.error);
  assert.strictEqual(r.commands.length,2);
  assert(r.commands[0].includes('run add:android'));
  assert(r.commands[1].includes('assembleDebug'));
  r=runMock({});
  assert.ifError(r.error);
  assert(r.commands[0].includes('run sync'));
  assert(r.commands[1].includes('assembleDebug'));
  r=runMock({missingCap:true});
  assert(r.error && /npm install/.test(r.error.message));
  assert.strictEqual(r.commands.length,0);
  r=runMock({first:true,partialNative:true});
  assert(r.error && /Gradle wrapper is missing/.test(r.error.message));
  assert.strictEqual(r.commands.length,0);
  r=runMock({missingArt:true});
  assert(r.error && /Missing \d+\/\d+ essential artwork/.test(r.error.message));
  assert.strictEqual(r.commands.length,0,'missing art must abort before staging');
  r=runMock({stageExit:2});
  assert(r.error && /exit 2/.test(r.error.message));
  assert.strictEqual(r.commands.length,1,'staging failure must block Gradle');
  console.log('[smoke-android-debug-apk-builder] PASS: first-run, sync, missing deps/media, native partial, staging gate');
}
run();
