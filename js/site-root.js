// =========================================================
// Ray's CPBL Data Site
// site-root.js
// v5.6.1-D ROUTE-SAFE PATH SYSTEM
//
// 提供：
// window.CPBLSiteRoot.url("data/live/live-boxscore.json")
// window.CPBLSiteRoot.url("assets/logo/brothers.png")
// window.CPBLSiteRoot.url("match.html?gameSno=147")
// =========================================================

(() => {
  "use strict";

  const VERSION = "v5.6.1-D";

  function detectRoot() {
    const htmlRoot =
      document.documentElement.dataset.siteRoot ||
      document.querySelector('meta[name="cpbl-site-root"]')?.content ||
      "";

    if (htmlRoot) {
      return new URL(htmlRoot, document.baseURI);
    }

    const currentPath = location.pathname.replace(/\\/g, "/");
    const nestedFolders = [
      "/ops/",
      "/admin/",
      "/local-tools/"
    ];

    if (nestedFolders.some(folder => currentPath.includes(folder))) {
      return new URL("../", document.baseURI);
    }

    return new URL("./", document.baseURI);
  }

  const ROOT = detectRoot();

  function url(relativePath = "") {
    const value = String(relativePath || "").trim();

    if (!value) {
      return ROOT.href;
    }

    if (
      value.startsWith("#") ||
      value.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(value)
    ) {
      return value;
    }

    return new URL(
      value.replace(/^\/+/, ""),
      ROOT
    ).href;
  }

  function path(relativePath = "") {
    return new URL(url(relativePath)).pathname;
  }

  function fetchJson(relativePath, options = {}) {
    const target = url(relativePath);

    return fetch(target, {
      cache: "no-store",
      ...options
    }).then(async response => {
      if (!response.ok) {
        throw new Error(
          `${relativePath} 讀取失敗：HTTP ${response.status}`
        );
      }

      return response.json();
    });
  }

  function withCacheBust(relativePath, key = "ts") {
    const target = new URL(url(relativePath));
    target.searchParams.set(key, Date.now().toString());
    return target.href;
  }

  function navigate(relativePath, { replace = false } = {}) {
    const target = url(relativePath);

    if (replace) {
      location.replace(target);
    } else {
      location.href = target;
    }
  }

  window.CPBLSiteRoot = Object.freeze({
    version: VERSION,
    root: ROOT.href,
    url,
    path,
    fetchJson,
    withCacheBust,
    navigate
  });

  console.log(
    `✅ site-root.js ${VERSION} loaded｜ROOT=${ROOT.href}`
  );
})();
