// utils/sync-queue.js - 离线草稿箱与自动补写队列管理器

class SyncQueueManager {
  static async enqueueDraft(draft) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    try {
      const { offline_drafts = [] } = await chrome.storage.local.get('offline_drafts');
      draft.id = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      draft.createdAt = new Date().toLocaleString('zh-CN');
      offline_drafts.unshift(draft);
      await chrome.storage.local.set({ offline_drafts });
      return draft.id;
    } catch (e) {
      console.error('入队草稿箱失败:', e);
    }
  }

  static async getDrafts() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return [];
    const { offline_drafts = [] } = await chrome.storage.local.get('offline_drafts');
    return offline_drafts;
  }

  static async removeDraft(id) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    const { offline_drafts = [] } = await chrome.storage.local.get('offline_drafts');
    const filtered = offline_drafts.filter(d => d.id !== id);
    await chrome.storage.local.set({ offline_drafts: filtered });
  }

  static async clearAllDrafts() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    await chrome.storage.local.set({ offline_drafts: [] });
  }
}

if (typeof window !== 'undefined') {
  window.SyncQueueManager = SyncQueueManager;
}
if (typeof module !== 'undefined') {
  module.exports = SyncQueueManager;
}
