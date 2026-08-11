import { describe, expect, it, vi } from "vitest";
import type { Item } from "../domain/models";
import type { PageRecognition } from "../storage/reading-library";
import { loadPopupPage } from "./load-page";

describe("loadPopupPage", () => {
  it("applies the recognized unread item directly to the active Edge tab action", async () => {
    const item = { readingState: "unread", isArchived: false } as Item;
    const recognition = { item, identity: {} } as PageRecognition;
    const setActionStateForTab = vi.fn(async () => undefined);

    await loadPopupPage({
      getActivePage: async () => ({ tabId: 42, title: "百度一下", url: "https://www.baidu.com/" }),
      recognize: async () => recognition,
      setActionStateForTab,
    });

    expect(setActionStateForTab).toHaveBeenCalledWith(42, item);
  });
});
