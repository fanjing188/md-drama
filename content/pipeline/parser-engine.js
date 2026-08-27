// content/pipeline/parser-engine.js - 核心 6 阶段流水线解析引擎

class UniversalParserEngine {
  constructor(options = {}) {
    this.options = Object.assign({
      enableCleaning: true,
      imageMode: 'download',
      attachmentFolder: 'attachments',
      panguSpacing: true,
      includeFrontmatter: true,
      autoWikilinks: [] // 关键词双链自动匹配词库
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

    // 处理图片：保留图片在上下文中的原始位置（行内图片保持行内，独立图片自成段落），
    // alt/title 做最小化转义，避免生成未闭合/损坏的 Markdown 图片语法
    service.addRule('images', {
      filter: 'img',
      replacement: (content, node) => {
        const alt = (node.getAttribute('alt') || '')
          .replace(/[\r\n]+/g, ' ')
          .replace(/[\[\]]/g, ' ')
          .trim();
        const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
        if (!src) return '';
        if (node.getAttribute('data-obsidian-wiki') === 'true') {
          return `![[${src}]]`;
        }
        const rawTitle = node.getAttribute('title');
        const title = rawTitle ? ` "${rawTitle.replace(/["\r\n]/g, ' ').trim()}"` : '';
        return `![${alt}](${src}${title})`;
      }
    });

    // <figure> 还原为图片 + 斜体说明文字（figcaption），保证图文位置对应
    service.addRule('figures', {
      filter: 'figure',
      replacement: (content, node) => {
        const caption = node.querySelector('figcaption');
        const captionText = caption ? caption.textContent.replace(/\s+/g, ' ').trim() : '';
        let body = content.trim();
        if (captionText) {
          // content 末尾会带上 figcaption 的纯文本，需剥掉再用斜体重写
          const capEsc = captionText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          body = body.replace(new RegExp(`\\n*${capEsc}\\s*$`), '').trim();
        }
        return captionText ? `\n\n${body}\n\n*${captionText}*\n\n` : `\n\n${body}\n\n`;
      }
    });

    // 单元格内容规整：压缩换行、转义竖线，保证 GFM 表格行不被块级内容拆散
    service.addRule('tableCellInline', {
      filter: ['th', 'td'],
      replacement: (content, node) => {
        const text = content
          .replace(/\u200b/g, '')
          .replace(/\s*\n+\s*/g, ' ')
          .replace(/\|/g, '\\|')
          .trim();
        const idx = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
        return (idx === 0 ? '| ' : ' ') + text + ' |';
      }
    });

    // 块引用与 Callout 规则
    service.addRule('blockquotes', {
      filter: 'blockquote',
      replacement: (content) => {
        let text = content.trim();
        // 还原 Obsidian Callout 语法
        text = text.replace(/\\\[!NOTE\\\]/g, '[!NOTE]').replace(/\*\*\[!NOTE\]\*\*/g, '[!NOTE]');
        // 空行(段落分隔)保留为 ">" 续行, 保证引用块/callout 不会被拆散
        const lines = text.split('\n').map(l => l.replace(/^>\s*/, ''));
        return '\n\n' + lines.map(l => l ? `> ${l}` : '>').join('\n') + '\n\n';
      }
    });

    return service;
  }

  // 将不应被排版/双链改写的片段（frontmatter、代码块、行内代码、链接、图片、双链）
  // 暂存为占位符，处理完后再还原
  protectSyntax(text) {
    const stash = [];
    const keep = (m) => {
      stash.push(m);
      return `\u0000P${stash.length - 1}\u0000`;
    };
    let t = text;
    // 占位符使用控制字符包裹，避免与正文中的普通文字冲突
    // 1. YAML frontmatter（文件头部的 --- 块）
    t = t.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, m => keep(m));
    // 2. 围栏代码块
    t = t.replace(/```[\s\S]*?```/g, m => keep(m));
    t = t.replace(/^~~~[\s\S]*?~~~$/gm, m => keep(m));
    // 3. 行内代码
    t = t.replace(/`[^`\n]+`/g, m => keep(m));
    // 4. 行内公式
    t = t.replace(/\$[^$\n]+\$/g, m => keep(m));
    // 5. 链接与图片（整个 [..](..) 结构，防止 URL 被插入空格）
    t = t.replace(/!?\[[^\]\n]*\]\([^)\n]*\)/g, m => keep(m));
    // 6. Obsidian 双链与嵌入
    t = t.replace(/!?\[\[[^\]\n]+\]\]/g, m => keep(m));
    return { text: t, stash };
  }

  restoreSyntax(text, stash) {
    return text.replace(/\u0000P(\d+)\u0000/g, (m, i) => stash[Number(i)] || '');
  }

  // 盘古排版：中英文、数字之间自动添加空格（代码、URL、frontmatter 受保护）
  applyPanguSpacing(text) {
    if (!text || !this.options.panguSpacing) return text;
    const { text: protectedText, stash } = this.protectSyntax(text);
    const spaced = protectedText
      // 中文与英文/数字
      .replace(/([一-龥])([a-zA-Z0-9@])/g, '$1 $2')
      .replace(/([a-zA-Z0-9%\]}@])([一-龥])/g, '$1 $2');
    return this.restoreSyntax(spaced, stash);
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // YAML 标量值转义
  escapeYamlValue(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[\r\n]+/g, ' ')
      .trim();
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

  // 表格预归一化：GFM 表格插件只转换首行全为 <th> 的表格，且单元格需为行内内容，
  // 否则整个 <table> 会以原始 HTML 形式泄漏到 Markdown 输出中。
  // 这里 1) 拍平单元格内的块级包装 2) 无表头时把首行升格为表头。
  normalizeTables(root) {
    const BLOCK_TAGS = new Set(['DIV', 'P', 'SECTION', 'ARTICLE', 'UL', 'OL', 'DL', 'FIGURE', 'BLOCKQUOTE',
      'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'FOOTER', 'MAIN', 'FORM']);
    root.querySelectorAll('table').forEach(table => {
      // 列宽声明对 Markdown 无意义
      table.querySelectorAll('colgroup, col').forEach(el => el.remove());

      // caption 移出表格，转成表格前的加粗说明行
      const caption = table.querySelector('caption');
      if (caption) {
        const captionText = caption.textContent.replace(/\s+/g, ' ').trim();
        caption.remove();
        if (captionText && table.parentNode) {
          const p = document.createElement('p');
          const strong = document.createElement('strong');
          strong.textContent = captionText;
          p.appendChild(strong);
          table.parentNode.insertBefore(p, table);
        }
      }

      table.querySelectorAll('td, th').forEach(cell => this.flattenTableCell(cell, BLOCK_TAGS));

      // 无表头行的表格（如飞书 docx 表格全是 <td>）：首行升格为 <th>，
      // 让 GFM 插件走转换路径而不是 keep 原始 HTML
      const firstRow = table.querySelector('tr');
      if (firstRow && !firstRow.querySelector('th')) {
        firstRow.querySelectorAll('td').forEach(td => {
          const th = document.createElement('th');
          th.innerHTML = td.innerHTML;
          td.parentNode.replaceChild(th, td);
        });
      }
    });
  }

  // 把单元格内的块级元素逐层拆包为行内内容，段落间以 <br> 分隔
  flattenTableCell(cell, blockTags) {
    let guard = 0;
    let blocks;
    while ((blocks = Array.from(cell.querySelectorAll('*')).filter(el => blockTags.has(el.tagName))) && blocks.length && guard++ < 20) {
      for (const block of blocks) {
        const parent = block.parentNode;
        if (!parent) continue;
        const hasPrevContent = Array.from(parent.childNodes).some(n => n !== block && n.textContent && n.textContent.trim());
        // 空壳包装（零宽占位、无内容 div）直接丢弃
        if (!block.textContent || !block.textContent.replace(/[\s\u200b]/g, '')) {
          block.remove();
          continue;
        }
        if (hasPrevContent) parent.insertBefore(document.createElement('br'), block);
        // 拆包：用子节点原位替换自身
        while (block.firstChild) parent.insertBefore(block.firstChild, block);
        block.remove();
      }
    }
  }

  // 资源归一化与图片列表提取
  extractAndNormalizeAssets(root, metadata) {
    const images = [];
    // 兼顾 <img> 标签与任何拥有 data-src/data-url 等属性或 background-image 的图片块
    const imgElements = root.querySelectorAll('img, [data-src], [data-url], [data-origin-src], [data-original], [data-asset-url]');
    let imgIndex = 1;
    const docTitle = (metadata.title || 'untitled').slice(0, 20);

    for (const el of imgElements) {
      let imgNode = el;
      if (el.tagName !== 'IMG') {
        const childImg = el.querySelector('img');
        if (childImg) {
          imgNode = childImg;
        }
      }

      let src = el.getAttribute('data-src') ||
                el.getAttribute('data-url') ||
                el.getAttribute('data-origin-src') ||
                el.getAttribute('data-original') ||
                el.getAttribute('data-actualsrc') ||
                el.getAttribute('data-asset-url') ||
                el.getAttribute('data-raw-src') ||
                imgNode.getAttribute('src') ||
                imgNode.src;

      if (!src && el.style && el.style.backgroundImage) {
        const bgMatch = el.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/i);
        if (bgMatch) src = bgMatch[1];
      }

      if (!src || typeof src !== 'string' || src.startsWith('data:image/svg')) continue;
      if (images.some(img => img.originalUrl === src)) continue; // 同一图片多次出现只登记一次

      const alt = (imgNode.alt || el.getAttribute('alt') || `image-${imgIndex}`).trim();
      const extMatch = src.match(/\.(jpg|jpeg|png|gif|webp|svg)(?:[?#]|$)/i);
      const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
      // 零宽字符一并剔除，保证 Markdown 内的附件链接与落盘文件名严格一致
      const cleanFilename = `${docTitle}-${Date.now()}-${imgIndex}.${ext}`
        .replace(/[\p{Cf}\u2028\u2029\u200B]/gu, '')
        .replace(/[/\\?%*:|"<>\s]/g, '_');

      images.push({
        originalUrl: src,
        filename: cleanFilename,
        alt: alt
      });

      if (imgNode.tagName === 'IMG') {
        if (this.options.imageMode === 'download') {
          const attFolder = this.options.attachmentFolder || 'attachments';
          imgNode.setAttribute('src', `${attFolder}/${cleanFilename}`);
        } else {
          imgNode.setAttribute('src', src);
        }
      } else if (!el.querySelector('img')) {
        const newImg = document.createElement('img');
        const targetSrc = (this.options.imageMode === 'download') ? `${this.options.attachmentFolder || 'attachments'}/${cleanFilename}` : src;
        newImg.setAttribute('src', targetSrc);
        newImg.setAttribute('alt', alt);
        el.appendChild(newImg);
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
    // 表格预归一化（块级单元格拍平 + 表头补全），防止表格以原始 HTML 泄漏
    this.normalizeTables(clone);

    // 阶段 3: 语义与标题层级平滑
    this.normalizeHeadings(clone);

    // 阶段 4: 资源规整与图片提取
    const assets = this.extractAndNormalizeAssets(clone, metadata);

    // 阶段 5: AST / Markdown 序列化
    let markdown = this.turndownService.turndown(clone.innerHTML);

    // 阶段 6: 文本去噪、双链注入与排版优化 (Post-Linter)
    if (this.cleaner && this.options.enableCleaning) {
      markdown = this.cleaner.cleanMarkdown(markdown);
    }
    markdown = this.applyPanguSpacing(markdown);

    // 关键词自动转 Obsidian 双链 [[WikiLinks]]（代码块、链接等内容受保护）
    if (this.options.autoWikilinks && Array.isArray(this.options.autoWikilinks) && this.options.autoWikilinks.length) {
      const { text: protectedText, stash } = this.protectSyntax(markdown);
      let wikilinked = protectedText;
      for (const kw of this.options.autoWikilinks) {
        if (!kw || kw.length < 2) continue;
        const kwRegex = new RegExp(`(?<!\\[\\[)(${this.escapeRegExp(kw)})(?!\\]\\])`, 'g');
        wikilinked = wikilinked.replace(kwRegex, '[[$1]]');
      }
      markdown = this.restoreSyntax(wikilinked, stash);
    }

    // 组装 Frontmatter
    if (this.options.includeFrontmatter && metadata.title) {
      const source = metadata.source ||
        (typeof window !== 'undefined' && window.location ? window.location.href : '');
      const frontmatter = [
        '---',
        `title: "${this.escapeYamlValue(metadata.title)}"`,
        `source: "${this.escapeYamlValue(source)}"`,
        `author: "${this.escapeYamlValue(metadata.author || '')}"`,
        `date: "${this.escapeYamlValue(metadata.date || new Date().toISOString().split('T')[0])}"`,
        `tags: [${(metadata.tags || ['web-clip']).map(t => `"${this.escapeYamlValue(t)}"`).join(', ')}]`,
        '---\n\n'
      ].join('\n');
      markdown = frontmatter + markdown;
    }

    markdown = markdown.trim() + '\n';

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UniversalParserEngine };
}
