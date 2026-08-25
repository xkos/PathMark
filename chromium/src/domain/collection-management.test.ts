import { describe, expect, it } from "vitest";
import { CollectionConfigurationError, prepareCollection } from "./collection-management";
import type { Collection } from "./models";

const now = "2026-08-11T10:00:00.000Z";

function collection(id: string, name: string, parentId: string | null, sortOrder = 0): Collection {
  return { id, name, parentId, sortOrder, createdAt: now, updatedAt: now };
}

function expectCollectionError(action: () => unknown, code: CollectionConfigurationError["code"]): void {
  try {
    action();
    expect.fail(`Expected CollectionConfigurationError(${code})`);
  } catch (error) {
    expect(error).toBeInstanceOf(CollectionConfigurationError);
    expect(error).toMatchObject({ code });
  }
}

describe("prepareCollection", () => {
  it("accepts a client-generated stable id for a new collection", () => {
    const prepared = prepareCollection(
      { id: "client-generated", name: "Research", parentId: null },
      { existingCollections: [], now, createId: () => "fallback" },
    );
    expect(prepared.id).toBe("client-generated");
  });

  it("rejects duplicate names under the same parent case-insensitively", () => {
    expect(() => prepareCollection(
      { name: " papers ", parentId: null },
      { existingCollections: [collection("existing", "Papers", null)], now, createId: () => "new" },
    )).toThrow(CollectionConfigurationError);
  });

  it("rejects moving a collection under its own descendant", () => {
    const collections = [
      collection("root", "Root", null),
      collection("child", "Child", "root"),
    ];
    expectCollectionError(() => prepareCollection(
      { id: "root", name: "Root", parentId: "child" },
      { existingCollections: collections, now, createId: () => "unused" },
    ), "collectionIntoDescendant");
  });

  it("enforces the five-level maximum when adding a child", () => {
    const collections = [
      collection("1", "One", null),
      collection("2", "Two", "1"),
      collection("3", "Three", "2"),
      collection("4", "Four", "3"),
      collection("5", "Five", "4"),
    ];
    expectCollectionError(() => prepareCollection(
      { name: "Six", parentId: "5" },
      { existingCollections: collections, now, createId: () => "6" },
    ), "collectionDepthExceeded");
  });
});
