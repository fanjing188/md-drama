// background/service-worker.js - 快捷键、右键菜单、历史记录与 Obsidian Local REST API 直连

const DEFAULT_SETTINGS = {
  obsidianSyncMethod: 'downloads', // 'rest_api' | 'downloads'
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
  
  // 划选页面交互与保存模式配置
  enableSelectionBubble: true,
  selectionSaveMode: 'new_file',
  selectionAppendFilePath: '03-知识库/网页剪藏/每日摘录.md',

  customBlacklist: [
    "关注公众号",
    "长按二维码",
    "点击下方名片",
    "一键三连"
  ],
  autoWikilinks: [
    "Obsidian",
    "SEO",
    "出海",
    "SaaS",
    "飞书",
    "生财有术"
  ],
  domainRouting: [
    { domain: "feishu.cn", path: "03-知识库/工作文档" },
    { domain: "larksuite.com", path: "03-知识库/工作文档" },
    { domain: "zsxq.com", path: "03-知识库/商业社群" },
    { domain: "shengcaiyoushu.com", path: "03-知识库/商业社群" },
    { domain: "weixin.qq.com", path: "03-知识库/公众号精选" },
    { domain: "zhihu.com", path: "03-知识库/知乎精选" },
    { domain: "yuque.com", path: "03-知识库/语雀知识库" },
    { domain: "juejin.cn", path: "03-知识库/掘金技术" }
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
    title: "MD抓吗：抓下来 (整页)",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "md-drama-clip-selection",
    title: "MD抓吗：抓下来 (所选文字)",
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

// 记录抓取历史
async function recordClipHistory(entry) {
  try {
    const data = await chrome.storage.local.get({ clip_history: [] });
    const newEntry = {
      id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      timestamp: Date.now(),
      timeStr: new Date().toLocaleString(),
      title: entry.title || '无标题文档',
      url: entry.url || '',
      status: entry.status || 'success',
      mode: entry.mode || 'full',
      wordCount: entry.wordCount || 0,
      imgCount: entry.imgCount || 0,
      filePath: entry.filePath || '',
      error: entry.error || ''
    };
    const updated = [newEntry, ...data.clip_history].slice(0, 150);
    await chrome.storage.local.set({ clip_history: updated });
    return newEntry;
  } catch (e) {
    console.warn('记录抓取历史失败:', e);
  }
}

// 监听快捷键命令 (默认 Alt+Shift+S)
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
  } else if (info.menuItemId === "md-drama-clip-selection" && tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { action: 'triggerSelectionClip' }).catch(() => {});
  }
});

// 静默全量抓取与归档执行
async function executeSilentClip(tab) {
  try {
    await ensureContentScripts(tab.id);
    const settings = await getSettings();

    chrome.tabs.sendMessage(tab.id, {
      action: 'showToast',
      message: '正在抓取网页正文与图片...',
      type: 'info'
    }).catch(() => {});

    const res = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractMarkdown',
      settings: settings
    });

    if (res && res.success) {
      const result = await saveToObsidianBackend(res.data, tab.url, settings, tab.id, false);
      let msg = settings.obsidianSyncMethod === 'rest_api' ? '✓ 已成功通过 API 静默同步至 Obsidian！' : '✓ 已成功抓下来并导出！';
      if (result?.failedImages?.length) {
        msg += `（${result.failedImages.length} 张图片下载失败）`;
      }
      chrome.tabs.sendMessage(tab.id, {
        action: 'showToast',
        message: msg,
        type: result?.failedImages?.length ? 'info' : 'success'
      }).catch(() => {});
    } else {
      throw new Error(res?.error || '提取正文失败');
    }
  } catch (err) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'showToast',
      message: `❌ 抓取失败: ${err.message}`,
      type: 'error'
    }).catch(() => {});
    await recordClipHistory({
      title: tab.title || '未知网页',
      url: tab.url,
      status: 'error',
      mode: 'full',
      error: err.message
    });
  }
}

async function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(null, resolve));
}

// 消息路由
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'quickSaveMarkdown') {
    getSettings().then(settings => {
      const pageUrl = request.data?.metadata?.source || sender.tab?.url || '';
      const isSelection = Boolean(request.isSelection);
      saveToObsidianBackend(request.data, pageUrl, settings, request.tabId ?? sender.tab?.id, isSelection)
        .then(res => sendResponse({ success: true, result: res }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    });
    return true;
  }

  if (request.action === 'getClipHistory') {
    chrome.storage.local.get({ clip_history: [] }, (res) => {
      sendResponse({ success: true, history: res.clip_history });
    });
    return true;
  }

  if (request.action === 'clearClipHistory') {
    chrome.storage.local.set({ clip_history: [] }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'deleteClipHistoryItem') {
    chrome.storage.local.get({ clip_history: [] }, (res) => {
      const filtered = res.clip_history.filter(item => item.id !== request.id);
      chrome.storage.local.set({ clip_history: filtered }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  // 测试与检查 Obsidian REST API 连通性
  if (request.action === 'checkObsidianConnection' || request.action === 'testObsidianRestApi') {
    const config = request.config || null;
    getSettings().then(async (settings) => {
      const cfg = config ? { ...settings, ...config } : settings;
      if (cfg.obsidianSyncMethod !== 'rest_api' && !config) {
        return sendResponse({ connected: false, reason: 'downloads_mode' });
      }

      if (!cfg.restApiToken) {
        return sendResponse({ success: false, connected: false, message: '请先填写 REST API Token' });
      }

      const port = cfg.restApiPort || 27124;
      const headers = { 'Authorization': `Bearer ${cfg.restApiToken}` };
      const protocol = cfg.restApiHttps ? 'https' : 'http';

      try {
        const res = await fetch(`${protocol}://127.0.0.1:${port}/`, {
          method: 'GET',
          headers: headers
        });

        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          return sendResponse({ success: true, connected: true, protocol, port, data: json, message: '✓ 已成功连接到 Obsidian Local REST API！' });
        } else if (res.status === 401) {
          return sendResponse({ success: false, connected: false, message: 'API Token 验证失败 (401 Unauthorized)，请检查 API Key' });
        } else {
          return sendResponse({ success: false, connected: false, message: `Obsidian 响应异常 [HTTP ${res.status}]` });
        }
      } catch (err) {
        // 若配置了 HTTPS 但失败，尝试自动探测 HTTP 端口
        if (cfg.restApiHttps) {
          try {
            const httpRes = await fetch(`http://127.0.0.1:${port}/`, { method: 'GET', headers: headers });
            if (httpRes.ok) {
              return sendResponse({
                success: true,
                connected: true,
                protocol: 'http',
                port,
                message: '✓ 检测到 Obsidian 当前使用 HTTP 协议，请在设置中关闭 HTTPS 选项'
              });
            }
          } catch (e2) {}
        }
        return sendResponse({
          success: false,
          connected: false,
          message: `无法连接到 127.0.0.1:${port}。请确保：1. Obsidian 已打开；2. Local REST API 插件已启用；3. 端口正确`
        });
      }
    });
    return true;
  }

  if (request.action === 'fetchImageAsBase64') {
    fetchImageAsBase64(request.url, request.tabId ?? sender.tab?.id)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 后台保存处理器（支持全量保存与选区追加/独立文件保存两种模式）
async function saveToObsidianBackend(extractData, url, settings, tabId, isSelection = false) {
  const isAppendMode = isSelection && (settings.selectionSaveMode === 'append_file');
  let fullPath = '';
  const failedImages = [];
  const title = extractData.metadata.title || '无标题文档';
  const wordCount = extractData.markdown ? extractData.markdown.length : 0;
  const imgCount = extractData.images?.length || 0;

  try {
    if (isAppendMode) {
      // 模式 2: 追加到指定文件 (如 03-知识库/网页剪藏/每日摘录.md)
      fullPath = (settings.selectionAppendFilePath || '03-知识库/网页剪藏/每日摘录.md').replace(/\/+/g, '/');
      const nowStr = new Date().toLocaleString();
      const appendBlock = `\n\n### 👾 摘录自 [${title}](${url || '#'}) · ${nowStr}\n\n${extractData.markdown}\n\n---\n`;

      if (settings.obsidianSyncMethod === 'rest_api') {
        let currentContent = '';
        try {
          const safePath = sanitizeRelativePath(fullPath);
          const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
          const protocol = settings.restApiHttps ? 'https' : 'http';
          const readUrl = `${protocol}://127.0.0.1:${settings.restApiPort}/vault/${encodedPath}`;
          
          let readRes;
          try {
            readRes = await fetch(readUrl, {
              method: 'GET',
              headers: { 'Authorization': `Bearer ${settings.restApiToken}` }
            });
          } catch(e) {
            // HTTPS 证书回退 HTTP
            if (settings.restApiHttps) {
              readRes = await fetch(`http://127.0.0.1:${settings.restApiPort}/vault/${encodedPath}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${settings.restApiToken}` }
              });
            }
          }
          if (readRes && readRes.ok) {
            currentContent = await readRes.text();
          }
        } catch(e) {}

        const finalContent = currentContent ? (currentContent.trimEnd() + appendBlock) : (`# 每日摘录与灵感速记\n` + appendBlock);
        await saveToObsidianRestApi({
          path: fullPath,
          content: finalContent,
          isBinary: false,
          settings: settings
        });
      } else {
        await handleDownload({
          filename: `Obsidian_Vault/${fullPath}`,
          content: appendBlock,
          allowNameFallback: true
        });
      }

      await recordClipHistory({
        title: `[选区追加] ${title}`,
        url: url,
        status: 'success',
        mode: 'selection_append',
        wordCount: wordCount,
        imgCount: 0,
        filePath: fullPath
      });

      return { path: fullPath, mode: 'append', savedImages: 0, failedImages: [] };
    }

    // 模式 1: 保存为新文件
    const targetFolder = getTargetFolder(url, settings);
    const filename = `${title}.md`;
    fullPath = `${targetFolder}/${filename}`.replace(/\/+/g, '/');

    if (settings.obsidianSyncMethod === 'rest_api') {
      // 1. 下载图片附件
      if (settings.imageHandling === 'download' && extractData.images?.length > 0) {
        for (const img of extractData.images) {
          try {
            const imgPath = `${targetFolder}/${settings.attachmentFolder || 'attachments'}/${img.filename}`.replace(/\/+/g, '/');
            const imgBase64 = await fetchImageAsBase64(img.originalUrl, tabId);
            await saveToObsidianRestApi({
              path: imgPath,
              content: dataUrlToBytes(imgBase64),
              isBinary: true,
              settings: settings
            });
          } catch (e) {
            console.warn('图片附件保存跳过:', img.filename, e);
            failedImages.push(img.filename);
          }
        }
      }

      // 2. 写入 Markdown
      await saveToObsidianRestApi({
        path: fullPath,
        content: extractData.markdown,
        isBinary: false,
        settings: settings
      });
    } else {
      // 导出文件模式
      if (settings.imageHandling === 'download' && extractData.images?.length > 0) {
        for (const img of extractData.images) {
          const imgPath = `Obsidian_Vault/${targetFolder}/${settings.attachmentFolder || 'attachments'}/${img.filename}`.replace(/\/+/g, '/');
          try {
            const imgBase64 = await fetchImageAsBase64(img.originalUrl, tabId);
            await handleDownload({
              filename: imgPath,
              content: imgBase64,
              isDataUrl: true
            });
          } catch (e) {
            try {
              await handleDownload({
                filename: imgPath,
                content: img.originalUrl,
                isDataUrl: true
              });
            } catch (e2) {
              failedImages.push(img.filename);
            }
          }
        }
      }

      await handleDownload({
        filename: `Obsidian_Vault/${fullPath}`,
        content: extractData.markdown,
        allowNameFallback: true
      });
    }

    await recordClipHistory({
      title: title,
      url: url,
      status: 'success',
      mode: isSelection ? 'selection' : 'full',
      wordCount: wordCount,
      imgCount: imgCount - failedImages.length,
      filePath: fullPath
    });

    return { path: fullPath, mode: 'new_file', savedImages: imgCount - failedImages.length, failedImages };
  } catch (err) {
    await recordClipHistory({
      title: title,
      url: url,
      status: 'error',
      mode: isSelection ? 'selection' : 'full',
      wordCount: wordCount,
      imgCount: imgCount,
      filePath: fullPath,
      error: err.message
    });
    throw err;
  }
}

function sanitizePathSegment(seg) {
  return String(seg)
    .replace(/[\p{Cf}\u2028\u2029\u200B]/gu, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/^[\s.]+/, '')
    .replace(/[\s.]+$/, '')
    .trim();
}

function sanitizeRelativePath(p) {
  const segs = String(p).split('/')
    .map(sanitizePathSegment)
    .filter(s => s && s !== '.' && s !== '..');
  return segs.join('/') || 'untitled.md';
}

const BLOB_URL_THRESHOLD = 1_500_000;

async function buildCandidateUrls(content, mimeType, isDataUrl) {
  const urls = [];
  const created = [];

  if (!isDataUrl) {
    try {
      const objectUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
      created.push(objectUrl);
      urls.push(objectUrl);
    } catch (e) {}

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('dataURL 构造失败'));
        reader.readAsDataURL(new Blob([content], { type: mimeType }));
      });
      urls.push(dataUrl);
    } catch (e) {}
  } else if (typeof content === 'string') {
    if (content.startsWith('data:')) urls.push(content);
    if (content.startsWith('data:') && content.length > BLOB_URL_THRESHOLD ||
        !content.startsWith('data:') && content.startsWith('blob:')) {
      try {
        const res = await fetch(content);
        const objectUrl = URL.createObjectURL(await res.blob());
        created.push(objectUrl);
        urls.unshift(objectUrl);
      } catch (e) {}
    }
  }

  return { urls, created };
}

function rawDownload(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve({ downloadId });
      }
    });
  });
}

async function handleDownload({ filename, content, mimeType = 'text/markdown;charset=utf-8', isDataUrl = false, allowNameFallback = false }) {
  const safeFilename = sanitizeRelativePath(filename);
  if (!safeFilename) {
    throw new Error(`Invalid filename: ${JSON.stringify(String(filename).slice(0, 80))}`);
  }

  const { urls: candidateUrls, created } = await buildCandidateUrls(content, mimeType, isDataUrl);
  if (!candidateUrls.length) {
    throw new Error(`无法构造下载源 (文件: ${safeFilename})`);
  }

  const nameCandidates = [safeFilename];
  if (allowNameFallback) {
    const extMatch = safeFilename.match(/\.([A-Za-z0-9]+)$/);
    nameCandidates.push(`md-drama-${Date.now()}.${extMatch ? extMatch[1] : 'txt'}`);
  }

  let lastErr;
  try {
    for (const fname of nameCandidates) {
      for (const url of candidateUrls) {
        try {
          return await rawDownload(url, fname);
        } catch (e) {
          lastErr = e;
        }
      }
    }
  } finally {
    setTimeout(() => {
      created.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    }, 30_000);
  }

  throw new Error(`${lastErr ? lastErr.message : '下载失败'} (文件: ${safeFilename})`);
}

// 核心 Obsidian Local REST API 写入器 (精确逐级路径转义 + 协议自适应回退 + 诊断信息)
async function saveToObsidianRestApi({ path, content, isBinary, settings }) {
  if (!settings.restApiToken) {
    throw new Error('未配置 Obsidian REST API Token，请先前往插件设置中填写 API Key');
  }

  const safePath = sanitizeRelativePath(path);
  // 精确逐级转义路径段，保留斜杠 / 以正确创建多层级目录
  const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
  const port = settings.restApiPort || 27124;
  const protocol = settings.restApiHttps ? 'https' : 'http';
  const primaryUrl = `${protocol}://127.0.0.1:${port}/vault/${encodedPath}`;

  const headers = {
    'Authorization': `Bearer ${settings.restApiToken}`,
    'Content-Type': isBinary ? 'application/octet-stream' : 'text/markdown; charset=utf-8'
  };

  const doFetch = async (targetUrl) => {
    return await fetch(targetUrl, {
      method: 'PUT',
      headers: headers,
      body: content
    });
  };

  let response;
  try {
    response = await doFetch(primaryUrl);
  } catch (netErr) {
    // 若 HTTPS 失败（自签名证书未放行），尝试自动回退 HTTP
    if (settings.restApiHttps) {
      try {
        const fallbackUrl = `http://127.0.0.1:${port}/vault/${encodedPath}`;
        response = await doFetch(fallbackUrl);
      } catch (e2) {
        throw new Error(`无法连接到 Obsidian REST API (127.0.0.1:${port})。请确保：1. Obsidian 已打开；2. Local REST API 插件已开启；3. 若使用 HTTPS 请在浏览器打开 https://127.0.0.1:${port} 信任证书，或在设置中切换为 HTTP 协议`);
      }
    } else {
      throw new Error(`无法连接到 Obsidian REST API (127.0.0.1:${port})。请确保 Obsidian 已打开并启用 Local REST API 插件`);
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Obsidian REST API Token 无效 (401 Unauthorized)，请检查设置中的 API Key 是否匹配');
    }
    const errorText = await response.text().catch(() => '');
    throw new Error(`Obsidian REST API 响应错误 [HTTP ${response.status}]: ${errorText || '写入失败'}`);
  }

  return { status: response.status };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片数据读取失败'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function fetchImageAsBase64(url, tabId, timeoutMs = 20000) {
  const attemptWithTimeout = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { mode: 'cors', credentials: 'include', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('响应内容为空');
      if (blob.type && /text\/html/i.test(blob.type)) throw new Error('CDN 返回了网页而非图片');
      return await blobToDataUrl(blob);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attemptWithTimeout();
  } catch (bgErr) {
    if (tabId !== undefined && tabId !== null) {
      try {
        const res = await chrome.tabs.sendMessage(tabId, { action: 'fetchImageAsBase64', url });
        if (res?.success && res.dataUrl) return res.dataUrl;
        throw new Error(res?.error || '页面内抓取无返回');
      } catch (pageErr) {
        throw new Error(`图片下载失败 [后台:${bgErr.message} / 页面:${pageErr.message}]`);
      }
    }
    throw new Error(`图片下载失败: ${bgErr.message}`);
  }
}

async function ensureContentScripts(tabId) {
  const scripts = [
    'utils/logger.js',
    'utils/sync-queue.js',
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
    'content/adapters/wechat.js',
    'content/adapters/zhihu.js',
    'content/adapters/yuque.js',
    'content/adapters/notion.js',
    'content/adapters/juejin.js',
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
