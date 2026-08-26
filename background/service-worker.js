// md-drama Background Service Worker - 快捷键、右键菜单与智能域名分流

const DEFAULT_SETTINGS = {
  obsidianSyncMethod: 'downloads', // 'rest_api' | 'advanced_uri' | 'downloads'
  restApiPort: 27124,
  restApiToken: '',
  restApiHttps: true,
  vaultName: 'fanjing_notes',
  vaultSavePath: '03-知识库/网页剪藏',
  attachmentFolder: 'attachments',
  imageHandling: 'download',
  autoScrollSpeed: 'normal',
  includeFrontmatter: true,
  enableMathJax: true,
  enableCallouts: true,
  enableCleaning: true,
  removeNoiseWords: true,
  removeRedundantBlankLines: true,
  panguSpacing: true,
  customBlacklist: [
    "关注公众号",
    "长按二维码",
    "点击下方名片",
    "一键三连"
  ],
  // 智能域名分流配置 (Domain Routing)
  domainRouting: [
    { domain: "feishu.cn", path: "03-知识库/工作文档" },
    { domain: "larksuite.com", path: "03-知识库/工作文档" },
    { domain: "zsxq.com", path: "03-知识库/商业社群" },
    { domain: "shengcaiyoushu.com", path: "03-知识库/商业社群" },
    { domain: "weixin.qq.com", path: "03-知识库/公众号精选" },
    { domain: "zhihu.com", path: "03-知识库/知乎精选" }
  ]
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (items) => {
    const newSettings = { ...DEFAULT_SETTINGS, ...items };
    chrome.storage.sync.set(newSettings);
  });

  // 创建右键快捷菜单
  chrome.contextMenus.create({
    id: "md-drama-clip-page",
    title: "md抓马：剪藏整页至 Obsidian",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "md-drama-clip-selection",
    title: "md抓马：剪藏所选文字至 Obsidian",
    contexts: ["selection"]
  });
});

// 计算智能分流目录
function getTargetFolder(url, settings) {
  if (settings.domainRouting && Array.isArray(settings.domainRouting)) {
    for (const route of settings.domainRouting) {
      if (route.domain && url.includes(route.domain)) {
        return route.path;
      }
    }
  }
  return settings.vaultSavePath || '03-知识库/网页剪藏';
}

// 监听快捷键命令
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-clip-silent') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await executeSilentClip(tab);
    }
  }
});

// 监听右键菜单点击
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "md-drama-clip-page" && tab && tab.id) {
    await executeSilentClip(tab);
  }
});

// 静默全量抓取与归档执行
async function executeSilentClip(tab) {
  try {
    await ensureContentScripts(tab.id);
    const settings = await getSettings();

    // 触发页面 Toast
    chrome.tabs.sendMessage(tab.id, {
      action: 'showToast',
      message: '正在静默解析网页内容...',
      type: 'info'
    }).catch(() => {});

    // 提取正文
    const res = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractMarkdown',
      settings: settings
    });

    if (res && res.success) {
      await saveToObsidianBackend(res.data, tab.url, settings);
      chrome.tabs.sendMessage(tab.id, {
        action: 'showToast',
        message: `✓ 已成功归档至 Obsidian`,
        type: 'success'
      }).catch(() => {});
    } else {
      throw new Error(res?.error || '提取失败');
    }
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'showToast',
      message: `❌ 剪藏失败: ${err.message}`,
      type: 'error'
    }).catch(() => {});
  }
}

async function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(null, resolve));
}

// 消息路由
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'quickSaveMarkdown') {
    getSettings().then(settings => {
      saveToObsidianBackend(request.data, sender.tab?.url || '', settings)
        .then(res => sendResponse({ success: true, result: res }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (request.action === 'downloadFile') {
    handleDownload(request.data)
      .then(res => sendResponse({ success: true, result: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
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

// 后台统一下载/REST API写入
async function saveToObsidianBackend(extractData, url, settings) {
  const targetFolder = getTargetFolder(url, settings);
  const filename = `${extractData.metadata.title}.md`;
  const fullPath = `${targetFolder}/${filename}`.replace(/\/+/g, '/');

  if (settings.obsidianSyncMethod === 'rest_api') {
    // 保存图片
    if (settings.imageHandling === 'download' && extractData.images?.length > 0) {
      for (const img of extractData.images) {
        try {
          const imgPath = `${targetFolder}/${settings.attachmentFolder || 'attachments'}/${img.filename}`.replace(/\/+/g, '/');
          const imgBase64 = await fetchImageAsBase64(img.originalUrl);
          await saveToObsidianRestApi({
            path: imgPath,
            content: imgBase64,
            isBinary: true,
            settings: settings
          });
        } catch (e) {
          console.warn('图片附件保存跳过:', img.filename);
        }
      }
    }

    // 保存 Markdown
    return await saveToObsidianRestApi({
      path: fullPath,
      content: extractData.markdown,
      isBinary: false,
      settings: settings
    });
  } else {
    // 导出文件
    return await handleDownload({
      filename: `Obsidian_Vault/${fullPath}`,
      content: extractData.markdown
    });
  }
}

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

async function saveToObsidianRestApi({ path, content, isBinary, settings }) {
  const protocol = settings.restApiHttps ? 'https' : 'http';
  const url = `${protocol}://127.0.0.1:${settings.restApiPort}/vault/${encodeURIComponent(path)}`;

  let bodyData = content;
  let headers = {
    'Authorization': `Bearer ${settings.restApiToken}`,
    'Content-Type': isBinary ? 'application/octet-stream' : 'text/markdown; charset=utf-8'
  };

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

async function fetchImageAsBase64(url) {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error(`图片下载失败: ${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
    'content/ui/bubble.js',
    'content/index.js'
  ];

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['content/ui/bubble.css']
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: scripts
    });
  } catch (e) {}
}
