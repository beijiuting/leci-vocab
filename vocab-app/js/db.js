/* db.js —— IndexedDB 封装（进度 / 生词本 / 统计 / 自定义词库 / 设置） */
(function () {
  "use strict";

  /* 全局 HTML 转义（app.js / study.js 共用） */
  window.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  var DB_NAME = "VocabAppDB";
  var DB_VER = 1;
  var db = null;           // 原生连接
  var settingsCache = null; // 内存中的设置缓存

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var _db = e.target.result;
        if (!_db.objectStoreNames.contains("progress")) {
          var s = _db.createObjectStore("progress", { keyPath: "id" });
          s.createIndex("lib", "lib");
          s.createIndex("due", "due");
        }
        if (!_db.objectStoreNames.contains("favorites")) {
          var f = _db.createObjectStore("favorites", { keyPath: "id" });
          f.createIndex("lib", "lib");
        }
        if (!_db.objectStoreNames.contains("stats")) {
          _db.createObjectStore("stats", { keyPath: "date" });
        }
        if (!_db.objectStoreNames.contains("libs")) {
          _db.createObjectStore("libs", { keyPath: "id" });
        }
        if (!_db.objectStoreNames.contains("settings")) {
          _db.createObjectStore("settings", { keyPath: "k" });
        }
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(store, mode) {
    return open().then(function (_db) { return _db.transaction(store, mode).objectStore(store); });
  }

  function req2p(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* 数据变更通知（app.js 用于自动备份，跨更新/重装继承进度） */
  function dirty() {
    try { if (window.App && window.App.markDataDirty) window.App.markDataDirty(); } catch (e) { /* 忽略 */ }
  }

  var DB = {
    /* ---- 通用 ---- */
    get: function (store, key) { return tx(store, "readonly").then(function (s) { return req2p(s.get(key)); }); },
    put: function (store, val) { return tx(store, "readwrite").then(function (s) { return req2p(s.put(val)); }).then(function (r) { dirty(); return r; }); },
    del: function (store, key) { return tx(store, "readwrite").then(function (s) { return req2p(s.delete(key)); }).then(function (r) { dirty(); return r; }); },
    all: function (store) { return tx(store, "readonly").then(function (s) { return req2p(s.getAll()); }); },
    allByIndex: function (store, index, key) {
      return tx(store, "readonly").then(function (s) { return req2p(s.index(index).getAll(key)); });
    },
    clear: function (store) { return tx(store, "readwrite").then(function (s) { return req2p(s.clear()); }).then(function (r) { dirty(); return r; }); },

    /* ---- 设置 ---- */
    loadSettings: function () {
      if (settingsCache) return Promise.resolve(settingsCache);
      return DB.get("settings", "app").then(function (row) {
        settingsCache = (row && row.v) || {};
        return settingsCache;
      });
    },
    saveSettings: function (patch) {
      settingsCache = Object.assign({}, settingsCache || {}, patch);
      return DB.put("settings", { k: "app", v: settingsCache });
    },
    settings: function () { return settingsCache || {}; },

    /* ---- 学习进度（id = lib + "|" + word 小写） ---- */
    progId: function (lib, w) { return lib + "|" + w.toLowerCase(); },
    getProg: function (lib, w) { return DB.get("progress", DB.progId(lib, w)); },
    putProg: function (p) { return DB.put("progress", p); },
    libProg: function (lib) { return DB.allByIndex("progress", "lib", lib); },

    /* ---- 生词本 ---- */
    isFav: function (lib, w) { return DB.get("favorites", DB.progId(lib, w)).then(function (r) { return !!r; }); },
    toggleFav: function (lib, w) {
      var id = DB.progId(lib, w);
      return DB.get("favorites", id).then(function (row) {
        if (row) { return DB.del("favorites", id).then(function () { return false; }); }
        return DB.put("favorites", { id: id, lib: lib, w: w, at: Date.now() }).then(function () { return true; });
      });
    },
    libFavs: function (lib) { return DB.allByIndex("favorites", "lib", lib); },

    /* ---- 每日统计 ---- */
    today: function () {
      var d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    },
    todayStat: function () {
      var t = DB.today();
      return DB.get("stats", t).then(function (r) {
        return r || { date: t, newL: 0, rev: 0, ok: 0, bad: 0 };
      });
    },
    saveTodayStat: function (stat) { return DB.put("stats", stat); },

    /* ---- 自定义词库 ---- */
    customLibs: function () { return DB.all("libs"); },

    /* ---- 导出全部数据 ---- */
    exportAll: function () {
      return Promise.all([DB.all("progress"), DB.all("favorites"), DB.all("stats"), DB.all("libs"), DB.loadSettings()])
        .then(function (r) {
          return { app: "vocab-app", version: 1, exportedAt: Date.now(),
                   progress: r[0], favorites: r[1], stats: r[2], libs: r[3], settings: r[4] };
        });
    },

    /* ---- 导入备份（清空后写入） ---- */
    importAll: function (data) {
      return open().then(function (_db) {
        return new Promise(function (resolve, reject) {
          try {
            var t = _db.transaction(["progress", "favorites", "stats", "libs", "settings"], "readwrite");
            ["progress", "favorites", "stats", "libs"].forEach(function (s) { t.objectStore(s).clear(); });
            (data.progress || []).forEach(function (x) { t.objectStore("progress").put(x); });
            (data.favorites || []).forEach(function (x) { t.objectStore("favorites").put(x); });
            (data.stats || []).forEach(function (x) { t.objectStore("stats").put(x); });
            (data.libs || []).forEach(function (x) { t.objectStore("libs").put(x); });
            if (data.settings) t.objectStore("settings").put({ k: "app", v: data.settings });
            t.oncomplete = function () { settingsCache = null; dirty(); resolve(true); };
            t.onerror = function () { reject(t.error); };
          } catch (e) { reject(e); }
        });
      });
    },

    wipe: function () {
      return open().then(function (_db) {
        return new Promise(function (resolve, reject) {
          var t = _db.transaction(["progress", "favorites", "stats", "libs", "settings"], "readwrite");
          ["progress", "favorites", "stats", "libs", "settings"].forEach(function (s) { t.objectStore(s).clear(); });
          t.oncomplete = function () { settingsCache = null; resolve(true); };
          t.onerror = function () { reject(t.error); };
        });
      });
    }
  };

  window.DB = DB;
})();
