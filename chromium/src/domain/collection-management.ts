import type { Collection, UUID } from "./models";

export interface CollectionDraft {
  id?: UUID;
  name: string;
  parentId: UUID | null;
}

export interface PrepareCollectionOptions {
  existingCollections: Collection[];
  now: string;
  createId: () => UUID;
}

export class CollectionConfigurationError extends Error {}

export function prepareCollection(draft: CollectionDraft, options: PrepareCollectionOptions): Collection {
  const name = draft.name.trim();
  if (!name) throw new CollectionConfigurationError("分类名称不能为空");

  const current = draft.id
    ? options.existingCollections.find((collection) => collection.id === draft.id)
    : undefined;
  if (draft.parentId === draft.id) throw new CollectionConfigurationError("分类不能以自身作为父分类");
  if (draft.parentId && !options.existingCollections.some((collection) => collection.id === draft.parentId)) {
    throw new CollectionConfigurationError("父分类不存在或已被删除");
  }

  const descendants = current ? collectDescendantIds(current.id, options.existingCollections) : new Set<string>();
  if (draft.parentId && descendants.has(draft.parentId)) {
    throw new CollectionConfigurationError("分类不能移动到自己的后代中");
  }

  const parentDepth = getCollectionDepth(draft.parentId, options.existingCollections);
  const descendantHeight = current ? getDescendantHeight(current.id, options.existingCollections) : 0;
  if (parentDepth + 1 + descendantHeight > 5) {
    throw new CollectionConfigurationError("分类最多支持 5 层");
  }

  const normalizedName = name.toLocaleLowerCase();
  const duplicate = options.existingCollections.find(
    (collection) =>
      collection.id !== draft.id &&
      collection.parentId === draft.parentId &&
      collection.name.trim().toLocaleLowerCase() === normalizedName,
  );
  if (duplicate) throw new CollectionConfigurationError("同一父分类下不能存在同名分类");

  const siblings = options.existingCollections.filter(
    (collection) => collection.parentId === draft.parentId && collection.id !== draft.id,
  );
  return {
    id: draft.id ?? options.createId(),
    name,
    parentId: draft.parentId,
    sortOrder: current?.sortOrder ?? (siblings.length ? Math.max(...siblings.map((item) => item.sortOrder)) + 1 : 0),
    createdAt: current?.createdAt ?? options.now,
    updatedAt: options.now,
  };
}

export function collectDescendantIds(collectionId: string, collections: Collection[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [collectionId];
  while (queue.length) {
    const parentId = queue.shift()!;
    for (const collection of collections) {
      if (collection.parentId !== parentId || descendants.has(collection.id)) continue;
      descendants.add(collection.id);
      queue.push(collection.id);
    }
  }
  return descendants;
}

export function flattenCollections(collections: Collection[]): Array<{ collection: Collection; depth: number }> {
  const result: Array<{ collection: Collection; depth: number }> = [];
  const appendChildren = (parentId: string | null, depth: number) => {
    collections
      .filter((collection) => collection.parentId === parentId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-CN"))
      .forEach((collection) => {
        result.push({ collection, depth });
        appendChildren(collection.id, depth + 1);
      });
  };
  appendChildren(null, 0);
  return result;
}

function getCollectionDepth(collectionId: string | null, collections: Collection[]): number {
  let depth = 0;
  let currentId = collectionId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) throw new CollectionConfigurationError("分类结构存在循环引用");
    visited.add(currentId);
    const collection = collections.find((candidate) => candidate.id === currentId);
    if (!collection) throw new CollectionConfigurationError("父分类不存在或已被删除");
    depth += 1;
    currentId = collection.parentId;
  }
  return depth;
}

function getDescendantHeight(collectionId: string, collections: Collection[]): number {
  const children = collections.filter((collection) => collection.parentId === collectionId);
  if (!children.length) return 0;
  return 1 + Math.max(...children.map((child) => getDescendantHeight(child.id, collections)));
}
