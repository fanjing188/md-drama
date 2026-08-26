// content/pipeline/transformers.js - 通用复杂结构 DOM 重塑器

class TransformersRegistry {
  constructor() {
    this.transformers = [];
    this.registerDefaultTransformers();
  }

  register(transformer) {
    this.transformers.push(transformer);
  }

  // 1. 数学公式还原 (KaTeX & MathJax)
  registerDefaultTransformers() {
    this.register({
      name: 'math-formula-restorer',
      match: (node) => {
        return node.classList && (
          node.classList.contains('katex') ||
          node.classList.contains('MathJax') ||
          node.classList.contains('math-inline') ||
          node.classList.contains('math-block') ||
          node.hasAttribute('data-math')
        );
      },
      transform: (node) => {
        // 查找原始 TeX 标注
        let tex = node.getAttribute('data-math') ||
                  node.getAttribute('data-latex') ||
                  node.querySelector('annotation[encoding*="tex"]')?.textContent ||
                  node.querySelector('script[type*="math/tex"]')?.textContent;

        if (tex) {
          tex = tex.trim();
          const span = document.createElement('span');
          const isBlock = node.classList.contains('math-block') || node.classList.contains('katex-display') || node.tagName === 'DIV';
          span.textContent = isBlock ? `\n\n$$ ${tex} $$\n\n` : ` $${tex}$ `;
          node.parentNode.replaceChild(span, node);
        }
      }
    });

    // 2. 代码块去噪（移除复制按钮、行号）
    this.register({
      name: 'code-block-normalizer',
      match: (node) => {
        return node.tagName === 'PRE' || (node.classList && (node.classList.contains('highlight') || node.classList.contains('code-block')));
      },
      transform: (node) => {
        // 移除行号列
        const lineNumbers = node.querySelectorAll('.line-numbers, .linenumber, .line-num, .gutter, .hljs-ln-numbers, .copy-code-btn, .code-copy-button');
        lineNumbers.forEach(el => el.remove());

        // 提取语言标记
        const codeEl = node.querySelector('code') || node;
        let lang = '';
        const classNames = (codeEl.className + ' ' + node.className).split(/\s+/);
        for (const cls of classNames) {
          const match = cls.match(/(?:language-|lang-)(\w+)/i);
          if (match) {
            lang = match[1];
            break;
          }
        }
        if (lang) {
          node.setAttribute('data-lang', lang);
        }
      }
    });

    // 3. Flex/Grid 伪表格重构为标准 HTML Table
    this.register({
      name: 'pseudo-table-reconstructor',
      match: (node) => {
        if (!node.classList) return false;
        return node.classList.contains('grid-table') || 
               node.classList.contains('virtual-table') ||
               (node.hasAttribute('role') && node.getAttribute('role') === 'table');
      },
      transform: (node) => {
        const rows = node.querySelectorAll('.grid-row, .table-row, [role="row"]');
        if (rows.length === 0) return;

        const table = document.createElement('table');
        const tbody = document.createElement('tbody');

        rows.forEach((row, rIndex) => {
          const tr = document.createElement('tr');
          const cells = row.querySelectorAll('.grid-cell, .table-cell, [role="cell"], [role="columnheader"]');
          cells.forEach(cell => {
            const cellTag = (rIndex === 0 || cell.getAttribute('role') === 'columnheader') ? 'th' : 'td';
            const td = document.createElement(cellTag);
            td.innerHTML = cell.innerHTML.trim();
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        node.parentNode.replaceChild(table, node);
      }
    });

    // 4. 修复 CSS background-image 为真实 <img>
    this.register({
      name: 'background-image-restorer',
      match: (node) => {
        if (node.tagName === 'IMG' || node.tagName === 'BODY') return false;
        const bg = node.style && node.style.backgroundImage;
        return bg && bg.includes('url(');
      },
      transform: (node) => {
        const bg = node.style.backgroundImage;
        const match = bg.match(/url\(['"]?(.*?)['"]?\)/);
        if (match && match[1] && !node.querySelector('img')) {
          const img = document.createElement('img');
          img.src = match[1];
          img.alt = 'embedded-image';
          node.appendChild(img);
        }
      }
    });

    // 5. 提示块/Callout 语义转换
    this.register({
      name: 'callout-block-normalizer',
      match: (node) => {
        if (!node.classList) return false;
        return node.classList.contains('callout') ||
               node.classList.contains('alert') ||
               node.classList.contains('admonition') ||
               node.classList.contains('notice-block');
      },
      transform: (node) => {
        const bq = document.createElement('blockquote');
        bq.innerHTML = `<strong>[!NOTE]</strong>\n${node.innerHTML}`;
        node.parentNode.replaceChild(bq, node);
      }
    });
  }

  // 递归处理 DOM 树
  apply(root) {
    if (!root) return;

    for (const transformer of this.transformers) {
      // 遍历匹配
      const candidates = Array.from(root.querySelectorAll('*')).filter(el => transformer.match(el));
      if (transformer.match(root)) candidates.unshift(root);

      for (const el of candidates) {
        try {
          transformer.transform(el);
        } catch (err) {
          console.warn(`Transformer [${transformer.name}] error:`, err);
        }
      }
    }
    return root;
  }
}

if (typeof window !== 'undefined') {
  window.TransformersRegistry = TransformersRegistry;
}
