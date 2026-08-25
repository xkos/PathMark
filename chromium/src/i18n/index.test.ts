import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../domain/app-error";
import { CHROME_LOCALE_BY_APP_LOCALE, DEFAULT_LOCALE, initializeDocument, LOCALE_DIRECTION, localizeError, resolveLocale, setLocaleForTesting, SUPPORTED_LOCALES, t } from ".";
import { errors as englishErrors, messages as englishMessages } from "./locales/en";

const localeModules = import.meta.glob<{ messages: Record<string, string>; errors: Record<string, string> }>("./locales/*.ts", { eager: true });
const placeholders = (value: string) => [...value.matchAll(/\{[A-Za-z][A-Za-z0-9]*\}/g)].map(([token]) => token).sort();

describe("i18n", () => {
  afterEach(() => setLocaleForTesting(null));

  it("renders Chinese placeholders", () => {
    setLocaleForTesting("zh-CN");
    expect(t("selectedCount", { count: 3 })).toBe("已选择 3 条");
  });

  it("renders English messages", () => {
    setLocaleForTesting("en");
    expect(t("selectedCount", { count: 3 })).toBe("3 selected");
  });

  it("resolves aliases and falls back to English for unsupported locales", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(SUPPORTED_LOCALES).toEqual(["en", "ar", "de", "es", "fr", "hi", "id", "it", "ja", "ko", "nl", "pt-BR", "pl", "ru", "th", "tr", "vi", "zh-CN", "zh-TW"]);
    expect(resolveLocale("ar-EG")).toBe("ar");
    expect(resolveLocale("de-CH")).toBe("de");
    expect(resolveLocale("es-MX")).toBe("es");
    expect(resolveLocale("fr-CA")).toBe("fr");
    expect(resolveLocale("hi-IN")).toBe("hi");
    expect(resolveLocale("id-ID")).toBe("id");
    expect(resolveLocale("it-CH")).toBe("it");
    expect(resolveLocale("ru-RU")).toBe("ru");
    expect(resolveLocale("th-TH")).toBe("th");
    expect(resolveLocale("tr-TR")).toBe("tr");
    expect(resolveLocale("vi-VN")).toBe("vi");
    expect(resolveLocale("ja-JP")).toBe("ja");
    expect(resolveLocale("ko-KR")).toBe("ko");
    expect(resolveLocale("nl-BE")).toBe("nl");
    expect(resolveLocale("pt-PT")).toBe("pt-BR");
    expect(resolveLocale("pl-PL")).toBe("pl");
    expect(resolveLocale("zh_CN")).toBe("zh-CN");
    expect(resolveLocale("zh-Hans-SG")).toBe("zh-CN");
    expect(resolveLocale("zh_TW")).toBe("zh-TW");
    expect(resolveLocale("zh-Hant-HK")).toBe("zh-TW");
    expect(resolveLocale("en-GB")).toBe("en");
    expect(resolveLocale("sv-SE")).toBe("en");
    expect(resolveLocale(null)).toBe("en");
  });

  it("renders Traditional Chinese UI and structured errors", () => {
    setLocaleForTesting("zh-TW");
    expect(t("appName")).toBe("本機閱讀收藏");
    expect(t("selectedCount", { count: 3 })).toBe("已選擇 3 條");
    expect(t("bookmarkUntitledFolder")).toBe("未命名目錄");
    expect(localizeError(new AppError("bookmarkSiteMissing"))).toBe("網站對應引用了不存在的網站");
  });

  it("maps every app locale to its Chrome manifest locale", () => {
    expect(CHROME_LOCALE_BY_APP_LOCALE).toEqual({ ar: "ar", en: "en", de: "de", es: "es", fr: "fr", hi: "hi", id: "id", it: "it", ja: "ja", ko: "ko", nl: "nl", "pt-BR": "pt_BR", pl: "pl", ru: "ru", th: "th", tr: "tr", vi: "vi", "zh-CN": "zh_CN", "zh-TW": "zh_TW" });
    expect(LOCALE_DIRECTION.ar).toBe("rtl");
    expect(LOCALE_DIRECTION.en).toBe("ltr");
  });

  it("applies and resets the document writing direction", () => {
    const previousDocument = globalThis.document;
    const fakeDocument = { documentElement: { lang: "", dir: "" }, title: "" };
    Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
    try {
      setLocaleForTesting("ar");
      initializeDocument("libraryTitle");
      expect(fakeDocument.documentElement).toEqual({ lang: "ar", dir: "rtl" });
      expect(fakeDocument.title).toBe("مكتبة القراءة المحلية");

      setLocaleForTesting("en");
      initializeDocument("libraryTitle");
      expect(fakeDocument.documentElement).toEqual({ lang: "en", dir: "ltr" });
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previousDocument });
    }
  });

  it("keeps every locale catalog complete with matching placeholders", () => {
    expect(Object.keys(localeModules).sort()).toEqual(SUPPORTED_LOCALES.map((locale) => `./locales/${locale}.ts`).sort());

    for (const [path, catalog] of Object.entries(localeModules)) {
      expect(Object.keys(catalog.messages).sort(), `${path} message keys`).toEqual(Object.keys(englishMessages).sort());
      expect(Object.keys(catalog.errors).sort(), `${path} error keys`).toEqual(Object.keys(englishErrors).sort());

      for (const [key, source] of Object.entries(englishMessages)) {
        expect(catalog.messages[key].trim(), `${path}:${key}`).not.toBe("");
        expect(placeholders(catalog.messages[key]), `${path}:${key}`).toEqual(placeholders(source));
      }
      for (const [key, source] of Object.entries(englishErrors)) {
        expect(catalog.errors[key].trim(), `${path}:${key}`).not.toBe("");
        expect(placeholders(catalog.errors[key]), `${path}:${key}`).toEqual(placeholders(source));
      }
    }
  });

  it("localizes structured domain errors without depending on source-language text", () => {
    const error = new AppError("endpointOwnedBySite", { site: "Example", endpoint: "https://example.com/docs" });

    setLocaleForTesting("en");
    expect(localizeError(error)).toBe("The endpoint already belongs to “Example”: https://example.com/docs");

    setLocaleForTesting("zh-CN");
    expect(localizeError(error)).toBe("Endpoint 已属于站点“Example”：https://example.com/docs");
  });

  it("localizes structured errors embedded in aggregate messages", () => {
    const error = new Error(`Import failed: ${new AppError("collectionMissing", { id: "research" }).message}`);

    setLocaleForTesting("en");
    expect(localizeError(error)).toBe("Import failed: The collection no longer exists");
  });

  it("leaves malformed structured error tokens intact", () => {
    setLocaleForTesting("en");
    const malformed = "[[pathmark-error:collectionMissing:%7Bbroken]]";
    expect(localizeError(new Error(malformed))).toBe(malformed);
  });
});
