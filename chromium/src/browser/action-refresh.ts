export const REFRESH_ACTION_ICONS_MESSAGE = "refresh-action-icons";

export function requestActionIconRefresh(): void {
  try { void chrome.runtime.sendMessage({ type: REFRESH_ACTION_ICONS_MESSAGE }); } catch { /* Web preview and tests have no extension runtime. */ }
}
