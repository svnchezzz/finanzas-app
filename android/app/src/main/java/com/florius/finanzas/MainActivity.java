package com.florius.finanzas;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** BridgeActivity llama a onNewIntent(getIntent()) dentro de su onCreate. */
    private boolean creating = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DownloadsPlugin.class); // guardar exportaciones en Descargas
        registerPlugin(BiometricPlugin.class); // desbloqueo con huella digital
        registerPlugin(FinWidgetPlugin.class); // widget de la pantalla de inicio

        // Arranque en frío desde "+ Agregar" del widget: se deja la acción
        // guardada y la app la consume con FinWidget.takeLaunchAction().
        // (No al recrear la actividad ni al reabrir desde Recientes.)
        if (savedInstanceState == null && isWidgetAdd(getIntent())
                && (getIntent().getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) {
            FinWidgetPlugin.setPendingAction(this, "add");
        }

        creating = true;
        try {
            super.onCreate(savedInstanceState);
        } finally {
            creating = false;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (creating || !isWidgetAdd(intent)) return;

        // App ya abierta: se avisa a JS con un evento y no se deja la acción
        // guardada, para que un toque produzca una sola acción.
        FinWidgetPlugin.clearPendingAction(this);
        try {
            getBridge().triggerWindowJSEvent("finWidgetAdd");
        } catch (Exception ignored) {
            // Sin bridge (no debería pasar con la actividad viva)
        }
    }

    private static boolean isWidgetAdd(Intent intent) {
        return intent != null && FinWidgetProvider.ACTION_ADD.equals(intent.getAction());
    }

    @Override
    public void onResume() {
        super.onResume();
        applyHighRefreshRate();
        applySystemTextSize();
    }

    /**
     * El WebView no sigue el tamaño de letra del sistema por sí solo: se lo
     * pasamos (Ajustes > Pantalla > Tamaño de fuente). Se repite en cada
     * onResume por si la persona lo cambió con la app en segundo plano.
     */
    private void applySystemTextSize() {
        try {
            float scale = getResources().getConfiguration().fontScale;
            getBridge().getWebView().getSettings().setTextZoom(Math.round(scale * 100));
        } catch (Exception ignored) {
            // Sin WebView todavía: se aplicará en el próximo onResume
        }
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
