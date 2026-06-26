package com.florius.finanzas;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DownloadsPlugin.class); // guardar exportaciones en Descargas
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyHighRefreshRate();
    }

    /**
     * Pide al sistema el modo de mayor frecuencia de refresco disponible
     * (mismo tamaño de pantalla, más Hz). Así la app corre a 120Hz/90Hz en
     * los celulares que lo soportan, en vez de quedar capada a 60Hz.
     */
    private void applyHighRefreshRate() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return; // requiere Display.Mode (API 23+)

            Display display = getWindowManager().getDefaultDisplay();
            Display.Mode current = display.getMode();
            Display.Mode best = current;

            for (Display.Mode m : display.getSupportedModes()) {
                boolean mismaResolucion =
                        m.getPhysicalWidth() == current.getPhysicalWidth() &&
                        m.getPhysicalHeight() == current.getPhysicalHeight();
                if (mismaResolucion && m.getRefreshRate() > best.getRefreshRate()) {
                    best = m;
                }
            }

            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                lp.preferredRefreshRate = best.getRefreshRate();
            }
            getWindow().setAttributes(lp);
        } catch (Exception e) {
            // Si algo falla, seguimos con la frecuencia por defecto sin romper la app.
        }
    }
}
