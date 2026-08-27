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
  // 关键词自动转双链词库
  autoWikilinks: [
    "Obsidian",
    "SEO",
    "出海",
    "SaaS",
    "飞书",
    "生财有术"
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
      const result = await saveToObsidianBackend(res.data, tab.url, settings, tab.id);
      let msg = '✓ 已成功归档至 Obsidian';
      if (result?.failedImages?.length) {
        msg += `（${result.failedImages.length} 张图片下载失败，多为未登录或防盗链所致）`;
      }
      chrome.tabs.sendMessage(tab.id, {
        action: 'showToast',
        message: msg,
        type: result?.failedImages?.length ? 'info' : 'success'
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
      // popup 发来的消息没有 sender.tab，优先用文档元数据里的来源 URL 做智能分流
      const pageUrl = request.data?.metadata?.source || sender.tab?.url || '';
      saveToObsidianBackend(request.data, pageUrl, settings, request.tabId ?? sender.tab?.id)
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

// 后台统一下载/REST API写入。返回值附带 failedImages 汇总，供前端明确提示用户。
async function saveToObsidianBackend(extractData, url, settings, tabId) {
  const targetFolder = getTargetFolder(url, settings);
  const filename = `${extractData.metadata.title}.md`;
  const fullPath = `${targetFolder}/${filename}`.replace(/\/+/g, '/');
  const failedImages = [];

  if (settings.obsidianSyncMethod === 'rest_api') {
    // 1. 静默并发下载所有图片并保存至 Obsidian 附件目录
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

    // 2. 保存 Markdown 文件
    await saveToObsidianRestApi({
      path: fullPath,
      content: extractData.markdown,
      isBinary: false,
      settings: settings
    });
    return { path: fullPath, savedImages: (extractData.images?.length || 0) - failedImages.length, failedImages };
  } else {
    // 导出文件模式：同时下载 Markdown 和图片包
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
          // fetch 被拦截时退回浏览器原生下载通道（chrome.downloads 走浏览器网络栈，自带站点 Cookie）
          try {
            await handleDownload({
              filename: imgPath,
              content: img.originalUrl,
              isDataUrl: true
            });
          } catch (e2) {
            console.warn('本地图片下载失败:', img.filename, e2);
            failedImages.push(img.filename);
          }
        }
      }
    }

    // Markdown 允许命名降级兜底，保证保存永不因文件名问题整体失败
    await handleDownload({
      filename: `Obsidian_Vault/${fullPath}`,
      content: extractData.markdown,
      allowNameFallback: true
    });
    return { path: fullPath, savedImages: (extractData.images?.length || 0) - failedImages.length, failedImages };
  }
}

// chrome.downloads 对文件名有平台级校验（非法字符 / NUL / 路径穿越等会直接抛 Invalid filename）。
// 飞书等编辑器的文本埋有大量肉眼不可见的字符：零宽连接符、BOM、数学不可见运算符(U+2061..2064)、
// 方向控制符(U+202A..202E)、交互注释符(U+FFF9..FFFB)、软连字符等。\p{Cf} 是 Unicode 全部
// Format 类别的并集，一次性覆盖以上所有；再补充行分隔符 Zl/Zp 与零宽空格。
function INVISIBLE_CHARS() {
  return /[\p{Cf}\u2028\u2029\u200B]/gu;
}

function sanitizePathSegment(seg) {
  return String(seg)
    .replace(INVISIBLE_CHARS(), '')                          // 不可见格式化字符
    .replace(/[\u0000-\u001F\u007F]/g, '')                   // 控制字符（含换行）
    .replace(/[\\/:*?"<>|]/g, '-')                           // Windows/macOS 非法字符
    .replace(/^[\s.]+/, '')                                  // 段首的点与空白（隐藏文件 / 目录穿越）
    .replace(/[\s.]+$/, '')                                  // 段尾的点与空白
    .trim();
}

function sanitizeRelativePath(p) {
  const segs = String(p).split('/')
    .map(sanitizePathSegment)
    .filter(s => s && s !== '.' && s !== '..');
  return segs.join('/') || 'untitled.md';
}

// dataURL 过大时 chrome.downloads 会因 URL 长度限制而失败，超过阈值改走 Blob URL
const BLOB_URL_THRESHOLD = 1_500_000;

// 构造候选下载源：Blob URL 优先（无长度限制），dataURL 作为独立通道兜底。
// 返回 { urls, created }，created 是需要延迟释放的 ObjectURL 列表。
async function buildCandidateUrls(content, mimeType, isDataUrl) {
  const urls = [];
  const created = [];

  if (!isDataUrl) {
    try {
      const objectUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
      created.push(objectUrl);
      urls.push(objectUrl);
    } catch (e) { /* Blob 构造失败则仅尝试 dataURL */ }

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('dataURL 构造失败'));
        reader.readAsDataURL(new Blob([content], { type: mimeType }));
      });
      urls.push(dataUrl);
    } catch (e) { /* 已有 Blob 通道时忽略 */ }
  } else if (typeof content === 'string') {
    if (content.startsWith('data:')) urls.push(content);
    if (content.startsWith('data:') && content.length > BLOB_URL_THRESHOLD ||
        !content.startsWith('data:') && content.startsWith('blob:')) {
      try {
        const res = await fetch(content);
        const objectUrl = URL.createObjectURL(await res.blob());
        created.push(objectUrl);
        urls.unshift(objectUrl);
      } catch (e) { /* 保留原通道 */ }
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
    throw new Error(`Invalid filename (消毒后为空): ${JSON.stringify(String(filename).slice(0, 80))}`);
  }

  const { urls: candidateUrls, created } = await buildCandidateUrls(content, mimeType, isDataUrl);
  if (!candidateUrls.length) {
    throw new Error(`无法构造下载源 (文件: ${safeFilename})`);
  }

  // 文件名候选：
  // - Markdown(allowNameFallback) 允许降级为根目录纯 ASCII 时间戳名，保证保存永不因命名被阻断；
  //   注意图片附件绝不能改名 —— 笔记内 ![](attachments/xxx.png) 的引用必须与磁盘文件名严格一致
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
    // 延迟释放：给下载器留出读取 Blob 的时间
    setTimeout(() => {
      created.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
    }, 30_000);
  }

  const namesTried = nameCandidates.join(', ');
  throw new Error(`${lastErr ? lastErr.message : '下载失败'} (文件: ${namesTried})`);
}

async function saveToObsidianRestApi({ path, content, isBinary, settings }) {
  const protocol = settings.restApiHttps ? 'https' : 'http';
  const safePath = sanitizeRelativePath(path);
  const url = `${protocol}://127.0.0.1:${settings.restApiPort}/vault/${encodeURIComponent(safePath)}`;

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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片数据读取失败'));
    reader.readAsDataURL(blob);
  });
}

// dataURL -> Uint8Array。Obsidian Local REST API 的二进制写入要求原始字节流，
// 直接把 dataURL 字符串当 body PUT 进去会存出损坏的图片文件。
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
      // 带上站点 Cookie：飞书/知乎等平台的图片 CDN 链接(internal-api-drive-stream 等)
      // 需要登录态鉴权，credentials: 'omit' 会直接 401 导致图片静默丢失
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
    // 背景 fetch 失败（缺 Referer 被防盗链拦截、超时等）时退回页面上下文抓取：
    // 与页面同源、同 Cookie、带自然 Referer，且可从页面里已加载成功的 <img> 直接取像素
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
