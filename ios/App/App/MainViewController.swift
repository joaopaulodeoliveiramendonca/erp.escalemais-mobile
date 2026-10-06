import UIKit
import Capacitor

/// Controller principal: o `CAPBridgeViewController` do Capacitor + o plugin local do app.
class MainViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        // Registrado aqui (e não por autodescoberta) por ser um plugin local do app.
        let plugin = EscaleNativePlugin()
        bridge?.registerPluginInstance(plugin)
        // Só agora: os scripts do Capacitor e a definição JS do EscaleNative já
        // foram adicionados, então a bridge do app (window.EscaleApp) roda depois deles.
        plugin.installBridgeScript(nativeTabBar: AppRootViewController.usesNativeTabBar)
    }
}

/// Raiz da janela: a WebView (MainViewController) ocupa a tela inteira e, no
/// iPhone, a tab bar nativa flutua por cima dela — com o visual do sistema
/// (Liquid Glass no iOS 26+). Os itens vêm do ERP pela bridge
/// (src/native/tabBar.ts): a página continua decidindo o que aparece, por
/// permissão e por módulo, e o app só desenha.
///
/// Fica num controller próprio, e não como subview da WebView, para a barra não
/// subir junto quando o teclado redimensiona a WebView.
final class AppRootViewController: UIViewController, UITabBarDelegate {

    /// Só no iPhone: no iPad o ERP mostra a sidebar de desktop e não tem barra inferior.
    static var usesNativeTabBar: Bool { UIDevice.current.userInterfaceIdiom == .phone }

    let bridgeController = MainViewController()
    private let tabBar = UITabBar()
    private var lastReportedHeight: CGFloat = -1
    /// Tema da tela do ERP (pela cor de fundo que a bridge manda); nil até a primeira página.
    private var pageIsDark: Bool?

    /// Toque num item: o índice vai para a bridge, que aciona o link do ERP.
    var onSelect: ((Int) -> Void)?
    /// Altura que a página precisa reservar embaixo (barra + indicador de home).
    var onHeightChange: ((CGFloat) -> Void)?

    override func viewDidLoad() {
        super.viewDidLoad()

        addChild(bridgeController)
        bridgeController.view.frame = view.bounds
        bridgeController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(bridgeController.view)
        bridgeController.didMove(toParent: self)

        guard Self.usesNativeTabBar else { return }
        tabBar.delegate = self
        tabBar.isHidden = true
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tabBar)
        NSLayoutConstraint.activate([
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let height = reservedHeight
        if height != lastReportedHeight {
            lastReportedHeight = height
            onHeightChange?(height)
        }
    }

    /// Do topo da barra até o fim da tela.
    var reservedHeight: CGFloat {
        guard Self.usesNativeTabBar else { return 0 }
        view.layoutIfNeeded()
        return max(0, view.bounds.height - tabBar.frame.minY)
    }

    // MARK: - Itens

    struct Item {
        let title: String
        let symbol: String
    }

    /// Lista vazia esconde a barra (login, telas sem navegação).
    /// `tint`: cor do item ativo — a de destaque da empresa, a mesma da barra do ERP.
    func setItems(_ items: [Item], selected: Int?, tint: UIColor?) {
        guard Self.usesNativeTabBar else { return }
        let tintChanged = tint != nil && tint != tabBar.tintColor
        if let tint { tabBar.tintColor = tint }
        let current = tabBar.items ?? []
        let same = current.count == items.count && zip(current, items).allSatisfy { item, new in
            item.title == new.title && item.accessibilityIdentifier == new.symbol
        }
        if !same {
            tabBar.setItems(items.enumerated().map { index, item in
                let barItem = UITabBarItem(title: item.title, image: Self.image(for: item.symbol), tag: index)
                barItem.accessibilityIdentifier = item.symbol
                return barItem
            }, animated: false)
        }
        if !same || tintChanged { styleItems() }
        select(selected)
        tabBar.isHidden = items.isEmpty
    }

    /// Inativos em cinza, como na barra do ERP: o padrão (cor do texto, quase
    /// preto) pesava ao lado do item ativo. O vidro do iOS 26 ignora
    /// `unselectedItemTintColor` e `UITabBarAppearance`, então o cinza vai na
    /// própria imagem (original) e no título. O selecionado continua em
    /// template, na cor de destaque (`tintColor`).
    private func styleItems() {
        // Pelo tema da página, guardado: o traitCollection da barra só muda no próximo
        // layout, e com o iPhone no escuro o cinza saía branco sobre o vidro claro.
        let dark = pageIsDark ?? (traitCollection.userInterfaceStyle == .dark)
        let gray = UIColor(white: dark ? 1 : 0, alpha: 0.45)
        let font = UIFont.systemFont(ofSize: 10, weight: .medium)
        for item in tabBar.items ?? [] {
            guard let symbol = item.accessibilityIdentifier, let base = Self.image(for: symbol) else { continue }
            item.image = base.withTintColor(gray, renderingMode: .alwaysOriginal)
            item.selectedImage = base.withRenderingMode(.alwaysTemplate)
            item.setTitleTextAttributes([.foregroundColor: gray, .font: font], for: .normal)
            item.setTitleTextAttributes([.foregroundColor: tabBar.tintColor ?? .tintColor, .font: font], for: .selected)
        }
    }

    /// Claro/escuro da barra pelo tema do ERP, e não pelo do iPhone: o ERP tem
    /// tema próprio, e o cinza dos inativos precisa contrastar com a tela atrás.
    func setPageIsDark(_ dark: Bool) {
        guard Self.usesNativeTabBar else { return }
        guard pageIsDark != dark else { return }
        pageIsDark = dark
        tabBar.overrideUserInterfaceStyle = dark ? .dark : .light
        styleItems()
    }

    func select(_ index: Int?) {
        guard let index, let items = tabBar.items, items.indices.contains(index) else {
            tabBar.selectedItem = nil
            return
        }
        tabBar.selectedItem = items[index]
    }

    /// Some quando um modal do ERP cobre o rodapé (ele ficaria atrás da barra).
    func setCovered(_ covered: Bool) {
        guard Self.usesNativeTabBar else { return }
        UIView.animate(withDuration: 0.2) {
            self.tabBar.alpha = covered ? 0 : 1
        }
        tabBar.isUserInteractionEnabled = !covered
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        onSelect?(item.tag)
    }

    /// SF Symbol com reserva: um nome que não exista nesta versão do iOS não pode deixar o item sem ícone.
    private static func image(for symbol: String) -> UIImage? {
        // Traço regular: o padrão da barra deixava os ícones grossos perto do Lucide fino do ERP.
        let config = UIImage.SymbolConfiguration(weight: .regular)
        return UIImage(systemName: symbol, withConfiguration: config) ?? UIImage(systemName: "circle", withConfiguration: config)
    }

    // MARK: - Status bar e orientação seguem a WebView

    override var childForStatusBarStyle: UIViewController? { bridgeController }
    override var childForStatusBarHidden: UIViewController? { bridgeController }
    override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation { bridgeController.preferredStatusBarUpdateAnimation }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { bridgeController.supportedInterfaceOrientations }
}
