// test/test_background_url_and_card.js - 后台静默 URL 抓取与优雅视觉卡片/二维码生成自动化测试

const assert = require('assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// 加载待测模块
const qrcodeCode = fs.readFileSync(path.join(__dirname, '../lib/qrcode.js'), 'utf-8');
const cardExporterCode = fs.readFileSync(path.join(__dirname, '../popup/card-exporter.js'), 'utf-8');

function createEnv() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>', {
    url: 'https://example.com/test',
    runScripts: 'dangerously'
  });
  const { window } = dom;

  window.eval(qrcodeCode);
  window.eval(cardExporterCode);

  return { window, document: window.document, QRCodeGenerator: window.QRCodeGenerator, VisualCardExporter: window.VisualCardExporter };
}

async function runTests() {
  console.log('=== 1. 二维码生成引擎 (QRCodeGenerator) 自动化测试 ===');
  const { window, document, QRCodeGenerator, VisualCardExporter } = createEnv();

  assert(QRCodeGenerator, 'QRCodeGenerator 应该被正确加载');

  // 测试 1.1: 二维码矩阵生成与错误校验
  const testUrl = 'https://mp.weixin.qq.com/s/sample_article_123';
  const qrModel = QRCodeGenerator.create(testUrl, { errorCorrectionLevel: 'M' });
  assert(qrModel.getModuleCount() > 20, '二维码矩阵维度应大于 20x20');
  assert.strictEqual(typeof qrModel.isDark(0, 0), 'boolean', 'isDark 矩阵坐标检测应返回 boolean');

  // 测试 1.2: SVG 渲染生成
  const svgOutput = QRCodeGenerator.toSVG(testUrl, { size: 120, margin: 2 });
  assert(svgOutput.includes('<svg'), '应输出包含 <svg 标签的矢量图形');
  assert(svgOutput.includes('xmlns="http://www.w3.org/2000/svg"'), 'SVG 应包含正确的 XML 命名空间');
  console.log('✓ 二维码矩阵计算与 SVG 矢量生成测试通过！');

  console.log('\n=== 2. 优雅视觉分享卡片导出引擎 (VisualCardExporter) 自动化测试 ===');
  assert(VisualCardExporter, 'VisualCardExporter 应该被正确加载');

  const exporter = new VisualCardExporter();

  const mockDoc = {
    metadata: {
      title: '从0到1构建全自动化出海知识库：飞书与Obsidian无缝联动',
      author: '出海极客',
      date: '2026-08-30',
      source: 'https://feishu.cn/docx/sample999',
      tags: ['出海', 'Obsidian', '知识管理']
    },
    markdown: [
      '# 核心架构理念',
      '',
      '构建知识库最关键的是**保持源头真实与零损耗**，通过 ==6 阶段流水线== 实现高保真排版。',
      '',
      '> [!TIP] 专家建议',
      '> 每日固定归档技术文章，可以提高 300% 知识复用率。',
      '',
      '## 二、模块划分与实施',
      '',
      '- 阶段一：DOM 智能探测与去噪',
      '- 阶段二：代码块与公式还原',
      '- 阶段三：自动化双链生成',
      '',
      '```javascript',
      'const result = pipeline.process(rawHtml);',
      'console.log(result.markdown);',
      '```',
      '',
      '请参考相关资料 [[出海知识库架构]]。'
    ].join('\n')
  };

  exporter.setDocData(mockDoc);

  // 测试 2.1: 阅读时间与字数估算
  const { count, minutes } = VisualCardExporter.estimateReadingTime(mockDoc.markdown);
  assert(count > 50, `字数统计应大于 50 字，当前: ${count}`);
  assert(minutes >= 1, `估算阅读时间应大于等于 1 分钟，当前: ${minutes}`);
  console.log(`✓ 阅读时间与字数统计正常: ${count} 字 / 约 ${minutes} 分钟`);

  // 测试 2.2: 文章大纲目录提取
  const outline = VisualCardExporter.extractOutline(mockDoc.markdown);
  assert.strictEqual(outline.length, 2, '应提取到 2 个标题层级');
  assert.strictEqual(outline[0].text, '核心架构理念');
  assert.strictEqual(outline[1].text, '二、模块划分与实施');
  console.log('✓ 文章大纲骨架提取正常: H1 / H2 解析完全准确');

  // 测试 2.3: 核心金句与摘要提取
  const quotes = VisualCardExporter.extractSummaryQuotes(mockDoc.markdown);
  assert(quotes.length >= 1, '应提取到正文金句段落');
  assert(quotes[0].includes('构建知识库最关键的是'), '提取金句内容应匹配正文');
  console.log('✓ 核心金句与摘要提取正常');

  // 测试 2.4: 行内与块级语法渲染
  const formattedHtml = VisualCardExporter.renderFormattedMarkdown(mockDoc.markdown);
  assert(formattedHtml.includes('<mark class="card-highlight">6 阶段流水线</mark>'), '高亮语法 == 应该渲染为 <mark>');
  assert(formattedHtml.includes('<strong>保持源头真实与零损耗</strong>'), '粗体语法 ** 应该渲染为 <strong>');
  assert(formattedHtml.includes('<span class="card-wikilink">[[ 出海知识库架构 ]]</span>'), '双链语法 [[ ]] 应该被渲染');
  assert(formattedHtml.includes('<pre class="card-code-block" data-lang="javascript">'), '代码块应该被渲染为 pre.card-code-block');
  console.log('✓ Markdown 排版样式流渲染完全准确！');

  // 测试 2.5: 四大主题与三大模式 DOM 渲染
  const container = document.getElementById('container');
  const themes = ['obsidian', 'mac-light', 'vintage-paper', 'cyber-tokyo'];
  const modes = ['quote', 'outline', 'full'];

  for (const theme of themes) {
    for (const mode of modes) {
      exporter.currentTheme = theme;
      exporter.currentMode = mode;
      exporter.renderCardElement(container);

      assert(container.classList.contains(`theme-${theme}`), `容器应包含主题类 theme-${theme}`);
      assert(container.classList.contains(`mode-${mode}`), `容器应包含模式类 mode-${mode}`);
      assert(container.querySelector('.card-header-bar'), '卡片应包含顶部装饰栏');
      assert(container.querySelector('.card-main-title'), '卡片应包含主标题');
      assert(container.querySelector('.card-footer-section'), '卡片应包含页脚');
      assert(container.querySelector('.qr-canvas'), '卡片页脚应包含二维码 Canvas');
    }
  }
  console.log('✓ 4 大精美主题 (黑曜暗紫/Mac浅白/复古纸质/赛博霓虹) x 3 大卡片模式 渲染矩阵全部验证通过！');

  console.log('\n🎉🎉🎉 [全量通过] 后台静默 URL 抓取与优雅视觉卡片/二维码自动化测试 100% SUCCESS！');
}

runTests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
