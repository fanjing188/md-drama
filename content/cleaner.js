// content/cleaner.js - 智能文本内容与排版清洗器

class ContentCleaner {
  constructor(options = {}) {
    this.options = Object.assign({
      removeNoiseWords: true,       // 过滤口癖、引导语、广告水词
      customBlacklist: [],          // 用户自定义过滤词/正则表达式
      removeRedundantBlankLines: true, // 清理多余空行/连续换行
    }, options);

    // 默认内置的废话词/引流词库。
    // 设计原则：只匹配「整行就是一个引导动作」的典型 CTA 句式，
    // 避免误伤正文中恰好包含"关注/收藏/点赞"等词的技术内容。
    this.defaultNoisePatterns = [
      // 点赞/在看/三连类：需要出现两个及以上互动动词，或明显的祈使句式
      /^[^\n]{0,60}(?:点赞|点个赞|顺手点个赞|在看|一键三连|求个三连|求三连)[^\n]{0,60}(?:点赞|在看|关注|转发|收藏|投币|三连)[^\n]{0,40}$/,
      /^[^\n]{0,30}(?:看完记得|记得|别忘了|顺手|麻烦)(?:点个?|点一下)?(?:赞|在看|关注|收藏|转发)[^\n]{0,40}$/,
      /^(?:求|跪求)(?:个)?(?:赞|关注|三连|转发)[^\n]{0,30}$/,
      /^(?:喜欢的话?|如果觉得(?:有用|有帮助|有收获))(?:就|请|记得)?[^\n]{0,30}(?:赞|关注|在看|转发|收藏)[^\n]{0,30}$/,
      /^点赞[^\n]{0,20}在看[^\n]{0,40}$/,
      /^觉得(?:这篇|本文|内容)?(?:有收获|有帮助|有用)[^\n]{0,30}(?:的话)?[^\n]{0,40}$/,
      /^话不多说[，,。.~！!]?[^\n]{0,16}$/,
      /^以上(?:就是)?[^\n]{0,15}(?:全部内容|内容分享|分享就到这里|到这里)[^\n]{0,20}$/,
      /^[^\n]{0,20}我们(?:一起)?来(?:看看|看一下)[^\n]{0,30}(?:吧|呗)[^\n]{0,10}$/,
      /^关注(?:我|公众号|作者)[^\n]{0,20}(?:不迷路|不迷)[^\n]{0,20}$/,
      /^[^\n]{0,20}(?:欢迎|敬请)关注[^\n]{0,30}(?:公众号|账号|频道|专栏)[^\n]{0,30}$/,

      // 扫码/引流类：整行以二维码/名片引导为主
      /^[^\n]{0,30}(?:长按|扫描|扫码|识别)(?:上方|下方|文末|上图|左侧|右侧)?(?:下方)?(?:二维码|名片|小程序码)[^\n]{0,40}$/,
      /^[^\n]{0,30}点击(?:蓝字|上方|文末|链接)[^\n]{0,30}(?:关注|阅读|查看|跳转)[^\n]{0,30}$/,

      // 版权/免责声明类：完整的声明句式
      /^本文由[^\n]{0,60}原创[，,。.][^\n]{0,80}$/,
      /^未经(?:官方|作者|平台|原?作者)?(?:授权|许可|书面许可|同意)[^\n]{0,60}(?:转载|翻版|复制|抄袭|发布|摘编|商用)[^\n]{0,60}$/,
      /^免责声明[：:][^\n]{0,300}$/,
      /^版权(?:声明|所有)[：:][^\n]{0,200}$/,
      /^(?:全部|所有)图片均?(?:来[自源]于|来自)网络[^\n]{0,80}$/,
      /^如(?:有|涉)侵(?:权|犯)[^\n]{0,60}(?:联系|告知|删除)[^\n]{0,60}$/
    ].map(p => new RegExp(p.source, p.flags + (p.flags.includes('m') ? '' : 'm')));
  }

  // 清洗 DOM 节点中的噪声元素
  cleanDOM(element) {
    if (!element) return;

    // 移除明确的广告、推广、分享、底部版权、打赏容器
    const noiseSelectors = [
      'nav', 'aside', 'footer',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '[aria-hidden="true"]',
      '.advertisement', '.adsbygoogle', '.ad-container', '.banner-ad', '.ad',
      '.share-group', '.social-share', '.reward-section', '.like-btn-group',
      '.copyright-statement', '.qr-code', '.footer-guide', '.recommend-box',
      '.reward-container', '.post-bottom-bar', '.read-more-container',
      '.related-posts', '.newsletter-signup', '.subscribe-box'
    ];

    noiseSelectors.forEach(sel => {
      try {
        element.querySelectorAll(sel).forEach(el => el.remove());
      } catch (e) { /* 无效选择器跳过 */ }
    });

    // header 仅在不含标题时移除（许多站点把文章 H1 放在 <header> 里）
    try {
      element.querySelectorAll('header').forEach(el => {
        if (!el.querySelector('h1, h2, h3, h4, h5, h6')) el.remove();
      });
    } catch (e) { /* 跳过 */ }

    // 移除隐藏或零尺寸元素
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      element.querySelectorAll('*').forEach(el => {
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') {
            el.remove();
          }
        } catch (e) { /* 脱离文档树的节点跳过 */ }
      });
    } else {
      // 非浏览器环境（测试）退化为内联样式判断
      element.querySelectorAll('*').forEach(el => {
        if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) {
          el.remove();
        }
      });
    }

    return element;
  }

  // 判断某行是否位于围栏代码块内部（避免清洗/裁剪代码内容）
  static splitByFence(text) {
    const lines = text.split('\n');
    const segments = []; // { code: bool, text: string }
    let inFence = false;
    let current = [];
    let currentIsCode = false;
    for (const line of lines) {
      const isFenceLine = /^\s*(```|~~~)/.test(line);
      if (isFenceLine) {
        segments.push({ code: currentIsCode, text: current.join('\n') });
        current = [line];
        currentIsCode = !inFence;
        // 当 fence 关闭时，fence 行本身归属代码段
        if (inFence) {
          segments.push({ code: true, text: current.join('\n') });
          current = [];
          currentIsCode = false;
        }
        inFence = !inFence;
        continue;
      }
      current.push(line);
    }
    segments.push({ code: currentIsCode, text: current.join('\n') });
    return segments;
  }

  // 清洗生成的 Markdown 文本并优化排版一致性
  cleanMarkdown(markdown) {
    if (!markdown) return '';

    let cleaned = markdown;

    // 0. 剔除零宽字符 (飞书等富文本编辑器大量使用 ZWSP 做布局占位)
    cleaned = cleaned.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');

    // 1. 应用内置废话与营销套话过滤（跳过代码块内部）
    if (this.options.removeNoiseWords) {
      const segments = ContentCleaner.splitByFence(cleaned);
      cleaned = segments.map(seg => {
        if (seg.code || !seg.text) return seg.text;
        let t = seg.text;
        for (const pattern of this.defaultNoisePatterns) {
          t = t.replace(pattern, '');
        }
        return t;
      }).join('\n');
    }

    // 2. 应用用户自定义黑名单词 / 正则（同样跳过代码块）
    if (this.options.customBlacklist && Array.isArray(this.options.customBlacklist) && this.options.customBlacklist.length) {
      const segments = ContentCleaner.splitByFence(cleaned);
      cleaned = segments.map(seg => {
        if (seg.code || !seg.text) return seg.text;
        let t = seg.text;
        for (const rule of this.options.customBlacklist) {
          if (!rule) continue;
          try {
            const regex = rule.startsWith('/') && rule.lastIndexOf('/') > 0
              ? new RegExp(rule.slice(1, rule.lastIndexOf('/')), rule.slice(rule.lastIndexOf('/') + 1))
              : new RegExp(this.escapeRegExp(rule), 'gi');
            t = t.replace(regex, '');
          } catch (e) {
            console.warn('自定义清洗规则解析错误:', rule, e);
          }
        }
        return t;
      }).join('\n');
    }

    // 3. 规范化列表、转义符与排版（跳过代码块）
    const segments = ContentCleaner.splitByFence(cleaned);
    cleaned = segments.map(seg => {
      if (seg.code || !seg.text) return seg.text;
      let t = seg.text;

      // 修复 Turndown 错误转义的行首破折号 (\- -> -)
      t = t.replace(/^[ \t]*\\-([ \t]+)/gm, '-$1');

      // 规范化无序列表符号后的空格 (如 "-   item" 压缩为标准 GFM "- item")
      t = t.replace(/^([ \t]*[-*+])[ \t]{2,}(?=\S)/gm, '$1 ');

      // 确保标题（# ## ### #### 等）前后有合理的空行分隔
      t = t.replace(/([^\n])\n(#{1,6}\s+[^\n]+)/g, '$1\n\n$2');
      t = t.replace(/(#{1,6}\s+[^\n]+)\n([^\n#\n])/g, '$1\n\n$2');

      // 确保水平分割线前后有空行
      t = t.replace(/([^\n])\n(---|\*\*\*|___)\n/g, '$1\n\n$2\n');
      t = t.replace(/\n(---|\*\*\*|___)\n([^\n])/g, '\n$1\n\n$2');

      // 确保图片独立段落前后有空行
      t = t.replace(/([^\n])\n(!\[[^\]]*\]\([^)]+\))\n/g, '$1\n\n$2\n');
      t = t.replace(/\n(!\[[^\]]*\]\([^)]+\))\n([^\n])/g, '\n$1\n\n$2');

      // 清理行尾多余空白
      return t.split('\n').map(line => line.trimEnd()).join('\n');
    }).join('\n');

    // 4. 清理多余空行与连续换行 (连续 3 个及以上换行压缩为 2 个换行)
    if (this.options.removeRedundantBlankLines) {
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    }

    return cleaned.trim();
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

if (typeof window !== 'undefined') {
  window.ContentCleaner = ContentCleaner;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ContentCleaner };
}
