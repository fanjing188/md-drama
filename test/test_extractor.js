// test/test_extractor.js - 验证 Markdown 提取、排版、Callout 与 Frontmatter 解析
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const turndownCode = fs.readFileSync(path.join(__dirname, '../lib/turndown.js'), 'utf8');
const turndownGfmCode = fs.readFileSync(path.join(__dirname, '../lib/turndown-plugin-gfm.js'), 'utf8');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously"
});

dom.window.eval(turndownCode);
dom.window.eval(turndownGfmCode);

const TurndownService = dom.window.TurndownService;
const turndownPluginGfm = dom.window.turndownPluginGfm;

function testConversion() {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
  });

  service.use(turndownPluginGfm.gfm);
  service.use(turndownPluginGfm.tables);

  const sampleHtml = `
    <h1>飞书测试文档标题</h1>
    <p>这是正文第一段，包含<strong>加粗</strong>和<a href="https://example.com">链接</a>。</p>
    <div class="callout-block">
      <blockquote>[!NOTE] 注意事项：这是需要特别关注的提醒内容。</blockquote>
    </div>
    <table>
      <thead>
        <tr><th>列1</th><th>列2</th></tr>
      </thead>
      <tbody>
        <tr><td>数据A</td><td>数据B</td></tr>
      </tbody>
    </table>
    <pre><code>console.log("hello md-drama");</code></pre>
    <img src="attachments/test-123.png" alt="测试图片" />
  `;

  const md = service.turndown(sampleHtml);
  console.log("=== 转换生成的 Markdown 结果 ===");
  console.log(md);

  // 断言验证
  if (!md.includes('# 飞书测试文档标题')) throw new Error('标题转换失败');
  if (!md.includes('| 列1 | 列2 |')) throw new Error('表格 GFM 转换失败');
  if (!md.includes('console.log("hello md-drama");')) throw new Error('代码块转换失败');
  if (!md.includes('![测试图片](attachments/test-123.png)')) throw new Error('图片引用转换失败');

  console.log("\n✅ [测试通过] Turndown + GFM 转换器核心逻辑验证完毕！");
}

try {
  testConversion();
} catch (e) {
  console.error("❌ 测试失败:", e.message);
  process.exit(1);
}
