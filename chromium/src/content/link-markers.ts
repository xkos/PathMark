import { visibleLinkRect } from "./link-marker-rect";
// This bundle runs in the isolated extension world. The page's links remain untouched.
const QUERY = "pathmark-link-query";
const REFRESH = "pathmark-link-refresh";
const STOP = "pathmark-link-stop";
interface Match { url: string; color: string; label: string }
interface Reply { enabled: boolean; matches: Match[]; error?: boolean }
const scope = globalThis as typeof globalThis & { pathmarkLinkMarkers?: boolean };
if (!scope.pathmarkLinkMarkers) {
  scope.pathmarkLinkMarkers = true;
  start();
}
function start() {
  let stopped = false, generation = 0, processing = false, timer = 0, frame = 0;
  const links = new Set<HTMLAnchorElement>();
  const visible = new Set<HTMLAnchorElement>();
  const cache = new Map<string, Match | null>();
  const badges = new Map<HTMLAnchorElement, HTMLSpanElement>();
  let hovered: HTMLAnchorElement | null = null;
  // An extension reload invalidates the old script but can leave its DOM behind.
  document.getElementById("pathmark-link-markers")?.remove();
  const host = document.createElement("div");
  host.id = "pathmark-link-markers";
  host.style.cssText = "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;contain:strict!important;display:block!important;";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `:host{pointer-events:none} .mark{position:absolute;display:block;width:10px;height:12px;filter:drop-shadow(0 1px 1px #0005);pointer-events:none} .mark:before{content:'';display:block;position:absolute;inset:0;background:white;border-radius:2px;clip-path:polygon(0 0,100% 0,100% 100%,50% 76%,0 100%)} .mark:after{content:'';display:block;position:absolute;inset:2px;background:var(--color);clip-path:polygon(0 0,100% 0,100% 100%,50% 72%,0 100%)} .tip{position:absolute;max-width:280px;padding:5px 8px;border-radius:5px;background:#101828;color:white;font:12px/1.5 system-ui;overflow-wrap:anywhere;box-shadow:0 2px 8px #0003;pointer-events:none} .tip[hidden]{display:none}`;
  const tooltip = document.createElement("span");
  tooltip.className = "tip"; tooltip.hidden = true;
  shadow.append(style, tooltip);
  document.documentElement.append(host);

  function href(link: HTMLAnchorElement): string | null {
    try {
      const url = new URL(link.href, document.baseURI);
      const current = new URL(location.href);
      // Fragment navigation within this document is not a separate saved resource.
      if (url.href.includes("#")) {
        const target = new URL(url); target.hash = ""; current.hash = "";
        if (target.href === current.href) return null;
      }
      return /^https?:$/.test(url.protocol) && url.href.length <= 8192 ? url.href : null;
    } catch { return null; }
  }
  function schedule() { if (!stopped && !timer) timer = window.setTimeout(() => { timer = 0; void query(); }, 80); }
  async function query() {
    if (stopped || processing) return;
    const urls = [...new Set([...visible].filter((link) => link.isConnected).map(href).filter((url): url is string => Boolean(url) && !cache.has(url!)))].slice(0, 200);
    if (!urls.length) { position(); return; }
    processing = true;
    const version = generation;
    let failed = false;
    try {
      const reply = await chrome.runtime.sendMessage({ type: QUERY, urls }) as Reply;
      if (stopped) return;
      if (!reply?.enabled) { stop(); return; }
      if (version !== generation) return;
      if (reply.error) { failed = true; return; }
      if (cache.size > 5000) cache.clear();
      for (const url of urls) cache.set(url, null);
      for (const match of reply.matches) if (urls.includes(match.url)) cache.set(match.url, match);
      position();
    } catch { failed = true; }
    finally { processing = false; if (!stopped && !failed) schedule(); }
  }
  const intersection = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const link = entry.target as HTMLAnchorElement;
      if (entry.isIntersecting) visible.add(link);
      else { visible.delete(link); badges.get(link)?.remove(); badges.delete(link); }
    }
    position(); schedule();
  });
  const resize = new ResizeObserver(() => position());
  resize.observe(document.documentElement);
  function add(root: Element) {
    if (root === host || host.contains(root)) return;
    const found = root.matches("a[href]") ? [root, ...root.querySelectorAll("a[href]")] : [...root.querySelectorAll("a[href]")];
    for (const element of found) {
      if (!(element instanceof HTMLAnchorElement) || links.has(element)) continue;
      links.add(element); intersection.observe(element); resize.observe(element);
    }
  }
  add(document.documentElement);
  const mutations = new MutationObserver((records) => {
    if (stopped) return;
    if (!chrome.runtime.id) { stop(); return; }
    // SPA navigation may replace/remove nodes outside the page body as well.
    if (!host.isConnected) document.documentElement.append(host);
    let changed = false;
    for (const record of records) {
      if (record.target === host || host.contains(record.target)) continue;
      changed = true;
      if (record.type === "attributes" && record.target instanceof HTMLAnchorElement) {
        add(record.target); badges.get(record.target)?.remove(); badges.delete(record.target);
      }
      for (const node of record.addedNodes) if (node instanceof Element) add(node);
    }
    if (!changed) return;
    for (const link of links) if (!link.isConnected) {
      links.delete(link); visible.delete(link); intersection.unobserve(link); resize.unobserve(link);
      badges.get(link)?.remove(); badges.delete(link);
    }
    position(); schedule();
  });
  mutations.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["href"] });

  function position() {
    if (stopped || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      // A text and thumbnail link may occupy exactly the same card; render only one mark there.
      const occupied = new Set<string>();
      for (const link of visible) {
        const match = cache.get(href(link) ?? "");
        const rect = visibleLinkRect(link.getClientRects(), innerWidth, innerHeight);
        if (!rect) { badges.get(link)?.remove(); badges.delete(link); continue; }
        const key = `${Math.round(rect.left)}:${Math.round(rect.top)}`;
        const usable = link.isConnected && rect.top >= 14 && getComputedStyle(link).visibility !== "hidden";
        if (!match || !usable || occupied.has(key)) { badges.get(link)?.remove(); badges.delete(link); continue; }
        occupied.add(key);
        let badge = badges.get(link);
        if (!badge) { badge = document.createElement("span"); badge.className = "mark"; badge.setAttribute("role", "img"); shadow.append(badge); badges.set(link, badge); }
        badge.setAttribute("aria-label", match.label);
        badge.style.setProperty("--color", /^#[0-9a-f]{6}$/i.test(match.color) ? match.color : "#2563eb");
        // Float above the first line, with a 2px gap; never cover the link text.
        badge.style.left = `${Math.max(0, Math.min(innerWidth - 10, rect.left - 3))}px`;
        badge.style.top = `${rect.top - 14}px`;
      }
      showTooltip();
    });
  }
  function showTooltip() {
    const match = hovered && badges.has(hovered) ? cache.get(href(hovered) ?? "") : null;
    tooltip.hidden = !match;
    if (!match || !hovered) return;
    const rect = hovered.getBoundingClientRect();
    tooltip.textContent = match.label;
    tooltip.style.left = `${Math.max(0, Math.min(innerWidth - tooltip.offsetWidth - 8, rect.left))}px`;
    tooltip.style.top = `${Math.max(0, Math.min(innerHeight - tooltip.offsetHeight - 4, rect.bottom + 4))}px`;
  }
  function hover(event: Event) {
    hovered = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    showTooltip();
  }
  function leave() { hovered = null; tooltip.hidden = true; }
  function message(input: { type?: string }) {
    if (input?.type === STOP) stop();
    if (input?.type === REFRESH) {
      generation++; cache.clear();
      for (const badge of badges.values()) badge.remove();
      badges.clear(); leave(); schedule();
      // Verify permission even when the page has no visible links.
      void chrome.runtime.sendMessage({ type: QUERY, urls: [] }).then((reply: Reply) => { if (reply && !reply.enabled) stop(); }).catch(() => undefined);
    }
  }
  function stop() {
    if (stopped) return;
    stopped = true; generation++;
    clearTimeout(timer); cancelAnimationFrame(frame);
    mutations.disconnect(); intersection.disconnect(); resize.disconnect();
    document.removeEventListener("scroll", position, true);
    window.removeEventListener("resize", position);
    document.removeEventListener("pointerover", hover);
    document.removeEventListener("pointerout", leave);
    document.removeEventListener("focusin", hover);
    document.removeEventListener("focusout", leave);
    try { chrome.runtime.onMessage.removeListener(message); } catch { /* Extension context was reloaded. */ }
    host.remove(); links.clear(); visible.clear(); cache.clear(); badges.clear();
    scope.pathmarkLinkMarkers = false;
  }
  document.addEventListener("scroll", position, { capture: true, passive: true });
  window.addEventListener("resize", position);
  document.addEventListener("pointerover", hover);
  document.addEventListener("pointerout", leave);
  document.addEventListener("focusin", hover);
  document.addEventListener("focusout", leave);
  chrome.runtime.onMessage.addListener(message);
}
