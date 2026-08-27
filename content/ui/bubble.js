// content/ui/bubble.js - 可爱像素风划选高亮圈选框与交互小弹窗模块

(function() {
  let bubbleEl = null;
  let outlineEl = null;

  // 划选监听
  document.addEventListener('mouseup', async (e) => {
    // 避免点击气泡本身时触发重新计算
    if (bubbleEl && bubbleEl.contains(e.target)) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText || selectedText.length < 2) {
      removeElements();
      return;
    }

    // 检查设置是否启用了划选弹窗
    const settings = await getBubbleSettings();
    if (settings.enableSelectionBubble === false) {
      removeElements();
      return;
    }

    createPixelSelectionAndBubble(selection);
  });

  document.addEventListener('mousedown', (e) => {
    if (bubbleEl && !bubbleEl.contains(e.target)) {
      removeElements();
    }
  });

  window.addEventListener('resize', () => {
    if (bubbleEl || outlineEl) removeElements();
  });

  function getBubbleSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        enableSelectionBubble: true,
        selectionSaveMode: 'new_file',
        selectionAppendFilePath: '03-知识库/网页剪藏/每日摘录.md'
      }, resolve);
    });
  }

  function createPixelSelectionAndBubble(selection) {
    removeElements();

    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    // 1. 渲染像素风圈选框 (Pixel Selection Outline)
    outlineEl = document.createElement('div');
    outlineEl.id = 'md-drama-pixel-outline';
    outlineEl.style.top = `${window.scrollY + rect.top - 2}px`;
    outlineEl.style.left = `${window.scrollX + rect.left - 2}px`;
    outlineEl.style.width = `${rect.width + 4}px`;
    outlineEl.style.height = `${rect.height + 4}px`;

    outlineEl.innerHTML = `
      <div class="md-drama-corner tl"></div>
      <div class="md-drama-corner tr"></div>
      <div class="md-drama-corner bl"></div>
      <div class="md-drama-corner br"></div>
      <div class="md-drama-selection-tag">👾 已圈选</div>
    `;
    document.body.appendChild(outlineEl);

    // 2. 渲染像素风交互按钮 (Pixel 抓下来 Button)
    bubbleEl = document.createElement('div');
    bubbleEl.id = 'md-drama-bubble';
    bubbleEl.title = '把所选文字抓下来';
    bubbleEl.innerHTML = `
      <span class="md-drama-bubble-icon">⚡</span>
      <span class="md-drama-bubble-text">抓下来</span>
    `;

    // 放置在选区正上方
    const bubbleTop = Math.max(10, window.scrollY + rect.top - 42);
    const bubbleLeft = Math.min(window.scrollX + rect.left, window.innerWidth + window.scrollX - 110);
    bubbleEl.style.top = `${bubbleTop}px`;
    bubbleEl.style.left = `${bubbleLeft}px`;

    bubbleEl.addEventListener('click', async (evt) => {
      evt.stopPropagation();
      await executeSelectionExtraction(range);
      removeElements();
    });

    document.body.appendChild(bubbleEl);
  }

  async function executeSelectionExtraction(range) {
    showGlobalToast('正在把选区内容抓下来...', 'info');

    try {
      const clonedSelection = range.cloneContents();
      const container = document.createElement('div');
      container.appendChild(clonedSelection);

      const extractor = new DramaExtractor();
      const metadata = {
        title: `选区摘录-${document.title.slice(0, 20)}`,
        source: window.location.href,
        author: '',
        date: new Date().toISOString().split('T')[0],
        tags: ['selection-clip']
      };

      const result = await extractor.parserEngine.parse(container, metadata);
      const settings = await getBubbleSettings();

      chrome.runtime.sendMessage({
        action: 'quickSaveMarkdown',
        isSelection: true,
        data: {
          metadata: result.metadata,
          markdown: result.markdown,
          images: result.assets
        }
      }, (res) => {
        if (res && res.success) {
          const modeTip = settings.selectionSaveMode === 'append_file' ? '已追加到指定摘录文档' : '已保存为新文档';
          showGlobalToast(`✓ 选区内容已成功抓下来（${modeTip}）`, 'success');
        } else {
          showGlobalToast(`❌ 抓取失败: ${res?.error || '未知错误'}`, 'error');
        }
      });
    } catch (err) {
      showGlobalToast(`❌ 解析失败: ${err.message}`, 'error');
    }
  }

  function removeElements() {
    if (bubbleEl) {
      bubbleEl.remove();
      bubbleEl = null;
    }
    if (outlineEl) {
      outlineEl.remove();
      outlineEl = null;
    }
  }

  // 监听右键或快捷键触发的划选
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'triggerSelectionClip') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && selection.toString().trim()) {
        executeSelectionExtraction(selection.getRangeAt(0));
      }
    }
  });

  // 全局像素风 Toast
  window.showGlobalToast = function(message, type = 'success', duration = 3000) {
    const oldToast = document.getElementById('md-drama-global-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'md-drama-global-toast';
    toast.className = `toast-${type}`;
    const mark = type === 'success' ? '✓' : (type === 'error' ? '❌' : '⏳');
    toast.innerHTML = `<span class="toast-mark">${mark}</span> <span>${message}</span>`;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  };
})();
