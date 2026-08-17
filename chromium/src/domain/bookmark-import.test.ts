import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Site } from "./models";
import {
  bookmarkFolderKey,
  buildBookmarkImportPreview,
  parseBrowserBookmarkTree,
  parseBookmarkHtml,
  type BookmarkImportRequest,
} from "./bookmark-import";

const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>todo</H3>
  <DL><p>
    <DT><A HREF="https://old.example.com/paper/1?utm_source=x" ADD_DATE="1700000000">Paper &amp; One</A>
    <DT><A HREF="javascript:alert(1)">Unsafe</A>
  </DL><p>
  <DT><H3>done</H3>
  <DL><p>
    <DT><A HREF="https://new.example.org/paper/1">Paper One mirror</A>
    <DT><A HREF="https://blog.example.net/post/2">Blog</A>
  </DL><p>
</DL><p>`;

describe("bookmark HTML import", () => {
  it("parses Netscape bookmark folders, links, timestamps, and unsupported URLs", () => {
    const snapshot = parseBookmarkHtml(html);

    expect(snapshot.errors).toEqual([]);
    expect(snapshot.candidates).toHaveLength(3);
    expect(snapshot.candidates[0]).toMatchObject({
      title: "Paper & One",
      folderPath: ["todo"],
      origin: "https://old.example.com/",
      addedAt: "2023-11-14T22:13:20.000Z",
    });
    expect(snapshot.folders.map((folder) => [folder.path.join("/"), folder.itemCount])).toEqual([
      ["done", 2],
      ["todo", 1],
    ]);
    expect(snapshot.skipped).toHaveLength(1);
  });

  it("keeps folder state independent from grouping multiple origins into one site", () => {
    const snapshot = parseBookmarkHtml(html);
    let nextId = 0;
    const request: BookmarkImportRequest = {
      candidates: snapshot.candidates,
      folderRules: [
        { folderKey: bookmarkFolderKey(["todo"]), selected: true, readingState: "unread", isArchived: false, collectionPath: [] },
        { folderKey: bookmarkFolderKey(["done"]), selected: true, readingState: "read", isArchived: false, collectionPath: [] },
      ],
      siteMappings: [
        { origin: "https://old.example.com/", target: { type: "new", siteName: "Example Papers" } },
        { origin: "https://new.example.org/", target: { type: "new", siteName: "Example Papers" } },
        { origin: "https://blog.example.net/", target: { type: "unassigned" } },
      ],
    };

    const preview = buildBookmarkImportPreview(request, {
      collections: [], sites: [], items: [], settings: DEFAULT_SETTINGS,
      now: "2026-08-14T10:00:00.000Z", createId: () => `id-${++nextId}`,
    });

    expect(preview.errors).toEqual([]);
    expect(preview.createdSites).toBe(1);
    expect(preview.plan?.sites[0].endpoints.map((endpoint) => endpoint.prefix)).toEqual([
      "https://old.example.com/",
      "https://new.example.org/",
    ]);
    expect(preview.collapsedDuplicates).toBe(1);
    expect(preview.plan?.items.map((item) => [item.readingState, item.siteId !== null])).toEqual([
      ["read", true],
      ["read", false],
    ]);
  });

  it("adds a new origin to an existing site and skips an existing canonical item", () => {
    const snapshot = parseBookmarkHtml(html);
    const site: Site = {
      id: "site-1", name: "Example", description: "", queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
      endpoints: [{ id: "endpoint-1", prefix: "https://old.example.com/", priority: 0, enabled: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    };
    let nextId = 0;
    const preview = buildBookmarkImportPreview({
      candidates: snapshot.candidates,
      folderRules: snapshot.folders.map((folder) => ({ folderKey: folder.key, selected: true, readingState: "unread", isArchived: false, collectionPath: [] })),
      siteMappings: [
        { origin: "https://old.example.com/", target: { type: "existing", siteId: site.id } },
        { origin: "https://new.example.org/", target: { type: "existing", siteId: site.id } },
      ],
    }, {
      collections: [], sites: [site], settings: DEFAULT_SETTINGS,
      items: [{
        id: "existing", title: "Existing", note: "", tags: [], collectionId: null, siteId: site.id,
        resourceKey: "/paper/1", canonicalKey: `v1:site:${site.id}:${encodeURIComponent("/paper/1")}`,
        originalUrl: "https://old.example.com/paper/1", lastResolvedUrl: null, readingState: "unread", isArchived: false,
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", firstReadAt: null,
        readAt: null, lastOpenedAt: null, openCount: 0,
      }],
      now: "2026-08-14T10:00:00.000Z", createId: () => `id-${++nextId}`,
    });

    expect(preview.updatedSites).toBe(1);
    expect(preview.plan?.sites[0].endpoints).toHaveLength(2);
    expect(preview.skippedExisting).toBe(2);
    expect(preview.addedItems).toBe(1);
  });
});

describe("browser bookmark tree import", () => {
  it("converts the browser tree into the same snapshot model without keeping the synthetic root", () => {
    const snapshot = parseBrowserBookmarkTree([{ id: "0", title: "", children: [
      { id: "1", title: "Bookmarks bar", children: [
        { id: "2", title: "todo", children: [
          { id: "3", title: "Paper", url: "https://example.com/paper/1", dateAdded: 1_700_000_000_000 },
          { id: "4", title: "Local file", url: "file:///tmp/paper.pdf" },
        ] },
      ] },
    ] }]);

    expect(snapshot.errors).toEqual([]);
    expect(snapshot.candidates).toEqual([expect.objectContaining({
      id: "browser-bookmark-3",
      title: "Paper",
      folderPath: ["Bookmarks bar", "todo"],
      addedAt: "2023-11-14T22:13:20.000Z",
      origin: "https://example.com/",
    })]);
    expect(snapshot.folders[0]).toEqual(expect.objectContaining({ path: ["Bookmarks bar", "todo"], itemCount: 1 }));
    expect(snapshot.skipped).toHaveLength(1);
  });

  it("reports an empty browser tree", () => {
    expect(parseBrowserBookmarkTree([{ id: "0", title: "", children: [] }]).errors).toEqual([
      "浏览器收藏夹中没有找到可导入的链接",
    ]);
  });
});
