# 乐词背单词

一个免费、离线优先的英语词汇学习应用，提供网页版、Android APK 和 iOS PWA 三种形态。

## 特性

- IndexedDB 本地保存学习进度、生词本、统计与设置
- 记忆曲线复习：10 分钟、1 天、2 天、4 天、7 天、15 天、30 天、60 天
- 学新词、复习、拼写练习、备考速刷、掌握测试
- CET-4、CET-6、考研词库与自定义词库导入
- 深色模式、发音、断点续学、自动备份与数据导入导出
- 单词查询与长单词自适应显示

## 目录

- `vocab-app/`：零依赖原生 JavaScript 网页版，可直接打开 `index.html`
- `vocab-android/`：Java + WebView Android 工程
- `乐词背单词-v1.10.0.apk`：当前 Android 发布包
- `releases/`：上一稳定版 APK 回滚包；完整历史版本见 GitHub Releases 和 tags
- `AGENTS.md`：完整技术交付文档与构建验证流程

## 快速运行

直接双击 `vocab-app/index.html`，或启动本地服务：

```bash
cd vocab-app
python tools/serve.py
```

然后打开 `http://127.0.0.1:8765/index.html`。

## 构建 Android

```bash
cd vocab-android
python copy_www.py
gradle assembleRelease
```

需要 Android Studio 自带 JDK 11+、Android SDK 35 和本地 Gradle 环境。详细步骤、模拟器验证和数据继承说明见 `AGENTS.md`。

## 开源协作

欢迎提交 Issue、改进词库处理脚本或提交 Pull Request。请先阅读 `CONTRIBUTING.md`。版本变化记录在 `CHANGELOG.md`，发布版本使用 Git tag，例如 `v1.9.5`。仓库会保留当前版本和至少一个上一稳定版，方便回滚；更早版本可在 GitHub Releases 和 tags 中下载。

## 许可与词库来源

应用代码采用 MIT License。内置词库来自开源词书项目 `kajweb/dict`，其内容请遵循原项目许可与使用要求，仅用于学习交流。
