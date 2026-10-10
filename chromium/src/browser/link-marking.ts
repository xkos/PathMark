export const LINK_QUERY = "pathmark-link-query";
export const LINK_REFRESH = "pathmark-link-refresh";
export const LINK_STOP = "pathmark-link-stop";
export const LINK_SCRIPT = "assets/link-markers.js";
export const LINK_ORIGINS = ["https://*/*", "http://*/*"];
export const LINK_SCRIPT_ID = "pathmark-links-global";
const PREFIX = "pathmark-links-";

const PREFERENCE = "pathmark.linkMarkingEnabled";

async function wantsLinkMarking(): Promise<boolean> {
  const stored = await chrome.storage.local.get(PREFERENCE);
  if (typeof stored[PREFERENCE] === "boolean") return stored[PREFERENCE];
  // Preserve an existing opt-in from builds that used registration as preference.
  const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [LINK_SCRIPT_ID] });
  if (!scripts.length) return false;
  await chrome.storage.local.set({ [PREFERENCE]: true });
  return true;
}
export async function isLinkMarkingEnabled(): Promise<boolean> {
  return await wantsLinkMarking() && await chrome.permissions.contains({ origins: LINK_ORIGINS });
}
async function ensureRegistered(): Promise<void> {
  if ((await chrome.scripting.getRegisteredContentScripts({ ids: [LINK_SCRIPT_ID] })).length) return;
  try {
    await chrome.scripting.registerContentScripts([{ id: LINK_SCRIPT_ID, matches: LINK_ORIGINS, js: [LINK_SCRIPT], runAt: "document_idle", persistAcrossSessions: true }]);
  } catch (error) {
    // Startup recovery and a settings click can register concurrently.
    if (!(await chrome.scripting.getRegisteredContentScripts({ ids: [LINK_SCRIPT_ID] })).length) throw error;
  }
}
export async function enableLinkMarking(): Promise<boolean> {
  // Keep the permission request in the settings checkbox's user gesture.
  const granted = await chrome.permissions.request({ origins: LINK_ORIGINS });
  if (!granted) return false;
  await ensureRegistered();
  await chrome.storage.local.set({ [PREFERENCE]: true });
  // The setting is committed. Slow/loading tabs must not hold the checkbox open.
  void injectOpenTabs().catch(() => undefined);
  return true;
}
export async function restoreLinkMarkers(): Promise<void> {
  await removeUnpermittedLinkScripts();
  if (await isLinkMarkingEnabled()) {
    await ensureRegistered();
    await injectOpenTabs();
  }
}
async function injectOpenTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: LINK_ORIGINS });
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined) return;
    // Browser-protected pages and tabs closed during injection must not block other tabs.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [LINK_SCRIPT] }).catch(() => undefined);
  }));
}
export async function stopLinkMarkers(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: LINK_ORIGINS });
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id !== undefined) await chrome.tabs.sendMessage(tab.id, { type: LINK_STOP }).catch(() => undefined);
  }));
}
export async function disableLinkMarking(): Promise<void> {
  await chrome.storage.local.set({ [PREFERENCE]: false });
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  const ids = scripts.filter((script) => script.id.startsWith(PREFIX)).map((script) => script.id);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  await stopLinkMarkers();
  await chrome.permissions.remove({ origins: LINK_ORIGINS });
}
export async function removeUnpermittedLinkScripts(): Promise<void> {
  const scripts = await chrome.scripting.getRegisteredContentScripts();
  // Discard old per-site opt-ins. A global permission must be explicitly enabled in settings.
  const ids: string[] = [];
  for (const script of scripts) {
    if (script.id.startsWith(PREFIX) && (script.id !== LINK_SCRIPT_ID || !await chrome.permissions.contains({ origins: LINK_ORIGINS }))) ids.push(script.id);
  }
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  if (!await isLinkMarkingEnabled()) await stopLinkMarkers();
}
