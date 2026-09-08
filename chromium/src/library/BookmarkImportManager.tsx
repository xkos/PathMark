import { SelectionTree, TreeSelectionActions, type SelectionNode } from "./SelectionTree";
import { useMemo, useState, type ReactNode } from "react";
import {
  bookmarkFolderKey,
  parseBookmarkHtml,
  UNTITLED_BOOKMARK_FOLDER,
  type BookmarkFolderRule,
  type BookmarkImportSnapshot,
  type BookmarkImportPreview,
  type BookmarkImportRequest,
  type BookmarkSiteMapping,
  type BookmarkSiteTarget,
} from "../domain/bookmark-import";
import { requestBrowserBookmarkSnapshot } from "../browser/bookmark-access";
import { normalizeEndpoint } from "../domain/identity";
import type { Collection, ReadingState, Site } from "../domain/models";
import { requestActionIconRefresh } from "../browser/action-refresh";
import { localizeError, t } from "../i18n";
import { readingLibrary } from "../storage/library-instance";
import { Button } from "../ui/Button";

export function BookmarkImportManager({ onImported }: { onImported: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<BookmarkImportSnapshot | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [folderRules, setFolderRules] = useState<BookmarkFolderRule[]>([]);
  const [newCollectionRows, setNewCollectionRows] = useState<Set<string>>(() => new Set());
  const [collectionNames, setCollectionNames] = useState<Record<string, string>>({});
  const [draftCollectionPaths, setDraftCollectionPaths] = useState<string[][]>([]);
  const [excludedHostnames, setExcludedHostnames] = useState<Set<string>>(() => new Set());
  const [siteMappings, setSiteMappings] = useState<BookmarkSiteMapping[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
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

  const excludedRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const candidate of selectedCandidates) {
      const host = new URL(candidate.url).hostname;
      if (excludedHostnames.has(host)) counts.set(host, (counts.get(host) ?? 0) + 1);
    }
    return [...counts];
  }, [selectedCandidates, excludedHostnames]);
  const includedCandidates = selectedCandidates.filter((candidate) => !excludedHostnames.has(new URL(candidate.url).hostname));
  function excludeDomain(host: string, excluded: boolean) {
    setExcludedHostnames((current) => {
      const next = new Set(current);
      if (excluded) next.add(host); else next.delete(host);
      return next;
    });
    setPreview(null); setError(""); setNotice("");
  }

  const folderNodes = useMemo(() => {
    const nodes = new Map<string, SelectionNode>((snapshot?.folders ?? []).map((folder) => [folder.key, { id: folder.key, label: localizeFolderPath(folder.path).at(-1) ?? t("bookmarkRootFolder"), children: [] }]));
    const roots: SelectionNode[] = [];
    for (const folder of snapshot?.folders ?? []) {
      const node = nodes.get(folder.key)!;
      const parent = folder.path.length ? nodes.get(bookmarkFolderKey(folder.path.slice(0, -1))) : undefined;
      if (parent) parent.children!.push(node); else roots.push(node);
    }
    return roots;
  }, [snapshot]);
  const collectionPaths = useMemo(() => {
    const paths = new Map<string, string[]>();
    for (const collection of collections) {
      const path = [collection.name]; let parentId = collection.parentId;
      const seen = new Set([collection.id]);
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId); const parent = collections.find((candidate) => candidate.id === parentId);
        if (!parent) break; path.unshift(parent.name); parentId = parent.parentId;
      }
      paths.set(JSON.stringify(path), path);
    }
    return [...paths.values()];
  }, [collections]);
  const pendingCollectionPaths = draftCollectionPaths.filter((path) => !collectionPaths.some((existing) => JSON.stringify(existing) === JSON.stringify(path)));
  function chooseCollection(folderKey: string, value: string) {
    setNewCollectionRows((current) => {
      const next = new Set(current);
      if (value === "new") next.add(folderKey); else next.delete(folderKey);
      return next;
    });
    if (value !== "new") updateFolderRule(folderKey, { collectionPath: JSON.parse(value) as string[] });
    setPreview(null); setNotice("");
  }
  function createImportCollection(folderKey: string) {
    const name = collectionNames[folderKey]?.trim();
    if (!name) return;
    const path = [name];
    setDraftCollectionPaths((current) => current.some((candidate) => JSON.stringify(candidate) === JSON.stringify(path)) ? current : [...current, path]);
    chooseCollection(folderKey, JSON.stringify(path));
  }

  const draftSiteNames = [...new Set(siteMappings.flatMap((mapping) => mapping.target.type === "new" && mapping.target.siteName.trim() ? [mapping.target.siteName] : []))];
  function selectFolders(ids: string[], checked: boolean) {
    const keys = new Set(ids);
    setFolderRules((current) => current.map((rule) => keys.has(rule.folderKey) ? { ...rule, selected: checked } : rule));
    setPreview(null); setNotice("");
  }

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
    const [existingSites, existingCollections] = await Promise.all([readingLibrary.listSites(), readingLibrary.listCollections()]);
    setCollections(existingCollections);
    setExcludedHostnames(new Set());
    setNewCollectionRows(new Set()); setCollectionNames({}); setDraftCollectionPaths([]);
    const allFolders = new Map(parsed.folders.map((folder) => [folder.key, folder]));
    for (const folder of parsed.folders) {
      for (let depth = 1; depth < folder.path.length; depth++) {
        const path = folder.path.slice(0, depth); const key = bookmarkFolderKey(path);
        if (!allFolders.has(key)) allFolders.set(key, { key, path, itemCount: 0 });
      }
    }
    parsed = { ...parsed, folders: [...allFolders.values()] };
    const rules = parsed.folders.map((folder) => createDefaultFolderRule(folder.key, localizeFolderPath(folder.path)));
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
      else if (value.startsWith("draft:")) target = { type: "new", siteName: value.slice(6) };
      else target = { type: "existing", siteId: value.slice("existing:".length) };
      return { ...mapping, target };
    }));
    setPreview(null); setNotice("");
  }

  function updateNewSiteName(origin: string, siteName: string): void {
    const previous = siteMappings.find((mapping) => mapping.origin === origin)?.target;
    setSiteMappings((current) => current.map((mapping) =>
      previous?.type === "new" && mapping.target.type === "new" && mapping.target.siteName === previous.siteName
        ? { ...mapping, target: { type: "new", siteName } }
        : mapping));
    setPreview(null); setNotice("");
  }

  function buildRequest(): BookmarkImportRequest {
    if (folderRules.some((rule) => includedCandidates.some((candidate) => bookmarkFolderKey(candidate.folderPath) === rule.folderKey) && newCollectionRows.has(rule.folderKey))) throw new Error(t("finishImportCollection"));
    return { candidates: snapshot?.candidates ?? [], folderRules, siteMappings, excludedHostnames: [...excludedHostnames] };
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
      const [savedSites, savedCollections] = await Promise.all([readingLibrary.listSites(), readingLibrary.listCollections()]);
      setSites(savedSites); setCollections(savedCollections);
      setSiteMappings((current) => current.map((mapping) => {
        if (mapping.target.type !== "new") return mapping;
        const name = mapping.target.siteName.trim().toLocaleLowerCase();
        const saved = savedSites.find((site) => site.name.trim().toLocaleLowerCase() === name && site.endpoints.some((endpoint) => normalizeEndpoint(endpoint.prefix) === mapping.origin));
        return saved ? { ...mapping, target: { type: "existing", siteId: saved.id } } : mapping;
      }));
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
        <ImportStep heading={t("bookmarkFolderRules")} hint={t("importCollectionHint")}>
          <TreeSelectionActions nodes={folderNodes} onSelect={selectFolders} />
          <div className="bookmark-folder-tree">
          <div className="bookmark-folder-tree__head"><span>{t("sourceFolder")}</span><span>{t("linkCount")}</span><span>{t("readingState")}</span><span>{t("collection")}</span></div>
          <SelectionTree nodes={folderNodes} selected={selectedFolderKeys} onSelect={selectFolders} render={(node) => {
            const rule = folderRules.find((candidate) => candidate.folderKey === node.id)!;
            const folder = snapshot.folders.find((candidate) => candidate.key === node.id)!;
            return <div className="bookmark-tree-controls">
              <span className="bookmark-tree-count">{folder.itemCount}</span>
              <select className="field__input" aria-label={t("readingState")} disabled={!rule.selected} value={rule.isArchived ? "archived" : rule.readingState} onChange={(event) => {
                const value = event.target.value;
                updateFolderRule(rule.folderKey, value === "archived" ? { isArchived: true } : { readingState: value as ReadingState, isArchived: false });
              }}>
                <option value="unread">{t("unread")}</option><option value="reading">{t("reading")}</option><option value="read">{t("read")}</option><option value="archived">{t("archived")}</option>
              </select>
              <div className="bookmark-collection-picker">
                <select className="field__input" aria-label={t("collection")} disabled={!rule.selected} value={newCollectionRows.has(rule.folderKey) ? "new" : JSON.stringify(rule.collectionPath)} onChange={(event) => chooseCollection(rule.folderKey, event.target.value)}>
                  <option value="[]">{t("uncategorized")}</option>
                  {collectionPaths.length ? <optgroup label={t("existingImportCollections")}>{collectionPaths.map((path) => <option key={JSON.stringify(path)} value={JSON.stringify(path)}>{path.join(" / ")}</option>)}</optgroup> : null}
                  {pendingCollectionPaths.length ? <optgroup label={t("draftOption")}>{pendingCollectionPaths.map((path) => <option key={JSON.stringify(path)} value={JSON.stringify(path)}>{path.join(" / ")} · {t("draftOption")}</option>)}</optgroup> : null}
                  <option value="new">＋ {t("newCollection")}</option>
                </select>
                {newCollectionRows.has(rule.folderKey) ? <div className="bookmark-collection-create">
                  <input className="field__input" disabled={!rule.selected} aria-label={t("collectionName")} placeholder={t("collectionPlaceholder")} value={collectionNames[rule.folderKey] ?? ""} onChange={(event) => setCollectionNames((current) => ({ ...current, [rule.folderKey]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); createImportCollection(rule.folderKey); } }} />
                  <Button type="button" variant="secondary" disabled={!rule.selected || !collectionNames[rule.folderKey]?.trim()} onClick={() => createImportCollection(rule.folderKey)}>{t("createCollectionFromFolder")}</Button>
                </div> : null}
              </div>
            </div>;
          }} />
          </div>
        </ImportStep>

        <ImportStep heading={t("bookmarkSiteMapping")} hint={t("bookmarkSiteMappingHint")}>
          <div className="bookmark-site-grid">
            {originRows.filter(([origin]) => !excludedHostnames.has(new URL(origin).hostname)).map(([origin, count]) => {
              const mapping = siteMappings.find((candidate) => candidate.origin === origin);
              if (!mapping) return null;
              const value = mapping.target.type === "unassigned" ? "unassigned" : mapping.target.type === "new" ? (mapping.target.siteName.trim() ? `draft:${mapping.target.siteName}` : "new") : `existing:${mapping.target.siteId}`;
              const exactSite = findExactEndpointSite(origin, sites);
              return <article className="bookmark-site-row" key={origin}>
                <div className="bookmark-site-row__origin">
                  <div className="bookmark-domain-heading">
                    <div className="bookmark-domain-action">
                      <button className="bookmark-domain-exclude" type="button" disabled={busy} aria-label={t("excludeImportDomain")} aria-describedby={`exclude-domain-${encodeURIComponent(origin)}`} onClick={() => excludeDomain(new URL(origin).hostname, true)}>
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
                      </button>
                      <span className="bookmark-domain-tooltip" role="tooltip" id={`exclude-domain-${encodeURIComponent(origin)}`}>{t("excludeImportDomain")}</span>
                    </div>
                    <strong>{new URL(origin).hostname}</strong>
                  </div>
                  <span className="bookmark-domain-address">{count} · {origin}</span>
                </div>
                <label className="field"><span className="field__label">{t("targetSite")}</span><select className="field__input" value={value} onChange={(event) => updateSiteTarget(origin, event.target.value)}>
                  <option value="unassigned">{t("unassignedImport")}</option>
                  {sites.map((site) => <option value={`existing:${site.id}`} key={site.id}>{site.name}{exactSite?.id === site.id ? ` · ${t("exactEndpointMatch")}` : ""}</option>)}
                  {draftSiteNames.map((name) => <option key={name} value={`draft:${name}`}>{name} · {t("draftOption")}</option>)}
                  <option value="new">{t("createNewSiteOption")}</option>
                </select></label>
                {mapping.target.type === "new" ? <label className="field"><span className="field__label">{t("newSiteNameForImport")}</span><input className="field__input" value={mapping.target.siteName} onChange={(event) => updateNewSiteName(origin, event.target.value)} /></label> : null}
              </article>;
            })}
          </div>
          {excludedRows.length ? <details className="bookmark-excluded-domains"><summary>{t("excludedImportDomains")} ({excludedRows.length})</summary>
            {excludedRows.map(([host, count]) => <div key={host}><span>{host} · {count}</span><Button type="button" variant="ghost" disabled={busy} onClick={() => excludeDomain(host, false)}>{t("restoreImportDomain")}</Button></div>)}
          </details> : null}
        </ImportStep>

        <ImportStep heading={t("bookmarkPreviewAction")} hint={t("bookmarkPreviewHint")}>
          <div className="bookmark-preview-actions">
            <Button type="button" variant="secondary" disabled={busy || !includedCandidates.length} onClick={() => void generatePreview()}>{t("previewBookmarkImport")}</Button>
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
  return { folderKey, selected: true, readingState, isArchived, collectionPath: [] };
}

function localizeFolderPath(path: string[]): string[] {
  return path.map((segment) => segment === UNTITLED_BOOKMARK_FOLDER ? t("bookmarkUntitledFolder") : segment);
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
