/* sources.js — 三个数据源：AA 榜单、模型价格、汇率；以及变动记录。 */
(function (w) {
  'use strict';
  var C = w.Core;
  var UA_ANDROID = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  var SEED_CDNS = [
    'https://gh-proxy.org/https://raw.githubusercontent.com/xuyuan985-star/model-hub/main/web/seed/',
    'https://gh-proxy.com/https://raw.githubusercontent.com/xuyuan985-star/model-hub/main/web/seed/',
    'https://wget.la/https://raw.githubusercontent.com/xuyuan985-star/model-hub/main/web/seed/',
    'https://fastly.jsdelivr.net/gh/xuyuan985-star/model-hub@main/web/seed/',
    'https://testingcf.jsdelivr.net/gh/xuyuan985-star/model-hub@main/web/seed/'
  ];

  /** 免梯国内镜像快照兜底：直连官网超时或用户选了「国内镜像」时，从 jsDelivr 拉取最新仓库快照。 */
  C.fetchMirrorSeed = function (id) {
    var i = 0, lastErr = '国内镜像暂时不可用';
    function next() {
      if (i >= SEED_CDNS.length) return Promise.reject(new Error(lastErr));
      var u = SEED_CDNS[i++] + id + '.json?t=' + Math.floor(Date.now() / 300000);
      return C.net(u, { timeoutMs: 18000, headers: { Accept: 'application/json', 'User-Agent': UA_ANDROID } }).then(function (r) {
        if (!r.status || r.status >= 400) { lastErr = r.error || ('镜像返回 ' + r.status); return next(); }
        try {
          var j = JSON.parse(r.body);
          if (j && j.data) return { data: j.data, meta: { via: '国内镜像', seedAt: j.fetchedAt || Date.now(), netMs: r.ms } };
        } catch (e) {}
        lastErr = '镜像内容异常';
        return next();
      });
    }
    return next();
  };

  /** 根据用户「数据线路」偏好决定是直连优先+镜像兜底，还是直接走国内镜像。 */
  C.withMirrorFallback = function (id, directFn) {
    if (C.settings.dataRoute === 'mirror') return C.fetchMirrorSeed(id);
    return directFn().catch(function (err) {
      if (C.settings.dataRoute === 'direct') throw err;
      return C.fetchMirrorSeed(id).catch(function () { throw err; });
    });
  };

  // ----- 变动记录（新模型 / 价格变化），最多保留 100 条 -----
  var feed = C.store.get('feed.json', []);
  C.feed = feed;
  function pushFeed(items) {
    if (!items.length) return;
    var now = Date.now();
    items.forEach(function (x) { x.t = now; feed.unshift(x); });
    if (feed.length > 100) feed.length = 100;
    C.store.set('feed.json', feed);
    C.emit('feed');
  }

  // ----- AA 榜单 -----
  C.defSource({
    id: 'aa', title: 'AA 榜单', ttlMin: function () { return C.settings.aaMode === 'api' ? 240 : 60; }, url: 'https://artificialanalysis.ai',
    fetch: function () {
      if (C.settings.aaMode === 'api') return w.AaApi.fetchAll();
      return C.withMirrorFallback('aa', function () {
        var src = w.AAParse.SOURCES.leaderboard;
        var h = {}; Object.keys(src.headers).forEach(function (k) { h[k] = src.headers[k]; });
        h['User-Agent'] = UA_ANDROID;
        return C.net(src.url, { headers: h, timeoutMs: 22000 }).then(function (r) {
          if (!r.status) throw new Error('没能连上 AA 网站：' + (r.error || '网络不通'));
          if (r.status >= 400) throw new Error('AA 网站返回 ' + r.status + (r.status === 403 || r.status === 429 ? '（访问被限制，稍后再试）' : ''));
          return new Promise(function (res) { setTimeout(function () { res(r); }, 0); });
        }).then(function (r) {
          var t0 = Date.now();
          var out = w.AAParse.parseAA(r.body);
          if (!out.ok) throw new Error('AA 页面结构可能变了，没能解析（' + (out.errorMessage || out.error) + '）。已保留旧数据。');
          return { data: { models: out.models, evals: out.evals, meta: out.meta }, meta: { bytes: r.bytes, netMs: r.ms, parseMs: Date.now() - t0, via: '直连' } };
        });
      });
    },
    onChange: function (a, b) {
      var seen = {};
      (a.models || []).forEach(function (m) { seen[m.releaseName || m.name] = 1; });
      var items = [], added = {};
      (b.models || []).forEach(function (m) {
        var k = m.releaseName || m.name;
        if (!seen[k] && !added[k]) { added[k] = 1; items.push({ k: 'aa-new', title: k, sub: m.creatorName, ii: m.intelligenceIndex }); }
      });
      pushFeed(items.slice(0, 20));
    }
  });

  // ----- 价格（models.dev，约 7MB，用 ETag 避免重复下载；无梯时自动走国内镜像快照） -----
  C.defSource({
    id: 'prices', title: '模型价格', ttlMin: 360, url: 'https://models.dev',
    fetch: function (s, force) {
      return C.withMirrorFallback('prices', function () {
        var h = { 'User-Agent': UA_ANDROID };
        if (!force && s.meta && s.meta.etag) h['If-None-Match'] = s.meta.etag;
        return C.net('https://models.dev/api.json', { headers: h, timeoutMs: 45000 }).then(function (r) {
          if (!r.status) throw new Error('没能连上价格数据源：' + (r.error || '网络不通'));
          if (r.status === 304) return { notModified: true, meta: s.meta };
          if (r.status >= 400) throw new Error('价格数据源返回 ' + r.status);
          return new Promise(function (res) { setTimeout(function () { res(r); }, 0); });
        }).then(function (r) {
          if (r.notModified) return r;
          var md = JSON.parse(r.body);
          var data = w.Norm.trimModelsDev(md);
          var n = Object.keys(data.providers).length;
          if (n < 20) throw new Error('价格数据异常（只有 ' + n + ' 家提供商），已保留旧数据');
          return { data: data, meta: { etag: r.headers && r.headers.etag, bytes: r.bytes, netMs: r.ms, via: '直连' } };
        });
      });
    },
    onChange: function (a, b) {
      var items = [];
      var watch = {}; (C.settings.pinned || []).forEach(function (p) { watch[p] = 1; });
      Object.keys(b.providers).forEach(function (pid) {
        var pa = a.providers[pid], pb = b.providers[pid];
        if (!pa) return;
        var old = {}; pa.models.forEach(function (m) { old[m.id] = m; });
        pb.models.forEach(function (m) {
          var o = old[m.id];
          if (!o) { if (watch[pid]) items.push({ k: 'price-new', title: m.n, sub: pb.name, i: m.i, o: m.o, pid: pid }); return; }
          if (o.i !== m.i || o.o !== m.o) {
            items.push({ k: 'price-change', title: m.n, sub: pb.name, pid: pid, i0: o.i, o0: o.o, i: m.i, o: m.o });
          }
        });
      });
      pushFeed(items.slice(0, 60));
    }
  });

  // ----- 汇率 -----
  C.defSource({
    id: 'fx', title: '汇率', ttlMin: 720, url: 'https://open.er-api.com',
    fetch: function () {
      return C.net('https://open.er-api.com/v6/latest/USD', { timeoutMs: 15000 }).then(function (r) {
        if (!r.status || r.status >= 400) throw new Error('汇率获取失败');
        var j = JSON.parse(r.body);
        if (!j.rates || !j.rates.CNY) throw new Error('汇率数据异常');
        return { data: { CNY: j.rates.CNY, date: j.time_last_update_utc } };
      });
    }
  });

  C.fxRate = function () { var s = C.sources.fx; return (s.data && s.data.CNY) || 7.2; };
  /** 把美元价格按设置显示，perM 表示"每百万 tokens"。 */
  C.money = function (usd, digits) {
    if (usd == null) return '—';
    var cny = C.settings.currency === 'CNY';
    var v = cny ? usd * C.fxRate() : usd, sym = cny ? '¥' : '$';
    if (v === 0) return '免费';
    var d = digits != null ? digits : (v >= 100 ? 0 : v >= 10 ? 1 : v >= 1 ? 2 : v >= 0.1 ? 3 : 4);
    return sym + v.toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  };
})(window);
