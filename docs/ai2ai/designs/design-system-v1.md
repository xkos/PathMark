# MVP 设计系统 v1

本规范从 `mvp-core-flow-ui-v1.png` 拆解而来，用于 Chrome 与 Microsoft Edge 共用的 Chromium 扩展界面。它描述可实现的视觉令牌、主题规则和共享 UI 模块，不把生成图片中的抗锯齿像素值直接当作代码颜色。

## 1. 设计方向

- 视觉气质：冷静、可信、信息密度适中，接近浏览器原生工具而不是营销页面。
- 信息层级：内容优先，装饰克制；主操作使用蓝色，状态色只承担辅助识别。
- 布局密度：Popup 紧凑，资料库与设置页采用中等密度。
- 第一版仅提供亮色主题；令牌必须使用语义命名，为以后增加暗色主题保留替换能力。
- 不使用渐变、玻璃拟态、大面积插画或过多悬浮卡片。
- 不使用 Pen 工具；设计规范、视觉稿和后续实现均保存在本仓库。

## 2. 配色方案

### 2.1 基础色板

| 色阶 | 色值 | 用途 |
|---|---|---|
| `white` | `#FFFFFF` | Popup、面板和控件背景 |
| `neutral-25` | `#FBFBFB` | 应用画布 |
| `neutral-50` | `#F7F7F8` | 次级区域、表头、悬停底色 |
| `neutral-100` | `#ECEDEF` | 禁用背景、分隔区域 |
| `neutral-200` | `#CECFD0` | 默认边框 |
| `neutral-300` | `#AFB0B2` | 强分隔线、禁用图标 |
| `neutral-500` | `#707174` | 次要文字；白底对比度约 4.88:1 |
| `neutral-700` | `#323235` | 正文文字；白底对比度约 12.78:1 |
| `neutral-900` | `#16171A` | 标题和高强调文字 |
| `primary-50` | `#EEF4FF` | 蓝色弱背景、选中导航 |
| `primary-100` | `#D1E0FF` | Focus ring 外层、弱边框 |
| `primary-500` | `#245BD4` | 次级蓝色交互 |
| `primary-600` | `#0E4ACC` | 主按钮、活动图标；白字对比度约 7.32:1 |
| `primary-700` | `#003DC9` | 主按钮悬停；白字对比度约 8.36:1 |
| `success-50` | `#ECFDF3` | 已读、匹配成功背景 |
| `success-200` | `#CEE6D8` | 成功状态边框 |
| `success-700` | `#18794E` | 成功文字和图标 |
| `warning-50` | `#FFF8E8` | 未读状态背景 |
| `warning-200` | `#FCEFD4` | 未读状态边框 |
| `warning-700` | `#9A4B00` | 未读状态文字和图标 |
| `danger-50` | `#FFF1F0` | 删除、冲突背景 |
| `danger-700` | `#B42318` | 删除、冲突文字和图标 |

### 2.2 语义颜色令牌

```css
:root {
  color-scheme: light;

  --color-canvas: #fbfbfb;
  --color-surface: #ffffff;
  --color-surface-subtle: #f7f7f8;
  --color-surface-disabled: #ecedef;

  --color-text: #323235;
  --color-text-strong: #16171a;
  --color-text-muted: #707174;
  --color-text-disabled: #afb0b2;

  --color-border: #cecfd0;
  --color-border-subtle: #ecedef;
  --color-focus: #0e4acc;

  --color-action: #0e4acc;
  --color-action-hover: #003dc9;
  --color-action-subtle: #eef4ff;

  --color-success-bg: #ecfdf3;
  --color-success-border: #cee6d8;
  --color-success-fg: #18794e;
  --color-warning-bg: #fff8e8;
  --color-warning-border: #fcefd4;
  --color-warning-fg: #9a4b00;
  --color-danger-bg: #fff1f0;
  --color-danger-fg: #b42318;
}
```

UI 模块只能依赖语义令牌，不能直接依赖 `primary-600` 等基础色阶。暗色主题将来只替换语义层。

## 3. Theme 样式规则

### 3.1 字体

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
  "PingFang SC", "Microsoft YaHei", sans-serif;
```

| 样式 | 字号/行高 | 字重 | 用途 |
|---|---|---|---|
| `title-lg` | `20/28px` | 600 | 管理页标题 |
| `title-md` | `16/24px` | 600 | Popup 标题、区块标题 |
| `body-md` | `14/22px` | 400 | 默认正文与表单 |
| `body-sm` | `13/20px` | 400 | 列表辅助信息 |
| `label` | `12/18px` | 500 | 字段名、徽标、表头 |

不使用小于 `12px` 的业务文字。数字计数允许使用等宽数字特性 `font-variant-numeric: tabular-nums`。

### 3.2 间距与尺寸

- 基础网格：`4px`。
- 间距序列：`4, 8, 12, 16, 20, 24, 32px`。
- 控件高度：紧凑 `32px`，默认 `36px`，主要提交按钮 `40px`。
- 图标尺寸：`16px` 默认，`20px` 强调；纯图标按钮可点击区域不得小于 `32×32px`。
- Popup：目标宽度 `380px`，内容允许纵向滚动，主操作固定在内容流末尾。
- 管理页：最小内容宽度 `960px`；左导航建议 `216px`。

### 3.3 圆角、边框与阴影

```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
--radius-xl: 12px;

--shadow-popup: 0 8px 24px rgb(22 23 26 / 14%);
--shadow-overlay: 0 12px 32px rgb(22 23 26 / 18%);
```

- 输入框、按钮和徽标使用 `6px` 圆角。
- Popup 外框和模态框使用 `8–12px` 圆角。
- 普通内容分组优先使用间距与分隔线，不为每一块内容增加阴影卡片。
- 默认边框 `1px solid var(--color-border)`。

### 3.4 交互状态

- Hover：改变背景或边框，不改变布局。
- Focus visible：`2px` 主色轮廓加 `2px` 外间距，不能只靠阴影。
- Disabled：降低文字对比度并禁用指针事件，但仍保留清晰轮廓。
- Loading：按钮保持原尺寸，显示 spinner，并保留动作文本或可访问名称。
- 错误：字段级错误紧邻字段展示；事务或导入类错误使用页面级 Alert。
- 阅读状态不能只用颜色表达，必须同时显示“未读 / 阅读中 / 已读”文字或图标。

## 4. 共享基础 UI 模块

这些模块隐藏尺寸、颜色、交互状态和可访问性规则，页面只能通过其公开属性使用。

| 模块 | Interface | 变体与状态 |
|---|---|---|
| `Button` | `label, icon?, onPress, disabled?, loading?` | `primary / secondary / ghost / danger`；`sm / md` |
| `IconButton` | `icon, accessibleLabel, onPress` | `default / danger`；必须有 Tooltip |
| `TextField` | `label, value, onChange, error?, hint?` | `text / url / search` |
| `TextArea` | `label, value, maxLength?, onChange` | 显示字符计数 |
| `Select` | `label, value, options, onChange` | 单选；支持空值“收件箱” |
| `Checkbox` | `checked, mixed?, label, onChange` | 列表多选和批量选择 |
| `Switch` | `checked, label, onChange` | Endpoint 启用状态 |
| `SegmentedControl` | `value, options, onChange` | 阅读状态三选一 |
| `Badge` | `label, tone` | `neutral / info / success / warning / danger` |
| `Tag` | `label, removable?, onRemove?` | 普通标签；不用于阅读状态 |
| `Alert` | `title, description?, tone, actions?` | 成功、警告、错误、信息 |
| `Tooltip` | `content, placement?` | IconButton 和截断文字 |
| `Menu` | `trigger, items` | 条目更多操作和 Endpoint 操作 |
| `Dialog` | `title, body, primaryAction, secondaryAction` | 普通确认与危险确认 |
| `DataTable` | `columns, rows, selection?, sort?` | Endpoint 和资料批量管理 |
| `EmptyState` | `title, description, action?` | 不带装饰插画的轻量空状态 |

## 5. 共享领域 UI 模块

### `ReadingStateControl`

封装未读、阅读中、已读三个状态及状态文本，不处理归档。Popup 使用分段控件，表格可使用 `Badge` 展示。

### `ArchiveControl`

独立控制归档状态。不得把“归档”加入 `ReadingStateControl`，也不得因归档自动改变阅读状态。

### `PageIdentityCard`

输入页面匹配结果，统一展示：是否收藏、阅读状态、Site、命中 Endpoint、资源键和匹配说明。识别页与保存页共享，页面本身不拼装身份解释文案。

### `SaveItemForm`

组合标题、URL、说明、分类、标签、阅读状态和 `PageIdentityCard`。新增与编辑共享同一表单，通过模式控制哪些字段只读。

### `LibraryItemRow`

展示选择框、标题、说明摘要、阅读状态、Site、标签和更新时间。列表、搜索结果和批量整理共享；不得在各页面复制不同版本。

### `LibraryFilterBar`

组合搜索、阅读状态、Site、标签和排序。筛选值由页面持有，模块只负责输入与事件输出。

### `CollectionNavTree`

展示收件箱、嵌套分类、总数和未读数。拖拽排序可以后加，第一版 Interface 不提前暴露拖拽细节。

### `EndpointList`

管理 Endpoint 地址、优先级和启用状态。地址规范化、冲突检测和影响计算属于领域逻辑，不由表格单元格实现。

### `UrlMatchPreview`

接受一个或多个示例 URL，展示命中的 Endpoint、资源键、规范键结果或可解释的失败原因。它是 Endpoint 编辑前的主要验证面。

### `IdentityMatchAlert`

统一展示“通过同站点资源键匹配”“识别为同一条目”等结果。状态色只作辅助，正文必须明确说明匹配依据。

### `DestructiveActionDialog`

用于删除条目、分类、Site、替换导入和清空数据。必须显示影响数量、后果以及可选迁移方式，禁止只显示“确定删除吗”。

## 6. 页面组合

```text
PopupShell
├── CurrentPageHeader
├── PageIdentityCard
├── SaveItemForm / ExistingItemActions
└── ManageLibraryLink

LibraryShell
├── CollectionNavTree
├── LibraryFilterBar
├── LibraryItemRow[]
└── BulkActionBar

SiteSettingsPage
├── SiteForm
├── EndpointList
├── UrlMatchPreview
└── IdentityMatchAlert
```

页面负责加载数据和组织流程；颜色、控件行为、身份解释和状态转换应集中在共享模块中。

## 7. 图标与文案

- 使用单一开源线性图标集，默认线宽 `1.5–2px`；不混用填充和线性风格。
- 图标不能替代文字表达关键状态。
- `Site`、`Endpoint`、`资源键`沿用领域模型术语，不在不同页面改称“网站地址”“域名规则”等近义词。
- 主按钮采用动作结果文案，例如“保存到资料库”“添加 Endpoint”，不使用笼统的“确定”。
- 匹配说明采用完整因果表达，例如“通过同站点资源键匹配”，而不是只显示“已匹配”。

## 8. MVP 视觉验收

- Popup 在 `380px` 宽度下无横向滚动，主操作不被遮挡。
- 键盘可以按合理顺序访问所有交互元素，Focus 状态清晰可见。
- 主要文字与背景达到 WCAG AA；颜色不是阅读状态、错误或成功的唯一线索。
- 新旧 Endpoint 映射结果同时显示 Endpoint 与资源键，避免用户误以为只是 URL 字符串相等。
- 阅读状态和归档状态在编辑页、列表页和筛选器中保持两个独立维度。
- 删除、替换导入和 Endpoint 身份重映射必须展示影响范围后才能提交。
