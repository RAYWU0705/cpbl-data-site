(() => {
  const key = "cpbl-theme";
  const valid = new Set(["light", "dark"]);
  let theme = "";
  try { theme = localStorage.getItem(key) || ""; } catch {}
  if (!valid.has(theme)) {
    theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
