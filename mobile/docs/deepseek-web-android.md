# 天命 · DeepSeek 官方聊天网页接入（Android 实验版）

> **范围**：本功能只在重新安装了包含 `TianmingDeepSeekWeb` 原生插件的 Android APK 中运行。桌面 Electron、GitHub Pages 和旧版 APK 不支持。无需在服务器部署中转程序，也无需填写 DeepSeek API Key。它依赖用户本人登录的 DeepSeek 官方聊天网页，**并非官方 API**，存在网页改版、限流、服务协议和可靠性风险。不要把它作为需要稳定在线运行的服务。

## 玩家使用

1. 从包含本功能的新 APK 打开「设置 → API 连接」。
2. 在「DeepSeek 免费聊天网页 · Android 实验模式」点击「登录 DeepSeek」。在官方网站页面自行登录；返回游戏时不输入账号密码给游戏。
3. 先点击「检查网页结构」：由本设备已登录的 Android WebView 检查输入框、发送按钮和回复区的可见结构，**此步骤不发送消息**。检查通过后点击「测试网页生成」，成功后点击「用作主 AI」或「主次 AI 都使用」，**最后点击「保存所有设置」**。因为没有 API Key，游戏本地使用一个只供路由检测的占位 Key；不会向该虚拟端点发起公网请求。
4. 尽量先选择「精简」的 AI 调用深度、降低上下文长度，从小型剧本的一次问对和一次结束回合开始试验。
5. 若 DeepSeek 要求登录、人工验证、网页被限制、响应不完整或 JSON 校验失败，当前任务应失败而不是把不完整结果写入存档。若出现「重复发送已保护」，先检查 DeepSeek 页面是否已经生成上一条答案，再在设置里手动解锁。

## 技术方案

- 游戏继续使用原有 OpenAI Chat Completions 协议（主/次 AI 两路均可选）。
- `web/tm-deepseek-web.js` 只拦截 `https://tm-deepseek-web.invalid/v1/chat/completions`，不拦截正常 API、不访问外部中转。
- 通过 Capacitor 原生插件让 Android WebView 打开 `https://chat.deepseek.com/`，沿用 Android CookieManager 的设备内会话。用户自行登录；插件不读取凭据、Cookie，也不绕过网站验证。
- 原生插件分块接收最长约 **900KB** 的提示词，随后再按 8K 字符分批注入 WebView，避免超大 JavaScript 与 Capacitor 传输。请求串行处理，主动取消、错误和不完整回复不视为成功。
- 只有新一轮助手回答具备完成标志且连续稳定后才向游戏返回文本；结构化响应、工具调用、结算一致性仍由游戏现有校验器处理。
- 对可能已经提交的失败任务设置当前会话内的重复发送隔离，不自动重试造成重复动作。此隔离并非断电持久化；Android 进程崩溃后仍需人工核查是否重复执行。

## 开发/构建

原生插件位于 `mobile/plugins/tianming-deepseek-web/`，通过 `mobile/package.json` 的本地 file 依赖注册。按照原项目文档先生成本地 Android 工程：

```powershell
cd mobile
npm install
npm run add:android
npm run sync
npm run open
```

需使用真实设备测试登录、非流式回复完成、结构化 JSON、多次请求、退出恢复、图片/视频剧本、长文和网络中断；**当前提交未在 Android 真机编译或完成端到端推演**。原生插件无法通过 Capgo JS 热更添加，必须重新安装新 APK。打包与正式发布仍由仓主依据 `AGENTS.md` 流程操作。

## 已知限制

- DeepSeek 网站 DOM/CSS、登录流程与免费限制可能随时变化，不能保证每次生成都成功。目前无法直接审阅登录后的官方页面 DOM，因此提供设备内「检查网页结构」功能，不能把它当作已验证的实时网页兼容性证明。
- 截取到的网页正文不具备 API 原生 token usage、response_format 强制约束或原生 tool_use 保证。
- 网页一条回复最长等待约十分钟，几十次串行调用的整回合可能很慢。
- 超过提示词限制会明确报错而非静默截断；较大的真实剧本需要进一步优化游戏生成的上下文。
- 直接自动操作免费网页可能不符合服务条款；请遵守 DeepSeek 的服务协议，不要用它规避访问控制、限额或验证。
