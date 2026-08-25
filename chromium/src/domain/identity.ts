import { AppError } from "./app-error";
import type { AppSettings, Endpoint, QueryPolicy, Site } from "./models";

export interface UrlIdentity {
  kind: "site" | "unassigned";
  normalizedUrl: string;
  canonicalKey: string;
  siteId: string | null;
  siteName: string | null;
  endpointId: string | null;
  endpointPrefix: string | null;
  resourceKey: string | null;
}

export class InvalidHttpUrlError extends AppError {}
export class InvalidEndpointError extends AppError {}
export class AmbiguousEndpointError extends AppError {}

interface EndpointMatch {
  site: Site;
  endpoint: Endpoint;
  endpointUrl: URL;
}

export function normalizeEndpoint(prefix: string): string {
  let url: URL;
  try {
    url = new URL(prefix);
  } catch {
    throw new InvalidEndpointError("endpointInvalidUrl");
  }

  assertHttpProtocol(url, InvalidEndpointError);
  if (url.username || url.password || url.search || url.hash) {
    throw new InvalidEndpointError("endpointHasUnsupportedParts");
  }

  url.pathname = stripTrailingSlash(url.pathname);
  return url.toString().replace(/\/$/, url.pathname === "/" ? "/" : "");
}

export function identifyUrl(
  input: string,
  sites: Site[],
  settings: AppSettings,
): UrlIdentity {
  const url = parseHttpUrl(input);
  url.hash = "";

  const matches = collectMatches(url, sites);
  const match = selectLongestMatch(matches);

  if (!match) {
    const normalizedUrl = normalizeUrl(url, settings.globalIgnoredQueryParams, settings.stripTrailingSlash);
    return {
      kind: "unassigned",
      normalizedUrl,
      canonicalKey: `v1:url:${encodeURIComponent(normalizedUrl)}`,
      siteId: null,
      siteName: null,
      endpointId: null,
      endpointPrefix: null,
      resourceKey: null,
    };
  }

  const resourceKey = createResourceKey(url, match.endpointUrl, match.site.queryPolicy, settings);
  return {
    kind: "site",
    normalizedUrl: normalizeUrl(url, settings.globalIgnoredQueryParams, settings.stripTrailingSlash),
    canonicalKey: `v1:site:${match.site.id}:${encodeURIComponent(resourceKey)}`,
    siteId: match.site.id,
    siteName: match.site.name,
    endpointId: match.endpoint.id,
    endpointPrefix: normalizeEndpoint(match.endpoint.prefix),
    resourceKey,
  };
}

function parseHttpUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new InvalidHttpUrlError("currentPageInvalidUrl");
  }
  assertHttpProtocol(url, InvalidHttpUrlError);
  return url;
}

function assertHttpProtocol(
  url: URL,
  ErrorType: typeof InvalidEndpointError | typeof InvalidHttpUrlError,
): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ErrorType("httpOnly");
  }
}

function collectMatches(url: URL, sites: Site[]): EndpointMatch[] {
  const matches: EndpointMatch[] = [];
  for (const site of sites) {
    for (const endpoint of site.endpoints) {
      if (!endpoint.enabled) continue;
      const endpointUrl = new URL(normalizeEndpoint(endpoint.prefix));
      if (endpointUrl.origin !== url.origin) continue;
      if (!pathMatches(url.pathname, endpointUrl.pathname)) continue;
      matches.push({ site, endpoint, endpointUrl });
    }
  }
  return matches;
}

function selectLongestMatch(matches: EndpointMatch[]): EndpointMatch | null {
  if (matches.length === 0) return null;
  const sorted = [...matches].sort(
    (left, right) => right.endpointUrl.pathname.length - left.endpointUrl.pathname.length,
  );
  const longestLength = sorted[0].endpointUrl.pathname.length;
  const longest = sorted.filter((match) => match.endpointUrl.pathname.length === longestLength);
  const canonicalPrefixes = new Set(longest.map((match) => normalizeEndpoint(match.endpoint.prefix)));
  const siteIds = new Set(longest.map((match) => match.site.id));
  if (canonicalPrefixes.size === 1 && siteIds.size > 1) {
    throw new AmbiguousEndpointError("ambiguousEndpoint");
  }
  return longest[0];
}

function pathMatches(pathname: string, endpointPath: string): boolean {
  return (
    endpointPath === "/" ||
    pathname === endpointPath ||
    pathname.startsWith(`${endpointPath}/`)
  );
}

function createResourceKey(
  url: URL,
  endpointUrl: URL,
  policy: QueryPolicy,
  settings: AppSettings,
): string {
  let path = url.pathname.slice(endpointUrl.pathname === "/" ? 0 : endpointUrl.pathname.length);
  if (!path) path = "/";
  if (!path.startsWith("/")) path = `/${path}`;
  if (settings.stripTrailingSlash) path = stripTrailingSlash(path);

  const query = normalizeSearchParams(url.searchParams, policy, settings.globalIgnoredQueryParams);
  return query ? `${path}?${query}` : path;
}

function normalizeUrl(url: URL, ignored: string[], shouldStripTrailingSlash: boolean): string {
  const normalized = new URL(url.toString());
  normalized.hash = "";
  if (shouldStripTrailingSlash) normalized.pathname = stripTrailingSlash(normalized.pathname);
  normalized.search = normalizeSearchParams(
    normalized.searchParams,
    { mode: "keep-all-except-ignored", ignoredParams: [] },
    ignored,
  );
  return normalized.toString();
}

function normalizeSearchParams(
  params: URLSearchParams,
  policy: QueryPolicy,
  globalIgnored: string[],
): string {
  const entries = [...params.entries()].filter(([name]) => {
    if (policy.mode === "keep-only-identity") {
      return policy.identityParams.some((candidate) => candidate.toLowerCase() === name.toLowerCase());
    }
    return !isIgnored(name, [...globalIgnored, ...policy.ignoredParams]);
  });

  entries.sort(([leftName, leftValue], [rightName, rightValue]) => {
    if (leftName === rightName) return compareCodePoint(leftValue, rightValue);
    return compareCodePoint(leftName, rightName);
  });

  const normalized = new URLSearchParams();
  for (const [name, value] of entries) normalized.append(name, value);
  return normalized.toString();
}

function isIgnored(name: string, patterns: string[]): boolean {
  const normalizedName = name.toLowerCase();
  return patterns.some((pattern) => {
    const normalizedPattern = pattern.toLowerCase();
    return normalizedPattern.endsWith("*")
      ? normalizedName.startsWith(normalizedPattern.slice(0, -1))
      : normalizedName === normalizedPattern;
  });
}

function compareCodePoint(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function stripTrailingSlash(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}
