import type { AppSettings, Collection, Item, QueryPolicy, Site } from "./models";
import { appErrorMessage, type AppErrorCode, type AppErrorValues } from "./app-error";
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
    try { value = JSON.parse(raw); } catch { errors.push(appErrorMessage("invalidJson")); return null; }
  }
  if (!isRecord(value)) { errors.push(appErrorMessage("importRootObject")); return null; }
  if (value.format !== EXPORT_FORMAT) errors.push(appErrorMessage("unsupportedFileFormat", { value: String(value.format ?? "missing") }));
  if (value.formatVersion !== EXPORT_FORMAT_VERSION) errors.push(appErrorMessage("unsupportedFormatVersion", { value: String(value.formatVersion ?? "missing") }));
  requireDate(value.exportedAt, "exportedAt", errors);
  if (!isRecord(value.app) || !nonEmptyString(value.app.name) || !nonEmptyString(value.app.version)) errors.push(appErrorMessage("appMetadataRequired"));
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
  if (!isRecord(value)) return invalid(path, "validationObject", errors);
  const required = ["id", "name", "parentId", "sortOrder", "createdAt", "updatedAt"];
  if (!hasRequired(value, required, path, errors)) return null;
  if (!uuid(value.id)) errors.push(pathIssue(`${path}.id`, "validationUuid"));
  if (value.color !== undefined && (typeof value.color !== "string" || !/^#[0-9a-f]{6}$/i.test(value.color))) errors.push(pathIssue(`${path}.color`, "validationInvalid"));
  if (!nonEmptyString(value.name)) errors.push(pathIssue(`${path}.name`, "validationRequired"));
  if (value.parentId !== null && !uuid(value.parentId)) errors.push(pathIssue(`${path}.parentId`, "validationUuidOrNull"));
  if (!nonNegativeInteger(value.sortOrder)) errors.push(pathIssue(`${path}.sortOrder`, "validationNonNegativeInteger"));
  requireDate(value.createdAt, `${path}.createdAt`, errors); requireDate(value.updatedAt, `${path}.updatedAt`, errors);
  return errorsAtPath(errors, path) ? null : value as unknown as Collection;
}

function parseSite(value: unknown, path: string, errors: string[]): Site | null {
  if (!isRecord(value)) return invalid(path, "validationObject", errors);
  const required = ["id", "name", "description", "endpoints", "queryPolicy", "createdAt", "updatedAt"];
  if (!hasRequired(value, required, path, errors)) return null;
  if (!uuid(value.id)) errors.push(pathIssue(`${path}.id`, "validationUuid"));
  if (!nonEmptyString(value.name)) errors.push(pathIssue(`${path}.name`, "validationRequired"));
  if (typeof value.description !== "string") errors.push(pathIssue(`${path}.description`, "validationString"));
  const endpoints = parseArray(value.endpoints, `${path}.endpoints`, errors, parseEndpoint);
  const queryPolicy = parseQueryPolicy(value.queryPolicy, `${path}.queryPolicy`, errors);
  requireDate(value.createdAt, `${path}.createdAt`, errors); requireDate(value.updatedAt, `${path}.updatedAt`, errors);
  if (!endpoints || !queryPolicy || errorsAtPath(errors, path)) return null;
  return { ...(value as unknown as Site), endpoints, queryPolicy };
}

function parseEndpoint(value: unknown, path: string, errors: string[]): Site["endpoints"][number] | null {
  if (!isRecord(value)) return invalid(path, "validationObject", errors);
  if (!hasRequired(value, ["id", "prefix", "priority", "enabled", "createdAt", "updatedAt"], path, errors)) return null;
  if (!uuid(value.id)) errors.push(pathIssue(`${path}.id`, "validationUuid"));
  if (!httpUrl(value.prefix)) errors.push(pathIssue(`${path}.prefix`, "validationHttpUrl"));
  else { try { normalizeEndpoint(value.prefix as string); } catch (error) { errors.push(`${path}.prefix: ${error instanceof Error ? error.message : String(error)}`); } }
  if (!nonNegativeInteger(value.priority)) errors.push(pathIssue(`${path}.priority`, "validationNonNegativeInteger"));
  if (typeof value.enabled !== "boolean") errors.push(pathIssue(`${path}.enabled`, "validationBoolean"));
  requireDate(value.createdAt, `${path}.createdAt`, errors); requireDate(value.updatedAt, `${path}.updatedAt`, errors);
  return errorsAtPath(errors, path) ? null : value as unknown as Site["endpoints"][number];
}

function parseItem(value: unknown, path: string, errors: string[]): Item | null {
  if (!isRecord(value)) return invalid(path, "validationObject", errors);
  const required = ["id", "title", "note", "tags", "collectionId", "siteId", "resourceKey", "canonicalKey", "originalUrl", "lastResolvedUrl", "readingState", "isArchived", "createdAt", "updatedAt", "firstReadAt", "readAt", "lastOpenedAt", "openCount"];
  if (!hasRequired(value, required, path, errors)) return null;
  if (!uuid(value.id)) errors.push(pathIssue(`${path}.id`, "validationUuid"));
  if (!nonEmptyString(value.title)) errors.push(pathIssue(`${path}.title`, "validationRequired"));
  if (typeof value.note !== "string") errors.push(pathIssue(`${path}.note`, "validationString"));
  if (!stringArray(value.tags, true)) errors.push(pathIssue(`${path}.tags`, "validationUniqueStrings"));
  if (value.collectionId !== null && !uuid(value.collectionId)) errors.push(pathIssue(`${path}.collectionId`, "validationUuidOrNull"));
  if (value.siteId !== null && !uuid(value.siteId)) errors.push(pathIssue(`${path}.siteId`, "validationUuidOrNull"));
  if (value.siteId === null ? value.resourceKey !== null : typeof value.resourceKey !== "string" || !value.resourceKey.startsWith("/")) errors.push(pathIssue(`${path}.resourceKey`, "resourceKeySiteMismatch"));
  if (typeof value.canonicalKey !== "string" || !/^v1:(site|url):/.test(value.canonicalKey)) errors.push(pathIssue(`${path}.canonicalKey`, "validationInvalid"));
  if (!httpUrl(value.originalUrl)) errors.push(pathIssue(`${path}.originalUrl`, "validationHttpUrl"));
  if (value.lastResolvedUrl !== null && !httpUrl(value.lastResolvedUrl)) errors.push(pathIssue(`${path}.lastResolvedUrl`, "validationHttpUrlOrNull"));
  if (!(["unread", "reading", "read"] as unknown[]).includes(value.readingState)) errors.push(pathIssue(`${path}.readingState`, "validationInvalid"));
  if (typeof value.isArchived !== "boolean") errors.push(pathIssue(`${path}.isArchived`, "validationBoolean"));
  requireDate(value.createdAt, `${path}.createdAt`, errors); requireDate(value.updatedAt, `${path}.updatedAt`, errors);
  for (const field of ["firstReadAt", "readAt", "lastOpenedAt"] as const) if (value[field] !== null) requireDate(value[field], `${path}.${field}`, errors);
  if (!nonNegativeInteger(value.openCount)) errors.push(pathIssue(`${path}.openCount`, "validationNonNegativeInteger"));
  if (value.readingState === "read" && (value.firstReadAt === null || value.readAt === null)) errors.push(pathIssue(path, "readDatesRequired"));
  if (value.readingState !== "read" && value.readAt !== null) errors.push(pathIssue(path, "unreadReadAtNull"));
  return errorsAtPath(errors, path) ? null : value as unknown as Item;
}

function parseSettings(value: unknown, errors: string[]): AppSettings | null {
  const path = "settings";
  if (!isRecord(value)) return invalid(path, "validationObject", errors);
  if (!hasRequired(value, ["globalIgnoredQueryParams", "stripTrailingSlash", "defaultReadingState", "defaultView"], path, errors)) return null;
  if (!stringArray(value.globalIgnoredQueryParams, true)) errors.push(pathIssue(`${path}.globalIgnoredQueryParams`, "validationUniqueStrings"));
  if (typeof value.stripTrailingSlash !== "boolean") errors.push(pathIssue(`${path}.stripTrailingSlash`, "validationBoolean"));
  if (!(["unread", "reading", "read"] as unknown[]).includes(value.defaultReadingState)) errors.push(pathIssue(`${path}.defaultReadingState`, "validationInvalid"));
  if (!(["inbox", "unread", "all"] as unknown[]).includes(value.defaultView)) errors.push(pathIssue(`${path}.defaultView`, "validationInvalid"));
  return errorsAtPath(errors, path) ? null : value as unknown as AppSettings;
}

function parseQueryPolicy(value: unknown, path: string, errors: string[]): QueryPolicy | null {
  if (!isRecord(value)) return invalid(path, "validationObject", errors);
  if (value.mode === "keep-all-except-ignored" && stringArray(value.ignoredParams, true)) return { mode: value.mode, ignoredParams: value.ignoredParams as string[] };
  if (value.mode === "keep-only-identity" && stringArray(value.identityParams, true)) return { mode: value.mode, identityParams: value.identityParams as string[] };
  errors.push(pathIssue(path, "queryPolicyInvalid")); return null;
}

function validateConsistency(document: LibraryExportDocument, errors: string[]): void {
  uniqueIds(document.collections, "collection", errors); uniqueIds(document.sites, "site", errors); uniqueIds(document.items, "item", errors);
  const collectionIds = new Set(document.collections.map((entity) => entity.id));
  const siteIds = new Set(document.sites.map((entity) => entity.id));
  const siblingNames = new Set<string>();
  for (const collection of document.collections) {
    const key = `${collection.parentId ?? "root"}\n${collection.name.trim().toLocaleLowerCase()}`;
    if (siblingNames.has(key)) errors.push(appErrorMessage("duplicateSiblingCollection", { name: collection.name }));
    siblingNames.add(key);
  }
  const endpointIds = new Set<string>(); const endpointOwners = new Map<string, string>();
  for (const site of document.sites) for (const endpoint of site.endpoints) {
    if (endpointIds.has(endpoint.id)) errors.push(appErrorMessage("duplicateId", { entity: "Endpoint", id: endpoint.id })); endpointIds.add(endpoint.id);
    const prefix = normalizeEndpoint(endpoint.prefix); const owner = endpointOwners.get(prefix);
    if (owner) errors.push(appErrorMessage("duplicateEndpoint", { endpoint: prefix })); endpointOwners.set(prefix, site.id);
    if (Date.parse(endpoint.createdAt) > Date.parse(endpoint.updatedAt)) errors.push(appErrorMessage("createdAfterUpdated", { entity: `Endpoint ${prefix}` }));
  }
  for (const site of document.sites) if (Date.parse(site.createdAt) > Date.parse(site.updatedAt)) errors.push(appErrorMessage("createdAfterUpdated", { entity: site.name }));
  for (const collection of document.collections) {
    if (collection.parentId && !collectionIds.has(collection.parentId)) errors.push(appErrorMessage("missingReference", { entity: collection.name, target: "parentId" }));
    validateCollectionDepth(collection, document.collections, errors);
    if (Date.parse(collection.createdAt) > Date.parse(collection.updatedAt)) errors.push(appErrorMessage("createdAfterUpdated", { entity: collection.name }));
  }
  const canonicalKeys = new Set<string>();
  for (const item of document.items) {
    if (item.collectionId && !collectionIds.has(item.collectionId)) errors.push(appErrorMessage("missingReference", { entity: item.title, target: "collectionId" }));
    if (item.siteId && !siteIds.has(item.siteId)) errors.push(appErrorMessage("missingReference", { entity: item.title, target: "siteId" }));
    if (canonicalKeys.has(item.canonicalKey)) errors.push(appErrorMessage("duplicateCanonicalKey", { key: item.canonicalKey })); canonicalKeys.add(item.canonicalKey);
    if (Date.parse(item.createdAt) > Date.parse(item.updatedAt)) errors.push(appErrorMessage("createdAfterUpdated", { entity: item.title }));
    if (new Set(item.tags.map((tag) => tag.trim().toLocaleLowerCase())).size !== item.tags.length) errors.push(appErrorMessage("duplicateTags", { title: item.title }));
    if (item.firstReadAt && item.readAt && Date.parse(item.firstReadAt) > Date.parse(item.readAt)) errors.push(appErrorMessage("firstReadAfterRead", { title: item.title }));
    const expected = item.siteId && item.resourceKey
      ? `v1:site:${item.siteId}:${encodeURIComponent(item.resourceKey)}`
      : identifyUrl(item.originalUrl, [], document.settings).canonicalKey;
    if (item.canonicalKey !== expected) errors.push(appErrorMessage("canonicalKeyMismatch", { title: item.title }));
  }
}

function buildPlan(document: LibraryExportDocument, mode: ImportMode, existing: ExistingLibraryData, sameIdPolicy: SameIdImportPolicy, conflicts: string[], errors: string[]): ImportPlan {
  if (mode === "replace") return { collections: document.collections, sites: document.sites, items: document.items, settings: document.settings };
  const collections = planEntities(document.collections, existing.collections, sameIdPolicy);
  const sites = planEntities(document.sites, existing.sites, sameIdPolicy);
  const items = planEntities(document.items, existing.items, sameIdPolicy);
  const incomingCollectionIds = new Set([...existing.collections, ...collections].map((entity) => entity.id));
  const incomingSiteIds = new Set([...existing.sites, ...sites].map((entity) => entity.id));
  for (const collection of collections) if (collection.parentId && !incomingCollectionIds.has(collection.parentId)) errors.push(appErrorMessage("mergeMissingReference", { entity: collection.name, target: "parentId" }));
  for (const item of items) {
    if (item.collectionId && !incomingCollectionIds.has(item.collectionId)) errors.push(appErrorMessage("mergeMissingReference", { entity: item.title, target: "collectionId" }));
    if (item.siteId && !incomingSiteIds.has(item.siteId)) errors.push(appErrorMessage("mergeMissingReference", { entity: item.title, target: "siteId" }));
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
    if (conflict) conflicts.push(appErrorMessage("collectionImportConflict", { name: entity.name, existing: conflict.name }));
  }
}

function detectSiteConflicts(incoming: Site[], existing: Site[], conflicts: string[]): void {
  for (const entity of incoming) {
    const signature = siteEndpointSignature(entity);
    const incomingPrefixes = new Set(entity.endpoints.map((endpoint) => normalizeEndpoint(endpoint.prefix)));
    const conflict = existing.find((candidate) => candidate.id !== entity.id && candidate.endpoints.some((endpoint) => incomingPrefixes.has(normalizeEndpoint(endpoint.prefix))));
    if (conflict) {
      const code = siteEndpointSignature(conflict) === signature
        ? "siteImportConflictSameEndpoints"
        : "siteImportConflictDuplicateEndpoint";
      conflicts.push(appErrorMessage(code, { name: entity.name, existing: conflict.name }));
    }
  }
}

function detectItemConflicts(incoming: Item[], existing: Item[], conflicts: string[]): void {
  for (const entity of incoming) {
    const conflict = existing.find((candidate) => candidate.id !== entity.id && candidate.canonicalKey === entity.canonicalKey);
    if (conflict) conflicts.push(appErrorMessage("itemImportConflict", { title: entity.title, existing: conflict.title }));
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
  while (current) { if (visited.has(current.id)) { errors.push(appErrorMessage("collectionCycleNamed", { name: collection.name })); return; } visited.add(current.id); depth += 1; if (depth > 5) { errors.push(appErrorMessage("collectionTooDeepNamed", { name: collection.name })); return; } current = current.parentId ? byId.get(current.parentId) : undefined; }
}

function siteEndpointSignature(site: Site): string { return site.endpoints.map((endpoint) => normalizeEndpoint(endpoint.prefix)).sort().join("\n"); }
function uniqueIds<T extends { id: string }>(entities: T[], label: string, errors: string[]): void { const seen = new Set<string>(); for (const entity of entities) { if (seen.has(entity.id)) errors.push(appErrorMessage("duplicateId", { entity: label, id: entity.id })); seen.add(entity.id); } }
function zeroActions(): ImportActionCounts { return { added: 0, updated: 0, skipped: 0 }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function nonEmptyString(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function validDate(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function requireDate(value: unknown, path: string, errors: string[]): void { if (!validDate(value)) errors.push(pathIssue(path, "validationIsoDate")); }
function httpUrl(value: unknown): value is string { if (typeof value !== "string") return false; try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; } }
function nonNegativeInteger(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0; }
function stringArray(value: unknown, unique: boolean): value is string[] { return Array.isArray(value) && value.every(nonEmptyString) && (!unique || new Set(value).size === value.length); }
function hasRequired(value: Record<string, unknown>, fields: string[], path: string, errors: string[]): boolean { const missing = fields.filter((field) => !(field in value)); if (missing.length) errors.push(pathIssue(path, "validationMissingFields", { fields: missing.join(", ") })); return !missing.length; }
function errorsAtPath(errors: string[], path: string): boolean { return errors.some((error) => error.startsWith(path)); }
function invalid<T>(path: string, code: AppErrorCode, errors: string[]): T | null { errors.push(pathIssue(path, code)); return null; }
function pathIssue(path: string, code: AppErrorCode, values: AppErrorValues = {}): string { return `${path}: ${appErrorMessage(code, values)}`; }
function parseArray<T>(value: unknown, path: string, errors: string[], parser: (value: unknown, path: string, errors: string[]) => T | null): T[] | null { if (!Array.isArray(value)) return invalid(path, "validationArray", errors); const result: T[] = []; value.forEach((entry, index) => { const parsed = parser(entry, `${path}[${index}]`, errors); if (parsed) result.push(parsed); }); return result.length === value.length ? result : null; }
