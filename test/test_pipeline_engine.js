// test/test_pipeline_engine.js - 测试 6 阶段通用流水线引擎
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

async function testPipeline() {
  const engine = new UniversalParserEngine({
    enableCleaning: true,
    imageMode: 'download',
    panguSpacing: true,
    includeFrontmatter: true
  });

  const rawHTML = `
    <div>
      <h4>不规范的子标题</h4>
      <p>这是包含English单词和123数字的中文句子。</p>
      
      <!-- 复杂结构 1: KaTeX 数学公式 -->
      <span class="katex math-inline" data-math="E = mc^2">
        <annotation encoding="application/x-tex">E = mc^2</annotation>
      </span>

      <!-- 复杂结构 2: 带行号的代码块 -->
      <pre class="highlight language-javascript">
        <span class="line-numbers">1</span><code>const x = 100;</code>
      </pre>

      <!-- 复杂结构 3: Flex 伪表格 -->
      <div class="grid-table">
        <div class="grid-row">
          <div class="grid-cell" role="columnheader">模块</div>
          <div class="grid-cell" role="columnheader">状态</div>
        </div>
        <div class="grid-row">
          <div class="grid-cell">Parser</div>
          <div class="grid-cell">Ready</div>
        </div>
      </div>

      <!-- 废话与噪声广告 -->
      <div class="ad-container">这是侧边栏广告</div>
      <p>话不多说，我们直接进入正题！</p>
      <p>记得点赞关注在看支持一下哦！</p>
    </div>
  `;

  const container = dom.window.document.createElement('div');
  container.innerHTML = rawHTML;

  const result = await engine.parse(container, {
    title: '深度解析测试文档',
    author: 'Hermes Tester'
  });

  console.log("=== 6 阶段通用流水线解析结果 ===");
  console.log(result.markdown);

  // 断言
  if (!result.markdown.includes('$E = mc^2$')) throw new Error('KaTeX 公式还原失败');
  if (!result.markdown.includes('```javascript')) throw new Error('代码块语言标记与去噪失败');
  if (result.markdown.includes('1const x')) throw new Error('代码块行号未剔除干净');
  if (!result.markdown.includes('| 模块 | 状态 |')) throw new Error('Flex 伪表格重构失败');
  if (result.markdown.includes('点赞关注')) throw new Error('废话词去噪失败');
  if (result.markdown.includes('侧边栏广告')) throw new Error('DOM 广告去噪失败');

  console.log("\n✅ [测试通过] UniversalParserEngine 6 阶段通用流水线与高级排版验证完毕！");
}

testPipeline().catch(err => {
  console.error("❌ 单元测试失败:", err);
  process.exit(1);
});
