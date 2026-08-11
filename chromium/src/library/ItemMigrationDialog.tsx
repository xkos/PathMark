import { useState } from "react";
import type { Item, Site } from "../domain/models";
import { readingLibrary } from "../storage/library-instance";
import type { ItemMigrationPreview } from "../storage/reading-library";
import { Button } from "../ui/Button";
import { localizeError, t } from "../i18n";

interface ItemMigrationDialogProps {
  item: Item;
  sites: Site[];
  onClose: () => void;
  onMigrated: (item: Item) => void;
}

export function ItemMigrationDialog({ item, sites, onClose, onMigrated }: ItemMigrationDialogProps) {
  const initialTarget = item.siteId ? "" : sites[0]?.id ?? "";
  const [targetSiteId, setTargetSiteId] = useState(initialTarget);
  const [preview, setPreview] = useState<ItemMigrationPreview | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function runPreview(): Promise<void> {
    setError("");
    try {
      setPreview(await readingLibrary.previewItemMigration(item.id, targetSiteId || null));
    } catch (previewError) {
      setPreview(null);
      setError(describeError(previewError));
    }
  }

  async function confirmMigration(): Promise<void> {
    if (!preview || preview.conflictingItem) return;
    setWorking(true);
    setError("");
    try {
      onMigrated(await readingLibrary.migrateItem(item.id, targetSiteId || null));
    } catch (migrationError) {
      setError(describeError(migrationError));
    } finally {
      setWorking(false);
    }
  }

  const unchanged = preview
    ? preview.before.siteId === preview.after.siteId && preview.before.canonicalKey === preview.after.canonicalKey
    : false;

  return (
    <div className="dialog-backdrop">
      <section className="migration-dialog" role="dialog" aria-modal="true" aria-labelledby="migration-dialog-title">
        <header className="migration-dialog__header">
          <div>
            <h2 id="migration-dialog-title">{t("migrateItemSite")}</h2>
            <p>{item.title}</p>
          </div>
          <button type="button" className="migration-dialog__close" onClick={onClose} aria-label={t("closeMigration")}>×</button>
        </header>

        <div className="migration-dialog__body">
          <dl className="migration-dialog__source">
            <dt>{t("originalUrl")}</dt>
            <dd>{item.originalUrl}</dd>
            <dt>{t("currentSite")}</dt>
            <dd>{sites.find((site) => site.id === item.siteId)?.name ?? t("unassigned")}</dd>
          </dl>

          <label className="field">
            <span className="field__label">{t("targetSite")}</span>
            <select
              className="field__input"
              value={targetSiteId}
              onChange={(event) => {
                setTargetSiteId(event.target.value);
                setPreview(null);
                setError("");
              }}
            >
              <option value="">{t("unassigned")}</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>

          <Button type="button" variant="secondary" onClick={() => void runPreview()}>{t("previewMigration")}</Button>

          {preview ? (
            <dl className="migration-preview">
              <dt>{t("migratedSite")}</dt><dd>{preview.after.siteName ?? t("unassigned")}</dd>
              <dt>{t("matchedEndpoint")}</dt><dd>{preview.after.endpointPrefix ?? "—"}</dd>
              <dt>{t("resourceKey")}</dt><dd>{preview.after.resourceKey ?? "—"}</dd>
              <dt>{t("canonicalKey")}</dt><dd>{preview.after.canonicalKey}</dd>
            </dl>
          ) : null}

          {preview?.conflictingItem ? (
            <div className="error-panel" role="alert">
              {t("migrationConflict", { title: preview.conflictingItem.title })}
            </div>
          ) : null}
          {unchanged ? <div className="notice-panel">{t("migrationUnchanged")}</div> : null}
          {error ? <div className="error-panel" role="alert">{error}</div> : null}
        </div>

        <footer className="migration-dialog__footer">
          <Button type="button" variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button
            type="button"
            disabled={!preview || Boolean(preview.conflictingItem) || unchanged || working}
            onClick={() => void confirmMigration()}
          >
            {working ? t("migrating") : t("confirmMigration")}
          </Button>
        </footer>
      </section>
    </div>
  );
}

function describeError(error: unknown): string {
  return localizeError(error);
}
