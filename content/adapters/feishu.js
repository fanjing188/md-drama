// content/adapters/feishu.js - 飞书/Lark 文档深度解析 Adapter

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
                    document.querySelector('.wiki-title');

    let title = titleEl ? (titleEl.textContent || '').trim() : '';
    // 页头 logo 的 <h1> 固定为 "飞书云文档", 不能当作文档标题
    if (!title || title === '飞书云文档' || title === 'Lark') {
      title = (document.title || '').replace(/\s*[-|｜]\s*(飞书云文档|飞书|Lark)\s*$/, '').trim();
    }
    if (!title) title = '飞书文档';

    return {
      title: title.replace(/[/\\?%*:|"<>]/g, '-'),
      author: 'Feishu User',
      date: new Date().toISOString().split('T')[0],
      source: window.location.href,
      tags: ['feishu', 'doc-clip']
    };
  }

  // 综合解析获取真实图片地址（支持从 image-token / record-id 构造永久高清 CDN 流地址）
  static getRealImageSrc(el) {
    if (!el) return '';

    // 1. 优先通过飞书 image-token 和 record-id 构造永久高分辨率 drive stream 链接（彻底避免 blob: URL 过期失效）
    const imgToken = el.getAttribute?.('image-token') ||
                     el.querySelector?.('[image-token]')?.getAttribute('image-token') ||
                     el.parentElement?.getAttribute?.('image-token') ||
                     el.closest?.('[image-token]')?.getAttribute('image-token');

    const recordId = el.getAttribute?.('data-record-id') ||
                     el.querySelector?.('[data-record-id]')?.getAttribute('data-record-id') ||
                     el.closest?.('[data-record-id]')?.getAttribute('data-record-id') ||
                     el.getAttribute?.('data-block-id') ||
                     el.closest?.('[data-block-id]')?.getAttribute('data-block-id');

    if (imgToken && recordId) {
      return `https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/v2/cover/${imgToken}/?fallback_source=1&height=1280&mount_node_token=${recordId}&mount_point=docx_image&policy=equal&width=1280`;
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

  // 飞书 docx 使用 data-block-type 标记块语义, 且大量使用布局表格与嵌套 div。
  // 这里将其规范化为标准 HTML, 保证层级/列表/引用/表格/代码 1:1 还原。
  static normalizeDocxBlocks(container) {
    const doc = document;

    // 1. 清理噪声: 打印占位文案、AI速读/摘要、评论气泡、选区遮罩、光标、侧栏、零宽占位等
    const removeSelectors = [
      // 飞书 AI 速读 / AI 摘要 / 智能提炼板块
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
      // 图片块"附件不支持打印"等占位提示
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

    // 2. 文档主标题: 拍平成纯文本 h1
    container.querySelectorAll('.page-block-header h1, h1.page-block-content').forEach(h => {
      const text = (h.textContent || '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
      if (!text) return;
      const clean = doc.createElement('h1');
      clean.textContent = text;
      h.parentNode.replaceChild(clean, h);
    });

    // 3. 文本块: data-block-type="text" 的每个 .ace-line 转为 <p>
    container.querySelectorAll('[data-block-type="text"]').forEach(block => {
      const lines = block.querySelectorAll('.ace-line');
      if (lines.length === 0) return;
      const frag = doc.createDocumentFragment();
      lines.forEach(line => {
        const p = doc.createElement('p');
        while (line.firstChild) p.appendChild(line.firstChild);
        frag.appendChild(p);
      });
      if (block.parentNode) block.parentNode.replaceChild(frag, block);
    });

    // 4. 标题块: heading1..heading9 -> h1..h6
    container.querySelectorAll('[data-block-type^="heading"]').forEach(block => {
      const m = block.getAttribute('data-block-type').match(/^heading(\d)$/);
      if (!m) return;
      const level = Math.min(6, parseInt(m[1], 10) + 1);
      const h = doc.createElement(`h${level}`);
      const lines = block.querySelectorAll('.ace-line');
      if (lines.length > 0) {
        lines.forEach(line => {
          while (line.firstChild) h.appendChild(line.firstChild);
        });
      } else {
        h.textContent = (block.textContent || '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
      }
      if (h.textContent.trim() && block.parentNode) block.parentNode.replaceChild(h, block);
    });

    // 5. 高亮块: callout -> blockquote (Obsidian [!NOTE])
    const calloutBlocks = Array.from(container.querySelectorAll('[data-block-type="callout"], .callout-block, .highlight-block'));
    const processedCallouts = [];
    for (const block of calloutBlocks) {
      if (processedCallouts.some(p => p.contains(block))) continue;
      processedCallouts.push(block);
      const bq = doc.createElement('blockquote');
      bq.appendChild(doc.createElement('p')).innerHTML = '<strong>[!NOTE]</strong>';
      const contentRoot = block.querySelector('.callout-block-children') || block;
      while (contentRoot.firstChild) bq.appendChild(contentRoot.firstChild);
      if (block.parentNode) block.parentNode.replaceChild(bq, block);
    }

    // 6. 表格处理: 单列表格是卡片容器 -> 解包为正文; 多列表格保留为真实表格
    container.querySelectorAll('[data-block-type="table"]').forEach(block => {
      const table = block.querySelector('table');
      if (!table) return;
      const firstRow = table.querySelector('tr');
      const colCount = firstRow ? firstRow.children.length : 0;
      if (colCount <= 1) {
        const frag = doc.createDocumentFragment();
        table.querySelectorAll('td').forEach(td => {
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
        if (block.parentNode) block.parentNode.replaceChild(table, block);
      }
    });

    // 7. 列表块: bullet/ordered -> ul/li, ol/li
    container.querySelectorAll('[data-block-type="bullet"]').forEach(block => {
      const li = doc.createElement('li');
      const lines = block.querySelectorAll('.ace-line');
      if (lines.length > 0) {
        lines.forEach(line => { while (line.firstChild) li.appendChild(line.firstChild); });
      } else {
        li.textContent = (block.textContent || '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
      }
      if (block.parentNode) block.parentNode.replaceChild(li, block);
    });
    container.querySelectorAll('[data-block-type="ordered"]').forEach(block => {
      const li = doc.createElement('li');
      const lines = block.querySelectorAll('.ace-line');
      if (lines.length > 0) {
        lines.forEach(line => { while (line.firstChild) li.appendChild(line.firstChild); });
      } else {
        li.textContent = (block.textContent || '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
      }
      if (block.parentNode) block.parentNode.replaceChild(li, block);
    });
    container.querySelectorAll('li').forEach(li => {
      if (li.parentNode && li.parentNode.tagName !== 'UL' && li.parentNode.tagName !== 'OL') {
        const ul = doc.createElement('ul');
        li.parentNode.insertBefore(ul, li);
        ul.appendChild(li);
      }
    });

    // 8. 任务清单 / Todo 块
    container.querySelectorAll('[data-block-type="todo"], [data-block-type="task"]').forEach(block => {
      const checked = block.querySelector('input[type="checkbox"]:checked') ||
                      block.querySelector('.todo-checkbox-checked, .task-checkbox-checked, [aria-checked="true"]');
      const li = doc.createElement('li');
      li.className = 'task-list-item';
      const prefix = checked ? '[x] ' : '[ ] ';
      const lines = block.querySelectorAll('.ace-line');
      if (lines.length > 0) {
        li.textContent = prefix + Array.from(lines).map(l => l.textContent.replace(/[\u200B\u200C\u200D\uFEFF]/g, '')).join(' ');
      } else {
        li.textContent = prefix + (block.textContent || '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '').trim();
      }
      if (block.parentNode) block.parentNode.replaceChild(li, block);
    });

    // 9. 代码块
    container.querySelectorAll('[data-block-type="code"]').forEach(block => {
      const codeEl = block.querySelector('.code-block-content, .zone-container, pre') || block;
      const langAttr = block.getAttribute('data-lang') || block.querySelector('[data-lang]')?.getAttribute('data-lang') || '';
      const pre = doc.createElement('pre');
      if (langAttr) pre.setAttribute('data-lang', langAttr);
      const code = doc.createElement('code');
      const lines = block.querySelectorAll('.ace-line');
      if (lines.length > 0) {
        code.textContent = Array.from(lines).map(l => l.textContent.replace(/[\u200B\u200C\u200D\uFEFF]/g, '')).join('\n');
      } else {
        code.textContent = codeEl.textContent.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
      }
      pre.appendChild(code);
      if (block.parentNode) block.parentNode.replaceChild(pre, block);
    });

    // 10. 分割线
    container.querySelectorAll('[data-block-type="divider"]').forEach(block => {
      const hr = doc.createElement('hr');
      if (block.parentNode) block.parentNode.replaceChild(hr, block);
    });

    // 11. 引用块
    container.querySelectorAll('[data-block-type="quote"], [data-block-type="quote_container"]').forEach(block => {
      const bq = doc.createElement('blockquote');
      const lines = block.querySelectorAll('.ace-line');
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

    return container;
  }

  // 寻找真正的滚动驱动容器
  static findPrimaryScroller() {
    const customSelectors = [
      '.bear-web-x-container',
      '.docx-editor',
      '.bear-web-editor',
      '.doc-page-container',
      '.docx-document-view',
      '.docx-viewer'
    ];
    for (const sel of customSelectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 50) return el;
    }
    const allDivs = Array.from(document.querySelectorAll('div, section, main, article'));
    let best = null;
    let maxH = 0;
    for (const el of allDivs) {
      const style = window.getComputedStyle(el);
      const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') &&
                           el.scrollHeight > el.clientHeight + 100;
      if (isScrollable && el.scrollHeight > maxH) {
        maxH = el.scrollHeight;
        best = el;
      }
    }
    return best || document.scrollingElement || document.documentElement || document.body;
  }

  // 编辑器根节点
  static findEditorRoot() {
    return document.querySelector('[data-block-type="page"]') ||
           document.querySelector('.docx-page-block') ||
           document.querySelector('.bear-web-editor') ||
           document.querySelector('.docx-editor') ||
           document.querySelector('.bear-web-x-container .page-main-item.editor') ||
           document.querySelector('.bear-web-x-container .page-main') ||
           document.querySelector('.page-block-children') ||
           document.querySelector('.docx-page') ||
           document.querySelector('.docx-document-view') ||
           document.querySelector('.docx-viewer') ||
           document.querySelector('.doc-page-container') ||
           document.querySelector('.feishu-document-content') ||
           document.querySelector('.doc-content') ||
           document.querySelector('.client-render-container') ||
           document.querySelector('#doc-bg');
  }

  // 飞书 docx 虚拟列表只渲染视口附近的区块，离开视口的区块会被卸载回收并替换为占位节点。
  // 本方法通过平滑步进滚动，动态收割并缓存所有按自然顺序挂载的区块，最后拼装出完整的文档树。
  static async harvestAllBlocks(maxDurationMs = 35000) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return [];

    const scroller = FeishuAdapter.findPrimaryScroller();
    const isGlobal = (scroller === document.documentElement || scroller === document.body || scroller === document.scrollingElement);

    const getScrollTop = () => isGlobal ? (window.pageYOffset || document.documentElement.scrollTop) : scroller.scrollTop;
    const getScrollHeight = () => isGlobal ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) : scroller.scrollHeight;
    const getClientHeight = () => isGlobal ? window.innerHeight : scroller.clientHeight;
    const setScrollTop = (val) => {
      if (isGlobal) {
        window.scrollTo({ top: val, behavior: 'instant' });
      } else {
        scroller.scrollTop = val;
      }
    };

    const initialScrollTop = getScrollTop();
    const blockMap = new Map();
    const blockList = [];

    function harvest() {
      const blocks = Array.from(document.querySelectorAll('[data-block-type]'));
      for (const b of blocks) {
        const bType = b.getAttribute('data-block-type') || '';
        if (bType === 'page' || bType.startsWith('ai_') || bType === 'quick_read') continue;
        if (b.closest && b.closest('.docx-ai-panel, .docx-ai-quick-read, .ai-digest-container, .ai-summary-block')) continue;

        const blockId = b.getAttribute('data-block-id') ||
                        b.getAttribute('data-record-id') ||
                        b.id ||
                        b.getAttribute('data-zone-id');
        if (!blockId) continue;

        if (!blockMap.has(blockId)) {
          const cloned = b.cloneNode(true);
          blockMap.set(blockId, cloned);
          blockList.push({ id: blockId, el: cloned });
        } else {
          // 针对图片等懒加载元素：如果当前 DOM 中包含了更完整的信息（如 image-token 或有效 src），更新克隆
          const existingEl = blockMap.get(blockId);
          const hasNewToken = b.querySelector('[image-token]') || b.hasAttribute('image-token');
          const existingHasToken = existingEl.querySelector('[image-token]') || existingEl.hasAttribute('image-token');
          if (hasNewToken && !existingHasToken) {
            const cloned = b.cloneNode(true);
            blockMap.set(blockId, cloned);
            const idx = blockList.findIndex(item => item.id === blockId);
            if (idx !== -1) blockList[idx].el = cloned;
          }
        }
      }
    }

    // 1. 优先收割当前视口区块
    harvest();

    const placeholders = document.querySelectorAll('.bear-virtual-renderUnit-placeholder');
    const hasVirtualList = placeholders.length > 0 || (getScrollHeight() - getClientHeight() > 300);

    if (hasVirtualList) {
      const startTime = Date.now();
      const step = 450;
      let currentPos = 0;
      let sameHeightCount = 0;
      let lastTotalHeight = getScrollHeight();

      // 从顶部开始步进下滚并持续收割
      setScrollTop(0);
      await sleep(100);
      harvest();

      while (Date.now() - startTime < maxDurationMs) {
        currentPos += step;
        setScrollTop(currentPos);

        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
        if (!isGlobal && scroller.dispatchEvent) scroller.dispatchEvent(new Event('scroll'));

        await sleep(75);
        harvest();

        const totalH = getScrollHeight();
        const clientH = getClientHeight();
        const curTop = getScrollTop();

        // 触底判定
        if (curTop + clientH >= totalH - 15) {
          if (totalH === lastTotalHeight) {
            sameHeightCount++;
            if (sameHeightCount >= 3) break;
            await sleep(200);
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
    try { window.scrollTo(0, initialScrollTop); } catch(e) {}

    return blockList.map(item => item.el);
  }

  static async extractContent() {
    const editor = FeishuAdapter.findEditorRoot();

    // 尝试执行虚拟列表收割
    let harvestedElements = [];
    try {
      harvestedElements = await FeishuAdapter.harvestAllBlocks();
    } catch (e) {
      console.warn('[md-drama] 飞书虚拟列表收割遇到异常，回退常规提取:', e);
    }

    if (!editor && harvestedElements.length === 0) {
      return GenericAdapter.extractContent();
    }

    let container;
    if (harvestedElements && harvestedElements.length > 0) {
      container = document.createElement('div');
      container.className = 'docx-page-block';
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
