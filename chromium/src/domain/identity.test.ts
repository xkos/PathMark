import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Site } from "./models";
import { identifyUrl } from "./identity";

const site: Site = {
  id: "site-1",
  name: "Example Papers",
  description: "",
  endpoints: [
    {
      id: "endpoint-old",
      prefix: "https://old.example.com/docs",
      priority: 1,
      enabled: true,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    },
    {
      id: "endpoint-new",
      prefix: "https://new.example.org/archive",
      priority: 0,
      enabled: true,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    },
  ],
  queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
  createdAt: "2026-08-11T00:00:00.000Z",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

describe("identifyUrl", () => {
  it("maps old and new endpoints to the same site resource", () => {
    const oldIdentity = identifyUrl(
      "https://old.example.com/docs/paper/123?utm_source=search&lang=en",
      [site],
      DEFAULT_SETTINGS,
    );
    const newIdentity = identifyUrl(
      "https://new.example.org/archive/paper/123?lang=en",
      [site],
      DEFAULT_SETTINGS,
    );

    expect(oldIdentity.resourceKey).toBe("/paper/123?lang=en");
    expect(oldIdentity.canonicalKey).toBe(newIdentity.canonicalKey);
  });

  it("matches endpoint paths by complete path segment", () => {
    const identity = identifyUrl("https://old.example.com/docs2/paper/123", [site], DEFAULT_SETTINGS);
    expect(identity.kind).toBe("unassigned");
  });

  it("uses the longest matching endpoint path", () => {
    const nestedSite: Site = {
      ...site,
      endpoints: [
        ...site.endpoints,
        {
          ...site.endpoints[0],
          id: "endpoint-nested",
          prefix: "https://old.example.com/docs/paper",
        },
      ],
    };
    const identity = identifyUrl("https://old.example.com/docs/paper/123", [nestedSite], DEFAULT_SETTINGS);
    expect(identity.endpointId).toBe("endpoint-nested");
    expect(identity.resourceKey).toBe("/123");
  });

  it("sorts retained query keys and values deterministically", () => {
    const identity = identifyUrl(
      "https://old.example.com/docs/paper/123?b=2&a=z&a=a",
      [site],
      DEFAULT_SETTINGS,
    );
    expect(identity.resourceKey).toBe("/paper/123?a=a&a=z&b=2");
  });

  it("normalizes unassigned URLs and drops fragments and tracking parameters", () => {
    const identity = identifyUrl(
      "https://EXAMPLE.com:443/article/1/?utm_medium=x&b=2#a",
      [],
      DEFAULT_SETTINGS,
    );
    expect(identity.kind).toBe("unassigned");
    expect(identity.normalizedUrl).toBe("https://example.com/article/1?b=2");
  });
});
