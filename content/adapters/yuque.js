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
                    document.querySelector('h1');
    const authorEl = document.querySelector('.user-name') || 
                     document.querySelector('.doc-author') ||
                     document.querySelector('.author');

    const title = titleEl ? titleEl.innerText : document.title;
    const author = authorEl ? authorEl.innerText : '语雀作者';

    return {
      title: (title || '语雀文档').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: author.trim(),
      date: new Date().toISOString().split('T')[0],
      source: window.location.href,
      tags: ['语雀', '知识库']
    };
  }

  static extractContent() {
    const mainEl = document.querySelector('.ne-viewer-body') || 
                   document.querySelector('.lake-content-editor') || 
                   document.querySelector('.ne-doc-major-viewer') ||
                   document.querySelector('.lake-engine');
    
    if (!mainEl) return GenericAdapter.extractContent();

    const container = mainEl.cloneNode(true);

    // 剔除语雀目录导航、浮动菜单、评论区
    const noiseSelectors = [
      '.ne-toolbar',
      '.catalogue-card',
      '.ne-viewer-comment',
      '.lake-toolbar-container',
      '.ne-menu'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

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
