/* =========================================================
   Ray's CPBL Data Site
   theme.js
   v5.6.0-A THEME CORE
========================================================= */

(() => {
  const STORAGE_KEY = "cpbl-theme";
  const VALID_THEMES = new Set(["light", "dark"]);

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return VALID_THEMES.has(saved) ? saved : "";
    } catch {
      return "";
    }
  }

  function getSystemTheme() {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function getCurrentTheme() {
    const current = document.documentElement.dataset.theme;
    return VALID_THEMES.has(current)
      ? current
      : (getSavedTheme() || getSystemTheme());
  }

  function updateThemeColor(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;

    meta.setAttribute(
      "content",
      theme === "dark" ? "#07111d" : "#0b3c5d"
    );
  }

  function updateButton(button, theme) {
    if (!button) return;

    const isDark = theme === "dark";

    button.setAttribute("aria-pressed", String(isDark));
    button.setAttribute(
      "aria-label",
      isDark ? "切換為淺色模式" : "切換為深色模式"
    );
    button.setAttribute(
      "title",
      isDark ? "目前為深色模式，點擊切換淺色" : "目前為淺色模式，點擊切換深色"
    );

    button.innerHTML = `
      <span class="theme-toggle-icon" aria-hidden="true">${isDark ? "🌙" : "☀️"}</span>
      <span class="theme-toggle-text">${isDark ? "深色" : "淺色"}</span>
    `;
  }

  function applyTheme(theme, options = {}) {
    const nextTheme = VALID_THEMES.has(theme) ? theme : getSystemTheme();

    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;

    if (document.body) {
      document.body.dataset.theme = nextTheme;
    }

    updateThemeColor(nextTheme);
    updateButton(document.querySelector("[data-theme-toggle]"), nextTheme);

    if (options.persist !== false) {
      try {
        localStorage.setItem(STORAGE_KEY, nextTheme);
      } catch {
        // localStorage 滿載時仍可正常切換，只是不記住選擇。
      }
    }

    window.dispatchEvent(
      new CustomEvent("cpblthemechange", {
        detail: { theme: nextTheme }
      })
    );
  }

  function createToggle() {
    const navInner = document.querySelector(".nav-inner");
    if (!navInner || navInner.querySelector("[data-theme-toggle]")) return;

    const wrap = document.createElement("div");
    wrap.className = "theme-toggle-wrap";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle";
    button.dataset.themeToggle = "true";

    button.addEventListener("click", () => {
      const current = getCurrentTheme();
      applyTheme(current === "dark" ? "light" : "dark");
    });

    wrap.appendChild(button);

    const navTeams = navInner.querySelector(".nav-teams");

    if (navTeams) {
      navInner.insertBefore(wrap, navTeams);
    } else {
      navInner.appendChild(wrap);
    }

    updateButton(button, getCurrentTheme());
  }

  function bindSystemTheme() {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;

    media.addEventListener?.("change", event => {
      if (getSavedTheme()) return;
      applyTheme(event.matches ? "dark" : "light", { persist: false });
    });
  }

  function init() {
    applyTheme(getCurrentTheme(), { persist: false });
    createToggle();
    bindSystemTheme();

    console.log(`✅ theme.js v5.6.0-A 已載入｜${getCurrentTheme()}`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  window.CPBLTheme = {
    get: getCurrentTheme,
    set: theme => applyTheme(theme),
    toggle: () => applyTheme(getCurrentTheme() === "dark" ? "light" : "dark")
  };
})();
