'use strict';
// 回归：现代白话属于生成文本层，不得靠改变游戏难度/规则来实现。
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\\u([0-9a-f]{4})/gi, (_, v) => String.fromCharCode(parseInt(v,16)));
const composer = read('tm-prompt-composer.js');
assert(composer.includes('function buildLanguageGuide()'), 'shared modern-language guide missing');
assert(composer.includes('保留 JSON 字段名') || composer.includes('JSON 字段名'), 'structured output contract missing');
assert(!composer.includes('叙事风格·严格文言'), 'composer still requests classical text');
assert(read('tm-utils.js').includes("narrativeStyle: '现代白话'"), 'mode still dictates classical text');
// The split-family contract requires mentioning tm-wendui.js before persona-views.
const dialogue=read('tm-wendui.js'), persona=read('tm-wendui-persona-views.js');
assert(persona.includes('buildLanguageGuide()'), 'wendui guide missing');
assert(persona.includes('【最终对白验收') && persona.includes('慈宁宫的人我会先核查'), 'final NPC style needs a modern actionable example');
assert(persona.indexOf('【最终对白验收') > persona.indexOf('buildLanguageGuide()'), 'modern speech directive must be after era examples');
assert(!persona.includes('言辞用"妾""臣妾""贱妾"'), 'queen still mandates archaic speech');
assert(!persona.includes('动作和神态用括号标注'), 'NPC still requires long stage directions');
assert(dialogue.includes('【最终问对文风】') && dialogue.includes('历史中的古文语气仅作为事实参考'), 'historical NPC turns must not dictate new writing style');
assert(!read('tm-chaoyi-changchao-adapter.js').includes('不可用现代汉语'), 'court forbids modern language');
assert(!read('tm-chaoyi-tinyi.js').includes('文言/半文言'), 'tingyi still requests classical speech');
assert(!read('tm-chaoyi-yuqian.js').includes('文言/半文言'), 'yuqian still requests classical speech');
assert(read('tm-endturn-record-specs.js').includes('现代白话实录体'), 'shilu still classical');
assert(read('tm-benji.js').includes('现代白话'), 'biography still classical');
assert(read('tm-hongyan-office.js').includes('现代白话写回信'), 'letter still classical');
assert(read('tm-endturn-prompt.js').includes('现代白话'), 'endturn guide missing');
assert(!/半文言200-500字|古典中文|纯文言史官体/.test(read('tm-endturn-ai.js')), 'endturn subsidiary response schemas still demand classical language');
// Key safety check: no newly added romance mechanics or coupling in this change.
assert(!composer.includes('buildRomanceContext'), 'unexpected romance coupling');

// NPC 势力有自己的文字生成入口；主 PromptComposer 并不会自动覆盖它们。
const factionDecision = read('tm-faction-npc-llm-decision.js');
assert(factionDecision.includes('content(60-120 字现代白话)'), 'faction decision memorial/edict schema still classical');
assert(factionDecision.includes('所有叙述性字段（含 rationale、content、reason、terms）使用自然现代白话'), 'faction decision narrative fields must use modern Chinese');
assert(!/content\(60-120 字古文\)|content 必须中文古文风/.test(factionDecision), 'old classical decision contract remains');
const factionEnrich = read('tm-faction-npc-llm-enrich.js');
assert(!/古文笔法|古文文风|诏书古文风格/.test(factionEnrich), 'old classical NPC polish prompts remain');
// 运行真实 prompt builder，避免只靠代码里碰巧有“现代白话”四字误判。
const vm = require('vm');
const sandbox = { GM: { facs: [] }, P: { scenarioName: '虚构测试朝代' }, TM: { FactionParadigm: { detect: () => 'generic' } } };
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root, 'tm-faction-npc-llm-enrich.js'), 'utf8'), sandbox, { filename: 'tm-faction-npc-llm-enrich.js' });
const fac = { name: '北镇', leader: '将军甲', derivedHealth: { overall: 72 }, derivedEconomy: { fiscalStress: 18 } };
const memorial = sandbox.TM.FactionNpcLlmEnrich._buildPrompt(fac, { from: '官员乙', to: '将军甲', content: '粮草不足', ruling: '明日筹措' }, 'memorial');
const edict = sandbox.TM.FactionNpcLlmEnrich._buildPrompt(fac, { issuer: '将军甲', type: '军务', trigger: '粮草不足', content: '清点粮草' }, 'edict');
assert(memorial.system.includes('现代白话') && memorial.user.includes('现代白话'), 'actual NPC memorial polish prompt is not modern Chinese');
assert(edict.system.includes('现代白话') && edict.user.includes('现代白话'), 'actual NPC edict polish prompt is not modern Chinese');
assert(memorial.user.includes('粮草不足') && memorial.user.includes('明日筹措') && edict.user.includes('清点粮草'), 'NPC polish prompt must preserve source facts');
assert(!/古文笔法|古文文风|诏书古文风格/.test(memorial.system + memorial.user + edict.system + edict.user), 'actual NPC polish prompts still contain classical instructions');
console.log('[smoke-modern-chinese-prompts] PASS · main and faction NPC writing contracts');
