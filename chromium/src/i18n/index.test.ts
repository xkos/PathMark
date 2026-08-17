import { afterEach, describe, expect, it } from "vitest";
import { localizeError, setLocaleForTesting, t } from ".";

describe("i18n", () => {
  afterEach(() => setLocaleForTesting(null));

  it("renders Chinese placeholders", () => {
    setLocaleForTesting("zh-CN");
    expect(t("selectedCount", { count: 3 })).toBe("已选择 3 条");
  });

  it("renders English messages and domain errors", () => {
    setLocaleForTesting("en");
    expect(t("selectedCount", { count: 3 })).toBe("3 selected");
    expect(localizeError(new Error("站点名称不能为空"))).toBe("Site name is required");
    expect(localizeError(new Error("浏览器收藏夹中没有找到可导入的链接"))).toBe("No importable links were found in the browser bookmarks");
  });
});
