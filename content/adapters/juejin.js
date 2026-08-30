// content/adapters/juejin.js - 稀土掘金技术博客专属适配器

class JuejinAdapter {
  static get name() { return 'Juejin'; }

  static matches(url) {
    return /juejin\.cn/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('.article-title') || document.querySelector('h1');
    const authorEl = document.querySelector('.author-name') ||
                     document.querySelector('.username') ||
                     document.querySelector('.author-info .username');
    const dateEl = document.querySelector('.author-meta .time') ||
                   document.querySelector('.time');
    const metaDate = document.querySelector('meta[property="article:published_time"]') ||
                     document.querySelector('meta[itemprop="datePublished"]');

    const title = titleEl ? (titleEl.textContent || '').trim() : document.title;
    const author = authorEl ? (authorEl.textContent || '').trim() : '掘金作者';
    const date = (dateEl ? (dateEl.textContent || '').trim() : '') ||
                 (metaDate ? (metaDate.getAttribute('content') || '').trim() : '');

    const rawDate = (dateEl ? (dateEl.textContent || '').trim() : '') ||
                    (metaDate ? (metaDate.getAttribute('content') || '').trim() : '');
    const cleanDate = rawDate.replace(/发布于\s*/, '');
    const tags = ['掘金', '技术博客'];

    if (typeof AdapterUtils !== 'undefined') {
      return AdapterUtils.cleanMetadata({
        title: title || '掘金技术文章',
        author: author || '掘金作者',
        date: cleanDate,
        source: window.location.href,
        tags
      });
    }

    return {
      title: (title || '掘金技术文章').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: (author || '掘金作者').trim(),
      date: cleanDate,
      source: window.location.href,
      tags
    };
  }

  static extractContent() {
    // 掘金正文容器演进史: .article-content(旧) -> .markdown-body(现行) -> .main-area(兜底)
    const mainEl = document.querySelector('.markdown-body') ||
                   document.querySelector('.article-content') ||
                   document.querySelector('article') ||
                   document.querySelector('.main-area');
    if (!mainEl) return GenericAdapter.extractContent();

    const container = mainEl.cloneNode(true);

    // 剔除评论区、侧边栏、版权说明、推荐阅读、复制按钮等噪声
    const noiseSelectors = [
      '.article-end',
      '.recommended-area',
      '.extension',
      '.copy-code-btn',
      '.author-info-block',
      '.code-block-extension-header',   // 代码块右上角的工具条(复制/全屏按钮)
      '.comment-box',
      '.comment-list',
      '.comment-item',
      '.sidebar',
      '.article-suspended-panel',
      '.bottom-area',
      '.tag-list',
      '.article-banner'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

    // 修复掘金图片懒加载 (data-src)
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('data-src') || img.src;
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
      // 无意义的小图标/头像过滤: 掘金静态图标统一来自 lf-web-assets
      const src = img.getAttribute('src') || '';
      if (/lf-web-assets\.juejin\.cn/.test(src) || /user-avatar/.test(src)) {
        img.remove();
      }
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.JuejinAdapter = JuejinAdapter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { JuejinAdapter };
}
