import { describe, expect, it } from "vitest";
import { ensureEndpointInDraft, getDefaultSiteSelection, suggestSiteFromUrl } from "./site-selection";

describe("popup site selection", () => {
  it("defaults to the automatically matched site", () => {
    expect(getDefaultSiteSelection("site-matched")).toBe("site-matched");
    expect(getDefaultSiteSelection(null)).toBe("auto");
  });

  it("suggests a site name and origin endpoint from the current domain", () => {
    expect(suggestSiteFromUrl("https://www.example.com/papers/1?q=x")).toEqual({
      name: "example.com",
      endpointPrefix: "https://www.example.com",
    });
  });

  it("adds a missing endpoint to an existing site", () => {
    const result = ensureEndpointInDraft({
      id: "site-1", name: "Example", description: "", endpoints: [],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
    }, "https://mirror.example.com/");
    expect(result.endpoints).toEqual([{ prefix: "https://mirror.example.com/", enabled: true }]);
  });

  it("re-enables an existing normalized endpoint instead of duplicating it", () => {
    const result = ensureEndpointInDraft({
      id: "site-1", name: "Example", description: "",
      endpoints: [{ id: "endpoint-1", prefix: "https://example.com/docs/", enabled: false }],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
    }, "https://example.com/docs");
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0]).toEqual(expect.objectContaining({ id: "endpoint-1", enabled: true }));
  });
});
