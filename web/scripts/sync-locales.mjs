import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(await readFile(resolve(webRoot, "locales.json"), "utf8"));
const locales = manifest.locales.filter(({ status }) => status === "complete");
const origin = "https://pathmark.elenchlab.app";

for (const { code } of locales) {
  for (const suffix of ["index.html", "privacy/index.html"]) {
    const page = resolve(webRoot, code, suffix);
    if (!existsSync(page)) throw new Error(`Missing completed locale page: ${code}/${suffix}`);
  }
}

const clientCatalog = `window.PATHMARK_LOCALES = ${JSON.stringify({ defaultLocale: manifest.defaultLocale, locales }, null, 2)};\n`;
await writeFile(resolve(webRoot, "assets/locales.generated.js"), clientCatalog, "utf8");

const alternateBlock = (suffix) => [
  "    <!-- locale-alternates:start -->",
  ...locales.map(({ code }) => `    <link rel="alternate" hreflang="${code}" href="${origin}/${code}/${suffix}">`),
  `    <link rel="alternate" hreflang="x-default" href="${origin}/${manifest.defaultLocale}/${suffix}">`,
  "    <!-- locale-alternates:end -->",
].join("\n");

for (const { code, direction, utm } of locales) {
  for (const suffix of ["", "privacy/"]) {
    const pagePath = resolve(webRoot, code, suffix, "index.html");
    let html = await readFile(pagePath, "utf8");
    const expectedHtml = `<html lang="${code}"${direction === "rtl" ? ' dir="rtl"' : ""}>`;
    if (!html.includes(expectedHtml)) throw new Error(`${code}/${suffix} must use ${expectedHtml}`);
    const block = alternateBlock(suffix);
    const existing = /    <!-- locale-alternates:start -->[\s\S]*?    <!-- locale-alternates:end -->/;
    if (existing.test(html)) {
      html = html.replace(existing, block);
    } else {
      html = html.replace(/^    <link rel="alternate"[^\n]*\n/gm, "");
      const canonical = `    <link rel="canonical" href="${origin}/${code}/${suffix}">`;
      if (!html.includes(canonical)) throw new Error(`Missing canonical URL in ${code}/${suffix}`);
      html = html.replace(canonical, `${canonical}\n${block}`);
    }
    if (!suffix) {
      for (const placement of ["nav", "hero", "cta"]) {
        const token = `utm_campaign=chrome_store_install_${utm}&amp;utm_content=${placement}_${utm}`;
        if (!html.includes(token)) throw new Error(`${code} home is missing ${placement} store attribution: ${token}`);
      }
    }
    await writeFile(pagePath, html, "utf8");
  }
}

const alternates = (suffix) => [
  ...locales.map(({ code }) => `    <xhtml:link rel="alternate" hreflang="${code}" href="${origin}/${code}/${suffix}" />`),
  `    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}/${manifest.defaultLocale}/${suffix}" />`,
].join("\n");
const sitemapUrls = ["", "privacy/"].flatMap((suffix) => locales.map(({ code }) => [
  "  <url>",
  `    <loc>${origin}/${code}/${suffix}</loc>`,
  alternates(suffix),
  "  </url>",
].join("\n")));
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...sitemapUrls,
  "</urlset>",
  "",
].join("\n");
await writeFile(resolve(webRoot, "sitemap.xml"), sitemap, "utf8");

console.log(`Synchronized ${locales.length} completed locales (${locales.length * 2} pages)`);
