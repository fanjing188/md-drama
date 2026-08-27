// content/adapters/generic.js - 通用站点提取器

class GenericAdapter {
  static get name() { return 'Generic'; }

  static matches(url) {
    return true; // 默认兜底
  }

  static getMetadata() {
    const title = document.title || document.querySelector('h1')?.innerText || 'Untitled';
    const author = document.querySelector('meta[name="author"]')?.content || 
                   document.querySelector('.author, .byline, [rel="author"]')?.innerText || '';
    const date = document.querySelector('meta[property="article:published_time"]')?.content || 
                 document.querySelector('time')?.getAttribute('datetime') || 
                 new Date().toISOString().split('T')[0];

    return {
      title: title.trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: author.trim(),
      date: date.trim(),
      source: window.location.href,
      tags: ['web-clip']
    };
  }

  static extractContent() {
    // 优先尝试 Readability
    if (typeof Readability !== 'undefined') {
      try {
        const documentClone = document.cloneNode(true);
        const article = new Readability(documentClone).parse();
        if (article && article.content) {
          const div = document.createElement('div');
          div.innerHTML = article.content;
          return div;
        }
      } catch (e) {
        console.warn('Readability 提取失败，降级到 DOM 选择器:', e);
      }
    }

    // 备用：选择主要文章容器
    const selectors = ['article', 'main', '.post-content', '.article-content', '#content', '.entry-content', 'body'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        return el.cloneNode(true);
      }
    }
    return document.body.cloneNode(true);
  }
}

if (typeof window !== 'undefined') {
  window.GenericAdapter = GenericAdapter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GenericAdapter };
}
