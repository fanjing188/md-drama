// test/test_invisible_chars.js - 验证不可见字符清洗：针对富文本编辑器（如飞书）常见零宽字符与格式控制符
const fs = require('fs');

// 与 content/extractor.js 中一致的清洗正则
const INVISIBLE_RE = new RegExp('[\\p{Cf}\\u2028\\u2029\\u200B\\u200C\\u200D\\uFEFF]', 'gu');

let dirty = '';
const fallbackFile = '/Users/fanjing/Downloads/md-drama-1787802018674.md';

if (fs.existsSync(fallbackFile)) {
  const rawLine = fs.readFileSync(fallbackFile, 'utf8').split('\n')[1];
  dirty = rawLine.replace(/^title: "|"$/g, '');
} else {
  // 模拟带有各种不可见字符污染的真实飞书标题 (​ 零宽空格, ‌ 零宽非连接符, ‍ 零宽连接符, ﻿ BOM, ­ 软连字符等)
  dirty = '​全自动化‌月上百站﻿，单月净赚‍3700刀 ：游戏攻略站底层玩法­+新手全套SOP ';
}

console.log('原始标题长度:', dirty.length);

// 统计污染构成
const counts = {};
for (const c of dirty) {
  const cp = c.codePointAt(0);
  if ((cp >= 0x200B && cp <= 0x200F) || (cp >= 0x2028 && cp <= 0x2029) ||
      (cp >= 0x2060 && cp <= 0x2064) || cp === 0xFEFF || cp === 0x00AD ||
      (cp >= 0xFFF9 && cp <= 0xFFFB)) {
    const k = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
    counts[k] = (counts[k] || 0) + 1;
  }
}
console.log('不可见字符分布:', JSON.stringify(counts, null, 0));

const clean = dirty.replace(INVISIBLE_RE, '').trim();
console.log('清洗后:', clean);
console.log('长度:', clean.length);
const expected = '全自动化月上百站，单月净赚3700刀：游戏攻略站底层玩法+新手全套SOP';
if (clean === expected) {
  console.log('✓ 清洗结果与预期完全一致');
} else {
  console.log(`✗ 不一致，期望: ${expected}，实际: ${clean}`);
  process.exit(1);
}
