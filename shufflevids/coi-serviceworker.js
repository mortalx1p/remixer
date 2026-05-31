/*! coi-serviceworker v0.1.7 — Guido Zuidhof, MIT license
    Injects COOP/COEP headers via Service Worker so SharedArrayBuffer
    (required by FFmpeg WASM) works without touching server config. */
let coepCredentialless = false;
if (typeof window === 'undefined') {
  // ── SERVICE WORKER SIDE ──
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
  self.addEventListener('message', ev => {
    if (!ev.data) return;
    if (ev.data.type === 'deregister') {
      self.registration.unregister().then(() => self.clients.matchAll()).then(clients => {
        clients.forEach(c => c.navigate(c.url));
      });
    } else if (ev.data.type === 'coepCredentialless') {
      coepCredentialless = ev.data.value;
    }
  });
  self.addEventListener('fetch', function(event) {
    const r = event.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
    const request = (coepCredentialless && r.mode === 'no-cors')
      ? new Request(r, { credentials: 'omit' }) : r;
    event.respondWith(
      fetch(request).then(response => {
        if (response.status === 0) return response;
        const h = new Headers(response.headers);
        h.set('Cross-Origin-Embedder-Policy', coepCredentialless ? 'credentialless' : 'require-corp');
        if (!coepCredentialless) h.set('Cross-Origin-Resource-Policy', 'cross-origin');
        h.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
      }).catch(e => console.error(e))
    );
  });
} else {
  // ── PAGE SIDE ──
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');
    window.sessionStorage.removeItem('coiReloadedBySelf');
    const coi = {
      shouldRegister: () => !reloadedBySelf,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      coepDegrade: () => true,
      doReload: () => window.location.reload(),
      quiet: false,
    };
    if (window.coi) Object.assign(coi, window.coi);
    if (window.crossOriginIsolated !== false) return;
    if (!coi.shouldRegister()) return;
    if (!('serviceWorker' in navigator)) {
      !coi.quiet && console.warn('COI Service Worker: browser has no Service Worker support.');
      return;
    }
    if (!window.isSecureContext) {
      !coi.quiet && console.warn('COI Service Worker: not a secure context — needs HTTPS or localhost.');
      return;
    }
    navigator.serviceWorker.register(window.document.currentScript.src)
      .then(reg => {
        !coi.quiet && console.log('COI Service Worker registered', reg.scope);
        reg.addEventListener('updatefound', () => {
          window.sessionStorage.setItem('coiReloadedBySelf', 'updatefound');
          coi.doReload();
        });
        if (reg.active && !navigator.serviceWorker.controller) {
          window.sessionStorage.setItem('coiReloadedBySelf', 'notcontrolling');
          coi.doReload();
        }
      }).catch(e => !coi.quiet && console.error('COI Service Worker failed:', e));

    // Tell SW to use credentialless mode then reload
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'coepCredentialless', value: coi.coepCredentialless() });
        window.sessionStorage.setItem('coiReloadedBySelf', 'credentialless');
        coi.doReload();
      }
    });
  })();
}
