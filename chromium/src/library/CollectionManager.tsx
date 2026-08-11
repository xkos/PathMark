import { useEffect, useMemo, useState } from "react";
import { collectDescendantIds, flattenCollections, type CollectionDraft } from "../domain/collection-management";
import type { Collection } from "../domain/models";
import { readingLibrary } from "../storage/library-instance";
import type { CollectionItemStats, DeleteCollectionStrategy } from "../storage/reading-library";
import { Button } from "../ui/Button";
import { localizeError, t } from "../i18n";

export function CollectionManager() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [draft, setDraft] = useState<CollectionDraft>(() => createEmptyDraft());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [impactedItems, setImpactedItems] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stats, setStats] = useState<Record<string, CollectionItemStats>>({});

  const flattened = useMemo(() => flattenCollections(collections), [collections]);
  const unavailableParents = draft.id ? collectDescendantIds(draft.id, collections) : new Set<string>();
  if (draft.id) unavailableParents.add(draft.id);

  useEffect(() => {
    void reloadCollections();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setImpactedItems(0);
      return;
    }
    void readingLibrary.countItemsForCollectionTree(selectedId).then(setImpactedItems);
  }, [selectedId]);

  async function reloadCollections(preferredId?: string): Promise<void> {
    const [loaded, loadedStats] = await Promise.all([readingLibrary.listCollections(), readingLibrary.getCollectionItemStats()]);
    setCollections(loaded);
    setStats(loadedStats);
    const selected = loaded.find((collection) => collection.id === preferredId) ?? loaded[0];
    if (selected) selectCollection(selected);
    else startNewCollection();
  }

  function selectCollection(collection: Collection): void {
    setSelectedId(collection.id);
    setDraft({ id: collection.id, name: collection.name, parentId: collection.parentId });
    void readingLibrary.countItemsForCollectionTree(collection.id).then(setImpactedItems);
    resetFeedback();
  }

  function startNewCollection(): void {
    setSelectedId(null);
    setDraft(createEmptyDraft());
    setImpactedItems(0);
    resetFeedback();
  }

  function resetFeedback(): void {
    setError("");
    setNotice("");
  }

  async function saveCollection(): Promise<void> {
    setError("");
    setNotice("");
    try {
      const saved = await readingLibrary.saveCollection(draft);
      await reloadCollections(saved.id);
      setNotice(t("collectionSaved"));
    } catch (saveError) {
      setError(describeError(saveError));
    }
  }

  async function moveCollection(direction: -1 | 1): Promise<void> {
    if (!selectedId) return;
    await readingLibrary.moveCollection(selectedId, direction);
    await reloadCollections(selectedId);
  }

  async function deleteCollection(strategy: DeleteCollectionStrategy): Promise<void> {
    if (!selectedId) return;
    const action = strategy === "delete-items" ? t("deleteItemsStrategy") : t("moveItemsStrategy");
    if (!window.confirm(t("deleteCollectionQuestion", { name: draft.name, action }))) return;
    setError("");
    try {
      const result = await readingLibrary.deleteCollection(selectedId, strategy);
      await reloadCollections();
      setNotice(t("collectionDeleted", { collections: result.collections, items: result.items }));
    } catch (deleteError) {
      setError(describeError(deleteError));
    }
  }

  return (
    <div className="collection-management">
      <header className="library-header">
        <div>
          <h2 className="library-title">{t("collections")}</h2>
          <p className="library-subtitle">{t("collectionsHint")}</p>
        </div>
        <Button type="button" onClick={startNewCollection}>{t("newCollection")}</Button>
      </header>

      <div className="collection-management__body">
        <aside className="collection-list" aria-label={t("collectionList")}>
          {flattened.length ? flattened.map(({ collection, depth }) => (
            <button
              type="button"
              key={collection.id}
              className={`collection-list__item${selectedId === collection.id ? " collection-list__item--active" : ""}`}
              style={{ paddingInlineStart: `${14 + depth * 18}px` }}
              onClick={() => selectCollection(collection)}
            >
              <span>{collection.name}</span><small>{t("itemsCount", { total: stats[collection.id]?.total ?? 0, unread: stats[collection.id]?.unread ?? 0 })}</small>
            </button>
          )) : <p className="collection-list__empty">{t("noCollections")}</p>}
        </aside>

        <section className="collection-editor" aria-label={t("collectionEditor")}>
          <label className="field">
            <span className="field__label">{t("collectionName")}</span>
            <input
              className="field__input"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder={t("collectionPlaceholder")}
            />
          </label>
          <label className="field">
            <span className="field__label">{t("parentCollection")}</span>
            <select
              className="field__input"
              value={draft.parentId ?? ""}
              onChange={(event) => setDraft({ ...draft, parentId: event.target.value || null })}
            >
              <option value="">{t("topLevelCollection")}</option>
              {flattened
                .filter(({ collection }) => !unavailableParents.has(collection.id))
                .map(({ collection, depth }) => (
                  <option key={collection.id} value={collection.id}>{`${"　".repeat(depth)}${collection.name}`}</option>
                ))}
            </select>
          </label>

          {error ? <div className="error-panel" role="alert">{error}</div> : null}
          {notice ? <div className="notice-panel" role="status">{notice}</div> : null}

          <footer className="collection-editor__footer">
            <div className="collection-editor__order">
              {selectedId ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => void moveCollection(-1)}>{t("moveUp")}</Button>
                  <Button type="button" variant="secondary" onClick={() => void moveCollection(1)}>{t("moveDown")}</Button>
                </>
              ) : null}
            </div>
            <div className="collection-editor__actions">
              {selectedId ? impactedItems ? (
                <>
                  <Button type="button" variant="ghost" onClick={() => void deleteCollection("move-items-to-inbox")}>{t("deleteCollectionMove", { count: impactedItems })}</Button>
                  <Button type="button" variant="ghost" onClick={() => void deleteCollection("delete-items")}>{t("deleteCollectionItems")}</Button>
                </>
              ) : <Button type="button" variant="ghost" onClick={() => void deleteCollection("delete-items")}>{t("deleteCollection")}</Button> : null}
              <Button type="button" onClick={() => void saveCollection()}>{t("saveCollection")}</Button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

function createEmptyDraft(): CollectionDraft {
  return { id: crypto.randomUUID(), name: "", parentId: null };
}

function describeError(error: unknown): string {
  return localizeError(error);
}
