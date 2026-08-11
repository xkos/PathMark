import type { ActivePageSnapshot } from "../browser/active-page";
import type { Item } from "../domain/models";
import type { PageRecognition } from "../storage/reading-library";

export interface PopupPageLoadDependencies {
  getActivePage: () => Promise<ActivePageSnapshot>;
  recognize: (url: string) => Promise<PageRecognition>;
  setActionStateForTab: (tabId: number, item: Item | null) => Promise<void>;
}

export interface LoadedPopupPage {
  page: ActivePageSnapshot;
  recognition: PageRecognition;
}

export async function loadPopupPage(dependencies: PopupPageLoadDependencies): Promise<LoadedPopupPage> {
  const page = await dependencies.getActivePage();
  const recognition = await dependencies.recognize(page.url);
  await dependencies.setActionStateForTab(page.tabId, recognition.item);
  return { page, recognition };
}
