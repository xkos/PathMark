import { useEffect, useState } from "react";
import type { ImportMode, ImportPreview, SameIdImportPolicy } from "../domain/library-transfer";
import { readingLibrary } from "../storage/library-instance";
import { Button } from "../ui/Button";
import type { AppSettings } from "../domain/models";
import { requestActionIconRefresh } from "../browser/action-refresh";
import { localizeError, t } from "../i18n";
import { BookmarkImportManager } from "./BookmarkImportManager";

interface ExportSummary {
  collections: number;
  sites: number;
  items: number;
  archivedItems: number;
}

export function DataTransferManager() {
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [fileName, setFileName] = useState("");
  const [rawImport, setRawImport] = useState("");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [sameIdPolicy, setSameIdPolicy] = useState<SameIdImportPolicy>("newer");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => { void Promise.all([refreshSummary(), readingLibrary.getSettings().then(setSettings)]); }, []);

  async function refreshSummary(): Promise<void> {
    const document = await readingLibrary.exportLibrary();
    setSummary({
      collections: document.collections.length,
      sites: document.sites.length,
      items: document.items.length,
      archivedItems: document.items.filter((item) => item.isArchived).length,
    });
  }

  async function exportData(): Promise<void> {
    setBusy(true); setError(""); setNotice("");
    try {
      const document = await readingLibrary.exportLibrary();
      const blob = new Blob([`${JSON.stringify(document, null, 2)}\n`], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `reading-bookmarks-${document.exportedAt.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(t("exportDone"));
      await refreshSummary();
    } catch (exportError) {
      setError(describeError(exportError));
    } finally { setBusy(false); }
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    setPreview(null); setError(""); setNotice("");
    if (!file) { setFileName(""); setRawImport(""); return; }
    try {
      setFileName(file.name);
      setRawImport(await file.text());
    } catch (readError) {
      setRawImport(""); setError(t("fileReadFailed", { error: describeError(readError) }));
    }
  }

  async function validateImport(): Promise<void> {
    if (!rawImport) { setError(t("chooseBackup")); return; }
    setBusy(true); setError(""); setNotice("");
    try { setPreview(await readingLibrary.previewImport(rawImport, mode, sameIdPolicy)); }
    catch (validationError) { setError(describeError(validationError)); }
    finally { setBusy(false); }
  }

  async function applyImport(): Promise<void> {
    if (!preview?.canApply || !rawImport) return;
    if (mode === "replace" && !window.confirm(t("replaceQuestion", { count: summary?.items ?? 0 }))) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const applied = await readingLibrary.applyImport(rawImport, mode, sameIdPolicy);
      setPreview(applied);
      setNotice(mode === "replace" ? t("replaceDone") : t("mergeDone", {
        added: applied.actions.added,
        updated: applied.actions.updated,
        skipped: applied.actions.skipped,
      }));
      await refreshSummary();
      requestActionIconRefresh();
    } catch (applyError) {
      setError(t("writeFailed", { error: describeError(applyError) }));
    } finally { setBusy(false); }
  }

  function changeMode(nextMode: ImportMode): void { setMode(nextMode); setPreview(null); setNotice(""); }
  function changePolicy(nextPolicy: SameIdImportPolicy): void { setSameIdPolicy(nextPolicy); setPreview(null); setNotice(""); }

  async function saveSettings(): Promise<void> {
    if (!settings) return;
    setBusy(true); setError(""); setNotice("");
    try { await readingLibrary.saveSettings(settings); setSettings(await readingLibrary.getSettings()); setNotice(t("settingsSaved")); }
    catch (settingsError) { setError(describeError(settingsError)); }
    finally { setBusy(false); }
  }

  async function clearAllData(): Promise<void> {
    if (!window.confirm(t("clearQuestion"))) return;
    if (!window.confirm(t("clearFinalQuestion"))) return;
    setBusy(true); setError(""); setNotice("");
    try { await readingLibrary.clearAllData(); setPreview(null); setSettings(await readingLibrary.getSettings()); await refreshSummary(); requestActionIconRefresh(); setNotice(t("clearDone")); }
    catch (clearError) { setError(describeError(clearError)); }
    finally { setBusy(false); }
  }

  return (
    <div className="transfer-management">
      <header className="library-header">
        <div>
          <h2 className="library-title">{t("settingsAndData")}</h2>
          <p className="library-subtitle">{t("settingsHint")}</p>
        </div>
      </header>

      {settings ? <section className="transfer-card settings-card" aria-labelledby="settings-heading">
        <div><h3 id="settings-heading">{t("normalizationDefaults")}</h3><p>{t("normalizationHint")}</p></div>
        <div className="settings-grid">
          <label className="field"><span className="field__label">{t("ignoredQueryParams")}</span><input className="field__input" value={settings.globalIgnoredQueryParams.join(", ")} onChange={(event) => setSettings({ ...settings, globalIgnoredQueryParams: event.target.value.split(/[，,]/).map((value) => value.trim()).filter(Boolean) })} /></label>
          <label className="field"><span className="field__label">{t("defaultReadingState")}</span><select className="field__input" value={settings.defaultReadingState} onChange={(event) => setSettings({ ...settings, defaultReadingState: event.target.value as AppSettings["defaultReadingState"] })}><option value="unread">{t("unread")}</option><option value="reading">{t("reading")}</option><option value="read">{t("read")}</option></select></label>
          <label className="field"><span className="field__label">{t("defaultLibraryView")}</span><select className="field__input" value={settings.defaultView} onChange={(event) => setSettings({ ...settings, defaultView: event.target.value as AppSettings["defaultView"] })}><option value="inbox">{t("inbox")}</option><option value="unread">{t("unread")}</option><option value="all">{t("all")}</option></select></label>
          <label className="check-field settings-check"><input type="checkbox" checked={settings.stripTrailingSlash} onChange={(event) => setSettings({ ...settings, stripTrailingSlash: event.target.checked })} /> {t("stripTrailingSlash")}</label>
        </div>
        <Button type="button" onClick={() => void saveSettings()} disabled={busy}>{t("saveSettings")}</Button>
      </section> : null}

      <BookmarkImportManager onImported={refreshSummary} />

      <div className="transfer-grid">
        <section className="transfer-card" aria-labelledby="export-heading">
          <div>
            <h3 id="export-heading">{t("exportLibrary")}</h3>
            <p>{t("exportHint")}</p>
          </div>
          <SummaryGrid summary={summary} />
          <Button type="button" onClick={() => void exportData()} disabled={busy || !summary}>{t("exportJson")}</Button>
        </section>

        <section className="transfer-card" aria-labelledby="import-heading">
          <div>
            <h3 id="import-heading">{t("importJson")}</h3>
            <p>{t("importHint")}</p>
          </div>
          <label className="field">
            <span className="field__label">{t("backupFile")}</span>
            <input className="field__input transfer-file" type="file" accept="application/json,.json" onChange={(event) => void chooseFile(event.target.files?.[0])} />
            {fileName ? <small className="muted">{t("selectedFile", { file: fileName })}</small> : null}
          </label>
          <fieldset className="transfer-options">
            <legend>{t("importMode")}</legend>
            <label><input type="radio" checked={mode === "merge"} onChange={() => changeMode("merge")} /> {t("mergeKeep")}</label>
            <label><input type="radio" checked={mode === "replace"} onChange={() => changeMode("replace")} /> {t("replaceRestore")}</label>
          </fieldset>
          {mode === "merge" ? (
            <label className="field">
              <span className="field__label">{t("sameIdPolicy")}</span>
              <select className="field__input" value={sameIdPolicy} onChange={(event) => changePolicy(event.target.value as SameIdImportPolicy)}>
                <option value="newer">{t("keepNewer")}</option>
                <option value="incoming">{t("incomingWins")}</option>
              </select>
            </label>
          ) : null}
          <Button type="button" variant="secondary" onClick={() => void validateImport()} disabled={busy || !rawImport}>{t("validatePreview")}</Button>
        </section>
      </div>

      {preview ? <ImportPreviewPanel preview={preview} onApply={() => void applyImport()} busy={busy} /> : null}
      {error ? <div className="error-panel transfer-feedback" role="alert">{error}</div> : null}
      {notice ? <div className="notice-panel transfer-feedback" role="status">{notice}</div> : null}
      <section className="danger-zone">
        <div><h3>{t("clearAll")}</h3><p>{t("clearAllHint")}</p></div>
        <Button type="button" variant="ghost" disabled={busy || !summary?.items && !summary?.collections && !summary?.sites} onClick={() => void clearAllData()}>{t("clearAllButton")}</Button>
      </section>
    </div>
  );
}

function SummaryGrid({ summary }: { summary: ExportSummary | null }) {
  const values = summary ? [summary.collections, summary.sites, summary.items, summary.archivedItems] : ["—", "—", "—", "—"];
  return <div className="transfer-summary">{[t("categoriesSummary"), t("sitesSummary"), t("itemsSummary"), t("archivedItemsSummary")].map((label, index) => <div key={label}><strong>{values[index]}</strong><span>{label}</span></div>)}</div>;
}

function ImportPreviewPanel({ preview, onApply, busy }: { preview: ImportPreview; onApply: () => void; busy: boolean }) {
  return (
    <section className="transfer-preview" aria-labelledby="preview-heading">
      <div className="transfer-preview__heading">
        <div><h3 id="preview-heading">{t("validationPreview")}</h3><p>{t("formatMode", { version: preview.document?.formatVersion ?? "—", mode: preview.mode === "merge" ? t("merge") : t("replace") })}</p></div>
        <Button type="button" onClick={onApply} disabled={busy || !preview.canApply}>{preview.mode === "merge" ? t("confirmMerge") : t("confirmReplace")}</Button>
      </div>
      <SummaryGrid summary={preview.counts} />
      <div className="transfer-actions">
        <span>{t("added")} <strong>{preview.actions.added}</strong></span>
        <span>{t("updated")} <strong>{preview.actions.updated}</strong></span>
        <span>{t("skipped")} <strong>{preview.actions.skipped}</strong></span>
        <span>{t("conflicts")} <strong>{preview.conflicts.length}</strong></span>
        <span>{t("errors")} <strong>{preview.errors.length}</strong></span>
      </div>
      {preview.errors.length ? <IssueList title={t("validationErrors")} issues={preview.errors} /> : null}
      {preview.conflicts.length ? <IssueList title={t("conflictsToResolve")} issues={preview.conflicts} /> : null}
      {preview.canApply ? <div className="notice-panel">{t("validationPassed")}</div> : null}
    </section>
  );
}

function IssueList({ title, issues }: { title: string; issues: string[] }) {
  return <div className="transfer-issues"><strong>{title}</strong><ul>{issues.map((issue, index) => <li key={`${index}-${issue}`}>{localizeError(issue)}</li>)}</ul></div>;
}

function describeError(error: unknown): string { return localizeError(error); }
