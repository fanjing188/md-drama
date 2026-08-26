// content/ui/bubble.js - 划选气泡与全屏轻量 Toast 模块

(function() {
  let bubbleEl = null;

  // 划选监听
  document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText || selectedText.length < 3) {
      removeBubble();
      return;
    }

    // 避免点击气泡本身时触发销毁
    if (bubbleEl && bubbleEl.contains(e.target)) return;

    createOrUpdateBubble(selection);
  });

  document.addEventListener('mousedown', (e) => {
    if (bubbleEl && !bubbleEl.contains(e.target)) {
      removeBubble();
    }
  });

  function createOrUpdateBubble(selection) {
    removeBubble();

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    bubbleEl = document.createElement('div');
    bubbleEl.id = 'md-drama-bubble';
    bubbleEl.innerHTML = `
      <span class="md-drama-bubble-icon">MD</span>
      <span>剪藏选区</span>
    `;

    bubbleEl.style.top = `${window.scrollY + rect.top - 38}px`;
    bubbleEl.style.left = `${window.scrollX + rect.left}px`;

    bubbleEl.addEventListener('click', async (evt) => {
      evt.stopPropagation();
      removeBubble();

      showGlobalToast('正在处理选区内容...', 'info');

      try {
        const clonedSelection = range.cloneContents();
        const container = document.createElement('div');
        container.appendChild(clonedSelection);

        const extractor = new DramaExtractor();
        const metadata = {
          title: `选区剪藏-${document.title.slice(0, 15)}`,
          source: window.location.href,
          author: '',
          date: new Date().toISOString().split('T')[0],
          tags: ['selection-clip']
        };

        const result = await extractor.parserEngine.parse(container, metadata);

        // 发送给 Background 保存
        chrome.runtime.sendMessage({
          action: 'quickSaveMarkdown',
          data: {
            metadata: result.metadata,
            markdown: result.markdown,
            images: result.assets
          }
        }, (res) => {
          if (res && res.success) {
            showGlobalToast(`✓ 选区已保存至 Obsidian`, 'success');
          } else {
            showGlobalToast(`❌ 保存失败: ${res?.error || '未知错误'}`, 'error');
          }
        });
      } catch (err) {
        showGlobalToast(`❌ 解析失败: ${err.message}`, 'error');
      }
    });

    document.body.appendChild(bubbleEl);
  }

  function removeBubble() {
    if (bubbleEl) {
      bubbleEl.remove();
      bubbleEl = null;
    }
  }

  // 全屏 Mini Toast
  window.showGlobalToast = function(message, type = 'success', duration = 2800) {
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
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  };
})();
