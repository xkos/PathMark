import type { PageSnapshot } from "../domain/models";
import { t } from "../i18n";

export interface ActivePageSnapshot extends PageSnapshot {
  tabId: number;
}

export async function getActivePage(): Promise<ActivePageSnapshot> {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("previewUrl") ?? "https://old.example.com/docs/paper/preview?utm_source=popup";
    return { tabId: 0, title: params.get("previewTitle") ?? t("previewPageTitle"), url };
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url) throw new Error(t("cannotReadTab"));
  if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) {
    throw new Error(t("unsupportedPage"));
  }
  return {
    tabId: tab.id,
    title: tab.title?.trim() || tab.url,
    url: tab.url,
  };
}
