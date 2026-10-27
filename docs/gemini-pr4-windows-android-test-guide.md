# 《天命》PR #4 · Windows 与安卓测试手册

> 本手册面向仓主本地测试，不代表已发布。PR #4 是 Draft；目前没有 Google 实网、Windows 正式安装包或 Android 真机通过记录。

## 你需要先准备

- Windows：Git、Node.js 18+（推荐 LTS）。
- 安卓打包额外需要 Android Studio（Capacitor 6 需 Android Studio 2023.1.1+）、Android SDK 与它自带的 JDK；第一次使用需要下载 SDK/Gradle。
- 原工程完整的 `web/assets` 立绘、音频和图片。源代码仓库没有跟踪全部素材，仅从 GitHub 克隆可能无法构建可玩的完整 APK。
- 至少一种可用的正式 AI API Key、Base URL 和模型 ID；**结束回合始终使用正式 API**，免费 Gemini 只负责部分人物对话。

## 不要伤及原工程：新建独立测试目录

先在你想存放测试项目的目录打开 PowerShell：

```powershell
git clone --branch codex/gemini-web-free-desktop-20261017 --single-branch https://github.com/hurt56631-ui/tianming.git tianming-gemini-test
cd tianming-gemini-test
git status
```

从你自己已经备份好的《天命》完整原工程，把 Git 没收录的 `web/assets` 以及 staging 可能报告缺少的运行资源按相同相对路径复制过来。**不要直接用另一个版本的 JS 源码覆盖当前测试分支**；只补缺失的素材。项目基线 `web/.hot-update-manifest.json` 里记录了大量原始图片/音频文件。

如果你已经在有完整素材的本地《天命》仓库测试，请先用 `git status` 看是否有未提交修改；不要在带未保存改动的工作目录强制切换分支或清理文件。

## Windows 电脑版运行

在测试仓库根目录运行：

```powershell
npm install
npm start
```

会启动 Electron 开发版；这不是一个新的 EXE 安装包。要制作正式 Windows EXE，需要按 `AGENTS.md` 与 `scripts/release.js` 的签名和热更基线门禁处理；当前 Draft 不能直接视作正式发版。

## 安卓测试 APK：快捷命令

在同一测试仓库内运行：

```powershell
cd mobile
npm install
npm run build:apk:debug
```

快捷命令将按仓库的 Stage -> Capacitor Sync -> Native Hash Verify -> Gradle assembleDebug 完整执行。
第一次缺少 `mobile/android` 原生工程时，自动执行含完整校验的 `npm run add:android`。以后每次从当前 `web/` 重新同步，不会打包旧 `www`。
脚本在打包前会检查 `web/.hot-update-manifest.json` 中的图像、音频与模型是否存在：若提示 `Missing ... essential artwork/audio files`，先恢复素材，不能绕过。

成功后的文件：`mobile/android/app/build/outputs/apk/debug/app-debug.apk`。
可在 `mobile` 目录运行 `explorer .\android\app\build\outputs\apk\debug\` 打开。

**不要直接用测试 APK 覆盖安装已有正式 APK**：如果两者签名不同，Android 会拒绝覆盖。先在旧版游戏内导出并备份存档，再决定是否安装测试包；调试签名的 APK 不能代替正式发行签名。

## 不想用命令：Android Studio

```powershell
cd mobile
npm run open
```

`npm run open` 会先执行完整 sync，然后打开 Android Studio。等待 Gradle 完成加载，在 Build 菜单使用 Build APK(s)；APK 仍在 `app/build/outputs/apk/debug/`。不要跳过 `npm run sync` 后直接打开旧原生目录打包。

## 游戏内 Gemini 设置（Windows/安卓基本相同）

1. 进入游戏，先在「典章 → API 连接」保存并测试正式主 API。这是诏令、外交、战争、财政及结束回合推演用的。
2. 勾选「人物对话使用免费 Gemini 3.5 Flash-Lite（实验）」并保存。点击「测试免费人物对话」；失败可能是 Google 匿名限流/地区不可用，不等于程序打包失败。
3. 「Google 登录态备用」不是游戏内 Google 一键登录。仅当你自己部署了 `gemini-web2api-go`、真实建立了 Google 登录会话，并通过自己的 HTTPS 网关暴露 `/v1/chat/completions` 时，才在游戏里填写网关地址、该网关的 API Key 和备用模型。
4. 匿名请求成功不触发备用；匿名 401/403/429/5xx 等失败时才最多使用一次用户主动配置的备用。备用失败不自动用付费主 API 冒充成功。
5. 发送人物对话、召见御前、测试鸿雁、再试一次结束回合；到回合报告里核对国家钱粮与人物状态是否被正确写入。建议在测试前另存存档。

## 仍未完成的上线验收

GitHub Actions 当前没有 PR #4 的可验证运行；还要全量运行 `node web/scripts/ci-smokes.js`、`node web/scripts/lint-arch-all.js`、官方剧本一致性及发布契约门禁，完成 Windows 和安卓真机联网测试。
正式发布前仓主必须走 `AGENTS.md` 的 `scripts/release.js` 准备/发布流程生成新版热更新清单与各端一致版本，不能手工修补版本号或基线，更不能发布缺美术资源的 APK。
