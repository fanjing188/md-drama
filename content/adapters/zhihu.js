// content/adapters/zhihu.js - 知乎专栏文章与问答专属适配器

class ZhihuAdapter {
  static get name() { return 'Zhihu'; }

  static matches(url) {
    return /zhihu\.com/.test(url);
  }

  static getMetadata() {
    const isArticle = window.location.href.includes('/p/');
    let title = '';
    let author = '';

    if (isArticle) {
      title = document.querySelector('.Post-Title')?.innerText || document.title;
      author = document.querySelector('.AuthorInfo-name')?.innerText || '知乎作者';
    } else {
      title = document.querySelector('.QuestionHeader-title')?.innerText || document.title;
      author = document.querySelector('.AuthorInfo-name')?.innerText || '知乎答主';
    }

    return {
      title: (title || '知乎内容').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: author.trim(),
      date: new Date().toISOString().split('T')[0],
      source: window.location.href,
      tags: ['知乎', isArticle ? '专栏文章' : '问答精华']
    };
  }

  static extractContent() {
    // 专栏正文或回答正文
    const mainEl = document.querySelector('.Post-RichTextContainer') || 
                   document.querySelector('.RichContent-inner') ||
                   document.querySelector('.QuestionAnswer-content');
    
    if (!mainEl) return GenericAdapter.extractContent();

    const container = mainEl.cloneNode(true);

    // 剔除知乎卡片推荐、点赞折叠栏、版权声明
    const noiseSelectors = [
      '.ContentItem-actions',
      '.Reward',
      '.AuthorInfo',
      '.LinkCard',
      '.ZhihuCard',
      '.Recommendations-Main'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

    // 修复知乎真实图片地址 (data-actualsrc / data-original)
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('data-actualsrc') || 
                     img.getAttribute('data-original') || 
                     img.getAttribute('data-rawsrc') || 
                     img.src;
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    });

    // 修复知乎数学公式 (知乎常将 LaTeX 公式放在 data-formula 属性中)
    container.querySelectorAll('.ztext-math').forEach(mathEl => {
      const formula = mathEl.getAttribute('data-formula') || mathEl.getAttribute('data-math');
      if (formula) {
        const span = document.createElement('span');
        span.textContent = ` $${formula}$ `;
        mathEl.parentNode.replaceChild(span, mathEl);
      }
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.ZhihuAdapter = ZhihuAdapter;
}
