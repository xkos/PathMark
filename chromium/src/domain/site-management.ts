import { normalizeEndpoint } from "./identity";
import type { Endpoint, QueryPolicy, Site, UUID } from "./models";

export interface EndpointDraft {
  id?: UUID;
  prefix: string;
  enabled: boolean;
}

export interface SiteDraft {
  id?: UUID;
  name: string;
  description: string;
  endpoints: EndpointDraft[];
  queryPolicy: QueryPolicy;
}

export interface PrepareSiteOptions {
  existingSites: Site[];
  now: string;
  createId: () => UUID;
}

export class SiteConfigurationError extends Error {}

export function prepareSite(draft: SiteDraft, options: PrepareSiteOptions): Site {
  const name = draft.name.trim();
  if (!name) throw new SiteConfigurationError("站点名称不能为空");

  const current = draft.id ? options.existingSites.find((site) => site.id === draft.id) : undefined;
  const endpointPrefixes = new Set<string>();
  const endpoints: Endpoint[] = draft.endpoints.map((endpoint, priority) => {
    const normalizedPrefix = normalizeEndpoint(endpoint.prefix.trim());
    if (endpointPrefixes.has(normalizedPrefix)) {
      throw new SiteConfigurationError(`同一站点内不能重复配置 Endpoint：${normalizedPrefix}`);
    }
    endpointPrefixes.add(normalizedPrefix);
    const previous = current?.endpoints.find((candidate) => candidate.id === endpoint.id);
    return {
      id: endpoint.id ?? options.createId(),
      prefix: normalizedPrefix,
      priority,
      enabled: endpoint.enabled,
      createdAt: previous?.createdAt ?? options.now,
      updatedAt: options.now,
    };
  });

  for (const site of options.existingSites) {
    if (site.id === draft.id) continue;
    for (const endpoint of site.endpoints) {
      const normalizedPrefix = normalizeEndpoint(endpoint.prefix);
      if (endpointPrefixes.has(normalizedPrefix)) {
        throw new SiteConfigurationError(`Endpoint 已属于站点“${site.name}”：${normalizedPrefix}`);
      }
    }
  }

  return {
    id: draft.id ?? options.createId(),
    name,
    description: draft.description.trim(),
    endpoints,
    queryPolicy: normalizeQueryPolicy(draft.queryPolicy),
    createdAt: current?.createdAt ?? options.now,
    updatedAt: options.now,
  };
}

export function siteToDraft(site: Site): SiteDraft {
  return {
    id: site.id,
    name: site.name,
    description: site.description,
    endpoints: [...site.endpoints]
      .sort((left, right) => left.priority - right.priority)
      .map(({ id, prefix, enabled }) => ({ id, prefix, enabled })),
    queryPolicy:
      site.queryPolicy.mode === "keep-only-identity"
        ? { mode: "keep-only-identity", identityParams: [...site.queryPolicy.identityParams] }
        : { mode: "keep-all-except-ignored", ignoredParams: [...site.queryPolicy.ignoredParams] },
  };
}

function normalizeQueryPolicy(policy: QueryPolicy): QueryPolicy {
  if (policy.mode === "keep-only-identity") {
    return { mode: policy.mode, identityParams: normalizeParameterNames(policy.identityParams) };
  }
  return { mode: policy.mode, ignoredParams: normalizeParameterNames(policy.ignoredParams) };
}

function normalizeParameterNames(names: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    normalized.push(name);
  }
  return normalized;
}
