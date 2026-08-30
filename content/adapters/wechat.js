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

    if (typeof AdapterUtils !== 'undefined') {
      return AdapterUtils.cleanMetadata({
        title,
        author,
        date,
        source: window.location.href,
        tags
      });
    }

    return {
      title: (title || '微信公众号文章').trim().replace(/[/\\?%*:|"<>]/g, '-'),
      author: (author || '').trim(),
      date: (date || '').trim(),
      source: window.location.href,
      tags: tags
    };
  }

  // 微信公众号复杂排版穿透：
  // 微信排版工具（如 135编辑器、新媒体管家、秀米）大量使用嵌套 SVG 与 foreignObject 构建复合视效。
  // 若直接由常规 DOM 解析，往往会导致正文坍塌。
  // 本方法穿透 SVG 并提取内部正文与图片，保留图文顺序。
  static penetrateWechatSvgLayouts(container) {
    const doc = document;

    // 1. 穿透包含 foreignObject 的排版 SVG（通常是秀米/135等第三方排版工具）
    container.querySelectorAll('svg').forEach(svg => {
      const foreignObjects = svg.querySelectorAll('foreignObject');
      if (foreignObjects.length > 0) {
        const frag = doc.createDocumentFragment();
        foreignObjects.forEach(fo => {
          while (fo.firstChild) frag.appendChild(fo.firstChild);
        });
        if (svg.parentNode) svg.parentNode.replaceChild(frag, svg);
      } else {
        // 如果只是包含单张图片的 SVG 容器
        const innerImg = svg.querySelector('image, img');
        if (innerImg) {
          const src = innerImg.getAttribute('href') ||
                        innerImg.getAttribute('xlink:href') ||
                        innerImg.getAttribute('data-src') ||
                        innerImg.getAttribute('src');
          if (src && !src.startsWith('data:image/svg')) {
            const img = doc.createElement('img');
            img.src = src;
            if (svg.parentNode) svg.parentNode.replaceChild(img, svg);
          }
        }
      }
    });

    // 2. 音频卡片提取 (mpvoice / voice_wrapper)
    container.querySelectorAll('mpvoice, .voice_wrapper, .js_audio_wrapper, .voice_container').forEach(audioEl => {
      const voiceTitle = audioEl.getAttribute('name') ||
                         audioEl.querySelector('.voice_title, .title')?.textContent?.trim() ||
                         '语音音频';
      const p = doc.createElement('p');
      p.innerHTML = `🎵 <strong>[微信语音: ${voiceTitle}]</strong>`;
      if (audioEl.parentNode) audioEl.parentNode.replaceChild(p, audioEl);
    });

    // 3. 视频卡片提取 (mpvideo / iframe[data-src*="v.qq.com"] / .video_iframe)
    container.querySelectorAll('mpvideo, .video_iframe, iframe[data-src*="qq.com"], iframe[src*="qq.com"], .js_tx_video_container').forEach(videoEl => {
      const vid = videoEl.getAttribute('data-vid') ||
                  videoEl.getAttribute('data-mpvid') ||
                  '';
      const src = videoEl.getAttribute('data-src') || videoEl.getAttribute('src') || '';
      const videoUrl = vid ? `https://v.qq.com/x/page/${vid}.html` : src;
      const p = doc.createElement('p');
      p.innerHTML = `🎬 <strong>[腾讯视频]</strong> <a href="${videoUrl}">${videoUrl || '点击观看视频'}</a>`;
      if (videoEl.parentNode) videoEl.parentNode.replaceChild(p, videoEl);
    });

    // 4. 小程序卡片提取 (mp-miniprogram)
    container.querySelectorAll('mp-miniprogram').forEach(mp => {
      const title = mp.getAttribute('data-miniprogram-title') ||
                    mp.getAttribute('data-miniprogram-nickname') ||
                    '微信小程序';
      const p = doc.createElement('p');
      p.innerHTML = `📱 <strong>[小程序: ${title}]</strong>`;
      if (mp.parentNode) mp.parentNode.replaceChild(p, mp);
    });
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
      '.wx_appmsg_banner',
      '.js_like_wraper',
      '#js_share_source',
      '.rich_media_area_primary_extra'
    ];
    noiseSelectors.forEach(sel => container.querySelectorAll(sel).forEach(el => el.remove()));

    // 穿透微信排版 SVG、音视频与组件
    WechatAdapter.penetrateWechatSvgLayouts(container);

    // 微信图片懒加载属性修复：微信使用 data-src / data-actualsrc 存储真实图片，且移除裁剪压缩参数
    container.querySelectorAll('img').forEach(img => {
      let realSrc = img.getAttribute('data-src') ||
                    img.getAttribute('data-actualsrc') ||
                    img.getAttribute('data-original') ||
                    img.getAttribute('src') ||
                    img.src;
      if (realSrc) {
        // 清理微信图片末尾的可能导致缩略图的参数，获取原始高清图
        realSrc = realSrc.replace(/\/640(\?|$)/, '/0$1');
        img.setAttribute('src', realSrc);
        img.removeAttribute('data-src');
        img.removeAttribute('data-actualsrc');
        img.removeAttribute('data-original');
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
