import { describe, expect, it } from "vitest";
import type { Site } from "./models";
import { resolveResourceUrl } from "./address-resolution";

const now = "2026-08-11T10:00:00.000Z";

describe("resolveResourceUrl", () => {
  it("uses the highest-priority enabled endpoint", () => {
    const site: Site = {
      id: "site-1",
      name: "Example",
      description: "",
      endpoints: [
        { id: "disabled", prefix: "https://disabled.example/docs", priority: 0, enabled: false, createdAt: now, updatedAt: now },
        { id: "preferred", prefix: "https://new.example/archive", priority: 1, enabled: true, createdAt: now, updatedAt: now },
        { id: "fallback", prefix: "https://old.example/docs", priority: 2, enabled: true, createdAt: now, updatedAt: now },
      ],
      queryPolicy: { mode: "keep-all-except-ignored", ignoredParams: [] },
      createdAt: now,
      updatedAt: now,
    };

    expect(resolveResourceUrl(site, "/paper/123?lang=zh")).toBe("https://new.example/archive/paper/123?lang=zh");
  });
});
