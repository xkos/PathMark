import {
  parseBrowserBookmarkTree,
  type BookmarkImportSnapshot,
  type BrowserBookmarkTreeNode,
} from "../domain/bookmark-import";
import { AppError } from "../domain/app-error";

export interface BrowserBookmarksGateway {
  requestReadPermission: () => Promise<boolean>;
  getTree: () => Promise<BrowserBookmarkTreeNode[]>;
}

export type BrowserBookmarkAccessResult =
  | { status: "denied" }
  | { status: "granted"; snapshot: BookmarkImportSnapshot };

export async function requestBrowserBookmarkSnapshot(
  gateway: BrowserBookmarksGateway = createChromeBookmarksGateway(),
): Promise<BrowserBookmarkAccessResult> {
  const granted = await gateway.requestReadPermission();
  if (!granted) return { status: "denied" };
  return { status: "granted", snapshot: parseBrowserBookmarkTree(await gateway.getTree()) };
}

function createChromeBookmarksGateway(): BrowserBookmarksGateway {
  if (typeof chrome === "undefined" || !chrome.permissions) {
    throw new AppError("bookmarkAccessUnsupported");
  }
  return {
    requestReadPermission: () => chrome.permissions.request({ permissions: ["bookmarks"] }),
    getTree: () => {
      if (!chrome.bookmarks) throw new AppError("bookmarkApiUnavailable");
      return chrome.bookmarks.getTree();
    },
  };
}
