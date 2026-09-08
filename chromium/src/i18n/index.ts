import { localizeAppErrorTokens, type AppErrorCode } from "../domain/app-error";
import chromeLocales from "./supported-locales.json";
import * as ar from "./locales/ar";
import * as de from "./locales/de";
import * as en from "./locales/en";
import type { MessageKey } from "./locales/en";
import * as es from "./locales/es";
import * as fr from "./locales/fr";
import * as hi from "./locales/hi";
import * as id from "./locales/id";
import * as it from "./locales/it";
import * as ja from "./locales/ja";
import * as ko from "./locales/ko";
import * as nl from "./locales/nl";
import * as ptBR from "./locales/pt-BR";
import * as pl from "./locales/pl";
import * as ru from "./locales/ru";
import * as th from "./locales/th";
import * as tr from "./locales/tr";
import * as vi from "./locales/vi";
import * as zhCN from "./locales/zh-CN";
import * as zhTW from "./locales/zh-TW";

interface LocaleDefinition {
  aliases: readonly string[];
  chromeLocale: string;
  direction?: "rtl";
  messages: Record<MessageKey, string>;
  errors: Record<AppErrorCode, string>;
}

const localeDefinitions = {
  en: { aliases: ["en"], chromeLocale: chromeLocales.en, messages: en.messages, errors: en.errors },
  ar: { aliases: ["ar", "ar-sa", "ar-eg", "ar-ae"], chromeLocale: chromeLocales.ar, direction: "rtl", messages: ar.messages, errors: ar.errors },
  de: { aliases: ["de", "de-de", "de-at", "de-ch"], chromeLocale: chromeLocales.de, messages: de.messages, errors: de.errors },
  es: { aliases: ["es", "es-es", "es-419"], chromeLocale: chromeLocales.es, messages: es.messages, errors: es.errors },
  fr: { aliases: ["fr", "fr-fr", "fr-ca"], chromeLocale: chromeLocales.fr, messages: fr.messages, errors: fr.errors },
  hi: { aliases: ["hi", "hi-in"], chromeLocale: chromeLocales.hi, messages: hi.messages, errors: hi.errors },
  id: { aliases: ["id", "id-id", "in", "in-id"], chromeLocale: chromeLocales.id, messages: id.messages, errors: id.errors },
  it: { aliases: ["it", "it-it", "it-ch"], chromeLocale: chromeLocales.it, messages: it.messages, errors: it.errors },
  ja: { aliases: ["ja", "ja-jp"], chromeLocale: chromeLocales.ja, messages: ja.messages, errors: ja.errors },
  ko: { aliases: ["ko", "ko-kr"], chromeLocale: chromeLocales.ko, messages: ko.messages, errors: ko.errors },
  nl: { aliases: ["nl", "nl-nl", "nl-be"], chromeLocale: chromeLocales.nl, messages: nl.messages, errors: nl.errors },
  "pt-BR": { aliases: ["pt", "pt-br"], chromeLocale: chromeLocales["pt-BR"], messages: ptBR.messages, errors: ptBR.errors },
  pl: { aliases: ["pl", "pl-pl"], chromeLocale: chromeLocales.pl, messages: pl.messages, errors: pl.errors },
  ru: { aliases: ["ru", "ru-ru"], chromeLocale: chromeLocales.ru, messages: ru.messages, errors: ru.errors },
  th: { aliases: ["th", "th-th"], chromeLocale: chromeLocales.th, messages: th.messages, errors: th.errors },
  tr: { aliases: ["tr", "tr-tr"], chromeLocale: chromeLocales.tr, messages: tr.messages, errors: tr.errors },
  vi: { aliases: ["vi", "vi-vn"], chromeLocale: chromeLocales.vi, messages: vi.messages, errors: vi.errors },
  "zh-CN": { aliases: ["zh", "zh-cn", "zh-hans", "zh-sg"], chromeLocale: chromeLocales["zh-CN"], messages: zhCN.messages, errors: zhCN.errors },
  "zh-TW": { aliases: ["zh-tw", "zh-hant", "zh-hk", "zh-mo"], chromeLocale: chromeLocales["zh-TW"], messages: zhTW.messages, errors: zhTW.errors },
} satisfies Record<string, LocaleDefinition>;

export type AppLocale = keyof typeof localeDefinitions;

export const DEFAULT_LOCALE: AppLocale = "en";
export const SUPPORTED_LOCALES = Object.freeze(Object.keys(localeDefinitions) as AppLocale[]);
export const CHROME_LOCALE_BY_APP_LOCALE = Object.freeze(chromeLocales) as Readonly<Record<AppLocale, string>>;
export const LOCALE_DIRECTION = Object.freeze(Object.fromEntries(
  SUPPORTED_LOCALES.map((locale) => [locale, "direction" in localeDefinitions[locale] ? "rtl" : "ltr"]),
)) as Readonly<Record<AppLocale, "ltr" | "rtl">>;

const localeAliases = Object.fromEntries(
  SUPPORTED_LOCALES.flatMap((locale) => localeDefinitions[locale].aliases.map((alias) => [alias, locale])),
) as Record<string, AppLocale>;

let localeOverride: AppLocale | null = null;

export function resolveLocale(locale: string | null | undefined): AppLocale {
  if (!locale) return DEFAULT_LOCALE;
  const normalized = locale.trim().replaceAll("_", "-").toLowerCase();
  const exact = SUPPORTED_LOCALES.find((candidate) => candidate.toLowerCase() === normalized);
  if (exact) return exact;
  if (localeAliases[normalized]) return localeAliases[normalized];
  const alias = Object.entries(localeAliases)
    .sort(([left], [right]) => right.length - left.length)
    .find(([prefix]) => normalized.startsWith(`${prefix}-`));
  if (alias) return alias[1];
  return DEFAULT_LOCALE;
}

export function getLocale(): AppLocale {
  if (localeOverride) return localeOverride;
  try { return resolveLocale(globalThis.localStorage?.getItem("pathmark.language")); }
  catch { return DEFAULT_LOCALE; }
}

export function saveLocale(locale: AppLocale): void {
  localStorage.setItem("pathmark.language", locale);
  window.dispatchEvent(new Event("pathmark-language-change"));
}

export function subscribeLocale(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === "pathmark.language" || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("pathmark-language-change", listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pathmark-language-change", listener);
  };
}

export const LOCALE_NAMES: Record<AppLocale, string> = {
  en: "English", "zh-CN": "简体中文", "zh-TW": "繁體中文", ja: "日本語", ko: "한국어",
  ar: "العربية", de: "Deutsch", es: "Español", fr: "Français", hi: "हिन्दी", id: "Bahasa Indonesia",
  it: "Italiano", nl: "Nederlands", "pt-BR": "Português (Brasil)", pl: "Polski", ru: "Русский",
  th: "ไทย", tr: "Türkçe", vi: "Tiếng Việt",
};

export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  const template = localeDefinitions[getLocale()].messages[key];
  return formatTemplate(template, values);
}

export function initializeDocument(title: MessageKey): void {
  if (typeof document === "undefined") return;
  const locale = getLocale();
  document.documentElement.lang = locale;
  document.documentElement.dir = LOCALE_DIRECTION[locale];
  document.title = t(title);
}

export function localizeError(error: unknown): string {
  const source = error instanceof Error ? error.message : String(error);
  const locale = getLocale();
  const localizedTokens = localizeAppErrorTokens(
    source,
    (code, values) => formatTemplate(localeDefinitions[locale].errors[code], values),
  );
  return localizedTokens;
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}

export function setLocaleForTesting(locale: AppLocale | null): void {
  localeOverride = locale;
}
