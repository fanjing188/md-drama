// content/adapters/notion.js - Notion 公开分享页面专属适配器

class NotionAdapter {
  static get name() { return 'Notion'; }

  static matches(url) {
    return /notion\.site|notion\.so/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('.notion-page-block > h1') || 
                    document.querySelector('.notion-title') ||
                    document.querySelector('h1.notion-header__title');
    const title = titleEl ? titleEl.innerText : document.title;

    return {
      title: (title || 'Notion Page').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: 'Notion User',
      date: new Date().toISOString().split('T')[0],
      source: window.location.href,
      tags: ['Notion', '知识库']
    };
  }

  static extractContent() {
    const mainEl = document.querySelector('.notion-page-content') || 
                   document.querySelector('.notion-scroller') ||
                   document.querySelector('.notion-page-view');
    
    if (!mainEl) return GenericAdapter.extractContent();

    const container = mainEl.cloneNode(true);

    // 剔除 Notion 顶部操作栏、评论框、侧边栏
    const noiseSelectors = [
      '.notion-topbar',
      '.notion-help-button',
      '.notion-cursor-listener',
      '.notion-page-controls'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

    // Notion 图片通常放在 source 或 src
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('src');
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    });

    // 处理 Notion Callout (带有图标背景的块)
    container.querySelectorAll('.notion-callout-block, .notion-callout').forEach(callout => {
      const bq = document.createElement('blockquote');
      bq.innerHTML = `<strong>[!NOTE]</strong><br>${callout.innerHTML}`;
      callout.parentNode.replaceChild(bq, callout);
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.NotionAdapter = NotionAdapter;
}
