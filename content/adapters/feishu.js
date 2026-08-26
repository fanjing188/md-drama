// content/adapters/feishu.js - 飞书/Lark 文档深度解析 Adapter

class FeishuAdapter {
  static matches(url) {
    return /feishu\.cn|larksuite\.com/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('.doc-title') || 
                    document.querySelector('.title-text') || 
                    document.querySelector('[data-page-title]') ||
                    document.querySelector('h1');
    const title = titleEl ? titleEl.innerText : document.title;
    
    return {
      title: (title || '飞书文档').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: 'Feishu User',
      date: new Date().toISOString().split('T')[0],
      source: window.location.href,
      tags: ['feishu', 'doc-clip']
    };
  }

  static extractContent() {
    // 飞书主文档区容器
    const editor = document.querySelector('.bear-web-editor') || 
                   document.querySelector('.docx-editor') || 
                   document.querySelector('.page-block-children') ||
                   document.querySelector('.doc-page-container');
    
    if (!editor) {
      return GenericAdapter.extractContent();
    }

    const container = editor.cloneNode(true);

    // 清理飞书多余的浮动工具栏、光标指示器、评论气泡
    const removeSelectors = [
      '.render-unit-wrapper-comment',
      '.doc-comment-highlight',
      '.inline-comment-icon',
      '.editor-selection-layer',
      '.cursor-wrapper',
      '.drag-handle'
    ];
    removeSelectors.forEach(sel => {
      container.querySelectorAll(sel).forEach(el => el.remove());
    });

    // 针对飞书图片进行属性提取 (飞书通常存放在 data-src 或 img.src)
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('data-src') || img.getAttribute('data-original') || img.src;
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    });

    // 针对飞书高亮块 (Callout) 做标记适配
    container.querySelectorAll('.callout-block, .highlight-block').forEach(block => {
      const calloutText = block.innerText;
      const calloutDiv = document.createElement('blockquote');
      calloutDiv.innerHTML = `<strong>[!NOTE]</strong><br>${block.innerHTML}`;
      block.parentNode.replaceChild(calloutDiv, block);
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.FeishuAdapter = FeishuAdapter;
}
