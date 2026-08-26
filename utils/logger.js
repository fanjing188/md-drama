// utils/logger.js - 统一分级日志与运行跟踪系统

class DramaLogger {
  constructor(moduleName = 'Core') {
    this.moduleName = moduleName;
    this.maxLogs = 200;
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    return {
      timestamp,
      level,
      module: this.moduleName,
      message,
      data: data ? (typeof data === 'object' ? JSON.stringify(data) : data) : null
    };
  }

  async appendLog(logEntry) {
    console.log(`[${logEntry.timestamp}] [${logEntry.level}] [${logEntry.module}] ${logEntry.message}`, logEntry.data || '');
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const { system_logs = [] } = await chrome.storage.local.get('system_logs');
        system_logs.unshift(logEntry);
        if (system_logs.length > this.maxLogs) {
          system_logs.length = this.maxLogs;
        }
        await chrome.storage.local.set({ system_logs });
      }
    } catch (e) {
      // 容错处理
    }
  }

  info(message, data) {
    return this.appendLog(this.formatMessage('INFO', message, data));
  }

  warn(message, data) {
    return this.appendLog(this.formatMessage('WARN', message, data));
  }

  error(message, data) {
    return this.appendLog(this.formatMessage('ERROR', message, data));
  }

  static async getRecentLogs() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const { system_logs = [] } = await chrome.storage.local.get('system_logs');
      return system_logs;
    }
    return [];
  }

  static async clearLogs() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ system_logs: [] });
    }
  }
}

if (typeof window !== 'undefined') {
  window.DramaLogger = DramaLogger;
}
if (typeof module !== 'undefined') {
  module.exports = DramaLogger;
}
