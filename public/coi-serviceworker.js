/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
/*
 * This service worker intercepts requests and adds COOP/COEP headers
 * to enable SharedArrayBuffer, which is required for WASM multithreading.
 */
let coepCredentialless = false;

if (typeof window === 'undefined') {
  // Service Worker context
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener("message", (ev) => {
    if (!ev.data) {
      return;
    } else if (ev.data.type === "deregister") {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach((client) => client.navigate(client.url));
        });
    } else if (ev.data.type === "coepCredentialless") {
      coepCredentialless = ev.data.value;
    }
  });

  self.addEventListener("fetch", function (event) {
    const r = event.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
      return;
    }

    const coep = coepCredentialless ? "credentialless" : "require-corp";

    event.respondWith(
      fetch(r)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const newHeaders = new Headers(response.headers);
          newHeaders.set("Cross-Origin-Embedder-Policy", coep);
          newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        })
        .catch((e) => console.error(e))
    );
  });
} else {
  // Browser context - Registration logic
  (() => {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    // Skip registration entirely on localhost to avoid breaking local dev
    if (isLocalhost) {
      console.log("[COI] Skipping service worker on localhost.");
      return;
    }

    // If already cross-origin isolated, no need for the service worker
    if (window.crossOriginIsolated) {
      console.log("[COI] Already cross-origin isolated, no service worker needed.");
      return;
    }

    const currentScript = window.document.currentScript;
    const src = currentScript ? currentScript.src : '';
    const workerPath = src.substring(0, src.lastIndexOf("/") + 1) + "coi-serviceworker.js";

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(workerPath).then(
        (registration) => {
          console.log("[COI] Service Worker registered:", registration.scope);

          registration.addEventListener("updatefound", () => {
            console.log("[COI] Updating service worker...");
            window.location.reload();
          });

          // If registered but not controlling, reload to activate
          if (registration.active && !navigator.serviceWorker.controller) {
            console.log("[COI] Reloading to activate service worker...");
            window.location.reload();
          }
        },
        (err) => {
          console.error("[COI] Service Worker registration failed:", err);
        }
      );
    }
  })();
}
