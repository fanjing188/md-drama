// popup/popup.js - 极致流畅交互、灵感速记与批注、Obsidian 直连控制

let currentExtractData = null;
let currentSettings = null;
const logger = new DramaLogger('PopupStudio');

document.addEventListener('DOMContentLoaded', async () => {
  currentSettings = await getSettings();
  initTargetRouteLabel();

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
  const inputAnnotation = document.getElementById('inputAnnotation');

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

  // 动态标签添加
  inputNewTag.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && inputNewTag.value.trim()) {
      e.preventDefault();
      addTagChip(inputNewTag.value.trim());
      inputNewTag.value = '';
    }
  });

  // 标题实时变更
  inputDocTitle.addEventListener('input', () => {
    if (currentExtractData) {
      currentExtractData.metadata.title = inputDocTitle.value.trim();
    }
  });
});

async function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(null, resolve));
}

// 初始化目标路径徽标
async function initTargetRouteLabel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const routeLabel = document.getElementById('routeLabel');
  if (tab && tab.url) {
    if (tab.url.includes('feishu.cn')) routeLabel.innerText = '工作文档';
    else if (tab.url.includes('shengcaiyoushu.com') || tab.url.includes('zsxq.com')) routeLabel.innerText = '商业社群';
    else if (tab.url.includes('weixin.qq.com')) routeLabel.innerText = '公众号精选';
    else routeLabel.innerText = '网页剪藏';
  }
}

// 标签芯片渲染
function renderTags(tags) {
  const container = document.getElementById('tagPillsContainer');
  container.innerHTML = '';
  (tags || []).forEach(tag => {
    const chip = document.createElement('div');
    chip.className = 'tag-chip';
    chip.innerHTML = `<span>#${tag}</span><span class="tag-del" data-tag="${tag}">&times;</span>`;
    chip.querySelector('.tag-del').addEventListener('click', () => {
      currentExtractData.metadata.tags = currentExtractData.metadata.tags.filter(t => t !== tag);
      renderTags(currentExtractData.metadata.tags);
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

function showFlyoutToast(text, isSuccess = true) {
  const flyout = document.getElementById('toastFlyout');
  const icon = document.getElementById('toastIcon');
  const body = document.getElementById('toastText');
  icon.innerText = isSuccess ? '✓' : 'ℹ';
  body.innerText = text;
  flyout.classList.remove('hidden');
  setTimeout(() => flyout.classList.add('hidden'), 2200);
}

function displayError(msg) {
  const errBox = document.getElementById('errorAlert');
  const errMsg = document.getElementById('errorMessage');
  errMsg.innerText = msg;
  errBox.classList.remove('hidden');
}

function clearError() {
  document.getElementById('errorAlert').classList.add('hidden');
}

// 执行核心剪藏工作流
async function runClipWorkflow(useAutoScroll) {
  clearError();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || tab.url.startsWith('chrome://')) {
    displayError('当前系统页面无法提取正文，请在常规网页使用');
    return;
  }

  const pipeline = document.getElementById('pipelineContainer');
  const pipelineFill = document.getElementById('pipelineFill');
  const pipelinePercent = document.getElementById('pipelinePercent');
  const pipelineStatusText = document.getElementById('pipelineStatusText');
  const studioPanel = document.getElementById('studioPanel');

  const enableScroll = document.getElementById('toggleAutoScroll').checked && useAutoScroll;
  const enableCleaner = document.getElementById('toggleCleaner').checked;
  const enableImages = document.getElementById('toggleDownloadImages').checked;

  pipeline.classList.remove('hidden');
  studioPanel.classList.add('hidden');
  pipelineFill.style.width = '10%';
  pipelinePercent.innerText = '10%';
  pipelineStatusText.innerText = enableScroll ? '正在自动平滑滚动加载...' : '正在启动 6 阶段通用排版流水线...';

  // 监听滚动通知
  const scrollListener = (msg) => {
    if (msg.action === 'scrollProgress' && msg.progress) {
      pipelineFill.style.width = `${msg.progress.percent}%`;
      pipelinePercent.innerText = `${msg.progress.percent}%`;
      pipelineStatusText.innerText = `深度滚动中 (${msg.progress.percent}%)`;
    }
  };
  chrome.runtime.onMessage.addListener(scrollListener);

  try {
    if (enableScroll) {
      document.getElementById('stage2').classList.add('active');
      await chrome.tabs.sendMessage(tab.id, { action: 'startAutoScroll', interval: 150 });
    }

    document.getElementById('stage3').classList.add('active');
    pipelineFill.style.width = '75%';
    pipelinePercent.innerText = '75%';
    pipelineStatusText.innerText = '正在语义重塑与排版去噪...';

    const mergedSettings = {
      ...currentSettings,
      enableCleaning: enableCleaner,
      imageHandling: enableImages ? 'download' : 'external'
    };

    const res = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractMarkdown',
      settings: mergedSettings
    });

    if (res && res.success) {
      document.getElementById('stage5').classList.add('active');
      pipelineFill.style.width = '100%';
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

// 组装最终 Markdown (注入灵感批注与 Frontmatter)
function assembleFinalMarkdown() {
  if (!currentExtractData) return '';
  const markdownCode = document.getElementById('markdownCode');
  let bodyMd = markdownCode.value;

  const annotation = document.getElementById('inputAnnotation').value.trim();
  if (annotation && !bodyMd.includes(`> [!NOTE] 灵感批注`)) {
    bodyMd = `> [!NOTE] 灵感批注\n> ${annotation}\n\n` + bodyMd;
  }
  return bodyMd;
}

// 保存至 Obsidian Studio
async function saveToObsidianStudio() {
  if (!currentExtractData) return;
  const btnSave = document.getElementById('btnSaveToObsidian');
  btnSave.disabled = true;
  btnSave.innerHTML = `<span>写入中...</span>`;

  const finalMarkdown = assembleFinalMarkdown();
  const folder = currentSettings.vaultSavePath || '03-知识库/网页剪藏';
  const filename = `${currentExtractData.metadata.title}.md`;
  const fullPath = `${folder}/${filename}`.replace(/\/+/g, '/');

  try {
    if (currentSettings.obsidianSyncMethod === 'rest_api') {
      // 1. 保存图片附件
      if (currentExtractData.images?.length > 0) {
        for (const img of currentExtractData.images) {
          try {
            const imgPath = `${folder}/${currentSettings.attachmentFolder || 'attachments'}/${img.filename}`.replace(/\/+/g, '/');
            const imgBase64Res = await chrome.runtime.sendMessage({
              action: 'fetchImageAsBase64',
              url: img.originalUrl
            });
            if (imgBase64Res.success) {
              await chrome.runtime.sendMessage({
                action: 'saveToObsidianRestApi',
                data: {
                  path: imgPath,
                  content: imgBase64Res.dataUrl,
                  isBinary: true,
                  settings: currentSettings
                }
              });
            }
          } catch (e) {}
        }
      }

      // 2. 保存 Markdown
      await chrome.runtime.sendMessage({
        action: 'saveToObsidianRestApi',
        data: {
          path: fullPath,
          content: finalMarkdown,
          isBinary: false,
          settings: currentSettings
        }
      });

      showFlyoutToast('已秒级同步至 Obsidian！');
    } else {
      await chrome.runtime.sendMessage({
        action: 'downloadFile',
        data: {
          filename: `Obsidian_Vault/${fullPath}`,
          content: finalMarkdown
        }
      });
      showFlyoutToast('Markdown 已导出至本地');
    }
  } catch (err) {
    displayError(`保存失败: ${err.message}`);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>同步至 Obsidian</span>`;
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
    container.innerHTML = '<div style="color: #64748B; text-align: center; padding: 20px;">暂无日志</div>';
    return;
  }
  container.innerHTML = logs.map(l => `
    <div class="log-item ${l.level}">
      [${l.timestamp}] [${l.level}] [${l.module}] ${l.message} ${l.data ? JSON.stringify(l.data) : ''}
    </div>
  `).join('');
}
