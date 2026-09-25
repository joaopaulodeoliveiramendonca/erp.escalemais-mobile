package com.escalemais.erp;

import android.net.Uri;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Espelho nativo da regra de src/config/urls.ts.
 *
 * A lista de domínios vem do capacitor.config.ts (plugins.EscaleNative.allowedHosts),
 * então existe uma única fonte de verdade.
 */
final class UrlPolicy {

    enum Decision {
        /** Carrega na WebView. */
        ALLOW,
        /** ERP em http:// → recarregar em https://. */
        UPGRADE,
        /** Abre fora do app (app correspondente ou navegador). */
        EXTERNAL,
        /** Deixa o Capacitor decidir (blob:, data:, about:). */
        DEFAULT
    }

    private final Set<String> allowedHosts;

    UrlPolicy(String[] hosts) {
        this.allowedHosts = new HashSet<>();
        if (hosts != null) {
            for (String h : Arrays.asList(hosts)) {
                if (h != null && !h.trim().isEmpty()) allowedHosts.add(h.trim().toLowerCase(Locale.ROOT));
            }
        }
    }

    boolean isAllowedHost(String host) {
        return host != null && allowedHosts.contains(host.toLowerCase(Locale.ROOT));
    }

    Decision decide(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        switch (scheme) {
            case "https":
                return isAllowedHost(uri.getHost()) ? Decision.ALLOW : Decision.EXTERNAL;
            case "http":
                return isAllowedHost(uri.getHost()) ? Decision.UPGRADE : Decision.EXTERNAL;
            case "blob":
            case "data":
            case "about":
            case "javascript":
                return Decision.DEFAULT;
            default:
                // tel:, mailto:, whatsapp:, intent:, market:…
                return Decision.EXTERNAL;
        }
    }
}
