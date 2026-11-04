export interface TianmingDeepSeekWebPlugin {
  /** Opens a first-party WebView for user-managed DeepSeek sign-in. */
  openLogin(): Promise<{ closed: boolean }>;
  /** One visible browser generation at a time. Never exposes session cookies. */
  generate(options: { prompt: string; requestId: string; timeoutMs?: number }): Promise<{ text: string }>;
  /** Cancels an active request. */
  cancel(options: { requestId: string }): Promise<{ cancelled: boolean }>;
}
export declare const TianmingDeepSeekWeb: TianmingDeepSeekWebPlugin;
