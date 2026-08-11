import type { Item, ReadingState } from "./models";

export function transitionReadingState(
  item: Item,
  nextState: ReadingState,
  now: string,
): Item {
  if (item.readingState === nextState) return item;

  if (nextState === "read") {
    return {
      ...item,
      readingState: "read",
      firstReadAt: item.firstReadAt ?? now,
      readAt: now,
      updatedAt: now,
    };
  }

  return {
    ...item,
    readingState: nextState,
    readAt: null,
    updatedAt: now,
  };
}
