/* srs.js —— 记忆曲线调度（仿不背单词）
   stage 含义：
   0      新词（已讲解待测验/测验中）
   1..8   学习中，通过第 stage 次复习后进入下一间隔：
          1 →10分钟后   2 →1天后   3 →2天后   4 →4天后
          5 →7天后      6 →15天后  7 →30天后  8 →60天后
   9      已掌握（毕业，不再排期）
   复习答错 → 回退 stage=1（10分钟后重新见面）
   旧版本毕业曾是 stage=7，启动时一次性迁移到 9（App.migrateSrs9）
*/
(function () {
  "use strict";

  var DAY = 86400e3;
  var OFFSETS = { 1: 10 * 60e3, 2: 1 * DAY, 3: 2 * DAY, 4: 4 * DAY, 5: 7 * DAY, 6: 15 * DAY, 7: 30 * DAY, 8: 60 * DAY };
  var LABELS = { 1: "10分钟后", 2: "1天后", 3: "2天后", 4: "4天后", 5: "7天后", 6: "15天后", 7: "30天后", 8: "60天后" };

  var SRS = {
    MASTERED: 9,

    /* 旧数据迁移：老版本 stage7 即毕业，新曲线里 7/8 是 30/60 天间隔，毕业改为 9。
       返回需要回写的行（原地改好），空数组表示无需迁移 */
    migrateOld: function (rows) {
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].stage === 7) { rows[i].stage = 9; out.push(rows[i]); }
      }
      return out;
    },

    /* 下次见面时间文案（词表/完成页展示遗忘曲线用），非学习中返回空串 */
    nextLabel: function (p, now) {
      if (!p || !(p.stage > 0) || p.stage >= SRS.MASTERED) return "";
      var t = now || Date.now();
      if (p.due <= t) return "待复习";
      var d = p.due - t;
      if (d < 60e3) return "1分钟后见";
      if (d < 3600e3) return Math.round(d / 60e3) + "分钟后见";
      if (d < DAY) return Math.round(d / 3600e3) + "小时后见";
      return Math.round(d / DAY) + "天后见";
    },

    /* 新词完成本组学习后首次入档（无论测验对错都进入10分钟后首复） */
    seed: function (lib, w, correct) {
      return {
        id: window.DB.progId(lib, w),
        lib: lib, w: w,
        stage: 1,
        due: Date.now() + OFFSETS[1],
        reviews: 0, wrong: correct ? 0 : 1,
        addedAt: Date.now(), lastAt: Date.now()
      };
    },

    /* 复习反馈：correct=true 晋级；false 回炉 */
    review: function (p, correct) {
      p.reviews = (p.reviews || 0) + 1;
      p.lastAt = Date.now();
      if (correct) {
        p.stage = Math.min((p.stage || 1) + 1, SRS.MASTERED);
        p.due = p.stage >= SRS.MASTERED ? 0 : Date.now() + (OFFSETS[p.stage] || 0);
      } else {
        p.wrong = (p.wrong || 0) + 1;
        p.stage = 1;
        p.due = Date.now() + OFFSETS[1];
      }
      return p;
    },

    isDue: function (p, now) { return p.stage > 0 && p.stage < SRS.MASTERED && p.due <= (now || Date.now()); },
    isLearned: function (p) { return p && p.stage > 0; },
    isMastered: function (p) { return p && p.stage >= SRS.MASTERED; },
    stageLabel: function (p) {
      if (!p || p.stage === 0) return "新词";
      if (p.stage >= SRS.MASTERED) return "已掌握";
      return "学习中 · " + (LABELS[p.stage] || "");
    },

    /* 今天（自然日）内到期的都算今日复习任务（含10分钟回见） */
    dueToday: function (list, now) {
      var endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
      var t = now || Date.now();
      return list.filter(function (p) {
        return p.stage > 0 && p.stage < SRS.MASTERED && p.due <= Math.min(t + 1, endOfDay.getTime());
      });
    },
    dueNow: function (list) { return list.filter(function (p) { return SRS.isDue(p); }); }
  };

  window.SRS = SRS;
})();
