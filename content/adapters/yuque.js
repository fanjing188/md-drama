// content/adapters/yuque.js - 语雀知识库与文档专属适配器

class YuqueAdapter {
  static get name() { return 'Yuque'; }

  static matches(url) {
    return /yuque\.com/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('#article-title') ||
                    document.querySelector('.article-title') ||
                    document.querySelector('.doc-title') ||
                    document.querySelector('.ne-doc-info-title') ||
                    document.querySelector('h1');
    const authorEl = document.querySelector('.user-name') ||
                     document.querySelector('.doc-author') ||
                     document.querySelector('.author') ||
                     document.querySelector('.ne-doc-info-user-name');

    const text = (el) => el ? (el.textContent || '').trim() : '';
    let title = text(titleEl) || document.title;
    // 知识库标题噪声清理: "知识库目录" 等
    title = title.replace(/^知识库目录\s*[-–|]?\s*/, '');
    const author = text(authorEl) || '语雀作者';
    const metaDate = document.querySelector('meta[itemprop="datePublished"]');
    const date = metaDate ? (metaDate.getAttribute('content') || '').slice(0, 10) : '';

    return {
      title: (title || '语雀文档').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: author,
      date: date || new Date().toISOString().split('T')[0],
      source: window.location.href,
      tags: ['语雀', '知识库']
    };
  }

  // 语雀 lake 引擎使用自定义标签渲染正文 (ne-h2 / ne-p / ne-uli / ne-alert...)
  // 将其规范化为标准 HTML 标签, 保证 Markdown 层级/列表/引用 1:1 还原
  static normalizeLakeElements(container) {
    const doc = document;
    const unwrap = (el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    };

    // 1. 标题: ne-h1..ne-h6 -> h1..h6 (先剔除锚点/折叠等噪声子节点)
    container.querySelectorAll('ne-heading-ext, ne-heading-anchor, ne-heading-fold, ne-list-fold, ne-uli-i').forEach(el => el.remove());
    container.querySelectorAll('ne-h1,ne-h2,ne-h3,ne-h4,ne-h5,ne-h6').forEach(el => {
      const level = el.tagName.toLowerCase().replace('ne-h', '');
      const h = doc.createElement(`h${level}`);
      while (el.firstChild) h.appendChild(el.firstChild);
      if (el.parentNode) el.parentNode.replaceChild(h, el);
    });

    // 2. 段落: ne-p -> p
    container.querySelectorAll('ne-p').forEach(el => {
      const p = doc.createElement('p');
      while (el.firstChild) p.appendChild(el.firstChild);
      if (el.parentNode) el.parentNode.replaceChild(p, el);
    });

    // 3. 列表: 相邻的 ne-uli 合并为一个 <ul>, 每个 ne-uli 变成 <li>
    const listItems = Array.from(container.querySelectorAll('ne-uli'));
    for (const item of listItems) {
      const li = doc.createElement('li');
      while (item.firstChild) li.appendChild(item.firstChild);
      if (item.parentNode) item.parentNode.replaceChild(li, item);
    }
    // 将连续的兄弟 <li> 分组进 <ul>
    const groupSiblings = (li) => {
      const ul = doc.createElement('ul');
      const siblings = [];
      let node = li;
      while (node && node.tagName === 'LI') {
        siblings.push(node);
        const next = node.nextSibling;
        node = next;
      }
      li.parentNode.insertBefore(ul, siblings[0]);
      siblings.forEach(s => ul.appendChild(s));
    };
    container.querySelectorAll('li').forEach(li => {
      // 仅处理直接父级不是 ul 的散落 li
      if (li.parentNode && li.parentNode.tagName !== 'UL') groupSiblings(li);
    });

    // 4. 高亮块: ne-alert -> blockquote (Callout)
    container.querySelectorAll('ne-alert').forEach(el => {
      const bq = doc.createElement('blockquote');
      bq.appendChild(doc.createElement('p')).innerHTML = '<strong>[!NOTE]</strong>';
      while (el.firstChild) bq.appendChild(el.firstChild);
      if (el.parentNode) el.parentNode.replaceChild(bq, el);
    });

    // 5. 解开纯包装标签
    container.querySelectorAll('ne-text, ne-heading-content, ne-uli-c, ne-card, ne-alert-hole').forEach(el => {
      if (el.querySelector('img')) return; // 含图片的卡片保留内部结构
      unwrap(el);
    });

    return container;
  }

  static extractContent() {
    const mainEl = document.querySelector('.ne-viewer-body') ||
                   document.querySelector('.lake-content-editor') ||
                   document.querySelector('.ne-doc-major-viewer') ||
                   document.querySelector('.lake-engine') ||
                   document.querySelector('.doc-page-content');

    if (!mainEl) return GenericAdapter.extractContent();

    const container = mainEl.cloneNode(true);

    // 剔除语雀目录导航、浮动菜单、评论区
    const noiseSelectors = [
      '.ne-toolbar',
      '.catalogue-card',
      '.ne-viewer-comment',
      '.lake-toolbar-container',
      '.ne-menu',
      '.doc-catalogue-box'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

    // 规范化语雀 lake 引擎自定义标签
    YuqueAdapter.normalizeLakeElements(container);

    // 修复语雀图片懒加载
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('data-src') ||
                     img.getAttribute('data-origin-src') ||
                     img.getAttribute('data-lake-raw-src') ||
                     img.src;
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.YuqueAdapter = YuqueAdapter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { YuqueAdapter };
}
