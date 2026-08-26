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
});
