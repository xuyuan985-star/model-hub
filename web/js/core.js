/* core.js — 原生桥、本地存储、数据源（秒开：先读缓存/内置快照，再后台刷新）。ES2019，面向 Chrome 91 WebView。 */
(function (w) {
  'use strict';
  var N = w.Native;
  var core = {};
  var listeners = {};
  core.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
  core.emit = function (ev, a, b) { (listeners[ev] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.error(e); } }); };

  // ---------- 原生桥 ----------
  var pending = {}, seq = 0;
  w.__nativeDone = function (id, json) {
    var p = pending[id]; if (!p) return; delete pending[id];
    var r; try { r = JSON.parse(json); } catch (e) { r = { status: 0, error: '返回内容异常' }; }
    p(r);
  };
  core.info = (function () { try { return JSON.parse(N.info()); } catch (e) { return {}; } })();

  /** 联网。返回 {status, headers, body, bytes, ms, error}；status 0 表示没连上。 */
  core.net = function (url, opt) {
    opt = opt || {};
    return new Promise(function (resolve) {
      var id = 'n' + (++seq), tm = opt.timeoutMs || 20000;
      var t = setTimeout(function () { if (pending[id]) { delete pending[id]; resolve({ status: 0, error: '连接超时' }); } }, tm + 8000);
      pending[id] = function (r) { clearTimeout(t); resolve(r); };
      var body = opt.body == null ? null : (typeof opt.body === 'string' ? opt.body : JSON.stringify(opt.body));
      N.http(id, JSON.stringify({ url: url, method: opt.method || 'GET', headers: opt.headers || {}, body: body, timeoutMs: tm }));
    });
  };

  /** 下载安装包到应用缓存。返回 {ok, bytes} 或 {ok:false, error}。onBytes(got, total) 报告进度。 */
  var apkPending = {}, apkSeq = 0;
  w.__apkDone = function (id, json) {
    var p = apkPending[id]; if (!p) return; delete apkPending[id];
    var r; try { r = JSON.parse(json); } catch (e) { r = { ok: false, error: '返回内容异常' }; }
    p(r);
  };
  w.__apkProgress = function (id, got, total) {
    var p = apkPending[id]; if (p && p.progress) { try { p.progress(got, total); } catch (e) {} }
  };
  core.fetchApk = function (url, onBytes) {
    return new Promise(function (resolve) {
      var id = 'a' + (++apkSeq);
      var t = setTimeout(function () { if (apkPending[id]) { delete apkPending[id]; resolve({ ok: false, error: '下载超时' }); } }, 300000);
      apkPending[id] = function (r) { clearTimeout(t); resolve(r); };
      apkPending[id].progress = onBytes;
      try { N.downloadApk(id, url); } catch (e) { clearTimeout(t); delete apkPending[id]; resolve({ ok: false, error: String(e && e.message || e) }); }
    });
  };

  // ---------- 本地存储 ----------
  core.store = {
    get: function (name, fb) {
      try { var s = N.readFile(name); return s ? JSON.parse(s) : fb; } catch (e) { return fb; }
    },
    set: function (name, obj) { try { return N.writeFile(name, JSON.stringify(obj)); } catch (e) { return false; } },
    del: function (name) { try { return N.deleteFile(name); } catch (e) { return false; } },
    asset: function (name) { try { var s = N.readAsset(name); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  };

  // ---------- 设置 ----------
  var defaults = {
    theme: 'auto', currency: 'USD', blend: 3,
    pinned: ['opencode', 'opencode-go', 'commandcode'],
    favorites: [], catalogUrl: '', aaDedupe: true,
    est: { inM: 20, outM: 5 }, aaMode: 'scrape'
  };
  core.settings = Object.assign({}, defaults, core.store.get('settings.json', {}));
  core.saveSettings = function (patch) {
    if (patch) Object.assign(core.settings, patch);
    core.store.set('settings.json', core.settings);
    core.emit('settings');
  };

  // ---------- 数据源 ----------
  var sources = {};
  core.sources = sources;
  core.defSource = function (def) {
    var s = { def: def, data: null, meta: {}, fetchedAt: 0, checkedAt: 0, origin: 'none', error: null, refreshing: false, version: 0, ms: 0, bytes: 0 };
    sources[def.id] = s;
    var c = core.store.get(def.id + '.json', null);
    var origin = 'cache';
    if (!c || c.data == null) { c = core.store.asset('web/seed/' + def.id + '.json'); origin = 'seed'; }
    if (c && c.data != null) {
      s.data = c.data; s.meta = c.meta || {}; s.fetchedAt = c.fetchedAt || 0;
      s.checkedAt = origin === 'cache' ? (c.checkedAt || c.fetchedAt || 0) : 0; s.origin = origin; s.version = 1;
    }
    return s;
  };
  function ttl(s) { var t = s.def.ttlMin; return typeof t === 'function' ? t() : t; }
  function stale(s) { return !s.checkedAt || Date.now() - s.checkedAt > ttl(s) * 60000; }
  core.isStale = stale;
  core.refresh = function (id, force) {
    var s = sources[id];
    if (s.refreshing) return s.promise;
    s.refreshing = true; s.error = null; core.emit('source', s);
    var t0 = Date.now();
    s.promise = Promise.resolve().then(function () { return s.def.fetch(s, !!force); }).then(function (out) {
      if (out && out.notModified) { s.checkedAt = Date.now(); if (out.meta) s.meta = out.meta; }
      else {
        var prev = s.data;
        s.data = out.data; s.meta = out.meta || {}; s.fetchedAt = s.checkedAt = Date.now(); s.origin = 'live'; s.version++;
        if (s.def.onChange && prev) { try { s.def.onChange(prev, s.data); } catch (e) { console.error(e); } }
      }
      core.store.set(id + '.json', { fetchedAt: s.fetchedAt, checkedAt: s.checkedAt, meta: s.meta, data: s.data });
      return true;
    }).catch(function (e) {
      s.error = { message: (e && e.message) || String(e), at: Date.now() };
      return false;
    }).then(function (ok) {
      s.refreshing = false; s.ms = Date.now() - t0; core.emit('source', s); if (ok) core.emit('data', id, s);
      return ok;
    });
    return s.promise;
  };
  core.refreshAll = function (force) {
    return Promise.all(Object.keys(sources).map(function (id) {
      var s = sources[id];
      if (s.def.lazy && !force && !s.data) return true;
      return (force || stale(s)) ? core.refresh(id, force) : true;
    }));
  };
  core.sourceLabel = function (s) {
    if (s.refreshing) return '更新中…';
    if (s.error && !s.checkedAt) return '未更新';
    var t = s.checkedAt || s.fetchedAt;
    if (!t) return s.origin === 'seed' ? '内置数据' : '无数据';
    return core.ago(t);
  };

  // ---------- 小工具 ----------
  core.ago = function (t) {
    var d = Math.max(0, Date.now() - t) / 1000;
    if (d < 60) return '刚刚'; if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
    if (d < 86400) return Math.floor(d / 3600) + ' 小时前'; return Math.floor(d / 86400) + ' 天前';
  };
  core.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  core.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  w.Core = core;
})(window);
