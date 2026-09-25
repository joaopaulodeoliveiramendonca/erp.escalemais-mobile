package com.escalemais.erp;

import android.net.http.SslError;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import java.util.Locale;

/**
 * WebViewClient do app: mantém tudo do Capacitor e acrescenta
 *
 *  - tela "Sem conexão" SOMENTE em falha de rede do frame principal
 *    (o errorPath do Capacitor também troca 404/419/500 do Laravel — por isso não é usado);
 *  - erro de certificado: nunca prossegue (validação SSL intacta);
 *  - processo da WebView encerrado pelo sistema: recria a tela em vez de fechar o app.
 */
class EscaleWebViewClient extends BridgeWebViewClient {

    private final Bridge bridge;
    private final EscaleNativePlugin plugin;

    EscaleWebViewClient(Bridge bridge, EscaleNativePlugin plugin) {
        super(bridge);
        this.bridge = bridge;
        this.plugin = plugin;
    }

    @Override
    public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        super.onReceivedError(view, request, error);
        if (request.isForMainFrame() && isNetworkError(error)) {
            plugin.showOfflinePage(request.getUrl().toString());
        }
    }

    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        // Nunca aceitar certificado inválido (ERP empresarial; wi-fi com portal cativo cai aqui).
        handler.cancel();
        plugin.showOfflinePage(error.getUrl());
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        if (super.onRenderProcessGone(view, detail)) return true;
        // Sem isto o Android encerra o app inteiro. Recria a Activity; a sessão (cookies) continua.
        if (bridge.getActivity() != null) bridge.getActivity().recreate();
        return true;
    }

    private static boolean isNetworkError(WebResourceError error) {
        switch (error.getErrorCode()) {
            case WebViewClient.ERROR_HOST_LOOKUP:
            case WebViewClient.ERROR_CONNECT:
            case WebViewClient.ERROR_TIMEOUT:
            case WebViewClient.ERROR_IO:
            case WebViewClient.ERROR_PROXY_AUTHENTICATION:
            case WebViewClient.ERROR_FAILED_SSL_HANDSHAKE:
                return true;
            case WebViewClient.ERROR_UNKNOWN:
                // ERR_ABORTED (navegação cancelada/virou download) também chega como UNKNOWN: filtrar.
                String d = String.valueOf(error.getDescription()).toUpperCase(Locale.ROOT);
                return d.contains("INTERNET_DISCONNECTED") ||
                    d.contains("NETWORK_CHANGED") ||
                    d.contains("NAME_NOT_RESOLVED") ||
                    d.contains("ADDRESS_UNREACHABLE") ||
                    d.contains("CONNECTION_") ||
                    d.contains("TIMED_OUT");
            default:
                return false;
        }
    }
}
