# 天命移动端（Android / 平板）

移动端与 Electron、Pages 共享仓根 `web/` 源码，但 Capacitor **不会直接读取 `../web`**。`capacitor.config.json` 固定使用派生目录 `mobile/www/`：每次同步先按 `scripts/release-excludes.json` 重建 staging，再写入逐文件 SHA256 清单，最后由 Capacitor 复制到原生工程。

## 正确命令

```powershell
cd mobile
npm install
npm run add:android     # 首次生成原生工程
npm run sync            # stage -> cap sync -> native hash verify
npm run open            # 先执行完整 sync gate，再打开 Android Studio
npm run run             # 先执行完整 sync gate，再运行设备
```

不要直接运行 `npx cap sync`、`npx cap copy`，也不要在未执行 `npm run sync` 的情况下从 Android Studio 打包。它们会绕过 staging，可能把旧的 `android/app/src/main/assets/public/` 打进 APK。

只读检查：

```powershell
npm run dryrun           # PS5.1 可运行；不改 www
npm run verify:staging   # 当前 www 是否与 web/、排除清单、SHA manifest 完全一致
npm run verify:native    # Android 原生 public 是否与当前 web/ 完全一致
```

`mobile/www/`、`mobile/android/`、`mobile/capgo-dist/` 都是派生物，已被 git ignore；源码改动只提交到 `web/` 和移动端脚本/配置。

## 发布边界

- APK staging、Capgo bundle、桌面 hot update 和 Pages 共用 `scripts/release-excludes.json` 与 `scripts/lib/release-tree.js`。
- staging 闸会检查 forbidden paths、必需入口、总文件数/体积、每文件 SHA256 和整树 SHA256。
- Capgo 仍由仓主通过统一发版流程触发；合并到 `main` 不等于发布。

平台差异由 `web/tm-platform.js` 的 Capacitor 后端处理。存档优先沿用 IndexedDB；原生 HTTP、文件系统和资产 URL 只用于 WebView 无法覆盖的能力。

## 手机端导出位置

Android 存档和剧本导出通过本仓的 `@tianming/capacitor-file-export` 插件打开系统“保存到”窗口，由玩家选择文件夹和文件名。插件真源在 `mobile/plugins/tianming-file-export/`，`npm install` 后由正常 `npm run sync` 自动注册，无须修改 ignored 的 `MainActivity`，也不申请全盘存储权限。

这项能力需要含该插件的新 APK；仅发 Capgo 热更无法给旧 APK 增加原生插件。旧壳应提示更新安装包；导出取消、保存失败均不能提示成功。未调用此插件的桌面导出行为不变。

原生 API：`Capacitor.Plugins.TianmingFileExport.saveFile({ fileName, data, mimeType: 'application/json' })`。`data` 是 UTF-8 文本，成功返回 `{ saved: true, cancelled: false, fileName, uri }`，取消返回 `{ saved: false, cancelled: true }`，其他失败 reject。`uri` 是系统文档 URI，不能当作普通文件路径显示。文件名以系统文档提供方最终返回的名称为准。

大存档在工作线程先写私有临时文件，再流式写到玩家选择的目标。等待选择期间从 Capacitor 调用状态移除大文本，避免 Android 保存 Activity 状态时超过 Bundle 大小限制；同一时刻只允许一个导出窗口。正常完成或取消会清理临时文件。

## Windows：一条命令生成测试 APK（不发布）

只为本地测试生成 debug APK：不会修改版本号、正式签名、Capgo 更新或 GitHub Release。
准备 Node.js 18+、Android Studio、Android SDK 和 Android Studio 自带的 JDK；首次安装完成 SDK 与许可证。
运行之前确认代码来自要测试的 Git 分支。Git 下载可能不包含原游戏中未跟踪的 `web/assets/` 大量美术文件，需要从你原有游戏素材备份补齐。不要修改 staging 闸绕过缺图。

```powershell
cd mobile
npm install
npm run build:apk:debug
```

第一次执行会运行 `npm run add:android`；以后执行完整 `npm run sync`。
所有运行均遵循 web → staging → Capacitor → native 文件哈希校验，再执行 `:app:assembleDebug`。
生成的文件：`mobile/android/app/build/outputs/apk/debug/app-debug.apk`。

在 mobile 目录直接打开输出文件夹：
```powershell
explorer .\android\app\build\outputs\apk\debug\
```

debug APK 使用测试签名，仅用于手机测试；不可以直接发布应用市场，也不能保证覆盖安装签名不同的旧正式版。
遇到签名冲突必须先导出备份游戏存档，再考虑卸载旧版。正式发行继续使用仓库 `AGENTS.md` 的两阶段发版与签名门禁。

喜欢 Android Studio 图形界面：先 `npm run sync`，然后执行 `npm run open` 打开工程，在 Build 菜单选择 Build APK(s)。

### 避免漏打人物立绘和音乐

Debug APK 构建增加了**只读素材存在性检查**：按 `web/.hot-update-manifest.json` 中列出的
人物立绘、图片、音频和场景模型核对本机 `web/assets`。GitHub 下载源码经常缺少 Git 未跟踪的资源。
如果提示 `Missing ... essential artwork/audio files`，请从你保存的完整版《天命》原始素材文件夹
恢复同名目录和文件；不要禁用检查，否则可能打出缺图的 APK。

Windows `mobile/` 若使用跨磁盘 junction，测试打包工具会先从 npm 的 `INIT_CWD` 和当前工作目录向上寻找仓根标记，不会盲目以 `mobile/scripts` 物理路径当仓根。必要时可设置 `TIANMING_REPO_ROOT` 指向仓库根目录。

### Gradle/Android API 35 测试兼容性

当前 Capacitor 6 原生模板默认为 compileSdk 34、AGP 8.2.1、Gradle 8.2.1；项目依赖的 androidx.work:work-runtime:2.10.5 要求 compileSdk >=35。
`npm run build:apk:debug` 在 **stage + native 哈希校验通过后**，只对 ignored 的 `mobile/android` 原生构建配置做受控升级：compileSdk 35、AGP 8.6.1、Gradle 8.7；保留原 targetSdk 34、minSdk 22、versionCode 和正式版签名不变。此步骤仅为测试包打包用途，正式发行仍需审查完整安卓构建工具链。见 `web/scripts/smoke-android-debug-sdk35.js`。
