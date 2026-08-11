import { describe, expect, it } from "vitest";
import type { Item } from "./models";
import { transitionReadingState } from "./reading";

const item: Item = {
  id: "item-1",
  title: "Paper",
  note: "",
  tags: [],
  collectionId: null,
  siteId: null,
  resourceKey: null,
  canonicalKey: "v1:url:test",
  originalUrl: "https://example.com/paper",
  lastResolvedUrl: null,
  readingState: "unread",
  isArchived: false,
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
  firstReadAt: null,
  readAt: null,
  lastOpenedAt: null,
  openCount: 0,
};

describe("transitionReadingState", () => {
  it("records the first read time", () => {
    const read = transitionReadingState(item, "read", "2026-08-11T01:00:00.000Z");
    expect(read.firstReadAt).toBe("2026-08-11T01:00:00.000Z");
    expect(read.readAt).toBe("2026-08-11T01:00:00.000Z");
  });

  it("preserves firstReadAt when a read item becomes unread", () => {
    const read = transitionReadingState(item, "read", "2026-08-11T01:00:00.000Z");
    const unread = transitionReadingState(read, "unread", "2026-08-11T02:00:00.000Z");
    expect(unread.firstReadAt).toBe("2026-08-11T01:00:00.000Z");
    expect(unread.readAt).toBeNull();
  });

  it("records a new current read time without replacing firstReadAt", () => {
    const read = transitionReadingState(item, "read", "2026-08-11T01:00:00.000Z");
    const unread = transitionReadingState(read, "unread", "2026-08-11T02:00:00.000Z");
    const reread = transitionReadingState(unread, "read", "2026-08-11T03:00:00.000Z");
    expect(reread.firstReadAt).toBe("2026-08-11T01:00:00.000Z");
    expect(reread.readAt).toBe("2026-08-11T03:00:00.000Z");
  });
});
