/* update.js — 支持中国境内镜像免梯检查与下载更新（内置 SHA-256 校验，防镜像篡改）。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core;
  var REPO = 'xuyuan985-star/model-hub';
  var API = 'https://api.github.com/repos/' + REPO + '/releases/latest';

  // 国内可直接访问的元数据镜像（读取仓库根目录 latest.json，完全绕过 api.github.com）
  var META_URLS = [
    { name: 'jsDelivr 镜像', url: 'https://fastly.jsdelivr.net/gh/' + REPO + '@main/latest.json' },
    { name: 'CF 镜像', url: 'https://testingcf.jsdelivr.net/gh/' + REPO + '@main/latest.json' },
    { name: 'jsDelivr CDN', url: 'https://cdn.jsdelivr.net/gh/' + REPO + '@main/latest.json' },
    { name: 'GitHub API', url: API, isApi: true }
  ];

  // 国内加速镜像列表（默认自动优先国内镜像，最后保底直连 GitHub；用户也可在设置里固定线路）
  var MIRROR_LIST = [
    { id: 'gh-proxy-org', name: '国内加速 1 (gh-proxy.org)', prefix: 'https://gh-proxy.org/' },
    { id: 'gh-proxy-com', name: '国内加速 2 (gh-proxy.com)', prefix: 'https://gh-proxy.com/' },
    { id: 'wget-la', name: '国内加速 3 (wget.la)', prefix: 'https://wget.la/' },
    { id: 'ghfast', name: '国内加速 4 (ghfast.top)', prefix: 'https://ghfast.top/' },
    { id: 'ghproxy-net', name: '国内加速 5 (ghproxy.net)', prefix: 'https://ghproxy.net/' },
    { id: 'direct', name: 'GitHub 直连', prefix: '' }
  ];

  var U = { REPO: REPO, MIRRORS: MIRROR_LIST, latest: null, checking: false, lastAt: 0, error: null };

  function parts(v) { return String(v || '0').replace(/^v/i, '').split(/[.+-]/).map(function (x) { return parseInt(x, 10) || 0; }); }
  function cmp(a, b) {
    var x = parts(a), y = parts(b);
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var d = (x[i] || 0) - (y[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  U.cmp = cmp;
  U.current = function () { return String(C.info.version || '0'); };

  function extractSha(text) {
    var m = String(text || '').match(/SHA256[:：\s]+([0-9a-fA-F]{64})/i);
    return m ? m[1].toLowerCase() : '';
  }

  /** 把 latest.json 或 GitHub Releases API 的返回统一成 {rawTag, tag, newer, apk, sha256, notes, page, at, via}。 */
  function normalizeMeta(j, isApi, via) {
    if (!j || typeof j !== 'object') return null;
    if (isApi) {
      var apk = (j.assets || []).filter(function (a) { return /\.apk$/i.test(a.name); })[0] || null;
      var rawTag = String(j.tag_name || '');
      if (!rawTag) return null;
      var sha = (apk && apk.digest && /^sha256:/i.test(apk.digest) ? apk.digest.slice(7).toLowerCase() : '') || extractSha(j.body);
      return {
        rawTag: rawTag,
        tag: rawTag.replace(/^v/i, ''),
        newer: cmp(rawTag, U.current()) > 0,
        apk: apk ? { name: apk.name, size: apk.size || 0, url: apk.browser_download_url } : null,
        sha256: sha,
        notes: String(j.body || ''),
        page: j.html_url || ('https://github.com/' + REPO + '/releases/tag/' + encodeURIComponent(rawTag)),
        at: j.published_at || '',
        via: via
      };
    }
    var ver = String(j.version || j.tag || '').replace(/^v/i, '');
    if (!ver) return null;
    var rtag = j.tag || ('v' + ver);
    var fname = j.apkName || 'modelhub.apk';
    var url = j.apkUrl || ('https://github.com/' + REPO + '/releases/download/' + encodeURIComponent(rtag) + '/' + encodeURIComponent(fname));
    return {
      rawTag: rtag,
      tag: ver,
      newer: cmp(ver, U.current()) > 0,
      apk: { name: fname, size: +j.size || 0, url: url },
      sha256: String(j.sha256 || '').toLowerCase(),
      notes: String(j.notes || ''),
      page: j.page || ('https://github.com/' + REPO + '/releases/tag/' + encodeURIComponent(rtag)),
      at: j.publishedAt || '',
      via: via
    };
  }

  /** 按用户所选线路偏好决定检查顺序：选「直连」时优先 GitHub API，默认「国内镜像」先查免梯 CDN。 */
  function metaOrder() {
    var pref = C.settings.updateMirror || 'auto';
    if (pref === 'direct') return [META_URLS[3], META_URLS[0], META_URLS[1], META_URLS[2]];
    return META_URLS;
  }

  /** 检查最新版本：依次尝试国内 CDN 与 GitHub API，任一成功即返回。 */
  U.check = function () {
    if (U.checking) return U.promise;
    U.checking = true; U.error = null;
    var list = metaOrder(), idx = 0, lastErr = '检查更新失败';
    function step() {
      if (idx >= list.length) return Promise.reject(new Error(lastErr));
      var item = list[idx++];
      var hdr = item.isApi
        ? { Accept: 'application/vnd.github+json', 'User-Agent': 'ModelHub-Android' }
        : { Accept: 'application/json', 'User-Agent': 'ModelHub-Android' };
      // 加时间戳参数绕开代理缓存
      var u = item.isApi ? item.url : (item.url + '?t=' + Math.floor(Date.now() / 60000));
      return C.net(u, { headers: hdr, timeoutMs: 10000 }).then(function (r) {
        if (!r.status) { lastErr = r.error || '网络不通'; return step(); }
        if (r.status === 404) { lastErr = '尚未发布版本信息'; return step(); }
        if (r.status === 403 || r.status === 429) { lastErr = '请求过于频繁'; return step(); }
        if (r.status >= 400) { lastErr = '服务器返回 ' + r.status; return step(); }
        var j;
        try { j = JSON.parse(r.body); } catch (e) { lastErr = '版本信息格式异常'; return step(); }
        var info = normalizeMeta(j, item.isApi, item.name);
        if (!info) { lastErr = '版本信息不完整'; return step(); }
        return info;
      });
    }
    U.promise = step().then(function (info) {
      U.latest = info;
      U.lastAt = Date.now();
      U.error = null;
      C.emit('update', U.latest);
      return U.latest;
    }).catch(function (e) {
      U.error = { message: (e && e.message) || '检查更新失败', at: Date.now() };
      return null;
    }).then(function (v) { U.checking = false; return v; });
    return U.promise;
  };

  /** 生成候选下载地址：默认国内加速镜像优先，全部失败再回退 GitHub 直连；支持自定义镜像前缀。 */
  U.sources = function (asset) {
    var base = (asset && (asset.url || asset.browser_download_url)) ||
      ('https://github.com/' + REPO + '/releases/download/' + encodeURIComponent(U.latest ? U.latest.rawTag : '') + '/' + encodeURIComponent((asset && asset.name) || 'modelhub.apk'));
    var pref = C.settings.updateMirror || 'auto';
    var custom = String(C.settings.customMirror || '').trim();
    var arr = [];
    if (custom && /^https?:\/\//.test(custom)) {
      if (custom.charAt(custom.length - 1) !== '/') custom += '/';
      arr.push({ name: '自定义镜像', prefix: custom, url: custom + base });
    }
    var ordered = MIRROR_LIST.slice();
    if (pref !== 'auto') {
      var hit = ordered.filter(function (m) { return m.id === pref; })[0];
      if (hit) ordered = [hit].concat(ordered.filter(function (m) { return m.id !== pref; }));
    }
    ordered.forEach(function (m) { arr.push({ name: m.name, prefix: m.prefix, url: m.prefix + base }); });
    return arr;
  };

  /**
   * 依次尝试各镜像下载安装包，下载完核对 SHA-256（若版本信息提供了摘要），
   * 校验不过则自动换下一条镜像，确保无梯下载既快又安全。
   */
  U.download = function (asset, onProgress, onBytes) {
    var list = U.sources(asset), i = 0;
    var wantSha = (U.latest && U.latest.sha256) ? String(U.latest.sha256).toLowerCase() : '';
    var lastErr = '';
    function next() {
      if (i >= list.length) {
        return Promise.resolve({ ok: false, error: lastErr || '所有镜像均下载失败，可复制链接到浏览器下载' });
      }
      var item = list[i++];
      if (onProgress) onProgress({ name: item.name, mirror: item.prefix, url: item.url, step: i, total: list.length });
      return C.fetchApk(item.url, onBytes).then(function (r) {
        if (r && r.ok) {
          if (wantSha && r.sha256 && String(r.sha256).toLowerCase() !== wantSha) {
            lastErr = '文件校验不一致，已自动换线路';
            return next();
          }
          return { ok: true, mirror: item.prefix, name: item.name, sha256: r.sha256 || '' };
        }
        lastErr = (r && r.error) || '下载失败';
        return next();
      });
    }
    return next();
  };

  /** 返回当前优先镜像下的 APK 下载链接，方便用户一键复制。 */
  U.copyUrl = function (asset) {
    var list = U.sources(asset);
    return list.length ? list[0].url : '';
  };

  /** 启动后自动静默检查一次（6 小时内不重复）。 */
  U.autoCheck = function () {
    var KEY = 'update.checkedAt', last = 0;
    try { last = parseInt(w.localStorage.getItem(KEY) || '0', 10) || 0; } catch (e) { last = 0; }
    if (Date.now() - last < 6 * 3600 * 1000) return null;
    return U.check().then(function (r) {
      if (r) { try { w.localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }
      return r;
    });
  };

  w.Update = U;
})(window);
