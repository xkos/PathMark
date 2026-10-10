import { useEffect, useState } from "react";
import { siteToDraft, type SiteDraft } from "../domain/site-management";
import { ensureEndpointInDraft, suggestSiteFromUrl } from "../popup/site-selection";
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
  const initialTarget = item.siteId ?? sites[0]?.id ?? "new";
  const [targetSiteId, setTargetSiteId] = useState(initialTarget);
  const [newSiteId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(() => suggestSiteFromUrl(item.originalUrl).name);
  const [prefix, setPrefix] = useState(() => suggestSiteFromUrl(item.originalUrl).endpointPrefix);
  const [previewing, setPreviewing] = useState(true);
  const [preview, setPreview] = useState<ItemMigrationPreview | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  function selectedDraft(): SiteDraft {
    if (targetSiteId === "new") return { id: newSiteId, name, description: "", endpoints: [{ prefix, enabled: true }], queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] } };
    const site = sites.find((candidate) => candidate.id === targetSiteId);
    if (!site) throw new Error(t("siteNotFound"));
    return ensureEndpointInDraft(siteToDraft(site), prefix);
  }

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setError("");
    setPreviewing(true);
    async function previewChange() {
      try {
        const draft = selectedDraft();
        const result = await readingLibrary.previewItemMigration(item.id, draft.id!, draft);
        if (!cancelled) setPreview(result);
      } catch (error) { if (!cancelled) setError(describeError(error)); }
      finally { if (!cancelled) setPreviewing(false); }
    }
    void previewChange();
    return () => { cancelled = true; };
  }, [targetSiteId, prefix, name, newSiteId, item.id, sites]);

  async function confirmMigration(): Promise<void> {
    if (!preview || previewing || working) return;
    setWorking(true);
    setError("");
    try {
      const draft = selectedDraft();
      onMigrated(await readingLibrary.migrateItem(item.id, draft.id!, draft));
    } catch (migrationError) {
      setError(describeError(migrationError));
    } finally {
      setWorking(false);
    }
  }

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
              disabled={working}
              value={targetSiteId}
              onChange={(event) => {
                setTargetSiteId(event.target.value);
                setPreview(null);
                setError("");
              }}
            >
              <option value="new">{t("createSite")}</option>
              {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
            </select>
          </label>

          {targetSiteId === "new" ? <label className="field"><span className="field__label">{t("newSiteName")}</span><input className="field__input" value={name} disabled={working} onChange={(event) => setName(event.target.value)} /></label> : null}
          <label className="field"><span className="field__label">{t("addEndpoint")}</span><input className="field__input" value={prefix} disabled={working} onChange={(event) => setPrefix(event.target.value)} /><small>{t("migrationEndpointHint")}</small></label>

          {preview ? (
            <dl className="migration-preview">
              <dt>{t("migratedSite")}</dt><dd>{preview.after.siteName ?? t("unassigned")}</dd>
              <dt>{t("matchedEndpoint")}</dt><dd>{preview.after.endpointPrefix ?? "—"}</dd>
              <dt>{t("resourceKey")}</dt><dd>{preview.after.resourceKey ?? "—"}</dd>

            </dl>
          ) : null}

          {preview?.conflictingItem ? (
            <div className="error-panel" role="alert">
              {t("mergeOnSync")}: {preview.conflictingItem.title}
            </div>
          ) : null}
          {error ? <div className="error-panel" role="alert">{error}</div> : null}
        </div>

        <footer className="migration-dialog__footer">
          <Button type="button" variant="ghost" onClick={onClose}>{t("cancel")}</Button>
          <Button
            type="button"
            disabled={!preview || previewing || working}
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
