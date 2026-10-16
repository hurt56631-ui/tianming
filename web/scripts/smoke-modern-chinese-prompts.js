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
console.log('[smoke-modern-chinese-prompts] PASS · 13 checks');
