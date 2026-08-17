import {
  parseBrowserBookmarkTree,
  type BookmarkImportSnapshot,
  type BrowserBookmarkTreeNode,
} from "../domain/bookmark-import";

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
    throw new Error("当前环境不支持浏览器收藏夹读取接口");
  }
  return {
    requestReadPermission: () => chrome.permissions.request({ permissions: ["bookmarks"] }),
    getTree: () => {
      if (!chrome.bookmarks) throw new Error("浏览器未提供收藏夹读取接口");
      return chrome.bookmarks.getTree();
    },
  };
}
