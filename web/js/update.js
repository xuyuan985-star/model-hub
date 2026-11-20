/* update.js — 从 GitHub Releases 检查并下载新版安装包。 */
(function (w) {
  'use strict';
  var C = w.Core;
  var REPO = 'xuyuan985-star/model-hub';
  var API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  // 直连优先；github.com 的大文件在国内常被掐，失败后依次走镜像前缀
  var MIRRORS = ['', 'https://ghproxy.net/', 'https://gh-proxy.com/', 'https://ghfast.top/'];

  var U = { REPO: REPO, latest: null, checking: false, lastAt: 0, error: null };

  function parts(v) { return String(v || '0').replace(/^v/i, '').split(/[.+-]/).map(function (x) { return parseInt(x, 10) || 0; }); }
  /** 比较版本号：a 新于 b 返回 1。 */
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

  U.check = function () {
    if (U.checking) return U.promise;
    U.checking = true; U.error = null;
    U.promise = C.net(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ModelHub-Android' }, timeoutMs: 15000 })
      .then(function (r) {
        if (!r.status) throw new Error(r.error || '没能连上服务器');
        if (r.status === 404) throw new Error('还没有发布过版本');
        if (r.status === 403 || r.status === 429) throw new Error('请求太频繁，稍后再试');
        if (r.status >= 400) throw new Error('服务器返回 ' + r.status);
        var j = JSON.parse(r.body);
        var apk = (j.assets || []).filter(function (a) { return /\.apk$/i.test(a.name); })[0] || null;
        U.latest = {
          rawTag: String(j.tag_name || ''),
          tag: String(j.tag_name || '').replace(/^v/i, ''),
          newer: cmp(j.tag_name, U.current()) > 0,
          apk: apk,
          notes: String(j.body || ''),
          page: j.html_url,
          at: j.published_at
        };
        U.lastAt = Date.now();
        U.error = null;
        C.emit('update', U.latest);
        return U.latest;
      })
      .catch(function (e) {
        U.error = { message: (e && e.message) || '检查更新失败', at: Date.now() };
        return null;
      })
      .then(function (v) { U.checking = false; return v; });
    return U.promise;
  };

  /** 候选下载地址：直连 + 各镜像。release 资产地址带上 tag 才拼得出来。 */
  U.sources = function (asset) {
    var u = asset.browser_download_url ||
      ('https://github.com/' + REPO + '/releases/download/' + encodeURIComponent(U.latest ? U.latest.rawTag : (asset.tag || '')) + '/' + encodeURIComponent(asset.name));
    return MIRRORS.map(function (m) { return { mirror: m, url: m + u }; });
  };

  /** 依次试每个地址下载到应用缓存，成功后返回 {ok:true}。onProgress 收 {step,total,mirror}，onBytes 收 (got,total)。 */
  U.download = function (asset, onProgress, onBytes) {
    var list = U.sources(asset), i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve({ ok: false, error: '所有下载地址都没成功，可以复制链接到浏览器下载' });
      var item = list[i++];
      if (onProgress) onProgress({ mirror: item.mirror, url: item.url, step: i, total: list.length });
      return C.fetchApk(item.url, onBytes).then(function (r) {
        if (r && r.ok) return { ok: true, mirror: item.mirror };
        return next();
      });
    }
    return next();
  };

  /** 启动后自动查一次，失败不打扰；六小时内不重复查。 */
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
