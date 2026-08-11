import type { Collection, Item, ReadingState, SavePageInput, Site } from "../domain/models";
import type { Table } from "dexie";
import { DEFAULT_SETTINGS } from "../domain/models";
import { identifyUrl, type UrlIdentity } from "../domain/identity";
import { transitionReadingState } from "../domain/reading";
import { prepareSite, SiteConfigurationError, type SiteDraft } from "../domain/site-management";
import { resolveResourceUrl } from "../domain/address-resolution";
import {
  collectDescendantIds,
  CollectionConfigurationError,
  prepareCollection,
  type CollectionDraft,
} from "../domain/collection-management";
import {
  createExportDocument,
  previewLibraryImport,
  type ExistingLibraryData,
  type ImportMode,
  type ImportPreview,
  type LibraryExportDocument,
  type SameIdImportPolicy,
} from "../domain/library-transfer";
import { ReadingLibraryDatabase } from "./database";

export interface PageRecognition {
  identity: UrlIdentity;
  item: Item | null;
}

export type DeleteSiteStrategy = "unassign-items" | "delete-items";
export type DeleteCollectionStrategy = "move-items-to-inbox" | "delete-items";

export interface SiteIdentityImpact {
  itemId: string;
  title: string;
  before: UrlIdentity;
  after: UrlIdentity;
  hasConflict: boolean;
}

export interface SiteResolutionImpact {
  itemId: string;
  title: string;
  beforeUrl: string | null;
  afterUrl: string | null;
}

export interface SiteChangeImpact {
  site: Site;
  associatedItemCount: number;
  identityChanges: SiteIdentityImpact[];
  resolutionChanges: SiteResolutionImpact[];
}

export interface ItemMigrationPreview {
  itemId: string;
  title: string;
  targetSiteId: string | null;
  before: UrlIdentity;
  after: UrlIdentity;
  conflictingItem: Pick<Item, "id" | "title"> | null;
}

export interface ReadingLibraryOptions {
  database?: ReadingLibraryDatabase;
  now?: () => string;
  createId?: () => string;
}

export interface ItemUpdateInput {
  title: string;
  note: string;
  tags: string[];
  collectionId: string | null;
  readingState: ReadingState;
  isArchived: boolean;
}

export interface CollectionItemStats { total: number; unread: number }

export class ReadingLibrary {
  readonly database: ReadingLibraryDatabase;
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(options: ReadingLibraryOptions = {}) {
    this.database = options.database ?? new ReadingLibraryDatabase();
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  async recognize(url: string): Promise<PageRecognition> {
    const [sites, settingsRecord] = await Promise.all([
      this.database.sites.toArray(),
      this.database.settings.get("app"),
    ]);
    const identity = identifyUrl(url, sites, settingsRecord?.value ?? DEFAULT_SETTINGS);
    const item = (await this.database.items.where("canonicalKey").equals(identity.canonicalKey).first()) ?? null;
    return { identity, item };
  }

  async savePage(input: SavePageInput): Promise<Item> {
    const recognition = await this.recognize(input.url);
    const now = this.now();
    const tags = normalizeTags(input.tags);

    if (recognition.item) {
      const updatedState = transitionReadingState(recognition.item, input.readingState, now);
      const updated: Item = {
        ...updatedState,
        title: input.title.trim() || recognition.item.title,
        note: input.note.trim(),
        tags,
        collectionId: input.collectionId,
        updatedAt: now,
      };
      await this.database.items.put(updated);
      return updated;
    }

    const readAt = input.readingState === "read" ? now : null;
    const item: Item = {
      id: this.createId(),
      title: input.title.trim() || input.url,
      note: input.note.trim(),
      tags,
      collectionId: input.collectionId,
      siteId: recognition.identity.siteId,
      resourceKey: recognition.identity.resourceKey,
      canonicalKey: recognition.identity.canonicalKey,
      originalUrl: input.url,
      lastResolvedUrl: null,
      readingState: input.readingState,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      firstReadAt: readAt,
      readAt,
      lastOpenedAt: null,
      openCount: 0,
    };
    await this.database.items.add(item);
    return item;
  }

  async setReadingState(itemId: string, state: ReadingState): Promise<Item> {
    const item = await this.database.items.get(itemId);
    if (!item) throw new Error("收藏条目不存在");
    const updated = transitionReadingState(item, state, this.now());
    await this.database.items.put(updated);
    return updated;
  }

  async updateItem(itemId: string, input: ItemUpdateInput): Promise<Item> {
    return this.database.transaction("rw", this.database.items, this.database.collections, async () => {
      const item = await this.database.items.get(itemId);
      if (!item) throw new Error("收藏条目不存在或已被删除");
      if (input.collectionId && !(await this.database.collections.get(input.collectionId))) throw new Error("目标分类不存在或已被删除");
      const title = input.title.trim();
      if (!title) throw new Error("标题不能为空");
      const updated: Item = {
        ...transitionReadingState(item, input.readingState, this.now()),
        title,
        note: input.note.trim(),
        tags: normalizeTags(input.tags),
        collectionId: input.collectionId,
        isArchived: input.isArchived,
        updatedAt: this.now(),
      };
      await this.database.items.put(updated);
      return updated;
    });
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.database.items.delete(itemId);
  }

  async recordItemOpened(itemId: string, resolvedUrl: string): Promise<Item> {
    const item = await this.database.items.get(itemId);
    if (!item) throw new Error("收藏条目不存在或已被删除");
    const updated: Item = {
      ...item,
      lastResolvedUrl: resolvedUrl,
      lastOpenedAt: this.now(),
      openCount: item.openCount + 1,
    };
    await this.database.items.put(updated);
    return updated;
  }

  async listItems(): Promise<Item[]> {
    return this.database.items.orderBy("createdAt").reverse().toArray();
  }

  async listSites(): Promise<Site[]> {
    const sites = await this.database.sites.toArray();
    return sites.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }

  async listCollections(): Promise<Collection[]> {
    const collections = await this.database.collections.toArray();
    return collections.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"));
  }

  async getSettings(): Promise<typeof DEFAULT_SETTINGS> {
    return (await this.database.settings.get("app"))?.value ?? structuredClone(DEFAULT_SETTINGS);
  }

  async saveSettings(settings: typeof DEFAULT_SETTINGS): Promise<void> {
    const normalized = {
      globalIgnoredQueryParams: normalizeTags(settings.globalIgnoredQueryParams),
      stripTrailingSlash: settings.stripTrailingSlash,
      defaultReadingState: settings.defaultReadingState,
      defaultView: settings.defaultView,
    };
    await this.database.settings.put({ id: "app", value: normalized });
  }

  async clearAllData(): Promise<void> {
    await this.database.transaction("rw", this.database.collections, this.database.sites, this.database.items, this.database.settings, async () => {
      await Promise.all([this.database.collections.clear(), this.database.sites.clear(), this.database.items.clear(), this.database.settings.clear()]);
    });
  }

  async exportLibrary(appVersion = getAppVersion()): Promise<LibraryExportDocument> {
    return createExportDocument(await this.readAllData(), this.now(), appVersion);
  }

  async previewImport(raw: unknown, mode: ImportMode, sameIdPolicy: SameIdImportPolicy = "newer"): Promise<ImportPreview> {
    return previewLibraryImport(raw, mode, await this.readAllData(), sameIdPolicy);
  }

  async applyImport(raw: unknown, mode: ImportMode, sameIdPolicy: SameIdImportPolicy = "newer"): Promise<ImportPreview> {
    return this.database.transaction(
      "rw",
      this.database.collections,
      this.database.sites,
      this.database.items,
      this.database.settings,
      async () => {
        const preview = previewLibraryImport(raw, mode, await this.readAllData(), sameIdPolicy);
        if (!preview.canApply || !preview.plan) {
          throw new Error([...preview.errors, ...preview.conflicts].join("\n") || "导入校验未通过");
        }
        if (mode === "replace") {
          await Promise.all([
            this.database.collections.clear(),
            this.database.sites.clear(),
            this.database.items.clear(),
            this.database.settings.clear(),
          ]);
        }
        await this.database.collections.bulkPut(preview.plan.collections);
        await this.database.sites.bulkPut(preview.plan.sites);
        await this.database.items.bulkPut(preview.plan.items);
        if (preview.plan.settings) await this.database.settings.put({ id: "app", value: preview.plan.settings });
        return preview;
      },
    );
  }

  async saveCollection(draft: CollectionDraft): Promise<Collection> {
    const existingCollections = await this.database.collections.toArray();
    const collection = prepareCollection(draft, {
      existingCollections,
      now: this.now(),
      createId: this.createId,
    });
    await this.database.collections.put(collection);
    return collection;
  }

  async moveCollection(collectionId: string, direction: -1 | 1): Promise<void> {
    await this.database.transaction("rw", this.database.collections, async () => {
      const collection = await this.database.collections.get(collectionId);
      if (!collection) throw new CollectionConfigurationError("分类不存在或已被删除");
      const siblings = (await this.database.collections.toArray())
        .filter((candidate) => candidate.parentId === collection.parentId)
        .sort((left, right) => left.sortOrder - right.sortOrder);
      const index = siblings.findIndex((candidate) => candidate.id === collectionId);
      const other = siblings[index + direction];
      if (!other) return;
      const now = this.now();
      await this.database.collections.bulkPut([
        { ...collection, sortOrder: other.sortOrder, updatedAt: now },
        { ...other, sortOrder: collection.sortOrder, updatedAt: now },
      ]);
    });
  }

  async countItemsForCollectionTree(collectionId: string): Promise<number> {
    const collections = await this.database.collections.toArray();
    const ids = collectDescendantIds(collectionId, collections);
    ids.add(collectionId);
    return this.database.items.filter((item) => item.collectionId !== null && ids.has(item.collectionId)).count();
  }

  async getCollectionItemStats(): Promise<Record<string, CollectionItemStats>> {
    const [collections, items] = await Promise.all([this.database.collections.toArray(), this.database.items.toArray()]);
    return Object.fromEntries(collections.map((collection) => {
      const ids = collectDescendantIds(collection.id, collections); ids.add(collection.id);
      const matching = items.filter((item) => item.collectionId !== null && ids.has(item.collectionId));
      return [collection.id, { total: matching.length, unread: matching.filter((item) => !item.isArchived && item.readingState !== "read").length }];
    }));
  }

  async deleteCollection(collectionId: string, strategy: DeleteCollectionStrategy): Promise<{ collections: number; items: number }> {
    return this.database.transaction("rw", this.database.collections, this.database.items, async () => {
      const collections = await this.database.collections.toArray();
      if (!collections.some((collection) => collection.id === collectionId)) {
        throw new CollectionConfigurationError("分类不存在或已被删除");
      }
      const collectionIds = collectDescendantIds(collectionId, collections);
      collectionIds.add(collectionId);
      const impactedItems = await this.database.items
        .filter((item) => item.collectionId !== null && collectionIds.has(item.collectionId))
        .toArray();
      if (strategy === "delete-items") {
        await this.database.items.bulkDelete(impactedItems.map((item) => item.id));
      } else {
        const now = this.now();
        await this.database.items.bulkPut(impactedItems.map((item) => ({ ...item, collectionId: null, updatedAt: now })));
      }
      await this.database.collections.bulkDelete([...collectionIds]);
      return { collections: collectionIds.size, items: impactedItems.length };
    });
  }

  async bulkMoveItems(itemIds: string[], collectionId: string | null): Promise<Item[]> {
    return this.updateItems(itemIds, async (items) => {
      if (collectionId && !(await this.database.collections.get(collectionId))) {
        throw new CollectionConfigurationError("目标分类不存在或已被删除");
      }
      const now = this.now();
      return items.map((item) => ({ ...item, collectionId, updatedAt: now }));
    }, [this.database.collections]);
  }

  async bulkSetArchived(itemIds: string[], isArchived: boolean): Promise<Item[]> {
    return this.updateItems(itemIds, (items) => {
      const now = this.now();
      return items.map((item) => ({ ...item, isArchived, updatedAt: now }));
    });
  }

  async saveSite(draft: SiteDraft): Promise<Site> {
    const existingSites = await this.database.sites.toArray();
    const site = prepareSite(draft, {
      existingSites,
      now: this.now(),
      createId: this.createId,
    });
    await this.database.sites.put(site);
    return site;
  }

  async previewSiteUrl(draft: SiteDraft, url: string): Promise<UrlIdentity> {
    const [existingSites, settingsRecord] = await Promise.all([
      this.database.sites.toArray(),
      this.database.settings.get("app"),
    ]);
    const site = prepareSite(draft, {
      existingSites,
      now: this.now(),
      createId: this.createId,
    });
    const sites = [...existingSites.filter((candidate) => candidate.id !== site.id), site];
    return identifyUrl(url, sites, settingsRecord?.value ?? DEFAULT_SETTINGS);
  }

  async previewSiteChange(draft: SiteDraft): Promise<SiteChangeImpact> {
    const [existingSites, items, settingsRecord] = await Promise.all([
      this.database.sites.toArray(),
      this.database.items.toArray(),
      this.database.settings.get("app"),
    ]);
    const site = prepareSite(draft, {
      existingSites,
      now: this.now(),
      createId: this.createId,
    });
    const settings = settingsRecord?.value ?? DEFAULT_SETTINGS;
    const previousSite = existingSites.find((candidate) => candidate.id === site.id);
    const proposedSites = [...existingSites.filter((candidate) => candidate.id !== site.id), site];
    const proposedIdentities = new Map<string, UrlIdentity>();

    const identityChanges = items.flatMap((item) => {
      const recognizedBefore = identifyUrl(item.originalUrl, existingSites, settings);
      const before = identityFromStoredItem(item, recognizedBefore, existingSites);
      const after = identifyUrl(item.originalUrl, proposedSites, settings);
      proposedIdentities.set(item.id, after);
      return sameIdentity(before, after) ? [] : [{ itemId: item.id, title: item.title, before, after, hasConflict: false }];
    });

    const proposedKeyOwners = new Map<string, string[]>();
    for (const item of items) {
      const identity = proposedIdentities.get(item.id) ?? identifyUrl(item.originalUrl, proposedSites, settings);
      const owners = proposedKeyOwners.get(identity.canonicalKey) ?? [];
      owners.push(item.id);
      proposedKeyOwners.set(identity.canonicalKey, owners);
    }
    for (const impact of identityChanges) {
      impact.hasConflict = (proposedKeyOwners.get(impact.after.canonicalKey)?.length ?? 0) > 1;
    }

    const associatedItems = items.filter((item) => item.siteId === site.id && item.resourceKey);
    const resolutionChanges = associatedItems.flatMap((item) => {
      const beforeUrl = previousSite && item.resourceKey ? resolveResourceUrl(previousSite, item.resourceKey) : null;
      const afterUrl = item.resourceKey ? resolveResourceUrl(site, item.resourceKey) : null;
      return beforeUrl === afterUrl ? [] : [{ itemId: item.id, title: item.title, beforeUrl, afterUrl }];
    });

    return {
      site,
      associatedItemCount: associatedItems.length,
      identityChanges,
      resolutionChanges,
    };
  }

  async remapItems(itemIds: string[]): Promise<Item[]> {
    const uniqueItemIds = [...new Set(itemIds)];
    if (!uniqueItemIds.length) return [];

    return this.database.transaction("rw", this.database.items, this.database.sites, this.database.settings, async () => {
      const [items, sites, settingsRecord] = await Promise.all([
        this.database.items.bulkGet(uniqueItemIds),
        this.database.sites.toArray(),
        this.database.settings.get("app"),
      ]);
      if (items.some((item) => !item)) throw new SiteConfigurationError("部分待重映射条目不存在");

      const settings = settingsRecord?.value ?? DEFAULT_SETTINGS;
      const selectedIds = new Set(uniqueItemIds);
      const unaffectedItems = await this.database.items.filter((item) => !selectedIds.has(item.id)).toArray();
      const occupiedKeys = new Set(unaffectedItems.map((item) => item.canonicalKey));
      const updates = items.map((item) => {
        const existing = item!;
        const identity = identifyUrl(existing.originalUrl, sites, settings);
        if (occupiedKeys.has(identity.canonicalKey)) {
          throw new SiteConfigurationError(`条目“${existing.title}”重映射后会产生规范键冲突`);
        }
        occupiedKeys.add(identity.canonicalKey);
        return {
          ...existing,
          siteId: identity.siteId,
          resourceKey: identity.resourceKey,
          canonicalKey: identity.canonicalKey,
          updatedAt: this.now(),
        } satisfies Item;
      });
      await this.database.items.bulkPut(updates);
      return updates;
    });
  }

  async previewItemMigration(itemId: string, targetSiteId: string | null): Promise<ItemMigrationPreview> {
    const [item, sites, settingsRecord] = await Promise.all([
      this.database.items.get(itemId),
      this.database.sites.toArray(),
      this.database.settings.get("app"),
    ]);
    if (!item) throw new SiteConfigurationError("收藏条目不存在或已被删除");

    const settings = settingsRecord?.value ?? DEFAULT_SETTINGS;
    const recognizedBefore = identifyUrl(item.originalUrl, sites, settings);
    const before = identityFromStoredItem(item, recognizedBefore, sites);
    const after = identifyItemForTargetSite(item, targetSiteId, sites, settings);
    const conflictingItem = await this.database.items.where("canonicalKey").equals(after.canonicalKey).first();

    return {
      itemId: item.id,
      title: item.title,
      targetSiteId,
      before,
      after,
      conflictingItem: conflictingItem && conflictingItem.id !== item.id
        ? { id: conflictingItem.id, title: conflictingItem.title }
        : null,
    };
  }

  async migrateItem(itemId: string, targetSiteId: string | null): Promise<Item> {
    return this.database.transaction("rw", this.database.items, this.database.sites, this.database.settings, async () => {
      const [item, sites, settingsRecord] = await Promise.all([
        this.database.items.get(itemId),
        this.database.sites.toArray(),
        this.database.settings.get("app"),
      ]);
      if (!item) throw new SiteConfigurationError("收藏条目不存在或已被删除");

      const identity = identifyItemForTargetSite(
        item,
        targetSiteId,
        sites,
        settingsRecord?.value ?? DEFAULT_SETTINGS,
      );
      const conflictingItem = await this.database.items.where("canonicalKey").equals(identity.canonicalKey).first();
      if (conflictingItem && conflictingItem.id !== item.id) {
        throw new SiteConfigurationError(`迁移后会与条目“${conflictingItem.title}”产生规范键冲突`);
      }

      const updated: Item = {
        ...item,
        siteId: identity.siteId,
        resourceKey: identity.resourceKey,
        canonicalKey: identity.canonicalKey,
        updatedAt: this.now(),
      };
      await this.database.items.put(updated);
      return updated;
    });
  }

  async countItemsForSite(siteId: string): Promise<number> {
    return this.database.items.where("siteId").equals(siteId).count();
  }

  async deleteSite(siteId: string, strategy: DeleteSiteStrategy): Promise<number> {
    return this.database.transaction("rw", this.database.sites, this.database.items, this.database.settings, async () => {
      const site = await this.database.sites.get(siteId);
      if (!site) throw new SiteConfigurationError("站点不存在或已被删除");

      const impactedItems = await this.database.items.where("siteId").equals(siteId).toArray();
      if (strategy === "delete-items") {
        await this.database.items.bulkDelete(impactedItems.map((item) => item.id));
      } else {
        const settingsRecord = await this.database.settings.get("app");
        const settings = settingsRecord?.value ?? DEFAULT_SETTINGS;
        const unaffectedItems = await this.database.items.filter((item) => item.siteId !== siteId).toArray();
        const occupiedKeys = new Set(unaffectedItems.map((item) => item.canonicalKey));
        const updates = impactedItems.map((item) => {
          const identity = identifyUrl(item.originalUrl, [], settings);
          if (occupiedKeys.has(identity.canonicalKey)) {
            throw new SiteConfigurationError(`条目“${item.title}”转为未归站后会产生规范键冲突`);
          }
          occupiedKeys.add(identity.canonicalKey);
          return {
            ...item,
            siteId: null,
            resourceKey: null,
            canonicalKey: identity.canonicalKey,
            updatedAt: this.now(),
          } satisfies Item;
        });
        await this.database.items.bulkPut(updates);
      }

      await this.database.sites.delete(siteId);
      return impactedItems.length;
    });
  }

  private async updateItems(
    itemIds: string[],
    update: (items: Item[]) => Item[] | Promise<Item[]>,
    extraTables: Table[] = [],
  ): Promise<Item[]> {
    const uniqueIds = [...new Set(itemIds)];
    if (!uniqueIds.length) return [];
    return this.database.transaction("rw", [this.database.items, ...extraTables], async () => {
      const records = await this.database.items.bulkGet(uniqueIds);
      if (records.some((item) => !item)) throw new Error("部分收藏条目不存在或已被删除");
      const updated = await update(records as Item[]);
      await this.database.items.bulkPut(updated);
      return updated;
    });
  }

  private async readAllData(): Promise<ExistingLibraryData> {
    const [collections, sites, items, settingsRecord] = await Promise.all([
      this.database.collections.toArray(),
      this.database.sites.toArray(),
      this.database.items.toArray(),
      this.database.settings.get("app"),
    ]);
    return { collections, sites, items, settings: settingsRecord?.value ?? DEFAULT_SETTINGS };
  }
}

function sameIdentity(left: UrlIdentity, right: UrlIdentity): boolean {
  return (
    left.siteId === right.siteId &&
    left.endpointId === right.endpointId &&
    left.resourceKey === right.resourceKey &&
    left.canonicalKey === right.canonicalKey
  );
}

function identityFromStoredItem(item: Item, recognized: UrlIdentity, sites: Site[]): UrlIdentity {
  const site = item.siteId ? sites.find((candidate) => candidate.id === item.siteId) : undefined;
  const recognizedEndpointBelongsToStoredSite = recognized.siteId === item.siteId;
  return {
    kind: item.siteId ? "site" : "unassigned",
    normalizedUrl: recognized.normalizedUrl,
    canonicalKey: item.canonicalKey,
    siteId: item.siteId,
    siteName: site?.name ?? null,
    endpointId: recognizedEndpointBelongsToStoredSite ? recognized.endpointId : null,
    endpointPrefix: recognizedEndpointBelongsToStoredSite ? recognized.endpointPrefix : null,
    resourceKey: item.resourceKey,
  };
}

function identifyItemForTargetSite(
  item: Item,
  targetSiteId: string | null,
  sites: Site[],
  settings: typeof DEFAULT_SETTINGS,
): UrlIdentity {
  if (targetSiteId === null) return identifyUrl(item.originalUrl, [], settings);
  const targetSite = sites.find((site) => site.id === targetSiteId);
  if (!targetSite) throw new SiteConfigurationError("目标站点不存在或已被删除");
  const identity = identifyUrl(item.originalUrl, [targetSite], settings);
  if (identity.siteId !== targetSiteId) {
    throw new SiteConfigurationError(`原始 URL 未命中站点“${targetSite.name}”的任何已启用 Endpoint`);
  }
  return identity;
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawTag of tags) {
    const tag = rawTag.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
  }
  return normalized;
}

function getAppVersion(): string {
  try { return chrome.runtime.getManifest().version; } catch { return "0.1.0"; }
}
