// content/scroller.js - 智能全量滚动、自动展开全文与动态内容探测器

class SmartScroller {
  constructor(options = {}) {
    this.options = Object.assign({
      step: 500,
      interval: 100,
      maxWaitSeconds: 45,
      onProgress: null
    }, options);
    this.isCancelled = false;
  }

  // 智能穿透与自动展开被折叠/截断的正文（覆盖知乎、CSDN、头条、简书、36Kr、微信、各大个人博客与 Shadow DOM）
  static autoExpandTruncatedContent() {
    if (typeof document === 'undefined') return;

    const expandSelectors = [
      '.RichContent-collapsed button.ContentItem-more',
      '.ContentItem-expandButton',
      '.Question-main .ContentItem-more',
      '.btn-readmore',
      '#btn-readmore',
      '.read-more-btn',
      '.show-more-btn',
      '.show-more',
      '.unfold-btn',
      '.open-more-btn',
      '.expand-all-btn',
      'button.expand-btn',
      '.article-expand-btn',
      '.article-show-more',
      '.show-all-content',
      '.fold-btn',
      '[data-action="expand"]',
      '.collapse-btn',
      '.js-show-more-btn',
      '.expand-button',
      '.more-btn',
      '.open-button'
    ];

    function tryClickElement(el) {
      if (!el || typeof el.click !== 'function') return;
      try {
        if (el.offsetParent !== null || el.clientHeight > 0 || el.clientWidth > 0) {
          el.click();
        }
      } catch (e) {}
    }

    // 1. 常见选择器点击
    for (const sel of expandSelectors) {
      try {
        const buttons = document.querySelectorAll(sel);
        buttons.forEach(tryClickElement);
      } catch (e) {}
    }

    // 2. 文本模式匹配 (支持中英文主流展开提示语)
    try {
      const allClickables = Array.from(document.querySelectorAll('button, a, span, div.expand, div.more, p.read-more, [role="button"]'));
      const textRegex = /^(?:展开(?:阅读)?全文|阅读全文|查看完整内容|点击展开|展开全部|阅读更多|展开全部内容|read\s*more|show\s*more|expand\s*all|expand)$/i;

      for (const el of allClickables) {
        const text = (el.textContent || '').trim();
        if (textRegex.test(text)) {
          tryClickElement(el);
        }
      }
    } catch (e) {}

    // 3. 递归穿透 Shadow DOM 内部展开按钮
    try {
      const allHostElements = Array.from(document.querySelectorAll('*'));
      for (const host of allHostElements) {
        if (host.shadowRoot) {
          for (const sel of expandSelectors) {
            host.shadowRoot.querySelectorAll(sel).forEach(tryClickElement);
          }
          const shadowClickables = Array.from(host.shadowRoot.querySelectorAll('button, a, span, [role="button"]'));
          for (const el of shadowClickables) {
            const text = (el.textContent || '').trim();
            if (/^(?:展开(?:阅读)?全文|阅读全文|查看完整内容|点击展开|展开全部|阅读更多|read\s*more|show\s*more)$/i.test(text)) {
              tryClickElement(el);
            }
          }
        }
      }
    } catch (e) {}
  }

  // 寻找真正的滚动容器（支持 window 以及包含大量子元素的 overflow 容器，如飞书、知识星球、Notion、语雀）
  findScrollContainer() {
    const customSelectors = [
      '.bear-web-editor',          // 飞书文档
      '.docx-editor',             // 飞书新版 Docx
      '.bear-web-x-container',    // 飞书 wiki 新版页面主体
      '.doc-page-container',      // 飞书页面容器
      '.topic-list',              // 生财有术 / 知识星球
      '.topic-detail',            // 知识星球长贴
      '.notion-scroller',         // Notion
      '.ne-doc-major-viewer',     // 语雀文档
      '.lake-content-editor',     // 语雀旧版
      '.Question-main',           // 知乎问答
      '.RichContent-inner'        // 知乎回答
    ];

    for (const sel of customSelectors) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 50) {
        return el;
      }
    }

    // 检查通用带有可滚动属性的根容器
    const allDivs = Array.from(document.querySelectorAll('div, section, main, article'));
    let bestContainer = null;
    let maxScrollHeight = 0;

    for (const el of allDivs) {
      if (typeof window === 'undefined' || !window.getComputedStyle) break;
      try {
        const style = window.getComputedStyle(el);
        const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') && el.scrollHeight > el.clientHeight + 100;
        if (isScrollable && el.scrollHeight > maxScrollHeight) {
          maxScrollHeight = el.scrollHeight;
          bestContainer = el;
        }
      } catch (e) {}
    }

    return bestContainer || document.documentElement || document.body;
  }

  cancel() {
    this.isCancelled = true;
  }

  async run() {
    this.isCancelled = false;

    // 滚动前优先执行一次自动展开截断内容
    SmartScroller.autoExpandTruncatedContent();

    const container = this.findScrollContainer();
    const isGlobal = (container === document.documentElement || container === document.body);

    const getScrollTop = () => isGlobal ? (window.pageYOffset || document.documentElement.scrollTop || (document.body ? document.body.scrollTop : 0)) : container.scrollTop;
    const getScrollHeight = () => isGlobal ? Math.max(document.body ? document.body.scrollHeight : 0, document.documentElement ? document.documentElement.scrollHeight : 0) : container.scrollHeight;
    const getClientHeight = () => isGlobal ? (window.innerHeight || 800) : container.clientHeight;
    const setScrollTop = (val) => {
      if (isGlobal) {
        if (typeof window.scrollTo === 'function') {
          try {
            window.scrollTo({ top: val, behavior: 'instant' });
          } catch (e) {
            window.scrollTo(0, val);
          }
        }
        if (document.documentElement) document.documentElement.scrollTop = val;
        if (document.body) document.body.scrollTop = val;
      } else {
        container.scrollTop = val;
      }
    };

    // 引入 MutationObserver 监听 DOM 实时变更，辅助判断动态加载是否已经停止
    let mutationCount = 0;
    let observer = null;
    if (typeof MutationObserver !== 'undefined' && container) {
      try {
        observer = new MutationObserver((mutations) => {
          mutationCount += mutations.length;
        });
        observer.observe(isGlobal ? (document.body || document.documentElement) : container, {
          childList: true,
          subtree: true
        });
      } catch (e) {}
    }

    let lastScrollHeight = getScrollHeight();
    let sameHeightCount = 0;
    let currentScroll = 0;
    const startTime = Date.now();

    try {
      while (!this.isCancelled) {
        const totalHeight = getScrollHeight();
        const clientH = getClientHeight();

        // 根据总高度自适应调整步长: 超长文档适当增大步长
        let dynamicStep = this.options.step;
        if (totalHeight > 15000) {
          dynamicStep = Math.max(this.options.step, 800);
        } else if (totalHeight > 8000) {
          dynamicStep = Math.max(this.options.step, 600);
        }

        currentScroll += dynamicStep;
        setScrollTop(currentScroll);

        // 步进滚动过程中持续探测是否有动态出现的折叠按钮并点击展开
        if (currentScroll % (dynamicStep * 3) === 0) {
          SmartScroller.autoExpandTruncatedContent();
        }

        // 触发可能存在的懒加载事件与视口监听
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          try {
            window.dispatchEvent(new Event('scroll'));
            window.dispatchEvent(new Event('resize'));
          } catch (e) {}
        }
        if (!isGlobal && container && typeof container.dispatchEvent === 'function') {
          try {
            container.dispatchEvent(new Event('scroll'));
          } catch (e) {}
        }

        const prevMutations = mutationCount;

        // 等待 DOM 响应与渲染
        await new Promise(r => setTimeout(r, this.options.interval));

        const newTotalHeight = getScrollHeight();
        const currentTop = getScrollTop();

        if (this.options.onProgress) {
          const percent = Math.min(99, Math.round(((currentTop + clientH) / (newTotalHeight || 1)) * 100));
          this.options.onProgress({
            percent,
            current: currentTop + clientH,
            total: newTotalHeight
          });
        }

        // 到达底部判定
        if (currentTop + clientH >= newTotalHeight - 20) {
          const hasNewMutations = (mutationCount > prevMutations);
          if (newTotalHeight === lastScrollHeight && !hasNewMutations) {
            sameHeightCount++;
            // 若连续 2 次触底且无任何 DOM 节点新增，判定加载完毕，立即退出以提升响应速度
            if (sameHeightCount >= 2) {
              break;
            }
            await new Promise(r => setTimeout(r, 200));
          } else {
            sameHeightCount = 0;
            lastScrollHeight = newTotalHeight;
          }
        } else {
          sameHeightCount = 0;
        }

        // 超时退出保护
        if ((Date.now() - startTime) / 1000 > this.options.maxWaitSeconds) {
          break;
        }
      }
    } finally {
      if (observer) {
        observer.disconnect();
      }
    }

    // 滚动回顶部，确保视口元素状态恢复
    setScrollTop(0);
    await new Promise(r => setTimeout(r, 150));

    return { completed: !this.isCancelled };
  }
}

if (typeof window !== 'undefined') {
  window.SmartScroller = SmartScroller;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SmartScroller };
}
