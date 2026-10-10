# PathMark 0.2.14

## 更新说明

- 已匹配站点的页面，打开插件即可收藏；结果页显示站点、资源路径及分类，可直接修改分类或删除收藏。
- 精简弹窗布局，新收藏默认已读；已有设置和条目状态保持原值。
- 分类支持自定义颜色，工具栏收藏图标与网页链接标记使用分类颜色。
- 条目迁移可选择已有站点或新建站点，编辑待添加的域名／路径前缀，并合并相同资源。
- 在设置中一次授权启用网页收藏链接标记，支持动态链接及跨域名资源识别；不隐藏网页内容或修改链接行为。
- 标记位于链接左上方，排除当前页面自身锚点；修复授权后开关状态更新及脚本注册丢失后的恢复。

旧测试版如果已经丢失脚本注册记录，升级后需要在设置中重新开启一次标记。正式版新开关独立保存于扩展本地存储，默认关闭。

## Release notes

- Save a page automatically when opening the popup if it matches an existing site. View its site, resource path and collection, change its collection, or remove it directly.
- A more compact popup and a read-by-default setting for new installations; existing preferences and saved item states are preserved.
- Custom collection colors for the toolbar bookmark icon and saved-link markers.
- Move an item to an existing or new site, add an editable endpoint prefix, and merge duplicate resources.
- Optional, globally enabled saved-link markers with a one-time website permission request. Supports dynamic links and site aliases without hiding page content or changing link behavior.
- Top-left link markers exclude same-page anchors. Fixed permission-toggle timing and restored script registration from a separately persisted preference after startup or update.

## Chrome Web Store permission explanations

- `tabs`: Read tab URLs and titles to recognize saved pages, update toolbar icons, and apply enabled saved-link marking to already open pages. Processing remains local.
- `scripting`: Register and run the packaged saved-link marker script only when the user enables the feature and grants website access. No remote code is fetched or executed.
- `storage`: Store the local saved-link marking preference independently of content-script registration so the preference survives extension updates and browser restarts. No cloud sync is used.
- Optional `http://*/*` and `https://*/*`: Requested only from the global settings switch. Compare visible webpage link URLs with the local library and render collection-colored markers. Disabling removes markers and releases access. Broad optional access allows this user-enabled feature to work across arbitrary sites without repeated per-site prompts.
- Optional `bookmarks`: Unchanged, read-only bookmark-tree import after the user explicitly authorizes it.

The extension does not transmit library data or scanned link URLs. The feature reads link addresses and positions, not passwords or form values. The localized privacy pages include a 0.2.14 supplement covering these changes.

## Validation

- 85 unit tests and production build.
- Browser smoke coverage: auto-save, compact popup, category updates, direct deletion, existing/new site migration, collection colors, global marking, permission-toggle timing, same-page anchors, dynamic links, page overlay recovery, and lost-registration recovery after browser restart.
- Browser smoke profiles are disposable. Global-marking tests pre-grant website permissions in a temporary manifest copy; native permission-prompt appearance is not automated.
- All 19 locale surfaces pass web verification.
