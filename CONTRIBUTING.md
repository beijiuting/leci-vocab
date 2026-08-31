# 贡献指南

## 开发流程

1. Fork 仓库并创建功能分支。
2. 修改 `vocab-app/` 源码；如果网页资源变化，将 `index.html` 中的缓存参数递增。
3. 运行 `node --check vocab-app/js/*.js`（Windows 可逐个执行）。
4. 运行 `python vocab-android/copy_www.py` 同步 Android 资源。
5. 在浏览器和 Android 模拟器中完成相关回归测试。
6. 更新 `CHANGELOG.md`，提交 Pull Request。

## 提交说明

提交信息建议使用 `feat:`、`fix:`、`docs:`、`build:` 等前缀，并在 PR 中说明验证方式。

## 数据与隐私

学习数据默认只保存在用户设备本地。不要在 Issue 或 PR 中上传个人备份 JSON、设备截图中的敏感信息或私有词库。
