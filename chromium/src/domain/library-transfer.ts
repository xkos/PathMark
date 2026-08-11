import type { AppSettings, Collection, Item, QueryPolicy, Site } from "./models";
import { identifyUrl, normalizeEndpoint } from "./identity";

export const EXPORT_FORMAT = "reading-bookmarks" as const;
export const EXPORT_FORMAT_VERSION = 1 as const;

export interface LibraryExportDocument {
  format: typeof EXPORT_FORMAT;
  formatVersion: typeof EXPORT_FORMAT_VERSION;
  exportedAt: string;
  app: { name: string; version: string };
  settings: AppSettings;
  collections: Collection[];
  sites: Site[];
  items: Item[];
}

export type ImportMode = "merge" | "replace";
export type SameIdImportPolicy = "newer" | "incoming";
export type ImportEntityKind = "collections" | "sites" | "items";

export interface ImportActionCounts {
  added: number;
  updated: number;
  skipped: number;
}

export interface ImportPreview {
  mode: ImportMode;
  sameIdPolicy: SameIdImportPolicy;
  document: LibraryExportDocument | null;
  counts: { collections: number; sites: number; items: number; archivedItems: number };
  actions: ImportActionCounts;
  conflicts: string[];
  errors: string[];
  canApply: boolean;
  plan: ImportPlan | null;
}

export interface ImportPlan {
  collections: Collection[];
  sites: Site[];
  items: Item[];
  settings: AppSettings | null;
}

export interface ExistingLibraryData {
  collections: Collection[];
  sites: Site[];
  items: Item[];
  settings: AppSettings;
}

export function createExportDocument(
  data: ExistingLibraryData,
  exportedAt: string,
  appVersion: string,
): LibraryExportDocument {
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt,
    app: { name: "Local Reading Library", version: appVersion },
    settings: structuredClone(data.settings),
    collections: structuredClone(data.collections),
    sites: structuredClone(data.sites),
    items: structuredClone(data.items),
  };
}

export function previewLibraryImport(
  raw: unknown,
  mode: ImportMode,
  existing: ExistingLibraryData,
  sameIdPolicy: SameIdImportPolicy = "newer",
): ImportPreview {
  const errors: string[] = [];
  const document = parseDocument(raw, errors);
  const empty = { collections: 0, sites: 0, items: 0, archivedItems: 0 };
  if (!document) return { mode, sameIdPolicy, document: null, counts: empty, actions: zeroActions(), conflicts: [], errors, canApply: false, plan: null };

  validateConsistency(document, errors);
  const counts = {
    collections: document.collections.length,
    sites: document.sites.length,
    items: document.items.length,
    archivedItems: document.items.filter((item) => item.isArchived).length,
  };
  const conflicts: string[] = [];
  const plan = errors.length ? null : buildPlan(document, mode, existing, sameIdPolicy, conflicts, errors);
  const actions = plan ? countActions(document, mode, existing, sameIdPolicy, plan) : zeroActions();
  return {
    mode,
    sameIdPolicy,
    document,
    counts,
    actions,
    conflicts,
    errors,
    canApply: Boolean(plan && !conflicts.length && !errors.length),
    plan: plan && !conflicts.length && !errors.length ? plan : null,
  };
}

function parseDocument(raw: unknown, errors: string[]): LibraryExportDocument | null {
  let value = raw;
  if (typeof raw === "string") {
    try { value = JSON.parse(raw); } catch { errors.push("文件不是合法的 JSON"); return null; }
  }
  if (!isRecord(value)) { errors.push("导入文件顶层必须是对象"); return null; }
  if (value.format !== EXPORT_FORMAT) errors.push(`不支持的文件格式：${String(value.format ?? "缺失")}`);
  if (value.formatVersion !== EXPORT_FORMAT_VERSION) errors.push(`不支持的主格式版本：${String(value.formatVersion ?? "缺失")}`);
  requireDate(value.exportedAt, "exportedAt", errors);
  if (!isRecord(value.app) || !nonEmptyString(value.app.name) || !nonEmptyString(value.app.version)) errors.push("app.name 和 app.version 为必填字符串");
  const settings = parseSettings(value.settings, errors);
  const collections = parseArray(value.collections, "collections", errors, parseCollection);
  const sites = parseArray(value.sites, "sites", errors, parseSite);
  const items = parseArray(value.items, "items", errors, parseItem);
  if (!settings || !collections || !sites || !items || errors.length) return null;
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: value.exportedAt as string,
    app: { name: (value.app as Record<string, unknown>).name as string, version: (value.app as Record<string, unknown>).version as string },
    settings,
    collections,
    sites,
    items,
  };
}

function parseCollection(value: unknown, path: string, errors: string[]): Collection | null {
  if (!isRecord(value)) return invalid(path, "必须是对象", errors);
  const required = ["id", "name", "parentId", "sortOrder", "createdAt", "updatedAt"];
  if (!hasRequired(value, required, path, errors)) return null;
  if (!uuid(value.id)) errors.push(`${path}.id 必须是 UUID`);
  if (!nonEmptyString(value.name)) errors.push(`${path}.name 不能为空`);
  if (value.parentId !== null && !uuid(value.parentId)) errors.push(`${path}.parentId 必须是 UUID 或 null`);
  if (!nonNegativeInteger(value.sortOrder)) errors.push(`${path}.sortOrder 必须是非负整数`);
  requireDate(value.createdAt, `${path}.createdAt`, errors); requireDate(value.updatedAt, `${path}.updatedAt`, errors);
  return errorsAtPath(errors, path) ? null : value as unknown as Collection;
}

function parseSite(value: unknown, path: string, errors: string[]): Site | null {
  if (!isRecord(value)) return invalid(path, "必须是对象", errors);
  const required = ["id", "name", "description", "endpoints", "queryPolicy", "createdAt", "updatedAt"];
  if (!hasRequired(value, required, path, errors)) return null;
  if (!uuid(value.id)) errors.push(`${path}.id 必须是 UUID`);
  if (!nonEmptyString(value.name)) errors.push(`${path}.name 不能为空`);
  if (typeof value.description !== "string") errors.push(`${path}.description 必须是字符串`);
  const endpoints = parseArray(value.endpoints, `${path}.endpoints`, errors, parseEndpoint);
  const queryPolicy = parseQueryPolicy(value.queryPolicy, `${path}.queryPolicy`, errors);
  requireDate(value.createdAt, `${path}.createdAt`, errors); requireDate(value.updatedAt, `${path}.updatedAt`, errors);
  if (!endpoints || !queryPolicy || errorsAtPath(errors, path)) return null;
  return { ...(value as unknown as Site), endpoints, queryPolicy };
}

function parseEndpoint(value: unknown, path: string, errors: string[]): Site["endpoints"][number] | null {
  if (!isRecord(value)) return invalid(path, "必须是对象", errors);
  if (!hasRequired(value, ["id", "prefix", "priority", "enabled", "createdAt", "updatedAt"], path, errors)) return null;
  if (!uuid(value.id)) errors.push(`${path}.id 必须是 UUID`);
  if (!httpUrl(value.prefix)) errors.push(`${path}.prefix 必须是 HTTP(S) URL`);
  else { try { normalizeEndpoint(value.prefix as string); } catch (error) { errors.push(`${path}.prefix：${error instanceof Error ? error.message : String(error)}`); } }
  if (!nonNegativeInteger(value.priority)) errors.push(`${path}.priority 必须是非负整数`);
  if (typeof value.enabled !== "boolean") errors.push(`${path}.enabled 必须是布尔值`);
  requireDate(value.createdAt, `${path}.createdAt`, errors); requireDate(value.updatedAt, `${path}.updatedAt`, errors);
  return errorsAtPath(errors, path) ? null : value as unknown as Site["endpoints"][number];
}

function parseItem(value: unknown, path: string, errors: string[]): Item | null {
  if (!isRecord(value)) return invalid(path, "必须是对象", errors);
  const required = ["id", "title", "note", "tags", "collectionId", "siteId", "resourceKey", "canonicalKey", "originalUrl", "lastResolvedUrl", "readingState", "isArchived", "createdAt", "updatedAt", "firstReadAt", "readAt", "lastOpenedAt", "openCount"];
  if (!hasRequired(value, required, path, errors)) return null;
  if (!uuid(value.id)) errors.push(`${path}.id 必须是 UUID`);
  if (!nonEmptyString(value.title)) errors.push(`${path}.title 不能为空`);
  if (typeof value.note !== "string") errors.push(`${path}.note 必须是字符串`);
  if (!stringArray(value.tags, true)) errors.push(`${path}.tags 必须是无重复非空字符串数组`);
  if (value.collectionId !== null && !uuid(value.collectionId)) errors.push(`${path}.collectionId 必须是 UUID 或 null`);
  if (value.siteId !== null && !uuid(value.siteId)) errors.push(`${path}.siteId 必须是 UUID 或 null`);
  if (value.siteId === null ? value.resourceKey !== null : typeof value.resourceKey !== "string" || !value.resourceKey.startsWith("/")) errors.push(`${path}.resourceKey 与 siteId 不一致`);
  if (typeof value.canonicalKey !== "string" || !/^v1:(site|url):/.test(value.canonicalKey)) errors.push(`${path}.canonicalKey 格式错误`);
  if (!httpUrl(value.originalUrl)) errors.push(`${path}.originalUrl 必须是 HTTP(S) URL`);
  if (value.lastResolvedUrl !== null && !httpUrl(value.lastResolvedUrl)) errors.push(`${path}.lastResolvedUrl 必须是 HTTP(S) URL 或 null`);
  if (!(["unread", "reading", "read"] as unknown[]).includes(value.readingState)) errors.push(`${path}.readingState 无效`);
  if (typeof value.isArchived !== "boolean") errors.push(`${path}.isArchived 必须是布尔值`);
  requireDate(value.createdAt, `${path}.createdAt`, errors); requireDate(value.updatedAt, `${path}.updatedAt`, errors);
  for (const field of ["firstReadAt", "readAt", "lastOpenedAt"] as const) if (value[field] !== null) requireDate(value[field], `${path}.${field}`, errors);
  if (!nonNegativeInteger(value.openCount)) errors.push(`${path}.openCount 必须是非负整数`);
  if (value.readingState === "read" && (value.firstReadAt === null || value.readAt === null)) errors.push(`${path} 已读条目必须包含 firstReadAt 和 readAt`);
  if (value.readingState !== "read" && value.readAt !== null) errors.push(`${path} 非已读条目的 readAt 必须为 null`);
  return errorsAtPath(errors, path) ? null : value as unknown as Item;
}

function parseSettings(value: unknown, errors: string[]): AppSettings | null {
  const path = "settings";
  if (!isRecord(value)) return invalid(path, "必须是对象", errors);
  if (!hasRequired(value, ["globalIgnoredQueryParams", "stripTrailingSlash", "defaultReadingState", "defaultView"], path, errors)) return null;
  if (!stringArray(value.globalIgnoredQueryParams, true)) errors.push(`${path}.globalIgnoredQueryParams 必须是无重复非空字符串数组`);
  if (typeof value.stripTrailingSlash !== "boolean") errors.push(`${path}.stripTrailingSlash 必须是布尔值`);
  if (!(["unread", "reading", "read"] as unknown[]).includes(value.defaultReadingState)) errors.push(`${path}.defaultReadingState 无效`);
  if (!(["inbox", "unread", "all"] as unknown[]).includes(value.defaultView)) errors.push(`${path}.defaultView 无效`);
  return errorsAtPath(errors, path) ? null : value as unknown as AppSettings;
}

function parseQueryPolicy(value: unknown, path: string, errors: string[]): QueryPolicy | null {
  if (!isRecord(value)) return invalid(path, "必须是对象", errors);
  if (value.mode === "keep-all-except-ignored" && stringArray(value.ignoredParams, true)) return { mode: value.mode, ignoredParams: value.ignoredParams as string[] };
  if (value.mode === "keep-only-identity" && stringArray(value.identityParams, true)) return { mode: value.mode, identityParams: value.identityParams as string[] };
  errors.push(`${path} 查询参数策略无效`); return null;
}

function validateConsistency(document: LibraryExportDocument, errors: string[]): void {
  uniqueIds(document.collections, "分类", errors); uniqueIds(document.sites, "站点", errors); uniqueIds(document.items, "条目", errors);
  const collectionIds = new Set(document.collections.map((entity) => entity.id));
  const siteIds = new Set(document.sites.map((entity) => entity.id));
  const siblingNames = new Set<string>();
  for (const collection of document.collections) {
    const key = `${collection.parentId ?? "root"}\n${collection.name.trim().toLocaleLowerCase()}`;
    if (siblingNames.has(key)) errors.push(`同一父分类下存在同名分类：“${collection.name}”`);
    siblingNames.add(key);
  }
  const endpointIds = new Set<string>(); const endpointOwners = new Map<string, string>();
  for (const site of document.sites) for (const endpoint of site.endpoints) {
    if (endpointIds.has(endpoint.id)) errors.push(`Endpoint ID 重复：${endpoint.id}`); endpointIds.add(endpoint.id);
    const prefix = normalizeEndpoint(endpoint.prefix); const owner = endpointOwners.get(prefix);
    if (owner) errors.push(`Endpoint 重复配置：${prefix}`); endpointOwners.set(prefix, site.id);
    if (Date.parse(endpoint.createdAt) > Date.parse(endpoint.updatedAt)) errors.push(`Endpoint ${prefix} 的 createdAt 晚于 updatedAt`);
  }
  for (const site of document.sites) if (Date.parse(site.createdAt) > Date.parse(site.updatedAt)) errors.push(`站点“${site.name}”的 createdAt 晚于 updatedAt`);
  for (const collection of document.collections) {
    if (collection.parentId && !collectionIds.has(collection.parentId)) errors.push(`分类“${collection.name}”引用了不存在的父分类`);
    validateCollectionDepth(collection, document.collections, errors);
    if (Date.parse(collection.createdAt) > Date.parse(collection.updatedAt)) errors.push(`分类“${collection.name}”的 createdAt 晚于 updatedAt`);
  }
  const canonicalKeys = new Set<string>();
  for (const item of document.items) {
    if (item.collectionId && !collectionIds.has(item.collectionId)) errors.push(`条目“${item.title}”引用了不存在的分类`);
    if (item.siteId && !siteIds.has(item.siteId)) errors.push(`条目“${item.title}”引用了不存在的站点`);
    if (canonicalKeys.has(item.canonicalKey)) errors.push(`多个导入条目共享规范键：${item.canonicalKey}`); canonicalKeys.add(item.canonicalKey);
    if (Date.parse(item.createdAt) > Date.parse(item.updatedAt)) errors.push(`条目“${item.title}”的 createdAt 晚于 updatedAt`);
    if (new Set(item.tags.map((tag) => tag.trim().toLocaleLowerCase())).size !== item.tags.length) errors.push(`条目“${item.title}”包含大小写不同的重复标签`);
    if (item.firstReadAt && item.readAt && Date.parse(item.firstReadAt) > Date.parse(item.readAt)) errors.push(`条目“${item.title}”的 firstReadAt 晚于 readAt`);
    const expected = item.siteId && item.resourceKey
      ? `v1:site:${item.siteId}:${encodeURIComponent(item.resourceKey)}`
      : identifyUrl(item.originalUrl, [], document.settings).canonicalKey;
    if (item.canonicalKey !== expected) errors.push(`条目“${item.title}”的 canonicalKey 与重算结果不一致`);
  }
}

function buildPlan(document: LibraryExportDocument, mode: ImportMode, existing: ExistingLibraryData, sameIdPolicy: SameIdImportPolicy, conflicts: string[], errors: string[]): ImportPlan {
  if (mode === "replace") return { collections: document.collections, sites: document.sites, items: document.items, settings: document.settings };
  const collections = planEntities(document.collections, existing.collections, sameIdPolicy);
  const sites = planEntities(document.sites, existing.sites, sameIdPolicy);
  const items = planEntities(document.items, existing.items, sameIdPolicy);
  const incomingCollectionIds = new Set([...existing.collections, ...collections].map((entity) => entity.id));
  const incomingSiteIds = new Set([...existing.sites, ...sites].map((entity) => entity.id));
  for (const collection of collections) if (collection.parentId && !incomingCollectionIds.has(collection.parentId)) errors.push(`分类“${collection.name}”引用了本库和导入文件中均不存在的父分类`);
  for (const item of items) {
    if (item.collectionId && !incomingCollectionIds.has(item.collectionId)) errors.push(`条目“${item.title}”引用了本库和导入文件中均不存在的分类`);
    if (item.siteId && !incomingSiteIds.has(item.siteId)) errors.push(`条目“${item.title}”引用了本库和导入文件中均不存在的站点`);
  }
  detectCollectionConflicts(collections, existing.collections, conflicts);
  detectSiteConflicts(sites, existing.sites, conflicts);
  detectItemConflicts(items, existing.items, conflicts);
  return { collections, sites, items, settings: null };
}

function planEntities<T extends { id: string; updatedAt: string }>(incoming: T[], existing: T[], sameIdPolicy: SameIdImportPolicy): T[] {
  const existingById = new Map(existing.map((entity) => [entity.id, entity]));
  return incoming.filter((entity) => {
    const current = existingById.get(entity.id);
    return !current || sameIdPolicy === "incoming" || Date.parse(entity.updatedAt) > Date.parse(current.updatedAt);
  });
}

function detectCollectionConflicts(incoming: Collection[], existing: Collection[], conflicts: string[]): void {
  for (const entity of incoming) {
    const conflict = existing.find((candidate) => candidate.id !== entity.id && candidate.parentId === entity.parentId && candidate.name.trim().toLocaleLowerCase() === entity.name.trim().toLocaleLowerCase());
    if (conflict) conflicts.push(`分类冲突：“${entity.name}”与现有分类“${conflict.name}”位于同一父分类`);
  }
}

function detectSiteConflicts(incoming: Site[], existing: Site[], conflicts: string[]): void {
  for (const entity of incoming) {
    const signature = siteEndpointSignature(entity);
    const incomingPrefixes = new Set(entity.endpoints.map((endpoint) => normalizeEndpoint(endpoint.prefix)));
    const conflict = existing.find((candidate) => candidate.id !== entity.id && candidate.endpoints.some((endpoint) => incomingPrefixes.has(normalizeEndpoint(endpoint.prefix))));
    if (conflict) {
      const detail = siteEndpointSignature(conflict) === signature ? "Endpoint 集合相同" : "存在重复 Endpoint";
      conflicts.push(`站点冲突：“${entity.name}”与现有站点“${conflict.name}”${detail}`);
    }
  }
}

function detectItemConflicts(incoming: Item[], existing: Item[], conflicts: string[]): void {
  for (const entity of incoming) {
    const conflict = existing.find((candidate) => candidate.id !== entity.id && candidate.canonicalKey === entity.canonicalKey);
    if (conflict) conflicts.push(`条目冲突：“${entity.title}”与现有条目“${conflict.title}”共享规范键`);
  }
}

function countActions(document: LibraryExportDocument, mode: ImportMode, existing: ExistingLibraryData, sameIdPolicy: SameIdImportPolicy, plan: ImportPlan): ImportActionCounts {
  if (mode === "replace") return { added: document.collections.length + document.sites.length + document.items.length, updated: 0, skipped: 0 };
  let added = 0; let updated = 0; let skipped = 0;
  for (const [incoming, currentEntities] of [[document.collections, existing.collections], [document.sites, existing.sites], [document.items, existing.items]] as const) {
    const existingById = new Map<string, { updatedAt: string }>(currentEntities.map((entity) => [entity.id, entity]));
    for (const entity of incoming) {
      const current = existingById.get(entity.id);
      if (!current) added += 1; else if (sameIdPolicy === "incoming" || Date.parse(entity.updatedAt) > Date.parse(current.updatedAt)) updated += 1; else skipped += 1;
    }
  }
  void plan;
  return { added, updated, skipped };
}

function validateCollectionDepth(collection: Collection, all: Collection[], errors: string[]): void {
  const byId = new Map(all.map((item) => [item.id, item])); const visited = new Set<string>(); let current: Collection | undefined = collection; let depth = 0;
  while (current) { if (visited.has(current.id)) { errors.push(`分类“${collection.name}”形成循环引用`); return; } visited.add(current.id); depth += 1; if (depth > 5) { errors.push(`分类“${collection.name}”超过 5 层`); return; } current = current.parentId ? byId.get(current.parentId) : undefined; }
}

function siteEndpointSignature(site: Site): string { return site.endpoints.map((endpoint) => normalizeEndpoint(endpoint.prefix)).sort().join("\n"); }
function uniqueIds<T extends { id: string }>(entities: T[], label: string, errors: string[]): void { const seen = new Set<string>(); for (const entity of entities) { if (seen.has(entity.id)) errors.push(`${label} ID 重复：${entity.id}`); seen.add(entity.id); } }
function zeroActions(): ImportActionCounts { return { added: 0, updated: 0, skipped: 0 }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validDate(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function requireDate(value: unknown, path: string, errors: string[]): void { if (!validDate(value)) errors.push(`${path} 必须是 ISO 日期时间`); }
function httpUrl(value: unknown): value is string { if (typeof value !== "string") return false; try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }
function nonNegativeInteger(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0; }
function stringArray(value: unknown, unique: boolean): value is string[] { return Array.isArray(value) && value.every(nonEmptyString) && (!unique || new Set(value).size === value.length); }
function hasRequired(value: Record<string, unknown>, fields: string[], path: string, errors: string[]): boolean { const missing = fields.filter((field) => !(field in value)); if (missing.length) errors.push(`${path} 缺少必填字段：${missing.join("、")}`); return !missing.length; }
function errorsAtPath(errors: string[], path: string): boolean { return errors.some((error) => error.startsWith(path)); }
function invalid<T>(path: string, message: string, errors: string[]): T | null { errors.push(`${path} ${message}`); return null; }
function parseArray<T>(value: unknown, path: string, errors: string[], parser: (value: unknown, path: string, errors: string[]) => T | null): T[] | null { if (!Array.isArray(value)) return invalid(path, "必须是数组", errors); const result: T[] = []; value.forEach((entry, index) => { const parsed = parser(entry, `${path}[${index}]`, errors); if (parsed) result.push(parsed); }); return result.length === value.length ? result : null; }
