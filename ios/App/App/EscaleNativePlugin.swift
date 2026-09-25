import Foundation
import UIKit
import WebKit
import Capacitor

/// Camada nativa própria do app (iOS). Par da versão Android em
/// android/app/src/main/java/com/escalemais/erp/EscaleNativePlugin.java e da
/// interface JS em src/native/escaleNative.ts.
///
/// Responsabilidades:
///  1. Injetar www/escale-bridge.js (window.EscaleApp) SOMENTE na origem do ERP.
///  2. Regra de navegação: domínios permitidos na WebView; o resto abre fora.
///  3. Tela "Sem conexão" em falha de rede, downloads e novas janelas (EscaleWebViewProxy).
///  4. Impressão nativa (window.print não funciona no WKWebView).
///  5. Cor de fundo nativa.
@objc(EscaleNativePlugin)
public class EscaleNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "EscaleNativePlugin"
    public let jsName = "EscaleNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBackgroundColor", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSafeAreaMode", returnType: CAPPluginReturnPromise),
    ]

    private static let errorPlaceholder = "__ESCALE_ERROR_JSON__"

    private var erpOrigin = URL(string: "https://erp.escalemais.com")!
    private var allowedHosts: Set<String> = []
    private var offlineURLString = ""
    private var offlineTemplate: String?
    private var bridgeScriptName = "escale-bridge.js"
    private var proxy: EscaleWebViewProxy?
    private var printLoader: PrintLoader?

    override public func load() {
        let config = getConfig()
        if let origin = config.getString("erpOrigin"), let url = URL(string: origin) {
            erpOrigin = url
        }
        let hosts = (config.getArray("allowedHosts") as? [String]) ?? [erpOrigin.host ?? ""]
        allowedHosts = Set(hosts.map { $0.lowercased() })
        offlineURLString = config.getString("offlineUrl", "") ?? ""
        offlineTemplate = Self.readPublicFile(config.getString("offlinePage", "offline.html") ?? "offline.html")

        bridgeScriptName = config.getString("bridgeScript", "escale-bridge.js") ?? "escale-bridge.js"

        guard let webView = webView else { return }

        // Voltar com o gesto da borda esquerda (padrão iOS; não há botão físico).
        webView.allowsBackForwardNavigationGestures = config.getBoolean("iosSwipeBack", true)

        let proxy = EscaleWebViewProxy(original: webView.navigationDelegate as? NSObject, plugin: self)
        self.proxy = proxy // navigationDelegate/uiDelegate são weak
        webView.navigationDelegate = proxy
        webView.uiDelegate = proxy
    }

    // MARK: - Bridge JS

    /// Chamado pelo MainViewController DEPOIS de registerPluginInstance: o
    /// Capacitor roda load() antes de exportar a definição JS do plugin, e a
    /// bridge precisa encontrar `EscaleNative` já declarado ao rodar.
    func installBridgeScript() {
        let file = bridgeScriptName
        guard let source = Self.readPublicFile(file) else {
            CAPLog.print("⚡️  EscaleNative: \(file) não encontrado. Rode `npm run build && npx cap sync`.")
            return
        }
        // WKUserScript não filtra por origem: a condição garante que só o ERP recebe a bridge.
        let origin = Self.origin(of: erpOrigin)
        let guarded = "if (window.location.origin === '\(origin)') {\n\(source)\n}"
        let script = WKUserScript(source: guarded, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        webView?.configuration.userContentController.addUserScript(script)
    }

    // MARK: - Navegação

    func isInternal(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && allowedHosts.contains(url.host?.lowercased() ?? "")
    }

    override public func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return nil }
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

        switch scheme {
        case "https":
            if isInternal(url) { return false }
            guard isMainFrame else { return nil } // iframes (mapas, vídeos) seguem o padrão
            openExternal(url)
            return true
        case "http":
            if allowedHosts.contains(url.host?.lowercased() ?? ""),
               var components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
                components.scheme = "https"
                if let secure = components.url { webView?.load(URLRequest(url: secure)) }
                return true
            }
            guard isMainFrame else { return true } // nunca carregar http dentro do app
            openExternal(url)
            return true
        case "about", "blob", "data", "javascript", "capacitor":
            return nil
        default:
            // tel:, mailto:, whatsapp:, maps:, itms-apps:…
            openExternal(url)
            return true
        }
    }

    func openExternal(_ url: URL) {
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if !opened { CAPLog.print("⚡️  EscaleNative: nenhum app para abrir o link externo") }
            }
        }
    }

    // MARK: - Tela offline

    func showOfflinePage(failedURL: String?) {
        guard let template = offlineTemplate else { return }
        let retry: String
        if let failed = failedURL, let url = URL(string: failed), isInternal(url) {
            retry = failed
        } else {
            retry = erpOrigin.appendingPathComponent("login").absoluteString
        }
        let info: [String: String] = ["failedUrl": retry, "offlineUrl": offlineURLString]
        guard let data = try? JSONSerialization.data(withJSONObject: info),
              let json = String(data: data, encoding: .utf8) else { return }
        let html = template.replacingOccurrences(of: Self.errorPlaceholder,
                                                 with: json.replacingOccurrences(of: "</", with: "<\\/"))
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            // Mesma origem do ERP: JS da página e splash funcionam; nenhum request é feito.
            self.webView?.loadHTMLString(html, baseURL: self.erpOrigin)
        }
    }

    // MARK: - Downloads (chamados pelo EscaleWebViewProxy)

    func downloadFinished(fileURL: URL, mimeType: String) {
        let event = "downloadCompleted"
        if hasListeners(event) {
            notifyListeners(event, data: [
                "path": fileURL.absoluteString,
                "filename": fileURL.lastPathComponent,
                "mimeType": mimeType,
            ])
            return
        }
        // Bridge indisponível: folha de compartilhamento nativa (inclui "Salvar em Arquivos").
        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.bridge?.viewController else { return }
            let sheet = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = controller.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 0, height: 0)
            controller.present(sheet, animated: true)
        }
    }

    func downloadFailed(_ message: String) {
        notifyListeners("downloadFailed", data: ["error": message])
    }

    /// Caches/downloads — o mesmo lugar usado por src/native/files.ts (Directory.Cache + "downloads").
    static func downloadsFolder() throws -> URL {
        let caches = try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let folder = caches.appendingPathComponent("downloads", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    static func sanitizeFilename(_ name: String, mimeType: String?) -> String {
        let invalid = CharacterSet(charactersIn: "\\/:*?\"<>|").union(.controlCharacters)
        var cleaned = name.components(separatedBy: invalid).joined(separator: "_")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        while cleaned.hasPrefix(".") { cleaned.removeFirst() }
        if cleaned.isEmpty { cleaned = "arquivo" }
        if cleaned.count > 120 { cleaned = String(cleaned.prefix(120)) }
        if (cleaned as NSString).pathExtension.isEmpty, let ext = extensionFor(mimeType) {
            cleaned += ".\(ext)"
        }
        return cleaned
    }

    private static func extensionFor(_ mimeType: String?) -> String? {
        switch mimeType?.lowercased() {
        case "application/pdf": return "pdf"
        case "application/xml", "text/xml": return "xml"
        case "text/csv": return "csv"
        case "text/plain": return "txt"
        case "application/zip": return "zip"
        case "image/png": return "png"
        case "image/jpeg": return "jpg"
        default: return nil
        }
    }

    // MARK: - Impressão

    @objc func print(_ call: CAPPluginCall) {
        let jobName = call.getString("jobName") ?? "Escale Mais"
        let html = call.getString("html")
        var baseURL = erpOrigin
        if let base = call.getString("baseUrl"), let url = URL(string: base), isInternal(url) {
            baseURL = url
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard UIPrintInteractionController.isPrintingAvailable else {
                call.reject("Impressão indisponível neste dispositivo.")
                return
            }
            if let html = html {
                // Documento avulso (iframe): WebView de impressão, sem JavaScript.
                let loader = PrintLoader(html: html, baseURL: baseURL) { formatter in
                    self.presentPrint(formatter: formatter, jobName: jobName, call: call)
                    self.printLoader = nil
                }
                self.printLoader = loader
                loader.start()
            } else if let webView = self.webView {
                self.presentPrint(formatter: webView.viewPrintFormatter(), jobName: jobName, call: call)
            } else {
                call.reject("WebView indisponível.")
            }
        }
    }

    private func presentPrint(formatter: UIPrintFormatter, jobName: String, call: CAPPluginCall) {
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = jobName
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printFormatter = formatter
        controller.present(animated: true) { _, _, error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    // MARK: - Aparência

    @objc func setBackgroundColor(_ call: CAPPluginCall) {
        guard let color = Self.color(fromHex: call.getString("color") ?? "") else {
            call.reject("Cor inválida. Use #RRGGBB.")
            return
        }
        DispatchQueue.main.async { [weak self] in
            self?.bridge?.viewController?.view.backgroundColor = color
            self?.webView?.backgroundColor = color
            self?.webView?.scrollView.backgroundColor = color
            call.resolve()
        }
    }

    // MARK: - Área segura

    /// Página com `viewport-fit=cover` desenha sob o notch e cuida das áreas
    /// seguras com env(safe-area-inset-*) (dashboard do ERP). Sem ele, a página
    /// não conhece a área segura: o iOS reserva notch/barra inferior, como no
    /// Safari — o mesmo que o SystemBars do Capacitor já faz no Android.
    @objc func setSafeAreaMode(_ call: CAPPluginCall) {
        let cover = call.getBool("cover") ?? true
        DispatchQueue.main.async { [weak self] in
            self?.webView?.scrollView.contentInsetAdjustmentBehavior = cover ? .never : .automatic
            call.resolve()
        }
    }

    // MARK: - Utilitários

    private static func readPublicFile(_ name: String) -> String? {
        guard let url = Bundle.main.url(forResource: "public", withExtension: nil)?.appendingPathComponent(name) else {
            return nil
        }
        return try? String(contentsOf: url, encoding: .utf8)
    }

    private static func origin(of url: URL) -> String {
        var origin = "\(url.scheme ?? "https")://\(url.host ?? "")"
        if let port = url.port { origin += ":\(port)" }
        return origin
    }

    private static func color(fromHex hex: String) -> UIColor? {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }
        return UIColor(red: CGFloat((rgb >> 16) & 0xFF) / 255,
                       green: CGFloat((rgb >> 8) & 0xFF) / 255,
                       blue: CGFloat(rgb & 0xFF) / 255,
                       alpha: 1)
    }
}

/// Carrega um HTML numa WebView fora da tela e devolve o formatter quando terminar.
private final class PrintLoader: NSObject, WKNavigationDelegate {
    private let webView: WKWebView
    private let html: String
    private let baseURL: URL
    private let completion: (UIPrintFormatter) -> Void
    private var finished = false

    init(html: String, baseURL: URL, completion: @escaping (UIPrintFormatter) -> Void) {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = false
        self.webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 800, height: 1000), configuration: configuration)
        self.html = html
        self.baseURL = baseURL
        self.completion = completion
        super.init()
        webView.navigationDelegate = self
    }

    func start() {
        webView.loadHTMLString(html, baseURL: baseURL)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // Só o próprio documento; nenhum link navega.
        decisionHandler(navigationAction.navigationType == .other ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !finished else { return }
        finished = true
        completion(webView.viewPrintFormatter())
    }
}
