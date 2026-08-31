# 乐词背单词 — 项目交付文档（供 Agent 执行任务）

> 本文档面向后续接手的 AI agent / 开发者，描述项目全貌、构建发布流程、验证手段与约定。
> 最后更新：2026-08-31（v31 进行中，详见「当前任务状态」）

---

## 1. 项目概述

模仿「不背单词」的免费背单词应用，**一套网页代码同时交付三种形态**：

| 形态 | 位置 | 说明 |
|---|---|---|
| 网页版（源码） | `D:\Project\zcode\vocab-app\` | 纯原生 JS，零依赖，classic script，file:// 双击可用 |
| Android APK | `D:\Project\zcode\vocab-android\` | Java + WebView 壳，加载 assets/www（网页源码的镜像副本） |
| iOS PWA | 复用 vocab-app | manifest.json + sw.js + apple meta，见 `iOS安装指南.md` |

- 数据：IndexedDB（VocabAppDB，5 store：progress/favorites/stats/libs/settings），全部本地
- 记忆曲线（srs.js）：10分钟→1天→2天→4天→7天→15天→30天→60天，stage9=已掌握；答错回 stage1
- 三重自动备份继承数据：App 私有文件（覆盖安装）+ 媒体库副本 Pictures/乐词备份（卸载重装）+ localStorage（网页）
- 发布 APK 文件命名：`乐词背单词-v{X.Y.Z}.apk`（项目根目录），旧版本文件保留

## 2. 关键目录与文件

```
vocab-app/
├── index.html          # 单页入口，5 屏 + study 全屏层 + qsheet 查词卡；资源带 ?v=N 缓存参数
├── css/style.css       # CSS 变量主题 + html.dark 深色；.study 学习层布局（overflow:hidden 锁定）
├── js/
│   ├── db.js           # IndexedDB 封装；put/del/clear/importAll 后触发 dirty() → 自动备份
│   ├── srs.js          # 记忆曲线；S.migrateOld() 旧 stage7→9 迁移；S.nextLabel() 下次见面文案
│   ├── study.js        # 学习/复习/拼写全屏流程（自评卡→详情卡，逐词入档+断点续学+5词测验）
│   ├── test.js         # 掌握测试 + 备考速刷（翻面式：正面仅单词，点击出释义小窗）
│   └── app.js          # 主应用：路由/首页/词库/词表/仪表盘/生词本/设置/备份/查词
├── data/cet4|cet6|kaoyan.js   # 词库（kajweb/dict 构建，含音节/词缀/真题例句/COCA词频）
├── tools/build_libs.py       # 词库构建脚本
├── tools/serve.py            # 测试服务器 0.0.0.0:8765（no-cache）
├── manifest.json / sw.js / icons/  # PWA
└── README.md / iOS安装指南.md / 词库导入模板/

vocab-android/
├── app/src/main/java/com/leci/vocab/MainActivity.java
│     # WebViewAssetLoader（https://appassets.androidplatform.net/assets/www）
│     # TtsBridge(NativeTTS) + BackupBridge(NativeBackup: save/clip/saveAuto/readAuto)
│     # 媒体读取权限请求（卸载重装自动恢复用）+ edge-to-edge insets
├── app/src/main/AndroidManifest.xml   # INTERNET + READ_EXTERNAL_STORAGE(≤32) + READ_MEDIA_IMAGES
├── app/src/main/assets/www/           # copy_www.py 生成的网页镜像（勿手改，改 vocab-app 后重新跑）
├── copy_www.py                        # 同步 vocab-app → assets/www（自动去掉 ?v= 参数）
├── app/build.gradle                   # versionCode/versionName 在此 bump
└── build.gradle / settings.gradle     # AGP 9.3.2，本地离线构建

.zcode/shots/                          # 测试截图（judge 验收输入）
```

## 3. 构建与发布流程（必须按顺序）

### 3.1 改网页代码后
1. 改 `vocab-app/` 源码
2. `vocab-app/index.html` 里所有 `?v=N` **必须 +1**（当前 N=31），否则用户浏览器/WebView 用旧缓存
3. `node --check vocab-app/js/*.js` 语法检查

### 3.2 同步并构建 APK
```bash
cd /d/Project/zcode/vocab-android
python copy_www.py                       # vocab-app → assets/www
# bump app/build.gradle: versionCode +1, versionName
JAVA_HOME="D:/Program Files/Android/Android Studio/jbr" \
PATH="/d/Program Files/Android/Android Studio/jbr/bin:$PATH" \
~/.gradle/wrapper/dists/gradle-9.5.0-bin/bvnork1r7n8i6kp5cnkibsc9q/gradle-9.5.0/bin/gradle assembleRelease -q
cp app/build/outputs/apk/release/app-release.apk /d/Project/zcode/乐词背单词-v{版本}.apk
```
- Gradle 必须显式设 JAVA_HOME（Android Studio JBR），系统 PATH 无 java
- `copy_www.py` 会去掉 ?v= 参数（android_asset 无需防缓存），**index.html 在 APK 里与源码 diff 出 ?v 差异属正常**

### 3.3 版本历史
v1.0.0 初版 → v1.2 UI改版 → v1.3.0 速刷/多生词本 → v1.4.0 备份/曲线30-60天/新词300 → v1.5.0 复习小窗/自动继承 → v1.6.1 滚动锁定 → **v1.7.0（进行中，见下）**

## 4. 验证手段

### 4.1 浏览器（网页版）
```bash
cd /d/Project/zcode/vocab-app && python tools/serve.py   # 127.0.0.1:8765，no-cache
```
用 browser-use skill（IAB）打开 `http://127.0.0.1:8765/index.html?f=Date.now()`。
- 视口 420×860 模拟手机；矮视口 420×700 逼出滚动场景
- 页面内 evaluate 可直接调 `App` / `DB` / `SRS` / `Test.open()` 驱动流程
- 截图偶发 "capture failed/timeout"：等 10-30s 重试，或关标签页重开
- 已知：IAB 后台标签动画节流会冻结 CSS 入场动画 → 复习详解卡已用 `animation:none` 规避；新加动画元素要考虑此坑

### 4.2 MuMu 模拟器（安卓端）
```bash
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
"$ADB" connect 127.0.0.1:16384           # 未启动时先跑 "D:/Program Files/Netease/MuMu Player 12/shell/MuMuPlayer.exe"
"$ADB" -s 127.0.0.1:16384 install -r 乐词背单词-vX.Y.Z.apk
"$ADB" -s 127.0.0.1:16384 shell am start -n com.leci.vocab/.MainActivity
# 截图（注意 Git Bash 路径转换，pull 加 MSYS_NO_PATHCONV=1）：
"$ADB" -s 127.0.0.1:16384 shell "screencap -p /sdcard/x.png"
MSYS_NO_PATHCONV=1 "$ADB" -s 127.0.0.1:16384 pull /sdcard/x.png <本地路径>
```
- 分辨率 1080×1920；常用坐标：首页"开始学习"≈(540,1120)，速刷≈(540,1435)，自评三键≈(215/540/865,1735)，学习层退出‹≈(93,157)
- MuMu 无 TTS 引擎 → 在线发音兜底（INTERNET 权限已配）

### 4.3 judge 视觉验收
截图存 `D:\Project\zcode\.zcode\shots\`，spawn `judge` 子代理逐图给 `{"page":N,"verdict":"pass|fail","issues":[...]}`。judge 报的问题需修复后 SendMessage 复审直至 pass。注意：judge 只认磁盘上真实存在的文件路径，文件名要核对。

## 5. 重要实现约定（勿破坏）

1. **App.settings 与 DB settingsCache 双源**：改 settings 结构的函数（如 createFavBook）必须同时 `this.settings.x = ...` 并 `DB.saveSettings(...)`，否则读旧值
2. **会话持久化**：settings.session 的 queue 存**词名字符串数组**（存对象会导致恢复崩溃）
3. **MASTERED=9**：判断毕业一律用 `SRS.MASTERED` 常量，勿写死 7
4. **学习层滚动**：`.study{overflow:hidden}` + `.study-body{min-height:0}` 是滚动锁定的关键；新增内容区一律用内部滚动小窗（参考 `.rev-win` / `.cram-win`）
5. **例句喇叭**：`.sent{position:relative}` 必须保留（否则喇叭全部叠到卡片右上角）
6. **自动备份链**：DB 写操作 → `dirty()` → `App.markDataDirty()`（4s 防抖）→ `flushAutoBak()`；页面 visibilitychange hidden 时立即 flush
7. **安卓 MediaStore**：Downloads 集合按贡献者隔离（卸载重装后旧行不可见）；跨安装可读的备份走 Images 集合（`Pictures/乐词备份`，前缀匹配查询 + _id DESC 取最新 + 清副本）；Downloads 写入有 `dl_written` 标志防副本堆积
8. **动画**：安卓 WebView/后台标签可能冻结 CSS 动画在首帧（opacity:0）→ 即时内容禁止入场动画

## 6. 当前任务状态（v31 / APK v1.7.0 进行中）

用户需求（本轮）：
1. **所有单词标题不换行，空间不够缩小字体**
2. **主界面 + 所有背单词界面加放大镜查词按钮，查完返回原界面**

### 已完成
- CSS：`.ww{white-space:nowrap}` + `.sch-fab`（首页 hero 右上放大镜）/`.sch-btn`（学习层顶栏按钮）/`.sch-input`（查词输入框）样式（style.css 末尾区块）
- app.js：`App.fitWord(root)` 单词自适应缩字号（字符预算 + scrollWidth 实测双重收缩，下限 13px）；`App.openSearch()` 查词弹窗（输入→querySheet 小卡片，关闭即回原界面）
- index.html：首页 hero 加 `<button id="home-search" class="sch-fab">`（放大镜 SVG）；?v= 已 bump 到 31
- study.js：顶部加 `SCH_SVG` 常量

### 未完成（接手者从这里继续）
1. **study.js**：`topHTML()`（约 L133）在 `.cnt` 后追加查词按钮：
   `'<button class="sch-btn" id="st-search" title="查单词">' + SCH_SVG + '</button>'`；
   并在 render() 末尾统一绑定 `document.getElementById("st-search").onclick = function(){ A().openSearch(); };`
   `topbarHTML()`（学习页顶部工具条，约 L141）在 `熟` 按钮后追加同样按钮（同 id 会冲突，学习页用 topbarHTML 时可复用 st-search，注意两个模板不要同时渲染）
2. **test.js**：它有**自己的 topHTML 副本**（约 L131），同样加按钮 + 绑定（cram/quiz 渲染处）；文件顶部需同样定义 SCH_SVG
3. **app.js**：`bindHome()` 里绑定 `document.getElementById("home-search").onclick = function(){ self.openSearch(); };`
4. **fitWord 接入**：study.js 的 renderSelf/renderDetail/renderReteach、test.js 的 renderCram（正面+背面）、renderQuiz（q-title 不是 .ww 可跳过）每处渲染完调用 `A().fitWord(body || el)`；app.js renderHome 后也可调一次（词书名较短，低优先级）
5. **键盘防护**：study.js/test.js 的全局 keydown（onKey）开头加：`if (document.getElementById("qsheet").classList.contains("on") || document.getElementById("mask").classList.contains("on")) return;`（查词卡/弹窗打开时数字键空格不得触发答题）——test.js 的 onKey 已有 INPUT 豁免，study.js 需检查
6. **验证**：node --check 全部 JS → serve.py 起服务 → 浏览器实测（首页放大镜→查 disproportionately→关闭回原界面；学习/复习/速刷/测验层按钮可用；长单词如 disproportionately/internationalization 不换行且缩号）→ judge 截图验收 → copy_www.py + versionCode 6/versionName 1.7.0 + gradle 构建 → `乐词背单词-v1.7.0.apk` → MuMu 覆盖安装冒烟（放大镜可查词、数据自动继承）→ README 如有功能描述变化则更新
7. **交付话术要点**：网页 Ctrl+F5；APK 覆盖安装不丢数据

### 回归测试清单（每次发版必测）
- 断点续学：学 2 词退出 → 重进显示 3/N 继续
- 复习：答对晋级 / 答错回炉 10 分钟 / 词表"待复习/N小时后见"标签
- 速刷：正面无释义泄露 → 翻面小窗内滚 → 完成自动收藏模糊+不认识
- 数据继承：覆盖安装进度保留；`indexedDB.deleteDatabase("VocabAppDB")` 后刷新自动恢复
- 多生词本增删切换、自动收藏归属当前本

## 7. 环境速查

- 项目根：`D:\Project\zcode`；Shell 是 Git Bash（Windows 路径转换坑：adb pull 加 `MSYS_NO_PATHCONV=1`；heredoc 长脚本可能截断，优先用 Write 写文件再执行）
- JDK：Android Studio JBR（D:/Program Files/Android/Android Studio/jbr）；Gradle 9.5.0（wrapper dists）；AGP 9.3.2；SDK platform 35 / build-tools 36.0.0
- 用户端浏览器若见旧版 → Ctrl+F5（index.html 缓存）；测试服务器 serve.py 是 no-cache 的
