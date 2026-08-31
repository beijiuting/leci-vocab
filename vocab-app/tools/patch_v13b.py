# -*- coding: utf-8 -*-
"""六期补丁(修正)：study.js finishWord 统计 + test.js 速刷改版"""
import io

# ---------- study.js：finishWord 补 newL ----------
p = r"D:\Project\zcode\vocab-app\js\study.js"
s = io.open(p, encoding="utf-8").read()
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
io.open(p, "w", encoding="utf-8").write(s)
print("study.js finishWord patched")

# ---------- test.js：速刷改版 ----------
p2 = r"D:\Project\zcode\vocab-app\js\test.js"
t = io.open(p2, encoding="utf-8").read()

old = """  function cramInit(opts) {
    return {
      mode: "cram", lib: opts.lib, queue: opts.words.slice(), idx: 0,
      total: opts.words.length, flipped: false,
      cnt: { no: 0, mid: 0, ok: 0 }, unknown: [], faved: false,
      t0: Date.now(), curWord: "", dirty: false, finished: false
    };
  }"""
new = """  function cramInit(opts) {
    return {
      mode: "cram", lib: opts.lib, queue: opts.words.slice(), idx: 0,
      total: opts.words.length,
      cnt: { no: 0, mid: 0, ok: 0 }, unknown: [], midList: [],
      t0: Date.now(), curWord: "", dirty: false, finished: false
    };
  }"""
assert old in t, "cramInit"
t = t.replace(old, new)

old = """  function renderCram() {
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
      html += '<div class="cram-word" style="font-size:30px;margin-top:6px">' + esc(entry.w) + "</div>" +
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
assert old in t, "renderCram block"
t = t.replace(old, new)

# test.js 需要 phonHTML/tabsHTML/bindDetailExtras/detailHTML（已有 detailHTML 简版无 tabs/phon）——补齐
old = """  /* 简版详情（释义+例句+助记），与 study.js 风格一致 */
  function detailHTML(entry) {
    var means = (entry.m || []).map(function (m) {
      return '<div class="m"><span class="p">' + esc(m[0]) + '</span><span>' + esc(m[1]) + '</span></div>';
    }).join("") || '<div class="m"><span style="color:var(--text-3)">暂无释义</span></div>';
    var sents = [];
    if (entry.rex) sents.push('<div class="sent"><span class="src-badge">真题 ' + esc(entry.rex[2]) + '</span><div class="en">' + esc(entry.rex[0]) + '</div></div>');
    (entry.s || []).forEach(function (s) {
      sents.push('<div class="sent"><div class="en">' + esc(s[0]) + '</div><div class="cn">' + esc(s[1]) + '</div></div>');
    });
    var mnem = "";
    var chips = [];
    (entry.rel || []).forEach(function (r) {
      if (r[0]) chips.push('<span class="chip"><span class="pd">' + esc(r[1]) + '</span><b>' + esc(r[0]) + '</b>' + esc(r[2]) + '</span>');
    });
    if (entry.rem) mnem += '<div class="rem">💡 ' + esc(entry.rem) + '</div>';
    if (chips.length) mnem += '<div class="chips">' + chips.join("") + '</div>';
    if (mnem) mnem = '<div class="mnem"><div class="mn-title">🧩 拆词助记</div>' + mnem + '</div>';
    return '<div class="means">' + means + '</div>' + sents.join("") + mnem;
  }"""
new = """  /* 详情（释义+例句带朗读+拆词助记），与 study.js 风格一致 */
  function detailHTML(entry) {
    var means = (entry.m || []).map(function (m) {
      return '<div class="m"><span class="p">' + esc(m[0]) + '</span><span class="t">' + esc(m[1]) + '</span></div>';
    }).join("") || '<div class="m"><span style="color:var(--text-3)">暂无释义</span></div>';
    var sents = [];
    if (entry.rex) sents.push(sentHTML(entry.rex[0], null, "真题 " + entry.rex[2]));
    (entry.s || []).forEach(function (s) {
      sents.push(sentHTML(s[0], s[1], null));
    });
    var mnem = "";
    var chips = [];
    (entry.rel || []).forEach(function (r) {
      if (r[0]) chips.push('<span class="chip"><span class="pd">' + esc(r[1]) + '</span><b>' + esc(r[0]) + '</b>' + esc(r[2]) + '</span>');
    });
    if (entry.rem) mnem += '<div class="rem">💡 ' + esc(entry.rem) + '</div>';
    if (chips.length) mnem += '<div class="chips">' + chips.join("") + '</div>';
    if (mnem) mnem = '<div class="mnem"><div class="mn-title">🧩 拆词助记</div>' + mnem + '</div>';
    return '<div class="means">' + means + '</div>' + sents.join("") + mnem;
  }
  function sentHTML(en, cn, badge) {
    return '<div class="sent">' +
      '<button class="sent-snd" data-snd="' + esc(en) + '" title="朗读例句">' + sndSvg() + '</button>' +
      (badge ? '<span class="src-badge">' + esc(badge) + '</span>' : "") +
      '<div class="en">' + esc(en) + '</div>' +
      (cn ? '<div class="cn">' + esc(cn) + '</div>' : "") +
      '</div>';
  }
  function phonHTML(entry) {
    return '<div class="phon"><span class="acc-chip">美</span>' +
      '<button class="snd small" id="btn-snd">' + sndSvg() + '</button>' +
      (entry.us ? '<span>/' + esc(entry.us) + '/</span>' : "") + '</div>';
  }
  function tabsHTML(entry) {
    var tabs = [], panels = {};
    if (entry.phr && entry.phr.length) {
      tabs.push(["phr", "词组搭配"]);
      panels.phr = entry.phr.map(function (ph) {
        return '<div class="dt-item"><div class="dt-word"><span class="phr-line" data-snd-phr="' + esc(ph[0]) + '">' + esc(ph[0]) + '</span></div>' +
          '<div class="dt-cn">' + esc(ph[1]) + '</div></div>';
      }).join("");
    }
    if (entry.rel && entry.rel.length) {
      tabs.push(["rel", "派生"]);
      panels.rel = entry.rel.map(function (r) {
        return '<div class="dt-item"><div class="dt-word"><span class="pd">' + esc(r[1]) + '</span><span class="lw" data-word="' + esc(r[0]) + '"><b>' + esc(r[0]) + '</b></span></div>' +
          '<div class="dt-cn">' + esc(r[2]) + '</div></div>';
      }).join("");
    }
    if ((entry.morph && entry.morph.length) || entry.rem) {
      tabs.push(["root", "词根"]);
      var inner = "";
      if (entry.morph) {
        inner += '<div class="morph-row">' + entry.morph.map(function (b) {
          var typeName = { "1": "前缀", "2": "词根", "3": "后缀" }[b[1]] || "";
          return '<span class="mp t' + b[1] + '"><b>' + esc(b[0]) + '</b><span>' + esc(b[2] || typeName) + '</span></span>';
        }).join("") + '</div>';
      }
      if (entry.rem) inner += '<div class="rem">💡 ' + esc(entry.rem) + '</div>';
      panels.root = inner;
    }
    if (!tabs.length) return "";
    var head = '<div class="dt-tabs">' + tabs.map(function (tb, i) {
      return '<button data-tab="' + tb[0] + '"' + (i === 0 ? ' class="on"' : "") + '>' + tb[1] + '</button>';
    }).join("") + '</div>';
    var body = tabs.map(function (tb, i) {
      return '<div class="dt-panel" data-panel="' + tb[0] + '"' + (i === 0 ? "" : ' style="display:none"') + '>' + panels[tb[0]] + '</div>';
    }).join("");
    return '<div class="det-tabs" id="det-tabs">' + head + body + '</div>';
  }
  function bindDetailExtras() {
    Array.prototype.forEach.call(el.querySelectorAll(".lw"), function (node) {
      node.onclick = function () { A().querySheet(node.getAttribute("data-word") || node.textContent); };
    });
    Array.prototype.forEach.call(el.querySelectorAll("[data-snd-phr]"), function (node) {
      node.onclick = function () { speak(node.getAttribute("data-snd-phr"), true); };
    });
    Array.prototype.forEach.call(el.querySelectorAll(".sent-snd"), function (node) {
      node.onclick = function () { speak(node.getAttribute("data-snd"), true); };
    });
    var tabs = document.getElementById("det-tabs");
    if (tabs) {
      tabs.querySelectorAll(".dt-tabs button").forEach(function (b) {
        b.onclick = function () {
          tabs.querySelectorAll(".dt-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
          tabs.querySelectorAll(".dt-panel").forEach(function (pn) {
            pn.style.display = pn.getAttribute("data-panel") === b.getAttribute("data-tab") ? "" : "none";
          });
        };
      });
    }
  }"""
assert old in t, "detailHTML"
t = t.replace(old, new)

io.open(p2, "w", encoding="utf-8").write(t)
print("test.js cram rewritten")
