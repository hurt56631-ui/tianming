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
assert(read('tm-wendui-persona-views.js').includes('buildLanguageGuide()'), 'wendui guide missing');
assert(!read('tm-chaoyi-changchao-adapter.js').includes('不可用现代汉语'), 'court forbids modern language');
assert(!read('tm-chaoyi-tinyi.js').includes('文言/半文言'), 'tingyi still requests classical speech');
assert(!read('tm-chaoyi-yuqian.js').includes('文言/半文言'), 'yuqian still requests classical speech');
assert(read('tm-endturn-record-specs.js').includes('现代白话实录体'), 'shilu still classical');
assert(read('tm-benji.js').includes('现代白话'), 'biography still classical');
assert(read('tm-hongyan-office.js').includes('现代白话写回信'), 'letter still classical');
assert(read('tm-endturn-prompt.js').includes('现代白话'), 'endturn guide missing');
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
