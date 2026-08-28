let isObsidianConnected = false;
let isCheckingObsidian = false;

document.addEventListener('DOMContentLoaded', async () => {
  currentSettings = await getSettings();
  await initCurrentPageInfo();
  await checkObsidianApiStatus();
  await restoreOngoingTaskState();

  // 绑定核心交互事件
  const btnPrimaryCrawl = document.getElementById('btnPrimaryCrawl');
  const btnCancelScroll = document.getElementById('btnCancelScroll');
  const btnOptions = document.getElementById('btnOptions');
  const btnHistory = document.getElementById('btnHistory');
  const btnCloseHistory = document.getElementById('btnCloseHistory');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const btnSaveToObsidian = document.getElementById('btnSaveToObsidian');
  const btnCopyMarkdown = document.getElementById('btnCopyMarkdown');
  const inputNewTag = document.getElementById('inputNewTag');
  const inputDocTitle = document.getElementById('inputDocTitle');
  const btnRefreshApiStatus = document.getElementById('btnRefreshApiStatus');
  const obsidianStatusBar = document.getElementById('obsidianStatusBar');

  if (btnRefreshApiStatus) {
    btnRefreshApiStatus.addEventListener('click', (e) => {
      e.stopPropagation();
      checkObsidianApiStatus(true);
    });
  }

  if (obsidianStatusBar) {
    obsidianStatusBar.addEventListener('click', () => {
      if (!isObsidianConnected) {
        if (!currentSettings?.restApiToken) {
          chrome.runtime.openOptionsPage();
        } else {
          checkObsidianApiStatus(true);
        }
      }
    });
  }

  // 保存成功面板按钮
  const btnSuccessCopy = document.getElementById('btnSuccessCopy');
  const btnSuccessViewEdit = document.getElementById('btnSuccessViewEdit');
  const btnSuccessNewCrawl = document.getElementById('btnSuccessNewCrawl');

  // Tab 模式切换 (Markdown 源码 vs 渲染预览)
  const btnTabEdit = document.getElementById('btnTabEdit');
  const btnTabPreview = document.getElementById('btnTabPreview');
  const markdownCode = document.getElementById('markdownCode');
  const markdownPreview = document.getElementById('markdownPreview');

  if (btnTabEdit && btnTabPreview) {
    btnTabEdit.addEventListener('click', () => {
      btnTabEdit.classList.add('active');
      btnTabPreview.classList.remove('active');
      markdownCode.classList.remove('hidden');
      markdownPreview.classList.add('hidden');
    });

    btnTabPreview.addEventListener('click', () => {
      btnTabPreview.classList.add('active');
      btnTabEdit.classList.remove('active');
      markdownCode.classList.add('hidden');
      markdownPreview.classList.remove('hidden');
      renderMarkdownPreview();
    });
  }

  const btnOnboarding = document.getElementById('btnOnboarding');
  if (btnOnboarding) {
    btnOnboarding.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openOnboarding' });
    });
  }

  btnOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());
  btnHistory.addEventListener('click', () => openHistoryDrawer());
  btnCloseHistory.addEventListener('click', () => closeHistoryDrawer());
  btnClearHistory.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'clearClipHistory' });
    renderHistoryList();
  });

  // 主抓取按钮：抓下来 (未连通 Obsidian 接口时拦截并友好提醒)
  btnPrimaryCrawl.addEventListener('click', async () => {
    if (currentSettings?.obsidianSyncMethod === 'rest_api') {
      if (!isObsidianConnected) {
        // 先进行一次快速二次嗅探（防止用户刚启动 Obsidian 尚未刷新状态）
        await checkObsidianApiStatus(false);
      }

      if (!isObsidianConnected) {
        if (!currentSettings?.restApiToken) {
          displayError('⚠️ 您启用了 Obsidian REST API 直连，但尚未配置 Token。请先点击右上角「设置」或「向导」填写 API Key！');
          showFlyoutToast('⚠️ 未配置 API Token，请先设置', false);
        } else {
          displayError('⚠️ Obsidian 本地接口未连通！请先打开 Obsidian 客户端（并确保 Local REST API 插件已启用）后再抓取。');
          showFlyoutToast('⚠️ 请先打开 Obsidian 客户端再操作', false);
        }
        return;
      }
    }

    runClipWorkflow(true);
  });

  btnCancelScroll.addEventListener('click', async () => {
    if (currentTabInfo && currentTabInfo.id) {
      chrome.tabs.sendMessage(currentTabInfo.id, { action: 'cancelAutoScroll' }).catch(() => {});
      showFlyoutToast('已停止滚动');
    }
  });

  btnCopyMarkdown.addEventListener('click', () => {
    const md = assembleFinalMarkdown();
    navigator.clipboard.writeText(md).then(() => {
      showFlyoutToast('Markdown 已复制');
    });
  });

  btnSaveToObsidian.addEventListener('click', () => saveToObsidianStudio());

  // 成功面板快捷操作
  if (btnSuccessCopy) {
    btnSuccessCopy.addEventListener('click', () => {
      const md = assembleFinalMarkdown();
      navigator.clipboard.writeText(md).then(() => {
        showFlyoutToast('✓ Markdown 已复制');
      });
    });
  }

  if (btnSuccessViewEdit) {
    btnSuccessViewEdit.addEventListener('click', () => {
      document.getElementById('successPanel').classList.add('hidden');
      if (currentExtractData) {
        showStudio(currentExtractData);
      }
    });
  }

  if (btnSuccessNewCrawl) {
    btnSuccessNewCrawl.addEventListener('click', () => {
      resetPopupToHome();
    });
  }

  if (inputNewTag) {
    inputNewTag.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && inputNewTag.value.trim()) {
        e.preventDefault();
        addTagChip(inputNewTag.value.trim());
        inputNewTag.value = '';
      }
    });
  }

  if (inputDocTitle) {
    inputDocTitle.addEventListener('input', () => {
      if (currentExtractData && currentExtractData.metadata) {
        currentExtractData.metadata.title = inputDocTitle.value.trim();
      }
    });
  }

  // 恢复后台常驻任务状态（如果切换回该网页）
  await restoreOngoingTaskState();
});

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({
      obsidianSyncMethod: 'downloads',
      vaultSavePath: '03-知识库/网页剪藏',
      attachmentFolder: 'attachments',
      domainRouting: true,
      enableCleaning: true,
      removeNoiseWords: true,
      imageHandling: 'download',
      autoSaveDirectly: true,
      autoScroll: true,
      enableSelectionBubble: true,
      selectionSaveMode: 'new_file',
      selectionAppendFilePath: '03-知识库/网页剪藏/每日摘录.md'
    }, resolve);
  });
}

// 获取并渲染当前页面基础信息卡片
async function initCurrentPageInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  currentTabInfo = tab;

  const url = tab.url;
  const title = tab.title || '无标题网页';
  let host = 'localhost';
  try {
    host = new URL(url).hostname;
  } catch (e) {}

  let siteLabel = '🌐 网页';

  if (url.includes('feishu.cn') || url.includes('larksuite.com')) {
    siteLabel = '👾 飞书文档';
  } else if (url.includes('shengcaiyoushu.com') || url.includes('zsxq.com')) {
    siteLabel = '💰 商业社群';
  } else if (url.includes('weixin.qq.com')) {
    siteLabel = '💬 微信公众号';
  } else if (url.includes('zhihu.com')) {
    siteLabel = '💡 知乎专栏/问答';
  } else if (url.includes('yuque.com')) {
    siteLabel = '📚 语雀知识库';
  } else if (url.includes('juejin.cn')) {
    siteLabel = '💎 掘金技术';
  } else if (url.includes('notion.site') || url.includes('notion.so')) {
    siteLabel = '📝 Notion';
  }

  const siteTagEl = document.getElementById('pageSiteTag');
  const pageHostEl = document.getElementById('pageHost');
  const pageTitleEl = document.getElementById('pageTitlePreview');

  if (siteTagEl) siteTagEl.innerText = siteLabel;
  if (pageHostEl) pageHostEl.innerText = host;
  if (pageTitleEl) pageTitleEl.innerText = title;
}

// 检测 Obsidian 本地 REST API 接口连通性
async function checkObsidianApiStatus(isManual = false) {
  const statusBar = document.getElementById('obsidianStatusBar');
  const dot = document.getElementById('apiStatusDot');
  const text = document.getElementById('apiStatusText');
  if (!statusBar || !dot || !text) return;

  if (currentSettings?.obsidianSyncMethod !== 'rest_api') {
    statusBar.classList.add('hidden');
    isObsidianConnected = true;
    return;
  }

  statusBar.classList.remove('hidden');
  statusBar.className = 'api-status-corner';
  dot.className = 'status-dot-pixel checking';
  text.innerText = 'Obsidian服务：检测中';
  isCheckingObsidian = true;

  try {
    const res = await chrome.runtime.sendMessage({ action: 'checkObsidianConnection' });
    isCheckingObsidian = false;
    if (res && res.connected) {
      isObsidianConnected = true;
      statusBar.className = 'api-status-corner status-connected';
      dot.className = 'status-dot-pixel connected';
      text.innerText = 'Obsidian服务：正常';
      if (isManual) showFlyoutToast('✓ Obsidian 服务连接正常');
      clearError();
    } else {
      isObsidianConnected = false;
      statusBar.className = 'api-status-corner status-disconnected';
      dot.className = 'status-dot-pixel disconnected';
      if (!currentSettings?.restApiToken) {
        text.innerText = 'Obsidian服务：未配置';
      } else {
        text.innerText = 'Obsidian服务：未连接';
      }
      if (isManual) showFlyoutToast('⚠️ Obsidian 未连接，请先打开客户端', false);
    }
  } catch (e) {
    isCheckingObsidian = false;
    isObsidianConnected = false;
    statusBar.className = 'api-status-corner status-disconnected';
    dot.className = 'status-dot-pixel disconnected';
    text.innerText = 'Obsidian服务：未连接';
  }
}

// 恢复后台常驻任务状态
async function restoreOngoingTaskState() {
  if (!currentTabInfo || !currentTabInfo.id) return;
  const res = await chrome.runtime.sendMessage({
    action: 'getBackgroundTaskState',
    tabId: currentTabInfo.id
  }).catch(() => null);

  if (res && res.state) {
    const task = res.state;
    if (task.status === 'running') {
      const pageInfoCard = document.getElementById('pageInfoCard');
      const actionDock = document.getElementById('actionDock');
      const pipeline = document.getElementById('pipelineContainer');
      pageInfoCard.classList.add('hidden');
      actionDock.classList.add('hidden');
      pipeline.classList.remove('hidden');
      setPipelineStage(task.stage || 2, task.stageText || '后台深度抓取中...', task.percent || 40, task.savingDetail);
    } else if (task.status === 'saved' && task.data) {
      currentExtractData = task.data;
      currentSaveResult = task.saveResult;
      showSuccessScreen(task.data, task.saveResult);
    } else if (task.status === 'completed' && task.data) {
      currentExtractData = task.data;
      showStudio(task.data);
    }
  }
}

// 标签芯片渲染与增删
function renderTags(tags = []) {
  const container = document.getElementById('tagPillsContainer');
  if (!container) return;
  container.innerHTML = '';
  tags.forEach((tag, idx) => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `<span>#${tag}</span><span class="tag-del" data-idx="${idx}">&times;</span>`;
    chip.querySelector('.tag-del').addEventListener('click', (e) => {
      e.stopPropagation();
      removeTagChip(idx);
    });
    container.appendChild(chip);
  });
}

function addTagChip(tag) {
  if (!currentExtractData) return;
  if (!currentExtractData.metadata.tags) currentExtractData.metadata.tags = [];
  if (!currentExtractData.metadata.tags.includes(tag)) {
    currentExtractData.metadata.tags.push(tag);
    renderTags(currentExtractData.metadata.tags);
  }
}

function removeTagChip(idx) {
  if (!currentExtractData || !currentExtractData.metadata.tags) return;
  currentExtractData.metadata.tags.splice(idx, 1);
  renderTags(currentExtractData.metadata.tags);
}

// 渲染 Markdown 效果预览
function renderMarkdownPreview() {
  const preview = document.getElementById('markdownPreview');
  const code = document.getElementById('markdownCode').value;
  if (!preview) return;

  let html = code
    .replace(/^# (.*$)/gim, '<h2 style="font-size:15px; margin: 8px 0 4px; font-weight:800;">$1</h2>')
    .replace(/^## (.*$)/gim, '<h3 style="font-size:13px; margin: 6px 0 3px; font-weight:700;">$1</h3>')
    .replace(/^### (.*$)/gim, '<h4 style="font-size:12px; margin: 4px 0 2px; font-weight:700;">$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#F6F3EC; padding:1px 3px; border-radius:3px; font-size:10px; border:1px solid #E5E0D5;">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#2563EB; font-weight:600;">$1</a>')
    .replace(/^\> (.*$)/gim, '<blockquote style="border-left:2px solid #2D2721; padding-left:6px; color:#6E665D; margin:4px 0; background:#FAF8F5;">$1</blockquote>')
    .replace(/\n\n/g, '<br/><br/>');

  preview.innerHTML = html;
}

// 6 阶段节点与进度推进 (含保存中专属动态卡片激活)
function setPipelineStage(stageNum, text, percent, savingDetail) {
  const statusText = document.getElementById('pipelineStatusText');
  const percentText = document.getElementById('pipelinePercent');
  const bar = document.getElementById('pipelineFill');
  const pulseIcon = document.getElementById('pipelinePulseIcon');
  const savingCard = document.getElementById('pipelineSavingCard');
  const savingTitle = document.getElementById('savingStatusTitle');
  const savingDetailEl = document.getElementById('savingStatusDetail');
  const btnCancel = document.getElementById('btnCancelScroll');

  if (statusText) statusText.innerText = text;
  if (percentText) percentText.innerText = `${percent}%`;
  if (bar) bar.style.width = `${percent}%`;

  // 节点高亮演进 (1..6)
  for (let i = 1; i <= 6; i++) {
    const node = document.getElementById(`stageNode${i}`);
    if (!node) continue;
    if (i < stageNum) {
      node.className = 'stage-node done';
      node.querySelector('.node-bullet').innerHTML = '✓';
    } else if (i === stageNum) {
      node.className = 'stage-node running';
      node.querySelector('.node-bullet').innerText = `${i}`;
    } else {
      node.className = 'stage-node';
      node.querySelector('.node-bullet').innerText = `${i}`;
    }
  }

  // 第 6 阶段归档保存中：激活保存专属动画特效
  if (stageNum >= 6) {
    if (pulseIcon) pulseIcon.innerText = '💾';
    if (btnCancel) btnCancel.classList.add('hidden');
    if (savingCard) {
      savingCard.classList.remove('hidden');
      if (savingTitle) savingTitle.innerText = text || '正在写入 Obsidian 知识库...';
      if (savingDetailEl) savingDetailEl.innerText = savingDetail || '正在并发下载图片与本地化存储，请稍候...';
    }
  } else {
    if (pulseIcon) pulseIcon.innerText = '👾';
    if (btnCancel) btnCancel.classList.remove('hidden');
    if (savingCard) savingCard.classList.add('hidden');
  }
}

// 错误提示
function displayError(msg) {
  const alert = document.getElementById('errorAlert');
  const txt = document.getElementById('errorMessage');
  if (alert && txt) {
    txt.innerText = msg;
    alert.classList.remove('hidden');
  }
}

function clearError() {
  const alert = document.getElementById('errorAlert');
  if (alert) alert.classList.add('hidden');
}

// 浮动 Toast 提示
function showFlyoutToast(msg, isSuccess = true) {
  const toast = document.getElementById('toastFlyout');
  const toastIcon = document.getElementById('toastIcon');
  const toastText = document.getElementById('toastText');
  if (!toast) return;

  toastIcon.innerText = isSuccess ? '✓' : 'ℹ';
  toastText.innerText = msg;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2600);
}

// 动态注入 Content Scripts 兜底
async function ensureContentScripts(tabId) {
  try {
    const isAlive = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (isAlive && isAlive.status === 'ok') return;
  } catch (e) {}

  try {
    const manifest = chrome.runtime.getManifest();
    const scripts = manifest.content_scripts[0].js;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: scripts.filter(f => f.endsWith('.js'))
    });
  } catch (e) {}
}

// 执行核心剪藏工作流 (后台常驻接管，切换标签页正常执行)
async function runClipWorkflow(useAutoScroll) {
  clearError();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    displayError('当前系统页面无法抓取，请在常规网页使用');
    return;
  }

  await ensureContentScripts(tab.id);

  const pageInfoCard = document.getElementById('pageInfoCard');
  const actionDock = document.getElementById('actionDock');
  const pipeline = document.getElementById('pipelineContainer');
  const studioPanel = document.getElementById('studioPanel');
  const successPanel = document.getElementById('successPanel');

  // 1. 隐藏操作区，展示抓取进度板块
  pageInfoCard.classList.add('hidden');
  actionDock.classList.add('hidden');
  pipeline.classList.remove('hidden');
  studioPanel.classList.add('hidden');
  successPanel.classList.add('hidden');

  setPipelineStage(1, '正在探测页面滚动容器与结构...', 10);

  // 监听来自 content script 的进度广播
  const progressListener = (msg) => {
    if (msg.action === 'workflowProgress' && msg.state) {
      const st = msg.state;
      setPipelineStage(st.stage || 2, st.stageText || '深度解析中...', st.percent || 50, st.savingDetail);
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    // 委托后台 Service Worker 接管流水线，即使用户关闭弹窗也能完整执行并归档
    const res = await chrome.runtime.sendMessage({
      action: 'startBackgroundCrawl',
      tabId: tab.id,
      url: tab.url,
      useAutoScroll: useAutoScroll
    });

    if (res && res.success && res.state) {
      const taskState = res.state;
      currentExtractData = taskState.data;
      currentSaveResult = taskState.saveResult;

      pipeline.classList.add('hidden');

      if (taskState.status === 'saved') {
        showSuccessScreen(taskState.data, taskState.saveResult);
      } else {
        showStudio(taskState.data);
      }
    } else {
      throw new Error(res?.error || '抓取异常');
    }
  } catch (err) {
    logger.error('抓取发生错误', err.message);
    displayError(`抓取遇到问题: ${err.message}`);
    pipeline.classList.add('hidden');
    pageInfoCard.classList.remove('hidden');
    actionDock.classList.remove('hidden');
  } finally {
    chrome.runtime.onMessage.removeListener(progressListener);
  }
}

// 展示保存成功页面与专属 Logo
function showSuccessScreen(data, saveResult) {
  const successPanel = document.getElementById('successPanel');
  const successDocTitle = document.getElementById('successDocTitle');
  const successDocPath = document.getElementById('successDocPath');
  const successDocStats = document.getElementById('successDocStats');

  const title = data.metadata?.title || '无标题文档';
  const filePath = saveResult?.path || `${currentSettings.vaultSavePath || '03-知识库/网页剪藏'}/${title}.md`;
  const wordCount = data.markdown ? data.markdown.length : 0;
  const imgCount = data.images?.length || 0;

  successDocTitle.innerText = title;
  successDocPath.innerText = filePath;
  successDocStats.innerText = `📝 ${wordCount} 字 · 🖼️ ${imgCount} 张图片`;

  document.getElementById('pipelineContainer').classList.add('hidden');
  document.getElementById('pageInfoCard').classList.add('hidden');
  document.getElementById('actionDock').classList.add('hidden');
  document.getElementById('studioPanel').classList.add('hidden');
  successPanel.classList.remove('hidden');
}

// 重置回首页初始操作状态
function resetPopupToHome() {
  document.getElementById('successPanel').classList.add('hidden');
  document.getElementById('studioPanel').classList.add('hidden');
  document.getElementById('pipelineContainer').classList.add('hidden');
  document.getElementById('pageInfoCard').classList.remove('hidden');
  document.getElementById('actionDock').classList.remove('hidden');
  clearError();
  checkObsidianApiStatus();
}

function showStudio(data) {
  const studioPanel = document.getElementById('studioPanel');
  const inputDocTitle = document.getElementById('inputDocTitle');
  const badgeWordCount = document.getElementById('badgeWordCount');
  const badgeImgCount = document.getElementById('badgeImgCount');
  const markdownCode = document.getElementById('markdownCode');

  studioPanel.classList.remove('hidden');
  inputDocTitle.value = data.metadata?.title || '无标题文档';
  badgeWordCount.innerText = `${data.markdown?.length || 0} 字`;
  badgeImgCount.innerText = `${data.images?.length || 0} 图`;
  markdownCode.value = data.markdown || '';
  renderTags(data.metadata?.tags || []);
}

function assembleFinalMarkdown() {
  if (!currentExtractData) return '';
  const markdownCode = document.getElementById('markdownCode');
  return (markdownCode && markdownCode.value) ? markdownCode.value : (currentExtractData.markdown || '');
}

async function saveToObsidianStudio() {
  if (!currentExtractData) return;
  const btnSave = document.getElementById('btnSaveToObsidian');
  btnSave.disabled = true;
  btnSave.innerHTML = `<span>⏳ 写入中...</span>`;

  const finalMarkdown = assembleFinalMarkdown();
  const imgCount = currentExtractData.images?.length || 0;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const res = await chrome.runtime.sendMessage({
      action: 'quickSaveMarkdown',
      data: { ...currentExtractData, markdown: finalMarkdown },
      tabId: tab?.id
    });

    if (!res || !res.success) {
      throw new Error(res?.error || '后端保存失败');
    }
    const failedCount = res.result?.failedImages?.length || 0;

    let toastText;
    if (currentSettings.obsidianSyncMethod === 'rest_api') {
      toastText = `已成功同步至 Obsidian！${imgCount ? `（含 ${imgCount} 张图片）` : ''}`;
    } else {
      toastText = `已导出 Markdown 与 ${imgCount} 张图片`;
    }
    if (failedCount > 0) {
      toastText += `，⚠ ${failedCount} 张图片下载失败`;
    }
    showFlyoutToast(toastText, failedCount === 0);

    // 保存后切换到成功面板
    showSuccessScreen(currentExtractData, res.result);
  } catch (err) {
    displayError(`保存失败: ${err.message}`);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = `<span>💾 同步至 Obsidian</span>`;
  }
}

// 历史记录抽屉 (展开弹窗并支持展示10+条记录向下滑动)
async function openHistoryDrawer() {
  document.body.classList.add('history-expanded');
  document.getElementById('historyDrawer').classList.remove('hidden');
  await renderHistoryList();
}

function closeHistoryDrawer() {
  document.body.classList.remove('history-expanded');
  document.getElementById('historyDrawer').classList.add('hidden');
}

async function renderHistoryList() {
  const container = document.getElementById('historyListContainer');
  const res = await chrome.runtime.sendMessage({ action: 'getClipHistory' });
  const list = res?.history || [];

  if (list.length === 0) {
    container.innerHTML = `
      <div class="history-empty">
        <div style="font-size: 24px; margin-bottom: 6px;">👾</div>
        <div>暂无历史记录，快去抓一篇吧！</div>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(item => {
    const isOk = item.status === 'success';
    const statusTag = isOk ? `<span class="history-badge success">✓ 成功</span>` : `<span class="history-badge error">❌ 失败</span>`;
    const modeLabel = item.mode === 'selection_append' ? '选区追加' : (item.mode === 'selection' ? '选区' : '整篇');

    return `
      <div class="history-card" data-id="${item.id}">
        <div class="history-meta-row">
          <div style="display:flex; align-items:center; gap:4px;">
            ${statusTag}
            <span style="font-size:9.5px; color:#6E665D; font-weight:700;">[${modeLabel}]</span>
          </div>
          <span class="history-time">${item.timeStr || ''}</span>
        </div>
        <div class="history-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
        <div class="history-footer">
          ${item.url ? `<a href="${item.url}" target="_blank" class="history-link" title="在浏览器中打开原网页">🌐 点击直达原网页 &rarr;</a>` : '<span></span>'}
          <button class="history-del-btn" data-id="${item.id}" title="删除此条记录">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  // 绑定单条删除事件
  container.querySelectorAll('.history-del-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      await chrome.runtime.sendMessage({ action: 'deleteClipHistoryItem', id });
      renderHistoryList();
    });
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
