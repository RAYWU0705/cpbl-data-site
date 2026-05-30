/* =========================================================
   Ray's CPBL Data Site
   js/pwa-register.js
   v5.5.3-PWA-APP-SHELL
========================================================= */

(function registerRayCpblPwa() {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then(reg => {
        console.log("✅ CPBL PWA service worker registered:", reg.scope);
      })
      .catch(err => {
        console.warn("⚠️ CPBL PWA service worker failed:", err);
      });
  });
})();
