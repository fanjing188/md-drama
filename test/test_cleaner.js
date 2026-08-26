// test/test_cleaner.js - 测试内容清洗、去噪与格式化功能
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const cleanerCode = fs.readFileSync(path.join(__dirname, '../content/cleaner.js'), 'utf8');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously"
});

dom.window.eval(cleanerCode);
const ContentCleaner = dom.window.ContentCleaner;

function testCleaner() {
  const cleaner = new ContentCleaner({
    removeNoiseWords: true,
    removeRedundantBlankLines: true,
    customBlacklist: ['优惠券', '加入VIP社群']
  });

  // 测试 Markdown 文本清洗
  const rawMarkdown = `
# 行业干货分享

话不多说，我们直接进入正题！

这是真正的核心正文内容。


记得点赞关注在看支持一下哦！

点击上方名片关注我们，免费领取优惠券。
欢迎加入VIP社群交流。

免责声明：本内容仅供参考。
  `;

  const cleaned = cleaner.cleanMarkdown(rawMarkdown);
  console.log("=== 清洗后的 Markdown ===");
  console.log(cleaned);

  // 断言
  if (cleaned.includes('话不多说')) throw new Error('废话过滤失败');
  if (cleaned.includes('点赞关注')) throw new Error('点赞关注话术过滤失败');
  if (cleaned.includes('优惠券')) throw new Error('自定义黑名单过滤失败');
  if (cleaned.includes('加入VIP社群')) throw new Error('自定义黑名单过滤失败');
  if (!cleaned.includes('这是真正的核心正文内容。')) throw new Error('有效正文被误删');

  console.log("\n✅ [测试通过] ContentCleaner 内容清洗与去噪功能验证完毕！");
}

try {
  testCleaner();
} catch (e) {
  console.error("❌ 清洗测试失败:", e.message);
  process.exit(1);
}
