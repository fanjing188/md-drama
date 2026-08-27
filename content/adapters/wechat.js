// content/adapters/wechat.js - 微信公众号文章专属适配器

class WechatAdapter {
  static get name() { return 'Wechat'; }

  static matches(url) {
    return /mp\.weixin\.qq\.com/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('#activity-name') || document.querySelector('.rich_media_title');
    const authorEl = document.querySelector('#js_author_name') || document.querySelector('.rich_media_meta_nickname');
    const accountEl = document.querySelector('#js_name') || document.querySelector('.profile_nickname');
    const dateEl = document.querySelector('#publish_time');

    const text = (el) => el ? (el.textContent || '').trim() : '';
    const title = text(titleEl) || document.title || '微信公众号文章';
    const author = text(authorEl) || text(accountEl) || '微信公众号';
    const date = text(dateEl) || new Date().toISOString().split('T')[0];

    const tags = ['微信公众号'];
    if (text(accountEl)) {
      tags.push(text(accountEl));
    } else {
      tags.push('精选文章');
    }

    return {
      title: (title || '微信公众号文章').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: (author || '').trim(),
      date: (date || '').trim(),
      source: window.location.href,
      tags: tags
    };
  }

  static extractContent() {
    const mainEl = document.querySelector('#js_content');
    if (!mainEl) return GenericAdapter.extractContent();

    const container = mainEl.cloneNode(true);

    // 显示隐藏的微信正文内容（微信默认 visibility: hidden 直到 JS 加载）
    container.style.visibility = 'visible';

    // 剔除微信专属噪声：二维码名片、尾部广告、打赏引导、点赞转发在看浮层
    const noiseSelectors = [
      '.qr_code_pc_outer',
      '.rich_media_tool',
      '.reward_area',
      '#js_tags',
      '.profile_container',
      '.rich_media_area_extra',
      '.like_comment_wraper',
      '.js_ad_link',
      '.weui-dialog',
      '.wx_appmsg_banner'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

    // 微信图片懒加载属性修复：微信使用 data-src 存储真实图片
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('data-src') ||
                      img.getAttribute('data-actualsrc') ||
                      img.getAttribute('data-original') ||
                      img.src;
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    });

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.WechatAdapter = WechatAdapter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WechatAdapter };
}
