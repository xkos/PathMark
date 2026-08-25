import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(webRoot, "locales.json"), "utf8"));
const complete = manifest.locales.filter(({ status }) => status === "complete");
const codes = manifest.locales.map(({ code }) => code);
const completeCodes = complete.map(({ code }) => code);
const origin = "https://pathmark.elenchlab.app";

if (new Set(codes).size !== codes.length) throw new Error("web/locales.json contains duplicate locale codes");
if (!completeCodes.includes(manifest.defaultLocale)) throw new Error("The default locale must be complete");
if (process.argv.includes("--require-all") && complete.length !== manifest.locales.length) {
  const pending = manifest.locales.filter(({ status }) => status !== "complete").map(({ code }) => code);
  throw new Error(`Locales still pending: ${pending.join(", ")}`);
}

const extensionLocales = Object.keys(JSON.parse(await readFile(resolve(webRoot, "../chromium/src/i18n/supported-locales.json"), "utf8"))).sort();
if (JSON.stringify(extensionLocales) !== JSON.stringify([...completeCodes].sort())) {
  throw new Error(`Completed web locales and extension locales differ: web=${completeCodes.join(",")} extension=${extensionLocales.join(",")}`);
}

for (const { code, direction, utm } of complete) {
  for (const suffix of ["", "privacy/"]) {
    const path = resolve(webRoot, code, suffix, "index.html");
    if (!existsSync(path)) throw new Error(`Missing ${code}/${suffix}index.html`);
    const html = await readFile(path, "utf8");
    const expectedHtml = `<html lang="${code}"${direction === "rtl" ? ' dir="rtl"' : ""}>`;
    if (!html.includes(expectedHtml)) throw new Error(`${code}/${suffix} has incorrect html language or direction`);
    const canonical = `<link rel="canonical" href="${origin}/${code}/${suffix}">`;
    if (html.split(canonical).length !== 2) throw new Error(`${code}/${suffix} must contain exactly one canonical URL`);
    for (const alternate of [...completeCodes, "x-default"]) {
      const target = alternate === "x-default" ? manifest.defaultLocale : alternate;
      const tag = `<link rel="alternate" hreflang="${alternate}" href="${origin}/${target}/${suffix}">`;
      if (html.split(tag).length !== 2) throw new Error(`${code}/${suffix} must contain exactly one ${alternate} alternate`);
    }
    if (!html.includes('/assets/locales.generated.js') || !html.includes("data-locale-picker")) {
      throw new Error(`${code}/${suffix} is missing the shared locale picker`);
    }
    if (!suffix) {
      for (const placement of ["nav", "hero", "cta"]) {
        const token = `utm_campaign=chrome_store_install_${utm}&amp;utm_content=${placement}_${utm}`;
        if (!html.includes(token)) throw new Error(`${code} is missing ${placement} store attribution`);
      }
    }
  }
}

const sitemap = await readFile(resolve(webRoot, "sitemap.xml"), "utf8");
for (const { code } of complete) {
  for (const suffix of ["", "privacy/"]) {
    const url = `${origin}/${code}/${suffix}`;
    if (!sitemap.includes(`<loc>${url}</loc>`)) throw new Error(`Sitemap is missing ${url}`);
  }
}
const locCount = (sitemap.match(/<loc>/g) || []).length;
if (locCount !== complete.length * 2) throw new Error(`Sitemap contains ${locCount} URLs; expected ${complete.length * 2}`);

console.log(`Verified ${complete.length} locales across extension, web, hreflang, sitemap, picker, and store attribution`);
