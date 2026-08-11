import type { Item } from "../domain/models";
import { t } from "../i18n";

export type ActionVisualState = "unrecorded" | "todo" | "read" | "archived";

type StatusItem = Pick<Item, "readingState" | "isArchived">;

export interface ActionStateAdapter {
  setIcon: typeof chrome.action.setIcon;
  setTitle: typeof chrome.action.setTitle;
}

export const ACTION_ICON_PATHS: Record<ActionVisualState, Record<16 | 32, string>> = {
  unrecorded: {
    16: "/icons/action/unrecorded-16.png",
    32: "/icons/action/unrecorded-32.png",
  },
  todo: {
    16: "/icons/action/todo-16.png",
    32: "/icons/action/todo-32.png",
  },
  read: {
    16: "/icons/action/read-16.png",
    32: "/icons/action/read-32.png",
  },
  archived: {
    16: "/icons/action/archived-16.png",
    32: "/icons/action/archived-32.png",
  },
};

export function resolveActionVisualState(item: StatusItem | null): ActionVisualState {
  if (!item) return "unrecorded";
  if (item.isArchived) return "archived";
  if (item.readingState === "read") return "read";
  return "todo";
}

export function getActionTitle(state: ActionVisualState): string {
  const keys = {
    unrecorded: "actionUnrecorded",
    todo: "actionTodo",
    read: "actionRead",
    archived: "actionArchived",
  } as const;
  return t(keys[state]);
}

export async function setActionVisualStateForTab(
  tabId: number,
  item: StatusItem | null,
  action: ActionStateAdapter = chrome.action,
): Promise<ActionVisualState> {
  const state = resolveActionVisualState(item);
  try {
    await action.setIcon({ tabId, path: ACTION_ICON_PATHS[state] });
  } catch (error) {
    throw new Error(`chrome.action.setIcon failed for state=${state}: ${describeError(error)}`, { cause: error });
  }

  try {
    await action.setTitle({ tabId, title: getActionTitle(state) });
  } catch (error) {
    throw new Error(`chrome.action.setTitle failed for state=${state}: ${describeError(error)}`, { cause: error });
  }
  return state;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
