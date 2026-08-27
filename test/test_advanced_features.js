// test/test_advanced_features.js - 测试 Mermaid 图表提取、Diff 高亮与关键词双链
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const turndownCode = fs.readFileSync(path.join(__dirname, '../lib/turndown.js'), 'utf8');
const turndownGfmCode = fs.readFileSync(path.join(__dirname, '../lib/turndown-plugin-gfm.js'), 'utf8');
const cleanerCode = fs.readFileSync(path.join(__dirname, '../content/cleaner.js'), 'utf8');
const transformersCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/transformers.js'), 'utf8');
const parserEngineCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/parser-engine.js'), 'utf8');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously"
});

dom.window.eval(turndownCode);
dom.window.eval(turndownGfmCode);
dom.window.eval(cleanerCode);
dom.window.eval(transformersCode);
dom.window.eval(parserEngineCode);

const UniversalParserEngine = dom.window.UniversalParserEngine;

async function testAdvanced() {
  const engine = new UniversalParserEngine({
    enableCleaning: true,
    autoWikilinks: ['Obsidian', 'SEO', '出海']
  });

  const rawHTML = `
    <div>
      <h2>架构设计说明</h2>
      <p>我们在做出海项目时，使用SEO策略配合Obsidian做知识管理。</p>

      <!-- 测试 Mermaid 还原 -->
      <div class="mermaid" data-mermaid="graph TD; A[用户] --> B[Chrome插件]; B --> C[Obsidian];"></div>

      <!-- 测试 Diff 代码对比 -->
      <div class="diff-table">
        <div class="diff-line blob-code-deletion">- 旧的解析逻辑</div>
        <div class="diff-line blob-code-addition">+ 新的6阶段流水线引擎</div>
      </div>
    </div>
  `;

  const container = dom.window.document.createElement('div');
  container.innerHTML = rawHTML;

  const result = await engine.parse(container, {
    title: '高级特性测试'
  });

  console.log("=== 高级特性解析结果 ===");
  console.log(result.markdown);

  // 断言
  if (!result.markdown.includes('```mermaid\ngraph TD;')) throw new Error('Mermaid 原生还原失败');
  // 注意：代码块内容必须 1:1 保留，盘古排版不得在代码块内插空格
  if (!result.markdown.includes('```diff') || !result.markdown.includes('- 旧的解析逻辑') || !result.markdown.includes('+ 新的6阶段流水线引擎')) {
    throw new Error('代码 Diff 差异还原失败');
  }
  if (!result.markdown.includes('[[出海]]') || !result.markdown.includes('[[SEO]]') || !result.markdown.includes('[[Obsidian]]')) {
    throw new Error('关键词自动双链注入失败');
  }

  console.log("\n✅ [测试通过] Mermaid 原生还原、Diff 对比高亮与自动双链验证完毕！");
}

testAdvanced().catch(e => {
  console.error("❌ 测试失败:", e);
  process.exit(1);
});
