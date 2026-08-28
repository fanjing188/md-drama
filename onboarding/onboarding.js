// onboarding/onboarding.js - MD抓吗 新手配置向导逻辑

document.addEventListener('DOMContentLoaded', async () => {
  let currentStep = 1;
  const totalSteps = 4;

  // DOM 元素引用
  const stepPanels = [
    document.getElementById('stepPanel1'),
    document.getElementById('stepPanel2'),
    document.getElementById('stepPanel3'),
    document.getElementById('stepPanel4')
  ];

  const stepItems = document.querySelectorAll('.step-item');
  const btnPrev = document.getElementById('btnPrevStep');
  const btnNext = document.getElementById('btnNextStep');
  const btnFinish = document.getElementById('btnFinish');
  const btnCloseWizard = document.getElementById('btnCloseWizard');
  const stepCounter = document.getElementById('stepCounter');

  // 配置项元素
  const syncMethodSelect = document.getElementById('obsidianSyncMethod');
  const restApiConfigBox = document.getElementById('restApiConfigBox');
  const restApiPort = document.getElementById('restApiPort');
  const restApiToken = document.getElementById('restApiToken');
  const restApiHttps = document.getElementById('restApiHttps');
  const btnTestRestApi = document.getElementById('btnTestRestApi');
  const testApiResult = document.getElementById('testApiResult');
  const vaultSavePath = document.getElementById('vaultSavePath');
  const attachmentFolder = document.getElementById('attachmentFolder');
  const autoSaveDirectly = document.getElementById('autoSaveDirectly');

  const enableSelectionBubble = document.getElementById('enableSelectionBubble');
  const selectionSaveMode = document.getElementById('selectionSaveMode');
  const appendPathConfigBox = document.getElementById('appendPathConfigBox');
  const selectionAppendFilePath = document.getElementById('selectionAppendFilePath');

  const enableCleaning = document.getElementById('enableCleaning');
  const removeNoiseWords = document.getElementById('removeNoiseWords');
  const removeRedundantBlankLines = document.getElementById('removeRedundantBlankLines');
  const imageHandling = document.getElementById('imageHandling');
  const includeFrontmatter = document.getElementById('includeFrontmatter');
  const enableCallouts = document.getElementById('enableCallouts');

  const saveSuccessAlert = document.getElementById('saveSuccessAlert');

  // 1. 读取已有配置填充表单
  if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(null, (items) => {
      if (items.obsidianSyncMethod) syncMethodSelect.value = items.obsidianSyncMethod;
      if (items.restApiPort) restApiPort.value = items.restApiPort;
      if (items.restApiToken) restApiToken.value = items.restApiToken;
      if (items.restApiHttps !== undefined) restApiHttps.checked = items.restApiHttps;
      if (items.vaultSavePath) vaultSavePath.value = items.vaultSavePath;
      if (items.attachmentFolder) attachmentFolder.value = items.attachmentFolder;
      if (items.autoSaveDirectly !== undefined) autoSaveDirectly.checked = items.autoSaveDirectly;

      if (items.enableSelectionBubble !== undefined) enableSelectionBubble.checked = items.enableSelectionBubble;
      if (items.selectionSaveMode) selectionSaveMode.value = items.selectionSaveMode;
      if (items.selectionAppendFilePath) selectionAppendFilePath.value = items.selectionAppendFilePath;

      if (items.enableCleaning !== undefined) enableCleaning.checked = items.enableCleaning;
      if (items.removeNoiseWords !== undefined) removeNoiseWords.checked = items.removeNoiseWords;
      if (items.removeRedundantBlankLines !== undefined) removeRedundantBlankLines.checked = items.removeRedundantBlankLines;
      if (items.imageHandling) imageHandling.value = items.imageHandling;
      if (items.includeFrontmatter !== undefined) includeFrontmatter.checked = items.includeFrontmatter;
      if (items.enableCallouts !== undefined) enableCallouts.checked = items.enableCallouts;

      toggleSubBoxes();
    });
  }

  // 2. 表单子项动态显隐切换
  syncMethodSelect.addEventListener('change', toggleSubBoxes);
  selectionSaveMode.addEventListener('change', toggleSubBoxes);

  function toggleSubBoxes() {
    if (syncMethodSelect.value === 'rest_api') {
      restApiConfigBox.classList.remove('hidden');
    } else {
      restApiConfigBox.classList.add('hidden');
    }

    if (selectionSaveMode.value === 'append_file') {
      appendPathConfigBox.classList.remove('hidden');
    } else {
      appendPathConfigBox.classList.add('hidden');
    }
  }

  // 3. 测试 Obsidian REST API 连通性
  if (btnTestRestApi) {
    btnTestRestApi.addEventListener('click', async () => {
      const port = parseInt(restApiPort.value, 10) || 27123;
      const token = restApiToken.value.trim();
      const isHttps = restApiHttps.checked;

      if (!token) {
        testApiResult.className = 'test-result-strip error';
        testApiResult.innerText = '❌ 请先输入 Obsidian REST API Token / Key';
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
          testApiResult.className = 'test-result-strip success';
          testApiResult.innerText = res.message || '✓ 成功连接到 Obsidian Local REST API！';
        } else {
          testApiResult.className = 'test-result-strip error';
          testApiResult.innerText = `❌ 连接失败: ${res?.message || '请确认 Obsidian 已打开且插件已启用'}`;
        }
        testApiResult.classList.remove('hidden');
      });
    });
  }

  // 4. 步骤切换与渲染逻辑
  function updateStepView(targetStep) {
    currentStep = targetStep;

    // 更新指示器 (Stepper)
    stepItems.forEach((item, index) => {
      const stepIdx = index + 1;
      item.classList.remove('active', 'completed');
      if (stepIdx === currentStep) {
        item.classList.add('active');
      } else if (stepIdx < currentStep) {
        item.classList.add('completed');
      }
    });

    // 切换卡片面板
    stepPanels.forEach((panel, index) => {
      if (index + 1 === currentStep) {
        panel.classList.remove('hidden');
        panel.classList.add('active');
      } else {
        panel.classList.add('hidden');
        panel.classList.remove('active');
      }
    });

    // 计数与按钮状态
    stepCounter.innerText = `第 ${currentStep} / ${totalSteps} 步`;
    btnPrev.disabled = (currentStep === 1);

    if (currentStep === totalSteps) {
      renderSummary();
      btnNext.classList.add('hidden');
      if (!saveSuccessAlert.classList.contains('hidden')) {
        btnCloseWizard.classList.remove('hidden');
        btnFinish.classList.add('hidden');
      } else {
        btnFinish.classList.remove('hidden');
        btnCloseWizard.classList.add('hidden');
      }
    } else {
      btnNext.classList.remove('hidden');
      btnFinish.classList.add('hidden');
      btnCloseWizard.classList.add('hidden');
    }
  }

  // 5. 渲染第 4 步汇总摘要
  function renderSummary() {
    const isRest = syncMethodSelect.value === 'rest_api';
    document.getElementById('summarySyncMode').innerText = isRest ? 'Obsidian Local REST API (直连)' : '本地下载目录直接导出';
    document.getElementById('summaryVaultPath').innerText = vaultSavePath.value.trim() || '03-知识库/网页剪藏';

    const isAppend = selectionSaveMode.value === 'append_file';
    document.getElementById('summarySelectionMode').innerText = isAppend ? `追加至: ${selectionAppendFilePath.value.trim()}` : '保存为独立新文档';

    const imgStrategy = imageHandling.value;
    document.getElementById('summaryImageMode').innerText = imgStrategy === 'download' ? '全量并发下载至附件目录' : (imgStrategy === 'external' ? '保留原始外链' : 'Base64 内联');

    const hasCleaning = enableCleaning.checked || removeNoiseWords.checked;
    document.getElementById('summaryCleaning').innerText = hasCleaning ? '已开启 (智能去噪与话术过滤)' : '未开启 (保留原始文本)';
  }

  // 6. 按钮事件绑定
  btnPrev.addEventListener('click', () => {
    if (currentStep > 1) {
      updateStepView(currentStep - 1);
    }
  });

  btnNext.addEventListener('click', () => {
    if (currentStep < totalSteps) {
      updateStepView(currentStep + 1);
    }
  });

  // 支持直接点击步骤指示器切换
  stepItems.forEach(item => {
    item.addEventListener('click', () => {
      const stepIdx = parseInt(item.getAttribute('data-step'), 10);
      if (stepIdx) {
        updateStepView(stepIdx);
      }
    });
  });

  // 7. 保存配置并生效
  btnFinish.addEventListener('click', () => {
    const newSettings = {
      obsidianSyncMethod: syncMethodSelect.value,
      restApiPort: parseInt(restApiPort.value, 10) || 27123,
      restApiToken: restApiToken.value.trim(),
      restApiHttps: restApiHttps.checked,
      vaultSavePath: vaultSavePath.value.trim() || '03-知识库/网页剪藏',
      attachmentFolder: attachmentFolder.value.trim() || 'attachments',
      autoSaveDirectly: autoSaveDirectly.checked,

      enableSelectionBubble: enableSelectionBubble.checked,
      selectionSaveMode: selectionSaveMode.value,
      selectionAppendFilePath: selectionAppendFilePath.value.trim() || '03-知识库/网页剪藏/每日摘录.md',

      enableCleaning: enableCleaning.checked,
      removeNoiseWords: removeNoiseWords.checked,
      removeRedundantBlankLines: removeRedundantBlankLines.checked,
      imageHandling: imageHandling.value,
      includeFrontmatter: includeFrontmatter.checked,
      enableCallouts: enableCallouts.checked,
      hasCompletedOnboarding: true
    };

    btnFinish.disabled = true;
    btnFinish.innerText = '💾 保存中...';

    chrome.storage.sync.set(newSettings, () => {
      btnFinish.disabled = false;
      saveSuccessAlert.classList.remove('hidden');
      btnFinish.classList.add('hidden');
      btnCloseWizard.classList.remove('hidden');
    });
  });

  // 8. 关闭向导页面
  btnCloseWizard.addEventListener('click', () => {
    window.close();
  });
});
