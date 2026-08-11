import { useEffect, useState } from "react";
import { flattenCollections } from "../domain/collection-management";
import type { Collection, Item, ReadingState } from "../domain/models";
import { readingLibrary } from "../storage/library-instance";
import { Button } from "../ui/Button";
import { ReadingStateControl } from "../ui/ReadingStateControl";
import { localizeError, t } from "../i18n";

export function ItemEditorDialog({ item, collections, onClose, onSaved }: { item: Item; collections: Collection[]; onClose: () => void; onSaved: (item: Item) => void }) {
  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note);
  const [tags, setTags] = useState(item.tags.join(", "));
  const [collectionId, setCollectionId] = useState(item.collectionId ?? "");
  const [readingState, setReadingState] = useState<ReadingState>(item.readingState);
  const [isArchived, setIsArchived] = useState(item.isArchived);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function save(): Promise<void> {
    setSaving(true); setError("");
    try {
      onSaved(await readingLibrary.updateItem(item.id, {
        title, note, tags: tags.split(/[，,]/), collectionId: collectionId || null, readingState, isArchived,
      }));
    } catch (saveError) { setError(describeError(saveError)); }
    finally { setSaving(false); }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="migration-dialog" role="dialog" aria-modal="true" aria-labelledby="item-editor-title">
        <header className="migration-dialog__header">
          <div><h2 id="item-editor-title">{t("editItem")}</h2><p>{t("editItemHint")}</p></div>
          <button className="migration-dialog__close" type="button" aria-label={t("close")} onClick={onClose}>×</button>
        </header>
        <div className="migration-dialog__body">
          <label className="field"><span className="field__label">{t("title")}</span><input className="field__input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="field"><span className="field__label">{t("personalNote")}</span><textarea className="field__input" value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <label className="field"><span className="field__label">{t("commaSeparatedTags")}</span><input className="field__input" value={tags} onChange={(event) => setTags(event.target.value)} /></label>
          <label className="field"><span className="field__label">{t("collection")}</span><select className="field__input" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">{t("inbox")}</option>{flattenCollections(collections).map(({ collection, depth }) => <option key={collection.id} value={collection.id}>{`${"　".repeat(depth)}${collection.name}`}</option>)}</select></label>
          <div className="field"><span className="field__label">{t("readingState")}</span><ReadingStateControl value={readingState} onChange={setReadingState} /></div>
          <label className="check-field"><input type="checkbox" checked={isArchived} onChange={(event) => setIsArchived(event.target.checked)} /> {t("archivedWithoutState")}</label>
          {error ? <div className="error-panel" role="alert">{error}</div> : null}
        </div>
        <footer className="migration-dialog__footer"><Button type="button" variant="secondary" onClick={onClose}>{t("cancel")}</Button><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? t("savingShort") : t("saveChanges")}</Button></footer>
      </section>
    </div>
  );
}

function describeError(error: unknown): string { return localizeError(error); }
