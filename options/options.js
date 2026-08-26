// options/options.js

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('settingsForm');
  const syncMethodSelect = document.getElementById('obsidianSyncMethod');
  const restApiConfig = document.getElementById('restApiConfig');
  const saveStatus = document.getElementById('saveStatus');

  // 读取已保存的设置
  chrome.storage.sync.get(null, (items) => {
    if (items.obsidianSyncMethod) syncMethodSelect.value = items.obsidianSyncMethod;
    if (items.restApiPort) document.getElementById('restApiPort').value = items.restApiPort;
    if (items.restApiToken) document.getElementById('restApiToken').value = items.restApiToken;
    if (items.restApiHttps !== undefined) document.getElementById('restApiHttps').checked = items.restApiHttps;
    if (items.vaultSavePath) document.getElementById('vaultSavePath').value = items.vaultSavePath;
    if (items.attachmentFolder) document.getElementById('attachmentFolder').value = items.attachmentFolder;
    if (items.imageHandling) document.getElementById('imageHandling').value = items.imageHandling;
    if (items.includeFrontmatter !== undefined) document.getElementById('includeFrontmatter').checked = items.includeFrontmatter;
    if (items.enableCallouts !== undefined) document.getElementById('enableCallouts').checked = items.enableCallouts;

    toggleRestApiVisibility();
  });

  syncMethodSelect.addEventListener('change', toggleRestApiVisibility);

  function toggleRestApiVisibility() {
    if (syncMethodSelect.value === 'rest_api') {
      restApiConfig.style.display = 'block';
    } else {
      restApiConfig.style.display = 'none';
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const newSettings = {
      obsidianSyncMethod: syncMethodSelect.value,
      restApiPort: parseInt(document.getElementById('restApiPort').value, 10) || 27124,
      restApiToken: document.getElementById('restApiToken').value.trim(),
      restApiHttps: document.getElementById('restApiHttps').checked,
      vaultSavePath: document.getElementById('vaultSavePath').value.trim() || '03-知识库/网页剪藏',
      attachmentFolder: document.getElementById('attachmentFolder').value.trim() || 'attachments',
      imageHandling: document.getElementById('imageHandling').value,
      includeFrontmatter: document.getElementById('includeFrontmatter').checked,
      enableCallouts: document.getElementById('enableCallouts').checked
    };

    chrome.storage.sync.set(newSettings, () => {
      saveStatus.innerText = '✅ 设置已成功保存！';
      setTimeout(() => {
        saveStatus.innerText = '';
      }, 2500);
    });
  });
});
