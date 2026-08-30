// popup/card-exporter.js - 优雅知识分享长图与卡片渲染导出引擎

class VisualCardExporter {
  constructor() {
    this.currentTheme = 'obsidian'; // 'obsidian' | 'mac-light' | 'vintage-paper' | 'cyber-tokyo'
    this.currentMode = 'quote';      // 'quote' | 'outline' | 'full'
    this.docData = null;
  }

  setDocData(data) {
    this.docData = data;
  }

  // 估算阅读时长
  static estimateReadingTime(text = '') {
    const clean = text.replace(/[#*`\-_~>\[\]()!]/g, '').trim();
    const count = clean.length;
    const minutes = Math.max(1, Math.ceil(count / 350));
    return { count, minutes };
  }

  // 提取文章大纲标题列表 (H1 ~ H4)
  static extractOutline(markdown = '') {
    const lines = markdown.split('\n');
    const outline = [];
    for (const line of lines) {
      const match = line.match(/^(#{1,4})\s+(.+)$/);
      if (match) {
        outline.push({
          level: match[1].length,
          text: match[2].replace(/[​‌‍﻿*`_\[\]]/g, '').trim()
        });
      }
    }
    return outline;
  }

  // 提取金句与核心摘要段落 (优先提取 Callout、引用和加粗重点句)
  static extractSummaryQuotes(markdown = '') {
    const lines = markdown.split('\n');
    const paragraphs = [];
    const highPriorityQuotes = [];
    let inFence = false;

    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('```') || t.startsWith('~~~')) {
        inFence = !inFence;
        continue;
      }
      if (inFence || !t) continue;
      if (t.startsWith('#') || t.startsWith('---') || t.startsWith('|') || t.startsWith('![')) continue;

      // 剔除 frontmatter 字段
      if (/^(title|source|author|date|tags):/i.test(t)) continue;

      if (t.startsWith('>')) {
        const quoteContent = t.replace(/^>\s*(\[![\w-]+\])?\s*/i, '').trim();
        if (quoteContent && quoteContent.length > 8) {
          highPriorityQuotes.push(quoteContent);
        }
        continue;
      }

      if (t.includes('==') || t.includes('**')) {
        highPriorityQuotes.push(t);
        continue;
      }

      paragraphs.push(t);
    }

    const merged = [...highPriorityQuotes, ...paragraphs];
    const result = [];
    for (const p of merged) {
      if (!result.includes(p) && p.length > 10) {
        result.push(p);
        if (result.length >= 4) break;
      }
    }

    return result.length > 0 ? result : (paragraphs.slice(0, 3));
  }

  // 将 Markdown 简易渲染为美观的 HTML 节点流
  static renderFormattedMarkdown(markdown = '', maxLines = 150) {
    const lines = markdown.split('\n').slice(0, maxLines);
    const htmlParts = [];
    let inList = false;
    let inCode = false;
    let codeBuffer = [];
    let codeLang = '';
    let inTable = false;
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 代码块判定
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        if (!inCode) {
          inCode = true;
          codeLang = trimmed.slice(3).trim();
          codeBuffer = [];
        } else {
          inCode = false;
          const codeText = codeBuffer.join('\n')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          htmlParts.push(`<pre class="card-code-block" data-lang="${codeLang}"><code>${codeText}</code></pre>`);
        }
        continue;
      }

      if (inCode) {
        codeBuffer.push(line);
        continue;
      }

      // 表格判定 (| a | b |)
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        tableRows.push(trimmed);
        continue;
      } else if (inTable) {
        inTable = false;
        htmlParts.push(VisualCardExporter.renderMarkdownTable(tableRows));
        tableRows = [];
      }

      if (!trimmed) {
        if (inList) {
          htmlParts.push('</ul>');
          inList = false;
        }
        continue;
      }

      // 独立数学公式块 ($$...$$)
      if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
        if (inList) { htmlParts.push('</ul>'); inList = false; }
        const formula = trimmed.slice(2, -2).trim();
        htmlParts.push(`<div class="card-math-block">$$ ${formula} $$</div>`);
        continue;
      }

      // 标题 H1 ~ H4
      const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        if (inList) { htmlParts.push('</ul>'); inList = false; }
        const level = hMatch[1].length;
        const text = VisualCardExporter.formatInlineText(hMatch[2]);
        htmlParts.push(`<h${level} class="card-heading h${level}">${text}</h${level}>`);
        continue;
      }

      // Callout 引用块
      if (trimmed.startsWith('>')) {
        if (inList) { htmlParts.push('</ul>'); inList = false; }
        const bqText = trimmed.replace(/^>\s*/, '');
        const isCallout = bqText.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|DANGER|FAQ)\]([+-]?)\s*(.*)/i);
        if (isCallout) {
          const type = isCallout[1].toUpperCase();
          const title = isCallout[3] || type;
          htmlParts.push(`<div class="card-callout ${type.toLowerCase()}"><div class="callout-head">💡 <strong>${title}</strong></div></div>`);
        } else {
          htmlParts.push(`<blockquote class="card-quote">${VisualCardExporter.formatInlineText(bqText)}</blockquote>`);
        }
        continue;
      }

      // 列表项
      const listMatch = line.match(/^([ \t]*)[-*+]\s+(.+)$/);
      if (listMatch) {
        if (!inList) {
          htmlParts.push('<ul class="card-list">');
          inList = true;
        }
        htmlParts.push(`<li>${VisualCardExporter.formatInlineText(listMatch[2])}</li>`);
        continue;
      }

      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }

      // 普通段落
      htmlParts.push(`<p class="card-p">${VisualCardExporter.formatInlineText(trimmed)}</p>`);
    }

    if (inList) htmlParts.push('</ul>');
    if (inTable && tableRows.length > 0) {
      htmlParts.push(VisualCardExporter.renderMarkdownTable(tableRows));
    }

    return htmlParts.join('\n');
  }

  // 表格渲染
  static renderMarkdownTable(rows = []) {
    if (rows.length === 0) return '';
    let html = '<div class="card-table-wrap"><table class="card-table">';
    let isHeader = true;

    for (const row of rows) {
      if (row.includes('---')) {
        isHeader = false;
        continue;
      }
      const cells = row.split('|').slice(1, -1).map(c => c.trim());
      html += '<tr>';
      for (const cell of cells) {
        const tag = isHeader ? 'th' : 'td';
        html += `<${tag}>${VisualCardExporter.formatInlineText(cell)}</${tag}>`;
      }
      html += '</tr>';
    }
    html += '</table></div>';
    return html;
  }

  // 行内语法格式化 (加粗、高亮、行内代码、双链、行内公式)
  static formatInlineText(text = '') {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\$([^\$\n]+)\$/g, '<span class="card-math-inline">$1</span>')
      .replace(/==([^=]+)==/g, '<mark class="card-highlight">$1</mark>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="card-inline-code">$1</code>')
      .replace(/\[\[([^\]]+)\]\]/g, '<span class="card-wikilink">[[ $1 ]]</span>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="card-link">$1</span>');
  }

  // 渲染分享卡片 DOM 节点
  renderCardElement(container) {
    if (!this.docData || !container) return;

    const meta = this.docData.metadata || {};
    const title = meta.title || '无标题文档';
    const author = meta.author || 'MD抓吗用户';
    const date = meta.date || new Date().toISOString().split('T')[0];
    const sourceUrl = meta.source || window.location?.href || 'https://github.com';
    const tags = Array.isArray(meta.tags) ? meta.tags : ['知识管理'];
    const markdown = this.docData.markdown || '';

    let host = 'web.page';
    try {
      if (sourceUrl && sourceUrl.startsWith('http')) {
        host = new URL(sourceUrl).hostname.replace(/^www\./, '');
      }
    } catch(e) {}

    const { count, minutes } = VisualCardExporter.estimateReadingTime(markdown);

    container.className = `visual-card-frame theme-${this.currentTheme} mode-${this.currentMode}`;
    container.innerHTML = '';

    // 1. 卡片顶部装饰栏 (macOS 控制红黄绿圆点 + 域名徽章)
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header-bar';
    cardHeader.innerHTML = `
      <div class="mac-dots">
        <span class="mac-dot red"></span>
        <span class="mac-dot yellow"></span>
        <span class="mac-dot green"></span>
      </div>
      <div class="card-source-badge">
        <span class="badge-icon">🌐</span>
        <span class="badge-host">${host}</span>
      </div>
      <div class="card-brand-pill">MD抓吗 · 深度剪藏</div>
    `;
    container.appendChild(cardHeader);

    // 2. 文章标题与元数据区域
    const cardMeta = document.createElement('div');
    cardMeta.className = 'card-meta-section';
    cardMeta.innerHTML = `
      <h1 class="card-main-title">${title}</h1>
      <div class="card-sub-pills">
        <span class="meta-item"><span class="meta-icon">✍️</span> ${author}</span>
        <span class="meta-item"><span class="meta-icon">📅</span> ${date}</span>
        <span class="meta-item"><span class="meta-icon">⏱️</span> 约 ${minutes} 分钟 (${count} 字)</span>
      </div>
      <div class="card-tag-row">
        ${tags.map(t => `<span class="card-tag-pill">#${t}</span>`).join('')}
      </div>
    `;
    container.appendChild(cardMeta);

    // 分隔线
    const divider = document.createElement('div');
    divider.className = 'card-section-divider';
    container.appendChild(divider);

    // 3. 正文内容区（根据当前模式呈现：金句/大纲/全文字流）
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body-section';

    if (this.currentMode === 'quote') {
      const quotes = VisualCardExporter.extractSummaryQuotes(markdown);
      cardBody.innerHTML = `
        <div class="quote-card-cluster">
          <div class="quote-symbol-lead">“</div>
          ${quotes.map(q => `<p class="quote-paragraph">${VisualCardExporter.formatInlineText(q)}</p>`).join('')}
          <div class="quote-symbol-tail">”</div>
        </div>
      `;
    } else if (this.currentMode === 'outline') {
      const outline = VisualCardExporter.extractOutline(markdown);
      if (outline.length === 0) {
        cardBody.innerHTML = `<p class="empty-tip">未提取到文章大纲，以下为正文摘要：</p><p class="quote-paragraph">${markdown.slice(0, 300)}...</p>`;
      } else {
        cardBody.innerHTML = `
          <div class="outline-card-cluster">
            <div class="outline-title-badge">📑 文章知识脉络骨架</div>
            <div class="outline-tree-list">
              ${outline.map((item, idx) => `
                <div class="outline-node level-${item.level}">
                  <span class="node-num">${idx + 1}.</span>
                  <span class="node-text">${item.text}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    } else {
      // full 全文长图模式
      cardBody.innerHTML = `
        <div class="full-article-cluster">
          ${VisualCardExporter.renderFormattedMarkdown(markdown, 150)}
        </div>
      `;
    }
    container.appendChild(cardBody);

    // 4. 卡片底部二维码与专属品牌印章 (Footer)
    const cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer-section';

    const footerLeft = document.createElement('div');
    footerLeft.className = 'footer-left-info';
    footerLeft.innerHTML = `
      <div class="brand-signature">
        <span class="brand-sparkle">✨</span>
        <span class="brand-name">MD抓吗 · Obsidian Studio</span>
      </div>
      <div class="brand-slogan">深度网页解析 · 全量排版与无损知识库归档</div>
      <div class="source-hint">扫码或长按二维码阅读网页原文</div>
    `;

    const qrContainer = document.createElement('div');
    qrContainer.className = 'footer-qr-wrap';

    const qrCanvas = document.createElement('canvas');
    qrCanvas.className = 'qr-canvas';
    if (typeof QRCodeGenerator !== 'undefined') {
      const darkColor = this.currentTheme === 'mac-light' ? '#0f172a' : (this.currentTheme === 'vintage-paper' ? '#2c251e' : '#ffffff');
      const lightColor = this.currentTheme === 'mac-light' ? '#ffffff' : (this.currentTheme === 'vintage-paper' ? '#f6f1e8' : '#1f1a30');
      QRCodeGenerator.drawCanvas(qrCanvas, sourceUrl, {
        size: 90,
        margin: 2,
        darkColor: darkColor,
        lightColor: lightColor
      });
    }
    qrContainer.appendChild(qrCanvas);

    cardFooter.appendChild(footerLeft);
    cardFooter.appendChild(qrContainer);
    container.appendChild(cardFooter);
  }

  // 导出为 2x 高清 PNG Canvas
  async exportToCanvas(cardElement, scale = 2) {
    if (!cardElement) throw new Error('卡片元素不存在');

    const width = cardElement.offsetWidth || 560;
    const height = cardElement.offsetHeight || 720;

    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(scale, scale);
    }

    const cloned = cardElement.cloneNode(true);
    cloned.style.margin = '0';
    cloned.style.boxShadow = 'none';

    let styles = '';
    if (typeof document !== 'undefined' && document.styleSheets) {
      for (const sheet of document.styleSheets) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (rules) {
            for (const rule of rules) {
              styles += rule.cssText + '\n';
            }
          }
        } catch(e) {}
      }
    }

    const svgString = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml">
            <style>
              ${styles}
            </style>
            ${cloned.outerHTML}
          </div>
        </foreignObject>
      </svg>
    `;

    if (typeof Image === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
      return canvas;
    }

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    return new Promise((resolve) => {
      img.onload = () => {
        if (ctx) ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(canvas);
      };
      img.src = url;
    });
  }

  // 复制图片至系统剪贴板 (直接在聊天框/即刻/推特/小红书粘贴发送)
  async copyImageToClipboard(cardElement) {
    const canvas = await this.exportToCanvas(cardElement, 2);
    return new Promise((resolve, reject) => {
      if (!canvas || typeof canvas.toBlob !== 'function') {
        return resolve({ success: true, fallback: true });
      }
      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('生成图片数据失败'));
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            resolve({ success: true });
          } else {
            resolve({ success: true, fallback: true });
          }
        } catch (err) {
          reject(err);
        }
      }, 'image/png');
    });
  }

  // 下载 2x 高清 PNG
  async downloadImage(cardElement, filename = 'md-drama-share.png') {
    const canvas = await this.exportToCanvas(cardElement, 2);
    return new Promise((resolve) => {
      if (!canvas || typeof canvas.toBlob !== 'function') {
        return resolve({ success: true });
      }
      canvas.toBlob((blob) => {
        if (!blob) return resolve({ success: true });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        resolve({ success: true });
      }, 'image/png');
    });
  }
}

if (typeof window !== 'undefined') {
  window.VisualCardExporter = VisualCardExporter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VisualCardExporter };
}
