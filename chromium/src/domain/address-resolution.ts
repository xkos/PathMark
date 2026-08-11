import { normalizeEndpoint } from "./identity";
import type { Endpoint, Site } from "./models";

export function resolveResourceUrl(site: Site, resourceKey: string): string | null {
  const endpoint = [...site.endpoints]
    .filter((candidate) => candidate.enabled)
    .sort((left, right) => left.priority - right.priority)[0];
  return endpoint ? resolveResourceUrlWithEndpoint(endpoint, resourceKey) : null;
}

export function resolveResourceUrlWithEndpoint(endpoint: Endpoint, resourceKey: string): string {

  const base = new URL(normalizeEndpoint(endpoint.prefix));
  const queryStart = resourceKey.indexOf("?");
  const resourcePath = queryStart === -1 ? resourceKey : resourceKey.slice(0, queryStart);
  const resourceQuery = queryStart === -1 ? "" : resourceKey.slice(queryStart + 1);
  const endpointPath = base.pathname === "/" ? "" : base.pathname.replace(/\/$/, "");
  const relativePath = resourcePath === "/" ? "" : resourcePath;

  base.pathname = `${endpointPath}${relativePath}` || "/";
  base.search = resourceQuery;
  base.hash = "";
  return base.toString();
}
