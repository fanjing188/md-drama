# PRD 规范：md抓吗 (MD-Drama) - 智能网页内容深度抓取与排版 Chrome 插件

## 1. 产品定位与核心目标
**md抓吗 (MD-Drama)** 是一款专为高效知识管理设计的 Chrome 浏览器扩展（Manifest V3）。解决复杂动态网页（飞书文档、生财有术、微信公众号、知乎、语雀、Notion 等）由于**虚拟滚动、懒加载、嵌套结构及图片反爬防盗链**导致的内容无法完整保存到 Markdown 的痛点。实现从“一键深度加载 -> 智能正文清洗与排版 -> 图片资源本地化 -> 直连 Obsidian 仓库”的完整闭环。

---

## 2. 核心功能与技术规范

### 2.1 6 阶段通用解析流水线 (Pipeline Engine)
1. **DOM 语义重塑 (Transformers)**：
   - **Mermaid 流程图还原**：原生还原为 ````mermaid` 可编辑代码块；
   - **代码 Diff 差异高亮**：还原为 ````diff` 语法；
   - **KaTeX / MathJax 公式**：还原为 `$formula$` 与 `$$formula$$`；
   - **代码块去噪**：剔除复制按钮与行号列，提取语言标记；
   - **Flex/Grid 伪表格重构**：自动探测并重构为标准 HTML Table 进而转为 GFM 表格；
   - **CSS 背景图修复**：自动识别 `background-image` 转为标准 `<img>`；
   - **Shadow DOM 穿透**：遍历提取 Web Components 内部内容。
2. **文本清洗与去噪 (Content Cleaner)**：
   - 过滤点赞、关注、在看、打赏、一键三连等营销套话；
   - 过滤“话不多说直接进入正题”等过渡废话；
   - 清理多余空行与无内容引用块。
3. **排版平滑与增强**：
   - 中英文盘古排版空格优化；
   - 标题层级平滑（文内从 H2 阶梯式递增）；
   - 关键词自动双链注入 (`[[WikiLinks]]`)。

### 2.2 智能懒加载与全量内容探测 (Auto-Scroll & Lazy-Loading)
1. 自动探测全局 `window` 或局部滚动容器（如飞书 `.bear-web-editor`、生财有术 `.topic-list`）；
2. 渐进式平滑滚动，检测 DOM 变动与图片加载状态，连续 3 次高度未变自动判定完成；
3. 支持随时手动停止并立即解析已加载内容。

### 2.3 图片与多媒体本地化处理 (Asset Localization)
1. 提取图片后注入独立段落排版（`\n\n![alt](attachments/xxx.png)\n\n`）；
2. Background Service Worker 并发绕过 Referer 限制下载原图；
3. 飞书官方永久流地址直解，彻底消除 blob URL 过期失效；
4. Canvas 动态图表自动转为 PNG 静态图片并归档。

### 2.4 Obsidian 仓库直连与离线韧性 (Obsidian Integration)
1. **Obsidian Local REST API**：秒级后台静默写入 Markdown 与二进制图片；
2. **智能域名分流 (Domain Routing)**：按预设规则自动归档到对应子目录；
3. **离线草稿箱 (Sync Queue)**：断网或 Obsidian 离线时自动暂存并支持恢复后重试补写。

### 2.5 交互与设计美学 (UI / UX)
1. 简白高级高端设计风格（Apple / Linear 纯白极简美学）；
2. 5 阶段极简动态节点指示器（带呼吸微动效与实时进度联动）；
3. 专注核心剪藏与排版，精简冗余批注板块；
4. 交互式标签芯片管理与 Markdown 实时源码/效果双视图；
5. 轻量划选即存气泡与全局静默快捷键（`Alt+Shift+S`）。

---

## 3. 验收与质量门 (Quality Gates)
* **长文档验收**：飞书文档、生财长贴完整加载并准确排版；
* **复杂元素验收**：Mermaid、Diff、LaTeX、伪表格无损还原；
* **测试通过率**：全套自动化测试套件执行通过率 100%。
