const { defaultLocale, locales } = window.PATHMARK_LOCALES;
const supported = new Set(locales.map(({ code }) => code.toLowerCase()));

function resolveLocale(language) {
  const normalized = language.toLowerCase().replaceAll("_", "-");
  if (normalized.includes("hant") || /^zh-(tw|hk|mo)\b/.test(normalized)) return "zh-TW";
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  const exact = locales.find(({ code }) => code.toLowerCase() === normalized)?.code;
  if (exact) return exact;
  const base = normalized.split("-")[0];
  return locales.find(({ code }) => code.toLowerCase() === base || code.toLowerCase().startsWith(`${base}-`))?.code;
}

const locale = (navigator.languages || [navigator.language]).map(resolveLocale).find((candidate) => candidate && supported.has(candidate.toLowerCase())) || defaultLocale;
location.replace(`/${locale}/`);
