# -*- coding: utf-8 -*-
"""给 app.js 增加词表页逻辑（替换旧 libMenu/previewLib）"""
import io, re

p = r"D:\Project\zcode\vocab-app\js\app.js"
t = io.open(p, encoding="utf-8").read()

# speak 增加 onend 回调
old = """    speak(text, manual) {
      if (!text) return;
      if (!manual && !this.settings.autoSpeak) return;
      try {
        var lang = this.settings.voice === "uk" ? "en-GB" : "en-US";
        var u = new SpeechSynthesisUtterance(text);
        u.lang = lang; u.rate = 0.82;
        var match = this.voiceList.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(lang.toLowerCase()) === 0; });
        if (match.length) u.voice = match[0];
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      } catch (e) { /* 忽略 */ }
    },"""
new = """    speak(text, manual, onend) {
      if (!text) return;
      if (!manual && !this.settings.autoSpeak) return;
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
    },"""
assert old in t, "speak not found"
t = t.replace(old, new)

# 速刷其他范围也随机
old = """      var words = await this.wordsForRange(libId, range);
      if (range === "unlearned") words = this.orderWords(words.filter(this.inLearnScope, this));
      if (!words.length) { this.toast("该范围内暂无单词"); return; }
      words = words.slice(0, count);"""
new = """      var words = await this.wordsForRange(libId, range);
      if (range === "unlearned") words = this.orderWords(words.filter(this.inLearnScope, this));
      else words = shuffleArr(words);
      if (!words.length) { this.toast("该范围内暂无单词"); return; }
      words = words.slice(0, count);"""
assert old in t, "startCram not found"
t = t.replace(old, new)

# 用词表页方法替换旧 libMenu + previewLib
m = re.search(r"    libMenu\(id\) \{.*?\n    /\* ---------- 自定义词库导入 ---------- \*/", t, re.S)
assert m, "libMenu block not found"

newblock = """    /* ================= 词表页 ================= */
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
        else if (p && S.isLearned(p)) tag = '<span class="wl-tag l">学习中</span>';
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
        return w.w + "\\t" + m;
      });
      var blob = new Blob([lines.join("\\n")], { type: "text/plain;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = lib.name + ".txt";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      this.toast("词书已导出（" + lib.words.length + " 词）");
    },

    /* ---------- 自定义词库导入 ---------- */"""
t = t[:m.start()] + newblock + t[m.end():]

io.open(p, "w", encoding="utf-8").write(t)
print("wordlist methods added")
