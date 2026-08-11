# 本地阅读收藏夹——数据模型 v1

本文定义第一版的领域对象、持久化结构、URL 身份算法和 JSON 交换格式。实现语言示例使用 TypeScript。

## 1. 存储边界

建议使用浏览器扩展可用的 IndexedDB 保存业务实体，扩展设置也可以放在同一数据库中，以便事务性导入和完整导出。运行时缓存、搜索索引和界面临时状态不得写入导出文件。

建议数据库对象仓库：

| Store | 主键 | 主要索引 |
|---|---|---|
| `collections` | `id` | `parentId`、`sortOrder`、`updatedAt` |
| `sites` | `id` | `nameNormalized`、`updatedAt` |
| `items` | `id` | `canonicalKey`（唯一）、`collectionId`、`siteId`、`readingState`、`isArchived`、`createdAt`、`updatedAt`、`lastOpenedAt`、`tags`（multiEntry） |
| `settings` | 固定键 `app` | 无 |
| `meta` | `key` | 无；保存数据库版本等内部信息，不导出缓存 |

## 2. TypeScript 类型

```ts
type ISODateTime = string; // RFC 3339 UTC，例如 2026-08-11T08:30:00.000Z
type UUID = string;

type QueryPolicy =
  | {
      mode: "keep-all-except-ignored";
      ignoredParams: string[];
    }
  | {
      mode: "keep-only-identity";
      identityParams: string[];
    };

interface Collection {
  id: UUID;
  name: string;
  /** null 表示顶层分类 */
  parentId: UUID | null;
  /** 同一父分类下的展示顺序，数字越小越靠前 */
  sortOrder: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface Endpoint {
  id: UUID;
  /** http(s) URL 前缀；不含 query、fragment、用户名或密码 */
  prefix: string;
  /** 数字越小，解析地址时优先级越高 */
  priority: number;
  enabled: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

interface Site {
  id: UUID;
  name: string;
  description: string;
  endpoints: Endpoint[];
  queryPolicy: QueryPolicy;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

type ReadingState = "unread" | "reading" | "read";

interface Item {
  id: UUID;
  title: string;
  note: string;
  tags: string[];

  /** null 表示条目位于收件箱；分类不参与 URL 身份判断 */
  collectionId: UUID | null;

  /** null 表示未归站 */
  siteId: UUID | null;
  /** 已归站时为相对资源键；未归站时为 null */
  resourceKey: string | null;
  /** 全库唯一，由规范化算法生成，不使用随机值 */
  canonicalKey: string;

  /** 首次收藏地址，之后不因 Endpoint 变化而覆盖 */
  originalUrl: string;
  /** 最近一次实际选择打开的解析地址 */
  lastResolvedUrl: string | null;

  readingState: ReadingState;
  isArchived: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** 首次标记已读的永久历史；之后回到未读也不清空 */
  firstReadAt: ISODateTime | null;
  /** 当前这次进入已读状态的时间；离开已读状态时清空 */
  readAt: ISODateTime | null;
  lastOpenedAt: ISODateTime | null;
  openCount: number;
}

interface AppSettings {
  /** 全局默认忽略，匹配大小写不敏感；utm_* 表示前缀规则 */
  globalIgnoredQueryParams: string[];
  stripTrailingSlash: boolean;
  defaultReadingState: ReadingState;
  defaultView: "inbox" | "unread" | "all";
}

interface ExportDocumentV1 {
  format: "reading-bookmarks";
  formatVersion: 1;
  exportedAt: ISODateTime;
  app: {
    name: string;
    version: string;
  };
  settings: AppSettings;
  collections: Collection[];
  sites: Site[];
  items: Item[];
}
```

## 3. 为什么这样拆分

### `collectionId`、`siteId` 与 `tags`

- `collectionId`：用户的主归类，回答“我把资料放在哪里”；`null` 表示收件箱；
- `siteId`：内容来源身份，回答“资料来自哪里”；
- `tags`：可跨分类、跨站点叠加的多维标记。

移动收藏分类只修改 `collectionId`，不得重新计算 `resourceKey` 或 `canonicalKey`。

### `readingState` 与 `isArchived`

它们表达不同维度。`read + archived` 表示读完并从工作列表隐藏；`unread + archived` 表示暂时不处理但还没读。若把归档混进阅读状态，将无法准确回答“是否读过”。

### `originalUrl`、`resourceKey` 与 `canonicalKey`

- `originalUrl`：可追溯的首次输入；
- `resourceKey`：站点内部不含 Endpoint 的稳定部分，例如 `/paper/123?lang=en`；
- `canonicalKey`：数据库唯一键，防止重复并用于当前页面匹配。

### Endpoint 嵌入 Site

Endpoint 只在所属站点内维护，生命周期与站点一致，数量通常很少。嵌入可以简化读取和导出。增删 Endpoint、调整优先级或修改前缀只改变 URL 匹配与解析地址，不自动改变现有条目的 `resourceKey` 和 `canonicalKey`；只有迁移 Site 或用户显式执行身份重映射时才重新计算身份。

## 4. URL 规范化算法

### 4.1 Endpoint 规范化

输入 `prefix` 后：

1. 解析为 URL，只允许 `http:` 或 `https:`；
2. 拒绝用户名、密码、查询参数和 fragment；
3. host 转小写；
4. 删除协议默认端口；
5. 路径解析 `.` 和 `..` 段；
6. 除根路径外删除尾部 `/`；
7. 保存规范化后的完整前缀。

例：

```text
HTTPS://Example.COM:443/docs/  -> https://example.com/docs
https://example.com/           -> https://example.com/
```

### 4.2 Endpoint 匹配

候选 URL 必须满足：

- scheme、hostname 和有效端口与 Endpoint 一致；
- URL 路径等于 Endpoint 路径，或以下一个字符 `/` 开始；
- 不把 `/docs2` 视为 `/docs` 的子路径。

若多个 Endpoint 匹配，选择路径前缀字符数最长者。完全相同优先级的跨站点歧义属于配置错误。

### 4.3 资源键

命中 Endpoint 后：

1. 从 URL pathname 中移除 Endpoint pathname；
2. 空余路径规范为 `/`，其他路径保证以 `/` 开头；
3. 按全局与站点策略处理查询参数；
4. 将保留参数按参数名、参数值排序；
5. 使用 RFC URL 序列化规则输出路径和查询字符串。

```text
Endpoint:   https://old.example.com/docs
URL:        https://old.example.com/docs/paper/123?utm_source=x&lang=en
Resource:   /paper/123?lang=en
```

### 4.4 规范键

规范键建议保留可调试的版本化明文，而不是只存哈希：

```text
已归站：v1:site:<siteId>:<percent-encoded-resourceKey>
未归站：v1:url:<percent-encoded-normalized-full-url>
```

例如：

```text
v1:site:018f3...:%2Fpaper%2F123%3Flang%3Den
```

实现可以另建哈希索引用于性能，但导出数据中的 `canonicalKey` 应可解释且可由其他字段重新计算。

## 5. 地址解析

打开已归站条目时：

1. 获取所属站点；
2. 过滤 `enabled === true` 的 Endpoint；
3. 按 `priority` 升序排序；
4. 将 Endpoint 路径与 `resourceKey` 的路径按单个 `/` 连接；
5. 附加 `resourceKey` 的查询部分；
6. 更新 `lastResolvedUrl`；页面实际发起打开后更新 `lastOpenedAt` 和 `openCount`。

如果没有启用的 Endpoint，界面应允许使用 `originalUrl`，并提示站点没有可用入口。

## 6. 状态转换

| 操作 | `readingState` | `firstReadAt` | `readAt` | `isArchived` |
|---|---|---|---|---|
| 新建条目 | 默认 `unread` | `null` | `null` | `false` |
| 标记阅读中 | `reading` | 保留原值 | `null` | 不变 |
| 首次标记已读 | `read` | 当前时间 | 当前时间 | 不变 |
| 已读再次保存 | `read` | 保留原值 | 保留原值 | 不变 |
| 曾读条目再次标记已读 | `read` | 保留原值 | 当前时间 | 不变 |
| 已读改回未读/阅读中 | 目标状态 | 保留原值 | `null` | 不变 |
| 归档/取消归档 | 不变 | 不变 | 不变 | 切换 |

所有用户可见修改都更新 `updatedAt`。仅打开页面不更新 `updatedAt`，只更新访问统计字段。

## 7. 数据约束

- 所有 ID 使用 UUID；
- 时间使用 UTC RFC 3339 字符串；
- 分类最多 5 层；`parentId` 不得引用自身或形成环；同一父分类下名称按去除首尾空白后的小写形式唯一；
- `collectionId !== null` 时必须引用存在的分类；删除分类时必须在同一事务中迁移或删除相关条目；
- 标签去除首尾空白，空标签丢弃，同一条目内按大小写不敏感去重但保留首次显示形式；
- `canonicalKey` 建唯一索引；
- `siteId !== null` 时，`resourceKey` 必须非空且以 `/` 开头；
- `siteId === null` 时，`resourceKey` 必须为 `null`；
- `firstReadAt` 一旦非空，不得因阅读状态改变而清空；
- `readingState !== "read"` 时，`readAt` 必须为 `null`；
- `readAt !== null` 时，`firstReadAt` 必须非空且 `firstReadAt <= readAt`；
- `openCount` 是不小于 0 的整数；
- Endpoint 的 `priority` 是不小于 0 的整数，在同一站点内建议唯一；
- 删除 Site 前必须计算关联条目影响；修改 Endpoint 前必须预览匹配范围和解析地址变化，但不得自动重算现有条目身份；迁移 Site 或显式身份重映射前必须计算规范键冲突。

## 8. 索引与查询建议

结构化筛选直接使用 IndexedDB 索引；标题、说明、URL、分类名和站点名的组合全文搜索可在第一版采用规范化小写文本和内存过滤。达到性能瓶颈后再引入可重建的倒排索引，搜索索引不进入导出文件。

标签筛选使用 `tags` multiEntry 索引。多个条件组合时先走选择性最高的索引，再在内存中过滤剩余条件。

## 9. 导入流程

```text
读取文件
  -> JSON 解析
  -> 主格式版本检查
  -> JSON Schema 校验
  -> 跨实体引用与唯一性校验
  -> 计算合并预览/冲突
  -> 用户确认
  -> 单事务写入
  -> 重建派生索引
  -> 显示结果
```

不要信任导入文件中的 `canonicalKey`。校验阶段应根据 `siteId`、`resourceKey`、`originalUrl` 和当前格式版本重新计算，并在不一致时报告错误或修复预览。分类需要先校验父子引用、最大深度和环，再校验条目的 `collectionId` 引用。

替换导入应先在内存或临时数据库完成校验，确认后在单事务中清空并写入业务 Store。不能先清空再校验。

## 10. 版本迁移

- `formatVersion` 是导入导出协议主版本；不兼容变更时递增；
- IndexedDB 数据库版本独立管理，不写入导出文件；
- 同一主格式版本可以新增可选字段；读取器忽略未知字段；
- 未来版本的导出器应继续生成确定性字段顺序，便于版本控制和人工比较。

## 11. 示例

完整示例见 [reading-bookmarks.example.json](../examples/reading-bookmarks.example.json)，机器校验定义见 [bookmark-library-export.schema.json](../schemas/bookmark-library-export.schema.json)。
