// background/service-worker.js - 快捷键、右键菜单、历史记录与 Obsidian Local REST API 智能直连

const DEFAULT_SETTINGS = {
  obsidianSyncMethod: 'downloads', // 'rest_api' | 'downloads'
  restApiPort: 27123,              // 默认推荐 HTTP 27123 端口（免自签名证书限制）
  restApiToken: '',
  restApiHttps: false,             // 默认推荐使用标准 HTTP 协议
  vaultName: 'fanjing_notes',
  vaultSavePath: '03-知识库/网页剪藏',
  attachmentFolder: 'attachments', // 全局统一图片资源文件夹
  imageHandling: 'download',
  autoSaveDirectly: true,          // 抓取完成后直接保存到 Obsidian（无需二次手动点击）
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
  selectionSaveMode: 'new_file',    // 'new_file' | 'append_file'
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
  enableDomainRouting: false,       // 默认不强制域名分流，严格遵循用户设置的 vaultSavePath 归档路径
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

// 后台常驻任务跟踪池（即使切换标签页或关闭弹窗，任务也持续在后台完成并保存）
const activeCrawlTasks = new Map();

// 标签页关闭时清理对应的后台任务缓存，防止内存泄漏
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeCrawlTasks.has(tabId)) {
    activeCrawlTasks.delete(tabId);
  }
});

chrome.runtime.onInstalled.addListener((details) => {
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

  // 首次安装自动打开新手配置向导
  if (details && details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding/onboarding.html')
    });
  }
});

// 计算归档目录 (严格优先使用用户在偏好设置中配置的 vaultSavePath)
function getTargetFolder(url, settings) {
  if (settings.enableDomainRouting && settings.domainRouting && Array.isArray(settings.domainRouting)) {
    for (const route of settings.domainRouting) {
      if (route.domain && url && url.includes(route.domain)) {
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
      message: '正在深度抓取正文与图片...',
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

// 后台常驻全量流水线任务执行（后台接管，即使用户切换标签页或关闭弹窗也保证完成）
async function executeBackgroundCrawlWorkflow(tabId, tabUrl, useAutoScroll = true) {
  const settings = await getSettings();
  const taskState = {
    tabId,
    status: 'running',
    stage: 1,
    stageText: '正在启动抓取引擎...',
    percent: 10,
    data: null,
    saveResult: null,
    error: null,
    timestamp: Date.now()
  };
  activeCrawlTasks.set(tabId, taskState);

  try {
    await ensureContentScripts(tabId);
    
    // 通知页面开始流程
    const crawlPromise = chrome.tabs.sendMessage(tabId, {
      action: 'startWorkflow',
      useAutoScroll: useAutoScroll,
      settings: settings
    });

    const res = await crawlPromise;
    if (!res || !res.success || !res.state?.data) {
      throw new Error(res?.error || res?.state?.error || '抓取未能提取到有效正文');
    }

    const extractData = res.state.data;
    taskState.stage = 6;
    taskState.data = extractData;

    // 若开启了自动直接保存（默认开启）
    if (settings.autoSaveDirectly) {
      taskState.percent = 92;
      taskState.stageText = '正在自动归档至 Obsidian 知识库...';
      taskState.savingDetail = '正在本地化图片资源与写入 Markdown...';
      activeCrawlTasks.set(tabId, taskState);
      
      chrome.runtime.sendMessage({
        action: 'workflowProgress',
        state: taskState
      }).catch(() => {});

      const saveRes = await saveToObsidianBackend(extractData, tabUrl, settings, tabId, false);
      taskState.status = 'saved';
      taskState.percent = 100;
      taskState.saveResult = saveRes;
      taskState.stageText = '已成功归档至 Obsidian！';
      taskState.savingDetail = '';

      chrome.tabs.sendMessage(tabId, {
        action: 'showToast',
        message: '✓ 已成功抓下来并归档！',
        type: 'success'
      }).catch(() => {});
    } else {
      taskState.status = 'completed';
      taskState.percent = 100;
      taskState.stageText = '全量解析完成！';
    }

    activeCrawlTasks.set(tabId, taskState);
    return taskState;
  } catch (err) {
    taskState.status = 'error';
    taskState.error = err.message;
    taskState.stageText = `抓取失败: ${err.message}`;
    activeCrawlTasks.set(tabId, taskState);

    await recordClipHistory({
      title: '抓取失败',
      url: tabUrl,
      status: 'error',
      mode: 'full',
      error: err.message
    });

    chrome.tabs.sendMessage(tabId, {
      action: 'showToast',
      message: `❌ 抓取失败: ${err.message}`,
      type: 'error'
    }).catch(() => {});

    throw err;
  }
}

async function getSettings() {
  return new Promise(resolve => chrome.storage.sync.get(null, resolve));
}

// 构造候选服务器端点列表 (支持 HTTPS、HTTP 与常用 27123/27124 智能回退)
function getApiEndpointCandidates(settings, subPath = '') {
  const port = parseInt(settings.restApiPort, 10) || 27124;
  const pathPart = subPath ? (subPath.startsWith('/') ? subPath : `/${subPath}`) : '';
  const candidates = [];

  const mainProtocol = settings.restApiHttps ? 'https' : 'http';
  candidates.push(`${mainProtocol}://127.0.0.1:${port}${pathPart}`);

  // 备用 HTTP 端口与协议
  if (mainProtocol === 'https') {
    candidates.push(`http://127.0.0.1:${port}${pathPart}`);
    if (port === 27124) candidates.push(`http://127.0.0.1:27123${pathPart}`);
  } else {
    if (port === 27123) candidates.push(`http://127.0.0.1:27124${pathPart}`);
  }

  return [...new Set(candidates)];
}

// 消息路由
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 启动后台接管的抓取任务
  if (request.action === 'startBackgroundCrawl') {
    const tabId = request.tabId || sender.tab?.id;
    const tabUrl = request.url || sender.tab?.url || '';
    const useAutoScroll = Boolean(request.useAutoScroll);

    executeBackgroundCrawlWorkflow(tabId, tabUrl, useAutoScroll)
      .then(state => sendResponse({ success: true, state }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 查询后台常驻任务状态
  if (request.action === 'getBackgroundTaskState') {
    const tabId = request.tabId || sender.tab?.id;
    const state = activeCrawlTasks.get(tabId) || null;
    sendResponse({ success: true, state });
    return true;
  }

  // 重置后台任务状态
  if (request.action === 'resetBackgroundTask') {
    const tabId = request.tabId || sender.tab?.id;
    activeCrawlTasks.delete(tabId);
    sendResponse({ success: true });
    return true;
  }

  // 打开新手配置向导
  if (request.action === 'openOnboarding') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding/onboarding.html')
    });
    sendResponse({ success: true });
    return true;
  }

  // 同步来自 content script 的进度广播
  if (request.action === 'workflowProgress' && sender.tab?.id) {
    const tabId = sender.tab.id;
    const existing = activeCrawlTasks.get(tabId) || {};
    activeCrawlTasks.set(tabId, { ...existing, ...request.state, tabId });
    return true;
  }

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

  // 测试与检查 Obsidian REST API 连通性 (带智能多端点探测)
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

      const headers = { 'Authorization': `Bearer ${cfg.restApiToken}` };
      const endpoints = getApiEndpointCandidates(cfg, '/');

      let lastErrorMsg = '';
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep, { method: 'GET', headers: headers });
          if (res.ok) {
            const json = await res.json().catch(() => ({}));
            const isHttp = ep.startsWith('http://');
            const portMatch = ep.match(/:(\d+)/);
            const activePort = portMatch ? portMatch[1] : '27123';
            
            let tip = `✓ 成功连接到 Obsidian Local REST API (端点: ${ep.replace(/\/$/, '')})`;
            if (cfg.restApiHttps && isHttp) {
              tip += '，已为您自动适配 HTTP 通道！';
            }
            return sendResponse({
              success: true,
              connected: true,
              protocol: isHttp ? 'http' : 'https',
              port: activePort,
              endpoint: ep,
              data: json,
              message: tip
            });
          } else if (res.status === 401) {
            return sendResponse({ success: false, connected: false, message: 'API Token 验证失败 (401 Unauthorized)，请检查 API Key' });
          } else {
            lastErrorMsg = `Obsidian 响应异常 [HTTP ${res.status}]`;
          }
        } catch (e) {
          lastErrorMsg = e.message;
        }
      }

      return sendResponse({
        success: false,
        connected: false,
        message: `无法连接到 Obsidian Local REST API。请确保：1. Obsidian 已打开；2. Local REST API 插件处于开启状态；3. 推荐在设置中使用 HTTP 协议与 27123 端口`
      });
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

// 后台保存处理器（整篇保存与划选保存共用全局统一图片资源配置）
async function saveToObsidianBackend(extractData, url, settings, tabId, isSelection = false) {
  const isAppendMode = isSelection && (settings.selectionSaveMode === 'append_file');
  let fullPath = '';
  const failedImages = [];
  const title = extractData.metadata.title || '无标题文档';
  const wordCount = extractData.markdown ? extractData.markdown.length : 0;
  const imgCount = extractData.images?.length || 0;
  const targetFolder = getTargetFolder(url, settings);
  const attachmentDirName = settings.attachmentFolder || 'attachments';

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
          const endpoints = getApiEndpointCandidates(settings, `/vault/${encodedPath}`);

          for (const ep of endpoints) {
            try {
              const readRes = await fetch(ep, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${settings.restApiToken}` }
              });
              if (readRes.ok) {
                currentContent = await readRes.text();
                break;
              }
            } catch(e) {}
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

    // 模式 1: 保存为新文件（整页归档或划选新增文件）
    const filename = isSelection ? `选区摘录-${title}.md` : `${title}.md`;
    fullPath = `${targetFolder}/${filename}`.replace(/\/+/g, '/');

    if (settings.obsidianSyncMethod === 'rest_api') {
      // 1. 全局统一图片附件保存
      if (settings.imageHandling === 'download' && extractData.images?.length > 0) {
        let currentImgIdx = 0;
        const totalImgs = extractData.images.length;
        for (const img of extractData.images) {
          currentImgIdx++;
          if (tabId) {
            const saveState = {
              tabId,
              status: 'running',
              stage: 6,
              stageText: `正在归档至 Obsidian (图片 ${currentImgIdx}/${totalImgs})...`,
              percent: Math.min(98, 92 + Math.round((currentImgIdx / totalImgs) * 5)),
              savingDetail: `正在保存第 ${currentImgIdx}/${totalImgs} 张图片：${img.filename}`
            };
            activeCrawlTasks.set(tabId, saveState);
            chrome.runtime.sendMessage({ action: 'workflowProgress', state: saveState }).catch(() => {});
          }

          try {
            const imgPath = `${targetFolder}/${attachmentDirName}/${img.filename}`.replace(/\/+/g, '/');
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
      if (tabId) {
        const writeState = {
          tabId,
          status: 'running',
          stage: 6,
          stageText: '正在写入 Markdown 文档...',
          percent: 98,
          savingDetail: `正在写入文件：${fullPath}`
        };
        activeCrawlTasks.set(tabId, writeState);
        chrome.runtime.sendMessage({ action: 'workflowProgress', state: writeState }).catch(() => {});
      }

      await saveToObsidianRestApi({
        path: fullPath,
        content: extractData.markdown,
        isBinary: false,
        settings: settings
      });
    } else {
      // 导出文件模式
      if (settings.imageHandling === 'download' && extractData.images?.length > 0) {
        let currentImgIdx = 0;
        const totalImgs = extractData.images.length;
        for (const img of extractData.images) {
          currentImgIdx++;
          if (tabId) {
            const saveState = {
              tabId,
              status: 'running',
              stage: 6,
              stageText: `正在导出图片资源 (${currentImgIdx}/${totalImgs})...`,
              percent: Math.min(98, 92 + Math.round((currentImgIdx / totalImgs) * 5)),
              savingDetail: `正在导出图片：${img.filename}`
            };
            activeCrawlTasks.set(tabId, saveState);
            chrome.runtime.sendMessage({ action: 'workflowProgress', state: saveState }).catch(() => {});
          }
          const imgPath = `Obsidian_Vault/${targetFolder}/${attachmentDirName}/${img.filename}`.replace(/\/+/g, '/');
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

      if (tabId) {
        const writeState = {
          tabId,
          status: 'running',
          stage: 6,
          stageText: '正在导出 Markdown 文件...',
          percent: 98,
          savingDetail: `正在生成下载：${fullPath}`
        };
        activeCrawlTasks.set(tabId, writeState);
        chrome.runtime.sendMessage({ action: 'workflowProgress', state: writeState }).catch(() => {});
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

function sanitizePathSegment(seg, maxLen = 80) {
  const cleaned = String(seg)
    .replace(/[\p{Cf}\u2028\u2029\u200B]/gu, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/:*?"<>|#^\[\]]/g, '-')
    .replace(/^[\s.]+/, '')
    .replace(/[\s.]+$/, '')
    .trim();
  if (cleaned.length > maxLen) {
    return cleaned.slice(0, maxLen).trim();
  }
  return cleaned || 'untitled';
}

function sanitizeRelativePath(p) {
  const segs = String(p).split('/')
    .map(s => sanitizePathSegment(s))
    .filter(s => s && s !== '.' && s !== '..');
  return segs.join('/') || 'untitled.md';
}

// Service Worker 兼容的文本转 Data URL (完全避免 FileReader 和 URL.createObjectURL)
function textToDataUrl(text, mimeType = 'text/markdown;charset=utf-8') {
  const bytes = new TextEncoder().encode(String(text));
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

// Service Worker 兼容的 ArrayBuffer 转 Data URL
function arrayBufferToDataUrl(buffer, mimeType = 'application/octet-stream') {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

// Service Worker 兼容的 Blob 转 Data URL
async function blobToDataUrl(blob, defaultMime = 'image/png') {
  if (blob && typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer();
    return arrayBufferToDataUrl(buffer, blob.type || defaultMime);
  }
  throw new Error('当前环境不支持 Blob 数据读取');
}

async function buildCandidateUrls(content, mimeType, isDataUrl) {
  const urls = [];
  if (isDataUrl && typeof content === 'string') {
    if (content.startsWith('data:') || content.startsWith('http://') || content.startsWith('https://')) {
      urls.push(content);
    }
  } else if (typeof content === 'string') {
    urls.push(textToDataUrl(content, mimeType));
  } else if (content instanceof ArrayBuffer || content instanceof Uint8Array) {
    urls.push(arrayBufferToDataUrl(content, mimeType));
  } else if (content && typeof content.arrayBuffer === 'function') {
    const buffer = await content.arrayBuffer();
    urls.push(arrayBufferToDataUrl(buffer, mimeType));
  }
  return { urls, created: [] };
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

  const { urls: candidateUrls } = await buildCandidateUrls(content, mimeType, isDataUrl);
  if (!candidateUrls.length) {
    throw new Error(`无法构造下载源 (文件: ${safeFilename})`);
  }

  const nameCandidates = [safeFilename];
  if (allowNameFallback) {
    const extMatch = safeFilename.match(/\.([A-Za-z0-9]+)$/);
    nameCandidates.push(`md-drama-${Date.now()}.${extMatch ? extMatch[1] : 'txt'}`);
  }

  let lastErr;
  for (const fname of nameCandidates) {
    for (const url of candidateUrls) {
      try {
        return await rawDownload(url, fname);
      } catch (e) {
        lastErr = e;
      }
    }
  }

  throw new Error(`${lastErr ? lastErr.message : '下载失败'} (文件: ${safeFilename})`);
}

// 核心 Obsidian Local REST API 写入器 (精确逐级路径转义 + 智能多候选端点自适应)
async function saveToObsidianRestApi({ path, content, isBinary, settings }) {
  if (!settings.restApiToken) {
    throw new Error('未配置 Obsidian REST API Token，请先前往插件设置或新手向导中填写 API Key');
  }

  const safePath = sanitizeRelativePath(path);
  // 精确逐级转义路径段，保留斜杠 / 以正确创建多层级目录
  const encodedPath = safePath.split('/').map(encodeURIComponent).join('/');
  const endpoints = getApiEndpointCandidates(settings, `/vault/${encodedPath}`);

  const headers = {
    'Authorization': `Bearer ${settings.restApiToken}`,
    'Content-Type': isBinary ? 'application/octet-stream' : 'text/markdown; charset=utf-8'
  };

  let lastErr = null;
  for (const targetUrl of endpoints) {
    try {
      const response = await fetch(targetUrl, {
        method: 'PUT',
        headers: headers,
        body: content
      });

      if (response.ok) {
        return { status: response.status, endpoint: targetUrl };
      } else if (response.status === 401) {
        throw new Error('Obsidian REST API Token 无效 (401 Unauthorized)，请检查设置中的 API Key 是否匹配');
      } else {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Obsidian REST API 响应错误 [HTTP ${response.status}]: ${errorText || '写入失败'}`);
      }
    } catch (netErr) {
      lastErr = netErr;
    }
  }

  throw new Error(lastErr?.message || '无法连接到 Obsidian REST API。请确保 Obsidian 已打开并启用 Local REST API 插件');
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
  try {
    const isAlive = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (isAlive && isAlive.status === 'ok') return;
  } catch (e) {}

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
    }).catch(() => {});
    await chrome.scripting.executeScript({
      target: { tabId },
      files: scripts
    });
  } catch (e) {}
}
