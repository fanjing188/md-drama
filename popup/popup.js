// popup/popup.js

let currentExtractData = null;
let currentSettings = null;

document.addEventListener('DOMContentLoaded', async () => {
  currentSettings = await getSettings();

  const btnSmartCrawl = document.getElementById('btnSmartCrawl');
  const btnDirectExtract = document.getElementById('btnDirectExtract');
  const btnCancel = document.getElementById('btnCancel');
  const btnOptions = document.getElementById('btnOptions');
  const btnSaveObsidian = document.getElementById('btnSaveObsidian');
  const btnCopyMd = document.getElementById('btnCopyMd');

  btnOptions.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  btnSmartCrawl.addEventListener('click', () => startCrawling(true));
  btnDirectExtract.addEventListener('click', () => startCrawling(false));
  
  btnCancel.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: 'cancelAutoScroll' });
    }
  });

  btnCopyMd.addEventListener('click', () => {
    if (!currentExtractData) return;
    navigator.clipboard.writeText(currentExtractData.markdown).then(() => {
      btnCopyMd.innerText = '✅ 已复制';
      setTimeout(() => btnCopyMd.innerText = '📋 复制 Markdown', 2000);
    });
  });

  btnSaveObsidian.addEventListener('click', () => saveToObsidian());
});

async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get(null, resolve);
  });
}

// 确保内容脚本注入
async function ensureContentScripts(tabId) {
  const scripts = [
    'lib/turndown.js',
    'lib/turndown-plugin-gfm.js',
    'lib/readability.js',
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
    console.warn('Script injection notice:', e);
  }
}

async function startCrawling(withAutoScroll) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  await ensureContentScripts(tab.id);

  const statusSection = document.getElementById('statusSection');
  const progressBar = document.getElementById('progressBar');
  const statusText = document.getElementById('statusText');
  const resultSection = document.getElementById('resultSection');

  statusSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
  progressBar.style.width = '10%';
  statusText.innerText = withAutoScroll ? '正在自动探测与平滑滚动加载...' : '正在解析网页正文...';

  // 监听滚动进度
  const progressListener = (msg) => {
    if (msg.action === 'scrollProgress' && msg.progress) {
      progressBar.style.width = `${msg.progress.percent}%`;
      statusText.innerText = `懒加载探测中 (${msg.progress.percent}%)`;
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    if (withAutoScroll) {
      await chrome.tabs.sendMessage(tab.id, {
        action: 'startAutoScroll',
        interval: 150
      });
    }

    progressBar.style.width = '80%';
    statusText.innerText = '正在排版与转换 Markdown...';

    const res = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractMarkdown',
      settings: currentSettings
    });

    if (res && res.success) {
      currentExtractData = res.data;
      showResult(res.data);
    } else {
      statusText.innerText = `提取失败: ${res?.error || '未知错误'}`;
    }
  } catch (err) {
    statusText.innerText = `操作异常: ${err.message}`;
  } finally {
    chrome.runtime.onMessage.removeListener(progressListener);
  }
}

function showResult(data) {
  const statusSection = document.getElementById('statusSection');
  const resultSection = document.getElementById('resultSection');
  const docTitle = document.getElementById('docTitle');
  const imgCountBadge = document.getElementById('imgCountBadge');
  const markdownPreview = document.getElementById('markdownPreview');

  statusSection.classList.add('hidden');
  resultSection.classList.remove('hidden');

  docTitle.innerText = data.metadata.title;
  imgCountBadge.innerText = `${data.images.length} 图`;
  markdownPreview.value = data.markdown;
}

async function saveToObsidian() {
  if (!currentExtractData) return;
  const btnSave = document.getElementById('btnSaveObsidian');
  btnSave.disabled = true;
  btnSave.innerText = '⏳ 保存中...';

  const filename = `${currentExtractData.metadata.title}.md`;
  const folder = currentSettings.vaultSavePath || '03-知识库/网页剪藏';
  const fullPath = `${folder}/${filename}`.replace(/\/+/g, '/');

  try {
    if (currentSettings.obsidianSyncMethod === 'rest_api') {
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
            console.warn('图片附件保存失败:', img.filename, e);
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

      btnSave.innerText = '✅ 保存成功！';
    } else {
      // 默认使用 Chrome Downloads 导出
      await chrome.runtime.sendMessage({
        action: 'downloadFile',
        data: {
          filename: `Obsidian_Vault/${fullPath}`,
          content: currentExtractData.markdown
        }
      });
      btnSave.innerText = '✅ 已下载至本地';
    }
  } catch (err) {
    alert(`保存到 Obsidian 出现错误: ${err.message}`);
    btnSave.innerText = '❌ 保存失败';
  } finally {
    setTimeout(() => {
      btnSave.disabled = false;
      btnSave.innerText = '📥 保存至 Obsidian';
    }, 3000);
  }
}
