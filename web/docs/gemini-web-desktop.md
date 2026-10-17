# 《天命》Gemini Web 匿名桌面通道（实验性）

本方案移植了账号私有安卓项目 GeminiWebManager 的匿名请求机制。它是 Google 未公开的 Gemini 网页内部协议，不是正式 API、不保证长期可用，不提供无限免费额度。

## 开启

在安装了新主进程的开发版 Electron「典章 → API 连接」里，选择「Gemini Web·免密钥实验（仅桌面）」，虚拟 Base URL、模型 ID 和非敏感本地 Key 标识自动填好。此标识不是 Google API Key，也不会发给 Google。保存后可点击「测试连接」发出一次匿名测试。

此选项目前不支持 GitHub Pages、普通网页、Capacitor APK 或未升级的旧 Electron 主程序。旧客户端只收到网页文件热更，不会获得主进程桥接能力。

## 约束和降级

- 只发送到固定 gemini.google.com 匿名网页路径；不读取登录 Cookie、Google 账户或会话令牌。
- 429 / 403 进入至少一分钟本地冷却，不换账号、代理或 IP 绕限流。
- 内部版本号失效（405）仅刷新一次后再试；不无限循环。
- 每次输入最多 95KB UTF-8，单次响应最多 4MB。
- 回合中多个并发调用按顺序提交，最多排 32 项；重试仍受游戏自己的总预算制约。
- 仅兼容普通聊天、JSON 及模拟的 SSE；SSE 在完整结果到达后才输出，并非逐字流式。
- 由于匿名接口没有原生 function calling，Agent 工具请求明确失败（422），不伪造执行成功。
- 失败不会自动偷用付费密钥。要稳定推进大量回合，请切换官方 Gemini API（可使用其免费层）或其他服务商。
- 由于未获得官方 Token 用量，成本统计不可据此推断实际额度。
- 使用前检查 Google 当前服务条款。该接口有变更、封禁或地区限制风险。

测试：node web/scripts/smoke-gemini-web-desktop.js
上线前还需完整 CI、Windows Electron 实机测试及官方接口可用性核实。
