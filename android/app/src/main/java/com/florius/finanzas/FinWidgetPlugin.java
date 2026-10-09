package com.florius.finanzas;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente entre la app y el widget de la pantalla de inicio.
 *
 *  update({ balance, income, expense, month, updated, hidden }) -> resolve()
 *      Guarda los datos (ya formateados) y redibuja todos los widgets.
 *      hidden = true (la app tiene PIN) muestra "••••••" en vez de montos.
 *  takeLaunchAction() -> { action: "add" | null }
 *      "add" si la app se abrió desde el botón "+ Agregar" y aún no se
 *      había consumido. Lo limpia al leerlo.
 *
 *  Evento de ventana "finWidgetAdd": se dispara cuando se toca "+ Agregar"
 *  con la app ya abierta (MainActivity.onNewIntent).
 */
@CapacitorPlugin(name = "FinWidget")
public class FinWidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(FinWidgetProvider.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(FinWidgetProvider.K_HAS_DATA, true)
                .putString(FinWidgetProvider.K_BALANCE, call.getString("balance", ""))
                .putString(FinWidgetProvider.K_INCOME, call.getString("income", ""))
                .putString(FinWidgetProvider.K_EXPENSE, call.getString("expense", ""))
                .putString(FinWidgetProvider.K_MONTH, call.getString("month", ""))
                .putString(FinWidgetProvider.K_UPDATED, call.getString("updated", ""))
                .putBoolean(FinWidgetProvider.K_HIDDEN, Boolean.TRUE.equals(call.getBoolean("hidden", false)))
                .apply();
        try {
            FinWidgetProvider.updateAll(ctx);
        } catch (Exception ignored) {
            // Sin widgets en la pantalla o launcher sin soporte: nada que redibujar.
        }
        call.resolve();
    }

    @PluginMethod
    public void takeLaunchAction(PluginCall call) {
        String action = consumePendingAction(getContext());
        JSObject ret = new JSObject();
        ret.put("action", action != null ? action : JSObject.NULL);
        call.resolve(ret);
    }

    // --- Acción pendiente (se guarda al arrancar en frío desde el widget) ---

    static void setPendingAction(Context ctx, String action) {
        prefs(ctx).edit().putString(FinWidgetProvider.K_PENDING_ACTION, action).apply();
    }

    static void clearPendingAction(Context ctx) {
        prefs(ctx).edit().remove(FinWidgetProvider.K_PENDING_ACTION).apply();
    }

    static String consumePendingAction(Context ctx) {
        SharedPreferences p = prefs(ctx);
        String action = p.getString(FinWidgetProvider.K_PENDING_ACTION, null);
        if (action != null) p.edit().remove(FinWidgetProvider.K_PENDING_ACTION).apply();
        return action;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(FinWidgetProvider.PREFS, Context.MODE_PRIVATE);
    }
}
