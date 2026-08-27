// content/adapters/shengcai.js - 生财有术/知识星球动态与长贴解析 Adapter

class ShengcaiAdapter {
  static get name() { return 'Shengcai'; }

  static matches(url) {
    return /zsxq\.com|shengcaiyoushu\.com/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('.topic-title') ||
                    document.querySelector('.title') ||
                    document.querySelector('.topic-content-title') ||
                    document.querySelector('.post-title');
    const authorEl = document.querySelector('.author-name') ||
                     document.querySelector('.name') ||
                     document.querySelector('.username') ||
                     document.querySelector('.talk-item-author');
    const timeEl = document.querySelector('.time') ||
                   document.querySelector('.date') ||
                   document.querySelector('.create-time') ||
                   document.querySelector('.talk-item-time');

    const readText = (el) => (el ? (el.textContent || '').trim() : '');

    let title = readText(titleEl);
    if (!title) {
      // 动态帖子通常没有独立标题，取正文前 25 字作为标题
      const contentEl = document.querySelector('.topic-text, .content, .talk-content, .text');
      const snippet = contentEl ? (contentEl.textContent || '').replace(/\s+/g, ' ').trim() : '';
      if (snippet) {
        title = snippet.slice(0, 30);
      }
    }
    if (!title) title = document.title || '生财有术精华帖';

    const author = readText(authorEl) || '生财圈友';
    const date = readText(timeEl) || new Date().toISOString().split('T')[0];

    return {
      title: title.trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 50),
      author: author.trim(),
      date: date.trim(),
      source: window.location.href,
      tags: ['生财有术', '社群精华']
    };
  }

  static extractContent() {
    const mainPost = document.querySelector('.topic-detail') ||
                     document.querySelector('.topic-container') ||
                     document.querySelector('.detail-container') ||
                     document.querySelector('.talk-container') ||
                     document.querySelector('.topic-card') ||
                     document.querySelector('.topic-item');

    if (!mainPost) {
      return GenericAdapter.extractContent();
    }

    const container = mainPost.cloneNode(true);

    // 展开所有可能被折叠的全文与按钮
    container.querySelectorAll('.show-more, .expand-btn, .open-btn, .read-more, .fold-mask').forEach(btn => btn.remove());

    // 解析并提取高清图片 (优先取 data-origin-src / data-original)
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('data-origin-src') ||
                      img.getAttribute('data-original') ||
                      img.getAttribute('data-large-url') ||
                      img.getAttribute('data-src') ||
                      img.getAttribute('data-actualsrc') ||
                      img.src;
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    });

    // 处理文件附件
    container.querySelectorAll('.file-item, .file-attachment, .attachment-wrapper').forEach(fileEl => {
      const fileName = (fileEl.querySelector('.file-name, .name')?.textContent || fileEl.textContent || '').trim();
      const fileLink = fileEl.querySelector('a')?.getAttribute('href') || '#';
      if (fileName) {
        const link = document.createElement('p');
        link.innerHTML = `📎 <strong>附件</strong>: <a href="${fileLink}">${fileName}</a>`;
        fileEl.parentNode.replaceChild(link, fileEl);
      }
    });

    // 处理评论区结构
    const comments = Array.from(container.querySelectorAll('.comment-item, .reply-item, .comment-cell'));
    if (comments.length > 0) {
      const commentSection = document.createElement('div');
      commentSection.innerHTML = '<hr/><h3>精选与互动评论</h3>';
      comments.forEach(comment => {
        const commenter = (comment.querySelector('.commenter-name, .author, .name')?.textContent || '').trim() || '圈友';
        const commentContent = (comment.querySelector('.comment-text, .content, .text')?.innerHTML || comment.innerHTML || '').trim();
        const commentDiv = document.createElement('blockquote');
        commentDiv.innerHTML = `<strong>@${commenter}</strong>: ${commentContent}`;
        commentSection.appendChild(commentDiv);
        comment.remove();
      });
      container.appendChild(commentSection);
      // 移除评论容器外部包装
      container.querySelectorAll('.comments, .comment-list, .reply-list, .comment-group').forEach(el => el.remove());
    }

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.ShengcaiAdapter = ShengcaiAdapter;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ShengcaiAdapter };
}
