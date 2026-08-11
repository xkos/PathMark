# 第一阶段实现计划

## 目标

建立可同时加载到 Chrome 和 Microsoft Edge 的 Manifest V3 扩展，实现第一条端到端纵切：读取当前页面、规范化 URL、识别已有条目、保存到本地数据库、再次打开 Popup 时显示已有状态。

## 工程选择

- React + TypeScript：Popup 和资料库共用 UI 模块与类型。
- Vite：生成 Manifest V3 可加载的静态包。
- Dexie + IndexedDB：本地业务数据与事务存储。
- Vitest + fake-indexeddb：通过公开 Interface 验证 URL 身份和持久化行为。
- 原生 CSS 变量：直接落实 `design-system-v1.md`，不引入额外样式框架。

## 模块

### URL Identity

Interface 接收 URL、Site 列表和规范化设置，返回可解释的 Site、Endpoint、资源键、规范键或未归站结果。路径段匹配、查询参数策略和冲突判断隐藏在模块内部。

### Reading Library

Interface 提供识别当前页面、保存条目、查询条目和转换阅读状态。IndexedDB、唯一索引、时间字段和 `firstReadAt` 规则隐藏在模块内部。

### Browser Context

Interface 返回当前活动标签页的标题与 URL。Chrome/Edge 共用同一个 `chrome.tabs` Adapter；测试不需要加载浏览器。

### Popup

只组织“加载当前页面 → 识别 → 保存或更新状态”流程，不自行实现 URL 规范化或阅读状态转换。

## 验收

- `npm test` 覆盖新旧 Endpoint 等价识别、路径段边界、查询参数规范化、未归站识别和曾读历史保留。
- `npm run build` 生成含 `manifest.json`、Popup、资料库页和后台脚本的 `dist/`。
- Chrome 与 Edge 可加载同一个 `dist/`。
- 保存真实当前页面后，关闭并再次打开 Popup 能识别同一条目。
- 不使用 Pen，不修改或引入云端服务。
