// content/adapters/juejin.js - 稀土掘金技术博客专属适配器

class JuejinAdapter {
  static get name() { return 'Juejin'; }

  static matches(url) {
    return /juejin\.cn/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('.article-title') || document.querySelector('h1');
    const authorEl = document.querySelector('.author-name') || document.querySelector('.username');
    const dateEl = document.querySelector('.time');

    const title = titleEl ? titleEl.innerText : document.title;
    const author = authorEl ? authorEl.innerText : '掘金作者';
    const date = dateEl ? dateEl.innerText : new Date().toISOString().split('T')[0];

    return {
      title: (title || '掘金技术文章').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: author.trim(),
      date: date.trim(),
      source: window.location.href,
      tags: ['掘金', '技术博客']
    };
  }

  static extractContent() {
    const mainEl = document.querySelector('.article-content') || document.querySelector('.main-area');
    if (!mainEl) return GenericAdapter.extractContent();

    const container = mainEl.cloneNode(true);

    // 剔除掘金侧边栏悬浮按钮、版权说明、推荐阅读
    const noiseSelectors = [
      '.article-end',
      '.recommended-area',
      '.extension',
      '.copy-code-btn',
      '.author-info-block'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

    // 修复掘金图片懒加载 (data-src)
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('data-src') || img.src;
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.JuejinAdapter = JuejinAdapter;
}
