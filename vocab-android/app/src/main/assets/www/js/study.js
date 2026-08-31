/* study.js —— 学习 / 复习 / 拼写 全屏流程
   学习流程（对齐不背单词）：自评卡（认识/模糊/忘记了）→ 详情卡（下一词/记错了）
   逐词即时入档 + 当日会话持久化（退出后从断点继续），每学满 5 词插入一次小测验 */
(function () {
  "use strict";

  var el, body, st = null;
  var SCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>';

  function A() { return window.App; }

  /* ---------- 工具 ---------- */
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
  function pick(arr, n, filter) {
    var pool = filter ? arr.filter(filter) : arr.slice();
    return shuffle(pool).slice(0, n);
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
  function speak(text, manual) {
    A().speak(text, manual);
  }
  function markEn(en, markWord) {
    var parts = en.split(/([A-Za-z][A-Za-z'\u2019\-]*)/);
    var re = markWord ? new RegExp("^" + markWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\w*)$", "i") : null;
    return parts.map(function (seg) {
      if (/^[A-Za-z][A-Za-z'\u2019\-]*$/.test(seg)) {
        var s = esc(seg);
        if (re && re.test(seg)) return "<mark>" + s + "</mark>";
        return '<span class="lw">' + s + '</span>';
      }
      return esc(seg);
    }).join("");
  }
  /* 详情卡内容：释义（词组虚线下划线）+ 例句（含真题徽标、整句朗读按钮） */
  function detailHTML(entry, markWord) {
    var means = (entry.m || []).map(function (m) {
      return '<div class="m"><span class="p">' + esc(m[0]) + '</span><span class="t">' + esc(m[1]) + '</span></div>';
    }).join("") || '<div class="m"><span style="color:var(--text-3)">暂无释义</span></div>';
    var sents = [];
    if (entry.rex) {
      sents.push(sentHTML(entry.rex[0], null, "真题 " + entry.rex[2], markWord));
    }
    (entry.s || []).forEach(function (s) {
      sents.push(sentHTML(s[0], s[1], null, markWord));
    });
    return '<div class="means">' + means + '</div>' + sents.join("");
  }
  function sentHTML(en, cn, badge, markWord) {
    return '<div class="sent">' +
      '<button class="sent-snd" data-snd="' + esc(en) + '" title="朗读例句">' + sndSvg() + '</button>' +
      (badge ? '<span class="src-badge">' + esc(badge) + '</span>' : "") +
      '<div class="en">' + markEn(en, markWord) + '</div>' +
      (cn ? '<div class="cn">' + esc(cn) + '</div>' : "") +
      '</div>';
  }
  /* 词组搭配 / 派生 / 词根 三面板（两行式：词条一行、释义完整换行） */
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
  /* 词标题：按音节分块着色助记发音拼写 */
  function wordTitleHTML(entry, cls) {
    if (entry.syl && entry.syl.length >= 2) {
      return '<div class="ww ' + (cls || "") + '">' + entry.syl.map(function (s) {
        return '<span class="sy">' + esc(s) + '</span>';
      }).join("") + '</div>';
    }
    return '<div class="ww ' + (cls || "") + '">' + esc(entry.w) + '</div>';
  }
  function phonHTML(entry) {
    return '<div class="phon"><span class="acc-chip">美</span>' +
      '<button class="snd small" id="btn-snd">' + sndSvg() + '</button>' +
      (entry.us ? '<span>/' + esc(entry.us) + '/</span>' : "") + '</div>';
  }
  function checkBadge(knewVal) {
    var cls = knewVal === "ok" ? "ok" : knewVal === "mid" ? "mid" : "no";
    return '<span class="ww-check ' + cls + '">' + (knewVal === "ok" ? "✓" : knewVal === "mid" ? "…" : "✕") + '</span>';
  }
  /* 测验/复习/拼写 顶部（进度条式） */
  function topHTML(title, done, total) {
    var pct = total ? Math.round(done / total * 100) : 0;
    return '<div class="study-top">' +
      '<div class="top-row"><button class="close" id="st-close">✕</button>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="cnt">' + done + "/" + total + "</span>" +
      '<button class="sch-btn" id="st-search" title="查单词">' + SCH_SVG + '</button></div></div>';
  }
  /* 学习顶部工具条：‹退出 x/y …… ↺ ☆ 熟 */
  function topbarHTML(posText, canUndo) {
    return '<div class="study-topbar">' +
      '<button class="tb-btn" id="tb-exit" title="退出学习">‹</button>' +
      '<span class="tb-pos">' + posText + '</span>' +
      '<span class="tb-sp"></span>' +
      (canUndo ? '<button class="tb-btn" id="tb-undo" title="重新自评">↺</button>' : "") +
      '<button class="tb-btn" id="tb-star" title="收藏">☆</button>' +
      '<button class="tb-btn tb-known" id="tb-known" title="标记为熟词">熟</button>' +
      '<button class="sch-btn" id="st-search" title="查单词">' + SCH_SVG + '</button>' +
      '</div>';
  }
  function bindTopbar(entry) {
    document.getElementById("tb-exit").onclick = function () { close(); };
    var undo = document.getElementById("tb-undo");
    if (undo) undo.onclick = function () {
      delete st.knewVal[entry.w];
      st.phase = "self";
      render();
    };
    var star = document.getElementById("tb-star");
    if (st.star[entry.w]) { star.textContent = "★"; star.classList.add("on"); }
    star.onclick = function () {
      st.star[entry.w] = !st.star[entry.w];
      star.textContent = st.star[entry.w] ? "★" : "☆";
      star.classList.toggle("on", st.star[entry.w]);
      A().toggleFav(st.lib, entry.w);
    };
    document.getElementById("tb-known").onclick = function () {
      A().markKnown(st.lib, entry.w);
      st.knownMarked[entry.w] = true;
      st.knewVal[entry.w] = "ok";
      A().toast("已标记为熟词，不再安排学习");
    };
  }
  /* 详情卡附加交互：查词 .lw、词组朗读、例句朗读、Tab 切换 */
  function bindDetailExtras(entry) {
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

  /* ==========================================================
     学习（当日会话：逐词入档 + 断点续学 + 每5词小测验）
     ========================================================== */
  function learnInit(opts) {
    return {
      mode: "learn", lib: opts.lib, libWords: opts.libWords || [],
      queue: opts.queue, idx: opts.idx || 0,
      quizBatches: opts.quizBatches || [],
      phase: (opts.idx || 0) >= opts.queue.length ? "alldone" : "self",
      knewVal: {}, knownMarked: {}, star: {},
      quizQueue: [], quizIdx: 0, quizTotal: 0, _batchNo: -1,
      reQueue: [], reTeach: false, teachIdx: 0,
      results: { ok: 0, total: 0 },
      dirty: false, finished: false,
      t0: Date.now(), curWord: ""
    };
  }

  function renderLearn() {
    if (st.idx >= st.queue.length && st.phase !== "alldone") st.phase = "alldone";
    if (st.phase === "self") return renderSelf();
    if (st.phase === "detail") return renderDetail();
    if (st.phase === "quiz") return renderQuiz();
    if (st.phase === "retea") return renderReteach();
    if (st.phase === "alldone") return renderAllDone();
  }

  /* 自评卡：看词回想，遮挡释义 */
  function renderSelf() {
    var entry = st.queue[st.idx];
    if (!entry) { goAllDone(); return; }
    st.curWord = entry.w;
    var html = topbarHTML((st.idx + 1) + "/" + st.queue.length, false) +
      '<div class="study-body"><div class="self-card">' +
      wordTitleHTML(entry) + phonHTML(entry) +
      '<div class="blur-lines"><span class="bl"></span><span class="bl short"></span></div>' +
      '<div class="self-hint">瞬间想起词义，选「认识」<br>思考后想起词义，选「模糊」</div></div>' +
      '</div><div class="act-keys">' +
      '<button id="ak-ok">认识</button><button id="ak-mid">模糊</button><button id="ak-no">忘记了</button>';
    body = el; body.innerHTML = html;
    speak(entry.w);
    bindTopbar(entry);
    document.getElementById("btn-snd").onclick = function () { speak(entry.w, true); };
    var pick = function (val) {
      st.knewVal[entry.w] = val;
      st.phase = "detail";
      st.dirty = true;
      render();
    };
    document.getElementById("ak-ok").onclick = function () { pick("ok"); };
    document.getElementById("ak-mid").onclick = function () { pick("mid"); };
    document.getElementById("ak-no").onclick = function () { pick("no"); };
  }

  /* 详情卡：完整释义 + 例句 + 三面板 + 下一词/记错了（逐词入档） */
  function renderDetail() {
    var entry = st.queue[st.idx];
    if (!entry) { goAllDone(); return; }
    st.curWord = entry.w;
    var knewVal = st.knewVal[entry.w] || "mid";
    var html = topbarHTML((st.idx + 1) + "/" + st.queue.length, true) +
      '<div class="study-body"><div class="detail-card">' +
      '<div class="word-head">' + checkBadge(knewVal) + wordTitleHTML(entry) + '</div>' +
      phonHTML(entry) +
      detailHTML(entry, entry.w) +
      tabsHTML(entry) + '</div>' +
      '</div><div class="act-keys two">' +
      '<button id="ak-next">下一词</button><button id="ak-wrong">记错了</button>';
    body = el; body.innerHTML = html;
    speak(entry.w);
    bindTopbar(entry);
    bindDetailExtras(entry);
    document.getElementById("btn-snd").onclick = function () { speak(entry.w, true); };
    document.getElementById("ak-next").onclick = function () { finishWord(true); };
    document.getElementById("ak-wrong").onclick = function () { finishWord(false); };
  }

  /* 逐词入档 + 会话保存 + 每5词插入小测验 */
  function finishWord(correct) {
    var entry = st.queue[st.idx];
    if (!st.knownMarked[entry.w]) A().seedProgress(st.lib, entry, correct);
    A().addStat({ newL: 1 });   // 今日新词计数（逐词入档）
    st.idx++;
    st.dirty = true;
    A().persistSession(st.idx, st.quizBatches);
    if (st.idx % 5 === 0) {
      var batchNo = st.idx / 5 - 1;
      if (st.quizBatches.indexOf(batchNo) < 0) {
        startQuiz(st.queue.slice(st.idx - 5, st.idx), batchNo);
        return;
      }
    }
    nextAfterWord();
  }
  function nextAfterWord() {
    if (st.idx >= st.queue.length) { goAllDone(); return; }
    st.phase = "self";
    render();
  }
  function goAllDone() {
    st.phase = "alldone";
    A().finishSession();
    render();
  }

  /* 每5词的小测验：4选1 英→中，答错先重讲再重测 */
  function startQuiz(batchWords, batchNo) {
    st.phase = "quiz";
    st.quizQueue = batchWords.slice();
    st._batchNo = batchNo;
    st.quizIdx = 0;
    st.quizTotal = st.quizQueue.length;
    st.reQueue = [];
    st.reTeach = false;
    st.teachIdx = 0;
    st.results = { ok: 0, total: 0 };
    render();
  }
  function renderQuiz() {
    var entry = st.quizQueue[st.quizIdx];
    if (!entry) {
      if (st.reQueue.length && !st.reTeach) {
        st.reTeach = true;
        st.teachIdx = 0;
        st.phase = "retea";
        return renderReteach();
      }
      if (st._batchNo >= 0 && st.quizBatches.indexOf(st._batchNo) < 0) st.quizBatches.push(st._batchNo);
      A().persistSession(st.idx, st.quizBatches);
      nextAfterWord();
      return;
    }
    var opts = makeOptions(entry, "e2c");
    var html = '<div class="study-top">' + topHTML("小测验", st.quizIdx, st.quizTotal) + "</div>" +
      '<div class="study-body"><div class="q-wrap"><span class="q-badge">看词选义</span>' +
      '<div class="q-title">' + (entry.syl && entry.syl.length >= 2
        ? entry.syl.map(function (s) { return '<span class="sy">' + esc(s) + '</span>'; }).join("")
        : esc(entry.w)) +
      (entry.us ? '<span class="phon">/' + esc(entry.us) + '/</span>' : "") + '</div></div>' +
      '<div class="q-hint">选出正确的释义</div><div class="opts">';
    opts.forEach(function (o, i) {
      html += '<button class="opt" data-i="' + i + '">' + esc(o.text) + '</button>';
    });
    html += '</div></div>';
    body = el; body.innerHTML = html;
    st.curWord = entry.w;
    speak(entry.w);

    var answered = false;
    Array.prototype.forEach.call(el.querySelectorAll(".opt"), function (btn) {
      btn.onclick = function () {
        if (answered) return;
        answered = true;
        var i = +btn.getAttribute("data-i");
        var correct = opts[i].correct;
        if (!st.reTeach) {
          st.results.total++;
          if (correct) st.results.ok++;
        }
        A().addStat({ ok: correct ? 1 : 0, bad: correct ? 0 : 1 });
        if (correct) {
          btn.classList.add("correct");
        } else {
          btn.classList.add("wrong");
          st.reQueue.push(entry);
          el.querySelectorAll(".opt")[opts.findIndex(function (o) { return o.correct; })].classList.add("correct");
        }
        setTimeout(function () { st.quizIdx++; st.dirty = true; render(); }, correct ? 550 : 900);
      };
    });
  }

  /* 答错重讲 */
  function renderReteach() {
    var entry = st.reQueue[st.teachIdx];
    if (!entry) {
      st.quizQueue = st.reQueue.slice();
      st.reQueue = [];
      st.quizIdx = 0;
      st.quizTotal = st.quizQueue.length;
      st.phase = "quiz";
      st.reTeach = true;
      return render();
    }
    var html =
      '<div class="study-topbar"><span class="tb-pos" style="margin-left:4px">再学一遍 · ' + (st.teachIdx + 1) + "/" + st.reQueue.length + '</span></div>' +
      '<div class="study-body"><div class="detail-card"><div class="word-head">' + wordTitleHTML(entry) + '</div>' +
      phonHTML(entry) +
      detailHTML(entry, entry.w) + tabsHTML(entry) + '</div>' +
      '</div><div class="act-keys two">' +
      '<button id="btn-next">记住了，继续</button>';
    body = el; body.innerHTML = html;
    st.curWord = entry.w;
    speak(entry.w);
    bindDetailExtras(entry);
    document.getElementById("btn-snd").onclick = function () { speak(entry.w, true); };
    document.getElementById("btn-next").onclick = function () { st.teachIdx++; st.dirty = true; render(); };
  }

  /* 本日队列学完 */
  function renderAllDone() {
    st.finished = true;
    el.innerHTML = '<div class="study-top">' + topHTML("学新词", 1, 1) + '</div>' +
      '<div class="study-body"><div class="done-wrap"><div class="big">🎉</div><h2>今日新词学完！</h2>' +
      "<div class='sub'>记得回头看看「待复习」，记忆需要重复</div>" +
      '<div class="done-nums"><div class="dn"><b>' + st.queue.length + "</b><span>本轮单词</span></div></div>" +
      '<button class="btn btn-primary btn-block btn-big" id="btn-finish" style="margin-top:20px">完成</button></div></div>';
    document.getElementById("btn-finish").onclick = function () { close(); };
  }

  /* ---------- 4选1 选项生成（附选项来源词条，答完可点选查看卡片） ---------- */
  function makeOptions(target, dir) {
    var libWords = st.libWords;
    var items = [];
    if (dir === "e2c") {
      var ans = meaningText(target) || "(暂无释义)";
      items.push({ text: ans, entry: target });
      pick(libWords, 12, function (e) { return e.w !== target.w && e.m && e.m.length; }).slice(0, 3)
        .forEach(function (e) { items.push({ text: meaningText(e, 26), entry: e }); });
      while (items.length < 4) items.push({ text: "(释义 " + items.length + ")", entry: null });
      items = shuffle(items);
      return items.map(function (it) { return { text: it.text, entry: it.entry, correct: it.text === ans }; });
    }
    items.push({ text: target.w, entry: target });
    pick(libWords, 12, function (e) { return e.w !== target.w; }).slice(0, 3)
      .forEach(function (e) { items.push({ text: e.w, entry: e }); });
    items = shuffle(items);
    return items.map(function (it) { return { text: it.text, entry: it.entry, correct: it.text === target.w }; });
  }

  /* ==========================================================
     复习：到期词 4选1（英→中 / 中→英 / 听音选词）
     ========================================================== */
  function reviewInit(opts) {
    var queue = opts.queue.map(function (item) {
      return { entry: item.entry, prog: item.prog, dir: pickDir(item.entry), retried: false };
    });
    return {
      mode: "review", lib: opts.lib, queue: queue, idx: 0,
      total: queue.length, ok: 0, bad: 0, answered: null, dirty: false, finished: false,
      t0: Date.now(), curWord: ""
    };
  }
  function pickDir(entry) {
    if (!entry.m || !entry.m.length) return "a2w";
    return Math.random() < 0.62 ? "e2c" : "c2e";
  }

  function renderReview() {
    var item = st.queue[st.idx];
    if (!item) return renderReviewDone();
    var entry = item.entry, dir = item.dir;
    var opts = makeOptions(entry, dir);
    item._opts = opts;
    var html = '<div class="study-top">' + topHTML("复习", st.idx, st.total) + "</div>";
    html += '<div class="study-body rev-body"><div id="rev-qhead">';
    if (dir === "e2c") {
      html += '<div class="q-wrap"><span class="q-badge">看词选义</span><div class="q-title">' + (entry.syl && entry.syl.length >= 2
        ? entry.syl.map(function (s) { return '<span class="sy">' + esc(s) + '</span>'; }).join("")
        : esc(entry.w)) +
        (entry.us ? '<span class="phon">/' + esc(entry.us) + '/</span>' : "") + "</div></div>" +
        '<div class="q-hint">选出正确的释义</div>';
    } else if (dir === "c2e") {
      html += '<div class="q-title" style="font-size:20px;line-height:1.6;padding:6px 10px">' + esc(meaningText(entry, 60)) + "</div>" +
        '<div class="q-hint">选出对应的单词</div>';
    } else {
      html += '<div style="text-align:center;margin-top:30px"><button class="snd" id="btn-snd2" style="width:64px;height:64px">' +
        sndSvg() + "</button>" +
        '<div class="q-hint" style="margin-top:16px">听发音，选出正确的单词</div></div>';
    }
    html += '</div>';
    html += '<div class="opts">';
    opts.forEach(function (o, i) { html += '<button class="opt" data-i="' + i + '">' + esc(o.text) + "</button>"; });
    html += "</div>";
    html += '<div id="rev-detail"></div></div>';
    body = el; body.innerHTML = html;
    el.classList.remove("answered");   // 新题：恢复可滚动的题面布局
    st.curWord = entry.w;

    if (dir === "e2c") speak(entry.w);
    else if (dir === "a2w") {
      setTimeout(function () { speak(entry.w); }, 300);
      var s2 = document.getElementById("btn-snd2"); if (s2) s2.onclick = function () { speak(entry.w, true); };
    }

    var answered = false;
    Array.prototype.forEach.call(el.querySelectorAll(".opt"), function (btn) {
      btn.onclick = function () {
        if (answered) return;
        answered = true;
        var i = +btn.getAttribute("data-i");
        var correct = opts[i].correct;
        if (correct) { btn.classList.add("correct"); st.ok++; }
        else {
          btn.classList.add("wrong"); st.bad++;
          var ci = opts.findIndex(function (o) { return o.correct; });
          el.querySelectorAll(".opt")[ci].classList.add("correct");
          btn.classList.add("shake");
        }
        A().reviewProgress(item, correct);
        A().addStat({ rev: 1, ok: correct ? 1 : 0, bad: correct ? 0 : 1 });
        if (!correct) A().autoFav(st.lib, entry.w);   // 错词自动收藏
        st.dirty = true;
        showRevDetail(item, correct);
      };
    });
  }

  function showRevDetail(item, correct, showEntry) {
    var d = document.getElementById("rev-detail");
    if (!d) return;
    var entry = showEntry || item.entry;
    var qh = document.getElementById("rev-qhead");
    if (qh) qh.style.display = "none";
    el.classList.add("answered");   // 题面固定不滚，详解装进独立小窗（内部滚动）
    d.innerHTML = '<div class="rev-win">' +
      '<div class="row spread"><div class="ww" style="font-size:26px">' + esc(entry.w) + "</div>" +
      '<button class="snd small" id="btn-snd3">' + sndSvg() + "</button></div>" +
      detailHTML(entry, entry.w) + "</div>" +
      '<div class="rev-foot"><div class="rev-tip">点击上方选项可切换查看对应单词</div>' +
      '<button class="btn btn-primary btn-block btn-big" id="btn-revnext" style="margin-top:12px">继续</button></div>';
    document.getElementById("btn-snd3").onclick = function () { speak(entry.w, true); };
    bindDetailExtras(entry);   // 例句朗读 / 词组朗读 / tab 切换 / 可点词查卡
    var win = d.querySelector(".rev-win");
    if (win) win.scrollTop = 0;   // 切换查看的词时回到小窗顶部
    document.getElementById("btn-revnext").onclick = function () {
      if (correct === false && !item.retried) {       // 答错的词本轮最后再来一次
        item.retried = true;
        st.queue.push({ entry: item.entry, prog: item.prog, dir: pickDir(item.entry), retried: true });
        st.total++;
      }
      st.idx++; st.answered = null; render();
    };
    bindOptCards(item);
  }
  /* 答题后：点击任意选项切换查看该词的卡片 */
  function bindOptCards(item) {
    Array.prototype.forEach.call(el.querySelectorAll(".opt"), function (btn) {
      btn.onclick = function () {
        var o = item._opts && item._opts[+btn.getAttribute("data-i")];
        if (!o || !o.entry) return;
        Array.prototype.forEach.call(el.querySelectorAll(".opt"), function (x) { x.classList.remove("picked"); });
        btn.classList.add("picked");
        showRevDetail(item, null, o.entry);
      };
    });
  }

  function renderReviewDone() {
    st.finished = true;
    var pct = st.ok + st.bad ? Math.round(st.ok / (st.ok + st.bad) * 100) : 100;
    el.innerHTML = '<div class="study-top">' + topHTML("复习", 1, 1) + "</div>" +
      '<div class="study-body"><div class="done-wrap"><div class="big">' + (pct >= 80 ? "🎉" : "💪") + "</div>" +
      "<h2>复习完成！</h2><div class='sub'>已按遗忘曲线排好每个词下次见面的时间，到点再来哦</div>" +
      '<div class="done-nums"><div class="dn"><b>' + (st.ok + st.bad) + "</b><span>复习单词</span></div>" +
      '<div class="dn"><b>' + pct + "%</b><span>正确率</span></div></div>" +
      '<button class="btn btn-primary btn-block btn-big" id="btn-finish">完成</button></div></div>';
    document.getElementById("btn-finish").onclick = function () { close(true); };
  }

  /* ==========================================================
     拼写练习
     ========================================================== */
  function spellInit(opts) {
    return {
      mode: "spell", lib: opts.lib, queue: opts.queue.slice(), idx: 0,
      total: opts.queue.length, ok: 0, bad: 0, input: "", hint: 0,
      checked: null, retried: {}, dirty: false, finished: false,
      t0: Date.now(), curWord: ""
    };
  }

  function renderSpell() {
    var item = st.queue[st.idx];
    if (!item) return renderSpellDone();
    var entry = item.entry || item;
    st.cur = entry;
    st.curWord = entry.w;
    if (st.checked === null) { st.input = ""; st.hint = 0; }
    var html = '<div class="study-top">' + topHTML("拼写练习", st.idx, st.total) + "</div>" +
      '<div class="study-body"><div style="text-align:center">' +
      '<button class="snd" id="btn-snds" style="width:56px;height:56px">' + sndSvg() + "</button></div>" +
      '<div class="spell-mean">' + (meaningText(entry, 60) || "根据发音拼写单词") + "</div>" +
      '<div style="display:flex;justify-content:center;margin:20px 0 8px">' +
      '<input id="spell-input" class="spell-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入单词">' +
      "</div>";
    if (st.checked === true) {
      html += '<div class="spell-word-reveal" style="color:var(--green)">✔ ' + esc(entry.w) + "</div>";
    } else if (st.checked === false) {
      html += '<div class="spell-word-reveal" style="color:var(--red)">✘ 正确拼写：' + esc(entry.w) + "</div>";
    }
    html += '<div style="max-width:340px;margin-top:14px">';
    if (st.checked === null) {
      html += '<div class="row" style="gap:10px">' +
        '<button class="btn btn-ghost" id="btn-hint" style="flex:1">提示一个字母</button>' +
        '<button class="btn btn-primary" id="btn-check" style="flex:1">检查</button></div>';
    } else {
      html += '<button class="btn btn-primary btn-block btn-big" id="btn-snext">下一个</button>';
    }
    html += "</div></div>";
    body = el; body.innerHTML = html;
    speak(entry.w);
    document.getElementById("btn-snds").onclick = function () { speak(entry.w, true); };

    var inp = document.getElementById("spell-input");
    if (st.checked === null) {
      inp.value = st.input;
      inp.oninput = function () { st.input = inp.value; };
      inp.onkeydown = function (e) { if (e.key === "Enter") document.getElementById("btn-check").click(); };
      inp.focus();
      document.getElementById("btn-hint").onclick = function () {
        var w = entry.w.toLowerCase(), v = st.input.toLowerCase();
        if (v.length < w.length) {
          st.input = w.slice(0, v.length + 1);
          inp.value = st.input; inp.focus();
        }
      };
      document.getElementById("btn-check").onclick = function () {
        var okc = st.input.trim().toLowerCase() === entry.w.toLowerCase();
        st.checked = okc;
        st.ok += okc ? 1 : 0; st.bad += okc ? 0 : 1;
        A().addStat({ ok: okc ? 1 : 0, bad: okc ? 0 : 1 });
        st.dirty = true;
        render();
      };
    } else {
      inp.disabled = true;
      inp.classList.add(st.checked ? "ok" : "bad");
      inp.value = st.input;   // 红框保留用户输入，正确拼写展示在下方
      if (st.checked) speak(entry.w);
      document.getElementById("btn-snext").onclick = function () {
        if (!st.checked && !st.retried[entry.w]) {
          st.retried[entry.w] = true;
          st.queue.push({ entry: entry });
          st.total++;
        }
        st.idx++; st.checked = null; render();
      };
    }
  }

  function renderSpellDone() {
    st.finished = true;
    var pct = st.ok + st.bad ? Math.round(st.ok / (st.ok + st.bad) * 100) : 100;
    el.innerHTML = '<div class="study-top">' + topHTML("拼写练习", 1, 1) + "</div>" +
      '<div class="study-body"><div class="done-wrap"><div class="big">' + (pct >= 80 ? "🎯" : "📝") + "</div>" +
      "<h2>听写完成！</h2>" +
      '<div class="done-nums"><div class="dn"><b>' + (st.ok + st.bad) + "</b><span>听写单词</span></div>" +
      '<div class="dn"><b>' + pct + "%</b><span>正确率</span></div></div>" +
      '<button class="btn btn-primary btn-block btn-big" id="btn-finish">完成</button></div></div>';
    document.getElementById("btn-finish").onclick = function () { close(); };
  }

  /* ---------- 打开/关闭 ---------- */
  function open(mode, opts) {
    el = document.getElementById("study");
    el.classList.add("on");
    document.getElementById("toast").style.display = "none";
    if (mode === "learn") st = learnInit(opts);
    else if (mode === "review") st = reviewInit(opts);
    else if (mode === "spell") st = spellInit(opts);
    if (!st.libWords || !st.libWords.length) {
      var lib = A().libById(st.lib);
      st.libWords = lib ? lib.words : [];
    }
    bindKeys();
    render();
  }

  /* 所有进度均已逐词/逐题实时保存，退出无需确认 */
  function close() {
    if (!st) return;   // 防御：无进行中会话时忽略
    try { throw new Error("trace"); } catch (e) { window.__closeStack = e.stack; }
    if (st.t0) {
      var secs = Math.round((Date.now() - st.t0) / 1000);
      if (secs > 3 && secs < 7200) A().addStat({ secs: secs });
    }
    st = null;
    unbindKeys();
    el.classList.remove("on");
    document.getElementById("toast").style.display = "";
    A().refreshAll();
  }

  /* ---------- 键盘快捷键（电脑端） ---------- */
  var keyBound = false;
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
  function onKey(e) {
    if (document.getElementById("qsheet").classList.contains("on") || document.getElementById("mask").classList.contains("on")) return;
    if (!st || !el || !el.classList.contains("on")) return;
    var tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    var k = e.key;
    if (k === "Escape") {
      var c = document.getElementById("st-close");
      if (c) c.click();
      else close();
      return;
    }
    if (k === " ") {
      e.preventDefault();
      if (st.curWord) speak(st.curWord, true);
      return;
    }
    if (k === "Enter") {
      var ids = ["btn-revnext", "btn-snext", "ak-next", "btn-next", "btn-continue", "btn-finish"];
      for (var i = 0; i < ids.length; i++) {
        var b = document.getElementById(ids[i]);
        if (b && b.offsetParent) { b.click(); return; }
      }
      return;
    }
    if (/^[1-4]$/.test(k)) {
      var opts = el.querySelectorAll(".opt");
      if (opts.length >= +k) { opts[+k - 1].click(); return; }
      var evs = el.querySelectorAll(".act-keys button");
      if (evs.length >= +k) { evs[+k - 1].click(); return; }
    }
  }

  /* ---------- 总渲染 ---------- */
  function render() {
    if (!st) return;
    if (st.mode === "learn") renderLearn();
    else if (st.mode === "review") renderReview();
    else if (st.mode === "spell") renderSpell();
    A().fitWord(el);
    var search = document.getElementById("st-search");
    if (search) search.onclick = function () { A().openSearch(); };
    var c = document.getElementById("st-close");
    if (c) c.onclick = function () { close(); };
  }

  window.Study = { open: open, close: close };
})();
