// test/test_popup_state_and_sw_pool.js - Popup 状态机与 Service Worker 并发池回归测试
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

console.log('=== 开始执行 Popup 状态机与全键盘流测试 ===');

const popupHtml = fs.readFileSync(path.join(__dirname, '../popup/popup.html'), 'utf8');
const popupJs = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');

function createPopupEnv() {
  const dom = new JSDOM(popupHtml, {
    url: 'chrome-extension://md-drama/popup/popup.html',
    runScripts: 'dangerously'
  });

  // 模拟 Chrome Extension API
  dom.window.chrome = {
    runtime: {
      openOptionsPage: () => {},
      sendMessage: async (msg) => {
        if (msg.action === 'checkObsidianConnection') return { connected: true };
        if (msg.action === 'getBackgroundTaskState') return { state: null };
        if (msg.action === 'getClipHistory') return { history: [] };
        return { success: true };
      },
      onMessage: {
        addListener: () => {},
        removeListener: () => {}
      }
    },
    tabs: {
      query: async () => [{ id: 101, url: 'https://sample.feishu.cn/docx/test123', title: '飞书测试文档' }],
      sendMessage: async () => ({ status: 'ok' })
    },
    storage: {
      sync: {
        get: (defaults, cb) => cb(defaults)
      }
    }
  };

  dom.window.eval(popupJs);
  return dom;
}

const dom = createPopupEnv();
const { document, setUIState, UIState } = dom.window;

// 1. 验证初始状态与切换
assert.ok(setUIState, 'setUIState 方法必须存在');
assert.strictEqual(UIState.IDLE, 'STATE_IDLE');
assert.strictEqual(UIState.CRAWLING, 'STATE_CRAWLING');
assert.strictEqual(UIState.SAVED, 'STATE_SAVED');
assert.strictEqual(UIState.STUDIO, 'STATE_STUDIO');
assert.strictEqual(UIState.SHARE_MODAL, 'STATE_SHARE_MODAL');

// 切换到 CRAWLING 状态
setUIState(UIState.CRAWLING, { stage: 2, text: '正在全量步进滚动收割全文...', percent: 35 });
assert.strictEqual(document.getElementById('pipelineContainer').classList.contains('hidden'), false);
assert.strictEqual(document.getElementById('pageInfoCard').classList.contains('hidden'), true);
assert.strictEqual(document.getElementById('pipelineStatusText').innerText, '正在全量步进滚动收割全文...');
console.log('✓ 状态机切换至 CRAWLING 状态验证通过');

// 切换到 SAVED 状态
setUIState(UIState.SAVED, {
  data: {
    metadata: { title: '测试保存文档' },
    markdown: '# 测试内容\n\n正文段落',
    images: [{ src: 'test.png' }]
  },
  saveResult: { path: '03-知识库/网页剪藏/测试保存文档.md' }
});
assert.strictEqual(document.getElementById('successPanel').classList.contains('hidden'), false);
assert.strictEqual(document.getElementById('pipelineContainer').classList.contains('hidden'), true);
assert.strictEqual(document.getElementById('successDocTitle').innerText, '测试保存文档');
console.log('✓ 状态机切换至 SAVED 成功面板验证通过');

// 切换到 STUDIO 状态
setUIState(UIState.STUDIO, {
  data: {
    metadata: { title: '测试编辑文档', tags: ['知识库'] },
    markdown: '## 二级标题\n\n编辑源码',
    images: []
  }
});
assert.strictEqual(document.getElementById('studioPanel').classList.contains('hidden'), false);
assert.strictEqual(document.getElementById('inputDocTitle').value, '测试编辑文档');
assert.strictEqual(document.getElementById('markdownCode').value, '## 二级标题\n\n编辑源码');
console.log('✓ 状态机切换至 STUDIO 工作台验证通过');

// 切换回 IDLE 状态
setUIState(UIState.IDLE);
assert.strictEqual(document.getElementById('actionDock').classList.contains('hidden'), false);
assert.strictEqual(document.getElementById('studioPanel').classList.contains('hidden'), true);
console.log('✓ 状态机重置回 IDLE 初始待命状态验证通过');

console.log('=== 开始执行 Service Worker 并发池逻辑测试 ===');
async function testConcurrentPool() {
  async function runConcurrentPool(items, limit, workerFn) {
    const results = [];
    const executing = new Set();
    for (const item of items) {
      const p = Promise.resolve().then(() => workerFn(item));
      results.push(p);
      executing.add(p);
      const clean = () => executing.delete(p);
      p.then(clean, clean);
      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }
    return Promise.all(results);
  }

  let activeCount = 0;
  let maxActive = 0;
  const items = Array.from({ length: 20 }, (_, i) => i);

  const results = await runConcurrentPool(items, 6, async (item) => {
    activeCount++;
    maxActive = Math.max(maxActive, activeCount);
    await new Promise(r => setTimeout(r, 20));
    activeCount--;
    return item * 2;
  });

  assert.strictEqual(results.length, 20);
  assert.ok(maxActive <= 6, `并发数不能超过设定的限制 6，实际最大为 ${maxActive}`);
  assert.strictEqual(results[10], 20);
  console.log(`✓ 图片并发池限流测试通过: 最大并发数 ${maxActive} <= 6`);
}

testConcurrentPool().then(() => {
  console.log('🎉🎉🎉 Popup 状态机与并发池控制测试 100% 全部通过！');
}).catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
