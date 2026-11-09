// Service worker (web y APK): guarda la app para abrirla y usar el armario sin conexión.
// · Archivos de la app con nombre con huella (assets/…): primero la caché (no cambian nunca).
// · La página: primero la red (para tener siempre la última versión), y si no hay conexión, la guardada.
// · version.json nunca se guarda (es lo que avisa de las versiones nuevas).
const CACHE = "armario-v3";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./offline.html"]).catch(() => {}))); });
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
// la app pide que se guarden los archivos que ha cargado (también los que se cargan al momento)
self.addEventListener("message", (e) => {
  if (e.data?.type === "cache" && Array.isArray(e.data.urls)) e.waitUntil(caches.open(CACHE).then((c) => Promise.all(e.data.urls.map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => {}))))));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // Firebase, Worker, tiempo y fuentes van directos a la red
  if (u.pathname.endsWith("/version.json")) return;
  if (u.pathname.includes("/assets/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })));
    return;
  }
  const isPage = e.request.mode === "navigate";
  e.respondWith(
    Promise.race([fetch(e.request), new Promise((_, ko) => setTimeout(() => ko(new Error("lento")), isPage ? 6000 : 10000))])
      .then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(isPage ? "./index.html" : e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: isPage }).then((r) => r || caches.match("./index.html")))
  );
});
