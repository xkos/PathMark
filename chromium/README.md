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
- 工具栏图标按收藏分类颜色变化：灰色表示未收藏；已收藏使用分类设置的颜色，未分类默认蓝色。
- 为了在切换标签页和导航后自动识别状态，扩展需要 `tabs` 权限读取当前标签页 URL；URL 只在本地与 IndexedDB 中的收藏身份进行匹配。

## 网页中的收藏链接标记

在资料库的「设置与数据」开启「在网页中标记已收藏的链接」。默认关闭；首次开启由浏览器申请 HTTP/HTTPS 网站访问权限，允许后在各网站自动生效，包括已打开的页面与动态加载的链接。关闭后移除标记、注销脚本并释放网站访问权限。浏览器内部页、扩展商店等禁止脚本访问的页面不支持。

识别复用本地收藏的网址与站点匹配规则，只在链接旁显示分类颜色标记，不隐藏内容，不改变原链接或点击行为。权限与开关是当前浏览器的设置，不随资料库备份导入。开关独立保存在扩展本地存储中；启动或更新时按已保存的选择恢复页面脚本注册，避免注册记录丢失后有权限却没有标记。旧测试包若已丢失注册记录，升级后需在设置中重新开启一次。

完整扩展回归测试：构建后运行 `scripts/smoke-global-link-markers.cjs`（需安装 Playwright 与支持扩展的 Chromium，通过 `PLAYWRIGHT_MODULE` / `PLAYWRIGHT_EXECUTABLE_PATH` 指定）。测试使用临时浏览器配置及预授权的清单副本，不使用真实浏览数据，也不验证系统权限弹窗外观。

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
