import { useEffect, useState } from "react";
import type { UrlIdentity } from "../domain/identity";
import { siteToDraft, type EndpointDraft, type SiteDraft } from "../domain/site-management";
import type { Site } from "../domain/models";
import { readingLibrary } from "../storage/library-instance";
import type { DeleteSiteStrategy, SiteChangeImpact } from "../storage/reading-library";
import { Button } from "../ui/Button";
import { requestActionIconRefresh } from "../browser/action-refresh";
import { localizeError, t } from "../i18n";

export function SiteManager() {
  const [sites, setSites] = useState<Site[]>([]);
  const [draft, setDraft] = useState<SiteDraft>(() => createEmptySiteDraft());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [relatedItemCount, setRelatedItemCount] = useState(0);
  const [previewUrl, setPreviewUrl] = useState("");
  const [preview, setPreview] = useState<UrlIdentity | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [impact, setImpact] = useState<SiteChangeImpact | null>(null);
  const [reviewedFingerprint, setReviewedFingerprint] = useState<string | null>(null);
  const [selectedRemapIds, setSelectedRemapIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    void reloadSites();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setRelatedItemCount(0);
      return;
    }
    void readingLibrary.countItemsForSite(selectedId).then(setRelatedItemCount);
  }, [selectedId]);

  async function reloadSites(preferredId?: string): Promise<void> {
    const loaded = await readingLibrary.listSites();
    setSites(loaded);
    const selected = loaded.find((site) => site.id === preferredId) ?? loaded[0];
    if (selected) {
      setSelectedId(selected.id);
      setDraft(siteToDraft(selected));
    } else {
      startNewSite();
    }
  }

  function selectSite(site: Site): void {
    setSelectedId(site.id);
    setDraft(siteToDraft(site));
    resetFeedback();
  }

  function startNewSite(): void {
    setSelectedId(null);
    setDraft(createEmptySiteDraft());
    setRelatedItemCount(0);
    resetFeedback();
  }

  function resetFeedback(): void {
    setError("");
    setNotice("");
    setPreview(null);
    setImpact(null);
    setReviewedFingerprint(null);
    setSelectedRemapIds(new Set());
  }

  function updateEndpoint(index: number, update: Partial<EndpointDraft>): void {
    setDraft((current) => ({
      ...current,
      endpoints: current.endpoints.map((endpoint, endpointIndex) =>
        endpointIndex === index ? { ...endpoint, ...update } : endpoint,
      ),
    }));
    setPreview(null);
  }

  function moveEndpoint(index: number, direction: -1 | 1): void {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= draft.endpoints.length) return;
    const endpoints = [...draft.endpoints];
    [endpoints[index], endpoints[nextIndex]] = [endpoints[nextIndex], endpoints[index]];
    setDraft((current) => ({ ...current, endpoints }));
    setPreview(null);
  }

  async function saveSite(): Promise<void> {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (requiresImpactPreview && !impactIsCurrent) {
        throw new Error(t("sitePreviewRequired"));
      }
      const saved = await readingLibrary.saveSite(draft);
      await reloadSites(saved.id);
      setReviewedFingerprint(siteConfigurationFingerprint(siteToDraft(saved)));
      setNotice(t("siteSaved"));
      requestActionIconRefresh();
    } catch (saveError) {
      setError(describeError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function runImpactPreview(): Promise<void> {
    setError("");
    setNotice("");
    try {
      const nextImpact = await readingLibrary.previewSiteChange(draft);
      setImpact(nextImpact);
      setReviewedFingerprint(siteConfigurationFingerprint(draft));
      setSelectedRemapIds(new Set());
    } catch (impactError) {
      setImpact(null);
      setError(describeError(impactError));
    }
  }

  async function remapSelectedItems(): Promise<void> {
    if (!selectedRemapIds.size) return;
    if (requiresImpactPreview) {
      setError(t("saveBeforeRemap"));
      return;
    }
    setError("");
    try {
      const updated = await readingLibrary.remapItems([...selectedRemapIds]);
      const nextImpact = await readingLibrary.previewSiteChange(draft);
      setImpact(nextImpact);
      setReviewedFingerprint(siteConfigurationFingerprint(draft));
      setSelectedRemapIds(new Set());
      setNotice(t("remappedCount", { count: updated.length }));
      requestActionIconRefresh();
    } catch (remapError) {
      setError(describeError(remapError));
    }
  }

  async function runPreview(): Promise<void> {
    setError("");
    setNotice("");
    try {
      setPreview(await readingLibrary.previewSiteUrl(draft, previewUrl));
    } catch (previewError) {
      setPreview(null);
      setError(describeError(previewError));
    }
  }

  async function deleteSite(strategy: DeleteSiteStrategy): Promise<void> {
    if (!selectedId) return;
    const action = strategy === "delete-items" ? t("deleteRelatedItems") : t("unassignRelatedItems");
    if (!window.confirm(t("deleteSiteQuestion", { name: draft.name, action }))) return;
    setError("");
    try {
      const impacted = await readingLibrary.deleteSite(selectedId, strategy);
      await reloadSites();
      setNotice(t("siteDeleted", { count: impacted }));
      requestActionIconRefresh();
    } catch (deleteError) {
      setError(describeError(deleteError));
    }
  }

  const policyParameters =
    draft.queryPolicy.mode === "keep-only-identity"
      ? draft.queryPolicy.identityParams
      : draft.queryPolicy.ignoredParams;
  const selectedSite = sites.find((site) => site.id === selectedId);
  const draftFingerprint = siteConfigurationFingerprint(draft);
  const savedFingerprint = selectedSite ? siteConfigurationFingerprint(siteToDraft(selectedSite)) : null;
  const hasEndpointConfiguration = draft.endpoints.some((endpoint) => endpoint.prefix.trim());
  const requiresImpactPreview = hasEndpointConfiguration && draftFingerprint !== savedFingerprint;
  const impactIsCurrent = impact !== null && reviewedFingerprint === draftFingerprint;

  return (
    <div className="site-management">
      <header className="library-header">
        <div>
          <h2 className="library-title">{t("sitesAndEndpoints")}</h2>
          <p className="library-subtitle">{t("sitesHint")}</p>
        </div>
        <Button type="button" onClick={startNewSite}>{t("newSite")}</Button>
      </header>

      <div className="site-management__body">
        <aside className="site-list" aria-label={t("siteList")}>
          {sites.length ? sites.map((site) => (
            <button
              type="button"
              key={site.id}
              className={`site-list__item${selectedId === site.id ? " site-list__item--active" : ""}`}
              onClick={() => selectSite(site)}
            >
              <strong>{site.name}</strong>
              <span>{t("endpointsCount", { count: site.endpoints.length })}</span>
            </button>
          )) : <p className="site-list__empty">{t("noSites")}</p>}
        </aside>

        <section className="site-editor" aria-label={t("siteEditor")}>
          <div className="site-editor__grid">
            <label className="field">
              <span className="field__label">{t("siteName")}</span>
              <input
                className="field__input"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={t("newSitePlaceholder")}
              />
            </label>
            <label className="field">
              <span className="field__label">{t("description")}</span>
              <input
                className="field__input"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder={t("siteDescriptionPlaceholder")}
              />
            </label>
          </div>

          <div className="site-editor__section-heading">
            <div>
              <h3>Endpoint</h3>
              <p>{t("endpointOrderHint")}</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDraft({
                ...draft,
                endpoints: [...draft.endpoints, { id: crypto.randomUUID(), prefix: "", enabled: true }],
              })}
            >
              {t("addEndpointButton")}
            </Button>
          </div>

          <div className="endpoint-list">
            {draft.endpoints.length ? draft.endpoints.map((endpoint, index) => (
              <div className="endpoint-row" key={endpoint.id ?? index}>
                <span className="endpoint-row__priority" title={t("resolutionPriority")}>{index + 1}</span>
                <input
                  className="field__input endpoint-row__prefix"
                  value={endpoint.prefix}
                  onChange={(event) => updateEndpoint(index, { prefix: event.target.value })}
                  placeholder="https://example.com/docs"
                  aria-label={t("endpointPrefixLabel", { index: index + 1 })}
                />
                <label className="endpoint-row__enabled">
                  <input
                    type="checkbox"
                    checked={endpoint.enabled}
                    onChange={(event) => updateEndpoint(index, { enabled: event.target.checked })}
                  />
                  {t("enabled")}
                </label>
                <div className="endpoint-row__actions">
                  <button type="button" disabled={index === 0} onClick={() => moveEndpoint(index, -1)} aria-label={t("moveUp")}>↑</button>
                  <button type="button" disabled={index === draft.endpoints.length - 1} onClick={() => moveEndpoint(index, 1)} aria-label={t("moveDown")}>↓</button>
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, endpoints: draft.endpoints.filter((_, itemIndex) => itemIndex !== index) })}
                    aria-label={t("removeEndpoint")}
                  >
                    {t("remove")}
                  </button>
                </div>
              </div>
            )) : <div className="endpoint-list__empty">{t("noEndpoints")}</div>}
          </div>

          <div className="site-editor__grid site-editor__policy">
            <label className="field">
              <span className="field__label">{t("queryPolicy")}</span>
              <select
                className="field__input"
                value={draft.queryPolicy.mode}
                onChange={(event) => setDraft({
                  ...draft,
                  queryPolicy: event.target.value === "keep-only-identity"
                    ? { mode: "keep-only-identity", identityParams: [] }
                    : { mode: "keep-all-except-ignored", ignoredParams: [] },
                })}
              >
                <option value="keep-all-except-ignored">{t("keepExceptIgnored")}</option>
                <option value="keep-only-identity">{t("keepIdentityOnly")}</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">
                {draft.queryPolicy.mode === "keep-only-identity" ? t("identityParams") : t("extraIgnoredParams")}
              </span>
              <input
                className="field__input"
                value={policyParameters.join(", ")}
                onChange={(event) => {
                  const parameters = parseParameterList(event.target.value);
                  setDraft({
                    ...draft,
                    queryPolicy: draft.queryPolicy.mode === "keep-only-identity"
                      ? { mode: "keep-only-identity", identityParams: parameters }
                      : { mode: "keep-all-except-ignored", ignoredParams: parameters },
                  });
                }}
                placeholder={t("paramsPlaceholder")}
              />
            </label>
          </div>

          <section className="impact-preview">
            <div className="site-editor__section-heading">
              <div>
                <h3>{t("impactPreview")}</h3>
                <p>{t("impactPreviewHint")}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => void runImpactPreview()}>{t("previewImpact")}</Button>
            </div>
            {impact && !impactIsCurrent ? <div className="impact-preview__stale">{t("impactStale")}</div> : null}
            {impactIsCurrent && impact ? (
              <>
                <div className="impact-summary">
                  <div><strong>{impact.associatedItemCount}</strong><span>{t("associatedItems")}</span></div>
                  <div><strong>{impact.resolutionChanges.length}</strong><span>{t("defaultAddressChanges")}</span></div>
                  <div><strong>{impact.identityChanges.length}</strong><span>{t("identityChanges")}</span></div>
                  <div><strong>{impact.identityChanges.filter((change) => change.hasConflict).length}</strong><span>{t("canonicalConflicts")}</span></div>
                </div>

                {impact.resolutionChanges.length ? (
                  <div className="impact-group">
                    <h4>{t("defaultOpenChanges")}</h4>
                    {impact.resolutionChanges.map((change) => (
                      <div className="impact-row" key={change.itemId}>
                        <strong>{change.title}</strong>
                        <span>{change.beforeUrl ?? t("noEndpointAvailable")}</span>
                        <span className="impact-row__arrow">→</span>
                        <span>{change.afterUrl ?? t("noEndpointAvailable")}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {impact.identityChanges.length ? (
                  <div className="impact-group">
                    <div className="impact-group__heading">
                      <h4>{t("remappableItems")}</h4>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!selectedRemapIds.size || requiresImpactPreview}
                        onClick={() => void remapSelectedItems()}
                      >
                        {t("remapSelected")}
                      </Button>
                    </div>
                    {impact.identityChanges.map((change) => (
                      <label className={`identity-impact${change.hasConflict ? " identity-impact--conflict" : ""}`} key={change.itemId}>
                        <input
                          type="checkbox"
                          disabled={change.hasConflict}
                          checked={selectedRemapIds.has(change.itemId)}
                          onChange={(event) => setSelectedRemapIds((current) => toggleSetValue(current, change.itemId, event.target.checked))}
                        />
                        <span>
                          <strong>{change.title}</strong>
                          <small>{formatIdentity(change.before)} → {formatIdentity(change.after)}</small>
                          {change.hasConflict ? <small className="identity-impact__error">{t("remapConflict")}</small> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : <p className="impact-preview__empty">{t("noRemapNeeded")}</p>}
              </>
            ) : null}
          </section>

          <section className="match-preview">
            <div className="site-editor__section-heading">
              <div>
                <h3>{t("urlMatchPreview")}</h3>
                <p>{t("urlMatchHint")}</p>
              </div>
            </div>
            <div className="match-preview__form">
              <input
                className="field__input"
                value={previewUrl}
                onChange={(event) => setPreviewUrl(event.target.value)}
                placeholder="https://new.example.org/archive/paper/123"
                aria-label={t("previewUrl")}
              />
              <Button type="button" variant="secondary" onClick={() => void runPreview()}>{t("previewMatch")}</Button>
            </div>
            {preview ? <PreviewResult identity={preview} expectedSiteId={draft.id ?? null} /> : null}
          </section>

          {error ? <div className="error-panel" role="alert">{error}</div> : null}
          {notice ? <div className="notice-panel" role="status">{notice}</div> : null}

          <footer className="site-editor__footer">
            <p className="muted">{t("endpointSaveHint")}</p>
            <div className="site-editor__footer-actions">
              {selectedId ? (
                relatedItemCount ? (
                  <>
                    <Button type="button" variant="ghost" onClick={() => void deleteSite("unassign-items")}>{t("deleteSiteMove", { count: relatedItemCount })}</Button>
                    <Button type="button" variant="ghost" onClick={() => void deleteSite("delete-items")}>{t("deleteSiteItems")}</Button>
                  </>
                ) : (
                  <Button type="button" variant="ghost" onClick={() => void deleteSite("delete-items")}>{t("deleteSite")}</Button>
                )
              ) : null}
              <Button type="button" disabled={saving} onClick={() => void saveSite()}>{saving ? t("savingShort") : t("saveSite")}</Button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  );
}

function PreviewResult({ identity, expectedSiteId }: { identity: UrlIdentity; expectedSiteId: string | null }) {
  const matchesDraft = identity.kind === "site" && identity.siteId === expectedSiteId;
  return (
    <dl className="match-preview__result">
      <dt>{t("matchResult")}</dt><dd>{matchesDraft ? t("matchesCurrentSite") : identity.kind === "site" ? t("matchesOtherSite", { site: identity.siteName ?? t("unknownSite") }) : t("unassigned")}</dd>
      <dt>{t("endpoint")}</dt><dd>{identity.endpointPrefix ?? t("notMatched")}</dd>
      <dt>{t("resourceKey")}</dt><dd>{identity.resourceKey ?? "—"}</dd>
      <dt>{t("canonicalKey")}</dt><dd>{identity.canonicalKey}</dd>
    </dl>
  );
}

function createEmptySiteDraft(): SiteDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    endpoints: [{ id: crypto.randomUUID(), prefix: "", enabled: true }],
    queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
  };
}

function parseParameterList(value: string): string[] {
  return value.split(",").map((parameter) => parameter.trim());
}

function siteConfigurationFingerprint(draft: SiteDraft): string {
  return JSON.stringify({
    endpoints: draft.endpoints.map(({ id, prefix, enabled }) => ({ id, prefix: prefix.trim(), enabled })),
    queryPolicy: draft.queryPolicy,
  });
}

function toggleSetValue(current: Set<string>, value: string, checked: boolean): Set<string> {
  const next = new Set(current);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

function formatIdentity(identity: UrlIdentity): string {
  return identity.kind === "site"
    ? `${identity.siteName ?? t("genericSite")} ${identity.resourceKey ?? ""}`
    : t("unassigned");
}

function describeError(error: unknown): string {
  return localizeError(error);
}
