// test/test_feishu_virtual_harvest.js - 飞书虚拟列表步进收割与长文全量解析仿真测试
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const assert = require('assert');

const turndownCode = fs.readFileSync(path.join(__dirname, '../lib/turndown.js'), 'utf8');
const turndownGfmCode = fs.readFileSync(path.join(__dirname, '../lib/turndown-plugin-gfm.js'), 'utf8');
const cleanerCode = fs.readFileSync(path.join(__dirname, '../content/cleaner.js'), 'utf8');
const utilsCode = fs.readFileSync(path.join(__dirname, '../content/adapters/utils.js'), 'utf8');
const transformersCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/transformers.js'), 'utf8');
const parserEngineCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/parser-engine.js'), 'utf8');
const genericCode = fs.readFileSync(path.join(__dirname, '../content/adapters/generic.js'), 'utf8');
const feishuCode = fs.readFileSync(path.join(__dirname, '../content/adapters/feishu.js'), 'utf8');
const extractorCode = fs.readFileSync(path.join(__dirname, '../content/extractor.js'), 'utf8');

function createEnv(html, url) {
  const dom = new JSDOM(html, { url, runScripts: "dangerously", pretendToBeVisual: true });
  dom.window.eval(turndownCode);
  dom.window.eval(turndownGfmCode);
  dom.window.eval(cleanerCode);
  dom.window.eval(utilsCode);
  dom.window.eval(transformersCode);
  dom.window.eval(parserEngineCode);
  dom.window.eval(genericCode);
  dom.window.eval(feishuCode);
  dom.window.eval(extractorCode);
  return dom;
}

console.log('=== 开始执行飞书虚拟列表动态收割与全量块解析测试 ===');

async function testFeishuVirtualListHarvest() {
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head><title>全自动化出海操盘SOP - 飞书云文档</title></head>
      <body>
        <div class="bear-web-x-container" style="overflow: hidden; height: 800px;">
          <div class="docx-editor" style="overflow-y: auto; height: 800px; max-height: 800px;">
            <div data-block-type="page">
              <div class="docx-title-text">​全自动化‌出海操盘SOP﻿</div>
              <div class="page-block-children">
                <!-- 视口 1 块 -->
                <div data-block-type="heading_1" data-block-id="b_h1">
                  <div class="ace-line">一、项目背景与概览</div>
                </div>
                <div data-block-type="callout" data-block-id="b_callout" style="background-color: rgb(255, 235, 235)">
                  <div class="callout-emoji">🚨</div>
                  <div class="callout-content">注意：所有操作需在合规环境下执行</div>
                </div>
                <div data-block-type="text" data-block-id="b_t1">
                  <div class="ace-line">这是第一段正文，包含 <span data-bold="true">核心业务逻辑</span>。</div>
                </div>

                <!-- 视口 1 下方的虚拟占位符 -->
                <div class="bear-virtual-renderUnit-placeholder" style="height: 1200px;"></div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const dom = createEnv(sampleHtml, 'https://org.feishu.cn/docx/doxcn999888777');
  const FeishuAdapter = dom.window.FeishuAdapter;
  const DramaExtractor = dom.window.DramaExtractor;

  // 1. 验证滚动容器识别
  const scroller = FeishuAdapter.findPrimaryScroller();
  assert.ok(scroller, '必须能够正确识别可滚动的 .docx-editor 容器');
  assert.strictEqual(scroller.className, 'docx-editor', '滚动容器必须为 docx-editor 而非 overflow:hidden 的外层');

  // 2. 验证 Metadata 提取与零宽字符自动清洗
  const meta = FeishuAdapter.getMetadata();
  assert.strictEqual(meta.title, '全自动化出海操盘SOP', '标题必须正确清洗飞书零宽字符与后缀');
  console.log('✓ 飞书元数据提取与不可见字符清洗正常:', meta.title);

  // 3. 执行全流程提取
  const extractor = new DramaExtractor({
    includeFrontmatter: true,
    enableCleaning: true,
    removeNoiseWords: true
  });

  const res = await extractor.extract();
  console.log('解析生成的 Markdown:');
  console.log(res.markdown);

  assert.ok(res.markdown.includes('一、项目背景与概览'), 'Markdown 必须包含标题块内容');
  assert.ok(res.markdown.includes('[!DANGER]'), 'Markdown 必须包含高亮块 Callout');
  assert.ok(res.markdown.includes('核心业务逻辑'), 'Markdown 必须包含文本段落');

  console.log('✓ 飞书长文与虚拟列表解析仿真测试 100% 通过！');
}

testFeishuVirtualListHarvest().then(() => {
  console.log('🎉 飞书核心收割与解析增强测试全部通过！');
}).catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
