package app.modelhub;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private WebView web;
    private Store store;
    private Http http;
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private long lastBack = 0;
    private boolean immersive = false;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        store = new Store(this);
        http = new Http(store);
        web = new WebView(this);
        setContentView(web);
        applySystemBars(isNight());

        // debug 包才开启 WebView 远程调试（chrome://inspect / adb forward 后可用 CDP 驱动页面）
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                android.util.Log.d("ModelHubJS", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if ("file".equals(u.getScheme())) return false;
                openExternal(u.toString());
                return true;
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                super.onPageFinished(v, url);
                updateImmersiveFor(url);
            }
        });
        web.loadUrl("file:///android_asset/web/index.html");
    }

    private boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    private void applySystemBars(boolean dark) {
        Window w = getWindow();
        int bg = dark ? Color.parseColor("#14171E") : Color.parseColor("#F3F4F6");
        w.setStatusBarColor(bg);
        w.setNavigationBarColor(bg);
        int f = w.getDecorView().getSystemUiVisibility();
        f = dark ? (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR) : (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        if (Build.VERSION.SDK_INT >= 26) {
            f = dark ? (f & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR) : (f | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        if (immersive) {
            // 游戏界面沉浸：状态栏与导航栏收起，手指从边缘划入可临时唤出，3 秒后自动收回
            f |= View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
            if (Build.VERSION.SDK_INT >= 28) {
                w.getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }
        } else {
            f &= ~(View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
        w.getDecorView().setSystemUiVisibility(f);
        if (web != null) web.setBackgroundColor(bg);
    }

    /** 进入 / 退出沉浸模式：游戏页用沉浸，工具页保留状态栏。 */
    private void setImmersive(boolean on) {
        immersive = on;
        applySystemBars(isNight());
    }

    /** 像素冒险是独立整屏页面（web/game/），进它才需要吃掉系统栏腾出纵向空间。 */
    private void updateImmersiveFor(String url) {
        boolean game = url != null && url.indexOf("/web/game/") >= 0;
        if (game != immersive) setImmersive(game);
    }

    private void openExternal(String url) {
        try {
            Uri u = Uri.parse(url);
            String sc = u.getScheme();
            if (!"http".equals(sc) && !"https".equals(sc)) return;
            startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception ignored) {
        }
    }

    private void js(final String code) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web != null) web.evaluateJavascript(code, null);
            }
        });
    }

    @Override
    public void onBackPressed() {
        // 先让网页处理（关闭弹层、返回上一页）；网页不处理才退出，且需连按两次。
        web.evaluateJavascript("(function(){try{return window.__onBack?window.__onBack():false}catch(e){return false}})()", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if ("true".equals(v)) return;
                long now = System.currentTimeMillis();
                if (now - lastBack < 2000) finish();
                else {
                    lastBack = now;
                    Toast.makeText(MainActivity.this, "再按一次退出", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        applySystemBars(isNight());
        js("window.__onSystemTheme&&window.__onSystemTheme(" + isNight() + ")");
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 沉浸模式会被系统栏的临时唤出打断，回到前台时重新收起
        if (immersive) applySystemBars(isNight());
        js("window.__onResume&&window.__onResume()");
    }

    @Override
    public void onWindowFocusChanged(boolean has) {
        super.onWindowFocusChanged(has);
        if (has && immersive) applySystemBars(isNight());
    }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        if (web != null) {
            web.removeJavascriptInterface("Native");
            web.destroy();
        }
        super.onDestroy();
    }

    /** 网页能调用的原生能力。只有本应用自带的页面能加载，外部链接一律交给系统浏览器。 */
    private class Bridge {
        @JavascriptInterface
        public String info() {
            try {
                JSONObject o = new JSONObject();
                o.put("platform", "android");
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("device", Build.MANUFACTURER + " " + Build.MODEL);
                o.put("night", isNight());
                o.put("version", getPackageManager().getPackageInfo(getPackageName(), 0).versionName);
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        /** 异步联网。结果通过 window.__nativeDone(id, json) 回到网页。 */
        @JavascriptInterface
        public void http(final String id, final String req) {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    String out;
                    try {
                        out = http.run(req);
                    } catch (Throwable t) {
                        try {
                            JSONObject e = new JSONObject();
                            e.put("status", 0);
                            e.put("error", Http.describe(t));
                            out = e.toString();
                        } catch (Exception x) {
                            out = "{\"status\":0,\"error\":\"unknown\"}";
                        }
                    }
                    js("window.__nativeDone(" + JSONObject.quote(id) + "," + JSONObject.quote(out) + ")");
                }
            });
        }

        @JavascriptInterface
        public String readFile(String name) {
            return store.read(name);
        }

        /** 读取随 App 打包的文件（只允许 web/seed 下的快照）。 */
        @JavascriptInterface
        public String readAsset(String name) {
            if (name == null || !name.startsWith("web/seed/") || name.contains("..")) return null;
            try {
                java.io.InputStream in = getAssets().open(name);
                java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream(1 << 20);
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                in.close();
                return bo.toString("UTF-8");
            } catch (Exception e) {
                return null;
            }
        }

        @JavascriptInterface
        public boolean writeFile(String name, String text) {
            return store.write(name, text);
        }

        @JavascriptInterface
        public boolean deleteFile(String name) {
            return store.delete(name);
        }

        @JavascriptInterface
        public boolean setSecret(String id, String value) {
            return store.setSecret(id, value);
        }

        @JavascriptInterface
        public boolean hasSecret(String id) {
            return store.hasSecret(id);
        }

        @JavascriptInterface
        public boolean deleteSecret(String id) {
            return store.deleteSecret(id);
        }

        @JavascriptInterface
        public boolean online() {
            try {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                NetworkInfo n = cm.getActiveNetworkInfo();
                return n != null && n.isConnected();
            } catch (Exception e) {
                return true;
            }
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    openExternal(url);
                }
            });
        }

        @JavascriptInterface
        public void copy(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    cm.setPrimaryClip(ClipData.newPlainText("模型行情", text));
                }
            });
        }

        @JavascriptInterface
        public void toast(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(MainActivity.this, text, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void setTheme(final boolean dark) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    applySystemBars(dark);
                }
            });
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(i, "分享"));
                }
            });
        }

        @JavascriptInterface
        public long dataSize() {
            return store.totalSize();
        }

        /** 把随应用打包的图片保存到手机相册（Pictures/模型行情）。Android 10+ 无需额外权限。 */
        @JavascriptInterface
        public boolean saveImage(String assetName, String displayName) {
            if (assetName == null || !assetName.startsWith("web/assets/") || assetName.contains("..")) return false;
            if (Build.VERSION.SDK_INT < 29) return false;
            try {
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, displayName);
                v.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png");
                v.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/模型行情");
                Uri uri = getContentResolver().insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return false;
                java.io.InputStream in = getAssets().open(assetName);
                java.io.OutputStream out = getContentResolver().openOutputStream(uri);
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                out.close();
                in.close();
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** 把网页 Canvas 生成的 PNG (base64) 保存到相册 Pictures/模型行情。 */
        @JavascriptInterface
        public boolean saveBase64Image(String base64, String displayName) {
            if (base64 == null || base64.isEmpty() || Build.VERSION.SDK_INT < 29) return false;
            try {
                int comma = base64.indexOf(',');
                String raw = comma >= 0 ? base64.substring(comma + 1) : base64;
                byte[] bytes = android.util.Base64.decode(raw, android.util.Base64.DEFAULT);
                if (bytes.length < 64 || bytes.length > 16 * 1024 * 1024) return false;
                android.content.ContentValues v = new android.content.ContentValues();
                v.put(android.provider.MediaStore.Images.Media.DISPLAY_NAME, displayName == null || displayName.isEmpty() ? "模型对比.png" : displayName);
                v.put(android.provider.MediaStore.Images.Media.MIME_TYPE, "image/png");
                v.put(android.provider.MediaStore.Images.Media.RELATIVE_PATH, "Pictures/模型行情");
                Uri uri = getContentResolver().insert(android.provider.MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) return false;
                java.io.OutputStream out = getContentResolver().openOutputStream(uri);
                out.write(bytes);
                out.close();
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** 后台下载新版本安装包到应用缓存。完成后回调 window.__apkDone(id, json)。 */
        @JavascriptInterface
        public void downloadApk(final String id, final String url) {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    JSONObject out = new JSONObject();
                    java.io.File tmp = new java.io.File(getCacheDir(), "update.apk.part");
                    java.io.File dst = new java.io.File(getCacheDir(), "update.apk");
                    java.net.HttpURLConnection c = null;
                    try {
                        if (!url.startsWith("https://") && !url.startsWith("http://")) throw new IllegalArgumentException("网址不对");
                        if (tmp.exists()) tmp.delete();
                        c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
                        c.setInstanceFollowRedirects(true);
                        c.setConnectTimeout(15000);
                        c.setReadTimeout(60000);
                        c.setRequestProperty("User-Agent", "ModelHub-Android");
                        int st = c.getResponseCode();
                        if (st >= 400) throw new java.io.IOException("服务器返回 " + st);
                        long total = c.getContentLength();
                        java.io.InputStream in = c.getInputStream();
                        java.io.FileOutputStream o = new java.io.FileOutputStream(tmp);
                        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
                        byte[] buf = new byte[65536];
                        long got = 0;
                        long lastPush = 0;
                        int n;
                        boolean pk = false;
                        while ((n = in.read(buf)) > 0) {
                            if (!pk) {
                                pk = n >= 2 && buf[0] == 'P' && buf[1] == 'K';
                                if (!pk) throw new java.io.IOException("下载到的不是安装包");
                            }
                            o.write(buf, 0, n);
                            md.update(buf, 0, n);
                            got += n;
                            // 最多 400ms 回一次进度，免得把 WebView 的 JS 队列灌爆
                            long tnow = System.currentTimeMillis();
                            if (tnow - lastPush > 400) {
                                lastPush = tnow;
                                js("window.__apkProgress(" + JSONObject.quote(id) + "," + got + "," + total + ")");
                            }
                            if (got > 200L * 1024 * 1024) throw new java.io.IOException("文件过大");
                        }
                        o.close();
                        in.close();
                        if (got < 4096) throw new java.io.IOException("下载文件过小");
                        if (total > 0 && got != total) throw new java.io.IOException("下载不完整");
                        js("window.__apkProgress(" + JSONObject.quote(id) + "," + got + "," + total + ")");
                        byte[] dig = md.digest();
                        StringBuilder hex = new StringBuilder(64);
                        for (byte b : dig) hex.append(String.format("%02x", b & 0xff));
                        if (dst.exists()) dst.delete();
                        if (!tmp.renameTo(dst)) throw new java.io.IOException("保存失败");
                        out.put("ok", true);
                        out.put("bytes", got);
                        out.put("sha256", hex.toString());
                    } catch (Throwable t) {
                        try { tmp.delete(); } catch (Exception ignored) { }
                        try {
                            out.put("ok", false);
                            out.put("error", Http.describe(t));
                        } catch (Exception ignored) { }
                    } finally {
                        if (c != null) c.disconnect();
                    }
                    js("window.__apkDone(" + JSONObject.quote(id) + "," + JSONObject.quote(out.toString()) + ")");
                }
            });
        }

        /** 打开系统安装界面。没给"安装未知应用"权限时先去设置页，返回 needPermission。 */
        @JavascriptInterface
        public String installApk() {
            JSONObject out = new JSONObject();
            try {
                java.io.File f = new java.io.File(getCacheDir(), "update.apk");
                if (!f.exists() || f.length() < 4096) {
                    out.put("ok", false);
                    out.put("error", "还没有下载好");
                    return out.toString();
                }
                if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                    Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(i);
                    out.put("ok", false);
                    out.put("need", "permission");
                    return out.toString();
                }
                Uri u = Uri.parse("content://" + ApkProvider.AUTHORITY + "/update.apk");
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(u, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                out.put("ok", true);
            } catch (Exception e) {
                try {
                    out.put("ok", false);
                    out.put("error", Http.describe(e));
                } catch (Exception ignored) { }
            }
            return out.toString();
        }

        @JavascriptInterface
        public void clearData() {
            store.clearAll();
        }
    }
}
