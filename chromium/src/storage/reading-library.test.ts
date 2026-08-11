import { afterEach, describe, expect, it } from "vitest";
import { ReadingLibraryDatabase } from "./database";
import { ReadingLibrary } from "./reading-library";
import { DEFAULT_SETTINGS, type Item } from "../domain/models";
import type { LibraryExportDocument } from "../domain/library-transfer";

const databases: ReadingLibraryDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.map((database) => database.delete()));
  databases.length = 0;
});

function createLibrary(): ReadingLibrary {
  const database = new ReadingLibraryDatabase(`test-${crypto.randomUUID()}`);
  databases.push(database);
  let nextId = 0;
  return new ReadingLibrary({
    database,
    now: () => "2026-08-11T10:00:00.000Z",
    createId: () => `id-${++nextId}`,
  });
}

describe("ReadingLibrary", () => {
  it("persists and recognizes a saved page without creating a duplicate", async () => {
    const library = createLibrary();
    await library.savePage({
      title: "Example",
      url: "https://example.com/paper/1?utm_source=test",
      note: "之后阅读",
      tags: ["论文", "论文"],
      collectionId: null,
      readingState: "unread",
    });

    const recognition = await library.recognize("https://example.com/paper/1");
    expect(recognition.item?.title).toBe("Example");
    expect(recognition.item?.tags).toEqual(["论文"]);
    expect(await library.database.items.count()).toBe(1);
  });

  it("preserves ever-read history after returning an item to unread", async () => {
    const library = createLibrary();
    const item = await library.savePage({
      title: "Example",
      url: "https://example.com/paper/1",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "read",
    });

    const unread = await library.setReadingState(item.id, "unread");
    expect(unread.firstReadAt).toBe("2026-08-11T10:00:00.000Z");
    expect(unread.readAt).toBeNull();
  });

  it("lets a background-style database connection recognize an item written by the popup connection", async () => {
    const databaseName = `test-${crypto.randomUUID()}`;
    const popupDatabase = new ReadingLibraryDatabase(databaseName);
    const backgroundDatabase = new ReadingLibraryDatabase(databaseName);
    databases.push(popupDatabase);
    const popupLibrary = new ReadingLibrary({
      database: popupDatabase,
      now: () => "2026-08-11T10:00:00.000Z",
      createId: () => "item-cross-context",
    });
    const backgroundLibrary = new ReadingLibrary({ database: backgroundDatabase });

    await popupLibrary.savePage({
      title: "百度一下",
      url: "https://www.baidu.com/?tn=68018901_16_pg",
      note: "测试",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });

    const recognition = await backgroundLibrary.recognize("https://www.baidu.com/?tn=68018901_16_pg");
    expect(recognition.item?.readingState).toBe("unread");

    backgroundDatabase.close();
  });

  it("previews old and new endpoints as the same site resource", async () => {
    const library = createLibrary();
    const draft = {
      id: "site-preview",
      name: "Example Papers",
      description: "",
      endpoints: [
        { prefix: "https://old.example.com/docs", enabled: true },
        { prefix: "https://new.example.org/archive", enabled: true },
      ],
      queryPolicy: { mode: "keep-all-except-ignored" as const, ignoredParams: [] },
    };

    const oldIdentity = await library.previewSiteUrl(draft, "https://old.example.com/docs/paper/123");
    const newIdentity = await library.previewSiteUrl(draft, "https://new.example.org/archive/paper/123");

    expect(oldIdentity.resourceKey).toBe("/paper/123");
    expect(newIdentity.resourceKey).toBe("/paper/123");
    expect(oldIdentity.canonicalKey).toBe(newIdentity.canonicalKey);
  });

  it("turns related items into unassigned items when deleting a site with that strategy", async () => {
    const library = createLibrary();
    const site = await library.saveSite({
      name: "Example Papers",
      description: "",
      endpoints: [{ prefix: "https://example.com/docs", enabled: true }],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
    });
    const item = await library.savePage({
      title: "Paper",
      url: "https://example.com/docs/paper/123",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });

    expect(item.siteId).toBe(site.id);
    expect(await library.deleteSite(site.id, "unassign-items")).toBe(1);

    const updated = await library.database.items.get(item.id);
    expect(updated?.siteId).toBeNull();
    expect(updated?.resourceKey).toBeNull();
    expect(updated?.canonicalKey).toContain("v1:url:");
  });

  it("previews identity and resolved-address changes before saving endpoint changes", async () => {
    const library = createLibrary();
    const site = await library.saveSite({
      name: "Example Papers",
      description: "",
      endpoints: [{ prefix: "https://old.example.com/docs", enabled: true }],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
    });
    await library.savePage({
      title: "Existing paper",
      url: "https://old.example.com/docs/paper/1",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });
    const candidate = await library.savePage({
      title: "New-domain paper",
      url: "https://new.example.org/archive/paper/2",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });

    const impact = await library.previewSiteChange({
      id: site.id,
      name: site.name,
      description: site.description,
      endpoints: [
        { prefix: "https://new.example.org/archive", enabled: true },
        { id: site.endpoints[0].id, prefix: site.endpoints[0].prefix, enabled: true },
      ],
      queryPolicy: site.queryPolicy,
    });

    expect(impact.associatedItemCount).toBe(1);
    expect(impact.resolutionChanges).toEqual([
      expect.objectContaining({
        title: "Existing paper",
        beforeUrl: "https://old.example.com/docs/paper/1",
        afterUrl: "https://new.example.org/archive/paper/1",
      }),
    ]);
    expect(impact.identityChanges).toEqual([
      expect.objectContaining({ itemId: candidate.id, after: expect.objectContaining({ siteId: site.id, resourceKey: "/paper/2" }) }),
    ]);
  });

  it("remaps selected items only after configuration is saved", async () => {
    const library = createLibrary();
    const item = await library.savePage({
      title: "Candidate",
      url: "https://new.example.org/archive/paper/2",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });
    const site = await library.saveSite({
      name: "Example Papers",
      description: "",
      endpoints: [{ prefix: "https://new.example.org/archive", enabled: true }],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
    });

    const [updated] = await library.remapItems([item.id]);
    expect(updated.siteId).toBe(site.id);
    expect(updated.resourceKey).toBe("/paper/2");
    expect(updated.canonicalKey).toContain(`v1:site:${site.id}:`);
  });

  it("blocks an explicit remap when two URLs collapse to the same canonical key", async () => {
    const library = createLibrary();
    const first = await library.savePage({
      title: "Old URL",
      url: "https://old.example.com/docs/paper/1",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });
    const second = await library.savePage({
      title: "New URL",
      url: "https://new.example.org/archive/paper/1",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });
    await library.saveSite({
      name: "Example Papers",
      description: "",
      endpoints: [
        { prefix: "https://old.example.com/docs", enabled: true },
        { prefix: "https://new.example.org/archive", enabled: true },
      ],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
    });

    await expect(library.remapItems([first.id, second.id])).rejects.toThrow("规范键冲突");
    expect((await library.database.items.get(first.id))?.siteId).toBeNull();
    expect((await library.database.items.get(second.id))?.siteId).toBeNull();
  });

  it("previews and applies a single-item migration to a matching target site", async () => {
    const library = createLibrary();
    const item = await library.savePage({
      title: "Candidate",
      url: "https://papers.example.com/docs/paper/7?utm_source=test&lang=zh",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });
    const site = await library.saveSite({
      name: "Papers",
      description: "",
      endpoints: [{ prefix: "https://papers.example.com/docs", enabled: true }],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
    });

    const preview = await library.previewItemMigration(item.id, site.id);
    expect(preview.before.kind).toBe("unassigned");
    expect(preview.after).toEqual(expect.objectContaining({ siteId: site.id, resourceKey: "/paper/7?lang=zh" }));
    expect(preview.conflictingItem).toBeNull();

    const migrated = await library.migrateItem(item.id, site.id);
    expect(migrated.siteId).toBe(site.id);
    expect(migrated.resourceKey).toBe("/paper/7?lang=zh");
  });

  it("rejects migration when the original URL does not match the target site", async () => {
    const library = createLibrary();
    const item = await library.savePage({
      title: "Other",
      url: "https://other.example.com/paper/1",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });
    const site = await library.saveSite({
      name: "Papers",
      description: "",
      endpoints: [{ prefix: "https://papers.example.com/docs", enabled: true }],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
    });

    await expect(library.previewItemMigration(item.id, site.id)).rejects.toThrow("未命中站点");
    expect((await library.database.items.get(item.id))?.siteId).toBeNull();
  });

  it("reports and blocks a single-item migration canonical-key conflict", async () => {
    const library = createLibrary();
    const existing = await library.savePage({
      title: "Existing",
      url: "https://papers.example.com/docs/paper/1",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });
    const candidate = await library.savePage({
      title: "Candidate",
      url: "https://mirror.example.org/archive/paper/1",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });
    const site = await library.saveSite({
      name: "Papers",
      description: "",
      endpoints: [
        { prefix: "https://papers.example.com/docs", enabled: true },
        { prefix: "https://mirror.example.org/archive", enabled: true },
      ],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
    });
    await library.migrateItem(existing.id, site.id);

    const preview = await library.previewItemMigration(candidate.id, site.id);
    expect(preview.conflictingItem).toEqual({ id: existing.id, title: "Existing" });
    await expect(library.migrateItem(candidate.id, site.id)).rejects.toThrow("规范键冲突");
    expect((await library.database.items.get(candidate.id))?.siteId).toBeNull();
  });

  it("moves items from a deleted collection subtree back to the inbox", async () => {
    const library = createLibrary();
    const root = await library.saveCollection({ name: "Research", parentId: null });
    const child = await library.saveCollection({ name: "Papers", parentId: root.id });
    const item = await library.savePage({
      title: "Paper",
      url: "https://example.com/paper/1",
      note: "",
      tags: [],
      collectionId: child.id,
      readingState: "unread",
    });

    const result = await library.deleteCollection(root.id, "move-items-to-inbox");
    expect(result).toEqual({ collections: 2, items: 1 });
    expect(await library.database.collections.count()).toBe(0);
    expect((await library.database.items.get(item.id))?.collectionId).toBeNull();
  });

  it("moves and archives multiple selected items in bulk", async () => {
    const library = createLibrary();
    const collection = await library.saveCollection({ name: "Later", parentId: null });
    const first = await library.savePage({
      title: "First",
      url: "https://example.com/first",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });
    const second = await library.savePage({
      title: "Second",
      url: "https://example.com/second",
      note: "",
      tags: [],
      collectionId: null,
      readingState: "unread",
    });

    await library.bulkMoveItems([first.id, second.id], collection.id);
    const archived = await library.bulkSetArchived([first.id, second.id], true);

    expect(archived.every((item) => item.collectionId === collection.id && item.isArchived)).toBe(true);
  });

  it("transactionally replaces the library after a valid import", async () => {
    const library = createLibrary();
    await library.savePage({ title: "Old", url: "https://old.example.com", note: "", tags: [], collectionId: null, readingState: "unread" });
    const importedItem: Item = {
      id: "44444444-4444-4444-8444-444444444444", title: "Imported", note: "", tags: [], collectionId: null,
      siteId: null, resourceKey: null, canonicalKey: `v1:url:${encodeURIComponent("https://new.example.com/")}`,
      originalUrl: "https://new.example.com/", lastResolvedUrl: null, readingState: "unread", isArchived: false,
      createdAt: "2026-08-10T10:00:00.000Z", updatedAt: "2026-08-10T10:00:00.000Z", firstReadAt: null,
      readAt: null, lastOpenedAt: null, openCount: 0,
    };
    const document: LibraryExportDocument = {
      format: "reading-bookmarks", formatVersion: 1, exportedAt: "2026-08-11T10:00:00.000Z",
      app: { name: "Test", version: "1.0.0" }, settings: structuredClone(DEFAULT_SETTINGS),
      collections: [], sites: [], items: [importedItem],
    };

    await library.applyImport(document, "replace");
    expect((await library.listItems()).map((item) => item.title)).toEqual(["Imported"]);
  });

  it("keeps existing data when replacement validation fails", async () => {
    const library = createLibrary();
    await library.savePage({ title: "Existing", url: "https://existing.example.com", note: "", tags: [], collectionId: null, readingState: "unread" });

    await expect(library.applyImport({ format: "reading-bookmarks", formatVersion: 99 }, "replace")).rejects.toThrow("格式版本");
    expect((await library.listItems()).map((item) => item.title)).toEqual(["Existing"]);
  });

  it("edits, records opening and deletes an item without changing its identity", async () => {
    const library = createLibrary();
    const item = await library.savePage({ title: "Draft", url: "https://example.com/paper/1", note: "", tags: [], collectionId: null, readingState: "unread" });
    const canonicalKey = item.canonicalKey;
    const edited = await library.updateItem(item.id, { title: "Final", note: "read it", tags: ["Paper", "paper"], collectionId: null, readingState: "read", isArchived: true });
    expect(edited).toEqual(expect.objectContaining({ title: "Final", tags: ["Paper"], readingState: "read", isArchived: true, canonicalKey }));

    const opened = await library.recordItemOpened(item.id, "https://mirror.example.com/paper/1");
    expect(opened).toEqual(expect.objectContaining({ openCount: 1, lastOpenedAt: "2026-08-11T10:00:00.000Z", lastResolvedUrl: "https://mirror.example.com/paper/1" }));
    expect(opened.updatedAt).toBe(edited.updatedAt);

    await library.deleteItem(item.id);
    expect(await library.database.items.get(item.id)).toBeUndefined();
  });

  it("saves normalization settings and clears all business data transactionally", async () => {
    const library = createLibrary();
    await library.savePage({ title: "Existing", url: "https://example.com", note: "", tags: [], collectionId: null, readingState: "unread" });
    await library.saveSettings({ ...DEFAULT_SETTINGS, globalIgnoredQueryParams: ["utm_*", "UTM_*", "ref"] });
    expect((await library.getSettings()).globalIgnoredQueryParams).toEqual(["utm_*", "ref"]);
    await library.clearAllData();
    expect(await library.database.items.count()).toBe(0);
    expect(await library.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
