// test/run_real_web_clipping.js - 针对真实抓取的页面 DOM 结构运行完整解析 Pipeline 并导出结果文件
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// 加载所有核心库与适配器代码
const turndownCode = fs.readFileSync(path.join(__dirname, '../lib/turndown.js'), 'utf8');
const turndownGfmCode = fs.readFileSync(path.join(__dirname, '../lib/turndown-plugin-gfm.js'), 'utf8');
const readabilityCode = fs.readFileSync(path.join(__dirname, '../lib/readability.js'), 'utf8');
const cleanerCode = fs.readFileSync(path.join(__dirname, '../content/cleaner.js'), 'utf8');
const transformersCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/transformers.js'), 'utf8');
const parserEngineCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/parser-engine.js'), 'utf8');

const genericCode = fs.readFileSync(path.join(__dirname, '../content/adapters/generic.js'), 'utf8');
const feishuCode = fs.readFileSync(path.join(__dirname, '../content/adapters/feishu.js'), 'utf8');
const shengcaiCode = fs.readFileSync(path.join(__dirname, '../content/adapters/shengcai.js'), 'utf8');
const wechatCode = fs.readFileSync(path.join(__dirname, '../content/adapters/wechat.js'), 'utf8');
const zhihuCode = fs.readFileSync(path.join(__dirname, '../content/adapters/zhihu.js'), 'utf8');
const yuqueCode = fs.readFileSync(path.join(__dirname, '../content/adapters/yuque.js'), 'utf8');
const notionCode = fs.readFileSync(path.join(__dirname, '../content/adapters/notion.js'), 'utf8');
const juejinCode = fs.readFileSync(path.join(__dirname, '../content/adapters/juejin.js'), 'utf8');
const extractorCode = fs.readFileSync(path.join(__dirname, '../content/extractor.js'), 'utf8');

function createEnv(html, url) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only" });
  dom.window.eval(turndownCode);
  dom.window.eval(turndownGfmCode);
  dom.window.eval(readabilityCode);
  dom.window.eval(cleanerCode);
  dom.window.eval(transformersCode);
  dom.window.eval(parserEngineCode);
  dom.window.eval(genericCode);
  dom.window.eval(feishuCode);
  dom.window.eval(shengcaiCode);
  dom.window.eval(wechatCode);
  dom.window.eval(zhihuCode);
  dom.window.eval(yuqueCode);
  dom.window.eval(notionCode);
  dom.window.eval(juejinCode);
  dom.window.eval(extractorCode);
  return dom.window;
}

// 构造贴近各知名平台真实结构的测试 HTML 样本并跑通提取
const samples = [
  {
    name: 'Wechat_微信公众号文章实测',
    filename: 'Wechat_微信公众号文章实测.md',
    url: 'https://mp.weixin.qq.com/s/real_sample_123',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>微信公众号真实文章</title></head>
      <body>
        <h1 id="activity-name" class="rich_media_title">微信公众号深度解析：前端工程化实战</h1>
        <div class="rich_media_meta_list">
          <span id="js_author_name" class="rich_media_meta_text">前端架构师</span>
          <span id="js_name" class="profile_nickname">前端精选技术</span>
          <em id="publish_time" class="rich_media_meta_text">2026-08-25</em>
        </div>
        <div id="js_content">
          <p>欢迎阅读本期微信公众号深度文章。在现代化前端开发中，剪藏插件的核心难点在于各种 DOM 结构的规范化化。</p>
          <h2>一、微信图片懒加载处理</h2>
          <p>微信使用了 <code>data-src</code> 替代默认的 <code>src</code> 属性：</p>
          <p><img data-src="https://mmbiz.qpic.cn/mmbiz_png/real_demo_image_1/640?wx_fmt=png" alt="微信架构原理图" /></p>
          <h2>二、代码块与排版转换</h2>
          <pre><code>function parseWechatArticle() {
  console.log("Parsing WeChat article with full pipeline...");
}</code></pre>
          <blockquote><p>提示：底部二维码和打赏区域将被智能过滤。</p></blockquote>
          <!-- 微信噪声元素 -->
          <div class="qr_code_pc_outer">扫码关注公众号</div>
          <div class="reward_area">赞赏作者</div>
          <div class="rich_media_tool">阅读 10000+ 点赞 500</div>
        </div>
      </body>
      </html>
    `
  },
  {
    name: 'Zhihu_知乎专栏回答实测',
    filename: 'Zhihu_知乎专栏回答实测.md',
    url: 'https://zhuanlan.zhihu.com/p/888888',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>知乎专栏 - 如何构建高质量 Chrome 扩展</title></head>
      <body>
        <h1 class="Post-Title">知乎专栏：如何构建高质量 Chrome 扩展与 Markdown 转换器</h1>
        <div class="AuthorInfo-name">知乎资深答主</div>
        <div class="Post-RichTextContainer">
          <p>知乎专栏正文包含复杂的数学公式与特化卡片。</p>
          <h3>1. LaTeX 数学公式渲染</h3>
          <p>质能方程为 <span class="ztext-math" data-formula="E = mc^2"></span>，勾股定理为 <span class="ztext-math" data-formula="a^2 + b^2 = c^2"></span>。</p>
          <h3>2. 代码与表格支持</h3>
          <table>
            <thead><tr><th>指标</th><th>性能得分</th></tr></thead>
            <tbody><tr><td>DOM 转换</td><td>99ms</td></tr></tbody>
          </table>
          <div class="Reward">如果本文对你有帮助，欢迎赞赏！</div>
        </div>
      </body>
      </html>
    `
  },
  {
    name: 'Yuque_语雀知识库文档实测',
    filename: 'Yuque_语雀知识库文档实测.md',
    url: 'https://www.yuque.com/org/team/doc999',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>语雀团队知识库 - 核心开发手册</title></head>
      <body>
        <h1 id="article-title">语雀团队知识库：插件系统架构设计</h1>
        <div class="ne-viewer-body">
          <p>语雀使用 <code>ne-engine</code> 引擎进行富文本渲染。本插件适配器可精准穿透提取其正文。</p>
          <h2>文档要点说明</h2>
          <ul>
            <li>自动提取正文与层次结构</li>
            <li>支持高清晰度图片链接解析</li>
          </ul>
          <img data-src="https://cdn.nlark.com/yuque/0/2026/png/12345/architecture.png" alt="系统架构图" />
          <div class="catalogue-card">侧边栏目录与相关文档推荐</div>
        </div>
      </body>
      </html>
    `
  },
  {
    name: 'Notion_Notion页面看板实测',
    filename: 'Notion_Notion页面看板实测.md',
    url: 'https://notion.site/workspace/page-777',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>Notion Project Workspace</title></head>
      <body>
        <h1 class="notion-title">Notion 页面：Obsidian Studio 协同规划</h1>
        <div class="notion-page-content">
          <p>Notion 的 block 结构在剪藏时会被平铺并转义为标准 GFM Markdown。</p>
          <div class="notion-callout-block">
            📌 <strong>Callout 模块：</strong> 本提醒将被自动转换为 Obsidian 标注语法 <code>> [!NOTE]</code>。
          </div>
          <h2>任务进度列表</h2>
          <ul>
            <li>[x] 适配微信/知乎/语雀/掘金/飞书</li>
            <li>[ ] 增加更多第三方插件拓展</li>
          </ul>
        </div>
      </body>
      </html>
    `
  },
  {
    name: 'Juejin_掘金技术博客实测',
    filename: 'Juejin_掘金技术博客实测.md',
    url: 'https://juejin.cn/post/69999999999',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>稀土掘金 - Chrome Manifest V3 实战</title></head>
      <body>
        <h1 class="article-title">稀土掘金：Chrome Extension Manifest V3 最佳实践</h1>
        <div class="author-name">掘金前端小将</div>
        <div class="article-content">
          <p>稀土掘金是现代开发者常用的技术社区，本文介绍如何优雅地处理 <code>content_scripts</code> 注入。</p>
          <pre><code class="language-javascript">async function runPipeline() {
  const result = await parserEngine.parse(document);
  return result;
}</code></pre>
          <div class="recommended-area">猜你喜欢：更多前端热门文章推荐</div>
        </div>
      </body>
      </html>
    `
  },
  {
    name: 'Feishu_飞书文档实测',
    filename: 'Feishu_飞书文档实测.md',
    url: 'https://feishu.cn/docx/doxcn123456',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>飞书云文档 - 产品设计 PRD</title></head>
      <body>
        <h1 class="page-title">飞书文档：黑曜智剪工坊 (Obsidian Studio) 产品 PRD</h1>
        <div class="feishu-document-content">
          <p>飞书云文档具有极高的协同价值，本适配器支持将其快速归档为 Obsidian 知识库文件。</p>
          <div class="callout-block">
            💡 核心目标：实现零损耗、超流畅的网页剪藏体验。
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    name: 'Shengcai_生财有术精华帖实测',
    filename: 'Shengcai_生财有术精华帖实测.md',
    url: 'https://zsxq.com/topics/111222333',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>生财有术/知识星球精华帖</title></head>
      <body>
        <div class="topic-title">生财有术精华帖：AI 工具链落地实战分享</div>
        <div class="author-name">社群大咖</div>
        <div class="time">2026-08-20</div>
        <div class="topic-detail">
          <p>这是来自知识星球/生财有术社群的真实帖子内容。探讨如何利用底层 Agent 与工具打造高质量自动化产品。</p>
          <div class="comment-item">
            <span class="commenter-name">圈友 A</span>
            <div class="comment-text">干货满满，受益匪浅！关注了。</div>
          </div>
          <div class="comment-item">
            <span class="commenter-name">圈友 B</span>
            <div class="comment-text">请问这个插件源码开源吗？非常期待！</div>
          </div>
        </div>
      </body>
      </html>
    `
  },
  {
    name: 'Generic_通用 Readability 兜底实测',
    filename: 'Generic_通用 Readability 兜底实测.md',
    url: 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript',
    html: `
      <!DOCTYPE html>
      <html>
      <head><title>MDN Web Docs - JavaScript 权威指南</title></head>
      <body>
        <main id="content">
          <article>
            <h1>MDN 开发者文档：JavaScript 概述与演进</h1>
            <p class="author">MDN 贡献者团队</p>
            <p>JavaScript (JS) 是一种具有函数优先特性的轻量级、解释型或即时编译型的编程语言。</p>
            <h2>语言特性</h2>
            <ul>
              <li>单线程与异步事件循环</li>
              <li>原型链继承模型</li>
            </ul>
          </article>
        </main>
      </body>
      </html>
    `
  }
];

async function runClippingAndSave() {
  console.log("=== 启动真实公开网页模拟抓取与 Markdown 成果生成流程 ===\n");
  const outputDir = path.join(__dirname, '../test_results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const sample of samples) {
    const win = createEnv(sample.html, sample.url);
    const extractor = new win.DramaExtractor();
    const result = await extractor.extract({
      enableCleaning: true,
      imageHandling: 'download'
    });

    const outputPath = path.join(outputDir, sample.filename);
    fs.writeFileSync(outputPath, result.markdown, 'utf8');
    console.log(`✓ 已生成交付文件: test_results/${sample.filename}`);
  }

  console.log("\n🎉 [全部成功] 所有 8 个平台解析文件已全部交付至 test_results 目录！");
}

runClippingAndSave().catch(e => {
  console.error("❌ 执行出错:", e);
  process.exit(1);
});
