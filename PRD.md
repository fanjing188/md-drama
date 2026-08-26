# PRD：md抓马 (MD-Drama) - 智能网页内容深度抓取与排版 Chrome 插件

## 1. 产品定位与核心目标
**md抓马 (MD-Drama)** 是一款专为高效知识管理设计的 Chrome 浏览器扩展（Manifest V3）。核心解决复杂动态网页（飞书文档、生财有术、微信公众号、知乎、语雀、Notion 等）由于**虚拟滚动、懒加载、嵌套结构及图片反爬防盗链**导致的内容无法完整保存到 Markdown 的痛点。实现从“一键深度加载 -> 智能正文清洗与排版 -> 图片资源本地化 -> 直连 Obsidian 仓库”的完整闭环。

---

## 2. 核心功能与技术规范

### 2.1 智能懒加载与全量内容探测 (Auto-Scroll & Lazy-Loading)
1. **容器智能识别**：自动探测全局 `window` 滚动或局部滚动容器（如飞书文档主视口 `.bear-web-editor`、生财有术动态流容器 `.topic-list` 等）。
2. **渐进式平滑滚动**：
   - 支持设置滚动步长与时间间隔（默认步长 400px，间隔 150ms）。
   - 自动检测 DOM 变动与图片加载状态，若检测到底部或无新 DOM 节点连续 3 次触发判定为加载完毕。
   - 提供手动“立即停止滚动并转换”与“最大滚动深度/超时保护”。
3. **针对性 Adapter 机制**：
   - **飞书/Lark（Doc/Docx/Wiki）**：穿透虚拟 DOM 块，解析 block 节点、公式、高亮块、画板/思维导图缩略图。
   - **生财有术/知识星球**：支持帖子正文、多图轮播展开、精选评论/全部评论递归抓取与层级排版。
   - **微信公众号/知乎/通用网页**：去除冗余广告、推荐流、侧边栏，提取完整正文与代码块。

### 2.2 智能正文排版与 Markdown 转换 (DOM to Clean Markdown)
1. **排版清洗**：
   - 标题层级标准化（H1~H6 规范化）。
   - 代码块语法高亮语言标记与缩进保留。
   - 复杂表格转换（支持合并单元格降级、内联换行处理）。
   - 引用块、Callout 警告块（转为 Obsidian 兼容语法 `> [!note]` 等）。
   - 数学公式保留与标准化（LaTeX 格式 `$formula$` 与 `$$formula$$`）。
2. **YAML Frontmatter 元数据注入**：
   - 自动生成包含 `title`, `url`, `source`, `author`, `date`, `tags` 等元数据。
   - 支持用户自定义 Frontmatter 模板字段。

### 2.3 图片与多媒体本地化处理 (Asset Localization)
1. **懒加载图片完整解析**：支持识别 `data-src`, `data-original`, `data-actualsrc`, `srcset` 等多种懒加载属性。
2. **图片保存策略**：
   - **模式 A（Obsidian 附件归档）**：通过 Background Service Worker 并发下载图片二进制数据，保存到 Obsidian 仓库的 `attachments/` 或指定资源目录下，Markdown 内替换为 Obsidian 标准双链 `![[image-name.png]]` 或相对路径 `![](./attachments/image-name.png)`。
   - **模式 B（保留外链/Base64）**：保留原始可访问 URL 或转换为 Base64 嵌入。
3. **防盗链突破**：通过插件权限绕过 Referer 限制下载原图。

### 2.4 Obsidian 仓库直连与同步 (Obsidian Integration)
1. **同步方式 1：Obsidian Local REST API（推荐）**
   - 通过配置 Local REST API 端口与 API Token，实现静默将 Markdown 文档与图片附件秒级写入指定 Vault 及子目录。
2. **同步方式 2：Obsidian Advanced URI 协议**
   - 支持通过 URI 唤起 Obsidian 创建新笔记。
3. **同步方式 3：Chrome Downloads API 结构化导出**
   - 按照 Obsidian 仓库结构导出 `.md` 文件及配套资源文件夹（可直接解压或保存到本地 iCloud/本地 Vault 路径）。

### 2.5 用户交互界面 (UI / UX)
1. **Popup 弹窗 / SidePanel 侧边栏**：
   - 模式切换：一键快速抓取、全量滚动抓取、选区抓取。
   - 进度指示器：滚动加载中（已加载高度/DOM节点数）-> 图片下载中 (已完成 N/M) -> 转换完毕。
   - Markdown 实时双栏预览（左侧 Markdown 源码/元数据编辑，右侧富文本渲染）。
2. **Settings 配置页**：
   - Obsidian 连接设置（Vault 路径、API Token、默认保存目录规则如 `/03-知识库/网页剪藏/`）。
   - 图片处理与命名规则（时间戳命名、哈希命名、原始文件名）。
   - 预设与自定义站点 Adapter 规则配置。

---

## 3. 技术架构与工程实现

### 3.1 目录结构
```text
md-drama/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   ├── index.js
│   ├── scroller.js
│   ├── extractor.js
│   └── adapters/
│       ├── feishu.js
│       ├── shengcai.js
│       ├── wechat.js
│       └── generic.js
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── lib/
│   ├── turndown.js
│   ├── turndown-plugin-gfm.js
│   └── readability.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

### 3.2 权限声明 (Manifest V3)
```json
{
  "manifest_version": 3,
  "name": "md抓马 (MD-Drama)",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "storage",
    "downloads",
    "scripting"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

---

## 4. 验收要求与质量门 (Quality Gates)
1. **飞书长文档验收**：在包含 20+ 屏、富文本、表格、代码块及多张图片的飞书文档中，成功自动触发滚动并完整抓取正文，无文字断流或缺失。
2. **生财有术/动态流验收**：完整加载长文及底部精选评论，图片正常转存，排版清晰无噪声。
3. **Obsidian 写入验收**：配置 Local REST API 或导出后，.md 能够正确渲染正文且本地图片附件正常展示，无死链。
4. **代码与打包验收**：符合 Chrome Web Store MV3 安全规范，无 eval/内联 script 违规，各功能通过单元/集成测试。
