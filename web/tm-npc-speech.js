// Natural, modern-spoken Chinese guard for historical NPC *visible replies*.
// This only edits dialogue strings after JSON parsing; never alters game rules,
// stored monarch orders, model responses, AI schemas, or historical proper names.
(function(global){
'use strict';
var expressions=[
 [/政务倥偬/g,'政务繁忙'],[/日夜操劳/g,'整天忙个不停'],
 [/虽居后宫，亦深感忧心/g,'虽然在后宫，也很担心'],
 [/今日屏退左右/g,'今天让其他人退下后'],
 [/倒不必像在前朝大殿上那般拘泥/g,'我们就不用像在朝堂上那样拘束了'],
 [/近来在宫中/g,'最近在宫里'],[/亲操针黹/g,'自己做针线活'],
 [/减省内廷开销/g,'减少宫里的开销'],[/略尽绵薄之力/g,'出一份力'],
 [/为主忧劳/g,'帮您分担些事'],[/珍重龙体/g,'注意身体'],
 [/莫要/g,'不要'],[/乾纲独断/g,'自己做主'],[/断不/g,'一定不'],
 [/若陛下/g,'如果陛下'],[/臣妾愚见/g,'我的想法'],
 [/国事繁冗/g,'国家的事情很多'],[/恳请圣裁/g,'请您决定'],
 [/朝堂之上/g,'朝堂上'],[/陛下政务/g,'陛下的政务'],
 [/阉党与诸臣纷扰/g,'宦官和大臣之间争执不休'],
 [/最稳固的后盾/g,'可靠的支持'],[/莫要过于/g,'别太'],
 [/些许心意/g,'一点心意'],[/不妨/g,'可以'],[/小憩片刻/g,'休息一会儿'],
 [/安歇片刻/g,'歇一会儿'],[/唯愿/g,'只希望'],
 [/略表寸心/g,'表达一点心意'],[/恕臣妾直言/g,'我想直接说']
];
function clean(input,opts){
  opts=opts||{};
  var s=String(input==null?'':input).trim();
  if(!s)return '';
  // Avoid the automatic role+stage-direction format displayed by old models.
  s=s.replace(/^(?:\s*(?:臣妾|微臣|本宫)?\s*[（(][^）)]{0,48}(?:叩|拜|含泪|眼眶|流泪|请安)[^）)]*[）)]\s*)+/,'').trim();
  for(var i=0;i<expressions.length;i++)s=s.replace(expressions[i][0],expressions[i][1]);
  if(opts.consort===true){
    // A spouse speaking alone is not reciting a memorial. "我" sounds natural.
    s=s.replace(/臣妾/g,'我').replace(/妾身/g,'我');
    s=s.replace(/我虽(?!然)/g,'我虽然').replace(/我亦/g,'我也');
  }
  s=s.replace(/拼死进谏/g,'直接劝您').replace(/粉身碎骨/g,'竭尽全力')
    .replace(/重蹈覆辙/g,'再犯同样的错误').replace(/天颜/g,'您');
  return s.trim();
}
function hint(consort,privateMode){
  return '\n【口语检验】现在是在当面交谈，不是写奏章、古装剧或史书。'+
    '可以称“陛下”，但每段尽量只称一次，拒绝套话和无意义表忠。'+
    (consort?(privateMode?'你是他的妻子，私下自然使用“我”，像夫妻说话。':'你是皇后，公开场合礼貌讲话，也用完整的现代句子。'):'朝臣要直接说实情和方案，不要整段套官样文章。')+
    '尽量用“最近很忙”“我会去查”“我有点担心”“您早点休息”这类日常句式。'+
    '绝对不要“政务倥偬”“亲操针黹”“略尽绵薄”“乾纲独断”“臣妾虽居后宫”“臣妾（含泪叩首）”。'+
    '历史中的古文台词只提供事件事实，不能模仿措辞。';
}
global.TM=global.TM||{};
global.TM.NPCSpeech={clean:clean,hint:hint};
})(window);
