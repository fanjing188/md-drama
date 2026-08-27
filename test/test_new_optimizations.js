const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const assert = require('assert');

const turndownCode = fs.readFileSync(path.join(__dirname, '../lib/turndown.js'), 'utf8');
const turndownGfmCode = fs.readFileSync(path.join(__dirname, '../lib/turndown-plugin-gfm.js'), 'utf8');
const cleanerCode = fs.readFileSync(path.join(__dirname, '../content/cleaner.js'), 'utf8');
const transformersCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/transformers.js'), 'utf8');
const parserEngineCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/parser-engine.js'), 'utf8');
const genericCode = fs.readFileSync(path.join(__dirname, '../content/adapters/generic.js'), 'utf8');
const feishuCode = fs.readFileSync(path.join(__dirname, '../content/adapters/feishu.js'), 'utf8');
const extractorCode = fs.readFileSync(path.join(__dirname, '../content/extractor.js'), 'utf8');

function createEnv(html, url) {
  const dom = new JSDOM(html, { url, runScripts: "dangerously" });
  dom.window.eval(turndownCode);
  dom.window.eval(turndownGfmCode);
  dom.window.eval(cleanerCode);
  dom.window.eval(transformersCode);
  dom.window.eval(parserEngineCode);
  dom.window.eval(genericCode);
  dom.window.eval(feishuCode);
  dom.window.eval(extractorCode);
  return dom.window;
}

async function testFeishuAiSummaryRemoval() {
  console.log('--- 测试 1: 飞书 AI 速读/摘要板块剔除 ---');
  const html = `
    <div class="docx-title-text">飞书自动化实战指南</div>
    <div class="docx-page-block" data-block-type="page">
      <div class="docx-ai-panel" data-block-type="ai_digest">
        <h3>AI 速读</h3>
        <p>这是AI生成的概括，不应该出现在正文中。</p>
      </div>
      <div class="callout-block" data-block-type="callout">
        <p>AI 摘要：核心观点总结</p>
      </div>
      <div class="block docx-heading1-block" data-block-type="heading1" data-block-id="1">
        <div class="ace-line">飞书正文真实一级标题</div>
      </div>
      <div class="block docx-text-block" data-block-type="text" data-block-id="2">
        <div class="ace-line">这是真实的飞书正文第一段。</div>
      </div>
    </div>
  `;

  const win = createEnv(html, 'https://sample.feishu.cn/docx/test123');
  const extractor = new win.DramaExtractor();
  const res = await extractor.extract();

  console.log('飞书解析 Markdown 结果:\n', res.markdown);
  assert(!res.markdown.includes('这是AI生成的概括'), 'AI速读内容未能被剔除');
  assert(!res.markdown.includes('AI 摘要'), 'AI摘要内容未能被剔除');
  assert(res.markdown.includes('飞书正文真实一级标题'), '丢失了正文标题');
  assert(res.markdown.includes('这是真实的飞书正文第一段'), '丢失了正文段落');
  console.log('✓ 飞书 AI 速读与摘要板块成功剔除！');
}

async function testImageSpacingForObsidian() {
  console.log('\n--- 测试 2: Obsidian 图片全宽段落隔离排版 ---');
  const html = `
    <article>
      <h1>文档标题</h1>
      <p>这是文字介绍段落。</p>
      <img src="https://example.com/test.png" alt="测试大图" />
      <p>这是图片之后的文字段落。</p>
    </article>
  `;

  const win = createEnv(html, 'https://example.com/post/1');
  const extractor = new win.DramaExtractor({ imageHandling: 'download', attachmentFolder: 'attachments' });
  const res = await extractor.extract();

  console.log('解析 Markdown 结果:\n', res.markdown);
  assert(res.markdown.includes('\n\n![测试大图](attachments/'), '图片前后未添加双换行独立隔离');
  console.log('✓ 图片前后双换行隔离排版验证通过！');
}

async function run() {
  try {
    await testFeishuAiSummaryRemoval();
    await testImageSpacingForObsidian();
    console.log('\n🎉 所有新特性与细节优化测试 100% 通过！');
  } catch (e) {
    console.error('❌ 测试失败:', e);
    process.exit(1);
  }
}

run();
