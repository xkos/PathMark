import { LINK_QUERY, LINK_REFRESH, isLinkMarkingEnabled, removeUnpermittedLinkScripts, restoreLinkMarkers } from "./browser/link-marking";
import { t } from "./i18n";
import { setActionVisualStateForTab } from "./browser/action-state";
import { readingLibrary } from "./storage/library-instance";
import { REFRESH_ACTION_ICONS_MESSAGE } from "./browser/action-refresh";

const HTTP_PAGE_PATTERN = /^https?:\/\//;

chrome.runtime.onInstalled.addListener(() => {
  void refreshActiveTabs();
  void restoreLinkMarkers().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  void refreshActiveTabs();
  void restoreLinkMarkers().catch(() => undefined);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void refreshActionForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    void refreshActionForTab(tabId, changeInfo.url ?? tab.url);
  }
});

chrome.permissions.onRemoved.addListener(() => {
  void removeUnpermittedLinkScripts().then(refreshLinkMarkers);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (typeof message === "object" && message !== null && "type" in message && message.type === LINK_QUERY) {
    const urls = "urls" in message ? message.urls : null;
    if (!sender.tab || !sender.url || !Array.isArray(urls) || urls.length > 200 || !urls.every((url) => typeof url === "string" && url.length <= 8192)) {
      respond({ enabled: false, matches: [] });
      return false;
    }
    void (async () => {
      if (!await isLinkMarkingEnabled()) return { enabled: false, matches: [] };
      const matches = await readingLibrary.recognizeLinks(urls);
      return { enabled: true, matches: matches.map((match) => ({ ...match, label: `${t("saved")} · ${match.collectionName ?? t("uncategorized")}` })) };
    })().then(respond).catch(() => respond({ enabled: true, matches: [], error: true }));
    return true;
  }
  if (typeof message === "object" && message !== null && "type" in message && message.type === REFRESH_ACTION_ICONS_MESSAGE) {
    void refreshActiveTabs();
    void refreshLinkMarkers();
  }
});

async function refreshActiveTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true });
  await Promise.all(tabs.flatMap((tab) => (tab.id === undefined ? [] : [refreshActionForTab(tab.id, tab.url)])));
}

async function refreshActionForTab(tabId: number, knownUrl?: string): Promise<void> {
  try {
    const url = knownUrl ?? (await chrome.tabs.get(tabId)).url;
    const recognition = url && HTTP_PAGE_PATTERN.test(url) ? await readingLibrary.recognize(url) : null;
    const item = recognition?.item ?? null;
    const collection = item?.collectionId ? await readingLibrary.database.collections.get(item.collectionId) : undefined;
    await setActionVisualStateForTab(tabId, item, chrome.action, collection);
  } catch (error) {
    console.warn(`Could not update the saved-state icon for tab ${tabId}`, error);
  }
}

async function refreshLinkMarkers(): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id !== undefined && tab.url && HTTP_PAGE_PATTERN.test(tab.url)) {
      await chrome.tabs.sendMessage(tab.id, { type: LINK_REFRESH }).catch(() => undefined);
    }
  }));
}
