import { useEffect, useState } from "react";
import { getActivePage, type ActivePageSnapshot } from "../browser/active-page";
import { setActionVisualStateForTab } from "../browser/action-state";
import type { Collection, ReadingState, Site } from "../domain/models";
import { flattenCollections } from "../domain/collection-management";
import type { UrlIdentity } from "../domain/identity";
import { siteToDraft, type SiteDraft } from "../domain/site-management";
import { readingLibrary } from "../storage/library-instance";
import type { PageRecognition } from "../storage/reading-library";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { PageIdentityCard } from "../ui/PageIdentityCard";
import { ReadingStateControl } from "../ui/ReadingStateControl";
import { loadPopupPage } from "./load-page";
import { ensureEndpointInDraft, getDefaultSiteSelection, suggestSiteFromUrl } from "./site-selection";
import { requestActionIconRefresh } from "../browser/action-refresh";
import { localizeError, t } from "../i18n";

type ViewState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; page: ActivePageSnapshot; recognition: PageRecognition };

export function App() {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [readingState, setReadingState] = useState<ReadingState>("unread");
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteSelection, setSiteSelection] = useState("auto");
  const [newSiteId] = useState(() => crypto.randomUUID());
  const [newSiteName, setNewSiteName] = useState("");
  const [endpointPrefix, setEndpointPrefix] = useState("");
  const [sitePreview, setSitePreview] = useState<UrlIdentity | null>(null);
  const [needsEndpoint, setNeedsEndpoint] = useState(false);
  const [siteError, setSiteError] = useState("");
  const [sitePreviewing, setSitePreviewing] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  async function load() {
    try {
      const [{ page, recognition }, settings, loadedCollections, loadedSites] = await Promise.all([loadPopupPage({
        getActivePage,
        recognize: (url) => readingLibrary.recognize(url),
        setActionStateForTab: async (tabId, item) => {
          if (typeof chrome === "undefined" || !chrome.action) return;
          await setActionVisualStateForTab(tabId, item);
        },
      }), readingLibrary.getSettings(), readingLibrary.listCollections(), readingLibrary.listSites()]);
      setCollections(loadedCollections);
      setSites(loadedSites);
      if (!recognition.item) {
        const suggestion = suggestSiteFromUrl(page.url);
        setTitle(page.title);
        setReadingState(settings.defaultReadingState);
        setSiteSelection(getDefaultSiteSelection(recognition.identity.siteId));
        setNewSiteName(suggestion.name);
        setEndpointPrefix(suggestion.endpointPrefix);
        setSitePreview(recognition.identity);
      }
      setView({ kind: "ready", page, recognition });
    } catch (error) {
      setView({ kind: "error", message: toErrorMessage(error) });
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (view.kind !== "ready" || view.recognition.item) return;
    const readyView = view;
    let cancelled = false;
    async function refreshSitePreview(): Promise<void> {
      setSitePreviewing(true);
      setSitePreview(null);
      setSiteError("");
      setNeedsEndpoint(false);
      if (siteSelection === "auto") { setSitePreview(readyView.recognition.identity); setSitePreviewing(false); return; }
      try {
        if (siteSelection === "new") {
          const identity = await readingLibrary.previewSiteUrl(createNewSiteDraft(newSiteId, newSiteName, endpointPrefix), readyView.page.url);
          if (identity.siteId !== newSiteId) throw new Error(t("urlMatchesAdjust", { site: identity.siteName ?? t("unknownSite") }));
          if (!cancelled) setSitePreview(identity);
          return;
        }
        const selectedSite = sites.find((site) => site.id === siteSelection);
        if (!selectedSite) throw new Error(t("siteNotFound"));
        const current = await readingLibrary.previewSiteUrl(siteToDraft(selectedSite), readyView.page.url);
        if (current.siteId === selectedSite.id) { if (!cancelled) setSitePreview(current); return; }
        if (!cancelled) setNeedsEndpoint(true);
        const proposed = ensureEndpointInDraft(siteToDraft(selectedSite), endpointPrefix);
        const identity = await readingLibrary.previewSiteUrl(proposed, readyView.page.url);
        if (identity.siteId !== selectedSite.id) throw new Error(t("urlMatchesManage", { site: identity.siteName ?? t("unknownSite") }));
        if (!cancelled) setSitePreview(identity);
      } catch (previewError) {
        if (!cancelled) { setSitePreview(null); setSiteError(toErrorMessage(previewError)); }
      } finally {
        if (!cancelled) setSitePreviewing(false);
      }
    }
    void refreshSitePreview();
    return () => { cancelled = true; };
  }, [endpointPrefix, newSiteId, newSiteName, siteSelection, sites, view]);

  async function save() {
    if (view.kind !== "ready") return;
    setSaving(true);
    setFormError("");
    try {
      await prepareSelectedSite();
      await readingLibrary.savePage({
        ...view.page,
        title,
        note,
        tags: tags.split(/[，,]/),
        collectionId: collectionId || null,
        readingState,
      });
      await load();
    } catch (error) {
      setFormError(toErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function prepareSelectedSite(): Promise<void> {
    if (view.kind !== "ready" || siteSelection === "auto") return;
    if (sitePreviewing || siteError || !sitePreview) throw new Error(siteError || t("siteNotValidated"));
    if (siteSelection === "new") {
      await readingLibrary.saveSite(createNewSiteDraft(newSiteId, newSiteName, endpointPrefix));
      return;
    }
    if (!needsEndpoint) return;
    const selectedSite = sites.find((site) => site.id === siteSelection);
    if (!selectedSite) throw new Error(t("siteNotFound"));
    await readingLibrary.saveSite(ensureEndpointInDraft(siteToDraft(selectedSite), endpointPrefix));
  }

  async function changeExistingState(state: ReadingState) {
    if (view.kind !== "ready" || !view.recognition.item) return;
    await readingLibrary.setReadingState(view.recognition.item.id, state);
    await load();
  }

  async function deleteCurrentItem(): Promise<void> {
    if (view.kind !== "ready" || !view.recognition.item) return;
    const item = view.recognition.item;
    setSaving(true);
    try {
      await readingLibrary.deleteItem(item.id);
      setDeleteConfirming(false);
      requestActionIconRefresh();
      await load();
    } catch (error) {
      setView({ kind: "error", message: toErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  if (view.kind === "loading") return <div className="loading">{t("loadingPage")}</div>;

  return (
    <main className="popup">
      <header className="popup__header">
        <h1 className="popup__brand">{t("appName")}</h1>
      </header>

      {view.kind === "error" ? (
        <div className="error-panel" role="alert">
          {view.message}
        </div>
      ) : (
        <>
          <section className="popup__page-context">
            <span className="popup__eyebrow">{t("currentPage")}</span>
            <h2 className="popup__page-title">{view.page.title}</h2>
            <p className="popup__url">{view.page.url}</p>
          </section>

          {view.recognition.item ? (
            <ExistingItem
              recognition={view.recognition}
              onChangeState={(state) => void changeExistingState(state)}
              onDelete={() => void deleteCurrentItem()}
              deleteConfirming={deleteConfirming}
              onRequestDelete={() => setDeleteConfirming(true)}
              onCancelDelete={() => setDeleteConfirming(false)}
              busy={saving}
            />
          ) : (
            <section className="popup__form">
              <label className="field">
                <span className="field__label">{t("title")}</span>
                <input className="field__input" value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <section className="popup-site-card" aria-labelledby="popup-site-title">
                <div className="popup-site-card__heading">
                  <div><h3 id="popup-site-title">{t("site")}</h3><p>{t("siteDescription")}</p></div>
                  {view.recognition.identity.siteId && (siteSelection === "auto" || siteSelection === view.recognition.identity.siteId) ? <Badge tone="info">{t("autoMatched")}</Badge> : null}
                </div>
                <label className="field">
                  <span className="field__label">{t("selectSite")}</span>
                  <select className="field__input" value={siteSelection} onChange={(event) => { setSiteSelection(event.target.value); setFormError(""); }}>
                    <option value="auto">{t("autoRecognize")} ({view.recognition.identity.siteName ?? t("unassigned")})</option>
                    {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                    <option value="new">{t("createSite")}</option>
                  </select>
                </label>
                {siteSelection === "new" ? <label className="field"><span className="field__label">{t("newSiteName")}</span><input className="field__input" value={newSiteName} onChange={(event) => setNewSiteName(event.target.value)} placeholder={t("newSitePlaceholder")} /></label> : null}
                {siteSelection === "new" || needsEndpoint ? <label className="field"><span className="field__label">{siteSelection === "new" ? t("firstEndpoint") : t("addEndpoint")}</span><input className="field__input" value={endpointPrefix} onChange={(event) => setEndpointPrefix(event.target.value)} /><small>{needsEndpoint ? t("endpointWillBeAdded") : t("endpointPrefilled")}</small></label> : null}
                {siteError ? <div className="error-panel" role="alert">{siteError}</div> : null}
              </section>
              <label className="field">
                <span className="field__label">{t("noteOptional")}</span>
                <textarea
                  className="field__input"
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t("notePlaceholder")}
                />
              </label>
              <div className="popup__metadata-grid">
                <label className="field">
                  <span className="field__label">{t("collection")}</span>
                  <select className="field__input" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
                    <option value="">{t("inbox")}</option>
                    {flattenCollections(collections).map(({ collection, depth }) => <option key={collection.id} value={collection.id}>{`${"　".repeat(depth)}${collection.name}`}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">{t("tags")}</span>
                  <input className="field__input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t("tagsPlaceholder")} />
                </label>
              </div>
              <div className="field">
                <span className="field__label">{t("readingState")}</span>
                <ReadingStateControl value={readingState} onChange={setReadingState} />
              </div>
              <details className="popup__identity-details">
                <summary>{t("viewIdentity")}</summary>
                <PageIdentityCard identity={sitePreview ?? view.recognition.identity} />
              </details>
              {formError ? <div className="error-panel" role="alert">{formError}</div> : null}
            </section>
          )}
        </>
      )}

      <footer className="popup__footer">
        {view.kind === "ready" && !view.recognition.item ? <Button full disabled={saving || sitePreviewing || Boolean(siteError)} onClick={() => void save()}>{saving ? t("saving") : t("saveToLibrary")}</Button> : null}
        <Button variant="ghost" onClick={() => {
          if (typeof chrome === "undefined" || !chrome.runtime) window.location.href = "/library.html";
          else void chrome.runtime.openOptionsPage();
        }}>
          {t("manageLibrary")}
        </Button>
      </footer>
    </main>
  );
}

function createNewSiteDraft(id: string, name: string, endpointPrefix: string): SiteDraft {
  return {
    id,
    name,
    description: t("createdFromPopup"),
    endpoints: [{ prefix: endpointPrefix, enabled: true }],
    queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
  };
}

function ExistingItem({
  recognition,
  onChangeState,
  onDelete,
  deleteConfirming,
  onRequestDelete,
  onCancelDelete,
  busy,
}: {
  recognition: PageRecognition;
  onChangeState: (state: ReadingState) => void;
  onDelete: () => void;
  deleteConfirming: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  busy: boolean;
}) {
  const item = recognition.item!;
  const tone = item.readingState === "read" ? "success" : item.readingState === "reading" ? "info" : "warning";
  const label = item.readingState === "read" ? t("savedRead") : item.readingState === "reading" ? t("savedReading") : t("savedUnread");

  return (
    <section className="popup__existing">
      <div className="popup__status">
        <Badge tone={tone}>{label}</Badge>
        {item.firstReadAt && item.readingState !== "read" ? <Badge tone="success">{t("readBefore")}</Badge> : null}
      </div>
      {item.note ? <p>{item.note}</p> : <p className="muted">{t("noNote")}</p>}
      <details className="popup__identity-details">
        <summary>{t("viewIdentityDetails")}</summary>
        <PageIdentityCard identity={recognition.identity} />
      </details>
      <div className="popup__actions">
        {item.readingState === "read" ? (
          <Button variant="secondary" onClick={() => onChangeState("unread")}>
            {t("markUnreadAgain")}
          </Button>
        ) : (
          <Button onClick={() => onChangeState("read")}>{t("markRead")}</Button>
        )}
        {deleteConfirming ? (
          <div className="popup__delete-confirm" role="alert">
            <div>
              <strong>{t("deleteCurrentQuestion")}</strong>
              <p>{t("deleteCurrentHint")}</p>
            </div>
            <div className="popup__delete-confirm-actions">
              <Button variant="ghost" disabled={busy} onClick={onCancelDelete}>{t("cancel")}</Button>
              <Button className="popup__delete-confirm-button" variant="secondary" disabled={busy} onClick={onDelete}>
                {busy ? t("deleting") : t("confirmDelete")}
              </Button>
            </div>
          </div>
        ) : <Button className="popup__delete-button" variant="ghost" disabled={busy} onClick={onRequestDelete}>{t("deleteCurrent")}</Button>}
      </div>
    </section>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? localizeError(error) : t("unknownError");
}
