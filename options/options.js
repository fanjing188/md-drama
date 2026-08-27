// options/options.js - MD抓吗 偏好设置管理 (Tab 切换与独立配置)

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm');
  const syncMethodSelect = document.getElementById('obsidianSyncMethod');
  const restApiConfig = document.getElementById('restApiConfig');
  const selectionSaveModeSelect = document.getElementById('selectionSaveMode');
  const appendPathConfig = document.getElementById('appendPathConfig');
  const saveStatus = document.getElementById('saveStatus');

  // 1. Tab 切换逻辑 (点击对应 Tab 只展示对应的内容板块)
  const tabButtons = document.querySelectorAll('.tab-item');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetPanelId = btn.getAttribute('data-tab');

      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => {
        p.classList.remove('active');
        p.classList.add('hidden');
      });

      btn.classList.add('active');
      const targetPanel = document.getElementById(targetPanelId);
      if (targetPanel) {
        targetPanel.classList.remove('hidden');
        targetPanel.classList.add('active');
      }
    });
  });

  // 2. 读取已保存的配置
  chrome.storage.sync.get(null, (items) => {
    // 页面划选相关设置
    if (items.enableSelectionBubble !== undefined) {
      document.getElementById('enableSelectionBubble').checked = items.enableSelectionBubble;
    }
    if (items.selectionSaveMode) {
      selectionSaveModeSelect.value = items.selectionSaveMode;
    }
    if (items.selectionAppendFilePath) {
      document.getElementById('selectionAppendFilePath').value = items.selectionAppendFilePath;
    }

    // Obsidian 基础设置
    if (items.autoSaveDirectly !== undefined) {
      document.getElementById('autoSaveDirectly').checked = items.autoSaveDirectly;
    }
    if (items.obsidianSyncMethod) syncMethodSelect.value = items.obsidianSyncMethod;
    if (items.restApiPort) document.getElementById('restApiPort').value = items.restApiPort;
    if (items.restApiToken) document.getElementById('restApiToken').value = items.restApiToken;
    if (items.restApiHttps !== undefined) document.getElementById('restApiHttps').checked = items.restApiHttps;
    if (items.vaultSavePath) document.getElementById('vaultSavePath').value = items.vaultSavePath;
    if (items.attachmentFolder) document.getElementById('attachmentFolder').value = items.attachmentFolder;
    if (items.imageHandling) document.getElementById('imageHandling').value = items.imageHandling;
    if (items.includeFrontmatter !== undefined) document.getElementById('includeFrontmatter').checked = items.includeFrontmatter;
    if (items.enableCallouts !== undefined) document.getElementById('enableCallouts').checked = items.enableCallouts;
    if (items.enableCleaning !== undefined) document.getElementById('enableCleaning').checked = items.enableCleaning;
    if (items.removeNoiseWords !== undefined) document.getElementById('removeNoiseWords').checked = items.removeNoiseWords;
    if (items.removeRedundantBlankLines !== undefined) document.getElementById('removeRedundantBlankLines').checked = items.removeRedundantBlankLines;
    if (items.customBlacklist && Array.isArray(items.customBlacklist)) {
      document.getElementById('customBlacklist').value = items.customBlacklist.join('\n');
    }

    toggleRestApiVisibility();
    toggleAppendPathVisibility();
  });

  syncMethodSelect.addEventListener('change', toggleRestApiVisibility);
  selectionSaveModeSelect.addEventListener('change', toggleAppendPathVisibility);

  function toggleRestApiVisibility() {
    if (syncMethodSelect.value === 'rest_api') {
      restApiConfig.classList.remove('hidden');
    } else {
      restApiConfig.classList.add('hidden');
    }
  }

  function toggleAppendPathVisibility() {
    if (selectionSaveModeSelect.value === 'append_file') {
      appendPathConfig.classList.remove('hidden');
    } else {
      appendPathConfig.classList.add('hidden');
    }
  }

  // 3. 测试 Obsidian REST API 连通性
  const btnTestRestApi = document.getElementById('btnTestRestApi');
  const testApiResult = document.getElementById('testApiResult');

  if (btnTestRestApi) {
    btnTestRestApi.addEventListener('click', async () => {
      const port = parseInt(document.getElementById('restApiPort').value, 10) || 27124;
      const token = document.getElementById('restApiToken').value.trim();
      const isHttps = document.getElementById('restApiHttps').checked;

      if (!token) {
        testApiResult.className = 'test-api-status error';
        testApiResult.innerText = '❌ 请先输入 Obsidian REST API Token';
        testApiResult.classList.remove('hidden');
        return;
      }

      btnTestRestApi.disabled = true;
      btnTestRestApi.innerText = '⏳ 测试中...';
      testApiResult.classList.add('hidden');

      chrome.runtime.sendMessage({
        action: 'testObsidianRestApi',
        config: {
          restApiPort: port,
          restApiToken: token,
          restApiHttps: isHttps,
          obsidianSyncMethod: 'rest_api'
        }
      }, (res) => {
        btnTestRestApi.disabled = false;
        btnTestRestApi.innerHTML = '<span>⚡ 测试 API 连通性</span>';

        if (res && res.connected) {
          testApiResult.className = 'test-api-status success';
          testApiResult.innerText = res.message || '✓ 成功连接到 Obsidian Local REST API！';
        } else {
          testApiResult.className = 'test-api-status error';
          testApiResult.innerText = `❌ 连接失败: ${res?.message || '未知错误'}`;
        }
        testApiResult.classList.remove('hidden');
      });
    });
  }

  // 4. 表单保存提交
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const newSettings = {
      enableSelectionBubble: document.getElementById('enableSelectionBubble').checked,
      selectionSaveMode: selectionSaveModeSelect.value,
      selectionAppendFilePath: document.getElementById('selectionAppendFilePath').value.trim() || '03-知识库/网页剪藏/每日摘录.md',
      autoSaveDirectly: document.getElementById('autoSaveDirectly').checked,
      obsidianSyncMethod: syncMethodSelect.value,
      restApiPort: parseInt(document.getElementById('restApiPort').value, 10) || 27123,
      restApiToken: document.getElementById('restApiToken').value.trim(),
      restApiHttps: document.getElementById('restApiHttps').checked,
      vaultSavePath: document.getElementById('vaultSavePath').value.trim() || '03-知识库/网页剪藏',
      attachmentFolder: document.getElementById('attachmentFolder').value.trim() || 'attachments',
      imageHandling: document.getElementById('imageHandling').value,
      includeFrontmatter: document.getElementById('includeFrontmatter').checked,
      enableCallouts: document.getElementById('enableCallouts').checked,
      enableCleaning: document.getElementById('enableCleaning').checked,
      removeNoiseWords: document.getElementById('removeNoiseWords').checked,
      removeRedundantBlankLines: document.getElementById('removeRedundantBlankLines').checked,
      customBlacklist: document.getElementById('customBlacklist').value.split('\n').map(s => s.trim()).filter(Boolean)
    };

    chrome.storage.sync.set(newSettings, () => {
      saveStatus.innerText = '👾 设置已成功保存！';
      setTimeout(() => {
        saveStatus.innerText = '';
      }, 2500);
    });
  });
});
