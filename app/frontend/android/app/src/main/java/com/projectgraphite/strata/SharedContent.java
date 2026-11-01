package com.projectgraphite.strata;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

final class SharedContent {
    private static final long maxFileBytes = 25L * 1024 * 1024;
    private static final int maxFiles = 10;
    private static JSObject pending;

    private SharedContent() {}

    static boolean receive(Context context, Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return false;
        JSObject shared = new JSObject();
        shared.put("title", text(intent.getStringExtra(Intent.EXTRA_SUBJECT), intent.getStringExtra(Intent.EXTRA_TITLE)));
        CharSequence body = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        shared.put("text", body == null ? "" : body.toString());
        shared.put("url", "");
        JSArray files = new JSArray();
        ContentResolver resolver = context.getContentResolver();
        for (Uri uri : streams(intent)) {
            if (files.length() >= maxFiles) break;
            JSObject file = read(resolver, uri);
            if (file != null) files.put(file);
        }
        shared.put("files", files);
        synchronized (SharedContent.class) {
            pending = shared;
        }
        intent.setAction(null);
        return true;
    }

    static synchronized JSObject take() {
        JSObject taken = pending;
        pending = null;
        return taken;
    }

    private static String text(String first, String second) {
        if (first != null && !first.isEmpty()) return first;
        return second == null ? "" : second;
    }

    @SuppressWarnings("deprecation")
    private static List<Uri> streams(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> many = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri.class) : intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (many != null) uris.addAll(many);
        } else {
            Uri one = Build.VERSION.SDK_INT >= 33 ? intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class) : intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null) uris.add(one);
        }
        return uris;
    }

    private static JSObject read(ContentResolver resolver, Uri uri) {
        String name = "shared file";
        long size = -1;
        try (Cursor cursor = resolver.query(uri, new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameColumn >= 0 && !cursor.isNull(nameColumn)) name = cursor.getString(nameColumn);
                if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn);
            }
        } catch (SecurityException e) {
            return null;
        }
        if (size > maxFileBytes) return null;
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) return null;
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[64 * 1024];
            for (int read = input.read(buffer); read != -1; read = input.read(buffer)) {
                if (bytes.size() + read > maxFileBytes) return null;
                bytes.write(buffer, 0, read);
            }
            JSObject file = new JSObject();
            String type = resolver.getType(uri);
            file.put("name", name);
            file.put("type", type == null ? "application/octet-stream" : type);
            file.put("data", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
            return file;
        } catch (IOException | SecurityException e) {
            return null;
        }
    }
}
