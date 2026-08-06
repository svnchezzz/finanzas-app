package com.florius.finanzas;

import android.app.Activity;
import android.content.pm.PackageManager;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.fingerprint.FingerprintManager;
import android.os.Build;
import android.os.CancellationSignal;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;

/**
 * Desbloqueo con huella digital (o rostro) usando el BiometricPrompt del
 * sistema. Se apoya solo en el framework de Android (API 28+), así que no
 * hace falta añadir ninguna dependencia nueva ni compilar con internet.
 *
 *  isAvailable() -> { available: boolean }
 *  authenticate({ title, subtitle, negative }) -> { verified: true } | reject
 */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {

    /** Ejecutor que corre las respuestas del sistema en el hilo principal. */
    private final Executor mainExecutor = new Executor() {
        @Override
        public void execute(Runnable r) {
            Activity a = getActivity();
            if (a != null) a.runOnUiThread(r);
            else r.run();
        }
    };

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", hasBiometrics());
        call.resolve(ret);
    }

    private boolean hasBiometrics() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                BiometricManager bm = getContext().getSystemService(BiometricManager.class);
                if (bm == null) return false;
                return bm.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                // En Android 9 no existe BiometricManager: preguntamos por la huella.
                PackageManager pm = getContext().getPackageManager();
                if (!pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT)) return false;
                FingerprintManager fm = getContext().getSystemService(FingerprintManager.class);
                return fm != null && fm.isHardwareDetected() && fm.hasEnrolledFingerprints();
            }
            return false; // Android 8 y anteriores: solo PIN
        } catch (Exception e) {
            return false;
        }
    }

    @PluginMethod
    public void authenticate(final PluginCall call) {
        if (!hasBiometrics()) { call.reject("unavailable"); return; }

        final Activity activity = getActivity();
        if (activity == null) { call.reject("unavailable"); return; }

        final String title    = call.getString("title", "Desbloquear");
        final String subtitle = call.getString("subtitle", "Usa tu huella para entrar");
        final String negative = call.getString("negative", "Usar PIN");

        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    BiometricPrompt prompt = new BiometricPrompt.Builder(getContext())
                            .setTitle(title)
                            .setSubtitle(subtitle)
                            // Obligatorio en API 28/29: deja salir al teclado de PIN propio.
                            .setNegativeButton(negative, mainExecutor,
                                    (dialog, which) -> call.reject("cancelled"))
                            .build();

                    prompt.authenticate(new CancellationSignal(), mainExecutor,
                            new BiometricPrompt.AuthenticationCallback() {
                                @Override
                                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                                    JSObject ret = new JSObject();
                                    ret.put("verified", true);
                                    call.resolve(ret);
                                }

                                @Override
                                public void onAuthenticationError(int code, CharSequence msg) {
                                    call.reject(msg != null ? msg.toString() : "error");
                                }

                                // onAuthenticationFailed (huella no reconocida) no cierra el
                                // diálogo: el sistema deja reintentar, así que no respondemos.
                            });
                } catch (Exception e) {
                    call.reject("error: " + e.getMessage());
                }
            }
        });
    }
}
