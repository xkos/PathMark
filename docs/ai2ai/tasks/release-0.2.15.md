# PathMark 0.2.15

## 更新说明

- 修复部分网页的已收藏视频封面和标题不显示标记：行内链接可能在有效矩形之前产生零尺寸片段，现在选择与视口相交的有效片段，不再固定使用第一个矩形。
- 通用布局修复，不依赖网站域名、卡片类名，不改变页面链接或内容。
- 权限、数据结构及隐私行为无变化。

## Release notes

- Fix missing saved-link markers on inline links containing block content or multiple layout fragments. Skip empty and offscreen rectangles when positioning markers.
- Applies across websites without changing page links or content. No permission or data-model changes.

## Validation

- 89 unit tests and production build passed.
- Isolated Chrome fixture reproduced the bug against the previous bundle (no markers), then passed with the fix: both cover and title links marked, source DOM unchanged.
- Existing navigation regression passed: same-page anchors excluded, external fragments marked, overlay restored after removal, markers above text.
- Unit coverage includes zero-width fragments with heights 0 and 16, offscreen first lines, and entirely invalid rectangles.
- Browser matching is stubbed in these layout regressions; no access to user browsing data.
