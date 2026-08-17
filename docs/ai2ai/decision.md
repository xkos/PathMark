# 当前决策

## 文档所有权

- 用户确认的产品事实与模型以 `docs/me2ai/**` 为准。
- AI 的计划、任务、技术决策与状态记录放在 `docs/ai2ai/**`。
- `docs/me2ai/**` 的任何后续变更都必须事先取得用户明确同意。

## 第一版产品边界

- 目标平台为 Chrome 和 Microsoft Edge。
- 第一版采用本地优先的数据存储，不依赖账号和服务端。
- URL 身份由站点、Endpoint、资源键和规范键共同表达。
- 收藏分类、内容来源和标签是三个相互独立的维度。

## 扩展工程目录

- Chrome 与 Microsoft Edge 共用根目录 `chromium/` 下的同一份 Chromium 扩展源码。
- 不使用 `crx/` 作为源码目录名；CRX 属于构建或分发产物概念。
- 默认生成同一份 Chromium 构建；只有商店元数据、品牌文字或 Manifest 确有差异时，才分别生成 Chrome 与 Edge 发布包。
- 禁止为两个浏览器复制两套业务代码，平台差异通过最小构建配置或 Manifest 覆盖处理。

## 设计工具与设计系统

- 本项目不使用 Pen 工具，避免与当前正在使用 Pen 的其他项目发生编辑状态或资源冲突。
- 视觉稿、主题令牌和 UI 模块规范保存在 `docs/ai2ai/designs/`；实现时再将已确认令牌迁入 `chromium/` 源码。
- MVP 仅实现亮色主题，但 UI 模块必须依赖语义颜色令牌，不能直接依赖基础色阶。
- Chrome 与 Edge 使用同一套主题和共享 UI 模块，不创建浏览器专属视觉分支。

## 第一阶段工程技术

- 使用 React + TypeScript 实现 Popup 与资料库 UI。
- 使用 Vite 生成 Chrome 与 Edge 共用的 Manifest V3 产物。
- 使用 Dexie 管理 IndexedDB 本地业务数据，不申请与核心能力无关的浏览器存储权限。
- 使用 Vitest 和 fake-indexeddb 通过模块 Interface 验证 URL 身份、唯一识别、持久化与阅读历史。
- 使用原生 CSS 变量落实设计令牌，不在第一阶段引入额外样式框架。

## 浏览器收藏夹迁移

- 内部 JSON 是无损备份/恢复格式；浏览器收藏夹 HTML 是需要人工映射的外部迁移来源，两者不共用文件语义。
- 支持 Chrome、Edge 等浏览器导出的 Netscape Bookmark HTML，也支持用户主动授权后直接读取当前浏览器收藏夹。`bookmarks` 只能声明在 `optional_permissions` 中，并且必须在用户点击“授权并读取”时申请；读取结果是一次性导入快照，浏览器收藏夹树不作为主数据库或实时同步源。
- 直接读取只允许调用 `chrome.bookmarks.getTree()`；禁止调用创建、更新、移动和删除浏览器收藏夹的接口。权限被拒绝或撤销时，HTML 导入及其他核心功能必须继续可用。
- 导入目录只决定 Item 的阅读状态、归档状态和可选 Collection；域名/Endpoint 映射只决定 Site 身份，两个维度互不绑定。
- 候选链接按规范化 Origin 分组。精确命中已有 Endpoint 时可自动选择 Site；不同域名不得静默合并，用户可以把多个 Origin 映射到同一已有 Site，或通过相同新站点名称显式创建包含多个 Endpoint 的 Site。
- 收藏夹导入默认保持已有 Item 不变；同批次产生相同规范键时按 `read > reading > unread` 保留已读程度较高的记录，并在应用前显示合并与跳过数量。
- 收藏夹导入计划必须使用现有 URL Identity 规则重新计算规范键，并在单个 IndexedDB 事务中写入 Site、Collection 和 Item；校验失败不得留下部分数据。

## 快捷键与工具栏状态

- 使用 Manifest V3 `_execute_action` 打开 Popup；建议快捷键为 macOS `Command+Shift+X`、Windows/Linux `Ctrl+Shift+X`，其中 `X` 取自 extension。
- 快捷键只作为 Manifest 建议绑定，最终绑定结果必须在浏览器扩展快捷键页验证。
- 工具栏图标按标签页独立设置：未记录为灰色，未读或阅读中为琥珀色，已读为绿色，已归档为蓝色；归档状态优先于阅读状态。
- 自动随标签切换和页面导航刷新图标需要读取标签页 URL，因此申请 `tabs` 权限；URL 只在本地用于规范键匹配，不向外部发送。
