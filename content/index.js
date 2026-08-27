// content/index.js - Content Script 消息入口与执行协调器

let activeScroller = null;
let currentTaskState = {
  status: 'idle', // 'idle' | 'running' | 'completed' | 'error'
  stage: 0,
  stageText: '',
  percent: 0,
  data: null,
  error: null,
  timestamp: 0
};

function broadcastTaskState() {
  try {
    chrome.runtime.sendMessage({
      action: 'workflowProgress',
      state: currentTaskState
    }).catch(() => {});
  } catch (e) {}
}

async function runFullWorkflow({ useAutoScroll = false, settings = {} } = {}) {
  currentTaskState = {
    status: 'running',
    stage: 1,
    stageText: '正在探测页面滚动容器与结构...',
    percent: 10,
    data: null,
    error: null,
    timestamp: Date.now()
  };
  broadcastTaskState();
  await new Promise(r => setTimeout(r, 150));

  try {
    if (useAutoScroll) {
      currentTaskState.stage = 2;
      currentTaskState.stageText = '正在自动平滑滚动加载...';
      currentTaskState.percent = 20;
      broadcastTaskState();

      activeScroller = new SmartScroller({
        interval: 150,
        onProgress: (progress) => {
          if (currentTaskState.status !== 'running') return;
          const scrollPct = Math.round(15 + (progress.percent * 0.45)); // 15% ~ 60%
          currentTaskState.stage = 2;
          currentTaskState.stageText = `深度滚动中 (${progress.percent}%)`;
          currentTaskState.percent = scrollPct;
          broadcastTaskState();
        }
      });

      try {
        await activeScroller.run();
      } finally {
        activeScroller = null;
      }
    }

    // 阶段 3: DOM 复杂结构重塑
    currentTaskState.stage = 3;
    currentTaskState.stageText = '正在穿透 Shadow DOM 并重塑复杂结构...';
    currentTaskState.percent = 70;
    broadcastTaskState();
    await new Promise(r => setTimeout(r, 120));

    // 阶段 4: 废话与广告智能去噪
    currentTaskState.stage = 4;
    currentTaskState.stageText = '正在识别并剔除废话与营销套话...';
    currentTaskState.percent = 85;
    broadcastTaskState();
    await new Promise(r => setTimeout(r, 100));

    // 阶段 5: 规范排版与 Markdown 序列化
    currentTaskState.stage = 5;
    currentTaskState.stageText = '正在排版与 Markdown 序列化...';
    currentTaskState.percent = 95;
    broadcastTaskState();

    const extractor = new DramaExtractor(settings || {});
    const data = await extractor.extract();

    currentTaskState = {
      status: 'completed',
      stage: 6,
      stageText: '全量解析完成！',
      percent: 100,
      data: data,
      error: null,
      timestamp: Date.now()
    };
    broadcastTaskState();
    return currentTaskState;
  } catch (err) {
    currentTaskState = {
      status: 'error',
      stage: 0,
      stageText: '',
      percent: 0,
      data: null,
      error: err.message || '解析遇到问题',
      timestamp: Date.now()
    };
    broadcastTaskState();
    throw err;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    sendResponse({ status: 'ok' });
    return true;
  }

  if (request.action === 'getExtractState') {
    sendResponse({ success: true, state: currentTaskState });
    return true;
  }

  if (request.action === 'resetExtractState') {
    if (activeScroller) {
      activeScroller.cancel();
      activeScroller = null;
    }
    currentTaskState = {
      status: 'idle',
      stage: 0,
      stageText: '',
      percent: 0,
      data: null,
      error: null,
      timestamp: 0
    };
    sendResponse({ success: true, state: currentTaskState });
    return true;
  }

  if (request.action === 'updateExtractData') {
    if (request.data && currentTaskState.data) {
      currentTaskState.data = {
        ...currentTaskState.data,
        ...request.data
      };
      if (request.data.metadata) {
        currentTaskState.data.metadata = {
          ...currentTaskState.data.metadata,
          ...request.data.metadata
        };
      }
    }
    sendResponse({ success: true, state: currentTaskState });
    return true;
  }

  if (request.action === 'startWorkflow') {
    if (currentTaskState.status === 'running') {
      sendResponse({ success: true, state: currentTaskState });
      return true;
    }
    runFullWorkflow(request).then(state => {
      sendResponse({ success: true, state });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'showToast') {
    if (typeof window.showGlobalToast === 'function') {
      window.showGlobalToast(request.message, request.type || 'success');
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'startAutoScroll') {
    activeScroller = new SmartScroller({
      interval: request.interval || 150,
      onProgress: (progress) => {
        chrome.runtime.sendMessage({ action: 'scrollProgress', progress }).catch(() => {});
      }
    });

    activeScroller.run().then(res => {
      sendResponse({ success: true, result: res });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'cancelAutoScroll') {
    if (activeScroller) {
      activeScroller.cancel();
      activeScroller = null;
    }
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'extractMarkdown') {
    const extractor = new DramaExtractor(request.settings || {});
    extractor.extract().then(data => {
      // 同步到页面状态，以便打开弹窗时也能看到结果
      currentTaskState = {
        status: 'completed',
        stage: 6,
        stageText: '全量解析完成！',
        percent: 100,
        data: data,
        error: null,
        timestamp: Date.now()
      };
      sendResponse({ success: true, data });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'fetchImageAsBase64') {
    fetchImageInPageContext(request.url)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 页面上下文抓图：与页面同源、同 Cookie、带自然 Referer，可绕过多数防盗链
async function fetchImageInPageContext(url) {
  try {
    const resp = await fetch(url, { credentials: 'include', mode: 'cors' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    if (!blob.size) throw new Error('响应内容为空');
    return await blobToDataUrl(blob);
  } catch (e) {
    // 网络兜底：直接从页面上已加载成功的 <img> 元素取像素
    return captureRenderedImg(url);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('图片数据读取失败'));
    reader.readAsDataURL(blob);
  });
}

function captureRenderedImg(originalUrl) {
  let absUrl;
  try {
    absUrl = new URL(originalUrl, location.href).href;
  } catch (e) {
    throw new Error(`无效的图片地址: ${originalUrl}`);
  }
  const img = Array.from(document.images).find(i => (i.currentSrc || i.src || '').split('#')[0] === absUrl.split('#')[0]);
  if (!img || !img.complete || !img.naturalWidth) throw new Error('页面中未找到已加载成功的原图');
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  // 图片未开 CORS 时 canvas 会被污染，此处如实抛错而非输出空图
  const dataUrl = canvas.toDataURL('image/png');
  if (dataUrl.length < 200) throw new Error('canvas 取像失败(可能被跨域污染)');
  return dataUrl;
}
