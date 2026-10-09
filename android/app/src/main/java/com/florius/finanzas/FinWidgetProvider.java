package com.florius.finanzas;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Widget de la pantalla de inicio: saldo disponible, ingresos y gastos del
 * mes y un botón "+ Agregar". No se actualiza solo (updatePeriodMillis = 0):
 * la app le envía los datos con FinWidgetPlugin.update().
 */
public class FinWidgetProvider extends AppWidgetProvider {

    static final String PREFS = "fin_widget";
    static final String ACTION_ADD = "com.florius.finanzas.WIDGET_ADD";

    static final String K_HAS_DATA = "has_data";
    static final String K_BALANCE = "balance";
    static final String K_INCOME = "income";
    static final String K_EXPENSE = "expense";
    static final String K_MONTH = "month";
    static final String K_UPDATED = "updated";
    static final String K_HIDDEN = "hidden";
    static final String K_PENDING_ACTION = "pending_action";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    /** Redibuja todas las instancias del widget con lo guardado. */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FinWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    static RemoteViews buildViews(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.fin_widget);

        boolean hasData = p.getBoolean(K_HAS_DATA, false);
        if (!hasData) {
            v.setTextViewText(R.id.fw_balance, context.getString(R.string.fw_empty_balance));
            v.setTextViewText(R.id.fw_month, "");
            v.setTextViewText(R.id.fw_updated, "");
            v.setViewVisibility(R.id.fw_totals, View.GONE);
            v.setViewVisibility(R.id.fw_hint, View.VISIBLE);
        } else {
            boolean hidden = p.getBoolean(K_HIDDEN, false);
            String balance = hidden ? "••••••" : p.getString(K_BALANCE, "");
            String income = hidden ? "••••" : p.getString(K_INCOME, "");
            String expense = hidden ? "••••" : p.getString(K_EXPENSE, "");
            v.setTextViewText(R.id.fw_balance, balance);
            v.setTextViewText(R.id.fw_income, context.getString(R.string.fw_income, income));
            v.setTextViewText(R.id.fw_expense, context.getString(R.string.fw_expense, expense));
            v.setTextViewText(R.id.fw_month, p.getString(K_MONTH, ""));
            v.setTextViewText(R.id.fw_updated, p.getString(K_UPDATED, ""));
            v.setViewVisibility(R.id.fw_totals, View.VISIBLE);
            v.setViewVisibility(R.id.fw_hint, View.GONE);
        }

        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;

        // Tocar el widget en cualquier parte: abre la app normalmente.
        Intent open = new Intent(context, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.fw_root,
                PendingIntent.getActivity(context, 0, open, flags));

        // Botón "+ Agregar": abre la app directo en el formulario de movimiento.
        Intent add = new Intent(context, MainActivity.class);
        add.setAction(ACTION_ADD);
        add.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.fw_add,
                PendingIntent.getActivity(context, 1, add, flags));

        return v;
    }
}
