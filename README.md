# md抓吗 (MD-Drama) - 完整功能与架构技术手册

> 专为高效知识管理打造的 Chrome 智能网页深度剪藏与 Obsidian 直连扩展（Manifest V3）。

---

## 🌟 核心特性全览

### 1. 6 阶段通用解析流水线 (Pipeline Engine)
* **DOM 语义重塑 (Transformers)**：
  * **Mermaid 流程图还原**：识别原始图表数据，原生还原为 ````mermaid` 可编辑代码块；
  * **代码 Diff 对比还原**：识别添加/删除差异行，还原为 ````diff` 语法（`+` / `-`）；
  * **KaTeX / MathJax 公式还原**：自动提取 TeX 标注，还原为行内 `$formula$` 与块级 `$$formula$$`；
  * **代码块行号与复制按钮清洗**：剥离行号干扰，提取语言标记输出标准 Fenced Code Block；
  * **Flex/Grid 伪表格重构**：探测无 `<table>` 的类表格布局，重构为标准 HTML Table 进而生成 GFM 表格；
  * **CSS 背景图修复**：自动识别 `background-image: url(...)` 并转为标准 `<img>`；
  * **Shadow DOM 穿透**：递归穿透现代 Web Components 封装组件。
* **盘古排版 (Pangu Spacing)**：中文、英文、数字与代码符号混排时自动注入舒适间距。
* **标题层级平滑**：动态将乱序的 Heading 阶梯化重构。
* **关键词自动双链注入**：根据预设词库（如 `Obsidian`, `SEO`, `出海`）自动生成 `[[WikiLinks]]`。

---

### 2. 深度内容清洗与去噪 (Content Cleaner)
* **DOM 层广告清洗**：自动移除广告容器、分享栏、点赞打赏、隐藏 DOM、二维码浮层；
* **引流话术与废话词库过滤**：剔除“记得点赞关注在看”、“点击下方名片”、“一键三连”、“话不多说直接进入正题”等营销口癖；
* **格式规范化**：自动压缩连续多余空行、规范化列表标记（`- item`）与标题前后空行。

---

### 3. 智能多模式滚动与懒加载探测 (Smart Scroller)
* **容器智能探测**：支持自动探测全局 `window` 及飞书 `.bear-web-editor`、动态流 `.topic-list` 等复杂内部滚动容器；
* **动态 DOM 变化判定**：自动检测 DOM 变动与图片加载状态，连续 3 次高度未变自动停止；支持随时手动停止并立即解析已加载内容。

---

### 4. 资产本地化与图片精准排版
* **原位精准插入**：图片提取后注入独立段落排版（`\n\n![alt](attachments/xxx.png)\n\n`），保证与正文隔离；
* **防盗链穿透与全量下载**：Background Service Worker 并发绕过 Referer 限制下载高清原图；
* **飞书官方永久流地址直解**：彻底杜绝临时 blob 链接失效导致的图片下载失败；
* **Canvas 动态图表转图**：自动将网页上的 Canvas 数据图表转为 PNG 静态图片并归档。

---

### 5. Obsidian 仓库直连与离线韧性
* **Obsidian Local REST API**：秒级后台静默写入 Markdown 文档与二进制图片；
* **智能域名分流 (Domain Routing)**：
  * `feishu.cn` $\rightarrow$ `03-知识库/工作文档/`
  * `shengcaiyoushu.com` / `zsxq.com` $\rightarrow$ `03-知识库/商业社群/`
  * `weixin.qq.com` $\rightarrow$ `03-知识库/公众号精选/`
  * `zhihu.com` $\rightarrow$ `03-知识库/知乎精选/`
* **离线草稿箱 (Sync Queue)**：网络或 Obsidian 离线时自动存入本地草稿池，支持恢复后重试补写。

---

### 6. 交互与简白高级美学 (Minimalist White Studio)
* **简白高端设计风格**：纯净高亮白底 (#FFFFFF) + 极简炭黑主色 (#111827) + 极细微边框 + 精致微阴影，呈现 Apple / Linear 级纯粹高级质感；
* **5 阶段极简动态指示器**：`[1.探测]` $\rightarrow$ `[2.滚动]` $\rightarrow$ `[3.重塑]` $\rightarrow$ `[4.去噪]` $\rightarrow$ `[5.排版]`，实时直观呈现解析演进；
* **专注核心剪藏体验**：精简移除多余冗杂板块，聚焦标题重命名、标签管理与实时 Markdown 源码/渲染双视图；
* **轻量划选即存气泡**：鼠标划选文字自动浮现纯白磨砂微气泡；
* **全局静默快捷键**：默认 `Alt+Shift+S`。

---

## 🛠️ 项目目录结构

```text
md-drama/
├── manifest.json                 # Manifest V3 核心声明与快捷键配置
├── background/
│   └── service-worker.js         # 后台路由、快捷键监听、图片下载与 REST API 写入
├── content/
│   ├── index.js                  # 内容脚本入口与消息调度
│   ├── scroller.js               # 智能平滑滚动与懒加载探测器
│   ├── cleaner.js                # 废话词库与 DOM 噪声过滤器
│   ├── extractor.js              # 内容提取与 Markdown 转换协调器
│   ├── pipeline/
│   │   ├── transformers.js       # 复杂结构（Mermaid/Diff/KaTeX/伪表格）重塑器
│   │   └── parser-engine.js      # 6 阶段通用解析流水线引擎
│   ├── adapters/                 # 特定站点适配器 (飞书/生财/通用)
│   └── ui/
│       ├── bubble.js             # 划选气泡与全屏 Mini Toast 交互
│       └── bubble.css
├── utils/
│   ├── logger.js                 # 分级运行日志系统
│   └── sync-queue.js             # 离线草稿箱管理器
├── popup/
│   ├── popup.html                # 交互面板与工作台视图
│   ├── popup.css                 # 极简深石墨 UI 样式
│   └── popup.js                  # 交互逻辑、动态节点驱动与数据组装
├── options/                      # 偏好设置页
├── test/                         # 自动化单元测试套件
└── dist/
    └── md-drama-v1.2.0.zip       # 最新构建发布包
```

---

## 🔄 版本更新日志 (Changelog)

### v1.2.0 (2026-08)
- 🚀 **飞书/Lark Docx 虚拟列表动态收割引擎**：针对飞书动态卸载视口外 DOM 的机制，设计渐进式步进收割算法（`harvestAllBlocks`），支持无上限超长文档 100% 完整解析；
- 🖼️ **飞书图片永久流地址直解**：直接根据 `image-token` 与 `data-record-id` 构建永久授权 Drive Stream CDN 链接，彻底消除临时 `blob:` URL 过期销毁导致的批量下载失败；
- 📐 **Markdown 排版与格式一致性全面升级**：
  - 规范化标题层级（主标题入 Frontmatter，文内标题严格阶梯化，前后自动补齐 `\n\n` 空行）；
  - 修复 Turndown 异常破折号转义（`\-` -> `-`），压缩无序列表前缀空格为标准 GFM `- item`；
  - 修复图片独立段落与分界线分隔规范；
- 🛡️ **全渠道专有适配器深度加固与测试**：全面升级并测试微信公众号、知乎（专栏/回答/想法）、语雀知识库、Notion、稀土掘金、生财有术/知识星球、通用 Readability 引擎；
- 🛠️ **修复登录墙误判**：仅在提取正文极短（< 600字）且存在拦截层时告警，避免正常长文误报。

### v1.1.0 (2026-08)
- 首次发布 6 阶段通用流水线引擎（Transformers + Content Cleaner + Parser Engine）；
- 支持 Mermaid、Diff、KaTeX 公式与伪表格重构；
- 支持 Obsidian Local REST API 静默直连与智能域名分流。

