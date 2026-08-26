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

  getAdapter() {
    const url = window.location.href;
    if (typeof FeishuAdapter !== 'undefined' && FeishuAdapter.matches(url)) {
      return FeishuAdapter;
    }
    if (typeof ShengcaiAdapter !== 'undefined' && ShengcaiAdapter.matches(url)) {
      return ShengcaiAdapter;
    }
    return GenericAdapter;
  }

  async extract() {
    try {
      this.logger.info('开始匹配页面适配器与元数据提取...');
      const adapter = this.getAdapter();
      const metadata = adapter.getMetadata();
      const contentElement = adapter.extractContent();

      this.logger.info(`适配器 [${adapter.name || 'Generic'}] 提取完毕，进入 6 阶段通用解析流水线...`, { title: metadata.title });
      const result = await this.parserEngine.parse(contentElement, metadata);
      this.logger.info('页面全量解析完成', result.stats);

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
