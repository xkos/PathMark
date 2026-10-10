import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCollectionIcon, getActionTitle, resolveActionVisualState, setActionVisualStateForTab } from "./action-state";
import { setLocaleForTesting } from "../i18n";

describe("collection action icons", () => {
  beforeEach(() => {
    setLocaleForTesting("zh-CN");
    vi.stubGlobal("ImageData", class {
      data: Uint8ClampedArray;
      constructor(public width: number, public height: number) { this.data = new Uint8ClampedArray(width * height * 4); }
    });
  });
  afterEach(() => { setLocaleForTesting(null); vi.unstubAllGlobals(); });
  it("uses saved state independently of reading and archive status", () => {
    expect(resolveActionVisualState(null)).toBe("unrecorded");
    for (const readingState of ["unread", "reading", "read"] as const) {
      expect(resolveActionVisualState({readingState, isArchived: true})).toBe("saved");
    }
  });
  it("draws the chosen color at both toolbar sizes with transparent margins", () => {
    for (const size of [16, 32] as const) {
      const icon = createCollectionIcon("#dc2626", size);
      expect(Array.from(icon.data.slice(0,4))).toEqual([0,0,0,0]);
      const index = (2 * (size/16) * size + 4 * (size/16)) * 4;
      expect(Array.from(icon.data.slice(index,index+4))).toEqual([220,38,38,255]);
    }
  });
  it("applies the category color and name, then resets an unrecorded tab", async () => {
    const action = {setIcon: vi.fn(async (_details: chrome.action.TabIconDetails) => undefined), setTitle: vi.fn(async (_details: chrome.action.TitleDetails) => undefined)};
    await setActionVisualStateForTab(42,{readingState:"unread",isArchived:false},action,{name:"已失效",color:"#dc2626"});
    expect(action.setIcon.mock.calls[0][0]).toHaveProperty("imageData");
    expect(action.setTitle).toHaveBeenLastCalledWith({tabId:42,title:expect.stringContaining("已失效")});
    await setActionVisualStateForTab(42,null,action);
    expect(action.setIcon).toHaveBeenLastCalledWith({tabId:42,path:{16:"/icons/action/unrecorded-16.png",32:"/icons/action/unrecorded-32.png"}});
  });
  it("falls back to blue for old collections and names uncategorized pages", () => {
    expect(createCollectionIcon("invalid",16).data).toEqual(createCollectionIcon("#2563eb",16).data);
    expect(getActionTitle("saved")).toContain("未分类");
  });
});
