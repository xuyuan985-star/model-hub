/* workshop.js — 插件工坊：从 GitHub 仓库拉取插件收录列表与单个插件清单，下载即安装。ES2019，面向 Chrome 91 WebView。
 *
 * 数据位置（仓库 main 分支，raw 地址）：
 *   plugins/index.json            收录列表（id / name / version / author / description / path）
 *   plugins/<id>/mod.json         插件清单，下载时拉取并交给 Mods.install 校验
 * 直连 raw.githubusercontent.com 失败时依次走镜像前缀（与应用更新相同的镜像策略）。
 */
(function (w) {
  'use strict';
  var C = w.Core;
  var REPO = 'xuyuan985-star/model-hub';
  var BRANCH = 'main';
  var RAW = 'https://raw.githubusercontent.com/' + REPO + '/' + BRANCH + '/';
  var MIRRORS = ['', 'https://ghproxy.net/', 'https://gh-proxy.com/', 'https://ghfast.top/'];

  var W = { list: null, error: null, loading: false, loadedAt: 0 };

  /** 依次尝试各镜像地址取 JSON。返回解析后的对象或抛错。 */
  function fetchJsonMirrored(url) {
    var i = 0;
    function next(lastErr) {
      if (i >= MIRRORS.length) return Promise.reject(new Error(lastErr || '所有地址都没连上'));
      var u = MIRRORS[i++] + url;
      return C.net(u, { headers: { 'User-Agent': 'ModelHub' }, timeoutMs: 15000 }).then(function (r) {
        if (!r.status || r.status >= 400) return next(r.error || ('HTTP ' + r.status));
        try { return JSON.parse(r.body); } catch (e) { return next('返回的不是 JSON'); }
      });
    }
    return next();
  }

  /** 拉取收录列表。成功后缓存在内存，并写入本地以便离线查看。 */
  W.refresh = function () {
    if (W.loading) return W.promise;
    W.loading = true; W.error = null;
    W.promise = fetchJsonMirrored(RAW + 'plugins/index.json').then(function (idx) {
      var arr = idx && Array.isArray(idx.plugins) ? idx.plugins : null;
      if (!arr) throw new Error('收录列表格式不对');
      W.list = arr.filter(function (p) { return p && typeof p.id === 'string' && typeof p.path === 'string'; }).map(function (p) {
        return { id: p.id, name: String(p.name || p.id).slice(0, 30), version: String(p.version || ''), author: String(p.author || '').slice(0, 30), description: String(p.description || '').slice(0, 120), path: p.path };
      });
      W.loadedAt = Date.now();
      C.store.set('workshop.json', { list: W.list, at: W.loadedAt });
      return W.list;
    }).catch(function (e) {
      W.error = e.message || String(e);
      if (!W.list) { var c = C.store.get('workshop.json', null); if (c && c.list) W.list = c.list; }
      throw e;
    }).then(function (r) { W.loading = false; C.emit('workshop'); return r; }, function (e) { W.loading = false; C.emit('workshop'); throw e; });
    return W.promise;
  };

  /** 读取本地缓存的收录列表（启动时用，不联网）。 */
  W.cached = function () {
    if (!W.list) { var c = C.store.get('workshop.json', null); if (c && c.list) W.list = c.list; }
    return W.list || [];
  };

  /** 下载并安装一个收录的插件：拉取 mod.json -> Mods.install 校验 -> 返回结果。 */
  W.install = function (entry) {
    return fetchJsonMirrored(RAW + entry.path).then(function (raw) {
      var r = w.Mods.install(raw);
      if (!r.ok) return { ok: false, error: r.error };
      if (r.mod.id !== entry.id) return { ok: false, error: '清单 id 与收录列表不一致' };
      return { ok: true, mod: r.mod };
    }, function (e) { return { ok: false, error: '下载失败：' + (e.message || e) }; });
  };

  w.Workshop = W;
})(window);
