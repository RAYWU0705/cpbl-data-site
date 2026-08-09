/* =========================
   全站版本號
========================= */

const SITE_VERSION = "v6.6.0-RC";

/* 自動更新頁尾 */
document.addEventListener("DOMContentLoaded", () => {
  const versionEls = document.querySelectorAll(".site-version");
  versionEls.forEach(el => {
    el.textContent = SITE_VERSION;
  });
});
