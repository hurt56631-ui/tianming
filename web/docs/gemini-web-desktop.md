# 《天命》Gemini Web 人物免费对话：电脑 / 安卓实验版

## 角色划分

- 设置中继续用有效的官方或 OpenAI 兼容 **主 API** 作为回合引擎，填入真实 Key、Base URL、Model ID。
- 在「典章 → API 连接」勾选「人物对话使用免费 Gemini 3.5 Flash-Lite（实验）」，再保存。
- 问对、人物开场白、御前发言、廷议发言、常朝人物实时发言/争辩/预览，优先使用免 API Key 的 Gemini Web 匿名请求；若正在结算则仍走正常 API。
- 独立的承诺抽取、廷议立场变化判定、政治后果、诏令与军政结算、结束回合的 AI/后台后续调用仍走现有主/次 API。注意：原问对代码还会按人物发言内容直接增减少量忠诚、情绪、关系，这种即时角色互动仍可能受免费模型影响。
- 游戏正在结束回合时触发的附带人物对话仍用现有 API；不会为节省调用而改写账目。

## 平台

- Electron：通过主进程 main-gemini-web.js 的匿名网页请求；需要新版完整桌面安装包，旧主进程只下载 Web 热更不会生效。
- 安卓 Capacitor：通过既有 CapacitorHttp 原生网络插件和 web/tm-gemini-web-mobile.js；不新增安卓原生插件。但 Android 真机网络仍需验收。
- GitHub Pages / 普通浏览器：不支持匿名网页协议，选用时显示错误，不会偷偷使用付费 API 回退。

默认 Gemini Web 模型是 **gemini-3.5-flash-lite**，网页模型 hash cf41b0e0dd7d53e5，mode 6。
此型号和参数参考 zexadev/gemini-web2api-go 与 yeahhe365/Gemini-Nexus 的最新资料。
**gemini-3.5-flash** 不是当前可用别名，不能把 3.5 Flash-Lite 当成 3.8 Flash。

## 自建 Go 代理（可选）

zexadev/gemini-web2api-go 可以独立运行，暴露 OpenAI-compatible /v1/chat/completions。
在《天命》已有自定义 API 设置中可手动使用该代理的 Base URL、密钥与模型
gemini-3.5-flash-lite；不要求修改 APK。手机的 localhost 是手机自己，不能直接指向
电脑的 127.0.0.1:8083。远端需要可靠 HTTPS 与鉴权，不能暴露无密钥公网管理入口。
此 Go 代理不是 APK 内置服务，也不是电脑匿名桥的依赖。

## 警告

本实验功能使用未公开 Google 网页接口，Google 服务条款可能禁止；不保证持续可用
或无限免费。不要轮换账号或 IP 规避 Google 限流，也不读取登录 Cookie。
403/429/验证重定向时进入本地冷却。单次提示词最多 95KB UTF-8。
网页版 ChatCompletion 兼容层只支持文本，不实现真正 function calling；
兼容 SSE 是等网页返回完整文本再生成的，不是逐字流式。
已写入代码不代表已经在 Google 联网、Electron 或 Android 实机成功，需要完成
API 计数、退出读档、NPC 问对、结算一致性和拒绝访问时的恢复测试。

开发验证：node web/scripts/smoke-gemini-web-desktop.js；
node web/scripts/smoke-gemini-web-mobile.js。
合并发布前仍需全仓库测试门禁和实机验收。
