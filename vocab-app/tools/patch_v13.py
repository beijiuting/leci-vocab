# -*- coding: utf-8 -*-
"""六期补丁：多生词本 + 速刷改版 + finishWord 统计修复"""
import io

# ---------- app.js ----------
p = r"D:\Project\zcode\vocab-app\js\app.js"
t = io.open(p, encoding="utf-8").read()

# 1) settings 默认值
old = 'settings: { currentLib: "cet6", dailyNew: 20, voice: "us", autoSpeak: 1, darkMode: "0", autoFavWrong: 1, learnOrder: "shuffle", freqRange: "all" },'
new = 'settings: { currentLib: "cet6", dailyNew: 20, voice: "us", autoSpeak: 1, darkMode: "0", autoFavWrong: 1, learnOrder: "shuffle", freqRange: "all", favBooks: null, curFavBook: "default" },'
assert old in t, "settings"
t = t.replace(old, new)

# 2) init 迁移
old = """      this.initVoice();
      this.applyDark();"""
new = """      this.migrateFavs();
      this.initVoice();
      this.applyDark();"""
assert old in t; t = t.replace(old, new)

# 3) 多生词本方法（插在 toggleFav 前）
old = """    async toggleFav(libId, w) {"""
new = """    /* ================= 多生词本 ================= */
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
    },"""
assert old in t, "toggleFav"
t = t.replace(old, new)

# 4) autoFav 带归属
old = """    async autoFav(libId, w) {
      if (!this.settings.autoFavWrong) return;
      var ex = await DB.get("favorites", DB.progId(libId, w));
      if (!ex) await DB.put("favorites", { id: DB.progId(libId, w), lib: libId, w: w, at: Date.now() });
    },"""
new = """    async autoFav(libId, w) {
      if (!this.settings.autoFavWrong) return;
      var ex = await DB.get("favorites", DB.progId(libId, w));
      if (!ex) await DB.put("favorites", { id: DB.progId(libId, w), lib: libId, w: w, at: Date.now(), bookId: this.curFavBookId() });
    },"""
assert old in t; t = t.replace(old, new)

# 5) addManyFavs 带归属
old = """    async addManyFavs(libId, words) {
      var n = 0;
      for (var i = 0; i < words.length; i++) {
        var id = DB.progId(libId, words[i]);
        var ex = await DB.get("favorites", id);
        if (!ex) {
          await DB.put("favorites", { id: id, lib: libId, w: words[i], at: Date.now() });
          n++;
        }
      }
      this.toast(n ? "已把 " + n + " 个词加入生词本 ★" : "这些词都已在生词本中");
    },"""
new = """    async addManyFavs(libId, words) {
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
    },"""
assert old in t; t = t.replace(old, new)

# 6) renderFavs 按当前本子过滤 + 生词本 chips 渲染
old = """    async renderFavs() {
      var self = this, libId = this.currentLibId();
      var lib = this.libById(libId);
      var favs = await DB.libFavs(libId);"""
new = """    async renderFavs() {
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
      var favs = all.filter(function (f) { return (f.bookId || "default") === curBook; });"""
assert old in t, "renderFavs"
t = t.replace(old, new)

# 7) fav-review 按当前本子过滤
old = """        var favs = await DB.libFavs(libId);
        var progList = await DB.libProg(libId);"""
new = """        var all = await DB.libFavs(libId);
        var curBook = self.curFavBookId();
        var favs = all.filter(function (f) { return (f.bookId || "default") === curBook; });
        var progList = await DB.libProg(libId);"""
assert old in t; t = t.replace(old, new)

# 8) newFavBookDialog + 删除当前本子（插在 bindFavs 前）
old = """    /* ================= 生词本 ================= */
    bindFavs() {"""
new = """    /* ================= 生词本 ================= */
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
    bindFavs() {"""
assert old in t; t = t.replace(old, new)

# 9) bindFavs 里绑定删除按钮
old = """      document.getElementById("fav-review").onclick = async function () {"""
new = """      document.getElementById("fb-del").onclick = function () { self.deleteCurFavBook(); };
      document.getElementById("fav-review").onclick = async function () {"""
assert old in t; t = t.replace(old, new)

io.open(p, "w", encoding="utf-8").write(t)
print("app.js patched")

# ---------- study.js ----------
p2 = r"D:\Project\zcode\vocab-app\js\study.js"
s = io.open(p2, encoding="utf-8").read()

# 10) finishWord 补 newL
old = """  function finishWord(correct) {
    var entry = st.queue[st.idx];
    if (!st.knownMarked[entry.w]) A().seedProgress(st.lib, entry, correct);
    st.idx++;"""
new = """  function finishWord(correct) {
    var entry = st.queue[st.idx];
    if (!st.knownMarked[entry.w]) A().seedProgress(st.lib, entry, correct);
    A().addStat({ newL: 1 });   // 今日新词计数（逐词入档）
    st.idx++;"""
assert old in s, "finishWord"
s = s.replace(old, new)

# 11) 速刷改版：去翻面，一屏详情 + 三键；结束自动收藏
old = """  function cramInit(opts) {
    return {
      mode: "cram", lib: opts.lib, queue: opts.words.slice(), idx: 0,
      total: opts.words.length, flipped: false,
      cnt: { no: 0, mid: 0, ok: 0 }, unknown: [], faved: false,
      t0: Date.now(), curWord: "", dirty: false, finished: false
    };
  }
  function renderCram() {
    var entry = st.queue[st.idx];
    if (!entry) return renderCramDone();
    st.curWord = entry.w;
    var html = '<div class="study-top">' + topHTML("备考速刷", st.idx, st.total) + "</div><div class='study-body'>";
    if (!st.flipped) {
      html += '<div class="cram-word">' + (entry.syl && entry.syl.length >= 2
        ? entry.syl.map(function (s) { return '<span class="sy">' + esc(s) + '</span>'; }).join("")
        : esc(entry.w)) + "</div>" +
        '<div class="phon" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:12px;color:var(--text-2);font-size:15px">' +
        (entry.us ? "<span>/" + esc(entry.us) + "/</span>" : "") +
        '<button class="snd small" id="btn-csnd">' + sndSvg() + "</button></div>" +
        '<div class="cram-hint">想一想它的意思，再翻面对答案</div>' +
        '<div class="cram-flip"><button class="btn btn-primary btn-big" id="btn-flip" style="min-width:200px">翻面看释义</button></div>';
    } else {
      html += '<div class="cram-word" style="font-size:30px">' + esc(entry.w) + "</div>" +
        '<div class="cram-mean-wrap">' + detailHTML(entry) + "</div>" +
        '<div class="eval-btns">' +
        '<button class="btn ev-no" id="ev-no">😤 不认识</button>' +
        '<button class="btn ev-mid" id="ev-mid">🤔 模糊</button>' +
        '<button class="btn ev-ok" id="ev-ok">🙂 认识</button></div>';
    }
    html += "</div>";
    el.innerHTML = html;
    speak(entry.w);
    var cs = document.getElementById("btn-csnd");
    if (cs) cs.onclick = function () { speak(entry.w); };
    var flip = document.getElementById("btn-flip");
    if (flip) flip.onclick = function () { st.flipped = true; render(); };
    var no = document.getElementById("ev-no"), mid = document.getElementById("ev-mid"), ok = document.getElementById("ev-ok");
    if (no) no.onclick = function () { evalCram("no"); };
    if (mid) mid.onclick = function () { evalCram("mid"); };
    if (ok) ok.onclick = function () { evalCram("ok"); };
  }
  function evalCram(kind) {
    st.cnt[kind]++;
    if (kind === "no") st.unknown.push(st.queue[st.idx]);
    st.idx++; st.flipped = false; st.dirty = true;
    render();
  }
  function renderCramDone() {
    st.finished = true;
    el.innerHTML = '<div class="study-top">' + topHTML("备考速刷", 1, 1) + "</div>" +
      '<div class="study-body"><div class="done-wrap"><div class="big">⚡</div><h2>速刷完成！</h2>' +
      '<div class="done-nums"><div class="dn"><b>' + st.cnt.ok + "</b><span>认识</span></div>" +
      '<div class="dn"><b>' + st.cnt.mid + "</b><span>模糊</span></div>" +
      '<div class="dn"><b>' + st.cnt.no + "</b><span>不认识</span></div></div>" +
      (st.unknown.length
        ? '<button class="btn btn-ghost btn-block btn-big" id="btn-cfav" style="margin-bottom:12px">把 ' + st.unknown.length + ' 个生词加入生词本</button>'
        : "") +
      '<button class="btn btn-primary btn-block btn-big" id="btn-cfin">完成</button></div></div>';
    var cf = document.getElementById("btn-cfav");
    if (cf) cf.onclick = function () {
      A().addManyFavs(st.lib, st.unknown.map(function (e) { return e.w; }));
      cf.disabled = true; cf.textContent = "已加入生词本 ✓";
    };
    document.getElementById("btn-cfin").onclick = function () { end(); };
  }"""
new = """  /* 速刷：完整信息一屏展示（词/释义/例句/助记），底部三键直接自评 */
  function cramInit(opts) {
    return {
      mode: "cram", lib: opts.lib, queue: opts.words.slice(), idx: 0,
      total: opts.words.length,
      cnt: { no: 0, mid: 0, ok: 0 }, unknown: [], midList: [],
      t0: Date.now(), curWord: "", dirty: false, finished: false
    };
  }
  function renderCram() {
    var entry = st.queue[st.idx];
    if (!entry) return renderCramDone();
    st.curWord = entry.w;
    var html = '<div class="study-top">' + topHTML("备考速刷", st.idx, st.total) + "</div>" +
      '<div class="study-body"><div class="detail-card">' +
      '<div class="word-head">' + wordTitleHTML(entry) + '</div>' +
      phonHTML(entry) +
      detailHTML(entry, entry.w) +
      tabsHTML(entry) + '</div>' +
      '</div><div class="eval-btns">' +
      '<button class="btn ev-no" id="ev-no">😤 不认识</button>' +
      '<button class="btn ev-mid" id="ev-mid">🤔 模糊</button>' +
      '<button class="btn ev-ok" id="ev-ok">🙂 认识</button>';
    body = el; body.innerHTML = html;
    speak(entry.w);
    bindDetailExtras(entry);
    document.getElementById("ev-no").onclick = function () { evalCram("no"); };
    document.getElementById("ev-mid").onclick = function () { evalCram("mid"); };
    document.getElementById("ev-ok").onclick = function () { evalCram("ok"); };
  }
  function evalCram(kind) {
    st.cnt[kind]++;
    if (kind === "no") st.unknown.push(st.queue[st.idx]);
    if (kind !== "ok") st.midList.push(st.queue[st.idx]);
    st.idx++; st.dirty = true;
    render();
  }
  function renderCramDone() {
    st.finished = true;
    /* 模糊 + 不认识 自动加入当前生词本 */
    var toFav = st.unknown.concat(st.midList);
    var autoMsg = "";
    if (toFav.length) {
      A().addManyFavs(st.lib, toFav.map(function (e) { return e.w; }));
      autoMsg = '<div class="sub" style="margin-top:10px">⚡ 已自动把 ' + toFav.length + ' 个生词加入「' + esc(A().curFavBookName()) + '」</div>';
    }
    el.innerHTML = '<div class="study-top">' + topHTML("备考速刷", 1, 1) + "</div>" +
      '<div class="study-body"><div class="done-wrap"><div class="big">⚡</div><h2>速刷完成！</h2>' +
      autoMsg +
      '<div class="done-nums"><div class="dn"><b>' + st.cnt.ok + "</b><span>认识</span></div>" +
      '<div class="dn"><b>' + st.cnt.mid + "</b><span>模糊</span></div>" +
      '<div class="dn"><b>' + st.cnt.no + "</b><span>不认识</span></div></div>" +
      '<button class="btn btn-primary btn-block btn-big" id="btn-cfin" style="margin-top:16px">完成</button></div></div>';
    document.getElementById("btn-cfin").onclick = function () { end(); };
  }"""
assert old in s, "cram block"
s = s.replace(old, new)

io.open(p2, "w", encoding="utf-8").write(s)
print("study.js patched")
