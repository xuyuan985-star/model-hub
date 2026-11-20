package app.modelhub;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** 本地文件缓存 + 用 Android 硬件密钥库加密保存的 API 密钥。密钥原文只在联网那一刻出现在原生层。 */
public class Store {
    private static final String KEY_ALIAS = "modelhub_secret_key";
    private final File dir;
    private final SharedPreferences prefs;

    public Store(Context c) {
        dir = new File(c.getFilesDir(), "data");
        dir.mkdirs();
        prefs = c.getSharedPreferences("secrets", Context.MODE_PRIVATE);
    }

    private File file(String name) {
        // 只允许简单文件名，防止网页传入 ../ 之类逃出数据目录
        if (name == null || !name.matches("[A-Za-z0-9._-]{1,80}") || name.startsWith(".")) {
            throw new IllegalArgumentException("bad name");
        }
        return new File(dir, name);
    }

    public String read(String name) {
        try {
            File f = file(name);
            if (!f.exists()) return null;
            FileInputStream in = new FileInputStream(f);
            try {
                ByteArrayOutputStream bo = new ByteArrayOutputStream((int) Math.max(f.length(), 32));
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                return new String(bo.toByteArray(), StandardCharsets.UTF_8);
            } finally {
                in.close();
            }
        } catch (Exception e) {
            return null;
        }
    }

    public synchronized boolean write(String name, String text) {
        try {
            File f = file(name);
            File tmp = new File(dir, name + ".tmp");
            FileOutputStream out = new FileOutputStream(tmp);
            try {
                out.write(text.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } finally {
                out.close();
            }
            if (f.exists() && !f.delete()) return false;
            return tmp.renameTo(f);
        } catch (Exception e) {
            return false;
        }
    }

    public boolean delete(String name) {
        try {
            return file(name).delete();
        } catch (Exception e) {
            return false;
        }
    }

    public long totalSize() {
        long t = 0;
        File[] fs = dir.listFiles();
        if (fs != null) for (File f : fs) t += f.length();
        return t;
    }

    public void clearAll() {
        File[] fs = dir.listFiles();
        if (fs != null) for (File f : fs) f.delete();
        prefs.edit().clear().apply();
    }

    // ---------- 密钥 ----------

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (!ks.containsAlias(KEY_ALIAS)) {
            KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            g.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build());
            return g.generateKey();
        }
        return (SecretKey) ks.getKey(KEY_ALIAS, null);
    }

    public boolean setSecret(String id, String value) {
        try {
            if (value == null || value.isEmpty()) return deleteSecret(id);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String s = Base64.encodeToString(c.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
            return prefs.edit().putString("s_" + id, s).commit();
        } catch (Exception e) {
            return false;
        }
    }

    public String getSecret(String id) {
        try {
            String s = prefs.getString("s_" + id, null);
            if (s == null) return null;
            String[] p = s.split(":");
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(p[0], Base64.NO_WRAP)));
            return new String(c.doFinal(Base64.decode(p[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    public boolean hasSecret(String id) {
        return prefs.contains("s_" + id);
    }

    public boolean deleteSecret(String id) {
        return prefs.edit().remove("s_" + id).commit();
    }
}
