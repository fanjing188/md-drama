// popup/popup.js - 交互控制、优雅通知与分级日志驱动

let currentExtractData = null;
let currentSettings = null;
const logger = new DramaLogger('Popup');

document.addEventListener('DOMContentLoaded', async () => {
  currentSettings = await getSettings();

  const btnSmartCrawl = document.getElementById('btnSmartCrawl');
  const btnDirectExtract = document.getElementById('btnDirectExtract');
  const btnCancel = document.getElementById('btnCancel');
  const btnOptions = document.getElementById('btnOptions');
  const btnLogs = document.getElementById('btnLogs');
  const btnCloseLogs = document.getElementById('btnCloseLogs');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const btnSaveObsidian = document.getElementById('btnSaveObsidian');
  const btnCopyMd = document.getElementById('btnCopyMd');

  btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  btnLogs.addEventListener('click', () => openLogsModal());
  btnCloseLogs.addEventListener('click', () => closeLogsModal());
  btnClearLogs.addEventListener('click', async () => {
    await DramaLogger.clearLogs();
    renderLogs();
  });

  btnSmartCrawl.addEventListener('click', () => startCrawling(true));
  btnDirectExtract.addEventListener('click', () => startCrawling(false));

  btnCancel.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'cancelAutoScroll' });
      showToast('已请求停止滚动');
    }
  });

  btnCopyMd.addEventListener('click', () => {
    if (!currentExtractData) return;
    navigator.clipboard.writeText(currentExtractData.markdown).then(() => {
      showToast('Markdown 已复制到剪贴板');
    });
  });

  btnSaveObsidian.addEventListener('click', () => saveToObsidian());
});

function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  toastMsg.innerText = message;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

function showError(message) {
  const errorCard = document.getElementById('errorCard');
  const errorDetails = document.getElementById('errorDetails');
  errorDetails.innerText = message;
  errorCard.classList.remove('hidden');
}

function hideError() {
  document.getElementById('errorCard').classList.add('hidden');
}

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(null, resolve);
  });
}

// 确保内容脚本注入
async function ensureContentScripts(tabId) {
  const scripts = [
    'utils/logger.js',
    'lib/turndown.js',
    'lib/turndown-plugin-gfm.js',
    'lib/readability.js',
    'content/cleaner.js',
    'content/pipeline/transformers.js',
    'content/pipeline/parser-engine.js',
    'content/scroller.js',
    'content/adapters/generic.js',
    'content/adapters/feishu.js',
    'content/adapters/shengcai.js',
    'content/extractor.js',
    'content/index.js'
  ];

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: scripts
    });
  } catch (e) {
    logger.warn('内容脚本注入通知（部分页面已预加载）:', e.message);
  }
}

async function startCrawling(withAutoScroll) {
  hideError();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showError('无法获取当前网页 Tab，请刷新页面重试');
    return;
  }

  // 屏蔽浏览器系统页面
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
    showError('浏览器内置系统页面无法提取正文，请在常规网页使用');
    return;
  }

  await ensureContentScripts(tab.id);

  const statusSection = document.getElementById('statusSection');
  const progressBar = document.getElementById('progressBar');
  const statusText = document.getElementById('statusText');
  const statusPercent = document.getElementById('statusPercent');
  const resultSection = document.getElementById('resultSection');

  statusSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
  progressBar.style.width = '10%';
  statusPercent.innerText = '10%';
  statusText.innerText = withAutoScroll ? '正在自动探测并平滑滚动加载...' : '正在启动 6 阶段通用排版流水线...';

  // 监听滚动进度
  const progressListener = (msg) => {
    if (msg.action === 'scrollProgress' && msg.progress) {
      progressBar.style.width = `${msg.progress.percent}%`;
      statusPercent.innerText = `${msg.progress.percent}%`;
      statusText.innerText = `懒加载探测中 (${msg.progress.percent}%)`;
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    if (withAutoScroll) {
      logger.info('开始触发自动滚动懒加载探测', { tabId: tab.id, url: tab.url });
      await chrome.tabs.sendMessage(tab.id, {
        action: 'startAutoScroll',
        interval: 150
      });
    }

    progressBar.style.width = '85%';
    statusPercent.innerText = '85%';
    statusText.innerText = '正在语义重塑与排版过滤...';

    const res = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractMarkdown',
      settings: currentSettings
    });

    if (res && res.success) {
      currentExtractData = res.data;
      showResult(res.data);
      logger.info('页面提取并转换成功', { title: res.data.metadata.title });
    } else {
      throw new Error(res?.error || '提取失败：未知错误');
    }
  } catch (err) {
    logger.error('提取失败', err.message);
    showError(`解析遇到问题: ${err.message}`);
  } finally {
    statusSection.classList.add('hidden');
    chrome.runtime.onMessage.removeListener(progressListener);
  }
}

function showResult(data) {
  const resultSection = document.getElementById('resultSection');
  const docTitle = document.getElementById('docTitle');
  const statChars = document.getElementById('statChars');
  const statImages = document.getElementById('statImages');
  const markdownPreview = document.getElementById('markdownPreview');

  resultSection.classList.remove('hidden');
  docTitle.innerText = data.metadata.title;
  statChars.innerText = `${data.markdown.length} 字符`;
  statImages.innerText = `${data.images.length} 资源图`;
  markdownPreview.value = data.markdown;
}

async function saveToObsidian() {
  if (!currentExtractData) return;
  const btnSave = document.getElementById('btnSaveObsidian');
  btnSave.disabled = true;
  btnSave.innerText = '正在写入...';

  const filename = `${currentExtractData.metadata.title}.md`;
  const folder = currentSettings.vaultSavePath || '03-知识库/网页剪藏';
  const fullPath = `${folder}/${filename}`.replace(/\/+/g, '/');

  try {
    if (currentSettings.obsidianSyncMethod === 'rest_api') {
      logger.info('使用 Obsidian REST API 同步中...', { path: fullPath });
      // 1. 上传图片附件
      if (currentSettings.imageHandling === 'download' && currentExtractData.images.length > 0) {
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
          } catch (e) {
            logger.warn('图片附件保存跳过:', { img: img.filename, error: e.message });
          }
        }
      }

      // 2. 保存 Markdown 文件
      await chrome.runtime.sendMessage({
        action: 'saveToObsidianRestApi',
        data: {
          path: fullPath,
          content: currentExtractData.markdown,
          isBinary: false,
          settings: currentSettings
        }
      });

      showToast('已同步到 Obsidian 仓库');
      logger.info('已成功同步至 Obsidian', { fullPath });
    } else {
      // 默认使用 Chrome Downloads 导出
      await chrome.runtime.sendMessage({
        action: 'downloadFile',
        data: {
          filename: `Obsidian_Vault/${fullPath}`,
          content: currentExtractData.markdown
        }
      });
      showToast('已导出 Markdown 文件');
    }
  } catch (err) {
    logger.error('保存至 Obsidian 失败', err.message);
    showError(`Obsidian 保存失败: ${err.message}。请检查 REST API 是否开启或切换为直接导出。`);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> 保存至 Obsidian`;
  }
}

async function openLogsModal() {
  document.getElementById('logsModal').classList.remove('hidden');
  await renderLogs();
}

function closeLogsModal() {
  document.getElementById('logsModal').classList.add('hidden');
}

async function renderLogs() {
  const container = document.getElementById('logsContainer');
  const logs = await DramaLogger.getRecentLogs();
  if (logs.length === 0) {
    container.innerHTML = '<div style="color: #64748B; text-align: center; padding: 20px;">暂无日志</div>';
    return;
  }
  container.innerHTML = logs.map(l => `
    <div class="log-row ${l.level}">
      [${l.timestamp}] [${l.level}] [${l.module}] ${l.message} ${l.data ? JSON.stringify(l.data) : ''}
    </div>
  `).join('');
}
