// test/run_real_pages.js - 用浏览器实测抓取的真实网页 DOM 运行完整解析管线
// 用法: node test/run_real_pages.js [site ...]   (默认跑 raw_html 下全部站点)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const base = path.join(__dirname, '..');
const SCRIPTS = [
  'lib/turndown.js',
  'lib/turndown-plugin-gfm.js',
  'lib/readability.js',
  'content/cleaner.js',
  'content/pipeline/transformers.js',
  'content/pipeline/parser-engine.js',
  'content/adapters/generic.js',
  'content/adapters/feishu.js',
  'content/adapters/shengcai.js',
  'content/adapters/wechat.js',
  'content/adapters/zhihu.js',
  'content/adapters/yuque.js',
  'content/adapters/notion.js',
  'content/adapters/juejin.js',
  'content/extractor.js'
];

// 站点注册表: raw_html 文件 -> (真实来源 URL, 输出文件名)
const SITES = [
  { key: 'juejin',   file: 'juejin_raw.html',   url: 'https://juejin.cn/post/7229238405406294074',  out: 'Juejin_掘金技术博客实测.md' },
  { key: 'wechat',   file: 'wechat_raw.html',   url: 'https://mp.weixin.qq.com/s/a1sOoC_HTdmQAmZo_hXVuA',      out: 'Wechat_微信公众号文章实测.md' },
  { key: 'zhihu',    file: 'zhihu_raw.html',    url: 'https://zhuanlan.zhihu.com/p/1947288808753173004',     out: 'Zhihu_知乎专栏文章实测.md' },
  { key: 'yuque',    file: 'yuque_raw.html',    url: 'https://www.yuque.com/yuque/ng1qth/kpdrnf',        out: 'Yuque_语雀知识库文档实测.md' },
  { key: 'notion',   file: 'notion_raw.html',   url: 'https://notion.notion.site/Terms-and-Privacy-28ffdd083dc3473e9c2da6ec011b58ac',       out: 'Notion_Notion公开页面实测.md' },
  { key: 'feishu',   file: 'feishu_raw.html',   url: 'https://my.feishu.cn/wiki/AoO3wCiuti54nnkjhT0cm17wn1b/a2',             out: 'Feishu_飞书文档实测.md' },
  { key: 'feishu',   file: 'feishu_user_raw.html', url: 'https://icnqpu3z244v.feishu.cn/wiki/FyMewVEP3i3JR6kO2sccaIMDn9b',  out: 'Feishu_用户实战页面实测.md' },
  { key: 'shengcai', file: 'shengcai_raw.html', url: 'https://wx.zsxq.com/topics/real_topic',       out: 'Shengcai_生财有术精华帖实测.md' },
  { key: 'generic',  file: 'generic_raw.html',  url: 'https://github.blog/',                        out: 'Generic_通用Readability兜底实测.md' }
];

function createEnv(html, url) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true });
  for (const s of SCRIPTS) {
    dom.window.eval(fs.readFileSync(path.join(base, s), 'utf8'));
  }
  return dom.window;
}

// 基础质量断言: 输出必须是合法、可读、图文齐全的 GFM
function qualityCheck(md, name, rawHtmlLen) {
  const problems = [];
  if (md.length < 200) problems.push(`正文过短(${md.length}字符, 原始HTML ${rawHtmlLen}字符), 疑似提取失败`);
  const fences = (md.match(/```/g) || []).length;
  if (fences % 2 !== 0) problems.push('代码围栏未闭合');
  // 未闭合的行内标记粗查
  if ((md.match(/!\[[^\]]*$/gm) || []).length) problems.push('存在未闭合的图片语法');
  const imgCount = (md.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  const bareImgTag = /<img[\s>]/i.test(md);
  if (bareImgTag) problems.push('输出中残留 <img> HTML 标签');
  return { problems, imgCount };
}

async function main() {
  const only = process.argv.slice(2);
  const outputDir = path.join(base, 'test_results');
  fs.mkdirSync(outputDir, { recursive: true });

  let pass = 0, fail = 0, skipped = 0;
  for (const site of SITES) {
    if (only.length && !only.includes(site.key)) continue;
    const rawPath = path.join(base, 'raw_html', site.file);
    if (!fs.existsSync(rawPath)) {
      console.log(`⊘ [${site.key}] 跳过: 未找到 ${rawPath}`);
      skipped++;
      continue;
    }
    const html = fs.readFileSync(rawPath, 'utf8');
    if (html.length < 500) {
      console.log(`⊘ [${site.key}] 跳过: 抓取到的 HTML 只有 ${html.length} 字符, 页面可能未渲染或被拦截`);
      skipped++;
      continue;
    }
    try {
      const win = createEnv(html, site.url);
      const extractor = new win.DramaExtractor({ imageHandling: 'keep' });
      const result = await extractor.extract();
      const outPath = path.join(outputDir, site.out);
      fs.writeFileSync(outPath, result.markdown, 'utf8');
      const { problems, imgCount } = qualityCheck(result.markdown, site.key, html.length);
      const status = problems.length ? '✗' : '✓';
      console.log(`${status} [${site.key}] 标题="${result.metadata.title}" 字数=${result.stats.wordCount} 图片=${result.stats.imageCount}(${imgCount} in md) -> ${site.out}`);
      for (const p of problems) console.log(`    ⚠ ${p}`);
      if (problems.length) fail++; else pass++;
    } catch (e) {
      console.log(`✗ [${site.key}] 解析抛出异常: ${e.message}`);
      fail++;
    }
  }
  console.log(`\n结果: ${pass} 通过, ${fail} 存在问题, ${skipped} 跳过`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('❌ 执行出错:', e); process.exit(1); });
