// popup/popup.js - md抓吗 可爱像素风交互、当前网页信息与抓取历史记录

let currentExtractData = null;
let currentSettings = null;
let currentTabInfo = null;
const logger = new DramaLogger('PopupPixel');

document.addEventListener('DOMContentLoaded', async () => {
  currentSettings = await getSettings();
  await initCurrentPageInfo();
  initObsidianConnectionDot();

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

  // Tab 模式切换
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

  btnOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());
  btnHistory.addEventListener('click', () => openHistoryDrawer());
  btnCloseHistory.addEventListener('click', () => closeHistoryDrawer());
  btnClearHistory.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'clearClipHistory' });
    renderHistoryList();
  });

  // 主抓取按钮：抓下来
  btnPrimaryCrawl.addEventListener('click', () => runClipWorkflow(true));

  btnCancelScroll.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'cancelAutoScroll' });
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
  let routeFolder = '网页剪藏';

  if (url.includes('feishu.cn') || url.includes('larksuite.com')) {
    siteLabel = '👾 飞书文档';
    routeFolder = '工作文档';
  } else if (url.includes('shengcaiyoushu.com') || url.includes('zsxq.com')) {
    siteLabel = '💰 商业社群';
    routeFolder = '商业社群';
  } else if (url.includes('weixin.qq.com')) {
    siteLabel = '💬 微信公众号';
    routeFolder = '公众号精选';
  } else if (url.includes('zhihu.com')) {
    siteLabel = '💡 知乎专栏/问答';
    routeFolder = '知乎精选';
  } else if (url.includes('yuque.com')) {
    siteLabel = '📚 语雀知识库';
    routeFolder = '语雀知识库';
  } else if (url.includes('juejin.cn')) {
    siteLabel = '💎 掘金技术';
    routeFolder = '掘金技术';
  } else if (url.includes('notion.site') || url.includes('notion.so')) {
    siteLabel = '📝 Notion';
    routeFolder = 'Notion';
  }

  const siteTagEl = document.getElementById('pageSiteTag');
  const pageHostEl = document.getElementById('pageHost');
  const pageTitleEl = document.getElementById('pageTitlePreview');
  const routeLabelEl = document.getElementById('routeLabel');

  if (siteTagEl) siteTagEl.innerText = siteLabel;
  if (pageHostEl) pageHostEl.innerText = host;
  if (pageTitleEl) pageTitleEl.innerText = title;
  if (routeLabelEl) routeLabelEl.innerText = routeFolder;
}

// 探测 Obsidian Local REST API 连通性
async function initObsidianConnectionDot() {
  const dot = document.getElementById('obsidianStatusDot');
  if (!dot) return;

  if (currentSettings.obsidianSyncMethod !== 'rest_api') {
    dot.className = 'status-dot';
    dot.title = '当前为本地导出模式';
    return;
  }

  chrome.runtime.sendMessage({ action: 'checkObsidianConnection' }, (res) => {
    if (res && res.connected) {
      dot.className = 'status-dot green';
      dot.title = 'Obsidian Local REST API 在线';
    } else {
      dot.className = 'status-dot';
      dot.title = '未检测到 Obsidian 连接';
    }
  });
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

// 阶段节点与进度推进
function setPipelineStage(stageNum, text, percent) {
  const statusText = document.getElementById('pipelineStatusText');
  const percentText = document.getElementById('pipelinePercent');
  const bar = document.getElementById('pipelineFill');

  if (statusText) statusText.innerText = text;
  if (percentText) percentText.innerText = `${percent}%`;
  if (bar) bar.style.width = `${percent}%`;

  for (let i = 1; i <= 5; i++) {
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

// 执行核心剪藏工作流
async function runClipWorkflow(useAutoScroll) {
  clearError();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    displayError('当前系统页面无法抓取，请在常规网页使用');
    return;
  }

  await ensureContentScripts(tab.id);

  const pipeline = document.getElementById('pipelineContainer');
  const studioPanel = document.getElementById('studioPanel');

  pipeline.classList.remove('hidden');
  studioPanel.classList.add('hidden');

  // 阶段 1: 探测页面容器
  setPipelineStage(1, '正在探测页面滚动容器与结构...', 10);
  await new Promise(r => setTimeout(r, 180));

  // 监听滚动通知
  const scrollListener = (msg) => {
    if (msg.action === 'scrollProgress' && msg.progress) {
      const scrollPct = Math.round(15 + (msg.progress.percent * 0.45)); // 15% ~ 60%
      setPipelineStage(2, `深度滚动收割中 (${msg.progress.percent}%)`, scrollPct);
    }
  };
  chrome.runtime.onMessage.addListener(scrollListener);

  try {
    if (useAutoScroll) {
      // 阶段 2: 深度滚动收割
      setPipelineStage(2, '正在平滑滚动收割全部内容与图片...', 20);
      await chrome.tabs.sendMessage(tab.id, { action: 'startAutoScroll', interval: 140 });
    } else {
      const node2 = document.getElementById('stageNode2');
      if (node2) node2.classList.add('skipped');
    }

    // 阶段 3: DOM 复杂结构重塑 (Transformers)
    setPipelineStage(3, '正在穿透 Shadow DOM 并重塑复杂结构...', 70);
    await new Promise(r => setTimeout(r, 150));

    // 阶段 4: 废话与广告智能去噪
    setPipelineStage(4, '正在识别并剔除废话与营销套话...', 85);
    await new Promise(r => setTimeout(r, 120));

    // 阶段 5: 规范排版与 Markdown 序列化
    setPipelineStage(5, '正在排版与 Markdown 序列化...', 95);

    const res = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractMarkdown',
      settings: currentSettings
    });

    if (res && res.success) {
      setPipelineStage(6, '全量抓取完成！', 100);
      await new Promise(r => setTimeout(r, 200));
      currentExtractData = res.data;
      showStudio(res.data);
    } else {
      throw new Error(res?.error || '抓取异常');
    }
  } catch (err) {
    logger.error('抓取发生错误', err.message);
    displayError(`抓取遇到问题: ${err.message}`);
  } finally {
    pipeline.classList.add('hidden');
    chrome.runtime.onMessage.removeListener(scrollListener);
  }
}

function showStudio(data) {
  const studioPanel = document.getElementById('studioPanel');
  const inputDocTitle = document.getElementById('inputDocTitle');
  const badgeWordCount = document.getElementById('badgeWordCount');
  const badgeImgCount = document.getElementById('badgeImgCount');
  const markdownCode = document.getElementById('markdownCode');

  studioPanel.classList.remove('hidden');
  inputDocTitle.value = data.metadata.title;
  badgeWordCount.innerText = `${data.markdown.length} 字`;
  badgeImgCount.innerText = `${data.images.length} 图`;
  markdownCode.value = data.markdown;
  renderTags(data.metadata.tags);
}

function assembleFinalMarkdown() {
  if (!currentExtractData) return '';
  const markdownCode = document.getElementById('markdownCode');
  return markdownCode.value;
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
  } catch (err) {
    displayError(`保存失败: ${err.message}`);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = `<span>💾 同步至 Obsidian</span>`;
  }
}

// 历史记录抽屉
async function openHistoryDrawer() {
  document.getElementById('historyDrawer').classList.remove('hidden');
  await renderHistoryList();
}

function closeHistoryDrawer() {
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
        <div class="history-title">${escapeHtml(item.title)}</div>
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
