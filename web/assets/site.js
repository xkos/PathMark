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
