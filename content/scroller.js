// content/scroller.js - 智能全量滚动与动态内容探测器

class SmartScroller {
  constructor(options = {}) {
    this.options = Object.assign({
      step: 450,
      interval: 150,
      maxWaitSeconds: 60,
      onProgress: null
    }, options);
    this.isCancelled = false;
  }

  // 寻找真正的滚动容器（支持 window 以及包含大量子元素的 overflow 容器，如飞书、知识星球、Notion、语雀）
  findScrollContainer() {
    // 专用适配容器清单
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
      const style = window.getComputedStyle(el);
      const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') && el.scrollHeight > el.clientHeight + 100;
      if (isScrollable && el.scrollHeight > maxScrollHeight) {
        maxScrollHeight = el.scrollHeight;
        bestContainer = el;
      }
    }

    return bestContainer || document.documentElement || document.body;
  }

  cancel() {
    this.isCancelled = true;
  }

  async run() {
    this.isCancelled = false;
    const container = this.findScrollContainer();
    const isGlobal = (container === document.documentElement || container === document.body);

    const getScrollTop = () => isGlobal ? (window.pageYOffset || document.documentElement.scrollTop) : container.scrollTop;
    const getScrollHeight = () => isGlobal ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) : container.scrollHeight;
    const getClientHeight = () => isGlobal ? window.innerHeight : container.clientHeight;
    const setScrollTop = (val) => {
      if (isGlobal) {
        window.scrollTo({ top: val, behavior: 'instant' });
      } else {
        container.scrollTop = val;
      }
    };

    let lastScrollHeight = getScrollHeight();
    let sameHeightCount = 0;
    let currentScroll = 0;
    const startTime = Date.now();

    while (!this.isCancelled) {
      const totalHeight = getScrollHeight();
      const clientH = getClientHeight();

      currentScroll += this.options.step;
      setScrollTop(currentScroll);

      // 触发可能存在的懒加载事件
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
      if (!isGlobal && container.dispatchEvent) {
        container.dispatchEvent(new Event('scroll'));
      }

      // 等待 DOM 响应与渲染
      await new Promise(r => setTimeout(r, this.options.interval));

      const newTotalHeight = getScrollHeight();
      if (this.options.onProgress) {
        const percent = Math.min(99, Math.round(((getScrollTop() + clientH) / newTotalHeight) * 100));
        this.options.onProgress({
          percent,
          current: getScrollTop() + clientH,
          total: newTotalHeight
        });
      }

      // 到达底部判定
      if (getScrollTop() + clientH >= newTotalHeight - 10) {
        if (newTotalHeight === lastScrollHeight) {
          sameHeightCount++;
          // 连续 3 次探测高度未增长，判定加载完毕
          if (sameHeightCount >= 3) {
            break;
          }
          // 给动态网络请求额外的缓冲时间
          await new Promise(r => setTimeout(r, 400));
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

    // 滚动回顶部，确保视口元素状态恢复
    setScrollTop(0);
    await new Promise(r => setTimeout(r, 200));

    return { completed: !this.isCancelled };
  }
}

if (typeof window !== 'undefined') {
  window.SmartScroller = SmartScroller;
}
