// test/test_all_adapters.js - 测试各大知识库与主流内容站适配器
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const turndownCode = fs.readFileSync(path.join(__dirname, '../lib/turndown.js'), 'utf8');
const turndownGfmCode = fs.readFileSync(path.join(__dirname, '../lib/turndown-plugin-gfm.js'), 'utf8');
const cleanerCode = fs.readFileSync(path.join(__dirname, '../content/cleaner.js'), 'utf8');
const transformersCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/transformers.js'), 'utf8');
const parserEngineCode = fs.readFileSync(path.join(__dirname, '../content/pipeline/parser-engine.js'), 'utf8');

// 加载所有 Adapters
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
  const dom = new JSDOM(html, { url, runScripts: "dangerously" });
  dom.window.eval(turndownCode);
  dom.window.eval(turndownGfmCode);
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

async function testAdapters() {
  console.log("=== 开始执行常用知识网站专属适配器测试 ===");

  // 1. 测试微信公众号
  {
    const html = `
      <h1 id="activity-name">微信爆款文章解析</h1>
      <span id="js_author_name">科技前沿</span>
      <div id="js_content">
        <p>这是微信正文核心段落。</p>
        <img data-src="https://mmbiz.qpic.cn/test1.png" alt="微信配图" />
        <div class="qr_code_pc_outer">二维码噪声</div>
      </div>
    `;
    const win = createEnv(html, "https://mp.weixin.qq.com/s/sample123");
    const extractor = new win.DramaExtractor();
    const res = await extractor.extract();
    if (!res.markdown.includes('这是微信正文核心段落。')) throw new Error('微信正文提取失败');
    if (res.markdown.includes('二维码噪声')) throw new Error('微信二维码噪声未过滤');
    if (res.images.length === 0) throw new Error('微信 data-src 图片未解析');
    console.log("✓ 微信公众号适配器测试通过");
  }

  // 2. 测试知乎专栏
  {
    const html = `
      <h1 class="Post-Title">知乎高赞回答精选</h1>
      <div class="AuthorInfo-name">优秀答主</div>
      <div class="Post-RichTextContainer">
        <p>知乎核心干货分享。</p>
        <span class="ztext-math" data-formula="x^2 + y^2 = z^2"></span>
        <div class="Reward">赞赏按钮</div>
      </div>
    `;
    const win = createEnv(html, "https://zhuanlan.zhihu.com/p/123456");
    const extractor = new win.DramaExtractor();
    const res = await extractor.extract();
    if (!res.markdown.includes('知乎核心干货分享。')) throw new Error('知乎正文提取失败');
    if (!res.markdown.includes('$x^2 + y^2 = z^2$')) throw new Error('知乎公式解析失败');
    if (res.markdown.includes('赞赏按钮')) throw new Error('知乎赞赏噪声未过滤');
    console.log("✓ 知乎专栏适配器测试通过");
  }

  // 3. 测试语雀
  {
    const html = `
      <h1 id="article-title">语雀团队知识库</h1>
      <div class="ne-viewer-body">
        <p>语雀架构设计方案文档。</p>
        <img data-src="https://cdn.nlark.com/test.png" alt="语雀配图" />
        <div class="catalogue-card">目录导航</div>
      </div>
    `;
    const win = createEnv(html, "https://www.yuque.com/org/doc123");
    const extractor = new win.DramaExtractor();
    const res = await extractor.extract();
    if (!res.markdown.includes('语雀架构设计方案文档。')) throw new Error('语雀正文提取失败');
    if (res.markdown.includes('目录导航')) throw new Error('语雀目录噪声未过滤');
    console.log("✓ 语雀知识库适配器测试通过");
  }

  // 4. 测试 Notion
  {
    const html = `
      <h1 class="notion-title">Notion 项目看板</h1>
      <div class="notion-page-content">
        <p>这是 Notion 页面内容。</p>
        <div class="notion-callout-block">注意：这是重要提醒</div>
      </div>
    `;
    const win = createEnv(html, "https://notion.site/my-page-123");
    const extractor = new win.DramaExtractor();
    const res = await extractor.extract();
    if (!res.markdown.includes('这是 Notion 页面内容。')) throw new Error('Notion 正文提取失败');
    if (!res.markdown.includes('[!NOTE]')) throw new Error('Notion Callout 转换失败');
    console.log("✓ Notion 适配器测试通过");
  }

  // 5. 测试掘金
  {
    const html = `
      <h1 class="article-title">掘金前端进阶指南</h1>
      <div class="article-content">
        <p>掘金技术文章正文。</p>
        <div class="recommended-area">相关推荐</div>
      </div>
    `;
    const win = createEnv(html, "https://juejin.cn/post/12345");
    const extractor = new win.DramaExtractor();
    const res = await extractor.extract();
    if (!res.markdown.includes('掘金技术文章正文。')) throw new Error('掘金正文提取失败');
    if (res.markdown.includes('相关推荐')) throw new Error('掘金推荐噪声未过滤');
    console.log("✓ 掘金技术博客适配器测试通过");
  }

  // 6. 测试飞书/Lark Docx 文档
  {
    const html = `
      <div class="docx-title-text">飞书自动化实战指南</div>
      <div class="docx-page-block" data-block-type="page">
        <div class="block docx-heading1-block" data-block-type="heading1" data-block-id="1">
          <div class="ace-line">一、出海实战核心策略</div>
        </div>
        <div class="block docx-text-block" data-block-type="text" data-block-id="2">
          <div class="ace-line">这是飞书文档正文核心段落，详细讲解全自动化建站流程。</div>
        </div>
        <div class="block docx-callout-block" data-block-type="callout" data-block-id="3">
          <div class="callout-block-children">
            <p>关键注意事项：需要配置好域名解析与 GSC 监控。</p>
          </div>
        </div>
        <div class="block docx-image-block" data-block-type="image" data-block-id="4">
          <div class="gpf-biz-action-manager-forbidden-placeholder">附件不支持打印</div>
          <img src="https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/v2/cover/test-token/" alt="飞书文档 - 配图" />
        </div>
      </div>
    `;
    const win = createEnv(html, "https://sample.feishu.cn/wiki/test12345");
    const extractor = new win.DramaExtractor();
    const res = await extractor.extract();
    if (!res.markdown.includes('一、出海实战核心策略')) throw new Error('飞书标题提取失败');
    if (!res.markdown.includes('这是飞书文档正文核心段落，详细讲解全自动化建站流程。')) throw new Error('飞书正文段落提取失败');
    if (!res.markdown.includes('[!NOTE]')) throw new Error('飞书 Callout 提取失败');
    if (res.markdown.includes('附件不支持打印')) throw new Error('飞书打印占位噪声未清洗');
    if (res.images.length === 0) throw new Error('飞书图片未提取');
    console.log("✓ 飞书文档适配器测试通过");
  }

  // 7. 测试生财有术 / 知识星球
  {
    const html = `
      <div class="topic-title">生财有术实战大航海复盘</div>
      <div class="author-name">亦仁</div>
      <div class="time">2026-08-20</div>
      <div class="topic-detail">
        <div class="topic-text">
          <p>这是生财有术社群核心精华帖，分享流量出海底层逻辑。</p>
          <img data-origin-src="https://images.zsxq.com/highres123.png" alt="社群配图" />
        </div>
        <div class="comment-item">
          <span class="commenter-name">圈友老王</span>
          <div class="comment-text">写得太透彻了，学习了！</div>
        </div>
      </div>
    `;
    const win = createEnv(html, "https://articles.zsxq.com/id_123456");
    const extractor = new win.DramaExtractor();
    const res = await extractor.extract();
    if (!res.markdown.includes('生财有术社群核心精华帖')) throw new Error('生财正文提取失败');
    if (!res.markdown.includes('圈友老王') || !res.markdown.includes('写得太透彻了')) throw new Error('生财评论区提取失败');
    if (res.images.length === 0) throw new Error('生财图片未解析');
    console.log("✓ 生财有术/知识星球适配器测试通过");
  }

  // 8. 测试通用兜底 (Generic Fallback)
  {
    const html = `
      <html>
        <head><title>任意小众个人博客</title></head>
        <body>
          <article>
            <h1>小众博客标题</h1>
            <p>这是通用 Readability 引擎兜底提取的正文内容。</p>
          </article>
        </body>
      </html>
    `;
    const win = createEnv(html, "https://random-tech-blog.org/p/1");
    const extractor = new win.DramaExtractor();
    const res = await extractor.extract();
    if (!res.markdown.includes('这是通用 Readability 引擎兜底提取的正文内容。')) throw new Error('通用兜底提取失败');
    console.log("✓ 通用 Readability 兜底引擎测试通过");
  }

  console.log("\n🎉 [全部通过] 所有知识库适配器 + 通用兜底解析验证完毕！");
}

testAdapters().catch(e => {
  console.error("❌ 测试失败:", e);
  process.exit(1);
});
