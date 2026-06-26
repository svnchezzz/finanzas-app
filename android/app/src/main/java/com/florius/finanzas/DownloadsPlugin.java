package com.florius.finanzas;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Guarda un archivo (en base64) directamente en la carpeta pública de Descargas.
 * Android 10+ usa MediaStore (sin permisos). Android 9 y anteriores usan el
 * almacenamiento clásico (requiere permiso; si no, se rechaza y la app comparte).
 */
@CapacitorPlugin(name = "Downloads")
public class DownloadsPlugin extends Plugin {

    @PluginMethod
    public void saveBase64(PluginCall call) {
        String filename = call.getString("filename");
        String b64 = call.getString("data");
        String mime = call.getString("mimeType", "application/octet-stream");

        if (filename == null || b64 == null) {
            call.reject("Faltan datos del archivo");
            return;
        }

        try {
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
                values.put(MediaStore.Downloads.MIME_TYPE, mime);
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                Uri item = getContext().getContentResolver().insert(collection, values);
                if (item == null) { call.reject("No se pudo crear el archivo en Descargas"); return; }

                OutputStream os = getContext().getContentResolver().openOutputStream(item);
                os.write(bytes);
                os.flush();
                os.close();

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContext().getContentResolver().update(item, values, null, null);
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                File file = new File(dir, filename);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(bytes);
                fos.flush();
                fos.close();
            }

            JSObject ret = new JSObject();
            ret.put("saved", true);
            ret.put("filename", filename);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo guardar en Descargas: " + e.getMessage());
        }
    }
}
