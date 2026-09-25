package com.escalemais.erp;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins locais precisam ser registrados antes do super.onCreate().
        registerPlugin(EscaleNativePlugin.class);
        super.onCreate(savedInstanceState);

        // Aqui o native-bridge do Capacitor já foi registrado; a bridge do app
        // (window.EscaleApp) entra logo depois dele em cada página do ERP.
        PluginHandle handle = bridge.getPlugin("EscaleNative");
        if (handle != null && handle.getInstance() instanceof EscaleNativePlugin plugin) {
            plugin.installBridgeScript();
        }
    }
}
