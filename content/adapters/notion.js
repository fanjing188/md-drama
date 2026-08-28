// content/adapters/notion.js - Notion 公开分享页面专属适配器

class NotionAdapter {
  static get name() { return 'Notion'; }

  static matches(url) {
    return /notion\.site|notion\.so/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('.notion-page-block > h1') ||
                    document.querySelector('.notion-title') ||
                    document.querySelector('h1.notion-header__title') ||
                    document.querySelector('.notion-page-content h1') ||
                    document.querySelector('h1');
    const title = (titleEl ? (titleEl.textContent || '').trim() : '') || document.title;

    return {
      title: (title || 'Notion Page').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: 'Notion User',
      date: new Date().toISOString().split('T')[0],
      source: window.location.href,
      tags: ['Notion', '知识库']
    };
  }

  // 规范化 Notion 专属结构: Toggle 列表、多列 Column、Callout、数据库表格
  static normalizeNotionBlocks(container) {
    const doc = document;

    // 1. Notion Toggle 可折叠列表 (.notion-toggle)
    container.querySelectorAll('.notion-toggle').forEach(toggle => {
      const summaryEl = toggle.querySelector('.notion-toggle-summary, [role="button"]') || toggle.firstElementChild;
      const summaryText = summaryEl ? summaryEl.textContent.trim() : '折叠列表';
      const bq = doc.createElement('blockquote');
      const p = doc.createElement('p');
      p.innerHTML = `<strong>[!FAQ]- ${summaryText}</strong>`;
      bq.appendChild(p);

      const contentRoot = toggle.querySelector('.notion-toggle-content') || toggle;
      if (contentRoot !== toggle) {
        while (contentRoot.firstChild) bq.appendChild(contentRoot.firstChild);
      } else if (summaryEl) {
        summaryEl.remove();
        while (toggle.firstChild) bq.appendChild(toggle.firstChild);
      }
      if (toggle.parentNode) toggle.parentNode.replaceChild(bq, toggle);
    });

    // 2. Notion Callout (支持颜色推断与 Emoji 提取)
    container.querySelectorAll('.notion-callout-block, .notion-callout').forEach(callout => {
      const emojiEl = callout.querySelector('.notion-page-icon, .notion-callout-icon, [role="image"]');
      const emoji = emojiEl ? emojiEl.textContent.trim() : '💡';
      if (emojiEl) emojiEl.remove();

      // 提取背景色类型
      const cls = (callout.className || '').toLowerCase();
      let calloutType = 'NOTE';
      if (cls.includes('red')) calloutType = 'DANGER';
      else if (cls.includes('orange') || cls.includes('yellow')) calloutType = 'WARNING';
      else if (cls.includes('green')) calloutType = 'TIP';
      else if (cls.includes('blue')) calloutType = 'INFO';
      else if (cls.includes('purple')) calloutType = 'FAQ';

      const bq = doc.createElement('blockquote');
      bq.innerHTML = `<strong>[!${calloutType}] ${emoji}</strong><br>${callout.innerHTML.trim()}`;
      if (callout.parentNode) callout.parentNode.replaceChild(bq, callout);
    });

    // 3. Notion 多列布局 (Column List) -> 拍平为线性
    container.querySelectorAll('.notion-column_list-block, .notion-column-list').forEach(colList => {
      const frag = doc.createDocumentFragment();
      const cols = colList.querySelectorAll('.notion-column-block, .notion-column');
      if (cols.length > 0) {
        cols.forEach(col => {
          while (col.firstChild) frag.appendChild(col.firstChild);
        });
      } else {
        while (colList.firstChild) frag.appendChild(colList.firstChild);
      }
      if (colList.parentNode) colList.parentNode.replaceChild(frag, colList);
    });

    // 4. Notion 表格与 Database 表格视图
    container.querySelectorAll('.notion-table-view, .notion-collection-view-table').forEach(dbTable => {
      const rows = dbTable.querySelectorAll('.notion-collection-item, [role="row"]');
      if (rows.length > 0) {
        const table = doc.createElement('table');
        const tbody = doc.createElement('tbody');
        rows.forEach((r, rIdx) => {
          const tr = doc.createElement('tr');
          const cells = r.querySelectorAll('[role="cell"], [role="columnheader"], .notion-table-cell');
          cells.forEach(c => {
            const cellTag = rIdx === 0 ? 'th' : 'td';
            const td = doc.createElement(cellTag);
            td.textContent = c.textContent.trim();
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        if (dbTable.parentNode) dbTable.parentNode.replaceChild(table, dbTable);
      }
    });
  }

  static extractContent() {
    const mainEl = document.querySelector('.notion-page-content') ||
                   document.querySelector('.notion-scroller') ||
                   document.querySelector('.notion-page-view') ||
                   document.querySelector('.notion-frame');

    if (!mainEl) return GenericAdapter.extractContent();

    const container = mainEl.cloneNode(true);

    // 剔除 Notion 顶部操作栏、评论框、侧边栏
    const noiseSelectors = [
      '.notion-topbar',
      '.notion-help-button',
      '.notion-cursor-listener',
      '.notion-page-controls',
      '.notion-sidebar',
      '.notion-overlay-container'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

    // 规范化 Notion 块结构
    NotionAdapter.normalizeNotionBlocks(container);

    // Notion 图片地址修复 (处理 s3 签名与缩放)
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('src') || img.getAttribute('data-src');
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.NotionAdapter = NotionAdapter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NotionAdapter };
}
