// content/pipeline/parser-engine.js - 核心 6 阶段流水线解析引擎

class UniversalParserEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      enableCleaning: true,
      imageMode: 'download',
      attachmentFolder: 'attachments',
      panguSpacing: true,
      includeFrontmatter: true
    }, options);

    this.transformersRegistry = new TransformersRegistry();
    this.cleaner = (typeof ContentCleaner !== 'undefined') ? new ContentCleaner(this.options) : null;
    this.turndownService = this.initTurndown();
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

    // 处理代码块语言
    service.addRule('fencedCodeBlockWithLang', {
      filter: ['pre'],
      replacement: (content, node) => {
        const lang = node.getAttribute('data-lang') || '';
        const code = node.querySelector('code') ? node.querySelector('code').textContent : node.textContent;
        return `\n\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`;
      }
    });

    // 处理图片：支持标准 Markdown 与 Obsidian 双链语法，并在前后添加独立段落换行
    service.addRule('images', {
      filter: 'img',
      replacement: (content, node) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        if (!src) return '';
        if (node.getAttribute('data-obsidian-wiki') === 'true') {
          return `\n\n![[${src}]]\n\n`;
        }
        return `\n\n![${alt}](${src})\n\n`;
      }
    });

    return service;
  }

  // 盘古排版：中英文、数字之间自动添加空格
  applyPanguSpacing(text) {
    if (!text || !this.options.panguSpacing) return text;
    return text
      // 中文与英文/数字
      .replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2')
      .replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2')
      // 中文与行内代码
      .replace(/([\u4e00-\u9fa5])(`)/g, '$1 $2')
      .replace(/(`)([\u4e00-\u9fa5])/g, '$1 $2');
  }

  // 标题层级平滑
  normalizeHeadings(root) {
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    if (headings.length <= 1) return;

    // 获取所有出现过的层级数字并排序
    const levels = [...new Set(headings.map(h => parseInt(h.tagName.substring(1), 10)))].sort((a, b) => a - b);
    const levelMap = {};
    levels.forEach((lvl, idx) => {
      // 顶级标题映射为 H2（因为 H1 通常是文章主标题），后续按顺序阶梯递增
      levelMap[lvl] = Math.min(6, idx + 2);
    });

    headings.forEach(h => {
      const curLvl = parseInt(h.tagName.substring(1), 10);
      const targetLvl = levelMap[curLvl];
      if (targetLvl && targetLvl !== curLvl) {
        const newHeading = document.createElement(`h${targetLvl}`);
        newHeading.innerHTML = h.innerHTML;
        h.parentNode.replaceChild(newHeading, h);
      }
    });
  }

  // 资源归一化与图片列表提取
  extractAndNormalizeAssets(root, metadata) {
    const images = [];
    const imgElements = root.querySelectorAll('img');
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

      if (this.options.imageMode === 'download') {
        const attFolder = this.options.attachmentFolder || 'attachments';
        // 使用相对路径精确定位 Obsidian 附件
        img.setAttribute('src', `${attFolder}/${cleanFilename}`);
      } else {
        img.setAttribute('src', src);
      }
      imgIndex++;
    }

    return images;
  }

  // 核心入口：执行 6 阶段解析
  async parse(rootElement, metadata = {}) {
    const clone = rootElement.cloneNode(true);

    // 阶段 1: DOM 预处理与噪声清洗
    if (this.cleaner && this.options.enableCleaning) {
      this.cleaner.cleanDOM(clone);
    }

    // 阶段 2: 复杂结构语义重塑 (Transformers)
    this.transformersRegistry.apply(clone);

    // 阶段 3: 语义与标题层级平滑
    this.normalizeHeadings(clone);

    // 阶段 4: 资源规整与图片提取
    const assets = this.extractAndNormalizeAssets(clone, metadata);

    // 阶段 5: AST / Markdown 序列化
    let markdown = this.turndownService.turndown(clone.innerHTML);

    // 阶段 6: 文本去噪与排版优化 (Post-Linter)
    if (this.cleaner && this.options.enableCleaning) {
      markdown = this.cleaner.cleanMarkdown(markdown);
    }
    markdown = this.applyPanguSpacing(markdown);

    // 组装 Frontmatter
    if (this.options.includeFrontmatter && metadata.title) {
      const frontmatter = [
        '---',
        `title: "${metadata.title}"`,
        `source: "${metadata.source || window.location.href}"`,
        `author: "${metadata.author || ''}"`,
        `date: "${metadata.date || new Date().toISOString().split('T')[0]}"`,
        `tags: [${(metadata.tags || ['web-clip']).map(t => `"${t}"`).join(', ')}]`,
        '---\n\n'
      ].join('\n');
      markdown = frontmatter + markdown;
    }

    return {
      metadata,
      markdown,
      assets,
      stats: {
        wordCount: markdown.length,
        imageCount: assets.length
      }
    };
  }
}

if (typeof window !== 'undefined') {
  window.UniversalParserEngine = UniversalParserEngine;
}
