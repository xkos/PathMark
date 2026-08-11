import { setActionVisualStateForTab } from "./browser/action-state";
import { readingLibrary } from "./storage/library-instance";
import { REFRESH_ACTION_ICONS_MESSAGE } from "./browser/action-refresh";

const HTTP_PAGE_PATTERN = /^https?:\/\//;

chrome.runtime.onInstalled.addListener(() => {
  void refreshActiveTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshActiveTabs();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void refreshActionForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    void refreshActionForTab(tabId, changeInfo.url ?? tab.url);
  }
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (typeof message === "object" && message !== null && "type" in message && message.type === REFRESH_ACTION_ICONS_MESSAGE) {
    void refreshActiveTabs();
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
    await setActionVisualStateForTab(tabId, item);
  } catch (error) {
    console.warn(`无法更新标签页 ${tabId} 的收藏状态图标`, error);
  }
}
