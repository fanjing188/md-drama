// content/adapters/utils.js - 适配器公共工具库与元数据清洗规范

class AdapterUtils {
  // 清洗标题与文件名：剥离所有不可见字符、控制字符、行分隔符，过滤操作系统非法文件名字符
  static cleanTitle(rawTitle = '', fallback = '未命名文档') {
    if (!rawTitle || typeof rawTitle !== 'string') return fallback;

    // 剥离 Unicode 格式控制字符 (p{Cf})、行分隔符 (u2028/u2029)、零宽字符与 BOM
    let title = rawTitle.replace(new RegExp('[\\p{Cf}\\u2028\\u2029\\u200B\\u200C\\u200D\\uFEFF]', 'gu'), '');

    // 剥离多余连续空白符
    title = title.replace(/\s+/g, ' ').trim();

    // 剥离操作系统文件系统非法保留字符: / \ ? % * : | " < >
    title = title.replace(/[/\\?%*:|"<>]/g, '-').replace(/--+/g, '-').trim();

    if (!title || title === '-') return fallback;
    return title.slice(0, 120);
  }

  // 规范化发布日期为 YYYY-MM-DD
  static cleanDate(rawDate = '') {
    if (!rawDate || typeof rawDate !== 'string') {
      return new Date().toISOString().split('T')[0];
    }
    const trimmed = rawDate.trim();
    // 匹配 YYYY-MM-DD
    const match = trimmed.match(/(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})/);
    if (match) {
      const year = match[1];
      const month = match[2].padStart(2, '0');
      const day = match[3].padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return trimmed.slice(0, 10) || new Date().toISOString().split('T')[0];
  }

  // 统一清洗与格式化元数据
  static cleanMetadata(rawMeta = {}) {
    const title = AdapterUtils.cleanTitle(rawMeta.title, '未命名文档');
    const author = (rawMeta.author || '').replace(new RegExp('[\\p{Cf}\\u2028\\u2029\\u200B\\u200C\\u200D\\uFEFF]', 'gu'), '').trim();
    const date = AdapterUtils.cleanDate(rawMeta.date);
    const source = rawMeta.source || (typeof window !== 'undefined' ? window.location?.href : '');
    const tags = Array.isArray(rawMeta.tags) ? rawMeta.tags.filter(Boolean) : ['web-clip'];

    return {
      title,
      author: author || '网络作者',
      date,
      source,
      tags
    };
  }

  // 统一检测与提取图片最佳真实源地址（穿透 12+ 种主流平台懒加载属性）
  static detectImageSrc(el) {
    if (!el) return '';

    const attrs = [
      'data-origin-src',
      'data-original',
      'data-actualsrc',
      'data-src-large',
      'data-large-url',
      'data-src',
      'data-url',
      'data-image-src',
      'data-lazy-src',
      'data-asset-url',
      'data-raw-src',
      'src'
    ];

    function isValid(val) {
      if (!val || typeof val !== 'string') return false;
      val = val.trim();
      if (!val) return false;
      if (val.startsWith('data:image/svg') || val.startsWith('data:image/gif')) return false;
      if (val.startsWith('data:image/') && val.length < 300) return false;
      if (val.startsWith('blob:')) return false;
      if (val.includes('blank.gif') || val.includes('spacer.gif') || val.includes('placeholder')) return false;
      return true;
    }

    for (const attr of attrs) {
      const val = el.getAttribute ? el.getAttribute(attr) : null;
      if (isValid(val)) return val.trim();
    }

    if (el.tagName === 'IMG' && el.parentElement) {
      for (const attr of attrs) {
        const val = el.parentElement.getAttribute ? el.parentElement.getAttribute(attr) : null;
        if (isValid(val)) return val.trim();
      }
    }

    const style = el.getAttribute ? el.getAttribute('style') || '' : '';
    const bgMatch = style.match(/background-image\s*:\s*url\(['"]?(.*?)['"]?\)/i);
    if (bgMatch && isValid(bgMatch[1])) return bgMatch[1].trim();

    return '';
  }

  // 统一将容器内部的相对 URL 转换为绝对 URL
  static resolveAbsoluteUrls(container, baseUrl = '') {
    if (!container || typeof document === 'undefined') return;
    const base = baseUrl || (typeof window !== 'undefined' ? window.location?.href : '');
    if (!base) return;

    // 处理图片 src
    container.querySelectorAll('img[src], image[href]').forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('href');
      if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('data:')) {
        try {
          const abs = new URL(src, base).href;
          if (img.hasAttribute('src')) img.setAttribute('src', abs);
          if (img.hasAttribute('href')) img.setAttribute('href', abs);
        } catch (e) {}
      }
    });

    // 处理链接 href
    container.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('mailto:') && !href.startsWith('#')) {
        try {
          a.setAttribute('href', new URL(href, base).href);
        } catch (e) {}
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.AdapterUtils = AdapterUtils;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AdapterUtils };
}
