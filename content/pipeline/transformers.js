// content/pipeline/transformers.js - 通用复杂结构 DOM 重塑与穿透器

class TransformersRegistry {
  constructor() {
    this.transformers = [];
    this.registerDefaultTransformers();
  }

  register(transformer) {
    this.transformers.push(transformer);
  }

  // 递归穿透 Shadow DOM 获取所有元素
  static getAllElementsIncludingShadow(root) {
    const elements = [];
    function traverse(node) {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
      elements.push(node);

      if (node.shadowRoot) {
        Array.from(node.shadowRoot.children).forEach(child => traverse(child));
      }

      Array.from(node.children).forEach(child => traverse(child));
    }
    traverse(root);
    return elements;
  }

  registerDefaultTransformers() {
    // 1. 固定悬浮物降权/剔除 (Sticky & Fixed Elements)
    this.register({
      name: 'fixed-sticky-remover',
      match: (node) => {
        if (typeof window === 'undefined' || !window.getComputedStyle) return false;
        if (node.tagName === 'BODY' || node.tagName === 'HTML' || node.tagName === 'MAIN' || node.tagName === 'ARTICLE') return false;
        try {
          const style = window.getComputedStyle(node);
          const pos = style.position;
          return (pos === 'fixed' || pos === 'sticky') && (node.clientHeight < 120 || node.clientWidth < 120);
        } catch (e) {
          return false;
        }
      },
      transform: (node) => {
        node.remove();
      }
    });

    // 2. Canvas 动态图表转存为 <img>
    this.register({
      name: 'canvas-to-image-converter',
      match: (node) => node.tagName === 'CANVAS',
      transform: (node) => {
        try {
          const dataUrl = node.toDataURL('image/png');
          if (dataUrl && dataUrl.length > 100) {
            const img = document.createElement('img');
            img.src = dataUrl;
            img.alt = 'rendered-chart';
            node.parentNode.replaceChild(img, node);
          }
        } catch (e) {
          // canvas 跨域污染时跳过
        }
      }
    });

    // 3. 数学公式还原 (KaTeX & MathJax)
    this.register({
      name: 'math-formula-restorer',
      match: (node) => {
        return node.classList && (
          node.classList.contains('katex') ||
          node.classList.contains('MathJax') ||
          node.classList.contains('math-inline') ||
          node.classList.contains('math-block') ||
          node.hasAttribute('data-math')
        );
      },
      transform: (node) => {
        let tex = node.getAttribute('data-math') ||
                  node.getAttribute('data-latex') ||
                  node.querySelector('annotation[encoding*="tex"]')?.textContent ||
                  node.querySelector('script[type*="math/tex"]')?.textContent;

        if (tex) {
          tex = tex.trim();
          const span = document.createElement('span');
          const isBlock = node.classList.contains('math-block') || node.classList.contains('katex-display') || node.tagName === 'DIV';
          span.textContent = isBlock ? `\n\n$$ ${tex} $$\n\n` : ` $${tex}$ `;
          node.parentNode.replaceChild(span, node);
        }
      }
    });

    // 4. Mermaid 图表语法提取与原生还原
    this.register({
      name: 'mermaid-diagram-restorer',
      match: (node) => {
        if (!node.classList) return false;
        return node.classList.contains('mermaid') || 
               node.hasAttribute('data-mermaid') || 
               node.classList.contains('mermaid-diagram') ||
               (node.tagName === 'PRE' && node.className.includes('mermaid'));
      },
      transform: (node) => {
        const rawMermaid = node.getAttribute('data-mermaid') || 
                           node.getAttribute('data-content') || 
                           node.textContent;
        if (rawMermaid) {
          const pre = document.createElement('pre');
          pre.setAttribute('data-lang', 'mermaid');
          pre.textContent = rawMermaid.trim();
          if (node.parentNode) {
            node.parentNode.replaceChild(pre, node);
          }
        }
      }
    });

    // 5. 代码 Diff 差异对比还原
    this.register({
      name: 'code-diff-normalizer',
      match: (node) => {
        if (!node.classList) return false;
        return node.classList.contains('diff-table') || node.classList.contains('diff-container');
      },
      transform: (node) => {
        const lines = node.querySelectorAll('tr, .diff-line');
        if (lines.length > 0) {
          let diffText = '';
          lines.forEach(line => {
            const isAdd = line.classList.contains('blob-code-addition') || line.querySelector('.blob-code-addition');
            const isDel = line.classList.contains('blob-code-deletion') || line.querySelector('.blob-code-deletion');
            const prefix = isAdd ? '+ ' : (isDel ? '- ' : '  ');
            diffText += prefix + line.textContent.trim().replace(/^[+-]\s*/, '') + '\n';
          });
          const pre = document.createElement('pre');
          pre.setAttribute('data-lang', 'diff');
          pre.textContent = diffText.trim();
          if (node.parentNode) {
            node.parentNode.replaceChild(pre, node);
          }
        }
      }
    });

    // 4. 代码块去噪（移除复制按钮、行号）
    this.register({
      name: 'code-block-normalizer',
      match: (node) => {
        return node.tagName === 'PRE' || (node.classList && (node.classList.contains('highlight') || node.classList.contains('code-block')));
      },
      transform: (node) => {
        const lineNumbers = node.querySelectorAll('.line-numbers, .linenumber, .line-num, .gutter, .hljs-ln-numbers, .copy-code-btn, .code-copy-button');
        lineNumbers.forEach(el => el.remove());

        const codeEl = node.querySelector('code') || node;
        let lang = '';
        const classNames = (codeEl.className + ' ' + node.className).split(/\s+/);
        for (const cls of classNames) {
          const match = cls.match(/(?:language-|lang-)(\w+)/i);
          if (match) {
            lang = match[1];
            break;
          }
        }
        if (lang) {
          node.setAttribute('data-lang', lang);
        }
      }
    });

    // 5. Flex/Grid 伪表格重构
    this.register({
      name: 'pseudo-table-reconstructor',
      match: (node) => {
        if (!node.classList) return false;
        return node.classList.contains('grid-table') || 
               node.classList.contains('virtual-table') ||
               (node.hasAttribute('role') && node.getAttribute('role') === 'table');
      },
      transform: (node) => {
        const rows = node.querySelectorAll('.grid-row, .table-row, [role="row"]');
        if (rows.length === 0) return;

        const table = document.createElement('table');
        const tbody = document.createElement('tbody');

        rows.forEach((row, rIndex) => {
          const tr = document.createElement('tr');
          const cells = row.querySelectorAll('.grid-cell, .table-cell, [role="cell"], [role="columnheader"]');
          cells.forEach(cell => {
            const cellTag = (rIndex === 0 || cell.getAttribute('role') === 'columnheader') ? 'th' : 'td';
            const td = document.createElement(cellTag);
            td.innerHTML = cell.innerHTML.trim();
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        node.parentNode.replaceChild(table, node);
      }
    });

    // 6. CSS background-image 还原为 <img>
    this.register({
      name: 'background-image-restorer',
      match: (node) => {
        if (node.tagName === 'IMG' || node.tagName === 'BODY' || node.tagName === 'HTML') return false;
        const bg = node.style && node.style.backgroundImage;
        return bg && bg.includes('url(');
      },
      transform: (node) => {
        const bg = node.style.backgroundImage;
        const match = bg.match(/url\(['"]?(.*?)['"]?\)/i);
        if (match && match[1] && !match[1].startsWith('data:image/svg') && !node.querySelector('img')) {
          const img = document.createElement('img');
          img.src = match[1];
          img.alt = 'embedded-image';
          node.appendChild(img);
        }
      }
    });

    // 7. 智能多色 Callout / 提示盒标准化 (Obsidian Callout: NOTE, TIP, WARNING, DANGER, INFO, FAQ 等)
    this.register({
      name: 'obsidian-callout-normalizer',
      match: (node) => {
        if (!node.classList) return false;
        const cls = node.className || '';
        const tag = node.tagName;
        return node.classList.contains('callout') ||
               node.classList.contains('alert') ||
               node.classList.contains('admonition') ||
               node.classList.contains('notice-block') ||
               node.classList.contains('notion-callout') ||
               node.classList.contains('notion-callout-block') ||
               tag === 'NE-ALERT' ||
               node.hasAttribute('data-callout-type');
      },
      transform: (node) => {
        // 如果已经是处理过的 blockquote 则跳过
        if (node.tagName === 'BLOCKQUOTE' && node.querySelector('strong')?.textContent.includes('[!')) return;

        // 智能推断 Callout 类型 (NOTE, TIP, WARNING, DANGER, INFO, FAQ, SUCCESS, BUG, EXAMPLE)
        let calloutType = 'NOTE';
        const fullCls = (node.className + ' ' + (node.getAttribute('data-callout-type') || '')).toLowerCase();
        const style = (node.getAttribute('style') || '').toLowerCase();

        if (fullCls.includes('danger') || fullCls.includes('error') || fullCls.includes('red') || style.includes('red') || style.includes('rgb(255, 235') || style.includes('#ff4d4f') || style.includes('#ffe8e6')) {
          calloutType = 'DANGER';
        } else if (fullCls.includes('warning') || fullCls.includes('caution') || fullCls.includes('orange') || fullCls.includes('amber') || fullCls.includes('yellow') || style.includes('rgb(255, 251') || style.includes('#faad14') || style.includes('#fffbe6')) {
          calloutType = 'WARNING';
        } else if (fullCls.includes('tip') || fullCls.includes('success') || fullCls.includes('green') || style.includes('green') || style.includes('rgb(235, 255') || style.includes('#52c41a') || style.includes('#f6ffed')) {
          calloutType = 'TIP';
        } else if (fullCls.includes('info') || fullCls.includes('blue') || fullCls.includes('cyan') || style.includes('blue') || style.includes('rgb(230, 247') || style.includes('#1890ff') || style.includes('#e6f7ff')) {
          calloutType = 'INFO';
        } else if (fullCls.includes('faq') || fullCls.includes('question') || fullCls.includes('help') || fullCls.includes('purple') || style.includes('purple') || style.includes('rgb(249, 240') || style.includes('#722ed1') || style.includes('#f9f0ff')) {
          calloutType = 'FAQ';
        }

        // 提取自定义 Emoji / 图标
        const emojiEl = node.querySelector('.callout-emoji, .emoji-picker, .callout-icon, .notion-page-icon, .alert-icon');
        const emoji = emojiEl ? (emojiEl.textContent || '').trim() : '';

        // 提取标题与正文
        const titleEl = node.querySelector('.callout-title, .alert-title, .admonition-title');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (titleEl) titleEl.remove();
        if (emojiEl) emojiEl.remove();

        const bq = document.createElement('blockquote');
        const headerText = `[!${calloutType}]` + (emoji ? ` ${emoji}` : '') + (title ? ` ${title}` : '');
        bq.innerHTML = `<strong>${headerText}</strong><br>${node.innerHTML.trim()}`;

        if (node.parentNode) {
          node.parentNode.replaceChild(bq, node);
        }
      }
    });

    // 8. 文本荧光笔高亮 (Mark / Highlight -> ==高亮文本==)
    this.register({
      name: 'mark-highlight-normalizer',
      match: (node) => {
        if (node.tagName === 'MARK') return true;
        if (node.tagName === 'SPAN') {
          const style = node.getAttribute('style') || '';
          const bg = style.toLowerCase();
          const hasBg = bg.includes('background-color') || bg.includes('background:');
          const isHighlight = hasBg && (
            bg.includes('yellow') || bg.includes('#ff') || bg.includes('#fef') ||
            bg.includes('rgb(255') || bg.includes('rgba(255') ||
            bg.includes('rgba(254') || bg.includes('rgba(250') ||
            node.hasAttribute('data-highlight') ||
            node.classList?.contains('text-highlight') ||
            node.classList?.contains('highlight-text')
          );
          // 仅对行内短语进行 mark 包装，避免误伤整个大容器
          return isHighlight && (node.textContent || '').length < 300 && !node.querySelector('p, div, h1, h2, h3, h4, h5, h6, table, ul, ol');
        }
        return false;
      },
      transform: (node) => {
        if (node.tagName !== 'MARK') {
          const mark = document.createElement('mark');
          while (node.firstChild) mark.appendChild(node.firstChild);
          if (node.parentNode) node.parentNode.replaceChild(mark, node);
        }
      }
    });

    // 9. Iframe 嵌入组件卡片化 (Bilibili, YouTube, Figma, CodePen, 通用嵌入)
    this.register({
      name: 'iframe-embed-normalizer',
      match: (node) => node.tagName === 'IFRAME',
      transform: (node) => {
        const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
        if (!src) return;

        let embedCard = null;

        // Bilibili 嵌入视频
        if (/bilibili\.com/i.test(src)) {
          const bvidMatch = src.match(/bvid=([a-zA-Z0-9]+)/i) || src.match(/\/([a-zA-Z0-9]{12})/);
          const bvid = bvidMatch ? bvidMatch[1] : '';
          const link = bvid ? `https://www.bilibili.com/video/${bvid}` : src;
          embedCard = document.createElement('p');
          embedCard.innerHTML = `🎬 <strong>[哔哩哔哩视频]</strong> <a href="${link}">${link}</a>`;
        }
        // YouTube 嵌入视频
        else if (/youtube\.com|youtu\.be/i.test(src)) {
          const ytMatch = src.match(/embed\/([a-zA-Z0-9_-]+)/i) || src.match(/v=([a-zA-Z0-9_-]+)/i);
          const ytId = ytMatch ? ytMatch[1] : '';
          const link = ytId ? `https://www.youtube.com/watch?v=${ytId}` : src;
          embedCard = document.createElement('p');
          embedCard.innerHTML = `🎬 <strong>[YouTube 视频]</strong> <a href="${link}">${link}</a>`;
        }
        // Figma 画板设计
        else if (/figma\.com/i.test(src)) {
          const figmaUrlMatch = src.match(/url=([^&]+)/i);
          const figmaUrl = figmaUrlMatch ? decodeURIComponent(figmaUrlMatch[1]) : src;
          embedCard = document.createElement('p');
          embedCard.innerHTML = `🎨 <strong>[Figma 设计稿]</strong> <a href="${figmaUrl}">${figmaUrl}</a>`;
        }
        // CodePen 演示
        else if (/codepen\.io/i.test(src)) {
          embedCard = document.createElement('p');
          embedCard.innerHTML = `💻 <strong>[CodePen 代码演示]</strong> <a href="${src}">${src}</a>`;
        }
        // 通用 Iframe 嵌入
        else {
          const title = node.getAttribute('title') || '嵌入式网页内容';
          embedCard = document.createElement('p');
          embedCard.innerHTML = `🔗 <strong>[嵌入组件: ${title}]</strong> <a href="${src}">${src}</a>`;
        }

        if (embedCard && node.parentNode) {
          node.parentNode.replaceChild(embedCard, node);
        }
      }
    });

    // 10. 折叠详情块 (<details> / <summary>) 结构规范化
    this.register({
      name: 'details-summary-normalizer',
      match: (node) => node.tagName === 'DETAILS',
      transform: (node) => {
        const summary = node.querySelector('summary');
        const summaryText = summary ? summary.textContent.trim() : '折叠详情';
        if (summary) summary.remove();

        const bq = document.createElement('blockquote');
        bq.innerHTML = `<strong>[!FAQ]- ${summaryText}</strong><br>${node.innerHTML.trim()}`;
        if (node.parentNode) {
          node.parentNode.replaceChild(bq, node);
        }
      }
    });

    // 11. 块级子元素链接拍平: <a> 内含 div/p 等块级结构时 (Notion 卡片链接等),
    //    用纯文本替换, 避免生成跨行断裂的 Markdown 链接
    this.register({
      name: 'block-link-flattener',
      match: (node) => {
        if (node.tagName !== 'A') return false;
        return !!node.querySelector('div, p, h1, h2, h3, h4, h5, h6, li, table');
      },
      transform: (node) => {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        while (node.firstChild) node.removeChild(node.firstChild);
        node.appendChild(document.createTextNode(text));
      }
    });

    // 12. 相对地址绝对化: a[href] 与 img 的相对地址转为绝对 URL,
    //    保证剪藏后的 Markdown 链接/图片在任何位置都能访问
    this.register({
      name: 'relative-url-absolutizer',
      match: (node) => {
        if (node.tagName === 'A') {
          const href = node.getAttribute('href');
          return !!href && !/^(https?:|mailto:|tel:|data:|#|javascript:)/i.test(href);
        }
        if (node.tagName === 'IMG') {
          const src = node.getAttribute('src');
          return !!src && !/^(https?:|data:)/i.test(src);
        }
        return false;
      },
      transform: (node) => {
        try {
          const attr = node.tagName === 'A' ? 'href' : 'src';
          const base = (typeof location !== 'undefined' && location.href) ? location.href : undefined;
          if (!base) return;
          node.setAttribute(attr, new URL(node.getAttribute(attr), base).href);
        } catch (e) { /* 无效地址跳过 */ }
      }
    });
  }

  apply(root) {
    if (!root) return;

    for (const transformer of this.transformers) {
      const allElements = Array.from(root.querySelectorAll('*'));
      if (transformer.match(root)) allElements.unshift(root);

      for (const el of allElements) {
        if (!el.parentNode && el !== root) continue;
        try {
          if (transformer.match(el)) {
            transformer.transform(el);
          }
        } catch (err) {
          console.warn(`Transformer [${transformer.name}] error:`, err);
        }
      }
    }
    return root;
  }
}

if (typeof window !== 'undefined') {
  window.TransformersRegistry = TransformersRegistry;
}
