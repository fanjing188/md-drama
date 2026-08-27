// test/test_invisible_chars.js - 验证不可见字符清洗：用用户真实输出文件中的污染标题
const fs = require('fs');

// 与 content/extractor.js 中一致的清洗正则（显式转义版本）
const INVISIBLE_RE = /[\p{Cf}\u2028\u2029]/gu;

const rawLine = fs.readFileSync('/Users/fanjing/Downloads/md-drama-1787802018674.md', 'utf8').split('\n')[1];
const dirty = rawLine.replace(/^title: "|"$/g, '');
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
console.log(clean === expected ? '✓ 清洗结果与预期完全一致' : `✗ 不一致，期望: ${expected}`);
