// content/cleaner.js - 智能文本内容与排版清洗器

class ContentCleaner {
  constructor(options = {}) {
    this.options = Object.assign({
      removeNoiseWords: true,       // 过滤口癖、引导语、广告水词
      customBlacklist: [],          // 用户自定义过滤词/正则表达式
      removeDisclaimers: true,      // 过滤常见免责声明/版权声明/尾部引流
      removeRedundantBlankLines: true, // 清理多余空行/连续换行
      cleanMarkdownLinks: true,     // 清理纯引流广告链接
      enableAIStyleCleanup: true    // 净化常见营销号套话
    }, options);

    // 默认内置的废话词/引流词库（分行、短语、前缀）
    this.defaultNoisePatterns = [
      // 整行/整句模式：引导点赞、关注、在看、转发、收藏、打赏
      /^[^\n]*(?:点赞|关注|在看|转发|收藏|投币|一键三连|赞赏|打赏)[^\n]*$/gmi,
      /^[^\n]*(?:长按|扫描|点击)(?:上方|下方|文末)?(?:二维码|名片|卡片|链接)[^\n]*$/gmi,
      /^[^\n]*点击(?:蓝字|上方|文末)?关注[^\n]*$/gmi,
      /^[^\n]*觉得有收获(?:的话)?[^\n]*$/gmi,
      /^[^\n]*本文由.*?原创[^\n]*$/gmi,
      /^[^\n]*未经(?:官方|作者|平台)?(?:授权|许可)?[^\n]*$/gmi,
      
      // 过渡废话/营销套话
      /^[^\n]*话不多说[^\n]*$/gmi,
      /^[^\n]*接下来(?:，)?让我们一起来看看吧[^\n]*$/gmi,
      /^[^\n]*以上就是今天的全部内容[^\n]*$/gmi,
      /^[^\n]*关注我不迷路[^\n]*$/gmi,
      /^[^\n]*如果大家还有什么疑问[^\n]*$/gmi,
      /^[^\n]*【来源：.*?】[^\n]*$/gmi,
      /^[^\n]*免责声明：.*?$/gmi
    ];
  }

  // 清洗 DOM 节点中的噪声元素
  cleanDOM(element) {
    if (!element) return;

    // 移除明确的广告、推广、分享、底部版权、打赏容器
    const noiseSelectors = [
      '.advertisement', '.adsbygoogle', '.ad-container', '.banner-ad',
      '.share-group', '.social-share', '.reward-section', '.like-btn-group',
      '.copyright-statement', '.qr-code', '.footer-guide', '.recommend-box',
      '.reward-container', '.post-bottom-bar', '.read-more-container'
    ];

    noiseSelectors.forEach(sel => {
      element.querySelectorAll(sel).forEach(el => el.remove());
    });

    // 移除隐藏或零尺寸元素
    element.querySelectorAll('*').forEach(el => {
      if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) {
        el.remove();
      }
    });

    return element;
  }

  // 清洗生成的 Markdown 文本
  cleanMarkdown(markdown) {
    if (!markdown) return '';

    let cleaned = markdown;

    // 1. 应用内置废话与营销套话过滤
    if (this.options.removeNoiseWords) {
      for (const pattern of this.defaultNoisePatterns) {
        cleaned = cleaned.replace(pattern, '');
      }
    }

    // 2. 应用用户自定义黑名单词 / 正则
    if (this.options.customBlacklist && Array.isArray(this.options.customBlacklist)) {
      for (const rule of this.options.customBlacklist) {
        if (!rule) continue;
        try {
          const regex = rule.startsWith('/') && rule.lastIndexOf('/') > 0
            ? new RegExp(rule.slice(1, rule.lastIndexOf('/')), rule.slice(rule.lastIndexOf('/') + 1))
            : new RegExp(this.escapeRegExp(rule), 'gi');
          cleaned = cleaned.replace(regex, '');
        } catch (e) {
          console.warn('自定义清洗规则解析错误:', rule, e);
        }
      }
    }

    // 3. 清理多余空行与格式规范化
    if (this.options.removeRedundantBlankLines) {
      // 连续 3 个及以上换行压缩为 2 个换行
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
      // 清理行首行尾多余空白（但保留 markdown 引用和列表缩进）
      cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');
      // 清理空引用块 "> \n"
      cleaned = cleaned.replace(/^>\s*$/gm, '');
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
