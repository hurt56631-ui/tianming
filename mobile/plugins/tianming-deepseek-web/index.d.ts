export interface TianmingDeepSeekWebPlugin {
  /** Opens a first-party WebView for user-managed DeepSeek sign-in. */
  openLogin(): Promise<{ closed: boolean }>;
  /** One visible browser generation at a time. Never exposes session cookies. */
  generate(options: { prompt: string; requestId: string; timeoutMs?: number }): Promise<{ text: string }>;
  /** Buffers large prompts in small Capacitor messages to avoid Android IPC limits. */
  beginPrompt(options: { requestId: string }): Promise<{ started: boolean }>;
  appendPrompt(options: { requestId: string; chunk: string }): Promise<{ length: number }>;
  generateBuffered(options: { requestId: string; timeoutMs?: number }): Promise<{ text: string }>;
  /** Cancels an active or buffered request. */
  cancel(options: { requestId: string }): Promise<{ cancelled: boolean }>;
}
export declare const TianmingDeepSeekWeb: TianmingDeepSeekWebPlugin;
