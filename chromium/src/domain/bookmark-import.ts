import { identifyUrl, normalizeEndpoint } from "./identity";
import type { AppSettings, Collection, Item, ReadingState, Site, UUID } from "./models";
import { prepareSite, siteToDraft } from "./site-management";

export interface BookmarkCandidate {
  id: string;
  title: string;
  url: string;
  folderPath: string[];
  addedAt: string | null;
  origin: string;
}

export interface BookmarkFolderSummary {
  key: string;
  path: string[];
  itemCount: number;
}

export interface BookmarkImportSnapshot {
  candidates: BookmarkCandidate[];
  folders: BookmarkFolderSummary[];
  skipped: Array<{ title: string; url: string; reason: string }>;
  errors: string[];
}

export type BookmarkHtmlSnapshot = BookmarkImportSnapshot;

export interface BrowserBookmarkTreeNode {
  id: string;
  title: string;
  url?: string;
  dateAdded?: number;
  children?: BrowserBookmarkTreeNode[];
}

export interface BookmarkFolderRule {
  folderKey: string;
  selected: boolean;
  readingState: ReadingState;
  isArchived: boolean;
  collectionPath: string[];
}

export type BookmarkSiteTarget =
  | { type: "unassigned" }
  | { type: "existing"; siteId: UUID }
  | { type: "new"; siteName: string };

export interface BookmarkSiteMapping {
  origin: string;
  target: BookmarkSiteTarget;
}

export interface BookmarkImportRequest {
  candidates: BookmarkCandidate[];
  folderRules: BookmarkFolderRule[];
  siteMappings: BookmarkSiteMapping[];
}

export interface BookmarkImportPlan {
  collections: Collection[];
  sites: Site[];
  items: Item[];
}

export interface BookmarkImportPreview {
  plan: BookmarkImportPlan | null;
  selectedItems: number;
  addedItems: number;
  skippedExisting: number;
  collapsedDuplicates: number;
  createdCollections: number;
  createdSites: number;
  updatedSites: number;
  warnings: string[];
  errors: string[];
  canApply: boolean;
}

export interface BookmarkImportEnvironment {
  collections: Collection[];
  sites: Site[];
  items: Item[];
  settings: AppSettings;
  now: string;
  createId: () => UUID;
}

export function bookmarkFolderKey(path: string[]): string {
  return JSON.stringify(path);
}

export function parseBookmarkHtml(html: string): BookmarkHtmlSnapshot {
  const candidates: BookmarkCandidate[] = [];
  const skipped: BookmarkImportSnapshot["skipped"] = [];
  const errors: string[] = [];
  const folderPath: string[] = [];
  const dlFrames: boolean[] = [];
  let pendingFolder: string | null = null;
  let linkIndex = 0;
  const tokenPattern = /<\s*DL\b[^>]*>|<\s*\/\s*DL\s*>|<\s*H3\b[^>]*>([\s\S]*?)<\s*\/\s*H3\s*>|<\s*A\b([^>]*)>([\s\S]*?)<\s*\/\s*A\s*>/gi;

  for (const match of html.matchAll(tokenPattern)) {
    const token = match[0];
    if (/^<\s*H3\b/i.test(token)) {
      pendingFolder = cleanText(match[1] ?? "") || "未命名目录";
      continue;
    }
    if (/^<\s*DL\b/i.test(token)) {
      const opensFolder = pendingFolder !== null;
      if (pendingFolder !== null) folderPath.push(pendingFolder);
      dlFrames.push(opensFolder);
      pendingFolder = null;
      continue;
    }
    if (/^<\s*\/\s*DL/i.test(token)) {
      if (dlFrames.pop()) folderPath.pop();
      continue;
    }
    if (!/^<\s*A\b/i.test(token)) continue;

    const attributes = parseAttributes(match[2] ?? "");
    const url = decodeHtml(attributes.href ?? "").trim();
    const title = cleanText(match[3] ?? "") || url;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new Error("只支持 HTTP 和 HTTPS 链接");
      }
    } catch (error) {
      skipped.push({ title, url, reason: error instanceof Error ? error.message : "URL 无效" });
      continue;
    }

    candidates.push({
      id: `bookmark-${++linkIndex}`,
      title,
      url: parsedUrl.toString(),
      folderPath: [...folderPath],
      addedAt: parseBookmarkTimestamp(attributes.add_date),
      origin: normalizeEndpoint(`${parsedUrl.origin}/`),
    });
  }

  if (!/<\s*A\b/i.test(html)) errors.push("文件中没有找到浏览器收藏夹链接");
  if (!candidates.length && skipped.length) errors.push("文件中的链接都不是可导入的 HTTP 或 HTTPS 地址");

  return createSnapshot(candidates, skipped, errors);
}

export function parseBrowserBookmarkTree(roots: BrowserBookmarkTreeNode[]): BookmarkImportSnapshot {
  const candidates: BookmarkCandidate[] = [];
  const skipped: BookmarkImportSnapshot["skipped"] = [];
  const errors: string[] = [];

  const visit = (node: BrowserBookmarkTreeNode, parentPath: string[]) => {
    if (node.url !== undefined) {
      const title = node.title.trim() || node.url;
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(node.url);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new Error("只支持 HTTP 和 HTTPS 链接");
        }
      } catch (error) {
        skipped.push({ title, url: node.url, reason: error instanceof Error ? error.message : "URL 无效" });
        return;
      }
      candidates.push({
        id: `browser-bookmark-${node.id}`,
        title,
        url: parsedUrl.toString(),
        folderPath: [...parentPath],
        addedAt: parseBrowserBookmarkTimestamp(node.dateAdded),
        origin: normalizeEndpoint(`${parsedUrl.origin}/`),
      });
      return;
    }

    const folderPath = node.title.trim() ? [...parentPath, node.title.trim()] : parentPath;
    for (const child of node.children ?? []) visit(child, folderPath);
  };

  for (const root of roots) visit(root, []);
  if (!candidates.length) errors.push(
    skipped.length
      ? "浏览器收藏夹中的链接都不是可导入的 HTTP 或 HTTPS 地址"
      : "浏览器收藏夹中没有找到可导入的链接",
  );
  return createSnapshot(candidates, skipped, errors);
}

export function buildBookmarkImportPreview(
  request: BookmarkImportRequest,
  environment: BookmarkImportEnvironment,
): BookmarkImportPreview {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rules = new Map(request.folderRules.map((rule) => [rule.folderKey, rule]));
  const mappings = new Map(request.siteMappings.map((mapping) => [normalizeEndpoint(mapping.origin), mapping.target]));
  const selected = request.candidates.filter((candidate) => rules.get(bookmarkFolderKey(candidate.folderPath))?.selected);

  if (!selected.length) errors.push("至少选择一个包含链接的收藏夹目录");
  for (const rule of request.folderRules) {
    if (rule.collectionPath.length > 5) errors.push(`分类路径“${rule.collectionPath.join(" / ")}”超过 5 层`);
    if (rule.collectionPath.some((segment) => !segment.trim())) errors.push("分类路径不能包含空名称");
  }

  let workingSites = structuredClone(environment.sites);
  const sitesToPut: Site[] = [];
  let createdSites = 0;
  let updatedSites = 0;

  const existingTargets = new Map<string, string[]>();
  const newTargets = new Map<string, { name: string; origins: string[] }>();
  for (const origin of new Set(selected.map((candidate) => candidate.origin))) {
    const target = mappings.get(origin) ?? { type: "unassigned" as const };
    if (target.type === "existing") {
      const origins = existingTargets.get(target.siteId) ?? [];
      origins.push(origin);
      existingTargets.set(target.siteId, origins);
    } else if (target.type === "new") {
      const name = target.siteName.trim();
      if (!name) {
        errors.push(`域名 ${origin} 选择了新建站点，但没有填写站点名称`);
        continue;
      }
      const key = name.toLocaleLowerCase();
      const group = newTargets.get(key) ?? { name, origins: [] };
      group.origins.push(origin);
      newTargets.set(key, group);
    }
  }

  for (const [siteId, origins] of existingTargets) {
    const current = workingSites.find((site) => site.id === siteId);
    if (!current) {
      errors.push("站点映射引用了不存在的站点");
      continue;
    }
    const draft = siteToDraft(current);
    const known = new Set(draft.endpoints.map((endpoint) => normalizeEndpoint(endpoint.prefix)));
    for (const origin of origins) {
      if (!known.has(origin)) draft.endpoints.push({ prefix: origin, enabled: true });
      known.add(origin);
    }
    if (draft.endpoints.length === current.endpoints.length) continue;
    try {
      const updated = prepareSite(draft, { existingSites: workingSites, now: environment.now, createId: environment.createId });
      workingSites = [...workingSites.filter((site) => site.id !== updated.id), updated];
      sitesToPut.push(updated);
      updatedSites += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const group of newTargets.values()) {
    try {
      const created = prepareSite({
        name: group.name,
        description: "",
        endpoints: [...new Set(group.origins)].map((origin) => ({ prefix: origin, enabled: true })),
        queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
      }, { existingSites: workingSites, now: environment.now, createId: environment.createId });
      workingSites = [...workingSites, created];
      sitesToPut.push(created);
      createdSites += 1;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const workingCollections = structuredClone(environment.collections);
  const collectionsToPut: Collection[] = [];
  const collectionIdsByRule = new Map<string, string | null>();
  for (const rule of request.folderRules.filter((candidate) => candidate.selected)) {
    let parentId: string | null = null;
    for (const rawName of rule.collectionPath) {
      const name = rawName.trim();
      let collection = workingCollections.find((candidate) =>
        candidate.parentId === parentId && candidate.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
      if (!collection) {
        const siblings = workingCollections.filter((candidate) => candidate.parentId === parentId);
        collection = {
          id: environment.createId(), name, parentId,
          sortOrder: siblings.length ? Math.max(...siblings.map((candidate) => candidate.sortOrder)) + 1 : 0,
          createdAt: environment.now, updatedAt: environment.now,
        };
        workingCollections.push(collection);
        collectionsToPut.push(collection);
      }
      parentId = collection.id;
    }
    collectionIdsByRule.set(rule.folderKey, parentId);
  }

  const existingKeys = new Set(environment.items.map((item) => item.canonicalKey));
  const incomingByKey = new Map<string, { candidate: BookmarkCandidate; item: Item }>();
  let skippedExisting = 0;
  let collapsedDuplicates = 0;
  for (const candidate of selected) {
    const rule = rules.get(bookmarkFolderKey(candidate.folderPath));
    if (!rule) continue;
    try {
      const target = mappings.get(candidate.origin) ?? { type: "unassigned" as const };
      const identitySites = target.type === "unassigned"
        ? []
        : workingSites.filter((site) => target.type === "existing"
          ? site.id === target.siteId
          : site.name.trim().toLocaleLowerCase() === target.siteName.trim().toLocaleLowerCase());
      const identity = identifyUrl(candidate.url, identitySites, environment.settings);
      if (target.type !== "unassigned" && identity.kind !== "site") {
        errors.push(`链接“${candidate.title}”没有命中所选站点的 Endpoint`);
        continue;
      }
      if (existingKeys.has(identity.canonicalKey)) {
        skippedExisting += 1;
        continue;
      }
      const readAt = rule.readingState === "read" ? environment.now : null;
      const createdAt = candidate.addedAt && candidate.addedAt <= environment.now ? candidate.addedAt : environment.now;
      const item: Item = {
        id: environment.createId(),
        title: candidate.title.trim() || candidate.url,
        note: "",
        tags: [],
        collectionId: collectionIdsByRule.get(rule.folderKey) ?? null,
        siteId: identity.siteId,
        resourceKey: identity.resourceKey,
        canonicalKey: identity.canonicalKey,
        originalUrl: candidate.url,
        lastResolvedUrl: null,
        readingState: rule.readingState,
        isArchived: rule.isArchived,
        createdAt,
        updatedAt: environment.now,
        firstReadAt: readAt,
        readAt,
        lastOpenedAt: null,
        openCount: 0,
      };
      const previous = incomingByKey.get(item.canonicalKey);
      if (!previous) incomingByKey.set(item.canonicalKey, { candidate, item });
      else {
        collapsedDuplicates += 1;
        if (readingStateRank(item.readingState) > readingStateRank(previous.item.readingState)) {
          incomingByKey.set(item.canonicalKey, { candidate, item });
        }
      }
    } catch (error) {
      errors.push(`链接“${candidate.title}”：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (collapsedDuplicates) warnings.push(`有 ${collapsedDuplicates} 条重复链接被合并；状态冲突时保留已读程度更高的记录`);
  if (skippedExisting) warnings.push(`有 ${skippedExisting} 条链接已存在于资料库，将保持现有记录不变`);
  const items = [...incomingByKey.values()].map(({ item }) => item);
  const plan = errors.length ? null : { collections: collectionsToPut, sites: sitesToPut, items };
  return {
    plan,
    selectedItems: selected.length,
    addedItems: items.length,
    skippedExisting,
    collapsedDuplicates,
    createdCollections: collectionsToPut.length,
    createdSites,
    updatedSites,
    warnings,
    errors,
    canApply: Boolean(plan && items.length),
  };
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of raw.matchAll(pattern)) attributes[match[1].toLocaleLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  return attributes;
}

function parseBookmarkTimestamp(raw: string | undefined): string | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const date = new Date(Number(raw) * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseBrowserBookmarkTimestamp(raw: number | undefined): string | null {
  if (raw === undefined || !Number.isFinite(raw)) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function createSnapshot(
  candidates: BookmarkCandidate[],
  skipped: BookmarkImportSnapshot["skipped"],
  errors: string[],
): BookmarkImportSnapshot {
  const folderCounts = new Map<string, BookmarkFolderSummary>();
  for (const candidate of candidates) {
    const key = bookmarkFolderKey(candidate.folderPath);
    const current = folderCounts.get(key);
    if (current) current.itemCount += 1;
    else folderCounts.set(key, { key, path: [...candidate.folderPath], itemCount: 1 });
  }
  return {
    candidates,
    folders: [...folderCounts.values()].sort((left, right) =>
      left.path.join("/").localeCompare(right.path.join("/"), "zh-CN")),
    skipped,
    errors,
  };
}

function cleanText(raw: string): string {
  return decodeHtml(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(raw: string): string {
  return raw.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    const normalized = code.toLocaleLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "lt") return "<";
    if (normalized === "gt") return ">";
    if (normalized === "quot") return "\"";
    if (normalized === "apos") return "'";
    if (normalized === "nbsp") return " ";
    const value = normalized.startsWith("#x") ? Number.parseInt(normalized.slice(2), 16) : Number.parseInt(normalized.slice(1), 10);
    return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
  });
}

function readingStateRank(state: ReadingState): number {
  return state === "read" ? 2 : state === "reading" ? 1 : 0;
}
