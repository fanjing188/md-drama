// popup/popup.js - 极致流畅交互、节点动态演进与灵感工作台 (Obsidian Studio)

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

  inputNewTag.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && inputNewTag.value.trim()) {
      e.preventDefault();
      addTagChip(inputNewTag.value.trim());
      inputNewTag.value = '';
    }
  });

  inputDocTitle.addEventListener('input', () => {
    if (currentExtractData) {
      currentExtractData.metadata.title = inputDocTitle.value.trim();
    }
  });
});

async function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(null, resolve));
}

// 目标归档路径指示
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

// 初始化 Obsidian REST API 联通状态点
function initObsidianConnectionDot() {
  const dot = document.getElementById('obsidianStatusDot');
  if (!dot) return;
  if (currentSettings && currentSettings.obsidianSyncMethod === 'rest_api') {
    dot.className = 'status-dot green';
    dot.title = 'Obsidian Local REST API 已配置静默直连';
  } else {
    dot.className = 'status-dot';
    dot.style.backgroundColor = '#9CA3AF';
    dot.title = '当前为本地导出/下载模式';
  }
}

// 节点动态状态机驱动 (Stage Node State Machine)
function setPipelineStage(stageIndex, statusText, percentVal) {
  const pipelineFill = document.getElementById('pipelineFill');
  const pipelinePercent = document.getElementById('pipelinePercent');
  const pipelineStatusText = document.getElementById('pipelineStatusText');

  if (percentVal !== undefined) {
    pipelineFill.style.width = `${percentVal}%`;
    pipelinePercent.innerText = `${percentVal}%`;
  }
  if (statusText) {
    pipelineStatusText.innerText = statusText;
  }

  // 1-indexed stage update
  for (let i = 1; i <= 5; i++) {
    const node = document.getElementById(`stageNode${i}`);
    if (!node) continue;
    const bullet = node.querySelector('.node-bullet');

    node.classList.remove('running', 'completed', 'skipped');

    if (i < stageIndex) {
      node.classList.add('completed');
      bullet.innerHTML = '✓';
    } else if (i === stageIndex) {
      node.classList.add('running');
      bullet.innerHTML = `${i}`;
    } else {
      bullet.innerHTML = `${i}`;
    }
  }
}

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

// 渲染 Obsidian Markdown 效果预览
function renderMarkdownPreview() {
  const markdownPreview = document.getElementById('markdownPreview');
  if (!markdownPreview) return;
  const rawMd = assembleFinalMarkdown();
  
  // 简易 Markdown 转 HTML 视觉预览
  let html = rawMd
    .replace(/^> \[!NOTE\] (.*$)/gim, '<div style="background:rgba(139,92,246,0.12);border-left:3px solid #8B5CF6;padding:6px 10px;margin:8px 0;border-radius:4px;"><strong style="color:#8B5CF6;">📝 NOTE</strong> $1</div>')
    .replace(/^### (.*$)/gim, '<h3 style="font-size:13px;color:#F3F4F6;margin:10px 0 4px;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="font-size:14px;color:#F3F4F6;margin:12px 0 6px;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="font-size:15px;color:#F3F4F6;margin:14px 0 8px;">$1</h1>')
    .replace(/\[\[(.*?)\]\]/g, '<span style="color:#8B5CF6;background:rgba(139,92,246,0.15);padding:1px 4px;border-radius:3px;">[[$1]]</span>')
    .replace(/\n/g, '<br>');

  markdownPreview.innerHTML = html;
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

// 执行核心剪藏工作流与流水线动态演进
async function runClipWorkflow(useAutoScroll) {
  clearError();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || tab.url.startsWith('chrome://')) {
    displayError('当前系统页面无法提取正文，请在常规网页使用');
    return;
  }

  const pipeline = document.getElementById('pipelineContainer');
  const studioPanel = document.getElementById('studioPanel');

  const enableScroll = document.getElementById('toggleAutoScroll').checked && useAutoScroll;
  const enableCleaner = document.getElementById('toggleCleaner').checked;
  const enableImages = document.getElementById('toggleDownloadImages').checked;

  pipeline.classList.remove('hidden');
  studioPanel.classList.add('hidden');

  // 阶段 1: 探测页面容器
  setPipelineStage(1, '正在探测页面滚动容器与结构...', 10);
  await new Promise(r => setTimeout(r, 200));

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
      // 若跳过滚动，标记第2阶段为完成并进入阶段3
      const node2 = document.getElementById('stageNode2');
      if (node2) node2.classList.add('skipped');
    }

    // 阶段 3: DOM 复杂结构重塑 (Transformers)
    setPipelineStage(3, '正在穿透 Shadow DOM 并重塑复杂结构...', 70);
    await new Promise(r => setTimeout(r, 180));

    // 阶段 4: 废话与广告智能去噪
    setPipelineStage(4, '正在识别并剔除废话与营销套话...', 85);
    await new Promise(r => setTimeout(r, 150));

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
      await new Promise(r => setTimeout(r, 250));
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
  let bodyMd = markdownCode.value;

  const annotation = document.getElementById('inputAnnotation').value.trim();
  if (annotation && !bodyMd.includes(`> [!NOTE] 灵感批注`)) {
    bodyMd = `> [!NOTE] 灵感批注\n> ${annotation}\n\n` + bodyMd;
  }
  return bodyMd;
}

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
