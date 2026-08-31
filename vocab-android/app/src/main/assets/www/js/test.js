/* test.js —— 掌握度测试 + 备考速刷（与 study.js 共用 #study 全屏层，二者不会同时开启） */
(function () {
  "use strict";

  function A() { return window.App; }
  var el = null, body = null, st = null, keyBound = false;
  var SCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function meaningText(entry, max) {
    if (!entry || !entry.m || !entry.m.length) return "";
    var t = entry.m.map(function (m) { return (m[0] ? m[0] + " " : "") + m[1]; }).join("；");
    if (max && t.length > max) t = t.slice(0, max) + "…";
    return t;
  }
  function sndSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  }
  function speak(text) { A().speak(text); }
  function wordTitleHTML(entry) {
    if (entry.syl && entry.syl.length >= 2) {
      return '<div class="ww">' + entry.syl.map(function (s) {
        return '<span class="sy">' + esc(s) + '</span>';
      }).join("") + '</div>';
    }
    return '<div class="ww">' + esc(entry.w) + '</div>';
  }
  /* 详情（释义+例句带朗读+拆词助记），与 study.js 风格一致 */
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
  }
  function topHTML(title, done, total) {
    var pct = total ? Math.round(done / total * 100) : 0;
    return '<div class="top-row"><button class="close" id="st-close">✕</button>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="cnt">' + done + "/" + total + "</span>" +
      '<button class="sch-btn" id="st-search" title="查单词">' + SCH_SVG + '</button></div>';
  }

  /* ================= 掌握度测试 ================= */
  function quizInit(opts) {
    var libWords = opts.libWords;
    var words = shuffle(opts.words).slice(0, opts.count || 20);
    var queue = words.map(function (entry) { return makeQuestion(entry, libWords); });
    return {
      mode: "quiz", lib: opts.lib, libWords: libWords,
      queue: queue, idx: 0, total: queue.length,
      ok: 0, bad: 0, wrong: [], answered: false,
      t0: Date.now(), curWord: "", dirty: false, finished: false
    };
  }
  function makeQuestion(entry, libWords) {
    var hasMean = entry.m && entry.m.length;
    var sent = null, sentSrc = "";
    if (entry.rex) { sent = entry.rex[0]; sentSrc = entry.rex[2]; }
    else if (entry.s && entry.s.length) { sent = entry.s[0][0]; }
    var types = [];
    if (hasMean) { types.push("e2c", "e2c", "c2e"); }
    if (sent) { types.push("cloze"); }
    types.push("a2w");
    var type = types[Math.floor(Math.random() * types.length)];
    if (type === "cloze") {
      var re = new RegExp("(" + entry.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*)", "ig");
      if (!re.test(sent)) type = hasMean ? "e2c" : "a2w";
    }
    var opts = makeOpts(entry, type, libWords);
    return { entry: entry, type: type, opts: opts, sent: sent, sentSrc: sentSrc };
  }
  function makeOpts(entry, type, libWords) {
    var others = shuffle(libWords.filter(function (e) { return e.w !== entry.w; })).slice(0, 12);
    var ansText, texts;
    if (type === "e2c") {
      ansText = meaningText(entry) || "(暂无释义)";
      texts = [ansText].concat(others.slice(0, 3).map(function (e) { return meaningText(e, 26) || e.w; }));
    } else {
      ansText = entry.w;
      texts = [entry.w].concat(others.slice(0, 3).map(function (e) { return e.w; }));
    }
    texts = shuffle(texts);
    return texts.map(function (tx) { return { text: tx, correct: tx === ansText }; });
  }
  var TYPE_LABEL = { e2c: "看词选义", c2e: "看义选词", a2w: "听音辨词", cloze: "例句填空" };

  function renderQuiz() {
    var q = st.queue[st.idx];
    if (!q) return renderQuizDone();
    var entry = q.entry;
    st.curWord = entry.w;
    st.answered = false;
    var html = '<div class="study-top">' + topHTML("掌握测试", st.idx, st.total) + "</div><div class='study-body'><div class='q-wrap'>";
    html += '<span class="q-badge">' + TYPE_LABEL[q.type] + "</span>";
    if (q.type === "e2c") {
      html += '<div class="q-title">' + (entry.syl && entry.syl.length >= 2
        ? entry.syl.map(function (s) { return '<span class="sy">' + esc(s) + '</span>'; }).join("")
        : esc(entry.w)) +
        (entry.us ? '<span class="phon">/' + esc(entry.us) + '/</span>' : "") + "</div>" +
        '<div class="q-hint">选出正确的释义</div>';
    } else if (q.type === "c2e") {
      html += '<div class="q-title" style="font-size:20px;line-height:1.6;padding:6px 10px">' + esc(meaningText(entry, 60)) + "</div>" +
        '<div class="q-hint">选出对应的单词</div>';
    } else if (q.type === "a2w") {
      html += '<div style="text-align:center;margin-top:26px"><button class="snd" id="btn-qsnd" style="width:64px;height:64px">' + sndSvg() + "</button>" +
        '<div class="q-hint" style="margin-top:14px">听发音，选出正确的单词</div></div>';
    } else {
      var blanked = esc(q.sent).replace(new RegExp("(" + entry.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\w*)", "ig"), "<mark>____</mark>");
      html += '<div class="q-title" style="font-size:17px;line-height:1.9;padding:8px 4px">' + blanked + "</div>" +
        (q.sentSrc ? '<div class="q-hint">真题 ' + esc(q.sentSrc) + ' · 选词填空</div>' : '<div class="q-hint">选词填空</div>');
    }
    html += '</div><div class="opts">';
    q.opts.forEach(function (o, i) { html += '<button class="opt" data-i="' + i + '">' + esc(o.text) + "</button>"; });
    html += '</div><div id="q-detail"></div></div>';
    el.innerHTML = html;

    if (q.type !== "c2e") speak(entry.w);
    var qs = document.getElementById("btn-qsnd");
    if (qs) qs.onclick = function () { speak(entry.w); };

    Array.prototype.forEach.call(el.querySelectorAll(".opt"), function (btn) {
      btn.onclick = function () {
        if (st.answered) return;
        st.answered = true;
        var i = +btn.getAttribute("data-i");
        var correct = q.opts[i].correct;
        if (correct) { btn.classList.add("correct"); st.ok++; }
        else {
          btn.classList.add("wrong", "shake"); st.bad++;
          st.wrong.push(entry);
          var ci = q.opts.findIndex(function (o) { return o.correct; });
          el.querySelectorAll(".opt")[ci].classList.add("correct");
          if (entry.m && entry.m.length) speak(entry.w);
        }
        showQDetail(entry, correct);
      };
    });
  }
  function showQDetail(entry, correct) {
    var d = document.getElementById("q-detail");
    if (!d) return;
    d.innerHTML = '<div class="word-card" style="margin-top:18px;text-align:left;padding:22px">' +
      '<div class="row spread"><div class="ww" style="font-size:26px">' + esc(entry.w) + "</div>" +
      '<button class="snd small" id="btn-dsnd">' + sndSvg() + "</button></div>" +
      detailHTML(entry) + "</div>" +
      '<button class="btn btn-primary btn-block btn-big" id="btn-qnext" style="margin-top:16px">下一题</button>';
    d.scrollIntoView({ behavior: "smooth", block: "end" });
    document.getElementById("btn-dsnd").onclick = function () { speak(entry.w); };
    document.getElementById("btn-qnext").onclick = function () {
      st.idx++; st.dirty = true; render();
    };
  }
  function renderQuizDone() {
    st.finished = true;
    var total = st.ok + st.bad;
    var score = total ? Math.round(st.ok / total * 100) : 100;
    var con, face;
    if (score >= 90) { con = "掌握得非常扎实，保持住！"; face = "🏆"; }
    else if (score >= 75) { con = "掌握不错，查漏补缺就更稳了"; face = "🎉"; }
    else if (score >= 50) { con = "有基础，建议把错词加入生词本集中巩固"; face = "💪"; }
    else { con = "提升空间较大，建议先速刷一遍再逐批学习"; face = "📖"; }
    var C = 2 * Math.PI * 62;
    var visArc = Math.max(6, C * score / 100 - 16);   // 补偿圆头端帽的视觉延伸
    el.innerHTML = '<div class="study-top">' + topHTML("掌握测试", 1, 1) + "</div>" +
      '<div class="study-body"><div class="done-wrap" style="padding-top:10px">' +
      '<div class="score-ring"><svg width="150" height="150" viewBox="0 0 150 150">' +
      '<circle cx="75" cy="75" r="62" fill="none" stroke="var(--track)" stroke-width="12"/>' +
      '<circle cx="75" cy="75" r="62" fill="none" stroke="url(#scoreg)" stroke-width="12" stroke-linecap="round" ' +
      'stroke-dasharray="' + visArc + ' ' + C + '" stroke-dashoffset="-8"/>' +
      '<defs><linearGradient id="scoreg" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#4A7DF7"/><stop offset="1" stop-color="#6FB0FC"/></linearGradient></defs></svg>' +
      '<div class="sc-txt"><b>' + score + "</b><span>掌握得分</span></div></div>" +
      '<h2 style="margin-top:16px">' + face + " " + con + "</h2>" +
      '<div class="done-nums"><div class="dn"><b>' + total + "</b><span>测试词数</span></div>" +
      '<div class="dn"><b>' + st.ok + "</b><span>答对</span></div>" +
      '<div class="dn"><b>' + st.bad + "</b><span>答错</span></div></div>";
    if (st.wrong.length) {
      el.querySelector(".done-wrap").insertAdjacentHTML("beforeend",
        '<div class="card wrong-list" style="text-align:left;margin-top:6px;max-height:200px;overflow-y:auto">' +
        st.wrong.map(function (e) {
          return '<div class="wv"><b>' + esc(e.w) + '</b><span>' + esc(meaningText(e, 24)) + "</span></div>";
        }).join("") + "</div>");
    }
    el.querySelector(".done-wrap").insertAdjacentHTML("beforeend",
      '<div style="margin-top:18px">' +
      (st.wrong.length ? '<button class="btn btn-ghost btn-block btn-big" id="btn-favwrong" style="margin-bottom:12px">把 ' + st.wrong.length + " 个错词加入生词本</button>" : "") +
      '<button class="btn btn-primary btn-block btn-big" id="btn-redo" style="margin-bottom:12px">再测一次</button>' +
      '<button class="btn btn-plain btn-block" id="btn-qfin">完成</button></div>');
    var fw = document.getElementById("btn-favwrong");
    if (fw) fw.onclick = function () {
      A().addManyFavs(st.lib, st.wrong.map(function (e) { return e.w; }));
      fw.disabled = true; fw.textContent = "已加入生词本 ✓";
    };
    document.getElementById("btn-qfin").onclick = function () { end(); };
    document.getElementById("btn-redo").onclick = function () {
      A().redoQuiz(st.lib); end();
    };
  }

  /* ================= 备考速刷 ================= */
  function cramInit(opts) {
    return {
      mode: "cram", lib: opts.lib, queue: opts.words.slice(), idx: 0,
      total: opts.words.length, flipped: false,
      cnt: { no: 0, mid: 0, ok: 0 }, unknown: [], midList: [],
      t0: Date.now(), curWord: "", dirty: false, finished: false
    };
  }
  /* 速刷（仿不背单词）：正面只有单词，点击翻面才出释义/例句；背面详解装独立小窗内部滚动 */
  function renderCram() {
    var entry = st.queue[st.idx];
    if (!entry) return renderCramDone();
    st.curWord = entry.w;
    var html = '<div class="study-top">' + topHTML("备考速刷", st.idx + 1, st.total) + "</div>";
    if (!st.flipped) {
      html += '<div class="study-body cram-body"><div class="cram-face" id="btn-flip">' +
        wordTitleHTML(entry) +
        phonHTML(entry) +
        '<div class="tap-hint">点击卡片查看释义</div></div></div>';
    } else {
      html += '<div class="study-body cram-body">' +
        '<div class="cram-win-wrap"><div class="cram-win"><div class="detail-card">' +
        '<div class="word-head">' + wordTitleHTML(entry) + '</div>' +
        phonHTML(entry) +
        detailHTML(entry, entry.w) +
        tabsHTML(entry) + '</div></div></div>' +
        '<div class="eval-btns">' +
        '<button class="btn ev-no" id="ev-no">😤 不认识</button>' +
        '<button class="btn ev-mid" id="ev-mid">🤔 模糊</button>' +
        '<button class="btn ev-ok" id="ev-ok">🙂 认识</button></div></div>';
    }
    body = el; body.innerHTML = html;
    speak(entry.w);
    var snd = document.getElementById("btn-snd");
    if (snd) snd.onclick = function (ev) { ev.stopPropagation(); speak(entry.w, true); };
    if (st.flipped) {
      bindDetailExtras(entry);
      document.getElementById("ev-no").onclick = function () { evalCram("no"); };
      document.getElementById("ev-mid").onclick = function () { evalCram("mid"); };
      document.getElementById("ev-ok").onclick = function () { evalCram("ok"); };
    } else {
      document.getElementById("btn-flip").onclick = function () { st.flipped = true; render(); };
    }
  }
  function evalCram(kind) {
    st.cnt[kind]++;
    if (kind === "no") st.unknown.push(st.queue[st.idx]);
    if (kind === "mid") st.midList.push(st.queue[st.idx]);
    st.idx++; st.dirty = true; st.flipped = false;
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
    el.innerHTML = '<div class="study-top">' + topHTML("备考速刷", st.total, st.total) + "</div>" +
      '<div class="study-body"><div class="done-wrap"><div class="big">⚡</div><h2>速刷完成！</h2>' +
      autoMsg +
      '<div class="done-nums"><div class="dn"><b>' + st.cnt.ok + "</b><span>认识</span></div>" +
      '<div class="dn"><b>' + st.cnt.mid + "</b><span>模糊</span></div>" +
      '<div class="dn"><b>' + st.cnt.no + "</b><span>不认识</span></div></div>" +
      '<button class="btn btn-primary btn-block btn-big" id="btn-cfin" style="margin-top:16px">完成</button></div></div>';
    document.getElementById("btn-cfin").onclick = function () { end(); };
  }

  /* ================= 打开/关闭/键盘 ================= */
  function open(mode, opts) {
    el = document.getElementById("study");
    el.classList.add("on");
    document.getElementById("toast").style.display = "none";
    st = mode === "quiz" ? quizInit(opts) : cramInit(opts);
    bindKeys();
    render();
  }
  function end() {
    if (st && st.t0) {
      var secs = Math.round((Date.now() - st.t0) / 1000);
      if (secs > 3 && secs < 7200) A().addStat({ secs: secs });
    }
    if (st && st.mode === "quiz" && st.ok + st.bad > 0) A().addStat({ ok: st.ok, bad: st.bad });
    st = null;
    unbindKeys();
    el.classList.remove("on");
    document.getElementById("toast").style.display = "";
    A().refreshAll();
  }
  function close(force) {
    if (st && st.dirty && !st.finished) {
      A().confirm("确定要退出吗？", "退出后本轮记录已保存的部分不会丢失。", function () { end(); });
    } else end();
  }
  function onKey(e) {
    if (document.getElementById("qsheet").classList.contains("on") || document.getElementById("mask").classList.contains("on")) return;
    if (!st || !el || !el.classList.contains("on")) return;
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    var k = e.key;
    if (k === "Escape") { var c = document.getElementById("st-close"); if (c) c.click(); return; }
    if (k === " ") { e.preventDefault(); if (st.curWord) speak(st.curWord); return; }
    if (k === "Enter") {
      var ids = ["btn-qnext", "btn-flip", "btn-cfin", "btn-qfin"];
      for (var i = 0; i < ids.length; i++) {
        var b = document.getElementById(ids[i]);
        if (b && b.offsetParent) { b.click(); return; }
      }
      return;
    }
    if (/^[1-4]$/.test(k)) {
      var opts = el.querySelectorAll(".opt");
      if (opts.length >= +k) {
        var b2 = opts[+k - 1];
        if (b2 && !b2.disabled) b2.click();
        return;
      }
      var evs = el.querySelectorAll(".eval-btns .btn");
      if (evs.length >= +k) { evs[+k - 1].click(); return; }
    }
  }
  function bindKeys() {
    if (keyBound) return;
    keyBound = true;
    document.addEventListener("keydown", onKey);
  }
  function unbindKeys() {
    if (!keyBound) return;
    keyBound = false;
    document.removeEventListener("keydown", onKey);
  }

  function render() {
    if (!st || !el) return;
    if (st.mode === "quiz") renderQuiz(); else renderCram();
    A().fitWord(el);
    var search = document.getElementById("st-search");
    if (search) search.onclick = function () { A().openSearch(); };
    var c = document.getElementById("st-close");
    if (c) c.onclick = function () { close(); };
  }

  window.Test = { open: open };
})();
