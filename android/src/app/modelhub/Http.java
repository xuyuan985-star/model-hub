package app.modelhub;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;

/**
 * 原生联网，不受浏览器跨域限制。
 * 请求里可以写 {{secret:账户id}}，由这里在发出前替换为真实密钥——网页脚本永远拿不到密钥原文。
 */
public class Http {
    private static final Pattern SECRET = Pattern.compile("\\{\\{secret:([A-Za-z0-9_-]{1,64})\\}\\}");
    private static final int MAX_BYTES = 24 * 1024 * 1024;
    private final Store store;

    public Http(Store s) {
        store = s;
    }

    private String fill(String s) {
        if (s == null || s.indexOf("{{secret:") < 0) return s;
        Matcher m = SECRET.matcher(s);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            String v = store.getSecret(m.group(1));
            if (v == null) throw new IllegalStateException("密钥读取失败，请重新填写该账户的密钥");
            m.appendReplacement(sb, Matcher.quoteReplacement(v));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    public String run(String reqJson) throws Exception {
        JSONObject req = new JSONObject(reqJson);
        String url = fill(req.getString("url"));
        if (!url.startsWith("https://") && !url.startsWith("http://")) throw new IllegalArgumentException("只支持 http/https 网址");
        String method = req.optString("method", "GET");
        int timeout = req.optInt("timeoutMs", 20000);
        long t0 = System.currentTimeMillis();

        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(Math.min(timeout, 15000));
        c.setReadTimeout(timeout);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("Accept-Encoding", "gzip");
        JSONObject hs = req.optJSONObject("headers");
        if (hs != null) {
            Iterator<String> it = hs.keys();
            while (it.hasNext()) {
                String k = it.next();
                c.setRequestProperty(k, fill(hs.optString(k)));
            }
        }
        if (c.getRequestProperty("User-Agent") == null) {
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36");
        }
        String body = req.has("body") && !req.isNull("body") ? req.getString("body") : null;
        if (body != null && !"GET".equals(method) && !"HEAD".equals(method)) {
            c.setDoOutput(true);
            byte[] b = fill(body).getBytes(StandardCharsets.UTF_8);
            OutputStream o = c.getOutputStream();
            o.write(b);
            o.close();
        }

        int status = c.getResponseCode();
        JSONObject out = new JSONObject();
        out.put("status", status);
        JSONObject rh = new JSONObject();
        String[] want = {"etag", "last-modified", "content-type", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "x-aa-tier"};
        for (String k : want) {
            String v = c.getHeaderField(k);
            if (v != null) rh.put(k, v);
        }
        out.put("headers", rh);
        if (status != 304) {
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            String text = "";
            long bytes = 0;
            if (in != null) {
                if ("gzip".equalsIgnoreCase(c.getContentEncoding())) in = new GZIPInputStream(in);
                ByteArrayOutputStream bo = new ByteArrayOutputStream(65536);
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) > 0) {
                    bo.write(buf, 0, n);
                    if (bo.size() > MAX_BYTES) throw new java.io.IOException("返回内容过大");
                }
                in.close();
                bytes = bo.size();
                text = bo.toString("UTF-8");
            }
            out.put("body", text);
            out.put("bytes", bytes);
        }
        out.put("ms", System.currentTimeMillis() - t0);
        c.disconnect();
        return out.toString();
    }

    public static String describe(Throwable t) {
        if (t instanceof java.net.SocketTimeoutException) return "连接超时";
        if (t instanceof java.net.UnknownHostException) return "找不到服务器（网络不通或域名无法解析）";
        if (t instanceof java.net.ConnectException) return "连接被拒绝";
        if (t instanceof javax.net.ssl.SSLException) return "安全连接失败（证书或时间不对）";
        String m = t.getMessage();
        return m == null || m.isEmpty() ? t.getClass().getSimpleName() : m;
    }
}
