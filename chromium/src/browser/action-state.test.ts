import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { getActionTitle, resolveActionVisualState, setActionVisualStateForTab } from "./action-state";
import { setLocaleForTesting } from "../i18n";

describe("resolveActionVisualState", () => {
  beforeEach(() => setLocaleForTesting("zh-CN"));
  afterEach(() => setLocaleForTesting(null));
  it("uses gray unrecorded state when the page has no item", () => {
    expect(resolveActionVisualState(null)).toBe("unrecorded");
  });

  it("treats unread and reading items as todo", () => {
    expect(resolveActionVisualState({ readingState: "unread", isArchived: false })).toBe("todo");
    expect(resolveActionVisualState({ readingState: "reading", isArchived: false })).toBe("todo");
  });

  it("uses read state for a non-archived read item", () => {
    expect(resolveActionVisualState({ readingState: "read", isArchived: false })).toBe("read");
  });

  it("gives archive state precedence over reading state", () => {
    expect(resolveActionVisualState({ readingState: "read", isArchived: true })).toBe("archived");
    expect(getActionTitle("archived")).toContain("已归档");
  });

  it("sets the amber icon and todo title for an unread Edge tab", async () => {
    const setIcon = vi.fn(async () => undefined);
    const setTitle = vi.fn(async () => undefined);

    const state = await setActionVisualStateForTab(
      42,
      { readingState: "unread", isArchived: false },
      { setIcon, setTitle },
    );

    expect(state).toBe("todo");
    expect(setIcon).toHaveBeenCalledWith({
      tabId: 42,
      path: {
        16: "/icons/action/todo-16.png",
        32: "/icons/action/todo-32.png",
      },
    });
    expect(setTitle).toHaveBeenCalledWith({ tabId: 42, title: "本地阅读收藏：当前页面待读" });
  });

  it("localizes action titles for an English browser", () => {
    setLocaleForTesting("en");
    expect(getActionTitle("archived")).toBe("Local Reading Library: current page is archived");
  });
});
