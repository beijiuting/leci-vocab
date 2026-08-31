/* app.js —— 主应用：路由 / 首页 / 词库 / 统计 / 生词本 / 设置 */
(function () {
  "use strict";

  var S = window.SRS, DB = window.DB;

  var App = {
    version: "1.9.0",
    updateManifestUrls: ["https://raw.githubusercontent.com/beijiuting/leci-vocab/main/version.json", "https://cdn.jsdelivr.net/gh/beijiuting/leci-vocab@main/version.json"],
    settings: { currentLib: "cet6", dailyNew: 20, voice: "us", autoSpeak: 1, darkMode: "0", autoFavWrong: 1, learnOrder: "shuffle", freqRange: "all", favBooks: null, curFavBook: "default" },
    libCache: null,      // {id: {id,name,short,color,words,custom}}
    voiceList: [],

    /* ================= 启动 ================= */
    async init() {
      await DB.loadSettings();
      var s = DB.settings();
      if (s.currentLib) this.settings = Object.assign(this.settings, s);
      if (!window.WORDLIBS || !window.WORDLIBS[this.settings.currentLib]) this.settings.currentLib = "cet6";
      await this.autoRestore();
      await this.migrateSrs9();
      await this.buildLibCache();
      this.bindTabs();
      this.bindHome();
      this.bindLibs();
      this.bindStats();
      this.bindFavs();
      this.bindMe();
      this.migrateFavs();
      this.initVoice();
      this.applyDark();
      try {
        var isLocal = ["localhost", "127.0.0.1"].indexOf(location.hostname) >= 0;
        if ("serviceWorker" in navigator && location.protocol === "https:" && !isLocal) {
          navigator.serviceWorker.register("sw.js").catch(function () {});
        }
      } catch (e) { /* 本地开发与 Android 壳内不注册 SW */ }
      try {
        var self = this;
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
          if (self.settings.darkMode === "auto") self.applyDark();
        });
      } catch (e) { /* 旧浏览器 */ }
      try {
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "hidden" && self._bakT) {
            clearTimeout(self._bakT); self._bakT = null; self.flushAutoBak();
          }
        });
      } catch (e) { /* 忽略 */ }
      await this.refreshAll();
      setTimeout(function () { App.checkForUpdates(); }, 1800);
    },

    /* 从 GitHub 公共版本清单检查更新；网页可刷新，Android 交给系统安装器确认 */
    async checkForUpdates(manual) {
      try {
        var info = null;
        for (var i = 0; i < this.updateManifestUrls.length && !info; i++) {
          try { var res = await fetch(this.updateManifestUrls[i] + "?t=" + Date.now(), { cache: "no-store" }); if (res.ok) info = await res.json(); } catch (ignore) {}
        }
        if (!info || !info.version) { if (manual) this.toast("暂时无法连接更新服务器"); return; }
        if (this.compareVersions(info.version, this.version) <= 0) { if (manual) this.toast("当前已是最新版本"); return; }
        var key = "leci-update-seen-" + info.version;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
        var notes = (info.notes || []).map(function (x) { return "• " + x; }).join("<br>");
        var url = info.apkUrl || info.url || "https://github.com/beijiuting/leci-vocab/releases";
        var self = this;
        this.confirm("发现新版本 " + esc(info.version),
          '<div style="line-height:1.7">' + (notes || "有新的功能和修复") + "</div>", null,
          [{ text: "稍后再说", cls: "btn-plain", fn: null }, { text: "立即更新", cls: "btn-primary", fn: function () {
            if (/Android/i.test(navigator.userAgent) && url) location.href = url;
            else window.location.reload();
          }}]);
      } catch (e) { if (manual) this.toast("检查更新失败，请稍后重试"); }
    },
    compareVersions(a, b) {
      var pa = String(a).replace(/^v/, "").split(".").map(Number);
      var pb = String(b).replace(/^v/, "").split(".").map(Number);
      for (var i = 0; i < 3; i++) {
        var x = pa[i] || 0, y = pb[i] || 0;
        if (x !== y) return x > y ? 1 : -1;
      }
      return 0;
    },

    /* 单词标题自适应缩字号：按容器宽度与字符数预算，超宽再实测收缩；永不换行（配合 .ww nowrap） */
    fitWord: function (root) {
      var nodes = (root || document).querySelectorAll(".ww");
      Array.prototype.forEach.call(nodes, function (w) {
        w.style.fontSize = "";
        var parent = w.parentElement;
        if (!parent) return;
        var pw = parent.clientWidth;
        if (!pw) return;
        var n = Math.max((w.textContent || "").length, 1);
        var base = parseFloat(getComputedStyle(w).fontSize) || 30;
        var size = Math.min(base, Math.max(14, Math.floor(pw / (n * 0.66))));
        if (size < base) w.style.fontSize = size + "px";
        var guard = 0;
        while (w.scrollWidth > pw + 1 && size > 13 && guard++ < 10) {
          size -= 2;
          w.style.fontSize = size + "px";
        }
      });
    },

    /* ================= 数据自动继承（跨更新/重装） =================
       学习数据每次变更后 4 秒自动写两份快照：
       ① App 私有文件（覆盖安装必定保留）② 公共下载目录 + localStorage（卸载重装的兜底）
       启动时若本地库为空（重装/清数据后首次打开），自动从快照恢复，无需手动导出导入 */
    _bakT: null,
    markDataDirty() {
      var self = this;
      if (this._bakT) return;
      this._bakT = setTimeout(function () { self._bakT = null; self.flushAutoBak(); }, 4000);
    },
    async flushAutoBak() {
      try {
        var json = JSON.stringify(await DB.exportAll());
        if (window.NativeBackup && window.NativeBackup.saveAuto) {
          try { window.NativeBackup.saveAuto(json); } catch (e) { /* 忽略 */ }
        }
        try {
          var lite = JSON.parse(json);
          delete lite.libs;   // 自定义词库可能超 localStorage 配额，快照只留进度/统计/生词/设置
          localStorage.setItem("leci-auto", json.length < 4e6 ? JSON.stringify(lite) : "");
        } catch (e) { /* 忽略 */ }
      } catch (e) { /* 忽略 */ }
    },
    async autoRestore() {
      var fresh = !(await DB.all("progress")).length &&
                  !(await DB.all("stats")).length &&
                  !(await DB.all("favorites")).length;
      if (!fresh) return;
      var txt = "";
      if (window.NativeBackup && window.NativeBackup.readAuto) {
        try { txt = window.NativeBackup.readAuto() || ""; } catch (e) { /* 忽略 */ }
      }
      if (!txt) { try { txt = localStorage.getItem("leci-auto") || ""; } catch (e) { /* 忽略 */ } }
      if (!txt) return;
      try {
        var data = JSON.parse(txt);
        if (!data || data.app !== "vocab-app") return;
        if (!(data.progress || []).length && !(data.stats || []).length) return;
        await DB.importAll(data);
        await DB.loadSettings();
        this.settings = Object.assign(this.settings, DB.settings());
        this.settings._srs9 = 0;   // 备份可能来自旧版本，重跑一次记忆曲线迁移
        var self = this;
        setTimeout(function () {
          self.toast("已自动恢复上次的学习数据（" + (data.progress || []).length + " 词进度）");
        }, 1500);
      } catch (e) { /* 快照损坏则当新装处理 */ }
    },
    /* 安卓端读取权限刚被允许时由壳回调：重试一次自动恢复（幂等，库非空则跳过） */
    retryAutoRestore() { return this.autoRestore(); },

    /* ================= 深色模式 ================= */
    applyDark() {
      var m = this.settings.darkMode;
      var dark = m === "1" || (m === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      var meta = document.getElementById("meta-theme");
      if (meta) meta.setAttribute("content", dark ? "#131926" : "#4A7DF7");
    },

    async buildLibCache() {
      var cache = {};
      if (window.WORDLIBS) {
        Object.keys(window.WORDLIBS).forEach(function (id) {
          var l = window.WORDLIBS[id];
          cache[id] = { id: id, name: l.name, short: l.short, color: l.color || "#4A7DF7", words: l.words, custom: false };
        });
      }
      var customs = await DB.customLibs();
      customs.forEach(function (l) {
        cache[l.id] = { id: l.id, name: l.name, short: "自定义", color: l.color || "#8E6BF1", words: l.words, custom: true };
      });
      this.libCache = cache;
    },

    libById(id) { return this.libCache[id]; },
    currentLibId() { return this.settings.currentLib; },
    currentLib() { return this.libCache[this.settings.currentLib]; },

    /* ================= 发音 ================= */
    initVoice() {
      var self = this;
      try {
        function load() { self.voiceList = speechSynthesis.getVoices() || []; }
        load();
        if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = load;
      } catch (e) { /* 无 TTS 环境 */ }
    },
    speak(text, manual, onend) {
      if (!text) return;
      if (!manual && !this.settings.autoSpeak) return;
      var self = this;
      /* Android 壳：优先系统 TTS 桥（WebView 内 speechSynthesis 无声） */
      if (window.NativeTTS && window.NativeTTS.available && window.NativeTTS.available()) {
        window.__nativeTtsEnd = onend || null;
        try { window.NativeTTS.speak(String(text), this.settings.voice === "uk"); } catch (e) { /* 忽略 */ }
        return;
      }
      /* Android 壳但无 TTS 引擎（模拟器常见）：在线发音兜底，离线则引导安装引擎 */
      if (window.NativeTTS) {
        if (navigator.onLine) {
          this.playOnline(text, onend);
        } else {
          this.hintNoTts();
          if (onend) onend();
        }
        return;
      }
      try {
        var lang = this.settings.voice === "uk" ? "en-GB" : "en-US";
        var u = new SpeechSynthesisUtterance(text);
        u.lang = lang; u.rate = 0.82;
        var match = this.voiceList.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(lang.toLowerCase()) === 0; });
        if (match.length) u.voice = match[0];
        if (onend) u.onend = onend;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch (e) { /* 忽略 */ }
    },
    /* 在线发音（有道词典公开语音接口）：无 TTS 引擎的设备兜底 */
    _lastAudio: null,
    playOnline(text, onend) {
      try {
        if (this._lastAudio) { try { this._lastAudio.pause(); } catch (e) {} }
        var a = new Audio("https://dict.youdao.com/dictvoice?audio=" + encodeURIComponent(text) +
          "&type=" + (this.settings.voice === "uk" ? "1" : "2"));
        this._lastAudio = a;
        if (onend) { a.onended = onend; a.onerror = function () { if (onend) onend(); }; }
        var p = a.play();
        if (p && p.catch) p.catch(function () { if (onend) onend(); });
      } catch (e) { if (onend) onend(); }
    },
    hintNoTts() {
      if (this._noTtsHinted) return;
      this._noTtsHinted = true;
      var self = this;
      this.confirm("未检测到语音引擎", "当前设备没有文字转语音（TTS）引擎，发音将依赖网络在线朗读。" +
        "如需离线发音，可在模拟器应用商店或系统设置中安装「Google 文字转语音」等 TTS 引擎。", null,
        [{ text: "我知道了", cls: "btn-primary" }]);
      setTimeout(function () { self._noTtsHinted = false; }, 30000);
    },

    /* ================= 进度读写 ================= */
    /* 一次性迁移：老版本 stage7=已毕业 → 新曲线毕业=stage9（导入旧备份后强制再跑一次） */
    async migrateSrs9() {
      if (this.settings._srs9) return;
      var changed = S.migrateOld(await DB.all("progress"));
      for (var i = 0; i < changed.length; i++) await DB.putProg(changed[i]);
      await DB.saveSettings({ _srs9: 1 });
    },
    async seedProgress(libId, entry, correct) {
      var p = S.seed(libId, entry.w, correct);
      await DB.putProg(p);
      return p;
    },
    async reviewProgress(item, correct) {
      var p = item.prog || S.seed(this.currentLibId(), item.entry.w, true);
      S.review(p, correct);
      await DB.putProg(p);
      return p;
    },
    async addStat(patch) {
      var t = await DB.todayStat();
      t.newL = (t.newL || 0) + (patch.newL || 0);
      t.rev = (t.rev || 0) + (patch.rev || 0);
      t.ok = (t.ok || 0) + (patch.ok || 0);
      t.bad = (t.bad || 0) + (patch.bad || 0);
      t.secs = (t.secs || 0) + (patch.secs || 0);
      await DB.saveTodayStat(t);
    },
    /* ================= 多生词本 ================= */
    favBooks() {
      if (!this.settings.favBooks || !this.settings.favBooks.length) {
        return [{ id: "default", name: "默认生词本" }];
      }
      return this.settings.favBooks;
    },
    curFavBookId() {
      var books = this.favBooks();
      var cur = this.settings.curFavBook || "default";
      return books.some(function (b) { return b.id === cur; }) ? cur : books[0].id;
    },
    curFavBookName() {
      var cur = this.curFavBookId();
      var b = this.favBooks().find(function (x) { return x.id === cur; });
      return b ? b.name : "默认生词本";
    },
    async createFavBook(name) {
      var books = this.favBooks().slice();
      var id = "fb_" + Date.now();
      books.push({ id: id, name: name });
      this.settings.favBooks = books;
      this.settings.curFavBook = id;
      await DB.saveSettings({ favBooks: books, curFavBook: id });
      this.toast("已创建生词本「" + name + "」");
    },
    async deleteFavBook(id) {
      var books = this.favBooks().filter(function (b) { return b.id !== id; });
      if (!books.length) books = [{ id: "default", name: "默认生词本" }];
      var target = books[0].id;
      var favs = await DB.all("favorites");
      for (var i = 0; i < favs.length; i++) {
        if ((favs[i].bookId || "default") === id) {
          favs[i].bookId = target;
          await DB.put("favorites", favs[i]);
        }
      }
      var nextCur = this.curFavBookId() === id ? books[0].id : this.curFavBookId();
      this.settings.favBooks = books;
      this.settings.curFavBook = nextCur;
      await DB.saveSettings({ favBooks: books, curFavBook: nextCur });
      this.toast("已删除，其中词汇已移至「" + books[0].name + "」");
    },
    /* 旧数据迁移：无归属的收藏归入默认本 */
    async migrateFavs() {
      if (this.settings._favMigrated) return;
      var favs = await DB.all("favorites");
      for (var i = 0; i < favs.length; i++) {
        if (!favs[i].bookId) { favs[i].bookId = "default"; await DB.put("favorites", favs[i]); }
      }
      this.settings._favMigrated = 1;
      if (!this.settings.favBooks) await DB.saveSettings({ favBooks: [{ id: "default", name: "默认生词本" }] });
    },
    curFavBookIdSafe: null,
    async toggleFav(libId, w) {
      var on = await DB.toggleFav(libId, w);
      if (on) {
        var id = DB.progId(libId, w);
        var row = await DB.get("favorites", id);
        row.bookId = this.curFavBookId();
        await DB.put("favorites", row);
      }
      this.toast(on ? "已加入「" + this.curFavBookName() + "」★" : "已从生词本移除");
    },
    /* 错词自动收藏（只加不移除） */
    async autoFav(libId, w) {
      if (!this.settings.autoFavWrong) return;
      var ex = await DB.get("favorites", DB.progId(libId, w));
      if (!ex) await DB.put("favorites", { id: DB.progId(libId, w), lib: libId, w: w, at: Date.now(), bookId: this.curFavBookId() });
    },
    async addManyFavs(libId, words) {
      var n = 0;
      var bookId = this.curFavBookId();
      for (var i = 0; i < words.length; i++) {
        var id = DB.progId(libId, words[i]);
        var ex = await DB.get("favorites", id);
        if (!ex) {
          await DB.put("favorites", { id: id, lib: libId, w: words[i], at: Date.now(), bookId: bookId });
          n++;
        }
      }
      this.toast(n ? "已把 " + n + " 个词自动加入「" + this.curFavBookName() + "」" : "这些词都已在生词本中");
    },

    /* 标记熟词：直接毕业 */
    async markKnown(libId, w) {
      var p = await DB.getProg(libId, w);
      if (p) { p.stage = S.MASTERED; p.due = 0; p.lastAt = Date.now(); }
      else {
        p = { id: DB.progId(libId, w), lib: libId, w: w, stage: S.MASTERED, due: 0,
              reviews: 0, wrong: 0, addedAt: Date.now(), lastAt: Date.now() };
      }
      await DB.putProg(p);
    },

    /* ================= 学习队列 ================= */
    async libProgMap(libId) {
      var list = await DB.libProg(libId);
      var map = {};
      list.forEach(function (p) { map[p.w.toLowerCase()] = p; });
      return map;
    },
    /* 学习范围：全部 / COCA前N；学习顺序：词书序 / 高频优先 */
    inLearnScope(entry) {
      var r = this.settings.freqRange;
      if (r === "all") return true;
      return entry.frq && entry.frq <= +r;
    },
    orderWords(list) {
      var o = this.settings.learnOrder || "shuffle";
      if (o === "freq") return list.slice().sort(function (a, b) {
        return (a.frq || 99999) - (b.frq || 99999);
      });
      if (o === "book") return list.slice();
      return shuffleArr(list);        // 默认：乱序
    },
    async newWordCandidates(libId, n) {
      var lib = this.libById(libId);
      var map = await this.libProgMap(libId);
      var pool = this.orderWords(lib.words.filter(this.inLearnScope, this));
      var out = [];
      for (var i = 0; i < pool.length && out.length < n; i++) {
        var w = pool[i];
        var p = map[w.w.toLowerCase()];
        if (!p || !S.isLearned(p)) out.push(w);
      }
      return out;
    },
    async hasMoreNewWords(libId) {
      var t = await DB.todayStat();
      var remain = this.settings.dailyNew - (t.newL || 0);
      if (remain <= 0) return false;
      var c = await this.newWordCandidates(libId, 1);
      return c.length > 0;
    },
    /* 今日应复习的队列（含今天稍后到期的10分钟回见词） */
    async dueQueue(libId) {
      var lib = this.libById(libId);
      var progList = await DB.libProg(libId);
      var entryMap = {};
      lib.words.forEach(function (w) { entryMap[w.w.toLowerCase()] = w; });
      var endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
      var queue = [];
      progList.forEach(function (p) {
        if (p.stage > 0 && p.stage < S.MASTERED && p.due <= endOfDay.getTime() && entryMap[p.w.toLowerCase()]) {
          queue.push({ entry: entryMap[p.w.toLowerCase()], prog: p });
        }
      });
      queue.sort(function (a, b) { return a.prog.due - b.prog.due; });
      return queue;
    },

    /* ================= 路由 ================= */
    bindTabs() {
      var self = this;
      document.querySelectorAll(".tabbar button").forEach(function (btn) {
        btn.onclick = function () { self.go(btn.getAttribute("data-page")); };
      });
    },
    go(page) {
      document.querySelectorAll(".tabbar button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-page") === page ||
          (page === "wordlist" && b.getAttribute("data-page") === "libs"));
      });
      document.querySelectorAll(".screen").forEach(function (s) {
        s.classList.toggle("on", s.id === "page-" + page);
      });
      var self = this;
      if (page === "home") this.renderHome();
      if (page === "libs") this.renderLibs();
      if (page === "wordlist") this.renderWordlist();
      if (page === "stats") this.renderStats();
      if (page === "favs") this.renderFavs();
      if (page === "me") this.renderMe();
    },

    async refreshAll() {
      await this.buildLibCache();
      var cur = document.querySelector(".screen.on");
      this.go(cur ? cur.id.replace("page-", "") : "home");
    },

    /* ================= 首页 ================= */
    bindHome() {
      var self = this;
      document.getElementById("home-lib").onclick = function () { self.go("libs"); };
      document.getElementById("btn-start").onclick = function () { self.startToday(); };
      document.getElementById("q-review").onclick = function () { self.startReview(); };
      document.getElementById("q-spell").onclick = function () { self.pickSpellSource(); };
      document.getElementById("q-fav").onclick = function () { self.go("favs"); };
      document.getElementById("q-cram").onclick = function () { self.pickCramRange(); };
      document.getElementById("q-test").onclick = function () { self.pickTestRange(); };
      document.getElementById("home-search").onclick = function () { self.openSearch(); };
    },
    /* 按范围取词（速刷/测试用） */
    async wordsForRange(libId, range) {
      var lib = this.libById(libId);
      var map = await this.libProgMap(libId);
      var entryMap = {};
      lib.words.forEach(function (w) { entryMap[w.w.toLowerCase()] = w; });
      var out = [];
      if (range === "favs") {
        var favs = await DB.libFavs(libId);
        favs.forEach(function (f) { var e = entryMap[f.w.toLowerCase()]; if (e) out.push(e); });
        return out;
      }
      if (range === "recent") {
        var progList = await DB.libProg(libId);
        progList.sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); });
        progList.slice(0, 100).forEach(function (p) {
          var e = entryMap[p.w.toLowerCase()];
          if (e) out.push(e);
        });
        return out;
      }
      lib.words.forEach(function (w) {
        var p = map[w.w.toLowerCase()];
        var learned = p && S.isLearned(p);
        if (range === "unlearned" && !learned) out.push(w);
        if (range === "learned" && learned) out.push(w);
        if (range === "all") out.push(w);
      });
      return out;
    },
    /* 备考速刷：范围 → 数量 */
    pickCramRange() {
      var self = this;
      this.confirm("备考速刷", "选择要速刷的单词范围：", null, [
        { text: "未学新词", cls: "btn-primary", fn: function () { self.pickCramCount("unlearned"); } },
        { text: "已学过的词", cls: "btn-ghost", fn: function () { self.pickCramCount("learned"); } },
        { text: "生词本", cls: "btn-plain", fn: function () { self.pickCramCount("favs"); } },
        { text: "本书全部", cls: "btn-plain", fn: function () { self.pickCramCount("all"); } }
      ]);
    },
    pickCramCount(range) {
      var self = this;
      this.confirm("速刷数量", "本轮快速过多少个词？", null, [
        { text: "30 词", cls: "btn-primary", fn: function () { self.startCram(range, 30); } },
        { text: "50 词", cls: "btn-ghost", fn: function () { self.startCram(range, 50); } },
        { text: "100 词", cls: "btn-plain", fn: function () { self.startCram(range, 100); } }
      ]);
    },
    async startCram(range, count) {
      var libId = this.currentLibId();
      var words = await this.wordsForRange(libId, range);
      if (range === "unlearned") words = this.orderWords(words.filter(this.inLearnScope, this));
      else words = shuffleArr(words);
      if (!words.length) { this.toast("该范围内暂无单词"); return; }
      words = words.slice(0, count);
      window.Test.open("cram", { lib: libId, words: words });
    },
    /* 掌握测试：范围 */
    pickTestRange() {
      var self = this;
      this._testRange = this._testRange || "all";
      this.confirm("掌握测试", "从哪个范围抽题？随机 20 词混合题型，检验当前掌握程度：", null, [
        { text: "本书随机", cls: "btn-primary", fn: function () { self.startTest("all"); } },
        { text: "已学过的词", cls: "btn-ghost", fn: function () { self.startTest("learned"); } },
        { text: "未学新词", cls: "btn-ghost", fn: function () { self.startTest("unlearned"); } },
        { text: "最近学的100词", cls: "btn-plain", fn: function () { self.startTest("recent"); } }
      ]);
    },
    async startTest(range) {
      this._testRange = range;
      var libId = this.currentLibId();
      var lib = this.libById(libId);
      var words = await this.wordsForRange(libId, range);
      if (!words.length) { this.toast("该范围内暂无单词"); return; }
      window.Test.open("quiz", { lib: libId, words: words, libWords: lib.words, count: 20 });
    },
    redoQuiz(libId) {
      var self = this;
      setTimeout(function () { self.startTest(self._testRange || "all"); }, 100);
    },
    /* 今日学习会话：当日队列与断点存于设置，退出后可继续 */
    async loadSession() {
      var s = DB.settings().session;
      if (!s) return null;
      if (s.date !== DB.today() || s.lib !== this.currentLibId()) { await this.clearSession(); return null; }
      if (s.idx >= s.queue.length) { await this.clearSession(); return null; }
      var lib = this.currentLib();
      var entries = s.queue.map(function (w) {
        return lib.words.find(function (e) { return e.w.toLowerCase() === w.toLowerCase(); }) || null;
      });
      if (entries.indexOf(null) >= 0) { await this.clearSession(); return null; }  // 词库内容变化，会话失效
      return { queue: entries, idx: s.idx, quizBatches: s.quizBatches || [] };
    },
    async saveSession(sess) {
      await DB.saveSettings({ session: {
        date: DB.today(), lib: this.currentLibId(),
        queue: sess.queue.map(function (e) { return typeof e === "string" ? e : e.w; }),
        idx: sess.idx, quizBatches: sess.quizBatches || []
      } });
    },
    async persistSession(idx, quizBatches) {
      var s = DB.settings().session;
      if (!s) return;
      s.idx = idx;
      s.quizBatches = quizBatches || [];
      await DB.saveSettings({ session: s });
    },
    async finishSession() {
      await DB.saveSettings({ session: null });
    },
    async clearSession() {
      await DB.saveSettings({ session: null });
    },
    async startToday() {
      var libId = this.currentLibId();
      var lib = this.libById(libId);
      var sess = await this.loadSession();
      if (!sess) {
        var t = await DB.todayStat();
        var remain = Math.max(0, this.settings.dailyNew - (t.newL || 0));
        if (remain <= 0) { this.startReview(); return; }
        var words = await this.newWordCandidates(libId, remain);
        if (!words.length) { this.startReview(); return; }
        sess = { queue: words, idx: 0, quizBatches: [] };
        await this.saveSession(sess);
      }
      window.Study.open("learn", { lib: libId, queue: sess.queue, idx: sess.idx, quizBatches: sess.quizBatches, libWords: lib.words });
    },
    async startReview() {
      var q = await this.dueQueue(this.currentLibId());
      if (!q.length) { this.toast("太棒了，当前没有需要复习的单词！"); return; }
      window.Study.open("review", { lib: this.currentLibId(), queue: q });
    },
    pickSpellSource() {
      var self = this;
      this.confirm("拼写练习", "选择要听写的单词范围：", null, [
        { text: "今日新学", cls: "btn-primary", fn: function () { self.startSpell("today"); } },
        { text: "生词本", cls: "btn-ghost", fn: function () { self.startSpell("favs"); } },
        { text: "学习中词汇", cls: "btn-plain", fn: function () { self.startSpell("learning"); } }
      ]);
    },
    async startSpell(source) {
      var libId = this.currentLibId();
      var lib = this.libById(libId);
      var entryMap = {};
      lib.words.forEach(function (w) { entryMap[w.w.toLowerCase()] = w; });
      var queue = [];
      if (source === "favs") {
        var favs = await DB.libFavs(libId);
        favs.forEach(function (f) { if (entryMap[f.w.toLowerCase()]) queue.push({ entry: entryMap[f.w.toLowerCase()] }); });
        if (!queue.length) { this.toast("生词本还是空的，先去收藏单词吧"); return; }
      } else {
        var progList = await DB.libProg(libId);
        var today = DB.today();
        var dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
        progList.forEach(function (p) {
          if (!entryMap[p.w.toLowerCase()] || !S.isLearned(p)) return;
          if (source === "today" && p.lastAt < dayStart.getTime()) return;
          if (source === "learning" && S.isMastered(p)) return;
          queue.push({ entry: entryMap[p.w.toLowerCase()] });
        });
        if (source === "today") queue = queue.filter(function (q) { return q.entry; });
        if (!queue.length) { this.toast("暂无可听写的单词"); return; }
        queue.sort(function (a, b) { return Math.random() - 0.5; });
        queue = queue.slice(0, 20);
      }
      window.Study.open("spell", { lib: libId, queue: queue });
    },

    async renderHome() {
      var lib = this.currentLib();
      var progList = await DB.libProg(lib.id);
      var total = lib.words.length;
      var learned = 0, mastered = 0;
      progList.forEach(function (p) { if (S.isLearned(p)) { learned++; if (S.isMastered(p)) mastered++; } });
      document.querySelector("#home-lib b").textContent = lib.name;
      var pct = total ? Math.round(learned / total * 100) : 0;
      document.getElementById("ring-pct").textContent = pct + "%";
      document.getElementById("ring-fg").setAttribute("stroke-dashoffset", String(251.3 * (1 - pct / 100)));
      document.getElementById("stat-new").textContent = total - learned;
      document.getElementById("stat-learning").textContent = learned - mastered;
      document.getElementById("stat-mastered").textContent = mastered;

      var t = await DB.todayStat();
      var remain = Math.max(0, this.settings.dailyNew - (t.newL || 0));
      var dueCount = (await this.dueQueue(lib.id)).length;
      document.getElementById("task-new").textContent = remain;
      document.getElementById("task-rev").textContent = dueCount;
      document.getElementById("task-done").textContent = (t.newL || 0) + (t.rev || 0);
      document.getElementById("streak-chip").textContent = "🔥 连续 " + (await this.streak()) + " 天";
      var btn = document.getElementById("btn-start");
      if (remain === 0 && dueCount === 0) {
        btn.textContent = "今日任务已完成 ✓"; btn.disabled = true;
      } else {
        btn.textContent = remain > 0 ? "开始学习" : "去复习"; btn.disabled = false;
      }
    },
    async streak() {
      var stats = await DB.all("stats");
      var has = {};
      stats.forEach(function (s) { if (dayActive(s)) has[s.date] = true; });
      var d = new Date(), n = 0;
      if (!has[fmt(d)]) d.setDate(d.getDate() - 1);   // 今天还没学则从昨天数
      while (has[fmt(d)]) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },

    /* ================= 词库页 ================= */
    bindLibs() {
      var self = this;
      document.getElementById("import-zone").onclick = function () { document.getElementById("import-file").click(); };
      document.getElementById("import-file").onchange = function (e) {
        var f = e.target.files[0];
        if (f) self.doImport(f);
        e.target.value = "";
      };
    },
    async renderLibs() {
      var self = this, cur = this.currentLibId();
      var html = "";
      Object.keys(this.libCache).forEach(function (id) {
        var lib = self.libCache[id];
        html += '<div class="card lib-item" data-id="' + esc(id) + '" style="cursor:pointer">' +
          '<div class="lib-badge" style="background:' + esc(lib.color) + '">' + esc((lib.short || "词").slice(0, 2)) + "</div>" +
          '<div class="li-main"><b>' + esc(lib.name) + (id === cur ? ' <span class="tag current-tag">使用中</span>' : "") + "</b>" +
          '<div class="sub" id="libn-' + esc(id) + '">' + lib.words.length + " 词" + (lib.custom ? " · 自定义导入" : "") + "</div></div>" +
          '<div class="lib-check">' + (id === cur
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="#3BAE7E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
            : "") + "</div></div>";
      });
      var list = document.getElementById("lib-list");
      list.innerHTML = html;
      Object.keys(this.libCache).forEach(function (id) { self.renderLibCount(id); });
      list.querySelectorAll(".lib-item").forEach(function (item) {
        item.onclick = function () { self.openWordlist(item.getAttribute("data-id")); };
      });
      this.renderRemoteLibs();
    },
    async renderRemoteLibs() {
      var box = document.getElementById("remote-lib-list");
      if (!box) return;
      try {
        var r = await fetch("https://raw.githubusercontent.com/beijiuting/leci-vocab/main/vocab-libs/catalog.json?t=" + Date.now(), { cache: "no-store" });
        if (!r.ok) throw new Error("目录读取失败");
        var cat = await r.json(), self = this;
        box.innerHTML = (cat.libraries || []).map(function (x) {
          return '<div class="remote-lib-row"><div><b>' + esc(x.name) + '</b><span>' + esc(x.license || "公开许可") + '</span></div><button class="btn btn-ghost" data-remote="' + esc(x.id) + '">下载</button></div>';
        }).join("") || '<div class="sub">暂无远程词库</div>';
        box.querySelectorAll("[data-remote]").forEach(function (btn) {
          btn.onclick = function () { self.downloadRemoteLib((cat.libraries || []).find(function (x) { return x.id === btn.getAttribute("data-remote"); }), btn); };
        });
      } catch (e) { box.innerHTML = '<div class="sub">暂时无法读取 GitHub 词库目录，请稍后重试</div>'; }
    },
    async downloadRemoteLib(item, btn) {
      if (!item) return;
      btn.disabled = true; btn.textContent = "下载中";
      try {
        var url = "https://raw.githubusercontent.com/beijiuting/leci-vocab/main/vocab-libs/" + encodeURIComponent(item.file) + "?t=" + Date.now();
        var r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("下载失败");
        var words = await r.json();
        if (!Array.isArray(words) || !words.length) throw new Error("词库为空");
        var id = "remote_" + item.id;
        await DB.put("libs", { id: id, name: item.name, short: item.short || "远程", color: "#8E6BF1", words: words, remote: true });
        await this.buildLibCache();
        this.toast("已下载「" + item.name + "」");
        this.renderLibs();
      } catch (e) { this.alert("下载失败", e.message || "无法读取远程词库"); }
      btn.disabled = false; btn.textContent = "下载";
    },
    async renderLibCount(id) {
      var list = await DB.libProg(id);
      var learned = 0;
      list.forEach(function (p) { if (S.isLearned(p)) learned++; });
      var el = document.getElementById("libn-" + id);
      if (el) el.textContent = this.libCache[id].words.length + " 词 · 已学 " + learned;
    },
    /* ================= 词表页 ================= */
    _wl: null, _listen: null, _wlScrollBound: false,
    openWordlist(libId) {
      var lib = this.libById(libId);
      if (!lib) return;
      this.stopListen();
      this._wl = { libId: libId, filter: "all", hideMean: false, page: 0, pool: [], progMap: {}, favSet: {} };
      this.go("wordlist");
    },
    async renderWordlist() {
      var self = this;
      var wl = this._wl;
      if (!wl || !this.libById(wl.libId)) { this.go("libs"); return; }
      var lib = this.libById(wl.libId);
      document.getElementById("wl-title").textContent = lib.name;
      var isCur = wl.libId === this.currentLibId();
      var headBtns = document.getElementById("wl-head-actions");
      var hh = "";
      if (!isCur) hh += '<button class="btn btn-ghost" id="wl-setcur" style="padding:6px 12px;font-size:12.5px">设为当前</button>';
      if (lib.custom) hh += '<button class="btn btn-danger" id="wl-del" style="padding:6px 12px;font-size:12.5px">删除</button>';
      headBtns.innerHTML = hh;
      if (!isCur) document.getElementById("wl-setcur").onclick = async function () {
        self.settings.currentLib = wl.libId;
        await DB.saveSettings({ currentLib: wl.libId });
        self.toast("已切换到「" + lib.name + "」");
        self.renderWordlist();
      };
      if (lib.custom) document.getElementById("wl-del").onclick = function () {
        self.confirm("删除词库", "确定删除「" + lib.name + "」？该词库的学习进度将一并删除。", async function () {
          await DB.del("libs", wl.libId);
          if (self.settings.currentLib === wl.libId) { self.settings.currentLib = "cet6"; await DB.saveSettings({ currentLib: "cet6" }); }
          self.toast("已删除");
          self._wl = null;
          self.go("libs");
        });
      };
      var progList = await DB.libProg(wl.libId);
      var map = {};
      progList.forEach(function (p) { map[p.w.toLowerCase()] = p; });
      wl.progMap = map;
      var favs = await DB.libFavs(wl.libId);
      var favSet = {};
      favs.forEach(function (f) { favSet[f.w.toLowerCase()] = true; });
      wl.favSet = favSet;
      this.bindWlControls();
      this.applyWlFilter();
    },
    bindWlControls() {
      var self = this, wl = this._wl;
      var seg = document.getElementById("wl-filter");
      seg.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-f") === wl.filter);
        b.onclick = function () {
          wl.filter = b.getAttribute("data-f");
          seg.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); });
          self.applyWlFilter();
        };
      });
      var eye = document.getElementById("wl-eye");
      eye.textContent = wl.hideMean ? "👁 显示释义" : "🙈 隐藏释义";
      eye.onclick = function () {
        wl.hideMean = !wl.hideMean;
        document.getElementById("wl-list").classList.toggle("hide-m", wl.hideMean);
        eye.textContent = wl.hideMean ? "👁 显示释义" : "🙈 隐藏释义";
      };
      document.getElementById("wl-back").onclick = function () { self.stopListen(); self._wl = null; self.go("libs"); };
      document.getElementById("wl-dock").querySelectorAll("button").forEach(function (b) {
        b.onclick = function () { self.dockAction(b.getAttribute("data-act")); };
      });
      var list = document.getElementById("wl-list");
      list.onclick = function (ev) {
        var row = ev.target.closest(".wl-row");
        if (!row) return;
        var e = wl.pool.find(function (x) { return x.w === row.getAttribute("data-w"); });
        if (e) self.showWord(e);
      };
      if (!this._wlScrollBound) {
        this._wlScrollBound = true;
        window.addEventListener("scroll", function () {
          if (!self._wl || !document.getElementById("page-wordlist").classList.contains("on")) return;
          if (window.innerHeight + window.scrollY > document.body.offsetHeight - 400) self.appendWlRows();
        });
      }
    },
    applyWlFilter() {
      var wl = this._wl;
      var lib = this.libById(wl.libId);
      var filter = wl.filter;
      wl.pool = lib.words.filter(function (e) {
        var p = wl.progMap[e.w.toLowerCase()];
        var learned = p && S.isLearned(p);
        if (filter === "new") return !learned;
        if (filter === "learning") return p && learned && !S.isMastered(p);
        if (filter === "mastered") return p && S.isMastered(p);
        if (filter === "fav") return !!wl.favSet[e.w.toLowerCase()];
        return true;
      });
      wl.page = 0;
      document.getElementById("wl-count").textContent = wl.pool.length + " 词";
      var list = document.getElementById("wl-list");
      list.innerHTML = "";
      this.appendWlRows();
    },
    appendWlRows() {
      var wl = this._wl;
      if (!wl) return;
      var start = wl.page * 100;
      if (start >= wl.pool.length) {
        document.getElementById("wl-more").style.display = "none";
        return;
      }
      var rows = wl.pool.slice(start, start + 100);
      var html = "";
      rows.forEach(function (e) {
        var p = wl.progMap[e.w.toLowerCase()];
        var fav = wl.favSet[e.w.toLowerCase()];
        var tag = "";
        if (fav) tag = '<span class="wl-tag f">★ 已标熟</span>';
        else if (p && S.isMastered(p)) tag = '<span class="wl-tag m">已掌握</span>';
        else if (p && S.isLearned(p)) {
          var nl = S.nextLabel(p);
          tag = '<span class="wl-tag l' + (nl === "待复习" ? " due" : "") + '">' + esc(nl || "学习中") + '</span>';
        }
        var m = (e.m || []).map(function (x) { return x[1]; }).join("；");
        html += '<div class="wl-row" data-w="' + esc(e.w) + '"><b>' + esc(e.w) + '</b><span class="wl-m">' + esc(m.slice(0, 32)) + '</span>' + tag + '</div>';
      });
      document.getElementById("wl-list").insertAdjacentHTML("beforeend", html);
      wl.page++;
      document.getElementById("wl-more").style.display = wl.page * 100 < wl.pool.length ? "" : "none";
    },
    async dockAction(act) {
      var wl = this._wl;
      var lib = this.libById(wl.libId);
      if (act === "cram") {
        var words = shuffleArr(lib.words).slice(0, 30);
        window.Test.open("cram", { lib: wl.libId, words: words });
      } else if (act === "listen") {
        this.toggleListen();
      } else if (act === "spell") {
        var pool = wl.pool.length ? wl.pool : lib.words;
        var ws = shuffleArr(pool).slice(0, 20);
        if (!ws.length) { this.toast("本书暂无单词"); return; }
        window.Study.open("spell", { lib: wl.libId, queue: ws.map(function (e) { return { entry: e }; }) });
      } else if (act === "export") {
        this.exportLib(wl.libId);
      }
    },
    /* 随身听：逐词朗读循环 */
    toggleListen() {
      if (this._listen) { this.stopListen(); return; }
      var wl = this._wl;
      var words = wl && wl.pool.length ? wl.pool.slice() : [];
      if (!words.length) { this.toast("本书暂无单词"); return; }
      this._listen = { words: words, idx: 0, playing: true };
      var btn = document.querySelector('#wl-dock button[data-act="listen"]');
      if (btn) { btn.classList.add("on"); btn.querySelector(".di").textContent = "⏹"; }
      this.playListen();
    },
    playListen() {
      var self = this, L = this._listen;
      if (!L || !L.playing) return;
      if (L.idx >= L.words.length) L.idx = 0;
      var e = L.words[L.idx];
      var list = document.getElementById("wl-list");
      if (list) {
        list.querySelectorAll(".wl-row.hl").forEach(function (x) { x.classList.remove("hl"); });
        var row = list.querySelector('.wl-row[data-w="' + e.w.replace(/"/g, "&quot;") + '"]');
        if (row) { row.classList.add("hl"); row.scrollIntoView({ block: "center", behavior: "smooth" }); }
      }
      this.speak(e.w, true, function () {
        if (!self._listen || !self._listen.playing) return;
        setTimeout(function () {
          if (self._listen && self._listen.playing) { self._listen.idx++; self.playListen(); }
        }, 650);
      });
    },
    stopListen() {
      if (!this._listen) return;
      this._listen.playing = false;
      this._listen = null;
      try { speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
      var list = document.getElementById("wl-list");
      if (list) list.querySelectorAll(".wl-row.hl").forEach(function (x) { x.classList.remove("hl"); });
      var btn = document.querySelector('#wl-dock button[data-act="listen"]');
      if (btn) { btn.classList.remove("on"); btn.querySelector(".di").textContent = "🎧"; }
    },
    exportLib(libId) {
      var lib = this.libById(libId);
      var lines = lib.words.map(function (w) {
        var m = (w.m || []).map(function (x) { return (x[0] || "") + (x[1] || ""); }).join("；");
        return w.w + "\t" + m;
      });
      var blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = lib.name + ".txt";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      this.toast("词书已导出（" + lib.words.length + " 词）");
    },

    /* ---------- 自定义词库导入 ---------- */
    async doImport(file) {
      var self = this;
      try {
        var text = await file.text();
        var words = parseImport(file.name, text.replace(/^\uFEFF/, ""));
        if (!words.length) { this.alert("导入失败", "没有解析到有效单词，请检查文件格式。"); return; }
        var seen = {}, uniq = [];
        words.forEach(function (w) {
          var k = w.w.toLowerCase();
          if (!k || seen[k]) return;
          seen[k] = 1; uniq.push(w);
        });
        var name = file.name.replace(/\.[^.]+$/, "");
        var id = "u_" + Date.now();
        await DB.put("libs", { id: id, name: name, color: "#8E6BF1", words: uniq });
        await this.buildLibCache();
        this.confirm("导入成功", "「" + name + "」共导入 " + uniq.length + " 个单词。是否立即切换到该词库？", async function () {
          self.settings.currentLib = id;
          await DB.saveSettings({ currentLib: id });
          self.refreshAll();
        });
      } catch (e) {
        this.alert("导入失败", "文件解析出错：" + e.message);
      }
    },

    /* ================= 统计 ================= */
    bindStats() {
      var self = this;
      document.getElementById("chart-seg").querySelectorAll("button").forEach(function (b) {
        b.onclick = function () {
          document.getElementById("chart-seg").querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
          self.renderChart(+b.getAttribute("data-n"));
        };
      });
      var calOffset = 0;
      document.getElementById("cal-prev").onclick = function () { calOffset--; self.renderCal(calOffset); };
      document.getElementById("cal-next").onclick = function () { calOffset++; self.renderCal(calOffset); };
      this._calOffset = 0;
      document.getElementById("dash-changelib").onclick = function () { self.go("libs"); };
    },
    async renderStats() {
      var stats = await DB.all("stats");
      var lib = this.currentLib();
      var libId = lib.id;
      var progList = await DB.libProg(libId);
      var learned = 0;
      progList.forEach(function (p) { if (S.isLearned(p)) learned++; });
      /* 正在学习卡 */
      var cover = document.getElementById("dash-cover");
      cover.textContent = lib.short || "词";
      cover.style.background = "linear-gradient(135deg," + lib.color + "," + lib.color + "CC)";
      document.getElementById("dash-libname").textContent = lib.name;
      document.getElementById("dash-total").textContent = lib.words.length;
      document.getElementById("dash-learned").textContent = learned;
      document.getElementById("dash-bar").style.width = (lib.words.length ? Math.round(learned / lib.words.length * 100) : 0) + "%";
      var favs = await DB.libFavs(libId);
      document.getElementById("dash-favn").textContent = favs.length;
      /* 概览：今日/累计 词次与时长 */
      var sumN = 0, sumR = 0, sumSecs = 0;
      stats.forEach(function (s) {
        sumN += s.newL || 0; sumR += s.rev || 0; sumSecs += s.secs || 0;
      });
      var today = await DB.todayStat();
      document.getElementById("ov-today").textContent = (today.newL || 0) + (today.rev || 0);
      document.getElementById("ov-total").textContent = sumN + sumR;
      document.getElementById("ov-todaymin").textContent = Math.round((today.secs || 0) / 60);
      document.getElementById("ov-totalmin").textContent = Math.round(sumSecs / 60);
      /* 周日历 + 连续签到 */
      var streak = await this.streak();
      document.getElementById("dash-streak").textContent = "🔥 连续签到 " + streak + " 天";
      var map = {};
      stats.forEach(function (s) { if (dayActive(s)) map[s.date] = true; });
      var monday = new Date();
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      var todayKey = fmt(new Date());
      var wk = "";
      for (var wi = 0; wi < 7; wi++) {
        var d = new Date(monday); d.setDate(monday.getDate() + wi);
        var key = fmt(d);
        wk += '<div><div class="wc-h">' + ["一", "二", "三", "四", "五", "六", "日"][wi] + '</div>' +
          '<div class="wc' + (map[key] ? " on" : "") + (key === todayKey ? " today" : "") + '">' + d.getDate() + "</div></div>";
      }
      document.getElementById("week-cal").innerHTML = wk;
      /* 正确率与学习天数 */
      var ok = 0, bad = 0, days = 0;
      stats.forEach(function (s) {
        ok += s.ok || 0; bad += s.bad || 0;
        if (dayActive(s)) days++;
      });
      document.getElementById("st-acc").textContent = (ok + bad ? Math.round(ok / (ok + bad) * 100) : 100) + "%";
      document.getElementById("st-days").textContent = days;
      this._stats = stats;
      this.renderChart(7);
      this.renderCal(0);
    },
    async renderChart(n) {
      var stats = this._stats || await DB.all("stats");
      var map = {};
      stats.forEach(function (s) { map[s.date] = s; });
      var days = [];
      for (var i = n - 1; i >= 0; i--) {
        var d = new Date(); d.setDate(d.getDate() - i);
        var key = fmt(d);
        var s = map[key];
        // 柱状图口径 = 当日全部学习动作（学新词 + 复习 + 测验答题），与打卡日历一致
        var v = s ? (s.newL || 0) + (s.rev || 0) + (s.ok || 0) + (s.bad || 0) : 0;
        days.push({ label: n <= 7 ? (d.getMonth() + 1) + "/" + d.getDate() : (d.getDate() === 1 || i === n - 1 ? (d.getMonth() + 1) + "/" + d.getDate() : String(d.getDate())),
                     v: v });
      }
      var max = Math.max.apply(null, days.map(function (d) { return d.v; }).concat([10]));
      document.getElementById("bar-chart").innerHTML = days.map(function (d) {
        var hh = Math.max(3, Math.round(d.v / max * 100));
        return '<div class="bwrap"><span class="bval">' + (d.v || "") + '</span>' +
          '<div class="bar' + (d.v ? "" : " empty") + '" style="height:' + hh + '%"></div>' +
          '<span class="blabel">' + d.label + "</span></div>";
      }).join("");
    },
    async renderCal(offset) {
      offset = offset || this._calOffset || 0;
      this._calOffset = offset;
      var stats = this._stats || await DB.all("stats");
      var map = {};
      stats.forEach(function (s) { if (dayActive(s)) map[s.date] = true; });
      var base = new Date(); base.setDate(1);
      base.setMonth(base.getMonth() + offset);
      var y = base.getFullYear(), m = base.getMonth();
      document.getElementById("cal-title").textContent = y + " 年 " + (m + 1) + " 月";
      var firstDow = (new Date(y, m, 1).getDay() + 6) % 7;   // 周一=0
      var daysInMonth = new Date(y, m + 1, 0).getDate();
      var todayKey = fmt(new Date());
      var html = ["一", "二", "三", "四", "五", "六", "日"].map(function (x) { return '<div class="cal-h">' + x + "</div>"; }).join("");
      for (var i = 0; i < firstDow; i++) html += "<div></div>";
      for (var d = 1; d <= daysInMonth; d++) {
        var key = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
        var cls = "d" + (map[key] ? " learnt" : "") + (key === todayKey ? " today" : "");
        html += '<div class="' + cls + '">' + d + "</div>";
      }
      document.getElementById("cal").innerHTML = html;
    },

    /* ================= 生词本 ================= */
    newFavBookDialog() {
      var self = this;
      var m = document.getElementById("mask"), modal = document.getElementById("modal");
      modal.innerHTML = '<h3>新建生词本</h3>' +
        '<input id="fb-name" class="fb-name-input" placeholder="例如：高频词 / 易混词" maxlength="10">' +
        '<div class="m-actions"><button class="btn btn-plain" id="fb-cancel">取消</button>' +
        '<button class="btn btn-primary" id="fb-ok">创建</button></div>';
      m.classList.add("on");
      var inp = document.getElementById("fb-name");
      inp.focus();
      document.getElementById("fb-cancel").onclick = function () { m.classList.remove("on"); };
      document.getElementById("fb-ok").onclick = async function () {
        var name = inp.value.trim();
        if (!name) { self.toast("请输入生词本名称"); return; }
        m.classList.remove("on");
        await self.createFavBook(name);
        self.renderFavs();
      };
    },
    deleteCurFavBook() {
      var self = this;
      var id = this.curFavBookId();
      var b = this.favBooks().find(function (x) { return x.id === id; });
      this.confirm("删除生词本", "删除「" + b.name + "」？其中的词汇将移入「" + this.favBooks().filter(function (x) { return x.id !== id; })[0].name + "」，不会丢失。", async function () {
        await self.deleteFavBook(id);
        self.renderFavs();
      });
    },
    bindFavs() {
      var self = this;
      document.getElementById("fb-del").onclick = function () { self.deleteCurFavBook(); };
      document.getElementById("fav-review").onclick = async function () {
        var libId = self.currentLibId();
        var lib = self.libById(libId);
        var entryMap = {};
        lib.words.forEach(function (w) { entryMap[w.w.toLowerCase()] = w; });
        var all = await DB.libFavs(libId);
        var curBook = self.curFavBookId();
        var favs = all.filter(function (f) { return (f.bookId || "default") === curBook; });
        var progList = await DB.libProg(libId);
        var progMap = {};
        progList.forEach(function (p) { progMap[p.w.toLowerCase()] = p; });
        var queue = [];
        favs.forEach(function (f) {
          var e = entryMap[f.w.toLowerCase()];
          if (e) queue.push({ entry: e, prog: progMap[f.w.toLowerCase()] || null });
        });
        if (!queue.length) { self.toast("生词本还是空的"); return; }
        window.Study.open("review", { lib: libId, queue: queue });
      };
      document.getElementById("fav-spell").onclick = function () { self.startSpell("favs"); };
    },
    async renderFavs() {
      var self = this, libId = this.currentLibId();
      var lib = this.libById(libId);
      await this.migrateFavs();
      var curBook = this.curFavBookId();
      /* 生词本切换 chips */
      var books = this.favBooks();
      var chips = '<div class="fb-chips" id="fb-chips">' + books.map(function (b) {
        return '<button class="fb-chip' + (b.id === curBook ? " on" : "") + '" data-id="' + esc(b.id) + '">' + esc(b.name) + '</button>';
      }).join("") + '<button class="fb-chip fb-add" id="fb-add">＋</button></div>';
      document.getElementById("fav-books").innerHTML = chips;
      document.getElementById("fb-chips").querySelectorAll(".fb-chip").forEach(function (b) {
        b.onclick = function () {
          if (b.id === "fb-add") {
            self.newFavBookDialog();
            return;
          }
          self.settings.curFavBook = b.getAttribute("data-id");
          DB.saveSettings({ curFavBook: self.settings.curFavBook });
          self.renderFavs();
        };
      });
      document.getElementById("fb-del").style.display = curBook === "default" ? "none" : "";
      var all = await DB.libFavs(libId);
      var favs = all.filter(function (f) { return (f.bookId || "default") === curBook; });
      var entryMap = {};
      lib.words.forEach(function (w) { entryMap[w.w.toLowerCase()] = w; });
      var list = document.getElementById("fav-list");
      if (!favs.length) {
        list.innerHTML = '<div class="empty-hint"><div class="big">☆</div>学习时点击右上角 ★ 收藏难词<br>它们会出现在这里</div>';
        return;
      }
      favs.sort(function (a, b) { return b.at - a.at; });
      list.innerHTML = favs.map(function (f) {
        var e = entryMap[f.w.toLowerCase()];
        var m = e ? (e.m || []).map(function (x) { return x[1]; }).join("；") : "";
        return '<div class="fav-item" data-w="' + esc(f.w) + '"><b>' + esc(f.w) + "</b><span class=\"fi-m\">" + esc(m.slice(0, 30)) + "</span>" +
          '<button class="snd small" data-snd="' + esc(f.w) + '">🔊</button></div>';
      }).join("");
      list.querySelectorAll(".fav-item").forEach(function (item) {
        item.onclick = function (ev) {
          if (ev.target.closest("button")) return;
          var e = entryMap[item.getAttribute("data-w").toLowerCase()];
          if (e) self.showWord(e);
        };
      });
      list.querySelectorAll("[data-snd]").forEach(function (btn) {
        btn.onclick = function (ev) { ev.stopPropagation(); self.speak(btn.getAttribute("data-snd"), true); };
      });
    },
    /* ================= 查词小卡片（点例句/派生词弹出） ================= */
    buildWordIndex() {
      var idx = {};
      Object.keys(this.libCache).forEach(function (id) {
        this.libCache[id].words.forEach(function (e) {
          var k = e.w.toLowerCase();
          if (!idx[k]) idx[k] = { libId: id, entry: e };
        });
      }, this);
      this._wordIndex = idx;
    },
    variantKeys(w) {
      var k = w.toLowerCase(), keys = [k];
      if (k.endsWith("ies")) keys.push(k.slice(0, -3) + "y");
      if (k.endsWith("es")) keys.push(k.slice(0, -2));
      if (k.endsWith("s")) keys.push(k.slice(0, -1));
      if (k.endsWith("ed")) { keys.push(k.slice(0, -2)); keys.push(k.slice(0, -1)); }
      if (k.endsWith("ing")) { keys.push(k.slice(0, -3)); keys.push(k.slice(0, -3) + "e"); }
      if (k.endsWith("er")) keys.push(k.slice(0, -2));
      if (k.endsWith("est")) keys.push(k.slice(0, -3));
      if (k.endsWith("ly")) keys.push(k.slice(0, -2));
      return keys;
    },
    lookupWord(w) {
      if (!this._wordIndex) this.buildWordIndex();
      var keys = this.variantKeys(w);
      for (var i = 0; i < keys.length; i++) {
        if (this._wordIndex[keys[i]]) return this._wordIndex[keys[i]];
      }
      return null;
    },
    querySheet(w) {
      var self = this;
      w = String(w).trim();
      if (!w) return;
      var hit = this.lookupWord(w);
      var e = hit ? hit.entry : null;
      var libShort = hit ? (this.libById(hit.libId) || {}).short : "";
      var snd = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
      var html = '<div class="qc-head"><b class="qc-word">' + esc(w) + '</b>' +
        (libShort ? '<span class="qc-level">' + esc(libShort) + '</span>' : "") +
        (e ? '<button class="qc-star" id="qc-star">' + (DB.get ? "" : "") + '☆</button>' : "") + '</div>' +
        '<div class="qc-phon">' + (e && e.us ? '<span class="qc-acc">美</span><span>/' + esc(e.us) + '/</span>' : "") +
        '<button class="snd small" id="qc-snd">' + snd + '</button></div>' +
        '<div class="qc-m">' + (e ? esc((e.m || []).map(function (m) { return (m[0] ? m[0] + " " : "") + m[1]; }).join("；")).slice(0, 60) : '<span style="color:var(--text-3)">词库中未收录该词</span>') + '</div>' +
        (e ? '<button class="qc-more" id="qc-more">查看详细释义 <i>›</i></button>' : "");
      var sheet = document.getElementById("qsheet");
      sheet.innerHTML = html;
      sheet.classList.add("on");
      document.getElementById("qc-overlay").classList.add("on");
      document.getElementById("qc-snd").onclick = function () { self.speak(w, true); };
      self.speak(w);
      var star = document.getElementById("qc-star");
      if (star) star.onclick = function () {
        self.toggleFav(self.currentLibId(), w);
        star.classList.toggle("on");
      };
      var more = document.getElementById("qc-more");
      if (more) more.onclick = function () { self.closeQuerySheet(); self.showWord(e); };
    },
    closeQuerySheet() {
      document.getElementById("qsheet").classList.remove("on");
      document.getElementById("qc-overlay").classList.remove("on");
    },

    showWord(e) {
      document.getElementById("modal").innerHTML =
        '<h3 style="font-size:26px">' + esc(e.w) + "</h3>" +
        '<div class="sub" style="margin-bottom:10px">' + (e.us ? "美 /" + esc(e.us) + "/　" : "") + (e.uk ? "英 /" + esc(e.uk) + "/" : "") + "</div>" +
        ((e.m || []).map(function (m) { return '<div class="m" style="padding:4px 0"><span class="p" style="color:var(--primary);font-weight:600;margin-right:8px">' + esc(m[0]) + "</span><span>" + esc(m[1]) + "</span></div>"; }).join("") || "") +
        ((e.s || []).map(function (s) { return '<div class="sent" style="margin-top:10px"><div class="en">' + esc(s[0]) + '</div><div class="cn">' + esc(s[1]) + "</div></div>"; }).join("")) +
        '<div class="m-actions"><button class="btn btn-ghost" id="m-snd">🔊 朗读</button><button class="btn btn-plain" onclick="document.getElementById(\'mask\').classList.remove(\'on\')">关闭</button></div>';
      document.getElementById("mask").classList.add("on");
      var self = this;
      document.getElementById("m-snd").onclick = function () { self.speak(e.w, true); };
    },

    /* ================= 设置/我的 ================= */
    bindMe() {
      var self = this;
      var daily = document.getElementById("set-daily");
      daily.value = this.settings.dailyNew;
      document.getElementById("set-daily-v").textContent = this.settings.dailyNew;
      daily.oninput = function () {
        document.getElementById("set-daily-v").textContent = daily.value;
        self.settings.dailyNew = +daily.value;
        DB.saveSettings({ dailyNew: +daily.value });
      };
      bindSeg("set-voice", this.settings.voice, async function (v) {
        self.settings.voice = v; await DB.saveSettings({ voice: v });
        self.speak("vocabulary", true);
      });
      bindSeg("set-auto", String(this.settings.autoSpeak), async function (v) {
        self.settings.autoSpeak = +v; await DB.saveSettings({ autoSpeak: +v });
      });
      bindSeg("set-order", this.settings.learnOrder || "book", async function (v) {
        self.settings.learnOrder = v; await DB.saveSettings({ learnOrder: v });
        self.toast(v === "freq" ? "新词将按 COCA 高频优先学习" : "新词将按词书顺序学习");
      });
      bindSeg("set-freq", this.settings.freqRange || "all", async function (v) {
        self.settings.freqRange = v; await DB.saveSettings({ freqRange: v });
        self.toast(v === "all" ? "学习范围：全部单词" : "学习范围：仅 COCA 前 " + v + " 高频词");
      });
      bindSeg("set-autofav", String(this.settings.autoFavWrong), async function (v) {
        self.settings.autoFavWrong = +v; await DB.saveSettings({ autoFavWrong: +v });
      });
      bindSeg("set-dark", String(this.settings.darkMode), async function (v) {
        self.settings.darkMode = v; await DB.saveSettings({ darkMode: v });
        self.applyDark();
      });
      document.getElementById("btn-export").onclick = async function () {
        var json = JSON.stringify(await DB.exportAll());
        var name = "乐词备份-" + DB.today().replace(/-/g, "") + ".json";
        /* 安卓壳：WebView 不支持 blob 下载与文件选择，走原生桥（剪贴板 + 下载目录） */
        if (window.NativeBackup && window.NativeBackup.save) {
          var res = "";
          try { res = window.NativeBackup.save(name, json) || ""; } catch (e) { /* 忽略 */ }
          self.toast(res || "已复制到剪贴板");
          return;
        }
        var blob = new Blob([json], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        var copied = false;
        try { await navigator.clipboard.writeText(json); copied = true; } catch (e) { /* 忽略 */ }
        self.toast(copied ? "已下载备份文件，内容也复制到了剪贴板" : "已下载备份文件");
      };
      document.getElementById("btn-import").onclick = function () { self.openImportDialog(); };
      document.getElementById("restore-file").onchange = async function (e) {
        var f = e.target.files[0];
        e.target.value = "";
        if (!f) return;
        try { self.applyImportText(await f.text()); }
        catch (err) { self.alert("导入失败", "文件解析出错"); }
      };
      document.getElementById("btn-wipe").onclick = function () {
        self.confirm("清空全部数据", "所有学习进度、生词本、统计和自定义词库都将被删除，且无法恢复。确定继续？", async function () {
          await DB.wipe();
          self.settings = { currentLib: "cet6", dailyNew: 20, voice: "us", autoSpeak: 1 };
          self.toast("已清空");
          self.refreshAll();
        });
      };
      var updateBtn = document.getElementById("btn-check-update");
      if (updateBtn) updateBtn.onclick = function () { self.checkForUpdates(true); };
    },
    /* 导入备份：安卓壳读剪贴板，网页可粘贴/选文件，统一校验后覆盖恢复 */
    openImportDialog() {
      var self = this;
      var isNative = !!(window.NativeBackup && window.NativeBackup.clip);
      var m = document.getElementById("mask"), modal = document.getElementById("modal");
      modal.innerHTML = "<h3>导入备份数据</h3>" +
        '<div class="sub" style="margin-bottom:10px">' + esc("粘贴之前导出的备份内容，导入后会覆盖当前全部数据。") + "</div>" +
        '<textarea id="imp-txt" class="imp-txt" placeholder="在此长按粘贴备份 JSON …"></textarea>' +
        '<div class="m-actions wrap">' +
        (isNative ? '<button class="btn btn-ghost" id="imp-clip">读剪贴板</button>' : "") +
        (!isNative ? '<button class="btn btn-ghost" id="imp-file">选择文件</button>' : "") +
        '<button class="btn btn-plain" id="imp-cancel">取消</button>' +
        '<button class="btn btn-primary" id="imp-go">导入</button></div>';
      m.classList.add("on");
      document.getElementById("imp-cancel").onclick = function () { m.classList.remove("on"); };
      if (isNative) {
        document.getElementById("imp-clip").onclick = function () {
          try { document.getElementById("imp-txt").value = window.NativeBackup.clip() || ""; } catch (e) { /* 忽略 */ }
        };
      } else {
        document.getElementById("imp-file").onclick = function () { document.getElementById("restore-file").click(); };
      }
      document.getElementById("imp-go").onclick = function () {
        self.applyImportText(document.getElementById("imp-txt").value.trim());
      };
    },
    async applyImportText(txt) {
      var self = this;
      if (!txt) { this.toast("还没有粘贴内容"); return; }
      var data;
      try { data = JSON.parse(txt); } catch (e) { this.alert("导入失败", "内容不是有效的备份 JSON"); return; }
      if (!data || data.app !== "vocab-app") { this.alert("导入失败", "不是本应用导出的备份文件"); return; }
      var when = data.exportedAt ? new Date(data.exportedAt).toLocaleString() : "未知";
      this.confirm("确认导入备份？",
        "备份时间 " + when + "，含进度 " + (data.progress || []).length + " 词、生词 " +
        (data.favorites || []).length + " 个、统计 " + (data.stats || []).length + " 天，导入将覆盖当前全部数据。",
        async function () {
          await DB.importAll(data);
          await DB.loadSettings();
          var s = DB.settings();
          self.settings = Object.assign(self.settings, s);
          self.settings._srs9 = 0;   // 备份可能是老版本导出的，强制重跑记忆曲线迁移
          await self.migrateSrs9();
          self.toast("备份已恢复");
          self.refreshAll();
        });
    },
    async renderMe() {
      document.getElementById("set-daily").value = this.settings.dailyNew;
      document.getElementById("set-daily-v").textContent = this.settings.dailyNew;
      syncSeg("set-voice", this.settings.voice);
      syncSeg("set-auto", String(this.settings.autoSpeak));
      syncSeg("set-order", this.settings.learnOrder || "book");
      syncSeg("set-freq", this.settings.freqRange || "all");
      syncSeg("set-autofav", String(this.settings.autoFavWrong));
      syncSeg("set-dark", String(this.settings.darkMode));
    },

    /* ================= 查单词（全局放大镜入口） ================= */
    openSearch() {
      var self = this;
      var m = document.getElementById("mask"), modal = document.getElementById("modal");
      modal.innerHTML = "<h3>查单词</h3>" +
        '<input id="sch-txt" class="sch-input" placeholder="输入要查询的单词…" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<div class="m-actions"><button class="btn btn-plain" id="sch-cancel">取消</button>' +
        '<button class="btn btn-primary" id="sch-go">查询</button></div>';
      m.classList.add("on");
      var inp = document.getElementById("sch-txt");
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 180);
      document.getElementById("sch-cancel").onclick = function () { m.classList.remove("on"); };
      document.getElementById("sch-go").onclick = function () {
        var w = inp.value.trim();
        if (!w) { self.toast("请先输入单词"); return; }
        m.classList.remove("on");
        self.querySheet(w);   // 查词小卡片为覆盖层，关闭后回到原界面
      };
      inp.onkeydown = function (e) {
        if (e.key === "Enter") { e.preventDefault(); document.getElementById("sch-go").click(); }
      };
    },

    /* ================= 通用弹窗/提示 ================= */
    confirm(title, text, onOk, actions, closeOnBg) {
      var self = this;
      var m = document.getElementById("mask"), modal = document.getElementById("modal");
      var acts = actions || [{ text: "取消", cls: "btn-plain", fn: null }, { text: "确定", cls: "btn-primary", fn: onOk }];
      modal.innerHTML = "<h3>" + esc(title) + "</h3>" + (text ? '<div class="sub" style="line-height:1.7">' + esc(text) + "</div>" : "") +
        '<div class="m-actions">' + acts.map(function (a, i) { return '<button class="btn ' + (a.cls || "btn-primary") + '" data-i="' + i + '">' + esc(a.text) + "</button>"; }).join("") + "</div>";
      m.classList.add("on");
      modal.querySelectorAll("[data-i]").forEach(function (btn) {
        btn.onclick = function () {
          m.classList.remove("on");
          var a = acts[+btn.getAttribute("data-i")];
          if (a && a.fn) a.fn();
        };
      });
      m.onclick = function (ev) {
        if (ev.target === m && !closeOnBg) m.classList.remove("on");
      };
    },
    alert(title, text) { this.confirm(title, text, null, [{ text: "我知道了", cls: "btn-primary" }]); },
    toast(msg) {
      var t = document.getElementById("toast");
      t.textContent = msg;
      t.classList.add("on");
      clearTimeout(this._toastT);
      this._toastT = setTimeout(function () { t.classList.remove("on"); }, 1800);
    }
  };

  function fmt(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function shuffleArr(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }
  /* 当天有任意学习动作（学新词/复习/测验答题）即视为打卡 */
  function dayActive(s) {
    return (s.newL || 0) + (s.rev || 0) + (s.ok || 0) + (s.bad || 0) > 0;
  }
  function bindSeg(id, cur, cb) {
    var seg = document.getElementById(id);
    seg.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === String(cur));
      b.onclick = function () {
        seg.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        cb(b.getAttribute("data-v"));
      };
    });
  }
  function syncSeg(id, cur) {
    var seg = document.getElementById(id);
    if (!seg) return;
    seg.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === String(cur));
    });
  }

  /* ---------- 导入格式解析 ---------- */
  var POS_RE = /^(n|v|vt|vi|adj|adv|prep|conj|pron|art|num|int|aux|abbr|phrase|phr|det|modal)\.?$/i;
  function parseImport(name, text) {
    var words = [];
    var isJson = /\.json$/i.test(name) || /^[\[{]/.test(text.trim());
    if (isJson) {
      var data = JSON.parse(text);
      if (!Array.isArray(data) && data && Array.isArray(data.words)) data = data.words;
      if (!Array.isArray(data)) throw new Error("JSON 应为数组");
      data.forEach(function (it) {
        if (typeof it === "string") { words.push({ w: it.trim(), us: "", uk: "", m: [] }); return; }
        if (!it || typeof it !== "object") return;
        var w = it.w || it.word || it.headWord;
        if (!w) return;
        var m = [];
        if (Array.isArray(it.m)) {
          it.m.forEach(function (x) {
            if (Array.isArray(x)) m.push([String(x[0] || ""), String(x[1] || "")]);
          });
        } else if (Array.isArray(it.trans)) {
          it.trans.forEach(function (t) { m.push([t && t.pos ? t.pos + "." : "", t && (t.tranCn || t.tran || t.cn || "")]); });
        } else if (it.meaning) m.push(["", String(it.meaning)]);
        else if (it.cn) m.push(["", String(it.cn)]);
        var s = it.s;
        if (!s && Array.isArray(it.sentences)) {
          s = it.sentences.map(function (x) {
            return Array.isArray(x) ? x : [x.e || x.sContent || x.en || "", x.c || x.sCn || x.cn || ""];
          });
        }
        var e = { w: String(w).trim(), us: it.us || it.usphone || "", uk: it.uk || it.ukphone || "", m: m.filter(function (x) { return x[1]; }) };
        if (s && s.length) e.s = s;
        words.push(e);
      });
      return words;
    }
    text.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || /^#|^\/\//.test(line)) return;
      var parts;
      if (line.indexOf("\t") >= 0) parts = line.split("\t");
      else if (line.indexOf(",") >= 0) parts = line.split(",");
      else if (line.indexOf(";") >= 0) parts = line.split(";");
      else parts = [line];
      parts = parts.map(function (s) { return s.trim(); }).filter(Boolean);
      if (!parts.length) return;
      var w = parts[0];
      if (!/^[a-zA-Z][a-zA-Z'\u2019\-\. ]*$/.test(w)) return;
      var m = [];
      if (parts.length >= 3 && POS_RE.test(parts[1])) {
        m.push([parts[1].replace(/\.?$/, ".").toLowerCase(), parts.slice(2).join("，")]);
      } else if (parts.length >= 2) {
        m.push(["", parts.slice(1).join("，")]);
      }
      words.push({ w: w, us: "", uk: "", m: m });
    });
    return words;
  }

  window.App = App;
  document.addEventListener("DOMContentLoaded", function () { App.init(); });
})();
