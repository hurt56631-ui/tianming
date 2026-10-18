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


## Google 登录态备用（自建网关；可选）

《天命》不会索取、复制或存储 Google 登录 Cookie、密码或网页 XSRF。
Google 官方阻止普通 Android WebView 的 OAuth 登录，外部 Chrome 的登录 Cookie
也不会自动传给 Capacitor/Electron 游戏。

如果确实需要将**自己已登录的 Google Gemini 网页账号**作为人物对话备用，使用自己信任并
自己管理的 zexadev/gemini-web2api-go 服务：

1. 先在电脑/VPS 的自建网关部署后台，由管理员在其管理页配置自己的 Google 登录 Cookie，
   并通过其内置的认证检查确认不是“Cookie 无效而静默降级成匿名”。
   **切勿将 Cookie 发给《天命》、陌生服务器或他人**；不推荐在共享的免费在线转发站使用此方案。
2. 网关通过 HTTPS 提供 OpenAI-compatible \`/v1/chat/completions\`，且配置只限你
   设备使用的独立 API Key。App 手机与电脑均使用可达的 HTTPS 域名，不能使用
   指向电脑的 localhost。
3. 游戏中在「典章 → API 连接 → Google 登录态备用」勾选启用，
   填网关 \`https://自有域名/v1\`、网关 Key（**不是 Google Cookie**）和备用 Model ID
   （默认 \`gemini-3.5-flash-lite\`；网关验证真的有授权后可尝试 \`gemini-3.1-pro\`），
   单独点击「保存登录态备用」「测试备用网关」。
4. 只有匿名 Gemini Web 的人物对话失败且状态为 401/403/405/429/5xx 时，才最多
   尝试登录态备用一次；遇到 400/413/422、不合法输入、工具调用及取消均不回退。
   备用网关自己返回 429/401/403 时冷却 60 秒以上，不轮换账号、密钥、IP 或自动重试。
5. 登录态备用和主/次 API 完全分开。主 API 始终负责结束回合、
   战争/外交/国库、承诺提取及其他状态结算。所有备用配置信息只保存在当前设备的
   localStorage \`tm_gemini_login_backup_v1\`，不进入 \`P\` 存档，不会同步到另一设备；
   「清除备用」可擦除此份本地 Key 和 URL。

**不要误会：** 在浏览器里点击“使用 Google 账号登录”，不会使手机 App、电脑游戏
或第三方服务立即获得已登录的 Gemini Web 请求权限；必须是你自行控制的网关已经真实认证成功。
游戏的“备用网关测试成功”只验证文本 API 可达，仍需到网关后台确认 Google 登录有效。


### 旧安装包与普通网页的备用方式

登录态备用使用普通 HTTPS OpenAI-compatible API，故无需 Electron 的匿名 IPC 主进程。
如果旧电脑安装包暂未更新匿名桥，只要 renderer 已更新并且用户已明确启用备用网关，
在该设备上仍可进行备用对话。普通浏览器只能在网关正确配置 CORS 时使用。
匿名 Gemini Web 本身仍受 Electron 新主进程／Capacitor 原生插件限制。


安全细节：网关地址拒绝 Google 官方域名、无效域名与非 HTTPS 地址，
以防把独立网关 API Key 错发到 Google 登录页或陌生重定向终点；
网络请求明确禁止自动跨站跳转，不会复制或缓存 Google Cookie。


## 完整回合免费 Gemini 3.5（实验，默认关闭）

在「典章 → API 连接」打开「结束回合也尝试免费 Gemini 3.5」。与人物免费对话独立。可以在没有主 API Key 时启动回合，但网页模型不提供可靠的 schema、工具调用或长上下文支持；一旦任一关键回合 AI 请求失败、返回不可用 JSON、输入超过约 90KB 或触发拒绝访问，不能认为游戏成功推进，应由既有回合事务回滚至推演前存档。免费回合期间所有通过统一 AI 传输层的 primary/secondary 调用都重路由到本地虚拟 Gemini Web，并且拦截其他付费 AI 网络请求；不会自动切换到主 API。用户主动启用的独立 Google 登录态网关仍可在匿名失败时接手。超过 64 个模型调用会停止，避免异常循环。

复杂回合更推荐在主 API 里使用 Google AI Studio 自己申请的 Gemini API Key 和可用免费额度，结构化处理更加可控。千万不要向游戏内虚拟接口填写 Google 登录密码。**免费网页回合未经真实联网、真实剧情或长回合验收，不可视作稳定功能。**
