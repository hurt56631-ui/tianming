// User-side character portrait and display-name customization. Game identity stays canonical.
(function(root){
  'use strict';
  root.TM=root.TM||{};
  var PREFIX='tm_char_look_v1:';
  function sessionKey(){var g=root.GM||{};return [g._campaignId||g.sid||'unknown',g._timelineId||'main'].map(encodeURIComponent).join(':');}
  function identity(ch){return String(ch&&ch.id!=null&&ch.id!==''?'id:'+ch.id:'name:'+String(ch&&ch.name||''));}
  function key(ch){return PREFIX+sessionKey()+':'+encodeURIComponent(identity(ch));}
  function read(ch){try {var v=JSON.parse(localStorage.getItem(key(ch))||'{}');return v&&typeof v==='object'?v:{};}catch(_){return {};}}
  function displayName(ch){return read(ch).displayName||ch.name||'';}
  function portrait(ch){return read(ch).portrait||ch.portrait||'';}
  function set(ch,patch){
    if(!ch||!ch.name)throw new Error('当前人物无效');
    var before=read(ch),after=Object.assign({},before,patch);
    if(after.displayName){
      after.displayName=String(after.displayName).trim().slice(0,24);
      if(/[<>]/.test(after.displayName))throw new Error('名称不能包含尖括号');
    }
    if(after.portrait && !/^data:image\/(?:jpeg|webp|png);base64,/.test(after.portrait))throw new Error('图片格式不正确');
    try{localStorage.setItem(key(ch),JSON.stringify(after));}catch(e){throw new Error('此设备图片存储空间不足，请换一张较小的图片');}
    return after;
  }
  function refresh(){
    try{if(root.TMZhi&&typeof root.TMZhi.invalidatePeople==='function')root.TMZhi.invalidatePeople();}catch(_){}
    try{if(typeof root.renderRenwu==='function')root.renderRenwu(true);}catch(_){}
  }
  function compress(file){
    return new Promise(function(resolve,reject){
      if(!file||!/^image\/(png|jpeg|webp)$/i.test(file.type))return reject(new Error('只支持 JPG、PNG、WebP 图片'));
      if(file.size>12*1024*1024)return reject(new Error('原图不能超过 12MB'));
      var reader=new FileReader();
      reader.onerror=function(){reject(new Error('读取图片失败'));};
      reader.onload=function(){
        var image=new Image();
        image.onerror=function(){reject(new Error('无法解码图片'));};
        image.onload=function(){
          var w=image.naturalWidth,h=image.naturalHeight;if(!w||!h)return reject(new Error('图片尺寸不正确'));
          var k=Math.min(1,384/Math.max(w,h)),canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(w*k));canvas.height=Math.max(1,Math.round(h*k));
          var ctx=canvas.getContext('2d');if(!ctx)return reject(new Error('当前设备不支持图片压缩'));
          ctx.fillStyle='#eee5d5';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg',0.79));
        };image.src=reader.result;
      };reader.readAsDataURL(file);
    });
  }
  function pick(name){
    var ch=root.findCharByName&&root.findCharByName(name);
    if(!ch)return alert('没有找到人物，请重新打开人物图志');
    var input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.style.display='none';
    document.body.appendChild(input);
    input.onchange=async function(){
      try{if(input.files&&input.files[0]){set(ch,{portrait:await compress(input.files[0])});refresh();if(root.toast)root.toast('头像已更换，仅此设备生效');}}
      catch(e){if(root.toast)root.toast('更换头像失败：'+e.message);}
      finally{input.remove();}
    };
    input.click();
    setTimeout(function(){if(input.isConnected)input.remove();},60000);
  }
  function rename(name){
    var ch=root.findCharByName&&root.findCharByName(name);
    if(!ch)return;
    var current=read(ch).displayName||ch.name;
    var next=root.prompt('人物显示名称（不改变存档内部姓名及血缘关系）',current);
    if(next===null)return;
    try{set(ch,{displayName:String(next).trim()||ch.name});refresh();if(root.toast)root.toast('人物显示名已更新');}
    catch(e){if(root.toast)root.toast(e.message);}
  }
  function clear(name){
    var ch=root.findCharByName&&root.findCharByName(name);if(!ch)return;
    try{localStorage.removeItem(key(ch));refresh();if(root.toast)root.toast('人物外观已恢复默认');}catch(_){}
  }
  root.TM.CharAppearance={read:read,displayName:displayName,portrait:portrait,set:set,pick:pick,rename:rename,clear:clear};
})(window);
