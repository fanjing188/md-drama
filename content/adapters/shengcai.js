// content/adapters/shengcai.js - 生财有术/知识星球动态与长贴解析 Adapter

class ShengcaiAdapter {
  static matches(url) {
    return /zsxq\.com|shengcaiyoushu\.com/.test(url);
  }

  static getMetadata() {
    const titleEl = document.querySelector('.topic-title') || document.querySelector('.title');
    const authorEl = document.querySelector('.author-name') || document.querySelector('.name');
    const timeEl = document.querySelector('.time') || document.querySelector('.date');

    const title = titleEl ? titleEl.innerText : (document.title || '生财有术精华帖');
    const author = authorEl ? authorEl.innerText : '生财圈友';
    const date = timeEl ? timeEl.innerText : new Date().toISOString().split('T')[0];

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
                     document.querySelector('.detail-container');
    
    if (!mainPost) {
      return GenericAdapter.extractContent();
    }

    const container = mainPost.cloneNode(true);

    // 展开所有可能被折叠的全文
    container.querySelectorAll('.show-more, .expand-btn').forEach(btn => btn.remove());

    // 解析图片
    container.querySelectorAll('img').forEach(img => {
      const realSrc = img.getAttribute('data-src') || 
                     img.getAttribute('data-origin-src') || 
                     img.getAttribute('data-original') || 
                     img.src;
      if (realSrc) {
        img.setAttribute('src', realSrc);
      }
    });

    // 处理评论区结构
    const comments = container.querySelectorAll('.comment-item, .reply-item');
    if (comments.length > 0) {
      const commentSection = document.createElement('div');
      commentSection.innerHTML = '<hr/><h3>精选与互动评论</h3>';
      comments.forEach(comment => {
        const commenter = comment.querySelector('.commenter-name')?.innerText || '圈友';
        const commentContent = comment.querySelector('.comment-text')?.innerHTML || comment.innerHTML;
        const commentDiv = document.createElement('blockquote');
        commentDiv.innerHTML = `<strong>@${commenter}</strong>: ${commentContent}`;
        commentSection.appendChild(commentDiv);
      });
      container.appendChild(commentSection);
    }

    return container;
  }
}

if (typeof window !== 'undefined') {
  window.ShengcaiAdapter = ShengcaiAdapter;
}
