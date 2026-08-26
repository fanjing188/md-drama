// content/extractor.js - 核心内容提取与 Markdown 转换器

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
      customBlacklist: []
    }, settings);

    this.turndownService = this.initTurndown();
    this.cleaner = (typeof ContentCleaner !== 'undefined') ? new ContentCleaner(this.settings) : null;
  }

  initTurndown() {
    const service = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*'
    });

    if (typeof turndownPluginGfm !== 'undefined') {
      service.use(turndownPluginGfm.gfm);
      service.use(turndownPluginGfm.tables);
      service.use(turndownPluginGfm.strikethrough);
      service.use(turndownPluginGfm.taskListItems);
    }

    // Callout 转换规则（转为 Obsidian 格式 > [!NOTE]）
    service.addRule('callouts', {
      filter: (node) => {
        return node.nodeName === 'BLOCKQUOTE' && node.innerHTML.includes('[!NOTE]');
      },
      replacement: (content) => {
        const lines = content.trim().split('\n');
        return '\n\n' + lines.map(line => `> ${line}`).join('\n') + '\n\n';
      }
    });

    return service;
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
    const adapter = this.getAdapter();
    const metadata = adapter.getMetadata();
    let contentElement = adapter.extractContent();

    // DOM 层面清洗噪声广告和无用浮层
    if (this.cleaner && this.settings.enableCleaning) {
      contentElement = this.cleaner.cleanDOM(contentElement);
    }

    // 提取并清洗所有图片
    const images = [];
    const imgElements = contentElement.querySelectorAll('img');
    let imgIndex = 1;

    for (const img of imgElements) {
      let src = img.getAttribute('data-src') || 
                img.getAttribute('data-original') || 
                img.getAttribute('data-actualsrc') || 
                img.src;
      
      if (!src || src.startsWith('data:image/svg')) continue;

      const alt = img.alt || `image-${imgIndex}`;
      const extMatch = src.match(/\.(jpg|jpeg|png|gif|webp|svg)/i);
      const ext = extMatch ? extMatch[1] : 'png';
      const cleanFilename = `${metadata.title.slice(0, 20)}-${Date.now()}-${imgIndex}.${ext}`.replace(/[/\\?%*:|"<> ]/g, '_');

      images.push({
        originalUrl: src,
        filename: cleanFilename,
        alt: alt
      });

      if (this.settings.imageHandling === 'download') {
        // 替换为 Obsidian 附件路径
        img.setAttribute('src', `${this.settings.attachmentFolder}/${cleanFilename}`);
      } else {
        img.setAttribute('src', src);
      }
      imgIndex++;
    }

    let markdown = this.turndownService.turndown(contentElement.innerHTML);

    // Markdown 层面清洗套话/废话词与多余空行
    if (this.cleaner && this.settings.enableCleaning) {
      markdown = this.cleaner.cleanMarkdown(markdown);
    }

    // 组装 Frontmatter
    if (this.settings.includeFrontmatter) {
      const frontmatter = [
        '---',
        `title: "${metadata.title}"`,
        `source: "${metadata.source}"`,
        `author: "${metadata.author}"`,
        `date: "${metadata.date}"`,
        `tags: [${metadata.tags.map(t => `"${t}"`).join(', ')}]`,
        '---\n\n'
      ].join('\n');
      markdown = frontmatter + markdown;
    }

    return {
      metadata,
      markdown,
      images
    };
  }
}

if (typeof window !== 'undefined') {
  window.DramaExtractor = DramaExtractor;
}
