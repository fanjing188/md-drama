// content/index.js - Content Script 消息入口与执行协调器

let activeScroller = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
