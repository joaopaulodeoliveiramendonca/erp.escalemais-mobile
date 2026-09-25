import Foundation
import UIKit
import WebKit

/// Fica entre o WKWebView e o `WebViewDelegationHandler` do Capacitor.
///
/// Tudo que não é implementado aqui é repassado ao Capacitor (forwarding do
/// Objective-C), então o comportamento padrão continua intacto. Acrescenta:
///  - downloads (Content-Disposition, PDF, XML, CSV…) via WKDownload — funciona
///    também para POST e usa a sessão do Laravel;
///  - tela "Sem conexão" apenas em falha de REDE (não em 404/419/500 do ERP);
///  - `target="_blank"`/`window.open` de páginas do ERP na própria WebView
///    (o Capacitor mandaria para o Safari, sem a sessão).
final class EscaleWebViewProxy: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {

    private weak var original: NSObject?
    private weak var plugin: EscaleNativePlugin?
    private var destinations: [ObjectIdentifier: (url: URL, mimeType: String)] = [:]

    init(original: NSObject?, plugin: EscaleNativePlugin) {
        self.original = original
        self.plugin = plugin
        super.init()
    }

    // MARK: - Forwarding para o Capacitor

    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || (original?.responds(to: aSelector) ?? false)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if let original = original, original.responds(to: aSelector) {
            return original
        }
        return super.forwardingTarget(for: aSelector)
    }

    private var navigationDelegate: WKNavigationDelegate? { original as? WKNavigationDelegate }

    // MARK: - Downloads

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if navigationResponse.isForMainFrame, shouldDownload(navigationResponse) {
            decisionHandler(.download)
            return
        }
        decisionHandler(.allow)
    }

    private func shouldDownload(_ navigationResponse: WKNavigationResponse) -> Bool {
        let response = navigationResponse.response
        if let http = response as? HTTPURLResponse,
           let disposition = http.value(forHTTPHeaderField: "Content-Disposition"),
           disposition.lowercased().contains("attachment") {
            return true
        }
        if !navigationResponse.canShowMIMEType { return true }
        // Abertos "inline" o usuário ficaria preso num visualizador sem voltar;
        // viram arquivo com Visualizar/Compartilhar/Salvar.
        let fileTypes = ["application/pdf", "application/xml", "text/xml", "text/csv",
                         "application/zip", "application/octet-stream"]
        return fileTypes.contains((response.mimeType ?? "").lowercased())
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload,
                  decideDestinationUsing response: URLResponse,
                  suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        do {
            let folder = try EscaleNativePlugin.downloadsFolder()
            let name = EscaleNativePlugin.sanitizeFilename(suggestedFilename, mimeType: response.mimeType)
            let destination = folder.appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: destination.path) {
                try FileManager.default.removeItem(at: destination)
            }
            destinations[ObjectIdentifier(download)] = (destination, response.mimeType ?? "application/octet-stream")
            completionHandler(destination)
        } catch {
            completionHandler(nil)
            plugin?.downloadFailed("Não foi possível salvar o arquivo.")
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let info = destinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        plugin?.downloadFinished(fileURL: info.url, mimeType: info.mimeType)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinations.removeValue(forKey: ObjectIdentifier(download))
        plugin?.downloadFailed("Falha no download.")
    }

    // MARK: - Erros de rede

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        navigationDelegate?.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
        handle(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        navigationDelegate?.webView?(webView, didFail: navigation, withError: error)
        handle(error)
    }

    private func handle(_ error: Error) {
        let nsError = error as NSError
        guard nsError.domain == NSURLErrorDomain, Self.networkErrorCodes.contains(nsError.code) else { return }
        let failed = (nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL)?.absoluteString
        plugin?.showOfflinePage(failedURL: failed)
    }

    /// Falhas de rede/SSL. `cancelled` (-999) e "frame load interrupted" (download) ficam de fora.
    private static let networkErrorCodes: Set<Int> = [
        NSURLErrorNotConnectedToInternet,
        NSURLErrorNetworkConnectionLost,
        NSURLErrorCannotFindHost,
        NSURLErrorCannotConnectToHost,
        NSURLErrorDNSLookupFailed,
        NSURLErrorTimedOut,
        NSURLErrorInternationalRoamingOff,
        NSURLErrorCallIsActive,
        NSURLErrorDataNotAllowed,
        NSURLErrorCannotLoadFromNetwork,
        NSURLErrorSecureConnectionFailed,
        NSURLErrorServerCertificateHasBadDate,
        NSURLErrorServerCertificateUntrusted,
        NSURLErrorServerCertificateHasUnknownRoot,
        NSURLErrorServerCertificateNotYetValid,
        NSURLErrorClientCertificateRejected,
        NSURLErrorClientCertificateRequired,
        NSURLErrorAppTransportSecurityRequiresSecureConnection,
    ]

    // MARK: - Novas janelas

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if plugin?.isInternal(url) == true {
            webView.load(navigationAction.request) // mesma WebView, mesma sessão
        } else {
            plugin?.openExternal(url)
        }
        return nil
    }
}
