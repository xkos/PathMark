import { normalizeEndpoint } from "../domain/identity";
import type { SiteDraft } from "../domain/site-management";
import { t } from "../i18n";

export interface PageSiteSuggestion {
  name: string;
  endpointPrefix: string;
}

export function getDefaultSiteSelection(siteId: string | null): string {
  return siteId ?? "auto";
}

export function suggestSiteFromUrl(input: string): PageSiteSuggestion {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(t("httpOnly"));
  return {
    name: url.hostname.replace(/^www\./i, ""),
    endpointPrefix: url.origin,
  };
}

export function ensureEndpointInDraft(draft: SiteDraft, endpointPrefix: string): SiteDraft {
  const normalized = normalizeEndpoint(endpointPrefix.trim());
  let found = false;
  const endpoints = draft.endpoints.map((endpoint) => {
    if (normalizeEndpoint(endpoint.prefix) !== normalized) return endpoint;
    found = true;
    return { ...endpoint, prefix: normalized, enabled: true };
  });
  if (!found) endpoints.push({ prefix: normalized, enabled: true });
  return { ...draft, endpoints };
}
