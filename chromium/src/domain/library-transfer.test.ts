import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Item } from "./models";
import {
  createExportDocument,
  previewLibraryImport,
  type ExistingLibraryData,
  type LibraryExportDocument,
} from "./library-transfer";
import documentedExample from "../../../docs/me2ai/examples/reading-bookmarks.example.json";

const ids = {
  collection: "11111111-1111-4111-8111-111111111111",
  site: "22222222-2222-4222-8222-222222222222",
  endpoint: "33333333-3333-4333-8333-333333333333",
  item: "44444444-4444-4444-8444-444444444444",
};
const timestamp = "2026-08-11T10:00:00.000Z";

function documentFixture(): LibraryExportDocument {
  return {
    format: "reading-bookmarks",
    formatVersion: 1,
    exportedAt: timestamp,
    app: { name: "Test", version: "1.0.0" },
    settings: structuredClone(DEFAULT_SETTINGS),
    collections: [{ id: ids.collection, name: "论文", parentId: null, sortOrder: 0, createdAt: timestamp, updatedAt: timestamp }],
    sites: [{
      id: ids.site,
      name: "Papers",
      description: "",
      endpoints: [{ id: ids.endpoint, prefix: "https://papers.example.com/docs", priority: 0, enabled: true, createdAt: timestamp, updatedAt: timestamp }],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
    items: [{
      id: ids.item,
      title: "Paper",
      note: "",
      tags: ["research"],
      collectionId: ids.collection,
      siteId: ids.site,
      resourceKey: "/paper/1",
      canonicalKey: `v1:site:${ids.site}:${encodeURIComponent("/paper/1")}`,
      originalUrl: "https://papers.example.com/docs/paper/1",
      lastResolvedUrl: null,
      readingState: "unread",
      isArchived: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      firstReadAt: null,
      readAt: null,
      lastOpenedAt: null,
      openCount: 0,
    }],
  };
}

function emptyData(): ExistingLibraryData {
  return { collections: [], sites: [], items: [], settings: structuredClone(DEFAULT_SETTINGS) };
}

describe("library transfer", () => {
  it("accepts the protected documented exchange example", () => {
    const preview = previewLibraryImport(documentedExample, "replace", emptyData());
    expect(preview.errors).toEqual([]);
    expect(preview.canApply).toBe(true);
  });

  it("creates a complete export including archived items", () => {
    const source = documentFixture();
    const result = createExportDocument({ collections: source.collections, sites: source.sites, items: source.items, settings: source.settings }, timestamp, "0.1.0");
    expect(result).toEqual(expect.objectContaining({ format: "reading-bookmarks", formatVersion: 1, exportedAt: timestamp }));
    expect(result.items).toHaveLength(1);
    expect(result.items[0].isArchived).toBe(true);
  });

  it("previews a valid replacement before writing", () => {
    const preview = previewLibraryImport(documentFixture(), "replace", emptyData());
    expect(preview.canApply).toBe(true);
    expect(preview.counts).toEqual({ collections: 1, sites: 1, items: 1, archivedItems: 1 });
    expect(preview.actions).toEqual({ added: 3, updated: 0, skipped: 0 });
  });

  it("rejects unsupported versions and a tampered canonical key", () => {
    const unsupported = { ...documentFixture(), formatVersion: 2 };
    expect(previewLibraryImport(unsupported, "replace", emptyData()).errors).toContain("不支持的主格式版本：2");

    const tampered = documentFixture();
    tampered.items[0].canonicalKey = "v1:url:tampered";
    expect(previewLibraryImport(tampered, "replace", emptyData()).errors.join("\n")).toContain("与重算结果不一致");
  });

  it("uses updatedAt for same-id merge updates and skips", () => {
    const incoming = documentFixture();
    incoming.items[0].updatedAt = "2026-08-12T10:00:00.000Z";
    const existingItem: Item = { ...incoming.items[0], title: "Old title", updatedAt: timestamp };
    const existing = { ...emptyData(), collections: incoming.collections, sites: incoming.sites, items: [existingItem] };
    const preview = previewLibraryImport(incoming, "merge", existing);
    expect(preview.canApply).toBe(true);
    expect(preview.actions).toEqual({ added: 0, updated: 1, skipped: 2 });
    expect(preview.plan?.items[0].title).toBe("Paper");
  });

  it("blocks cross-id collection, site and item conflicts", () => {
    const incoming = documentFixture();
    const existing = documentFixture();
    existing.collections[0] = { ...existing.collections[0], id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    existing.sites[0] = { ...existing.sites[0], id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
    existing.items[0] = { ...existing.items[0], id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", collectionId: null, siteId: null, resourceKey: null };
    existing.items[0].canonicalKey = incoming.items[0].canonicalKey;
    const preview = previewLibraryImport(incoming, "merge", {
      collections: existing.collections,
      sites: existing.sites,
      items: existing.items,
      settings: existing.settings,
    });
    expect(preview.canApply).toBe(false);
    expect(preview.conflicts).toHaveLength(3);
  });
});
