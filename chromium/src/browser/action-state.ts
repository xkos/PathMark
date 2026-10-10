import type { Collection, Item } from "../domain/models";
import { collectionColor } from "../domain/collection-color";
import { t } from "../i18n";

export type ActionVisualState = "unrecorded" | "saved";
type StatusItem = Pick<Item, "readingState" | "isArchived">;
export interface ActionStateAdapter {
  setIcon: typeof chrome.action.setIcon;
  setTitle: typeof chrome.action.setTitle;
}
export function resolveActionVisualState(item: StatusItem | null): ActionVisualState {
  return item ? "saved" : "unrecorded";
}
export function getActionTitle(state: ActionVisualState, collection?: Pick<Collection, "name">): string {
  return state === "unrecorded" ? t("actionUnrecorded") : `${t("appName")}: ${t("saved")} · ${collection?.name ?? t("uncategorized")}`;
}

/** A solid bookmark with a notched foot and contrasting lines, legible at toolbar sizes. */
export function createCollectionIcon(color: string, size: 16 | 32): ImageData {
  const normalized = collectionColor(color);
  const rgb = [1, 3, 5].map((offset) => parseInt(normalized.slice(offset, offset + 2), 16));
  const ink = rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 > 160 ? 32 : 255;
  const image = new ImageData(size, size);
  const scale = size / 16;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / scale, v = (y + .5) / scale;
    if (u < 3 || u >= 13 || v < 1 || v >= 15 || (v > 11 && Math.abs(u - 8) < v - 11)) continue;
    const line = u >= 5 && u < 11 && ((v >= 4 && v < 5) || (v >= 7 && v < 8));
    image.data.set([...(line ? [ink, ink, ink] : rgb), 255], (y * size + x) * 4);
  }
  return image;
}
export async function setActionVisualStateForTab(tabId: number, item: StatusItem | null, action: ActionStateAdapter = chrome.action, collection?: Pick<Collection, "color" | "name">): Promise<ActionVisualState> {
  const state = resolveActionVisualState(item);
  if (item) {
    const color = collectionColor(collection?.color);
    await action.setIcon({ tabId, imageData: { 16: createCollectionIcon(color, 16), 32: createCollectionIcon(color, 32) } });
  } else {
    await action.setIcon({ tabId, path: { 16: "/icons/action/unrecorded-16.png", 32: "/icons/action/unrecorded-32.png" } });
  }
  await action.setTitle({ tabId, title: getActionTitle(state, collection) });
  return state;
}
