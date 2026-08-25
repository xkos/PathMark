const menuButton = document.querySelector("[data-menu-button]");
const nav = document.querySelector("[data-nav]");

menuButton?.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
  nav?.toggleAttribute("data-open", !expanded);
});

document.querySelectorAll("[data-year]").forEach((node) => {
  node.textContent = String(new Date().getFullYear());
});

const localeCatalog = window.PATHMARK_LOCALES;
const currentLocale = document.documentElement.lang;
const pageSuffix = location.pathname.endsWith("/privacy/") ? "privacy/" : "";

document.querySelectorAll("[data-locale-picker]").forEach((container) => {
  if (!localeCatalog) return;
  const select = document.createElement("select");
  select.setAttribute("aria-label", container.dataset.label || "Language");
  select.className = "locale-select";
  for (const locale of localeCatalog.locales) {
    const option = document.createElement("option");
    option.value = locale.code;
    option.textContent = locale.name;
    option.selected = locale.code === currentLocale;
    select.append(option);
  }
  select.addEventListener("change", () => location.assign(`/${select.value}/${pageSuffix}`));
  container.replaceChildren(select);
});
