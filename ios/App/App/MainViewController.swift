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
/// subir junto quando o teclado redimensiona a WebView. No iPad, é ele também
/// quem tira a WebView de baixo da barra de status.
final class AppRootViewController: UIViewController, UITabBarDelegate {

    /// Só no iPhone: no iPad o ERP mostra a sidebar de desktop e não tem barra inferior.
    static var usesNativeTabBar: Bool { UIDevice.current.userInterfaceIdiom == .phone }

    let bridgeController = MainViewController()
    private let tabBar = UITabBar()
    private var lastReportedHeight: CGFloat = -1
    /// Tema da tela do ERP (pela cor de fundo que a bridge manda); nil até a primeira página.
    private var pageIsDark: Bool?
    /// iPad: tamanho e topo seguro da última vez que a WebView foi posicionada.
    private var lastPadLayout: (size: CGSize, top: CGFloat)?

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
        layoutWebViewBelowStatusBar()
        let height = reservedHeight
        if height != lastReportedHeight {
            lastReportedHeight = height
            onHeightChange?(height)
        }
    }

    /// iPad: o ERP abre no layout de computador (sidebar fixa), que não conhece a
    /// área segura — o relógio ficava sobre a sidebar e o conteúdo rolava por
    /// trás dele. Aqui a WebView começa abaixo da barra de status, como no Safari,
    /// e a faixa de cima fica com a cor da página (setBackgroundColor).
    ///
    /// Só reposiciona quando a tela ou o topo seguro mudam (rotação, Stage
    /// Manager): com o teclado aberto, o plugin Keyboard encolhe a altura da
    /// WebView pelo próprio frame, e um ajuste a cada layout desfaria isso.
    private func layoutWebViewBelowStatusBar() {
        guard UIDevice.current.userInterfaceIdiom == .pad else { return }
        let size = view.bounds.size
        let top = view.safeAreaInsets.top
        if let last = lastPadLayout, last.size == size, last.top == top { return }
        lastPadLayout = (size, top)
        bridgeController.view.frame = CGRect(x: 0, y: top, width: size.width, height: size.height - top)
    }

    /// Do topo da barra até o fim da tela.
    var reservedHeight: CGFloat {
        guard Self.usesNativeTabBar else { return 0 }
        view.layoutIfNeeded()
        return max(0, view.bounds.height - tabBar.frame.minY)
    }

    // MARK: - Itens

    struct Item: Equatable {
        let title: String
        let symbol: String
    }

    /// Itens atuais, para saber se a página mandou algo novo.
    private var currentItems: [Item] = []

    /// Lista vazia esconde a barra (login, telas sem navegação).
    /// `tint`: cor do item ativo — a de destaque da empresa, a mesma da barra do ERP.
    func setItems(_ items: [Item], selected: Int?, tint: UIColor?) {
        guard Self.usesNativeTabBar else { return }
        let tintChanged = tint != nil && tint != tabBar.tintColor
        if let tint { tabBar.tintColor = tint }
        let same = currentItems == items
        currentItems = items
        if !same || tintChanged { rebuildItems() }
        select(selected)
        tabBar.isHidden = items.isEmpty
    }

    /// Inativos em cinza, como na barra do ERP: o padrão (cor do texto, quase
    /// preto) pesava ao lado do item ativo. O vidro do iOS 26 ignora
    /// `unselectedItemTintColor` e `UITabBarAppearance`, então o cinza vai na
    /// própria imagem (original). O selecionado continua em template, na cor de
    /// destaque (`tintColor`).
    ///
    /// Cada item nasce já com imagem e atributos, e mudar o estilo cria itens
    /// novos: no vidro do iOS 26, trocar `image` ou `setTitleTextAttributes` de
    /// um item já entregue à barra apaga o rótulo dos inativos — e se isso
    /// acontecia ou não dependia de o tema da página chegar antes ou depois dos itens.
    private func rebuildItems() {
        // Pelo tema da página, guardado: o traitCollection da barra só muda no próximo
        // layout, e com o iPhone no escuro o cinza saía branco sobre o vidro claro.
        let dark = pageIsDark ?? (traitCollection.userInterfaceStyle == .dark)
        let gray = UIColor(white: dark ? 1 : 0, alpha: 0.45)
        let font = UIFont.systemFont(ofSize: 10, weight: .medium)
        let tint = tabBar.tintColor ?? .tintColor
        let selected = tabBar.selectedItem?.tag
        tabBar.setItems(currentItems.enumerated().map { index, item in
            let base = Self.image(for: item.symbol)
            let barItem = UITabBarItem(
                title: item.title,
                image: base?.withTintColor(gray, renderingMode: .alwaysOriginal),
                selectedImage: base?.withRenderingMode(.alwaysTemplate)
            )
            barItem.tag = index
            barItem.setTitleTextAttributes([.foregroundColor: gray, .font: font], for: .normal)
            barItem.setTitleTextAttributes([.foregroundColor: tint, .font: font], for: .selected)
            return barItem
        }, animated: false)
        select(selected)
    }

    /// Claro/escuro da barra pelo tema do ERP, e não pelo do iPhone: o ERP tem
    /// tema próprio, e o cinza dos inativos precisa contrastar com a tela atrás.
    func setPageIsDark(_ dark: Bool) {
        guard Self.usesNativeTabBar else { return }
        guard pageIsDark != dark else { return }
        pageIsDark = dark
        tabBar.overrideUserInterfaceStyle = dark ? .dark : .light
        if !currentItems.isEmpty { rebuildItems() }
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
