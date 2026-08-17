import { describe, expect, it, vi } from "vitest";
import { requestBrowserBookmarkSnapshot, type BrowserBookmarksGateway } from "./bookmark-access";

describe("browser bookmark access", () => {
  it("does not read the bookmark tree when optional permission is denied", async () => {
    const gateway: BrowserBookmarksGateway = {
      requestReadPermission: vi.fn().mockResolvedValue(false),
      getTree: vi.fn(),
    };

    await expect(requestBrowserBookmarkSnapshot(gateway)).resolves.toEqual({ status: "denied" });
    expect(gateway.getTree).not.toHaveBeenCalled();
  });

  it("requests permission before reading and returns the neutral snapshot", async () => {
    const calls: string[] = [];
    const gateway: BrowserBookmarksGateway = {
      requestReadPermission: vi.fn(async () => { calls.push("permission"); return true; }),
      getTree: vi.fn(async () => {
        calls.push("tree");
        return [{ id: "0", title: "", children: [{ id: "1", title: "todo", children: [
          { id: "2", title: "Example", url: "https://example.com/article" },
        ] }] }];
      }),
    };

    const result = await requestBrowserBookmarkSnapshot(gateway);
    expect(calls).toEqual(["permission", "tree"]);
    expect(result.status).toBe("granted");
    if (result.status === "granted") {
      expect(result.snapshot.candidates[0]).toEqual(expect.objectContaining({ folderPath: ["todo"] }));
    }
  });
});
