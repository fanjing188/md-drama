// popup/popup.js - md抓吗 极简流畅交互、节点动态演进与工作台

let currentExtractData = null;
let currentSettings = null;
const logger = new DramaLogger('PopupStudio');

document.addEventListener('DOMContentLoaded', async () => {
  currentSettings = await getSettings();
  initTargetRouteLabel();
  initObsidianConnectionDot();

  // 绑定交互事件
  const btnPrimaryCrawl = document.getElementById('btnPrimaryCrawl');
  const btnQuickExtract = document.getElementById('btnQuickExtract');
  const btnCancelScroll = document.getElementById('btnCancelScroll');
  const btnOptions = document.getElementById('btnOptions');
  const btnLogs = document.getElementById('btnLogs');
  const btnCloseLogs = document.getElementById('btnCloseLogs');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const btnSaveToObsidian = document.getElementById('btnSaveToObsidian');
  const btnCopyMarkdown = document.getElementById('btnCopyMarkdown');
  const inputNewTag = document.getElementById('inputNewTag');
  const inputDocTitle = document.getElementById('inputDocTitle');

  // Tab 模式切换 (Markdown 源码 vs Obsidian 效果预览)
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
  btnLogs.addEventListener('click', () => openLogsDrawer());
  btnCloseLogs.addEventListener('click', () => closeLogsDrawer());
  btnClearLogs.addEventListener('click', async () => {
    await DramaLogger.clearLogs();
    renderLogs();
  });

  btnPrimaryCrawl.addEventListener('click', () => runClipWorkflow(true));
  btnQuickExtract.addEventListener('click', () => runClipWorkflow(false));

  btnCancelScroll.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'cancelAutoScroll' });
      showFlyoutToast('已请求停止滚动');
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
      autoScroll: true
    }, (items) => resolve(items));
  });
}

// 初始化目标路径显示胶囊
async function initTargetRouteLabel() {
  const badge = document.getElementById('routeLabel');
  if (!badge) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  const url = tab.url;
  let label = '网页剪藏';
  if (url.includes('feishu.cn') || url.includes('larksuite.com')) label = '工作文档';
  else if (url.includes('shengcaiyoushu.com') || url.includes('zsxq.com')) label = '商业社群';
  else if (url.includes('weixin.qq.com')) label = '公众号精选';
  else if (url.includes('zhihu.com')) label = '知乎精选';
  else if (url.includes('yuque.com')) label = '语雀知识库';
  else if (url.includes('juejin.cn')) label = '掘金技术';

  badge.innerText = label;
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

  // 探针检测
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

  // 基础轻量 Markdown 解析渲染
  let html = code
    .replace(/^# (.*$)/gim, '<h2 style="font-size:15px; margin: 8px 0 4px;">$1</h2>')
    .replace(/^## (.*$)/gim, '<h3 style="font-size:13px; margin: 6px 0 3px;">$1</h3>')
    .replace(/^### (.*$)/gim, '<h4 style="font-size:12px; margin: 4px 0 2px;">$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:#F3F4F6; padding:1px 3px; border-radius:3px; font-size:10px;">$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#2563EB;">$1</a>')
    .replace(/^\> (.*$)/gim, '<blockquote style="border-left:2px solid #D1D5DB; padding-left:6px; color:#4B5563; margin:4px 0;">$1</blockquote>')
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
  }, 2400);
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

// 执行核心剪藏工作流与流水线动态演进
async function runClipWorkflow(useAutoScroll) {
  clearError();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    displayError('当前系统页面无法提取正文，请在常规网页使用');
    return;
  }

  await ensureContentScripts(tab.id);

  const pipeline = document.getElementById('pipelineContainer');
  const studioPanel = document.getElementById('studioPanel');

  const enableScroll = document.getElementById('toggleAutoScroll').checked && useAutoScroll;
  const enableCleaner = document.getElementById('toggleCleaner').checked;
  const enableImages = document.getElementById('toggleDownloadImages').checked;

  pipeline.classList.remove('hidden');
  studioPanel.classList.add('hidden');

  // 阶段 1: 探测页面容器
  setPipelineStage(1, '正在探测页面滚动容器与结构...', 10);
  await new Promise(r => setTimeout(r, 180));

  // 监听滚动通知
  const scrollListener = (msg) => {
    if (msg.action === 'scrollProgress' && msg.progress) {
      const scrollPct = Math.round(15 + (msg.progress.percent * 0.45)); // 15% ~ 60%
      setPipelineStage(2, `深度滚动中 (${msg.progress.percent}%)`, scrollPct);
    }
  };
  chrome.runtime.onMessage.addListener(scrollListener);

  try {
    if (enableScroll) {
      // 阶段 2: 深度滚动
      setPipelineStage(2, '正在自动平滑滚动加载...', 20);
      await chrome.tabs.sendMessage(tab.id, { action: 'startAutoScroll', interval: 150 });
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

    const mergedSettings = {
      ...currentSettings,
      enableCleaning: enableCleaner,
      imageHandling: enableImages ? 'download' : 'external'
    };

    // 阶段 5: 规范排版与 Markdown 序列化
    setPipelineStage(5, '正在排版与 Markdown 序列化...', 95);

    const res = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractMarkdown',
      settings: mergedSettings
    });

    if (res && res.success) {
      setPipelineStage(6, '全量解析完成！', 100);
      await new Promise(r => setTimeout(r, 200));
      currentExtractData = res.data;
      showStudio(res.data);
    } else {
      throw new Error(res?.error || '解析异常');
    }
  } catch (err) {
    logger.error('剪藏发生错误', err.message);
    displayError(`提取遇到问题: ${err.message}`);
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
  btnSave.innerHTML = `<span>写入中...</span>`;

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
      toastText = `已秒级同步至 Obsidian！${imgCount ? `（含 ${imgCount} 张图片）` : ''}`;
    } else {
      toastText = `Markdown 与 ${imgCount} 张图片已导出至下载目录`;
    }
    if (failedCount > 0) {
      toastText += `，⚠ ${failedCount} 张图片下载失败（多为未登录或防盗链）`;
    }
    showFlyoutToast(toastText, failedCount === 0);
  } catch (err) {
    displayError(`保存失败: ${err.message}`);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>同步至 Obsidian</span>`;
  }
}

async function openLogsDrawer() {
  document.getElementById('logsDrawer').classList.remove('hidden');
  await renderLogs();
}

function closeLogsDrawer() {
  document.getElementById('logsDrawer').classList.add('hidden');
}

async function renderLogs() {
  const container = document.getElementById('logsStream');
  const logs = await DramaLogger.getRecentLogs();
  if (logs.length === 0) {
    container.innerHTML = '<div style="color: #9CA3AF; text-align: center; padding: 20px;">暂无日志</div>';
    return;
  }
  container.innerHTML = logs.map(l => `
    <div class="log-item ${l.level}">
      [${l.timestamp}] [${l.level}] [${l.module}] ${l.message} ${l.data ? JSON.stringify(l.data) : ''}
    </div>
  `).join('');
}
