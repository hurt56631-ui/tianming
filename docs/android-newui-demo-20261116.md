# 天命 · Android 新界面测试 APK

本分支只增加**独立的 Android 平板测试包构建**，不把官方正式版切到新 UI。

## 已改动

- 引入原仓库已有的 `web/ui/**` 与 `web/vendor/three/**`（仅测试包，不修改官方五条发布管线共用的排除规则）。
- 从官方当前 `web/` 源码制作 Android staging。仅在打包后的 `index.html` 打开 `TM_NEW_UI`，不修改原文件。
- APK 独立包名 `com.tianming.history.newuidemo`、独立应用名称「天命新界面测试」，不覆盖已有的正式游戏与存档。
- 禁止测试 APK 的原有热更新自动升级；锁定支持双方向的横屏。
- 逐文件 SHA-256 验证 staging 与 Capacitor 原生资源一致，避免打入旧代码。

## GitHub Actions APK

在当前分支打开 **Actions → Android New UI Demo APK**，成功的构建从任务页面的 Artifacts 下载 `tianming-android-newui-demo-debug`，解压后安装 debug APK。

构建依赖 Android SDK、Java 21、Node 22、Gradle / Capacitor；不能把 Windows Demo 的 EXE 直接换壳。

### Windows 本地构建

在官方源码的仓根执行：

```powershell
node web/scripts/sync-official-scenarios.js
node mobile/scripts/stage-newui-demo.cjs
cd mobile
npm ci
node scripts/configure-newui-demo.cjs
npx cap add android
node scripts/configure-newui-native.cjs
npx cap sync android
node scripts/stage-newui-demo.cjs --verify --native --target android/app/src/main/assets/public
cd android
./gradlew assembleDebug
```

**注意：** 配置脚本会直接修改本机派生 Android 项目的 `mobile/capacitor.config.json`，只适合在克隆的测试工作区运行，不应在正式发版工作区运行。要发布正式 APK，重新克隆官方配置，而不是使用这个 Demo 的原生工程。

## 验收要求（仍需真机）

- 安装后无需修改设置即进入新 UI。
- 平板横屏启动、地图和人物对话不出现白屏、按钮可点击。
- 三份官方剧本正常开局，保存、关闭、重进、读档正确。
- 使用真实 API 连续过多个回合并检查失败/中断/恢复、内存峰值。
- 检查音频/立绘：官方仓库有忽略的本地美术文件，新 UI 在缺资源时可能有降级显示。
- 与旧版 `com.tianming.history` 并存，互不修改存档；新的 Demo 不覆盖正式版。
- 旧的桌面/Web/Capgo/Android 发布流水线保持原状。

## 状态

代码已准备，**以 GitHub Actions 实际结果为准**；在 CI 成功和 Android 真机验收之前不能称为“可用正式版”。
