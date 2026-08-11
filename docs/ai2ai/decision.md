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

## 快捷键与工具栏状态

- 使用 Manifest V3 `_execute_action` 打开 Popup；建议快捷键为 macOS `Command+Shift+X`、Windows/Linux `Ctrl+Shift+X`，其中 `X` 取自 extension。
- 快捷键只作为 Manifest 建议绑定，最终绑定结果必须在浏览器扩展快捷键页验证。
- 工具栏图标按标签页独立设置：未记录为灰色，未读或阅读中为琥珀色，已读为绿色，已归档为蓝色；归档状态优先于阅读状态。
- 自动随标签切换和页面导航刷新图标需要读取标签页 URL，因此申请 `tabs` 权限；URL 只在本地用于规范键匹配，不向外部发送。
