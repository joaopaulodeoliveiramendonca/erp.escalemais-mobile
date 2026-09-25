package com.escalemais.erp;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Camada nativa própria do app (Android). Par da versão iOS em ios/App/App/EscaleNativePlugin.swift
 * e da interface JS em src/native/escaleNative.ts.
 *
 * Responsabilidades:
 *  1. Injetar www/escale-bridge.js (window.EscaleApp) SOMENTE na origem do ERP.
 *  2. Regra de navegação: domínios permitidos na WebView; o resto abre fora do app.
 *  3. Tela "Sem conexão" em falha de rede (via EscaleWebViewClient).
 *  4. Downloads: entrega ao JS (que baixa com a sessão e oferece Visualizar/Compartilhar/Salvar).
 *  5. Impressão nativa (window.print não funciona em WebView).
 *  6. Cor de fundo nativa e persistência dos cookies da sessão.
 */
@CapacitorPlugin(name = "EscaleNative")
public class EscaleNativePlugin extends Plugin {

    private static final String TAG = "EscaleNative";
    private static final String ERROR_PLACEHOLDER = "__ESCALE_ERROR_JSON__";

    private UrlPolicy policy;
    private String erpOrigin;
    private String offlineUrl;
    private String bridgeScript;
    private String offlineTemplate;
    private boolean injectedAtDocumentStart = false;

    /** Mantém a WebView de impressão viva até o diálogo abrir. */
    private WebView printWebView;

    @Override
    public void load() {
        erpOrigin = trimSlash(getConfig().getString("erpOrigin", "https://erp.escalemais.com"));
        policy = new UrlPolicy(getConfig().getArray("allowedHosts", new String[] { Uri.parse(erpOrigin).getHost() }));
        offlineUrl = getConfig().getString("offlineUrl", "");
        bridgeScript = readAsset("public/" + getConfig().getString("bridgeScript", "escale-bridge.js"));
        offlineTemplate = readAsset("public/" + getConfig().getString("offlinePage", "offline.html"));

        bridge.setWebViewClient(new EscaleWebViewClient(bridge, this));
        bridge.getWebView().setDownloadListener(this::onDownloadStart);

        // Fallback para WebViews sem DOCUMENT_START_SCRIPT (muito antigas): injeta ao fim do carregamento.
        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    if (injectedAtDocumentStart || bridgeScript == null) return;
                    Uri current = Uri.parse(String.valueOf(webView.getUrl()));
                    if ("https".equals(current.getScheme()) && policy.isAllowedHost(current.getHost())) {
                        webView.evaluateJavascript(bridgeScript, null);
                    }
                }
            }
        );
    }

    /**
     * Chamado pela MainActivity DEPOIS do super.onCreate(), para que a bridge
     * rode logo após o native-bridge do Capacitor em cada documento.
     */
    void installBridgeScript() {
        if (bridgeScript == null) {
            Logger.error(TAG, "escale-bridge.js não encontrado em assets/public. Rode `npm run build && npx cap sync`.", null);
            return;
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        try {
            WebViewCompat.addDocumentStartJavaScript(bridge.getWebView(), bridgeScript, Collections.singleton(erpOrigin));
            injectedAtDocumentStart = true;
        } catch (IllegalArgumentException e) {
            Logger.error(TAG, "Origem inválida para injeção: " + erpOrigin, e);
        }
    }

    // ---------------------------------------------------------------- navegação

    @Override
    public Boolean shouldOverrideLoad(Uri url) {
        switch (policy.decide(url)) {
            case ALLOW:
                return false;
            case UPGRADE:
                bridge.getWebView().loadUrl(url.buildUpon().scheme("https").build().toString());
                return true;
            case EXTERNAL:
                openExternal(url);
                return true;
            default:
                return null;
        }
    }

    private void openExternal(Uri url) {
        Intent intent;
        try {
            if ("intent".equalsIgnoreCase(url.getScheme())) {
                intent = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
                // Segurança: só atividades públicas "browsable", nunca componentes internos.
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, url);
            }
        } catch (Exception e) {
            showToast("Link inválido.");
            return;
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            String fallback = intent.getStringExtra("browser_fallback_url");
            if (fallback != null && fallback.startsWith("https://")) {
                openExternal(Uri.parse(fallback));
            } else {
                showToast("Nenhum aplicativo disponível para abrir este link.");
            }
        }
    }

    // ------------------------------------------------------------ tela offline

    /** Mostra a página local "Sem conexão". Chamado pelo EscaleWebViewClient. */
    void showOfflinePage(String failedUrl) {
        if (offlineTemplate == null) return;
        Uri failed = failedUrl == null ? null : Uri.parse(failedUrl);
        String retryUrl = failed != null && "https".equals(failed.getScheme()) && policy.isAllowedHost(failed.getHost())
            ? failedUrl
            : erpOrigin + "/login";

        JSONObject info = new JSONObject();
        try {
            info.put("failedUrl", retryUrl);
            info.put("offlineUrl", offlineUrl == null ? "" : offlineUrl);
        } catch (JSONException ignored) {
            // valores são strings simples
        }
        String html = offlineTemplate.replace(ERROR_PLACEHOLDER, info.toString().replace("</", "<\\/"));

        getActivity()
            .runOnUiThread(() ->
                // Mesma origem do ERP: o JS da página e a splash funcionam; nenhum request é feito.
                bridge.getWebView().loadDataWithBaseURL(erpOrigin + "/", html, "text/html", "UTF-8", null)
            );
    }

    // --------------------------------------------------------------- downloads

    private void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long length) {
        Uri uri = Uri.parse(url);
        String scheme = String.valueOf(uri.getScheme());
        boolean local = scheme.equals("blob") || scheme.equals("data");
        boolean internal = scheme.equals("https") && policy.isAllowedHost(uri.getHost());

        if (!local && !internal) {
            // Arquivo de outro site: o navegador do sistema baixa.
            openExternal(uri);
            return;
        }

        String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);

        if (hasListeners("downloadRequested")) {
            JSObject data = new JSObject();
            data.put("url", url);
            data.put("filename", filename);
            data.put("mimeType", mimeType);
            data.put("contentDisposition", contentDisposition);
            notifyListeners("downloadRequested", data);
        } else if (internal) {
            // Bridge indisponível: usa o gerenciador de downloads do sistema, com a sessão.
            enqueueSystemDownload(url, userAgent, mimeType, filename);
        }
    }

    private void enqueueSystemDownload(String url, String userAgent, String mimeType, String filename) {
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            request.addRequestHeader("User-Agent", userAgent);
            request.setMimeType(mimeType);
            request.setTitle(filename);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
            DownloadManager dm = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            dm.enqueue(request);
            showToast("Baixando " + filename + "…");
        } catch (Exception e) {
            JSObject data = new JSObject();
            data.put("error", "Falha ao iniciar o download.");
            notifyListeners("downloadFailed", data);
            showToast("Não foi possível baixar o arquivo.");
        }
    }

    // --------------------------------------------------------------- impressão

    @PluginMethod
    public void print(PluginCall call) {
        final String jobName = call.getString("jobName", "Escale Mais");
        final String html = call.getString("html");
        String requestedBase = call.getString("baseUrl", erpOrigin + "/");
        Uri base = Uri.parse(requestedBase);
        final String baseUrl = "https".equals(base.getScheme()) && policy.isAllowedHost(base.getHost()) ? requestedBase : erpOrigin + "/";

        getActivity()
            .runOnUiThread(() -> {
                PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                if (printManager == null) {
                    call.reject("Impressão indisponível neste dispositivo.");
                    return;
                }
                if (html == null) {
                    printManager.print(jobName, bridge.getWebView().createPrintDocumentAdapter(jobName), new PrintAttributes.Builder().build());
                    call.resolve();
                    return;
                }

                WebView pw = new WebView(getActivity());
                pw.getSettings().setJavaScriptEnabled(false);
                pw.setWebViewClient(
                    new WebViewClient() {
                        private boolean started = false;

                        @Override
                        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                            return true; // documento estático: nada de navegação
                        }

                        @Override
                        public void onPageFinished(WebView view, String url) {
                            if (started) return;
                            started = true;
                            printManager.print(jobName, view.createPrintDocumentAdapter(jobName), new PrintAttributes.Builder().build());
                            printWebView = null;
                            call.resolve();
                        }
                    }
                );
                printWebView = pw;
                pw.loadDataWithBaseURL(baseUrl, html, "text/html", "UTF-8", null);
            });
    }

    // ---------------------------------------------------------------- aparência

    @PluginMethod
    public void setBackgroundColor(PluginCall call) {
        final int color;
        try {
            color = Color.parseColor(call.getString("color", "#ffffff"));
        } catch (IllegalArgumentException e) {
            call.reject("Cor inválida. Use #RRGGBB.");
            return;
        }
        getActivity()
            .runOnUiThread(() -> {
                getActivity().getWindow().getDecorView().setBackgroundColor(color);
                View parent = (View) bridge.getWebView().getParent();
                if (parent != null) parent.setBackgroundColor(color);
                call.resolve();
            });
    }

    // ------------------------------------------------------------------ sessão

    @Override
    protected void handleOnPause() {
        // Grava os cookies da sessão do Laravel em disco (não perde login se o sistema matar o app).
        CookieManager.getInstance().flush();
    }

    @Override
    protected void handleOnStop() {
        CookieManager.getInstance().flush();
    }

    // --------------------------------------------------------------- utilitários

    private String readAsset(String path) {
        try (InputStream in = getContext().getAssets().open(path); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            Logger.error(TAG, "Asset não encontrado: " + path, e);
            return null;
        }
    }

    private void showToast(String text) {
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), text, Toast.LENGTH_SHORT).show());
    }

    private static String trimSlash(String value) {
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
