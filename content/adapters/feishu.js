// content/adapters/feishu.js - 飞书/Lark 深度解析 Adapter (Docx / Wiki / Docs / File / Base 全模块全类型块支持)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class FeishuAdapter {
  static get name() { return 'Feishu'; }

  static matches(url) {
    return /feishu\.cn|larksuite\.com|feishu\.net/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('.docx-title-text') ||
                    document.querySelector('.doc-title') ||
                    document.querySelector('.title-text') ||
                    document.querySelector('[data-page-title]') ||
                    document.querySelector('.page-title') ||
                    document.querySelector('.wiki-title') ||
                    document.querySelector('.file-name') ||
                    document.querySelector('.file-title') ||
                    document.querySelector('.file-header .file-title') ||
                    document.querySelector('.header-title');

    let title = titleEl ? (titleEl.textContent || '').trim() : '';
    // 页头 logo 的 <h1> 固定为 "飞书云文档", 不能当作文档标题
    if (!title || title === '飞书云文档' || title === 'Lark') {
      title = (document.title || '').replace(/\s*[-|｜_]\s*(飞书云文档|飞书|Lark|知识库|文档)\s*$/, '').trim();
    }
    if (!title) title = '飞书文档';

    // 彻底剥离飞书富文本常带的零宽空格与格式控制字符
    const cleanTitle = title.replace(new RegExp('[\\p{Cf}\\u2028\\u2029\\u200B\\u200C\\u200D\\uFEFF]', 'gu'), '').trim();
    const tags = ['feishu', 'doc-clip'];

    if (typeof AdapterUtils !== 'undefined') {
      return AdapterUtils.cleanMetadata({
        title: cleanTitle || '飞书文档',
        author: 'Feishu User',
        date: new Date().toISOString().split('T')[0],
        source: window.location.href,
        tags
      });
    }

    return {
      title: (cleanTitle || '飞书文档').replace(/[/\\?%*:|"<>]/g, '-'),
      author: 'Feishu User',
      date: new Date().toISOString().split('T')[0],
      source: window.location.href,
      tags
    };
  }

  // 综合解析获取真实图片地址（支持从 image-token / record-id 构造永久高清 CDN 流地址）
  static getRealImageSrc(el) {
    if (!el) return '';

    // 1. 优先通过飞书 image-token 和 record-id 构造永久高分辨率 drive stream 链接（彻底避免 blob: URL 过期失效）
    const imgToken = el.getAttribute?.('image-token') ||
                     el.querySelector?.('[image-token]')?.getAttribute('image-token') ||
                     el.parentElement?.getAttribute?.('image-token') ||
                     el.closest?.('[image-token]')?.getAttribute('image-token') ||
                     el.getAttribute?.('data-token') ||
                     el.querySelector?.('[data-token]')?.getAttribute('data-token');

    const recordId = el.getAttribute?.('data-record-id') ||
                     el.querySelector?.('[data-record-id]')?.getAttribute('data-record-id') ||
                     el.closest?.('[data-record-id]')?.getAttribute('data-record-id') ||
                     el.getAttribute?.('data-block-id') ||
                     el.closest?.('[data-block-id]')?.getAttribute('data-block-id') ||
                     el.getAttribute?.('data-mount-node-token');

    if (imgToken && recordId) {
      const isLark = typeof window !== 'undefined' && window.location && window.location.hostname.includes('larksuite.com');
      const host = isLark ? 'internal-api-drive-stream.larksuite.com' : 'internal-api-drive-stream.feishu.cn';
      return `https://${host}/space/api/box/stream/download/v2/cover/${imgToken}/?fallback_source=1&height=1280&mount_node_token=${recordId}&mount_point=docx_image&policy=equal&width=1280`;
    }

    // 2. 检查常见图片属性
    const attrs = [
      'src', 'data-src', 'data-url', 'data-src-large', 'data-large-url',
      'data-origin-src', 'data-original', 'data-lazy-src', 'data-image-src',
      'data-actualsrc', 'data-asset-url', 'data-raw-src'
    ];

    function isValid(val) {
      if (!val || typeof val !== 'string') return false;
      val = val.trim();
      if (!val) return false;
      if (val.startsWith('data:image/svg') || val.startsWith('data:image/gif')) return false;
      if (val.startsWith('data:image/') && val.length < 300) return false;
      if (val.startsWith('blob:')) return false; // 排除即将失效的临时 blob
      if (val.includes('blank.gif') || val.includes('spacer.gif') || val.includes('placeholder')) return false;
      return true;
    }

    for (const attr of attrs) {
      const val = el.getAttribute?.(attr);
      if (isValid(val)) return val.trim();
    }

    if (el.tagName === 'IMG' && el.parentElement) {
      for (const attr of attrs) {
        const val = el.parentElement.getAttribute?.(attr);
        if (isValid(val)) return val.trim();
      }
    }

    const style = el.getAttribute?.('style') || '';
    const bgMatch = style.match(/background-image\s*:\s*url\(['"]?(.*?)['"]?\)/i);
    if (bgMatch && isValid(bgMatch[1])) return bgMatch[1].trim();

    const rawSrc = el.getAttribute?.('src') || el.src;
    return (rawSrc && typeof rawSrc === 'string' && !rawSrc.startsWith('data:image/svg') && !rawSrc.startsWith('blob:')) ? rawSrc.trim() : '';
  }

  // 飞书 docx / wiki 全类型 Block 规范化与语义重塑
  static normalizeDocxBlocks(container) {
    const doc = document;

    // 1. 清理噪声: 打印占位文案、AI速读/摘要、评论气泡、选区遮罩、光标、侧栏、零宽占位等
    const removeSelectors = [
      '[data-block-type="ai_digest"]',
      '[data-block-type="ai_summary"]',
      '[data-block-type="ai_quick_read"]',
      '[data-block-type="quick_read"]',
      '[data-block-type="ai_panel"]',
      '[data-zone-id*="ai_digest"]',
      '[data-block-id*="ai_digest"]',
      '[data-block-id*="ai_summary"]',
      '.docx-ai-panel',
      '.docx-ai-quick-read',
      '.ai-digest-container',
      '.ai-summary-block',
      '.suite-ai-summary',
      '.ai-assistant-wrapper',
      '.ai-reading-card',
      '.quick-reading-container',
      '.ai-overview-block',
      '.bear-ai-block',
      '.docx-quick-read-wrapper',

      'img.gpf-biz-suite-custom-icon__icon-image',
      '.custom-icon__icon-image img',
      '.bear-virtual-renderUnit-placeholder',
      '.docx-block-zero-space',
      '[data-zero-space="true"]',
      '.render-unit-wrapper-comment',
      '.doc-comment-highlight',
      '.inline-comment-icon',
      '.editor-selection-layer',
      '.cursor-wrapper',
      '.drag-handle',
      '.docx-block-actions',
      '.docx-comment-portal',
      '.gpf-biz-action-manager-forbidden-placeholder',
      '.vmok-sidebar-container',
      '.help-block',
      '.note-login',
      '.docx-selection-hidden-textarea',
      '.rangecode-bomb-container-bottom',
      '.task-list-sider-bar-container',
      '.doc-info-wrapper',
      '.doc-info-time-item'
    ];
    removeSelectors.forEach(sel => {
      container.querySelectorAll(sel).forEach(el => el.remove());
    });

    // 针对包含"AI 速读"/"AI 摘要"标识的横幅与卡片执行二次过滤
    container.querySelectorAll('.callout-block, .highlight-block, [data-block-type="callout"], .page-banner').forEach(card => {
      const text = (card.textContent || '').trim();
      if (/^AI\s*(?:速读|摘要|提炼|总结|简报|阅读助手)/i.test(text)) {
        card.remove();
      }
    });

    // 2. 文档主标题: 拍平成标准 h1
    container.querySelectorAll('.page-block-header h1, h1.page-block-content, .docx-title-text').forEach(h => {
      const text = (h.textContent || '').replace(/[​‌‍﻿]/g, '').trim();
      if (!text || text === '飞书云文档' || text === 'Lark') return;
      const clean = doc.createElement('h1');
      clean.textContent = text;
      if (h.parentNode) h.parentNode.replaceChild(clean, h);
    });

    // 3. 分栏布局块 (grid / grid_column / columns / column): 将并排分栏解包为线性顺序排列
    container.querySelectorAll('[data-block-type="grid"], [data-block-type="columns"], .grid-block').forEach(grid => {
      const frag = doc.createDocumentFragment();
      const columns = grid.querySelectorAll('[data-block-type="grid_column"], [data-block-type="column"], .grid-column-block');
      if (columns.length > 0) {
        columns.forEach(col => {
          while (col.firstChild) frag.appendChild(col.firstChild);
        });
      } else {
        while (grid.firstChild) frag.appendChild(grid.firstChild);
      }
      if (grid.parentNode) grid.parentNode.replaceChild(frag, grid);
    });

    // 4. 同步块 (synced_block / sync_block): 解包为常规子块
    container.querySelectorAll('[data-block-type="synced_block"], [data-block-type="sync_block"], .synced-block').forEach(block => {
      const frag = doc.createDocumentFragment();
      while (block.firstChild) frag.appendChild(block.firstChild);
      if (block.parentNode) block.parentNode.replaceChild(frag, block);
    });

    // 5. 标题块: heading1..heading9, heading_1..heading_9, h1..h6 (含折叠标题识别)
    container.querySelectorAll('[data-block-type^="heading"], [data-block-type^="h"], .docx-heading-block').forEach(block => {
      const bType = block.getAttribute('data-block-type') || '';
      const m = bType.match(/^heading_?(\d)$/i) || bType.match(/^h(\d)$/i);
      const rawLevel = m ? parseInt(m[1], 10) : 1;
      const level = Math.min(6, rawLevel + 1); // 映射为 H2..H6
      const h = doc.createElement(`h${level}`);
      const lines = block.querySelectorAll('.ace-line, .view-line');
      if (lines.length > 0) {
        lines.forEach(line => {
          while (line.firstChild) h.appendChild(line.firstChild);
        });
      } else {
        const contentRoot = block.querySelector('.heading-block-content, .render-unit-wrapper') || block;
        while (contentRoot.firstChild) h.appendChild(contentRoot.firstChild);
      }

      // 如果标题下挂载了折叠子内容，转为结构
      const childrenWrapper = block.querySelector('.heading-block-children, .collapsible-content, .toggle-children');
      if (childrenWrapper && childrenWrapper.children.length > 0) {
        const frag = doc.createDocumentFragment();
        frag.appendChild(h);
        while (childrenWrapper.firstChild) frag.appendChild(childrenWrapper.firstChild);
        if (block.parentNode) block.parentNode.replaceChild(frag, block);
      } else if (h.textContent.trim() && block.parentNode) {
        block.parentNode.replaceChild(h, block);
      }
    });

    // 5.1 折叠列表与折叠块 (toggle / toggle_heading / collapsible)
    container.querySelectorAll('[data-block-type="toggle"], [data-block-type="toggle_heading"], [data-block-type="collapsible"], .toggle-block, [data-folded]').forEach(block => {
      const titleEl = block.querySelector('.toggle-header, .toggle-title, .toggle-header-text, .toggle-title-text, .ace-line, .view-line') || block.firstChild;
      const titleText = titleEl ? titleEl.textContent.replace(/[​‌‍﻿]/g, '').trim() : '折叠列表';
      const childrenRoot = block.querySelector('.toggle-block-children, .toggle-children, .toggle-content, .collapsible-content') || block;

      const bq = doc.createElement('blockquote');
      const pHead = doc.createElement('p');
      pHead.innerHTML = `<strong>[!FAQ]- ${titleText}</strong>`;
      bq.appendChild(pHead);

      if (childrenRoot && childrenRoot !== block) {
        while (childrenRoot.firstChild) bq.appendChild(childrenRoot.firstChild);
      } else {
        const lines = block.querySelectorAll('.ace-line, .view-line');
        if (lines.length > 1) {
          for (let i = 1; i < lines.length; i++) {
            const p = doc.createElement('p');
            while (lines[i].firstChild) p.appendChild(lines[i].firstChild);
            bq.appendChild(p);
          }
        }
      }
      if (block.parentNode) block.parentNode.replaceChild(bq, block);
    });

    // 6. 文本块: data-block-type="text" / "paragraph" / "body" 等
    container.querySelectorAll('[data-block-type="text"], [data-block-type="paragraph"], [data-block-type="body"], .text-block-wrapper, .docx-text-block').forEach(block => {
      const lines = block.querySelectorAll('.ace-line, .ace_line, .view-line');
      const frag = doc.createDocumentFragment();
      if (lines.length > 0) {
        lines.forEach(line => {
          const p = doc.createElement('p');
          while (line.firstChild) p.appendChild(line.firstChild);
          frag.appendChild(p);
        });
      } else {
        const contentRoot = block.querySelector('.text-block-content, .render-unit-wrapper, .zone-container') || block;
        const p = doc.createElement('p');
        while (contentRoot.firstChild) p.appendChild(contentRoot.firstChild);
        frag.appendChild(p);
      }
      if (block.parentNode) block.parentNode.replaceChild(frag, block);
    });

    // 7. 高亮块 (callout / highlight-block) -> 智能推断颜色类型 (DANGER, WARNING, TIP, INFO, FAQ, NOTE, SUCCESS)
    const calloutBlocks = Array.from(container.querySelectorAll('[data-block-type="callout"], [data-block-type="highlight"], .callout-block, .highlight-block, .docx-callout-block'));
    const processedCallouts = [];
    for (const block of calloutBlocks) {
      if (processedCallouts.some(p => p.contains(block))) continue;
      processedCallouts.push(block);

      const emojiEl = block.querySelector('.callout-emoji, .emoji-picker, .callout-icon, .icon-wrapper');
      const emoji = emojiEl ? (emojiEl.textContent || '').trim() : '';

      const style = (block.getAttribute('style') || '').toLowerCase();
      const cls = (block.className || '').toLowerCase();
      let calloutType = 'NOTE';
      if (cls.includes('red') || style.includes('red') || style.includes('255, 235') || style.includes('#ffe8e6') || style.includes('#ff4d4f')) {
        calloutType = 'DANGER';
      } else if (cls.includes('yellow') || cls.includes('orange') || style.includes('255, 251') || style.includes('#fffbe6') || style.includes('#faad14')) {
        calloutType = 'WARNING';
      } else if (cls.includes('green') || style.includes('green') || style.includes('235, 255') || style.includes('#f6ffed') || style.includes('#52c41a')) {
        calloutType = 'TIP';
      } else if (cls.includes('blue') || cls.includes('cyan') || style.includes('blue') || style.includes('230, 247') || style.includes('#e6f7ff') || style.includes('#1890ff')) {
        calloutType = 'INFO';
      } else if (cls.includes('purple') || style.includes('purple') || style.includes('249, 240') || style.includes('#f9f0ff') || style.includes('#722ed1')) {
        calloutType = 'FAQ';
      }

      const bq = doc.createElement('blockquote');
      const pHeader = doc.createElement('p');
      pHeader.innerHTML = `<strong>[!${calloutType}] ${emoji || '💡'}</strong>`;
      bq.appendChild(pHeader);

      const contentRoot = block.querySelector('.callout-block-children, .callout-content') || block;
      while (contentRoot.firstChild) bq.appendChild(contentRoot.firstChild);
      if (block.parentNode) block.parentNode.replaceChild(bq, block);
    }

    // 8. 表格处理: 单列表格是卡片容器 -> 解包为正文; 多列表格规范化保留
    container.querySelectorAll('[data-block-type="table"], .table-block, .docx-table-block').forEach(block => {
      const table = block.querySelector('table') || (block.tagName === 'TABLE' ? block : null);
      if (!table) return;
      const firstRow = table.querySelector('tr');
      const colCount = firstRow ? firstRow.children.length : 0;
      if (colCount <= 1) {
        const frag = doc.createDocumentFragment();
        table.querySelectorAll('td, th').forEach(td => {
          while (td.firstChild) frag.appendChild(td.firstChild);
        });
        if (block.parentNode) block.parentNode.replaceChild(frag, block);
      } else {
        table.removeAttribute('style');
        table.querySelectorAll('tr, td, th').forEach(el => {
          Array.from(el.attributes).forEach(attr => {
            if (attr.name !== 'colspan' && attr.name !== 'rowspan') el.removeAttribute(attr.name);
          });
        });
        if (block.parentNode && block !== table) block.parentNode.replaceChild(table, block);
      }
    });

    // 9. 列表块: bullet/ordered -> ul/li, ol/li (支持 data-indent-level 多级嵌套结构还原)
    const listBlocks = Array.from(container.querySelectorAll('[data-block-type="bullet"], [data-block-type="ordered"], [data-block-type="bullet_list"], [data-block-type="ordered_list"], .bullet-block, .ordered-block'));
    if (listBlocks.length > 0) {
      let currentRoot = null;
      let currentType = null;
      const stack = []; // [{ level, listEl, lastLi }]

      listBlocks.forEach(block => {
        const bType = block.getAttribute('data-block-type') || '';
        const isOrdered = bType.includes('ordered') || block.classList.contains('ordered-block');
        const type = isOrdered ? 'ol' : 'ul';
        const indent = parseInt(block.getAttribute('data-indent-level') || '0', 10);
        const li = doc.createElement('li');

        const lines = block.querySelectorAll('.ace-line, .view-line');
        if (lines.length > 0) {
          lines.forEach(line => { while (line.firstChild) li.appendChild(line.firstChild); });
        } else {
          const contentRoot = block.querySelector('.bullet-block-content, .ordered-block-content, .render-unit-wrapper') || block;
          while (contentRoot.firstChild) li.appendChild(contentRoot.firstChild);
        }

        const isConsecutive = block.previousElementSibling &&
          (block.previousElementSibling.matches('[data-block-type*="bullet"], [data-block-type*="ordered"], .bullet-block, .ordered-block') ||
           block.previousElementSibling === currentRoot);

        if (!currentRoot || !isConsecutive) {
          currentRoot = doc.createElement(type);
          currentType = type;
          stack.length = 0;
          stack.push({ level: indent, listEl: currentRoot, lastLi: li });
          currentRoot.appendChild(li);
          if (block.parentNode) block.parentNode.replaceChild(currentRoot, block);
        } else {
          while (stack.length > 1 && stack[stack.length - 1].level > indent) {
            stack.pop();
          }

          if (stack[stack.length - 1].level === indent) {
            stack[stack.length - 1].listEl.appendChild(li);
            stack[stack.length - 1].lastLi = li;
          } else if (indent > stack[stack.length - 1].level) {
            const subList = doc.createElement(type);
            subList.appendChild(li);
            const parentLi = stack[stack.length - 1].lastLi || stack[stack.length - 1].listEl.lastElementChild;
            if (parentLi) {
              parentLi.appendChild(subList);
            } else {
              stack[stack.length - 1].listEl.appendChild(subList);
            }
            stack.push({ level: indent, listEl: subList, lastLi: li });
          }
          block.remove();
        }
      });
    }

    // 10. 任务清单 / Todo 块 (todo / task / checklist)
    container.querySelectorAll('[data-block-type="todo"], [data-block-type="task"], [data-block-type="checklist"], .todo-block, .docx-todo-block').forEach(block => {
      const checked = block.querySelector('input[type="checkbox"]:checked') ||
                      block.querySelector('.todo-checkbox-checked, .task-checkbox-checked, [aria-checked="true"]');
      const li = doc.createElement('li');
      li.className = 'task-list-item';
      const prefix = checked ? '[x] ' : '[ ] ';
      const lines = block.querySelectorAll('.ace-line, .view-line');
      if (lines.length > 0) {
        li.textContent = prefix + Array.from(lines).map(l => l.textContent.replace(/[​‌‍﻿]/g, '')).join(' ');
      } else {
        li.textContent = prefix + (block.textContent || '').replace(/[​‌‍﻿]/g, '').trim();
      }
      if (block.parentNode) block.parentNode.replaceChild(li, block);
    });

    // 11. 代码块 (code / code_block / monaco / ace / block-code)
    container.querySelectorAll('[data-block-type="code"], [data-block-type="code_block"], .code-block-wrapper, .docx-code-block, .code-block-container').forEach(block => {
      const langAttr = block.getAttribute('data-lang') ||
                       block.getAttribute('data-language') ||
                       block.querySelector('[data-lang]')?.getAttribute('data-lang') ||
                       block.querySelector('[data-language]')?.getAttribute('data-language') ||
                       block.querySelector('.code-lang, .code-language, .lang-text')?.textContent?.trim() ||
                       '';

      const pre = doc.createElement('pre');
      if (langAttr) pre.setAttribute('data-lang', langAttr.toLowerCase());

      const clone = block.cloneNode(true);
      clone.querySelectorAll('.code-block-header, .code-header, .copy-btn, .copy-code, .margin, .ace_gutter, .line-numbers').forEach(el => el.remove());

      const lineElements = clone.querySelectorAll('.view-line, .ace-line, .ace_line');
      const code = doc.createElement('code');

      if (lineElements.length > 0) {
        const lines = Array.from(lineElements).map(lineEl => {
          return (lineEl.textContent || '').replace(/[​‌‍﻿]/g, '');
        });
        code.textContent = lines.join('\n');
      } else {
        const codeEl = clone.querySelector('.view-lines, .lines-content, .code-block-content, .zone-container, pre, code') || clone;
        code.textContent = (codeEl.textContent || '').replace(/[​‌‍﻿]/g, '');
      }

      pre.appendChild(code);
      if (block.parentNode) block.parentNode.replaceChild(pre, block);
    });

    // 12. 分割线
    container.querySelectorAll('[data-block-type="divider"], [data-block-type="hr"], .divider-block').forEach(block => {
      const hr = doc.createElement('hr');
      if (block.parentNode) block.parentNode.replaceChild(hr, block);
    });

    // 13. 引用块 (quote / quote_container / blockquote)
    container.querySelectorAll('[data-block-type="quote"], [data-block-type="quote_container"], [data-block-type="blockquote"], .quote-block').forEach(block => {
      const bq = doc.createElement('blockquote');
      const lines = block.querySelectorAll('.ace-line, .view-line');
      if (lines.length > 0) {
        lines.forEach(line => {
          const p = doc.createElement('p');
          while (line.firstChild) p.appendChild(line.firstChild);
          bq.appendChild(p);
        });
      } else {
        while (block.firstChild) bq.appendChild(block.firstChild);
      }
      if (block.parentNode) block.parentNode.replaceChild(bq, block);
    });

    // 14. 附件文件块 (file / file_card / drive_file)
    container.querySelectorAll('[data-block-type="file"], .file-block, .file-card-wrapper, .drive-file-card, .docx-file-block').forEach(block => {
      const nameEl = block.querySelector('.file-name, .file-title, .title-text, .drive-file-name') || block;
      const fileName = (nameEl.textContent || '附件文件').replace(/[​‌‍﻿]/g, '').trim();
      const sizeEl = block.querySelector('.file-size, .extra-info, .size');
      const sizeText = sizeEl ? ` (${sizeEl.textContent.trim()})` : '';
      const linkEl = block.querySelector('a') || block.closest('a');
      const fileUrl = linkEl ? linkEl.href : '#';
      const p = doc.createElement('p');
      p.innerHTML = `📎 <strong>附件：</strong><a href="${fileUrl}">${fileName}${sizeText}</a>`;
      if (block.parentNode) block.parentNode.replaceChild(p, block);
    });

    // 15. 思维导图 / 流程图 / 白板 (mindnote / diagram / board / whiteboard)
    container.querySelectorAll('[data-block-type="mindnote"], [data-block-type="diagram"], [data-block-type="board"], [data-block-type="whiteboard"], .mindnote-block, .diagram-block').forEach(block => {
      const titleEl = block.querySelector('.title, .mindnote-title, .diagram-title, .header-text');
      const title = titleEl ? titleEl.textContent.trim() : '思维导图/流程图组件';
      const img = block.querySelector('img');
      const frag = doc.createDocumentFragment();

      const p = doc.createElement('p');
      p.innerHTML = `📊 <strong>[${title}]</strong>`;
      frag.appendChild(p);

      if (img) {
        frag.appendChild(img.cloneNode(true));
      }

      const textNodes = Array.from(block.querySelectorAll('.mindmap-node-text, .mindmap-node, .node-text, .canvas-text-content'));
      if (textNodes.length > 0) {
        const details = doc.createElement('details');
        const summary = doc.createElement('summary');
        summary.textContent = `📋 展开导图文本大纲 (${textNodes.length} 个节点)`;
        details.appendChild(summary);

        const ul = doc.createElement('ul');
        textNodes.forEach(node => {
          const t = node.textContent.trim();
          if (t && t.length > 0) {
            const li = doc.createElement('li');
            li.textContent = t;
            ul.appendChild(li);
          }
        });
        details.appendChild(ul);
        frag.appendChild(details);
      }

      if (block.parentNode) block.parentNode.replaceChild(frag, block);
    });

    // 16. 多维表格与电子表格 (bitable / sheet / base)
    container.querySelectorAll('[data-block-type="bitable"], [data-block-type="sheet"], [data-block-type="base"], .bitable-block, .sheet-block, .docx-bitable-block').forEach(block => {
      const innerTable = block.querySelector('table');
      if (innerTable) {
        if (block.parentNode) block.parentNode.replaceChild(innerTable, block);
      } else {
        const gridRows = block.querySelectorAll('.grid-header, .grid-row, .table-row, .canvas-row');
        if (gridRows.length > 0) {
          const table = doc.createElement('table');
          const tbody = doc.createElement('tbody');
          gridRows.forEach((r, rIdx) => {
            const tr = doc.createElement('tr');
            const cells = r.querySelectorAll('.grid-cell, .cell, .bitable-cell');
            cells.forEach(c => {
              const cellTag = (rIdx === 0 || r.classList.contains('grid-header')) ? 'th' : 'td';
              const td = doc.createElement(cellTag);
              td.textContent = c.textContent.trim();
              tr.appendChild(td);
            });
            tbody.appendChild(tr);
          });
          table.appendChild(tbody);
          if (block.parentNode) block.parentNode.replaceChild(table, block);
        } else {
          const titleEl = block.querySelector('.bitable-title, .sheet-title, .card-title, .title-text');
          const title = titleEl ? titleEl.textContent.trim() : '多维数据表';
          const linkEl = block.querySelector('a') || block.closest('a');
          const link = linkEl ? linkEl.href : '';
          const p = doc.createElement('p');
          p.innerHTML = `📊 <strong>[数据表: ${title}]</strong>` + (link ? ` <a href="${link}">查看原始表格</a>` : '');
          if (block.parentNode) block.parentNode.replaceChild(p, block);
        }
      }
    });

    // 17. 数学公式 (equation & equation-inline)
    container.querySelectorAll('[data-block-type="equation"], [data-block-type="latex"], .equation-block, .docx-equation-block').forEach(eq => {
      const formula = (eq.getAttribute('data-equation') || eq.getAttribute('data-latex') || eq.textContent || '').replace(/[​‌‍﻿]/g, '').trim();
      if (formula) {
        const p = doc.createElement('p');
        p.textContent = `$$${formula}$$`;
        if (eq.parentNode) eq.parentNode.replaceChild(p, eq);
      }
    });
    container.querySelectorAll('.equation-inline, [data-equation-inline]').forEach(eq => {
      const formula = (eq.getAttribute('data-equation') || eq.getAttribute('data-latex') || eq.textContent || '').replace(/[​‌‍﻿]/g, '').trim();
      if (formula) {
        const span = doc.createElement('span');
        span.textContent = `$${formula}$`;
        if (eq.parentNode) eq.parentNode.replaceChild(span, eq);
      }
    });

    // 18. Mention 与双链引用 (@User / @Doc / @Date)
    container.querySelectorAll('.docx-mention-doc, .mention-doc, [data-mention-type="doc"], [data-mention-type="wiki"]').forEach(el => {
      const docTitle = el.textContent.replace(/[​‌‍﻿@]/g, '').trim();
      if (docTitle) {
        const span = doc.createElement('span');
        span.textContent = ` [[${docTitle}]] `;
        if (el.parentNode) el.parentNode.replaceChild(span, el);
      }
    });
    container.querySelectorAll('.docx-mention-user, .mention-user, [data-mention-type="user"]').forEach(el => {
      const userName = el.textContent.replace(/[​‌‍﻿]/g, '').trim();
      if (userName) {
        const span = doc.createElement('span');
        span.textContent = ` ${userName.startsWith('@') ? userName : '@' + userName} `;
        if (el.parentNode) el.parentNode.replaceChild(span, el);
      }
    });
    container.querySelectorAll('.docx-mention-date, .mention-date, [data-mention-type="date"], [data-mention-type="time"]').forEach(el => {
      const dateVal = el.textContent.replace(/[​‌‍﻿]/g, '').trim();
      if (dateVal) {
        const span = doc.createElement('span');
        span.textContent = ` 📅 ${dateVal} `;
        if (el.parentNode) el.parentNode.replaceChild(span, el);
      }
    });

    // 19. 网页书签与外链卡片 (bookmark / link_card)
    container.querySelectorAll('[data-block-type="bookmark"], [data-block-type="link_card"], .bookmark-block, .link-card-block').forEach(card => {
      const titleEl = card.querySelector('.title, .card-title, .bookmark-title');
      const title = titleEl ? titleEl.textContent.trim() : '网页链接';
      const linkEl = card.querySelector('a') || card.closest('a');
      const href = linkEl ? linkEl.href : '#';
      const descEl = card.querySelector('.desc, .card-desc, .description');
      const desc = descEl ? ` - ${descEl.textContent.trim()}` : '';
      const p = doc.createElement('p');
      p.innerHTML = `🔖 <strong>[书签: <a href="${href}">${title}</a>]</strong>${desc}`;
      if (card.parentNode) card.parentNode.replaceChild(p, card);
    });

    // 20. 投票与待办组等复合组件 (poll / agenda / meeting_notes)
    container.querySelectorAll('[data-block-type="poll"], .poll-block').forEach(poll => {
      const title = poll.querySelector('.poll-title, .title')?.textContent?.trim() || '飞书投票';
      const options = Array.from(poll.querySelectorAll('.poll-option, .option-item')).map(o => o.textContent.trim()).filter(Boolean);
      const p = doc.createElement('p');
      p.innerHTML = `📊 <strong>[投票: ${title}]</strong>` + (options.length ? ` (${options.join(' / ')})` : '');
      if (poll.parentNode) poll.parentNode.replaceChild(p, poll);
    });

    // 21. 文本荧光笔高亮 (Highlight / Mark)
    container.querySelectorAll('.text-highlight, [data-highlight="true"], mark, span[style*="background"]').forEach(el => {
      const style = (el.getAttribute('style') || '').toLowerCase();
      const hasHighlight = el.classList.contains('text-highlight') || el.hasAttribute('data-highlight') || (style.includes('background') && (style.includes('rgba') || style.includes('rgb') || style.includes('#')));
      if (hasHighlight && el.textContent.trim() && el.tagName !== 'MARK') {
        const mark = doc.createElement('mark');
        while (el.firstChild) mark.appendChild(el.firstChild);
        if (el.parentNode) el.parentNode.replaceChild(mark, el);
      }
    });

    // 22. 内联富文本样式语义化 (加粗/斜体/删除线/行内代码)
    container.querySelectorAll('.bold, [data-bold="true"], span[style*="font-weight: bold"], span[style*="font-weight: 700"]').forEach(el => {
      if (el.tagName !== 'STRONG' && el.tagName !== 'B') {
        const strong = doc.createElement('strong');
        while (el.firstChild) strong.appendChild(el.firstChild);
        if (el.parentNode) el.parentNode.replaceChild(strong, el);
      }
    });
    container.querySelectorAll('.italic, [data-italic="true"], span[style*="font-style: italic"]').forEach(el => {
      if (el.tagName !== 'EM' && el.tagName !== 'I') {
        const em = doc.createElement('em');
        while (el.firstChild) em.appendChild(el.firstChild);
        if (el.parentNode) el.parentNode.replaceChild(em, el);
      }
    });
    container.querySelectorAll('.strikethrough, [data-strikethrough="true"], span[style*="line-through"]').forEach(el => {
      if (el.tagName !== 'DEL' && el.tagName !== 'S') {
        const del = doc.createElement('del');
        while (el.firstChild) del.appendChild(el.firstChild);
        if (el.parentNode) el.parentNode.replaceChild(del, el);
      }
    });
    container.querySelectorAll('.inline-code, .text-inline-code, [data-inline-code="true"]').forEach(el => {
      if (el.tagName !== 'CODE') {
        const code = doc.createElement('code');
        while (el.firstChild) code.appendChild(el.firstChild);
        if (el.parentNode) el.parentNode.replaceChild(code, el);
      }
    });

    return container;
  }

  // 寻找真正的滚动驱动容器 (支持 /docx/, /wiki/, /docs/, /file/, /drive/ 全模式)
  static findPrimaryScroller() {
    const customSelectors = [
      '.docx-editor',
      '.bear-web-editor',
      '.suite-doc-view-container',
      '.docx-document-view',
      '.docx-viewer',
      '.doc-page-container',
      '.file-preview-container',
      '.drive-file-viewer',
      '.drive-preview-body',
      '.file-view-container',
      '.client-render-container',
      '.suite-view-docx-page',
      '.docx-editor-wrapper',
      '.bear-web-x-container',
      '.monaco-scrollable-element',
      '.overflow-guard',
      '.monaco-editor'
    ];
    for (const sel of customSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        try {
          const style = (typeof window !== 'undefined' && window.getComputedStyle) ? window.getComputedStyle(el) : null;
          const isScroll = style ? (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') : false;
          if (isScroll) {
            // 在实际浏览器中，若发生滚动，scrollHeight 通常大于 clientHeight；若在未布局或测试环境中，依然命中高优先级滚动容器
            if (el.scrollHeight > el.clientHeight + 30 || el.scrollHeight === 0 || el.scrollHeight === el.clientHeight) {
              return el;
            }
          }
        } catch (e) {}
        if (el.scrollHeight > el.clientHeight + 100) return el;
      }
    }
    const allDivs = Array.from(document.querySelectorAll('div, section, main, article'));
    let best = null;
    let maxH = 0;
    for (const el of allDivs) {
      try {
        const style = window.getComputedStyle(el);
        const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') &&
                             el.scrollHeight > el.clientHeight + 100;
        if (isScrollable && el.scrollHeight > maxH) {
          maxH = el.scrollHeight;
          best = el;
        }
      } catch (e) {}
    }
    return best || document.scrollingElement || document.documentElement || document.body;
  }

  // 编辑器与文档根节点 (覆盖飞书全部文档与文件预览容器)
  static findEditorRoot() {
    return document.querySelector('[data-block-type="page"]') ||
           document.querySelector('.docx-page-block') ||
           document.querySelector('.page-block-children') ||
           document.querySelector('.docx-page') ||
           document.querySelector('.bear-web-editor') ||
           document.querySelector('.docx-editor') ||
           document.querySelector('.bear-web-x-container .page-main-item.editor') ||
           document.querySelector('.bear-web-x-container .page-main') ||
           document.querySelector('.drive-file-viewer') ||
           document.querySelector('.file-preview-content') ||
           document.querySelector('.drive-file-preview-content') ||
           document.querySelector('.docx-document-view') ||
           document.querySelector('.docx-viewer') ||
           document.querySelector('.doc-page-container') ||
           document.querySelector('.feishu-document-content') ||
           document.querySelector('.doc-content') ||
           document.querySelector('.suite-view-docx-page') ||
           document.querySelector('.client-render-container') ||
           document.querySelector('.monaco-editor') ||
           document.querySelector('#doc-bg');
  }

  // 获取顶层块集合（严格只收割顶级块，杜绝将嵌套子节点作为兄弟节点重复收割）
  static getTopLevelBlocks() {
    const pageChildrenSelectors = [
      '[data-block-type="page"] > .page-block-children',
      '.docx-page-block > .page-block-children',
      '.docx-page > .page-block-children',
      '.bear-web-editor > .page-block-children',
      '.page-block-children',
      '.suite-view-docx-page',
      '.docx-page-block',
      '.file-preview-content'
    ];

    for (const sel of pageChildrenSelectors) {
      const container = document.querySelector(sel);
      if (container && container.children.length > 0) {
        const list = Array.from(container.children).filter(el => {
          if (el.classList.contains('bear-virtual-renderUnit-placeholder')) return false;
          if (el.classList.contains('docx-ai-panel') || el.classList.contains('ai-digest-container')) return false;
          return true;
        });
        if (list.length > 0) return list;
      }
    }

    const allBlocks = Array.from(document.querySelectorAll('[data-block-type], .render-unit-wrapper, .docx-block'));
    return allBlocks.filter(b => {
      const bType = b.getAttribute('data-block-type');
      if (bType === 'page' || bType?.startsWith('ai_') || bType === 'quick_read') return false;
      if (b.closest && b.closest('.docx-ai-panel, .docx-ai-quick-read, .ai-digest-container, .ai-summary-block')) return false;

      let parent = b.parentElement;
      while (parent && parent !== document.body) {
        if (parent.hasAttribute('data-block-type') && parent.getAttribute('data-block-type') !== 'page') {
          return false;
        }
        parent = parent.parentElement;
      }
      return true;
    });
  }

  static getBlockUniqueId(el, index = 0) {
    if (!el) return '';
    const directId = el.getAttribute('data-block-id') ||
                     el.getAttribute('data-record-id') ||
                     el.getAttribute('data-zone-id') ||
                     el.id;
    if (directId) return directId;

    const childWithId = el.querySelector?.('[data-block-id], [data-record-id], [data-zone-id]');
    if (childWithId) {
      const cId = childWithId.getAttribute('data-block-id') ||
                  childWithId.getAttribute('data-record-id') ||
                  childWithId.getAttribute('data-zone-id');
      if (cId) return cId;
    }

    const bType = el.getAttribute?.('data-block-type') ||
                  childWithId?.getAttribute?.('data-block-type') ||
                  el.className ||
                  'block';
    const textSample = (el.textContent || '').replace(/[\s​‌‍﻿]/g, '').slice(0, 40);
    return `${bType}_${textSample}_${index}`;
  }

  // 飞书 docx 虚拟列表步进收割引擎
  static async harvestAllBlocks(maxDurationMs = 30000) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return [];

    const scroller = FeishuAdapter.findPrimaryScroller();
    const isGlobal = (scroller === document.documentElement || scroller === document.body || scroller === document.scrollingElement);

    const getScrollTop = () => isGlobal ? (window.pageYOffset || document.documentElement.scrollTop) : scroller.scrollTop;
    const getScrollHeight = () => isGlobal ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) : scroller.scrollHeight;
    const getClientHeight = () => isGlobal ? window.innerHeight : scroller.clientHeight;
    const setScrollTop = (val) => {
      try { window.scrollTo({ top: val, behavior: 'instant' }); } catch (e) {}
      if (!isGlobal && scroller) {
        scroller.scrollTop = val;
      }
    };

    const initialScrollTop = getScrollTop();
    const blockMap = new Map();
    const orderedBlockIds = [];

    function harvest() {
      const topBlocks = FeishuAdapter.getTopLevelBlocks();
      topBlocks.forEach((b, idx) => {
        const id = FeishuAdapter.getBlockUniqueId(b, idx);
        if (!id) return;

        if (!blockMap.has(id)) {
          blockMap.set(id, b.cloneNode(true));
          orderedBlockIds.push(id);
        } else {
          const existing = blockMap.get(id);
          const hasNewToken = b.querySelector('[image-token], img[src]:not([src^="data:image/svg"])');
          const existingHasToken = existing.querySelector('[image-token], img[src]:not([src^="data:image/svg"])');
          if (hasNewToken && !existingHasToken) {
            blockMap.set(id, b.cloneNode(true));
          }
        }
      });
    }

    // 1. 优先收割当前视口顶层块
    harvest();

    const placeholders = document.querySelectorAll('.bear-virtual-renderUnit-placeholder');
    const hasVirtualList = placeholders.length > 0 || (getScrollHeight() - getClientHeight() > 300);

    if (hasVirtualList) {
      const startTime = Date.now();
      const step = 450;
      let currentPos = 0;
      let sameHeightCount = 0;
      let lastTotalHeight = getScrollHeight();

      setScrollTop(0);
      await sleep(150);
      harvest();

      while (Date.now() - startTime < maxDurationMs) {
        currentPos += step;
        setScrollTop(currentPos);

        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
        if (!isGlobal && scroller.dispatchEvent) scroller.dispatchEvent(new Event('scroll'));

        await sleep(100);
        harvest();

        const totalH = getScrollHeight();
        const clientH = getClientHeight();
        const curTop = getScrollTop();

        // 触底判定
        if (curTop + clientH >= totalH - 15) {
          if (totalH === lastTotalHeight) {
            sameHeightCount++;
            if (sameHeightCount >= 3) break;
            await sleep(250);
          } else {
            sameHeightCount = 0;
            lastTotalHeight = totalH;
          }
        } else {
          sameHeightCount = 0;
        }
      }
    }

    // 2. 复位用户滚动位置
    setScrollTop(initialScrollTop);

    return orderedBlockIds.map(id => blockMap.get(id)).filter(Boolean);
  }

  static async extractContent() {
    // 1. 优先检测是否为飞书 Monaco Editor 文件预览模式 (/file/<token> 或云空间预览 Markdown / 文本 / 代码文件)
    const isDocxPage = !!document.querySelector('[data-block-type="page"], .docx-page-block, .page-block-children, .suite-view-docx-page');
    const monacoFileViewer = document.querySelector('.drive-file-viewer .monaco-editor, .file-preview-content .monaco-editor, .file-view-container .monaco-editor, .drive-preview-body .monaco-editor');
    const standaloneMonaco = !isDocxPage ? document.querySelector('.monaco-editor') : null;
    const monacoEditor = monacoFileViewer || standaloneMonaco;

    if (monacoEditor) {
      const monacoClone = monacoEditor.cloneNode(true);
      monacoClone.querySelectorAll('.margin, .margin-view-overlays, .line-numbers, .glyph-margin, .minimap').forEach(el => el.remove());
      const viewLines = monacoClone.querySelectorAll('.view-line');
      let rawLines = [];
      if (viewLines.length > 0) {
        rawLines = Array.from(viewLines).map(l => (l.textContent || '').replace(/[​‌‍﻿]/g, ''));
      } else {
        const textContent = monacoClone.querySelector('.view-lines')?.textContent || monacoClone.textContent || '';
        rawLines = [textContent.replace(/[​‌‍﻿]/g, '')];
      }
      const fullText = rawLines.join('\n');
      if (fullText.trim().length > 0) {
        const pre = document.createElement('pre');
        pre.setAttribute('data-raw-markdown', 'true');
        pre.textContent = fullText;
        return pre;
      }
    }

    const editor = FeishuAdapter.findEditorRoot();

    // 尝试执行虚拟列表收割
    let harvestedElements = [];
    try {
      harvestedElements = await FeishuAdapter.harvestAllBlocks();
    } catch (e) {
      console.warn('[md-drama] 飞书虚拟列表收割遇到异常，回退常规提取:', e);
    }

    let container = document.createElement('div');
    container.className = 'docx-page-block';

    if (harvestedElements && harvestedElements.length > 0) {
      harvestedElements.forEach(el => container.appendChild(el));
    } else if (editor) {
      container = editor.cloneNode(true);
    } else {
      return GenericAdapter.extractContent();
    }

    // 规范化与清洗飞书 docx 块结构
    FeishuAdapter.normalizeDocxBlocks(container);

    // 针对飞书图片与图片块提取永久高清地址
    const imageNodes = container.querySelectorAll('img, [data-block-type="image"], .image-block, .docx-image-wrapper, .render-element-image');
    imageNodes.forEach(node => {
      const realSrc = FeishuAdapter.getRealImageSrc(node);
      if (node.tagName === 'IMG') {
        if (realSrc) {
          node.setAttribute('src', realSrc);
        }
      } else {
        const existingImg = node.querySelector('img');
        if (existingImg) {
          if (realSrc) existingImg.setAttribute('src', realSrc);
        } else if (realSrc) {
          const newImg = document.createElement('img');
          newImg.setAttribute('src', realSrc);
          newImg.setAttribute('alt', 'feishu-image');
          node.appendChild(newImg);
        }
      }
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.FeishuAdapter = FeishuAdapter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { FeishuAdapter };
}
