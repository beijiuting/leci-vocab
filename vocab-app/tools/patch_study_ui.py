# -*- coding: utf-8 -*-
"""study.js 学习流程改版：自评卡 + 详情卡 + 顶部工具条 + 底部Tab + 查词联动"""
import io, re

p = r"D:\Project\zcode\vocab-app\js\study.js"
t = io.open(p, encoding="utf-8").read()

# 1) learnInit：新状态字段
old = """  function learnInit(opts) {
    var lib = opts.lib, words = opts.words;
    return {
      mode: "learn", lib: lib, libWords: opts.libWords || [],
      batches: chunk(words, BATCH), batchIdx: 0,
      phase: "teach", teachIdx: 0, knew: {},
      quizQueue: [], reQueue: [], reTeach: false,
      quizIdx: 0, results: { ok: 0, total: 0 },
      dirty: false, finished: false, star: {},
      t0: Date.now(), curWord: ""
    };
  }"""
new = """  function learnInit(opts) {
    var lib = opts.lib, words = opts.words;
    return {
      mode: "learn", lib: lib, libWords: opts.libWords || [],
      batches: chunk(words, BATCH), batchIdx: 0,
      phase: "teach", teachIdx: 0, knew: {}, knewVal: {}, knownMarked: {},
      teachDetail: false,
      quizQueue: [], reQueue: [], reTeach: false,
      quizIdx: 0, results: { ok: 0, total: 0 },
      dirty: false, finished: false, star: {},
      t0: Date.now(), curWord: ""
    };
  }"""
assert old in t, "learnInit"
t = t.replace(old, new)

# 2) markEn：全句英文词可点 + 目标词橙色高亮
old_start = t.index("  function markEn(en, markWord) {")
old_end = t.index("  /* 拆词助记区块", old_start)
new_mark = """  function markEn(en, markWord) {
    var parts = en.split(/([A-Za-z][A-Za-z'\\u2019\\-]*)/);
    var re = markWord ? new RegExp("^" + markWord.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&") + "(\\\\w*)$", "i") : null;
    return parts.map(function (seg) {
      if (/^[A-Za-z][A-Za-z'\\u2019\\-]*$/.test(seg)) {
        var s = esc(seg);
        if (re && re.test(seg)) return "<mark>" + s + "</mark>";
        return '<span class="lw">' + s + '</span>';
      }
      return esc(seg);
    }).join("");
  }
"""
t = t[:old_start] + new_mark + t[old_end:]

# 3) detailHTML：释义虚线 + 例句 + 不再内嵌 mnem（移到底部Tab）
old = """  function detailHTML(entry, markWord) {
    var means = (entry.m || []).map(function (m) {
      return '<div class="m"><span class="p">' + esc(m[0]) + '</span><span>' + esc(m[1]) + '</span></div>';
    }).join("") || '<div class="m"><span style="color:var(--text-3)">暂无释义</span></div>';
    var sents = [];
    if (entry.rex) {
      sents.push('<div class="sent"><span class="src-badge">真题 ' + esc(entry.rex[2]) + '</span><div class="en">' + markEn(entry.rex[0], markWord) + '</div></div>');
    }
    (entry.s || []).forEach(function (s) {
      sents.push('<div class="sent"><div class="en">' + markEn(s[0], markWord) + '</div><div class="cn">' + esc(s[1]) + '</div></div>');
    });
    return '<div class="means">' + means + '</div>' + sents.join("") + mnemHTML(entry);
  }"""
new = """  function detailHTML(entry, markWord) {
    var means = (entry.m || []).map(function (m) {
      return '<div class="m"><span class="p">' + esc(m[0]) + '</span><span class="t">' + esc(m[1]) + '</span></div>';
    }).join("") || '<div class="m"><span style="color:var(--text-3)">暂无释义</span></div>';
    var sents = [];
    if (entry.rex) {
      sents.push('<div class="sent"><span class="src-badge">真题 ' + esc(entry.rex[2]) + '</span><div class="en">' + markEn(entry.rex[0], markWord) + '</div></div>');
    }
    (entry.s || []).forEach(function (s) {
      sents.push('<div class="sent"><div class="en">' + markEn(s[0], markWord) + '</div><div class="cn">' + esc(s[1]) + '</div></div>');
    });
    return '<div class="means">' + means + '</div>' + sents.join("");
  }
  /* 词组搭配 / 派生 / 词根 三面板 */
  function tabsHTML(entry) {
    var tabs = [], panels = {};
    if (entry.phr && entry.phr.length) {
      tabs.push(["phr", "词组搭配"]);
      panels.phr = entry.phr.map(function (ph) {
        return '<div class="dt-item"><span class="phr-line" data-snd-phr="' + esc(ph[0]) + '">' + esc(ph[0]) + '</span><span class="dt-cn">' + esc(ph[1]) + '</span></div>';
      }).join("");
    }
    if (entry.rel && entry.rel.length) {
      tabs.push(["rel", "派生"]);
      panels.rel = entry.rel.map(function (r) {
        return '<div class="dt-item"><span class="pd">' + esc(r[1]) + '</span><span class="lw" data-word="' + esc(r[0]) + '"><b>' + esc(r[0]) + '</b></span><span class="dt-cn">' + esc(r[2]) + '</span></div>';
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
  }"""
assert old in t, "detailHTML"
t = t.replace(old, new)

# mnemHTML 不再被 detailHTML 使用：保留函数（word-card 详情弹窗等仍可用）——删除以防冗余？保留无引用也可。保留。

# 4) renderTeach 全量重写
old_start = t.index("  /* 讲解阶段 */")
old_end = t.index("  function toggleStar(entry) {")
new_teach = """  /* 学习卡片：自评 → 详情 */
  function topbarHTML(posText) {
    return '<div class="study-topbar">' +
      '<button class="tb-btn" id="tb-prev">‹</button>' +
      '<span class="tb-pos">' + posText + '</span>' +
      '<span class="tb-sp"></span>' +
      '<button class="tb-btn" id="tb-undo">↺</button>' +
      '<button class="tb-btn" id="tb-star">☆</button>' +
      '<button class="tb-btn tb-known" id="tb-known">熟</button>' +
      '</div>';
  }
  function bindTopbar(entry) {
    var prev = document.getElementById("tb-prev");
    prev.onclick = function () {
      if (st.teachIdx > 0) { st.teachIdx--; st.teachDetail = false; render(); }
      else if (st.batchIdx > 0) {
        st.batchIdx--; st.teachIdx = BATCH - 1; st.teachDetail = false;
        st.reQueue = []; st.reTeach = false;
        render();
      }
    };
    prev.disabled = st.teachIdx === 0 && st.batchIdx === 0;
    document.getElementById("tb-undo").onclick = function () {
      st.teachDetail = false; delete st.knewVal[entry.w]; render();
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
      A().toast("已标记为熟词，不再安排学习");
    };
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
  function renderTeach() {
    var b = curBatch();
    var entry = b[st.teachIdx];
    if (!entry) { startQuizPhase(); return; }
    st.curWord = entry.w;
    var knewVal = st.knewVal[entry.w];
    var pos = (st.batchIdx * BATCH + st.teachIdx + 1) + "/" + st.batches.length * BATCH;
    var html = topbarHTML(pos) + '<div class="study-body">';
    if (!st.teachDetail) {
      /* 自评卡 */
      html += '<div class="self-card">' + wordTitleHTML(entry) + phonHTML(entry) +
        '<div class="blur-lines"><span class="bl"></span><span class="bl short"></span></div>' +
        '<div class="self-hint">瞬间想起词义，选「认识」<br>思考后想起词义，选「模糊」</div></div>' +
        '</div><div class="act-keys">' +
        '<button id="ak-ok">认识</button><button id="ak-mid">模糊</button><button id="ak-no">忘记了</button>';
    } else {
      /* 详情卡 */
      html += '<div class="detail-card"><div class="word-head">' + checkBadge(knewVal) + wordTitleHTML(entry) + '</div>' +
        phonHTML(entry) +
        detailHTML(entry, entry.w) +
        tabsHTML(entry) + '</div>' +
        '</div><div class="act-keys two">' +
        '<button id="ak-next">下一词</button><button id="ak-wrong">记错了</button>';
    }
    html += "";
    body = el; body.innerHTML = html;
    speak(entry.w);
    bindTopbar(entry);
    document.getElementById("btn-snd").onclick = function () { speak(entry.w, true); };
    if (!st.teachDetail) {
      var pick = function (val) {
        st.knewVal[entry.w] = val;
        st.teachDetail = true;
        st.dirty = true;
        render();
      };
      document.getElementById("ak-ok").onclick = function () { pick("ok"); };
      document.getElementById("ak-mid").onclick = function () { pick("mid"); };
      document.getElementById("ak-no").onclick = function () { pick("no"); };
    } else {
      document.getElementById("ak-next").onclick = function () {
        st.teachIdx++; st.teachDetail = false; st.dirty = true; render();
      };
      document.getElementById("ak-wrong").onclick = function () {
        st.knewVal[entry.w] = "no";
        if (st.reQueue.findIndex(function (x) { return x.w === entry.w; }) < 0) st.reQueue.push(entry);
        st.teachIdx++; st.teachDetail = false; st.dirty = true; render();
      };
      bindDetailExtras(entry);
    }
  }
  /* 详情卡附加交互：查词 .lw、词组朗读、Tab 切换 */
  function bindDetailExtras(entry) {
    Array.prototype.forEach.call(el.querySelectorAll(".lw"), function (node) {
      node.onclick = function () { A().querySheet(node.getAttribute("data-word") || node.textContent); };
    });
    Array.prototype.forEach.call(el.querySelectorAll("[data-snd-phr]"), function (node) {
      node.onclick = function () { speak(node.getAttribute("data-snd-phr"), true); };
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
"""
t = t[:old_start] + new_teach + t[old_end:]

# 5) renderReteach：按钮风格 + topbar 对齐
old = """    var html =
      '<div class="study-top">' + topHTML("再学一遍", st.teachIdx, st.reQueue.length) + "</div>" +
      '<div class="study-body"><div class="word-card">' +
      wordTitleHTML(entry) +
      '<div class="phon">' + (entry.us ? "<span>美 /" + esc(entry.us) + "/</span>" : "") +
      '<button class="snd small" id="btn-snd">' + sndSvg() + "</button></div>" +
      detailHTML(entry, entry.w) +
      '<div style="margin-top:20px"><button class="btn btn-primary btn-block" id="btn-next">记住了，继续</button></div>' +
      "</div></div>";
    body = el; body.innerHTML = html;
    speak(entry.w);
    document.getElementById("btn-snd").onclick = function () { speak(entry.w, true); };
    document.getElementById("btn-next").onclick = function () { st.teachIdx++; st.dirty = true; render(); };"""
new = """    var html =
      '<div class="study-topbar"><span class="tb-pos" style="margin-left:4px">再学一遍 · ' + (st.teachIdx + 1) + "/" + st.reQueue.length + '</span></div>' +
      '<div class="study-body"><div class="detail-card"><div class="word-head">' + wordTitleHTML(entry) + '</div>' +
      '<div class="phon"><span class="acc-chip">美</span>' +
      '<button class="snd small" id="btn-snd">' + sndSvg() + '</button>' +
      (entry.us ? '<span>/' + esc(entry.us) + '/</span>' : "") + '</div>' +
      detailHTML(entry, entry.w) + tabsHTML(entry) + '</div>' +
      '</div><div class="act-keys two">' +
      '<button id="btn-next">记住了，继续</button>';
    body = el; body.innerHTML = html;
    st.curWord = entry.w;
    speak(entry.w);
    bindDetailExtras(entry);
    document.getElementById("btn-snd").onclick = function () { speak(entry.w, true); };
    document.getElementById("btn-next").onclick = function () { st.teachIdx++; st.dirty = true; render(); };"""
assert old in t, "renderReteach"
t = t.replace(old, new)

# 6) finishBatch：跳过已标熟词
old = """    b.forEach(function (entry) {
      var correct = st.knew[entry.w] !== undefined ? st.knew[entry.w] : false;
      A().seedProgress(st.lib, entry, correct);
    });"""
new = """    b.forEach(function (entry) {
      if (st.knownMarked[entry.w]) return;   // 已标记熟词：不重复入档
      var knewVal = st.knewVal[entry.w];
      var correct = knewVal !== "no" && knewVal !== "mid";
      A().seedProgress(st.lib, entry, correct);
    });"""
assert old in t, "finishBatch"
t = t.replace(old, new)

io.open(p, "w", encoding="utf-8").write(t)
print("study.js learn flow rewritten")
