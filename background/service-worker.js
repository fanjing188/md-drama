// md-drama Background Service Worker

// 默认配置
const DEFAULT_SETTINGS = {
  obsidianSyncMethod: 'downloads', // 'rest_api' | 'advanced_uri' | 'downloads'
  restApiPort: 27124,
  restApiToken: '',
  restApiHttps: true,
  vaultName: 'fanjing_notes',
  vaultSavePath: '03-知识库/网页剪藏',
  attachmentFolder: 'attachments',
  imageHandling: 'download', // 'download' (Obsidian附件) | 'external' (保留外链) | 'base64'
  autoScrollSpeed: 'normal', // 'fast' | 'normal' | 'thorough'
  includeFrontmatter: true,
  enableMathJax: true,
  enableCallouts: true,
  enableCleaning: true,
  removeNoiseWords: true,
  removeRedundantBlankLines: true,
  customBlacklist: [
    "关注公众号",
    "长按二维码",
    "点击下方名片",
    "一键三连"
  ]
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (items) => {
    const newSettings = { ...DEFAULT_SETTINGS, ...items };
    chrome.storage.sync.set(newSettings);
  });
});

// 处理来自 Content Script 或 Popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'downloadFile') {
    handleDownload(request.data)
      .then(res => sendResponse({ success: true, result: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // 异步响应
  }

  if (request.action === 'saveToObsidianRestApi') {
    saveToObsidianRestApi(request.data)
      .then(res => sendResponse({ success: true, result: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === 'fetchImageAsBase64') {
    fetchImageAsBase64(request.url)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 使用 Chrome Downloads API 导出文件
async function handleDownload({ filename, content, mimeType = 'text/markdown;charset=utf-8' }) {
  const blob = new Blob([content], { type: mimeType });
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.onloadend = () => {
      chrome.downloads.download({
        url: reader.result,
        filename: filename,
        saveAs: false,
        conflictAction: 'uniquify'
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve({ downloadId });
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 通过 Obsidian Local REST API 写入文件 (支持 Markdown 与 二进制图片)
async function saveToObsidianRestApi({ path, content, isBinary, settings }) {
  const protocol = settings.restApiHttps ? 'https' : 'http';
  const url = `${protocol}://127.0.0.1:${settings.restApiPort}/vault/${encodeURIComponent(path)}`;

  let bodyData;
  let headers = {
    'Authorization': `Bearer ${settings.restApiToken}`
  };

  if (isBinary) {
    // 假设 content 是 ArrayBuffer 或 base64 转出来的 buffer
    bodyData = content;
    headers['Content-Type'] = 'application/octet-stream';
  } else {
    bodyData = content;
    headers['Content-Type'] = 'text/markdown; charset=utf-8';
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: headers,
    body: bodyData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Obsidian REST API 响应错误 [${response.status}]: ${errorText}`);
  }

  return { status: response.status };
}

// 突破防盗链获取图片 Base64
async function fetchImageAsBase64(url) {
  const response = await fetch(url, {
    mode: 'cors',
    credentials: 'omit'
  });
  if (!response.ok) throw new Error(`图片下载失败: ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
