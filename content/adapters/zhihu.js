// content/adapters/zhihu.js - 知乎专栏文章与问答专属适配器

class ZhihuAdapter {
  static get name() { return 'Zhihu'; }

  static matches(url) {
    return /zhihu\.com/.test(url);
  }

  static getMetadata() {
    const isArticle = window.location.href.includes('/p/');
    const isPin = window.location.href.includes('/pin/');
    let title = '';
    let author = '';

    if (isArticle) {
      title = (document.querySelector('.Post-Title') || {}).textContent ||
              document.title;
      author = (document.querySelector('.AuthorInfo-name') || {}).textContent ||
               (document.querySelector('.Post-Author .AuthorInfo-name') || {}).textContent ||
               '';
    } else if (isPin) {
      const pinText = (document.querySelector('.PinItem-content, .RichText') || {}).textContent || '';
      title = pinText.slice(0, 30) || document.title;
      author = (document.querySelector('.AuthorInfo-name') || {}).textContent || '';
    } else {
      title = (document.querySelector('.QuestionHeader-title') || {}).textContent ||
              document.title;
      author = (document.querySelector('.AuthorInfo-name') || {}).textContent || '';
    }

    const metaDate = document.querySelector('meta[itemprop="datePublished"]') ||
                     document.querySelector('meta[property="og:article:published_time"]');
    const date = metaDate ? (metaDate.getAttribute('content') || '') : '';

    return {
      title: (title || '知乎内容').trim().replace(/\s*[-_|]\s*知乎\s*$/, '').replace(/[/\\?%*:|"<>]/g, '-'),
      author: author.trim() || '知乎作者',
      date: (date || '').trim().slice(0, 10),
      source: window.location.href,
      tags: ['知乎', isArticle ? '专栏文章' : (isPin ? '知乎想法' : '问答精华')]
    };
  }

  // 知乎站内链接清洗:
  // 1) zhida.zhihu.com/search 知识卡片自动链 -> 只保留文字
  // 2) link.zhihu.com/?target=... 跳转链 -> 还原真实目标地址
  static normalizeZhihuLinks(container) {
    container.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (/zhida\.zhihu\.com\/search/.test(href)) {
        const text = document.createTextNode(a.textContent || '');
        a.parentNode.replaceChild(text, a);
        return;
      }
      const redirectMatch = href.match(/link\.zhihu\.com\/\?target=([^&]+)/);
      if (redirectMatch) {
        try {
          a.setAttribute('href', decodeURIComponent(redirectMatch[1]));
        } catch (e) { /* 保留原链接 */ }
      }
    });
  }

  static extractContent() {
    // 专栏正文、回答正文或想法
    const mainEl = document.querySelector('.Post-RichTextContainer') ||
                   document.querySelector('.RichContent-inner') ||
                   document.querySelector('.QuestionAnswer-content') ||
                   document.querySelector('.Post-RichText') ||
                   document.querySelector('.PinItem-content');

    if (!mainEl) return GenericAdapter.extractContent();

    const container = mainEl.cloneNode(true);

    // 剔除知乎卡片推荐、点赞折叠栏、版权声明
    const noiseSelectors = [
      '.ContentItem-actions',
      '.Reward',
      '.AuthorInfo',
      '.LinkCard',
      '.ZhihuCard',
      '.Recommendations-Main',
      '.ConsultHint',
      '.KfeCollection-PcStick',
      '.Voters',
      '.Comments-container',
      '.CornerButtons'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

    // 知乎站内链接规范化
    ZhihuAdapter.normalizeZhihuLinks(container);

    // 修复知乎数学公式 (知乎包含多种 LaTeX 渲染变体: .ztext-math, img.ee_img, [data-formula], [data-latex], KaTeX)
    container.querySelectorAll('.ztext-math, img.ee_img, [data-formula], [data-latex]').forEach(mathEl => {
      let formula = mathEl.getAttribute('data-formula') ||
                    mathEl.getAttribute('data-math') ||
                    mathEl.getAttribute('data-latex');

      if (!formula && mathEl.tagName === 'IMG') {
        const alt = mathEl.getAttribute('alt') || '';
        if (alt && (alt.includes('\\') || alt.includes('_') || alt.includes('^'))) {
          formula = alt;
        }
      }

      if (!formula) {
        const texScript = mathEl.querySelector('script[type*="math/tex"], annotation[encoding*="tex"]');
        if (texScript) formula = texScript.textContent;
      }

      if (formula) {
        formula = formula.trim().replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
        const isDisplay = mathEl.classList.contains('ztext-math-display') ||
                          mathEl.getAttribute('data-display') === 'true' ||
                          mathEl.tagName === 'DIV';
        if (isDisplay) {
          const p = document.createElement('p');
          p.textContent = `$$${formula}$$`;
          mathEl.parentNode.replaceChild(p, mathEl);
        } else {
          const span = document.createElement('span');
          span.textContent = ` $${formula}$ `;
          mathEl.parentNode.replaceChild(span, mathEl);
        }
      }
    });

    // 修复知乎真实图片地址 (data-actualsrc / data-original) 并提取高清原图 (将 _r / _b / _720w 等替换为高清)
    container.querySelectorAll('img').forEach(img => {
      let realSrc = img.getAttribute('data-actualsrc') ||
                    img.getAttribute('data-original') ||
                    img.getAttribute('data-rawsrc') ||
                    img.src;
      if (realSrc) {
        // 过滤知乎头像与系统/情绪图标
        if (/people\/.*_isize|\.svg$/i.test(realSrc) && !/equation/.test(realSrc)) {
          img.remove();
          return;
        }
        // 提取原图：将缩略图后缀替换为 _r 或 _hd (针对 zhimg.com)
        if (/v2-[a-f0-9]+_[a-z0-9]+\.(jpg|jpeg|png|webp)/i.test(realSrc)) {
          realSrc = realSrc.replace(/_[a-z0-9]+(\.(?:jpg|jpeg|png|webp))/i, '_r$1');
        }
        img.setAttribute('src', realSrc);
      }
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.ZhihuAdapter = ZhihuAdapter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ZhihuAdapter };
}
