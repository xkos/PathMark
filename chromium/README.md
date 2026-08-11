# 本地阅读收藏扩展

Chrome 与 Microsoft Edge 共用的 Manifest V3 扩展源码。

## 开发命令

```bash
npm install
npm test
npm run build
```

构建产物位于 `dist/`。

后台逻辑会单独构建为不依赖外部 chunk 的经典 Service Worker，兼容 Chrome/Edge 的扩展后台加载；`npm run build` 会自动验证该约束。

## 快捷键与状态图标

- 建议快捷键：macOS 为 `Command+Shift+X`，Windows/Linux 为 `Ctrl+Shift+X`，用于打开扩展 Popup；`X` 取自 extension。
- 快捷键属于 Manifest 建议绑定，仍应在 Chrome 的 `chrome://extensions/shortcuts` 或 Edge 的 `edge://extensions/shortcuts` 中确认实际绑定。
- 工具栏图标按当前页面状态变化：灰色表示未记录，琥珀色表示待读，绿色表示已读，蓝色表示已归档。
- 为了在切换标签页和导航后自动识别状态，扩展需要 `tabs` 权限读取当前标签页 URL；URL 只在本地与 IndexedDB 中的收藏身份进行匹配。

## 本地加载

### Chrome

1. 打开 `chrome://extensions`；
2. 启用“开发者模式”；
3. 点击“加载已解压的扩展程序”；
4. 选择本项目的 `chromium/dist` 目录。

### Microsoft Edge

1. 打开 `edge://extensions`；
2. 启用“开发人员模式”；
3. 点击“加载解压缩的扩展”；
4. 选择同一个 `chromium/dist` 目录。

## 当前纵切

- 读取当前 HTTP/HTTPS 标签页；
- 规范化 URL 并识别已有条目；
- 保存标题、说明、标签和阅读状态到 IndexedDB；
- 再次打开 Popup 时识别同一条目；
- 已读改回未读时保留 `firstReadAt`；
- 从“管理资料库”打开最小资料库页面并搜索、筛选条目。
