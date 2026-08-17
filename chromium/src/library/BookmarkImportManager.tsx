import { useMemo, useState, type ReactNode } from "react";
import {
  bookmarkFolderKey,
  parseBookmarkHtml,
  type BookmarkFolderRule,
  type BookmarkImportSnapshot,
  type BookmarkImportPreview,
  type BookmarkImportRequest,
  type BookmarkSiteMapping,
  type BookmarkSiteTarget,
} from "../domain/bookmark-import";
import { requestBrowserBookmarkSnapshot } from "../browser/bookmark-access";
import { normalizeEndpoint } from "../domain/identity";
import type { ReadingState, Site } from "../domain/models";
import { requestActionIconRefresh } from "../browser/action-refresh";
import { localizeError, t } from "../i18n";
import { readingLibrary } from "../storage/library-instance";
import { Button } from "../ui/Button";

const STATUS_FOLDER_NAMES = new Set([
  "todo", "to-do", "unread", "未读", "待读", "done", "read", "已读", "完成",
  "reading", "在读", "阅读中", "archive", "archived", "归档",
]);

const BROWSER_ROOT_FOLDER_NAMES = new Set([
  "bookmarks bar", "bookmarks menu", "other bookmarks", "mobile bookmarks",
  "书签栏", "其他书签", "移动设备书签", "收藏夹栏", "其他收藏夹", "移动收藏夹",
]);

export function BookmarkImportManager({ onImported }: { onImported: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<BookmarkImportSnapshot | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [folderRules, setFolderRules] = useState<BookmarkFolderRule[]>([]);
  const [siteMappings, setSiteMappings] = useState<BookmarkSiteMapping[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [preview, setPreview] = useState<BookmarkImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedFolderKeys = useMemo(
    () => new Set(folderRules.filter((rule) => rule.selected).map((rule) => rule.folderKey)),
    [folderRules],
  );
  const selectedCandidates = useMemo(
    () => snapshot?.candidates.filter((candidate) => selectedFolderKeys.has(bookmarkFolderKey(candidate.folderPath))) ?? [],
    [snapshot, selectedFolderKeys],
  );
  const originRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of selectedCandidates) counts.set(candidate.origin, (counts.get(candidate.origin) ?? 0) + 1);
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [selectedCandidates]);

  async function chooseBookmarkFile(file: File | undefined): Promise<void> {
    setPreview(null); setError(""); setNotice("");
    if (!file) {
      setSnapshot(null); setSourceLabel(""); setFolderRules([]); setSiteMappings([]);
      return;
    }
    setBusy(true);
    try {
      const parsed = parseBookmarkHtml(await file.text());
      if (parsed.errors.length) throw new Error(parsed.errors.join("\n"));
      await activateSnapshot(parsed, file.name);
    } catch (parseError) {
      setSnapshot(null); setFolderRules([]); setSiteMappings([]);
      setError(t("bookmarkParseFailed", { error: describeError(parseError) }));
    } finally { setBusy(false); }
  }

  async function readBrowserBookmarks(): Promise<void> {
    setPreview(null); setError(""); setNotice(""); setBusy(true);
    try {
      const result = await requestBrowserBookmarkSnapshot();
      if (result.status === "denied") {
        setError(t("bookmarkPermissionDenied"));
        return;
      }
      if (result.snapshot.errors.length) throw new Error(result.snapshot.errors.join("\n"));
      await activateSnapshot(result.snapshot, t("currentBrowserBookmarks"));
    } catch (readError) {
      setError(t("bookmarkBrowserReadFailed", { error: describeError(readError) }));
    } finally { setBusy(false); }
  }

  async function activateSnapshot(parsed: BookmarkImportSnapshot, label: string): Promise<void> {
    const existingSites = await readingLibrary.listSites();
    const rules = parsed.folders.map((folder) => createDefaultFolderRule(folder.key, folder.path));
    const mappings = [...new Set(parsed.candidates.map((candidate) => candidate.origin))].map((origin) => ({
      origin,
      target: inferSiteTarget(origin, existingSites),
    } satisfies BookmarkSiteMapping));
    setSourceLabel(label);
    setSnapshot(parsed);
    setSites(existingSites);
    setFolderRules(rules);
    setSiteMappings(mappings);
  }

  function updateFolderRule(folderKey: string, patch: Partial<BookmarkFolderRule>): void {
    setFolderRules((current) => current.map((rule) => rule.folderKey === folderKey ? { ...rule, ...patch } : rule));
    setPreview(null); setNotice("");
  }

  function updateSiteTarget(origin: string, value: string): void {
    setSiteMappings((current) => current.map((mapping) => {
      if (mapping.origin !== origin) return mapping;
      let target: BookmarkSiteTarget;
      if (value === "unassigned") target = { type: "unassigned" };
      else if (value === "new") target = { type: "new", siteName: defaultSiteName(origin) };
      else target = { type: "existing", siteId: value.slice("existing:".length) };
      return { ...mapping, target };
    }));
    setPreview(null); setNotice("");
  }

  function updateNewSiteName(origin: string, siteName: string): void {
    setSiteMappings((current) => current.map((mapping) =>
      mapping.origin === origin && mapping.target.type === "new"
        ? { ...mapping, target: { type: "new", siteName } }
        : mapping));
    setPreview(null); setNotice("");
  }

  function buildRequest(): BookmarkImportRequest {
    return { candidates: snapshot?.candidates ?? [], folderRules, siteMappings };
  }

  async function generatePreview(): Promise<void> {
    if (!snapshot) { setError(t("chooseBookmarkHtml")); return; }
    setBusy(true); setError(""); setNotice("");
    try { setPreview(await readingLibrary.previewBookmarkImport(buildRequest())); }
    catch (previewError) { setError(describeError(previewError)); }
    finally { setBusy(false); }
  }

  async function applyImport(): Promise<void> {
    if (!snapshot || !preview?.canApply) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const applied = await readingLibrary.applyBookmarkImport(buildRequest());
      setNotice(t("bookmarkImportDone", { items: applied.addedItems }));
      setPreview(null);
      setSites(await readingLibrary.listSites());
      await onImported();
      requestActionIconRefresh();
    } catch (applyError) {
      setError(t("writeFailed", { error: describeError(applyError) }));
    } finally { setBusy(false); }
  }

  return (
    <section className="bookmark-import" aria-labelledby="bookmark-import-heading">
      <div className="bookmark-import__header">
        <div>
          <span className="section-eyebrow">IMPORT</span>
          <h3 id="bookmark-import-heading">{t("bookmarkImport")}</h3>
          <p>{t("bookmarkImportHint")}</p>
        </div>
        {snapshot ? <span className="bookmark-import__file-name">{sourceLabel}</span> : null}
      </div>

      <div className="bookmark-source-grid">
        <article className="bookmark-source-card bookmark-source-card--primary">
          <div><span className="bookmark-source-card__tag">{t("recommended")}</span><h4>{t("readCurrentBrowserBookmarks")}</h4><p>{t("readCurrentBrowserBookmarksHint")}</p></div>
          <div className="bookmark-permission-note"><strong>{t("permissionRequest")}</strong><span>{t("bookmarkPermissionExplanation")}</span></div>
          <Button type="button" disabled={busy} onClick={() => void readBrowserBookmarks()}>{t("authorizeAndRead")}</Button>
        </article>
        <article className="bookmark-source-card">
          <div><h4>{t("importBookmarkHtml")}</h4><p>{t("importBookmarkHtmlHint")}</p></div>
          <label className="field">
            <span className="field__label">{t("bookmarkHtmlFile")}</span>
            <input className="field__input transfer-file" type="file" accept="text/html,.html,.htm" onChange={(event) => void chooseBookmarkFile(event.target.files?.[0])} />
          </label>
        </article>
      </div>

      {snapshot ? <div className="bookmark-import__source-summary">
        <strong>{sourceLabel}</strong>
        <span>{t("bookmarkHtmlSelected", { folders: snapshot.folders.length, items: snapshot.candidates.length })}</span>
        {snapshot.skipped.length ? <span className="bookmark-import__warning">{t("bookmarkInvalidSkipped", { count: snapshot.skipped.length })}</span> : null}
      </div> : null}

      {snapshot ? <>
        <ImportStep heading={t("bookmarkFolderRules")} hint={t("bookmarkFolderRulesHint")}>
          <div className="bookmark-folder-table" role="table">
            <div className="bookmark-table-head" role="row">
              <span>{t("importFolder")}</span><span>{t("sourceFolder")}</span><span>{t("linkCount")}</span>
              <span>{t("readingState")}</span><span>{t("archiveOnImport")}</span><span>{t("createCollectionFromFolder")}</span>
            </div>
            {snapshot.folders.map((folder) => {
              const rule = folderRules.find((candidate) => candidate.folderKey === folder.key);
              if (!rule) return null;
              return <div className={`bookmark-folder-row${rule.selected ? "" : " bookmark-row--disabled"}`} role="row" key={folder.key}>
                <label className="bookmark-check"><input type="checkbox" checked={rule.selected} onChange={(event) => updateFolderRule(rule.folderKey, { selected: event.target.checked })} /><span className="sr-only">{t("importFolder")}</span></label>
                <strong title={folder.path.join(" / ")}>{folder.path.length ? folder.path.join(" / ") : t("bookmarkRootFolder")}</strong>
                <span className="bookmark-count">{folder.itemCount}</span>
                <select className="field__input" disabled={!rule.selected} value={rule.readingState} onChange={(event) => updateFolderRule(rule.folderKey, { readingState: event.target.value as ReadingState })}>
                  <option value="unread">{t("unread")}</option><option value="reading">{t("reading")}</option><option value="read">{t("read")}</option>
                </select>
                <label className="bookmark-check"><input type="checkbox" disabled={!rule.selected} checked={rule.isArchived} onChange={(event) => updateFolderRule(rule.folderKey, { isArchived: event.target.checked })} /><span className="sr-only">{t("archiveOnImport")}</span></label>
                <div className="bookmark-collection-control">
                  <label className="check-field"><input type="checkbox" disabled={!rule.selected} checked={rule.collectionPath.length > 0} onChange={(event) => updateFolderRule(rule.folderKey, { collectionPath: event.target.checked ? defaultCollectionPath(folder.path, true) : [] })} /> {t("createCollectionFromFolder")}</label>
                  {rule.collectionPath.length ? <input className="field__input" aria-label={t("collectionPath")} placeholder={t("collectionPathPlaceholder")} value={rule.collectionPath.join(" / ")} onChange={(event) => updateFolderRule(rule.folderKey, { collectionPath: parseCollectionPath(event.target.value) })} /> : null}
                </div>
              </div>;
            })}
          </div>
        </ImportStep>

        <ImportStep heading={t("bookmarkSiteMapping")} hint={t("bookmarkSiteMappingHint")}>
          <div className="bookmark-site-grid">
            {originRows.map(([origin, count]) => {
              const mapping = siteMappings.find((candidate) => candidate.origin === origin);
              if (!mapping) return null;
              const value = mapping.target.type === "unassigned" ? "unassigned" : mapping.target.type === "new" ? "new" : `existing:${mapping.target.siteId}`;
              const exactSite = findExactEndpointSite(origin, sites);
              return <article className="bookmark-site-row" key={origin}>
                <div className="bookmark-site-row__origin"><strong>{new URL(origin).hostname}</strong><span>{count} · {origin}</span></div>
                <label className="field"><span className="field__label">{t("targetSite")}</span><select className="field__input" value={value} onChange={(event) => updateSiteTarget(origin, event.target.value)}>
                  <option value="unassigned">{t("unassignedImport")}</option>
                  {sites.map((site) => <option value={`existing:${site.id}`} key={site.id}>{site.name}{exactSite?.id === site.id ? ` · ${t("exactEndpointMatch")}` : ""}</option>)}
                  <option value="new">{t("createNewSiteOption")}</option>
                </select></label>
                {mapping.target.type === "new" ? <label className="field"><span className="field__label">{t("newSiteNameForImport")}</span><input className="field__input" value={mapping.target.siteName} onChange={(event) => updateNewSiteName(origin, event.target.value)} /></label> : null}
              </article>;
            })}
          </div>
        </ImportStep>

        <ImportStep heading={t("bookmarkPreviewAction")} hint={t("bookmarkPreviewHint")}>
          <div className="bookmark-preview-actions">
            <Button type="button" variant="secondary" disabled={busy || !selectedCandidates.length} onClick={() => void generatePreview()}>{t("previewBookmarkImport")}</Button>
            {preview?.canApply ? <Button type="button" disabled={busy} onClick={() => void applyImport()}>{t("applyBookmarkImport")}</Button> : null}
          </div>
          {preview ? <BookmarkPlanPreview preview={preview} /> : null}
        </ImportStep>
      </> : null}

      {error ? <div className="error-panel" role="alert">{error}</div> : null}
      {notice ? <div className="notice-panel" role="status">{notice}</div> : null}
    </section>
  );
}

function ImportStep({ heading, hint, children }: { heading: string; hint: string; children: ReactNode }) {
  return <section className="bookmark-import-step"><div className="bookmark-import-step__heading"><h4>{heading}</h4><p>{hint}</p></div>{children}</section>;
}

function BookmarkPlanPreview({ preview }: { preview: BookmarkImportPreview }) {
  const metrics = [
    [t("selectedLinks"), preview.selectedItems], [t("newItems"), preview.addedItems],
    [t("existingSkipped"), preview.skippedExisting], [t("duplicatesMerged"), preview.collapsedDuplicates],
    [t("newCollections"), preview.createdCollections], [t("newSites"), preview.createdSites], [t("updatedSites"), preview.updatedSites],
  ];
  return <div className="bookmark-plan-preview">
    <div className="bookmark-plan-metrics">{metrics.map(([label, value]) => <div key={String(label)}><strong>{value}</strong><span>{label}</span></div>)}</div>
    {preview.errors.length ? <IssueList title={t("validationErrors")} issues={preview.errors} /> : null}
    {preview.warnings.length ? <IssueList title={t("importWarnings")} issues={preview.warnings} warning /> : null}
    {!preview.errors.length && !preview.addedItems ? <div className="notice-panel">{t("bookmarkNoNewItems")}</div> : null}
    {preview.canApply ? <div className="notice-panel">{t("validationPassed")}</div> : null}
  </div>;
}

function IssueList({ title, issues, warning = false }: { title: string; issues: string[]; warning?: boolean }) {
  return <div className={warning ? "bookmark-warning-panel" : "transfer-issues"}><strong>{title}</strong><ul>{issues.map((issue) => <li key={issue}>{localizeError(issue)}</li>)}</ul></div>;
}

function createDefaultFolderRule(folderKey: string, path: string[]): BookmarkFolderRule {
  const normalized = path.map((segment) => segment.trim().toLocaleLowerCase());
  const isArchived = normalized.some((segment) => segment === "archive" || segment === "archived" || segment === "归档");
  const readingState: ReadingState = normalized.some((segment) => ["done", "read", "已读", "完成"].includes(segment))
    ? "read"
    : normalized.some((segment) => ["reading", "在读", "阅读中"].includes(segment)) ? "reading" : "unread";
  return { folderKey, selected: true, readingState, isArchived, collectionPath: defaultCollectionPath(path, false) };
}

function defaultCollectionPath(path: string[], force: boolean): string[] {
  const filtered = path.filter((segment) => {
    const normalized = segment.trim().toLocaleLowerCase();
    return !STATUS_FOLDER_NAMES.has(normalized) && !BROWSER_ROOT_FOLDER_NAMES.has(normalized);
  }).slice(-5);
  if (filtered.length || !force) return filtered;
  return path.slice(-5);
}

function parseCollectionPath(value: string): string[] {
  return value.split("/").map((segment) => segment.trim()).filter(Boolean).slice(0, 5);
}

function inferSiteTarget(origin: string, sites: Site[]): BookmarkSiteTarget {
  const exact = findExactEndpointSite(origin, sites);
  return exact ? { type: "existing", siteId: exact.id } : { type: "unassigned" };
}

function findExactEndpointSite(origin: string, sites: Site[]): Site | undefined {
  return sites.find((site) => site.endpoints.some((endpoint) => normalizeEndpoint(endpoint.prefix) === origin));
}

function defaultSiteName(origin: string): string {
  return new URL(origin).hostname.replace(/^www\./i, "");
}

function describeError(error: unknown): string { return localizeError(error); }
