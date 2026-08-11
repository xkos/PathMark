import { describe, expect, it } from "vitest";
import { prepareSite, SiteConfigurationError } from "./site-management";

const now = "2026-08-11T10:00:00.000Z";

describe("prepareSite", () => {
  it("normalizes endpoints and derives stable priorities from their order", () => {
    let id = 0;
    const site = prepareSite(
      {
        name: "  Example Papers  ",
        description: "  论文站点  ",
        endpoints: [
          { prefix: "HTTPS://OLD.EXAMPLE.COM:443/docs/", enabled: true },
          { prefix: "https://new.example.org/archive", enabled: false },
        ],
        queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: ["ref", "REF", ""] },
      },
      { existingSites: [], now, createId: () => `id-${++id}` },
    );

    expect(site.name).toBe("Example Papers");
    expect(site.endpoints.map(({ prefix, priority }) => ({ prefix, priority }))).toEqual([
      { prefix: "https://old.example.com/docs", priority: 0 },
      { prefix: "https://new.example.org/archive", priority: 1 },
    ]);
    expect(site.queryPolicy).toEqual({ mode: "keep-all-except-ignored", ignoredParams: ["ref"] });
  });

  it("rejects an endpoint already owned by another site", () => {
    expect(() =>
      prepareSite(
        {
          name: "Duplicate",
          description: "",
          endpoints: [{ prefix: "https://example.com/docs/", enabled: true }],
          queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
        },
        {
          existingSites: [
            {
              id: "site-existing",
              name: "Existing",
              description: "",
              endpoints: [
                {
                  id: "endpoint-existing",
                  prefix: "https://example.com/docs",
                  priority: 0,
                  enabled: true,
                  createdAt: now,
                  updatedAt: now,
                },
              ],
              queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
              createdAt: now,
              updatedAt: now,
            },
          ],
          now,
          createId: () => "new-id",
        },
      ),
    ).toThrow(SiteConfigurationError);
  });
});
