/* sw.js —— 离线缓存
   策略：页面导航 network-first（保证拿到最新页面）；
   静态资源 stale-while-revalidate（先回缓存，后台更新，下次即为新版本）；
   发布新版本时 bump CACHE 名可强制全量刷新。 */
var CACHE = "leci-v25";
var PRECACHE = [
  "./", "./index.html", "./manifest.json",
  "./css/style.css",
  "./js/db.js", "./js/srs.js", "./js/study.js", "./js/test.js", "./js/app.js",
  "./data/cet4.js", "./data/cet6.js", "./data/kaoyan.js",
  "./icons/i192.png", "./icons/i512.png", "./icons/i180.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate") {
    /* 页面：网络优先，离线回退缓存 */
    e.respondWith(
      fetch(req).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return resp;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true })
          .then(function (hit) { return hit || caches.match("./index.html", { ignoreSearch: true }); });
      })
    );
    return;
  }

  /* 静态资源：先回缓存，后台更新（stale-while-revalidate） */
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var fetching = fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function () { return hit; });
      return hit || fetching;
    })
  );
});
