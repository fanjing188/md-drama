// test/test_rich_semantics.js - 专门测试飞书富文本全模块与跨渠道增强语义还原
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
const shengcaiCode = fs.readFileSync(path.join(__dirname, '../content/adapters/shengcai.js'), 'utf8');
const wechatCode = fs.readFileSync(path.join(__dirname, '../content/adapters/wechat.js'), 'utf8');
const zhihuCode = fs.readFileSync(path.join(__dirname, '../content/adapters/zhihu.js'), 'utf8');
const yuqueCode = fs.readFileSync(path.join(__dirname, '../content/adapters/yuque.js'), 'utf8');
const notionCode = fs.readFileSync(path.join(__dirname, '../content/adapters/notion.js'), 'utf8');
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
  dom.window.eval(extractorCode);
  return dom.window;
}

async function testFeishuRichSemantics() {
  console.log('=== 1. 飞书多维语义块测试 (Toggle/Callout/多级列表/Bitable/Mindmap/Mentions/Highlight/公式) ===');
  const html = `
    <div class="docx-title-text">飞书综合高级文档</div>
    <div class="docx-page-block" data-block-type="page">
      <!-- 1. 5色 Callout + 自定义 Emoji -->
      <div class="docx-callout-block callout-red" data-block-type="callout" data-block-id="c1">
        <div class="callout-emoji">🚨</div>
        <div class="callout-block-children">高危操作预警：请勿随意删除生产环境数据库。</div>
      </div>
      <div class="docx-callout-block callout-green" data-block-type="callout" data-block-id="c2">
        <div class="callout-emoji">💡</div>
        <div class="callout-block-children">小技巧：开启缓存可以提升 300% 访问性能。</div>
      </div>

      <!-- 2. 可折叠 Toggle 列表 -->
      <div class="docx-toggle-block" data-block-type="toggle" data-folded="true" data-block-id="t1">
        <div class="toggle-header-text">常见问题答疑 Q&A（点击展开）</div>
        <div class="toggle-content">
          <p>答：支持飞书、微信公众号、知乎、语雀、Notion 等多种渠道全量抓取。</p>
        </div>
      </div>

      <!-- 3. 多级嵌套列表 -->
      <div class="docx-ordered-block" data-block-type="ordered" data-indent-level="0" data-block-id="l1">
        <div class="ace-line">第一步：配置 Obsidian 本地 REST API 密钥</div>
      </div>
      <div class="docx-bullet-block" data-block-type="bullet" data-indent-level="1" data-block-id="l2">
        <div class="ace-line">子项 A：打开 Community Plugins</div>
      </div>
      <div class="docx-bullet-block" data-block-type="bullet" data-indent-level="2" data-block-id="l3">
        <div class="ace-line">三级深层项：启用 Local REST API 插件</div>
      </div>

      <!-- 4. 多维表格 Bitable 虚拟网格数据 -->
      <div class="docx-bitable-block" data-block-type="bitable" data-block-id="b1">
        <div class="bitable-grid-view">
          <div class="grid-header">
            <div class="grid-cell">任务名称</div>
            <div class="grid-cell">负责人</div>
            <div class="grid-cell">状态</div>
          </div>
          <div class="grid-row">
            <div class="grid-cell">飞书适配器增强</div>
            <div class="grid-cell">Claude</div>
            <div class="grid-cell">已完成</div>
          </div>
        </div>
      </div>

      <!-- 5. 思维导图 / 画板 -->
      <div class="docx-mindnote-block" data-block-type="mindnote" data-block-id="m1">
        <div class="mindmap-node-text">中心主题：出海架构</div>
        <div class="mindmap-node-text">分支 1：独立站搭建</div>
        <div class="mindmap-node-text">分支 2：SEO 流量获取</div>
      </div>

      <!-- 6. Mentions 双链 / 人员 / 日期 -->
      <div class="docx-text-block" data-block-type="text" data-block-id="p1">
        <div class="ace-line">
          请参考相关文档 <span class="docx-mention-doc" data-token="doc123">2026战略规划</span>，
          负责人是 <span class="docx-mention-user" data-id="u1">张三</span>，
          截止时间为 <span class="docx-mention-date" data-time="1787884800000">2026-08-30</span>。
        </div>
      </div>

      <!-- 7. 文本高亮 -->
      <div class="docx-text-block" data-block-type="text" data-block-id="p2">
        <div class="ace-line">
          这里有 <span class="text-highlight" style="background-color: yellow">极其重要的核心概念</span> 需要重点理解。
        </div>
      </div>

      <!-- 8. LaTeX 数学公式 -->
      <div class="docx-equation-block" data-block-type="equation" data-block-id="eq1">
        <div class="equation-code">E = mc^2</div>
      </div>

      <!-- 9. Monaco 代码块 (带语言头、复制按钮、行号) -->
      <div class="docx-code-block" data-block-type="code" data-lang="python">
        <div class="code-block-header">
          <span class="code-lang">Python</span>
          <button class="copy-btn">复制</button>
        </div>
        <div class="margin">
          <div class="line-numbers">1</div>
          <div class="line-numbers">2</div>
        </div>
        <div class="monaco-editor">
          <div class="view-lines">
            <div class="view-line"><span>def hello_world():</span></div>
            <div class="view-line"><span>    print("Hello Feishu")</span></div>
          </div>
        </div>
      </div>

      <!-- 10. 段落文本块 (data-block-type="paragraph" 无 ace-line) -->
      <div class="docx-paragraph-block" data-block-type="paragraph" data-block-id="p3">
        <div class="text-block-content">
          <span>这是使用通用段落容器渲染的文本，包含 </span><strong>粗体内容</strong>
        </div>
      </div>
    </div>
  `;

  const win = createEnv(html, 'https://sample.feishu.cn/docx/full123');
  const extractor = new win.DramaExtractor();
  const res = await extractor.extract();
  const md = res.markdown;
  console.log('飞书解析 Markdown 结果片段:\n', md);

  assert(md.includes('[!DANGER] 🚨'), '飞书红色 Callout 转换失败');
  assert(md.includes('[!TIP] 💡'), '飞书绿色 Callout 转换失败');
  assert(md.includes('[!FAQ]- 常见问题答疑 Q&A（点击展开）'), '飞书 Toggle 转换失败');
  assert(md.includes('1.  第一步：配置 Obsidian 本地 REST API 密钥') || md.includes('1. 第一步：配置 Obsidian 本地 REST API 密钥'), '飞书一级有序列表提取失败');
  assert(md.includes('- 子项 A：打开 Community Plugins') || md.includes('-   子项 A：打开 Community Plugins'), '飞书二级列表缩进提取失败');
  assert(md.includes('- 三级深层项：启用 Local REST API 插件') || md.includes('-   三级深层项：启用 Local REST API 插件'), '飞书三级列表缩进提取失败');
  assert(md.includes('| 任务名称 | 负责人 | 状态 |'), '飞书 Bitable 表格头转换失败');
  assert(md.includes('| 飞书适配器增强 | Claude | 已完成 |'), '飞书 Bitable 表格行转换失败');
  assert(md.includes('中心主题：出海架构') && md.includes('分支 1：独立站搭建'), '飞书思维导图大纲提取失败');
  assert(md.includes('[[2026 战略规划]]') || md.includes('[[2026战略规划]]'), '飞书文档双链提取失败');
  assert(md.includes('@ 张三') || md.includes('@张三'), '飞书用户 Mention 提取失败');
  assert(md.includes('==极其重要的核心概念=='), '飞书荧光笔高亮转换失败');
  assert(md.includes('$$E = mc^2$$') || md.includes('$E = mc^2$'), '飞书公式解析失败');
  assert(md.includes('```python') && md.includes('def hello_world():') && md.includes('print("Hello Feishu")'), '飞书 Monaco 代码块提取失败');
  assert(!md.includes('Python 复制'), '飞书代码块 UI 文本污染 (头部栏未剔除)');
  assert(!md.includes('line-numbers'), '飞书代码块行号污染');
  assert(md.includes('这是使用通用段落容器渲染的文本，包含 **粗体内容**') || md.includes('这是使用通用段落容器渲染的文本，包含 **粗体内容**') || md.includes('粗体内容'), '飞书通用段落块提取失败');
  console.log('✓ 飞书所有富文本与复杂语义块测试全部通过！\n');
}

async function testWechatSvgPenetration() {
  console.log('=== 2. 微信公众号 SVG foreignObject 穿透与多媒体组件测试 ===');
  const html = `
    <h1 id="activity-name">微信深度排版图文</h1>
    <span id="js_author_name">排版大师</span>
    <div id="js_content">
      <svg viewBox="0 0 100 100">
        <foreignObject width="100" height="100">
          <p>这是被第三方 135/秀米排版器包裹在 SVG 内部的正文文字，不应丢失！</p>
          <img data-src="https://mmbiz.qpic.cn/test_svg_img/640?" alt="排版插图" />
        </foreignObject>
      </svg>
      <mpvoice name="独家语音分享" voice_encode_fileid="12345"></mpvoice>
      <mpvideo data-vid="v9999"></mpvideo>
      <mp-miniprogram data-miniprogram-title="AI 自动化助手"></mp-miniprogram>
    </div>
  `;

  const win = createEnv(html, 'https://mp.weixin.qq.com/s/svg123');
  const extractor = new win.DramaExtractor();
  const res = await extractor.extract();
  const md = res.markdown;
  console.log('微信解析 Markdown 结果:\n', md);

  assert(md.includes('这是被第三方 135/秀米排版器包裹在 SVG 内部的正文文字，不应丢失！'), '微信 SVG foreignObject 穿透失败');
  assert(res.images && res.images.length > 0 && res.images[0].originalUrl.includes('/0?'), '微信图片 /640? 高清替换失败');
  assert(md.includes('微信语音: 独家语音分享'), '微信语音组件提取失败');
  assert(md.includes('https://v.qq.com/x/page/v9999.html'), '微信视频链接提取失败');
  assert(md.includes('小程序: AI 自动化助手'), '微信小程序组件提取失败');
  console.log('✓ 微信 SVG 穿透与媒体组件测试通过！\n');
}

async function testYuqueLakeJsonPayload() {
  console.log('=== 3. 语雀 Lake 2.0 动态 card JSON Payload 解码测试 ===');
  const codePayload = encodeURIComponent(JSON.stringify({
    code: 'const answer = 42;\nconsole.log(answer);',
    mode: 'javascript'
  }));
  const mathPayload = encodeURIComponent(JSON.stringify({
    code: '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    display: 'block'
  }));

  const html = `
    <h1 id="article-title">语雀高级技术架构</h1>
    <div class="ne-viewer-body">
      <ne-p>语雀技术要点概览：</ne-p>
      <ne-card data-card-name="codeblock" data-card-value="${codePayload}"></ne-card>
      <ne-card data-card-name="math" data-card-value="${mathPayload}"></ne-card>
      <ne-alert type="warning">注意：生产部署需验证证书有效期</ne-alert>
    </div>
  `;

  const win = createEnv(html, 'https://www.yuque.com/org/arch123');
  const extractor = new win.DramaExtractor();
  const res = await extractor.extract();
  const md = res.markdown;
  console.log('语雀解析 Markdown 结果:\n', md);

  assert(md.includes('```javascript') && md.includes('const answer = 42;'), '语雀代码块 JSON payload 解码失败');
  assert(md.includes('$$') && md.includes('\\frac{-b') && md.includes('\\sqrt{b^2 - 4ac}'), '语雀多行数学公式 JSON 解码失败');
  assert(md.includes('[!WARNING]'), '语雀 ne-alert 告警盒转换失败');
  console.log('✓ 语雀 Lake 2.0 动态 card 解码测试通过！\n');
}

async function testNotionToggleAndTable() {
  console.log('=== 4. Notion Toggle 列表与 Database 表格转换测试 ===');
  const html = `
    <h1 class="notion-title">Notion 团队知识库</h1>
    <div class="notion-page-content">
      <div class="notion-toggle">
        <div class="notion-toggle-summary">展开查看发布计划</div>
        <div class="notion-toggle-content">
          <p>V1.4.0 将于本周五上线。</p>
        </div>
      </div>
      <div class="notion-collection-view-table">
        <div role="row">
          <div role="columnheader">模块</div>
          <div role="columnheader">进度</div>
        </div>
        <div role="row">
          <div role="cell">Feishu Adapter</div>
          <div role="cell">100%</div>
        </div>
      </div>
    </div>
  `;

  const win = createEnv(html, 'https://notion.site/team-doc-456');
  const extractor = new win.DramaExtractor();
  const res = await extractor.extract();
  const md = res.markdown;
  console.log('Notion 解析 Markdown 结果:\n', md);

  assert(md.includes('[!FAQ]- 展开查看发布计划'), 'Notion Toggle 列表转换失败');
  assert(md.includes('| 模块 | 进度 |'), 'Notion Database 表格头转换失败');
  assert(md.includes('| Feishu Adapter | 100% |'), 'Notion Database 表格行转换失败');
  console.log('✓ Notion Toggle 列表与 Database 表格转换测试通过！\n');
}

async function testShengcaiQaAndMedia() {
  console.log('=== 5. 生财有术 / 知识星球 Q&A 问答与音频测试 ===');
  const html = `
    <div class="topic-title">大航海问答专场</div>
    <div class="author-name">航海教练</div>
    <div class="topic-detail">
      <div class="question-container">
        <div class="ask-user">学员小李</div>
        <div class="ask-content">请问冷启动阶段如何快速验证需求？</div>
      </div>
      <div class="answer-container">
        <div class="answer-user">航海教练</div>
        <div class="answer-content">建议先做 MVP 落地页，跑小额投放测试 CTR 与转化率。</div>
      </div>
      <div class="audio-item" src="https://audio.zsxq.com/test.mp3">
        <div class="audio-title">导师语音解答</div>
      </div>
    </div>
  `;

  const win = createEnv(html, 'https://articles.zsxq.com/qa_999');
  const extractor = new win.DramaExtractor();
  const res = await extractor.extract();
  const md = res.markdown;
  console.log('生财解析 Markdown 结果:\n', md);

  assert(md.includes('[!QUESTION] 提问 (@学员小李)') || md.includes('[!QUESTION] 提问 (@ 学员小李)'), '生财提问块转换失败');
  assert(md.includes('[!TIP] 回答 (@航海教练)') || md.includes('[!TIP] 回答 (@ 航海教练)'), '生财回答块转换失败');
  assert(md.includes('导师语音解答') && md.includes('https://audio.zsxq.com/test.mp3'), '生财音频提取失败');
  console.log('✓ 生财有术 / 知识星球 Q&A 与音频测试通过！\n');
}

async function run() {
  try {
    await testFeishuRichSemantics();
    await testWechatSvgPenetration();
    await testYuqueLakeJsonPayload();
    await testNotionToggleAndTable();
    await testShengcaiQaAndMedia();
    console.log('🎉🎉🎉 [全量通过] 跨渠道全景网页解析与富文本语义还原增强测试 100% SUCCESS！');
  } catch (e) {
    console.error('❌ 测试未通过:', e);
    process.exit(1);
  }
}

run();
