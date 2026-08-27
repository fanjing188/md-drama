// content/extractor.js - 核心内容提取与 Markdown 转换协调器

class DramaExtractor {
  constructor(settings = {}) {
    this.settings = Object.assign({
      includeFrontmatter: true,
      imageHandling: 'download',
      attachmentFolder: 'attachments',
      enableCallouts: true,
      enableCleaning: true,
      removeNoiseWords: true,
      removeRedundantBlankLines: true,
      panguSpacing: true,
      customBlacklist: []
    }, settings);

    this.logger = (typeof DramaLogger !== 'undefined') ? new DramaLogger('Extractor') : console;
    this.parserEngine = new UniversalParserEngine({
      enableCleaning: this.settings.enableCleaning,
      imageMode: this.settings.imageHandling,
      attachmentFolder: this.settings.attachmentFolder,
      panguSpacing: this.settings.panguSpacing,
      includeFrontmatter: this.settings.includeFrontmatter,
      removeNoiseWords: this.settings.removeNoiseWords,
      removeRedundantBlankLines: this.settings.removeRedundantBlankLines,
      customBlacklist: this.settings.customBlacklist
    });
  }

  // 优先按专用站点适配器匹配，未命中则走强大的通用 Readability + 语义流水线解析
  getAdapter() {
    const url = window.location.href;
    if (typeof FeishuAdapter !== 'undefined' && FeishuAdapter.matches(url)) return FeishuAdapter;
    if (typeof ShengcaiAdapter !== 'undefined' && ShengcaiAdapter.matches(url)) return ShengcaiAdapter;
    if (typeof WechatAdapter !== 'undefined' && WechatAdapter.matches(url)) return WechatAdapter;
    if (typeof ZhihuAdapter !== 'undefined' && ZhihuAdapter.matches(url)) return ZhihuAdapter;
    if (typeof YuqueAdapter !== 'undefined' && YuqueAdapter.matches(url)) return YuqueAdapter;
    if (typeof NotionAdapter !== 'undefined' && NotionAdapter.matches(url)) return NotionAdapter;
    if (typeof JuejinAdapter !== 'undefined' && JuejinAdapter.matches(url)) return JuejinAdapter;
    return GenericAdapter;
  }

  async extract() {
    try {
      this.logger.info('开始匹配页面适配器与元数据提取...');
      const adapter = this.getAdapter();
      const metadata = adapter.getMetadata();
      // 飞书等编辑器的文本埋有大量不可见字符(零宽连接符/词连接符/方向控制符等)，
      // 会污染 frontmatter 并导致下载文件名被 Chrome 判非法，源头统一剥离。
      // \p{Cf} 是 Unicode Format 类别(软连字符/BOM/数学不可见运算符/RTL 控制符…)，
      // 外加行分隔符 Zl/Zp
      metadata.title = String(metadata.title || '')
        .replace(/[\p{Cf}\u2028\u2029]/gu, '')
        .trim();
      if (!metadata.title) metadata.title = '未命名剪藏';
      // 适配器可能需要异步预处理（如飞书虚拟列表补渲染），统一 await
      const contentElement = await adapter.extractContent();

      this.logger.info(`适配器 [${adapter.name || 'Generic'}] 提取完毕，进入 6 阶段通用解析流水线...`, { title: metadata.title });
      const result = await this.parserEngine.parse(contentElement, metadata);
      this.logger.info('页面全量解析完成', result.stats);

      // 登录墙检测：飞书/知识星球等平台未登录时只渲染前几百字的预览片段，
      // 剪藏结果会严重缺失——只有当提取到的正文确实非常短（< 600字）且存在登录拦截时，才显式提示用户
      const loginWall = document.querySelector('.login-panel, .sso-login, [class*="login-btn"], [class*="LoginPanel"], .note-login');
      const pageText = document.body ? document.body.innerText : '';
      const hasLoginCta = /登录\/注册|登录后(查看|阅读|继续)|扫码登录/.test(pageText);
      if (loginWall || hasLoginCta) {
        // 纯文本量（剔除 frontmatter 与 URL，长图片链接会虚增字数）
        const pureText = result.markdown
          .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
          .replace(/https?:\/\/\S+/g, '')
          .replace(/[\s#>*\-|`\[\]()!]/g, '');
        if (pureText.length < 600) {
          result.markdown = `> [!WARNING] 疑似登录墙，正文可能不完整\n> 当前页面仅提取到预览片段（可见正文约 ${pureText.length} 字符）。\n> 请先在浏览器中登录该平台并开启自动滚动，再重新剪藏以获取全文。\n\n` + result.markdown;
          this.logger.warn('检测到疑似登录墙，正文可能不完整', { pureText: pureText.length });
        }
      }

      return {
        metadata: result.metadata,
        markdown: result.markdown,
        images: result.assets,
        stats: result.stats
      };
    } catch (err) {
      this.logger.error('内容解析发生异常', { error: err.message, stack: err.stack });
      throw err;
    }
  }
}

if (typeof window !== 'undefined') {
  window.DramaExtractor = DramaExtractor;
}
