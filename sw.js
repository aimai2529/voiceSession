const CACHE_NAME = "audio-app-cache-v1";
const urlsToCache = [
    "./",
    "./index.html",
    "./style.css",
    "./icon-192.png",
    "./icon-512.png"
];

// インストール時にキャッシュする
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
    );
});

// リクエスト時にキャッシュを返す
self.addEventListener("fetch", (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});