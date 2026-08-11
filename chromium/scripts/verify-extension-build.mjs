import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const distPath = resolve(import.meta.dirname, "../dist");
const manifest = JSON.parse(readFileSync(resolve(distPath, "manifest.json"), "utf8"));
const background = manifest.background;

if (
  background?.service_worker !== "assets/background.js" ||
  Object.hasOwn(background, "type")
) {
  throw new Error("Background must be a classic service worker at assets/background.js");
}

const workerPath = resolve(distPath, background.service_worker);
const workerSource = readFileSync(workerPath, "utf8");

if (/^\s*(?:import|export)\b/m.test(workerSource) || /\bimport\s*\(/.test(workerSource)) {
  throw new Error("Background service worker must not import external chunks");
}

for (const relativePath of Object.values(manifest.action.default_icon)) {
  if (!existsSync(resolve(distPath, relativePath))) {
    throw new Error(`Missing action icon: ${relativePath}`);
  }
}

const actionIconDirectory = resolve(distPath, "icons/action");
for (const fileName of readdirSync(actionIconDirectory).filter((name) => name.endsWith(".png"))) {
  const png = readFileSync(resolve(actionIconDirectory, fileName));
  const bitDepth = png[24];
  if (bitDepth !== 8) {
    throw new Error(`Action icon must use 8-bit PNG channels: ${fileName} uses ${bitDepth}-bit`);
  }
}

console.log("Extension build verified: classic self-contained background service worker");
