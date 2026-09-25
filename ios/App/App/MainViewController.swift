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
        plugin.installBridgeScript()
    }
}
