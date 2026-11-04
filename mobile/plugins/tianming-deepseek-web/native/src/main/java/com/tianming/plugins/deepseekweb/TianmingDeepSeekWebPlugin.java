package com.tianming.plugins.deepseekweb;

import android.app.AlertDialog;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import org.json.JSONTokener;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Experimental first-party WebView automation for Android-only Tianming.
 * No cookies/passwords are exported, and no private DeepSeek network endpoints are called.
 * It uses visible web UI only, fails closed when login/DOM/completion is uncertain,
 * and intentionally never bypasses site challenges or usage limits.
 */
@CapacitorPlugin(name = "TianmingDeepSeekWeb")
public final class TianmingDeepSeekWebPlugin extends Plugin {
    private static final String CHAT_URL = "https://chat.deepseek.com/";
    private static final long POLL_MS = 750L;
    private static final int MAX_PROMPT_BYTES = 950_000;
    private static final String[] ANSWER_SELECTORS = {
            ".ds-assistant-message-main-content",
            "[data-message-author-role='assistant']",
            "[class*='assistant-message-main-content']"
    };
    private final Handler ui = new Handler(Looper.getMainLooper());
    private AlertDialog dialog;
    private WebView page;
    private PluginCall activeCall;
    private String activeId;
    private String pendingPrompt;
    private String bufferedRequestId;
    private StringBuilder bufferedPrompt;
    private boolean injecting;
    private long deadline;
    private int documentGeneration;
    private boolean started, sending, polling, cancelled;
    private int submitAttempts, emptyPolls;
    private String lastAnswer = "";
    private int stablePolls;
    private Runnable pollingTask;

    @PluginMethod
    public void openLogin(PluginCall call) {
        ui.post(() -> {
            if (activeCall != null || dialog != null) { call.reject("DeepSeek 网页窗口正在使用", "WEB_BUSY"); return; }
            createWindow("登录 DeepSeek · 登录后关闭返回设置", false);
            dialog.setOnDismissListener(d -> {
                destroyWindow();
                JSObject out = new JSObject();
                out.put("closed", true);
                call.resolve(out);
            });
            page.loadUrl(CHAT_URL);
        });
    }

    @PluginMethod
    public void beginPrompt(PluginCall call) {
        String id = call.getString("requestId");
        if (id == null || id.isEmpty()) { call.reject("缺少请求编号", "WEB_BAD_REQUEST"); return; }
        ui.post(() -> {
            if (activeCall != null || dialog != null || bufferedRequestId != null) {
                call.reject("DeepSeek 正在处理其他请求", "WEB_BUSY");
                return;
            }
            bufferedRequestId = id;
            bufferedPrompt = new StringBuilder();
            JSObject response = new JSObject();
            response.put("started", true);
            call.resolve(response);
        });
    }

    @PluginMethod
    public void appendPrompt(PluginCall call) {
        String id = call.getString("requestId");
        String chunk = call.getString("chunk");
        ui.post(() -> {
            if (id == null || !id.equals(bufferedRequestId) || bufferedPrompt == null || chunk == null) {
                call.reject("分块请求编号不匹配", "WEB_CHUNK_ID");
                return;
            }
            if ((bufferedPrompt.length() + chunk.length()) * 3L > 3L * MAX_PROMPT_BYTES) {
                bufferedRequestId = null;
                bufferedPrompt = null;
                call.reject("DeepSeek 网页提示词过长", "WEB_PROMPT_TOO_LONG");
                return;
            }
            bufferedPrompt.append(chunk);
            JSObject reply = new JSObject();
            reply.put("length", bufferedPrompt.length());
            call.resolve(reply);
        });
    }

    @PluginMethod
    public void generateBuffered(PluginCall call) {
        String id = call.getString("requestId");
        ui.post(() -> {
            if (id == null || !id.equals(bufferedRequestId) || bufferedPrompt == null) {
                call.reject("尚无完整分块提示词", "WEB_CHUNK_ID");
                return;
            }
            String prompt = bufferedPrompt.toString();
            bufferedRequestId = null;
            bufferedPrompt = null;
            launch(call, prompt, id);
        });
    }

    @PluginMethod
    public void generate(PluginCall call) {
        String text = call.getString("prompt");
        String id = call.getString("requestId");
        ui.post(() -> launch(call, text, id));
    }

    private void launch(PluginCall call, String text, String id) {
        if (text == null || text.trim().isEmpty() || id == null || id.trim().isEmpty()) {
            call.reject("缺少提示词或请求编号", "WEB_BAD_REQUEST");
            return;
        }
        if (text.getBytes(StandardCharsets.UTF_8).length > MAX_PROMPT_BYTES) {
            call.reject("网页模式单次提示词超过 950KB，请调低游戏上下文长度", "WEB_PROMPT_TOO_LONG");
            return;
        }
        if (activeCall != null || dialog != null) { call.reject("DeepSeek 正在处理其他请求", "WEB_BUSY"); return; }
        activeCall = call;
        activeId = id;
        pendingPrompt = text;
        started = false; sending = false; polling = false; cancelled = false; injecting = false;
        submitAttempts = 0; emptyPolls = 0; lastAnswer = ""; stablePolls = 0;
        int wait = call.getInt("timeoutMs", 600000);
        deadline = android.os.SystemClock.uptimeMillis() + Math.max(30000, Math.min(wait, 900000));
        createWindow("DeepSeek 网页推演 · 自动执行中", true);
        if (page == null) { fail("无法启动网页窗口", "WEB_NO_ACTIVITY"); return; }
        page.loadUrl(CHAT_URL);
        schedule(() -> {
            if (activeCall == call && android.os.SystemClock.uptimeMillis() >= deadline) {
                fail("DeepSeek 网页等待超时；无法确认是否已完成，不会继续结算", "WEB_TIMEOUT");
            }
        }, Math.max(30000, Math.min(wait, 900000)));
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("requestId");
        ui.post(() -> {
            boolean matching = activeCall != null && activeId != null && activeId.equals(id);
            if (matching) fail("用户已取消网页生成", "WEB_CANCELLED");
            if (bufferedRequestId != null && bufferedRequestId.equals(id)) { bufferedRequestId = null; bufferedPrompt = null; }
            JSObject o = new JSObject(); o.put("cancelled", matching); call.resolve(o);
        });
    }

    private void createWindow(String title, boolean generation) {
        if (getActivity() == null || getActivity().isFinishing()) {
            if (activeCall != null) fail("游戏窗口已关闭", "WEB_NO_ACTIVITY");
            return;
        }
        LinearLayout root = new LinearLayout(getActivity());
        root.setOrientation(LinearLayout.VERTICAL);
        TextView hint = new TextView(getActivity());
        hint.setText(generation
            ? "浏览器会自动提交当前游戏请求、读取回复并回传结算。不要在生成期间操作网页。遇到登录验证请手动完成，超时则停止。"
            : "请在下方网页手动登录 DeepSeek。账号与密码只输入官方网站，游戏不会读取密码或 Cookie。登录成功后关闭窗口。");
        hint.setTextSize(13);
        hint.setPadding(18, 12, 18, 12);
        root.addView(hint);
        page = new WebView(getActivity());
        page.setLayoutParams(new LinearLayout.LayoutParams(-1, 0, 1));
        WebSettings settings = page.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(null);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(page, false);
        root.addView(page);
        page.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                if (!generation || activeCall == null) return;
                if (!url.startsWith("https://chat.deepseek.com/")) { fail("网页离开了 DeepSeek 官方地址", "WEB_NAVIGATION"); return; }
                int doc = ++documentGeneration;
                schedule(() -> attemptFill(doc), 800);
            }
            @Override public void onReceivedSslError(WebView v, SslErrorHandler handler, android.net.http.SslError e) {
                handler.cancel();
                if (generation) fail("DeepSeek 网站证书校验失败", "WEB_SSL");
            }
            @Override public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (generation && request.isForMainFrame()) fail("DeepSeek 页面加载失败", "WEB_NETWORK");
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (generation) fail("Android WebView 渲染进程已终止", "WEB_RENDER_GONE");
                return true;
            }
        });
        dialog = new AlertDialog.Builder(getActivity())
            .setTitle(title)
            .setView(root)
            .setNegativeButton(generation ? "取消本次推演" : "关闭", (d, which) -> {
                if (generation && activeCall != null) fail("已取消本次网页推演", "WEB_CANCELLED");
            }).create();
        dialog.setCanceledOnTouchOutside(false);
        if (generation) {
            dialog.setOnCancelListener(d -> { if (activeCall != null) fail("已取消本次网页推演", "WEB_CANCELLED"); });
        }
        dialog.show();
        if (dialog.getWindow() != null) {
            android.view.WindowManager.LayoutParams params = dialog.getWindow().getAttributes();
            params.width = android.view.WindowManager.LayoutParams.MATCH_PARENT;
            params.height = (int)(getActivity().getResources().getDisplayMetrics().heightPixels * 0.91);
            dialog.getWindow().setAttributes(params);
        }
    }

    private void schedule(Runnable work, long ms) { ui.postDelayed(work, ms); }

    private String jsValue(String json) {
        if (json == null) return "";
        try { Object parsed = new JSONTokener(json).nextValue(); return String.valueOf(parsed); }
        catch (Exception ignored) { return ""; }
    }

    private void eval(String js, java.util.function.Consumer<String> callback) {
        WebView current = page;
        if (current == null || activeCall == null) return;
        current.evaluateJavascript(js, value -> {
            if (current == page && activeCall != null) callback.accept(jsValue(value));
        });
    }

    private String fillJs() {
        return "(function(){try{"
            + "function visible(e){if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';}"
            + "const els=[...document.querySelectorAll('textarea[name=search],textarea[placeholder*=DeepSeek],textarea,[contenteditable=true],[role=textbox]')].filter(visible);"
            + "const e=els.length?els[els.length-1]:null;if(!e||e.disabled)return 'waiting';"
            + "const t=window.__tmGamePrompt||'';e.focus();"
            + "if(e.tagName==='TEXTAREA'){let setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value');if(setter&&setter.set)setter.set.call(e,t);else e.value=t;}else e.textContent=t;"
            + "try{e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:t}));}catch(_){e.dispatchEvent(new Event('input',{bubbles:true}));}"
            + "e.dispatchEvent(new Event('change',{bubbles:true}));return 'filled';"
            + "}catch(e){return 'waiting';}})();";
    }

    private void attemptFill(int doc) {
        if (activeCall == null || doc != documentGeneration || sending || polling) return;
        eval("(function(){try{if(/\\/(login|signin|register|signup)(\\/|$)/.test(location.pathname))return 'login';return document.querySelector('input[type=password]')?'login':'ready';}catch(e){return 'waiting';}})();",
            result -> {
                if (!"ready".equals(result)) {
                    if (submitAttempts++ < 40) schedule(() -> attemptFill(doc), 1000);
                    else fail("请先在 DeepSeek 网页完成登录或验证", "WEB_LOGIN_REQUIRED");
                    return;
                }
                if (injecting) return;
                injecting = true;
                eval("(function(){window.__tmGamePrompt='';return true;})()", ready -> injectChunks(doc, 0));
            });
    }

    /** JS evaluation crosses Android WebView IPC. Assemble in short chunks, not one 1MB script. */
    private void injectChunks(int doc, int offset) {
        if (activeCall == null || doc != documentGeneration || !injecting || pendingPrompt == null) return;
        if (offset >= pendingPrompt.length()) {
            eval(fillJs(), state -> {
                injecting = false;
                if ("filled".equals(state)) {
                    sending = true;
                    // Clear the temporary JavaScript variable once React has accepted the input.
                    eval("(function(){window.__tmGamePrompt='';return true;})()", ignored -> {});
                    schedule(() -> attemptSubmit(doc), 500);
                } else if (submitAttempts++ < 40) {
                    schedule(() -> attemptFill(doc), 1000);
                } else fail("未能找到 DeepSeek 网页输入框", "WEB_COMPOSER_NOT_FOUND");
            });
            return;
        }
        int end = Math.min(pendingPrompt.length(), offset + 8192);
        if (end < pendingPrompt.length() && end > offset &&
                Character.isHighSurrogate(pendingPrompt.charAt(end - 1)) &&
                Character.isLowSurrogate(pendingPrompt.charAt(end))) end--;
        String chunk = pendingPrompt.substring(offset, end);
        String js = "(function(){window.__tmGamePrompt=(window.__tmGamePrompt||'')+" + JSONObject.quote(chunk) + ";return true;})()";
        eval(js, result -> {
            if (!"true".equals(result)) { fail("向 WebView 传输提示词失败", "WEB_CHUNK_SEND"); return; }
            injectChunks(doc, end);
        });
    }

    private String submitJs() {
        return "(function(){try{"
            + "function vis(e){if(!e)return false;let r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';}"
            + "let btns=[...document.querySelectorAll('button')].filter(vis);"
            + "let b=btns.find(x=>{let a=((x.getAttribute('aria-label')||'')+' '+(x.title||'')).toLowerCase();return /^(send|发送|发送消息|send message)$/.test(a.trim());});"
            + "if(!b)b=btns.find(x=>{let paths=[...x.querySelectorAll('svg path')];return paths.some(p=>(p.getAttribute('d')||'').startsWith('M8.3125 0.981587C8.66767'))});"
            + "if(!b||b.disabled||b.getAttribute('aria-disabled')==='true')return 'waiting';"
            + "let before=document.querySelectorAll('.ds-assistant-message-main-content,[data-message-author-role=assistant],[class*=assistant-message-main-content]');"
            + "window.__tianmingDeepseekCount=before.length;"
            + "window.__tianmingDeepseekLast=before.length?(before[before.length-1].innerText||''):'';"
            + "b.click();return 'clicked';"
            + "}catch(e){return 'waiting';}})();";
    }

    private void attemptSubmit(int doc) {
        if (activeCall == null || doc != documentGeneration || polling) return;
        eval(submitJs(), result -> {
            if ("clicked".equals(result)) {
                polling = true;
                schedule(() -> poll(doc), POLL_MS);
            } else if (submitAttempts++ < 15) schedule(() -> attemptSubmit(doc), 650);
            else fail("DeepSeek 发送按钮不可用（可能超长、受限或需要验证），本次未重复发送", "WEB_SEND_UNAVAILABLE");
        });
    }

    private String readJs() {
        return "(function(){try{"
            + "function vis(e){if(!e)return false;let r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';}"
            + "let roots=[...document.querySelectorAll('.ds-assistant-message-main-content,[data-message-author-role=assistant],[class*=assistant-message-main-content]')];"
            + "let old=Number(window.__tianmingDeepseekCount||0);"
            + "let root=roots.length>old?roots[roots.length-1]:null;"
            + "if(!root&&roots.length){let latest=roots[roots.length-1];if((latest.innerText||'').trim()!==(window.__tianmingDeepseekLast||'').trim())root=latest;}"
            + "let txt=root?(root.innerText||root.textContent||'').trim():'';"
            + "let buttons=[...document.querySelectorAll('button,[role=button]')].filter(vis);"
            + "let busy=buttons.some(b=>/stop generating|stop generation|停止生成|停止回答/.test(((b.innerText||'')+' '+(b.getAttribute('aria-label')||'')+' '+(b.title||'')).toLowerCase()));"
            + "let complete=false;if(root) {let p=root;for(let i=0;p&&i<5;i++,p=p.parentElement){"
            + "let nearby=[...p.querySelectorAll('button,[role=button]')].filter(vis);if(nearby.some(b=>/copy|复制/.test(((b.getAttribute('aria-label')||'')+' '+(b.title||'')).toLowerCase()))) {complete=true;break;}}}"
            + "return JSON.stringify({text:txt,busy:busy,complete:complete});"
            + "}catch(e){return JSON.stringify({text:'',busy:true,complete:false});}})();";
    }

    private void poll(int doc) {
        if (activeCall == null || doc != documentGeneration || !polling) return;
        eval(readJs(), raw -> {
            if (activeCall == null || doc != documentGeneration) return;
            try {
                JSONObject result = new JSONObject(raw);
                String text = result.optString("text", "").trim();
                boolean busy = result.optBoolean("busy", true);
                boolean complete = result.optBoolean("complete", false);
                if (text.isEmpty()) {
                    if (++emptyPolls > 200) { fail("网页未返回新的助手消息", "WEB_NO_REPLY"); return; }
                    schedule(() -> poll(doc), POLL_MS);
                    return;
                }
                stablePolls = text.equals(lastAnswer) ? stablePolls + 1 : 1;
                lastAnswer = text;
                // Never return partial streaming text. A visible message-level copy action
                // plus repeated stability is required before the game can apply a state delta.
                if (!busy && complete && stablePolls >= 3) {
                    JSObject resultData = new JSObject();
                    resultData.put("text", text);
                    PluginCall done = activeCall;
                    finish();
                    done.resolve(resultData);
                } else {
                    schedule(() -> poll(doc), POLL_MS);
                }
            } catch (Exception error) { fail("无法解析 DeepSeek 网页响应", "WEB_PARSE"); }
        });
    }

    private void fail(String message, String code) {
        if (activeCall == null) return;
        PluginCall done = activeCall;
        finish();
        done.reject(message, code);
    }

    private void finish() {
        activeCall = null; activeId = null; pendingPrompt = null;
        bufferedRequestId = null; bufferedPrompt = null; injecting = false;
        cancelled = true; started = false; sending = false; polling = false;
        destroyWindow();
    }

    private void destroyWindow() {
        WebView old = page;
        page = null;
        if (old != null) {
            old.stopLoading();
            old.loadUrl("about:blank");
            old.destroy();
        }
        AlertDialog d = dialog; dialog = null;
        if (d != null && d.isShowing()) d.dismiss();
    }

    @Override protected void handleOnDestroy() {
        ui.post(() -> {
            if (activeCall != null) fail("页面关闭，DeepSeek 任务已取消", "WEB_DESTROYED");
            else destroyWindow();
        });
        super.handleOnDestroy();
    }
}
