/* ping.js — 额度平台连通/耗时测速、低余额/即将到期提醒、配置导出导入（不含密钥）。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core, U = w.Usage;
  var P = {};

  /**
   * 测速：对已填密钥的账户发一个极轻量只读请求（优先 GET /v1/models 或余额接口，0 token 消费），
   * 测出当前手机网络到该平台的真实往返耗时（ms）和可达性。
   */
  var PROBE_PATH = {
    openrouter: '/api/v1/models',
    deepseek: '/models',
    siliconflow: '/v1/models',
    moonshot: '/v1/models',
    commandcode: '/provider/v1/models',
    newapi: '/v1/models'
  };

  P.testLatency = function (acct) {
    var prov = U.get(acct.providerId);
    var base = (acct.baseUrl || (prov && prov.baseUrl) || '').replace(/\/+$/, '');
    if (!base) return Promise.resolve({ ok: false, error: '未设置网址' });
    var path = PROBE_PATH[acct.providerId] || (prov && prov.requests && prov.requests[0] && prov.requests[0].path) || '/v1/models';
    var h = { Accept: 'application/json' };
    var secret = '{{secret:' + acct.id + '}}';
    if (prov && prov.auth === 'x-api-key') h['x-api-key'] = secret;
    else if (!prov || prov.auth !== 'query') h.Authorization = 'Bearer ' + secret;

    var url = base + path;
    var t0 = Date.now();
    return C.net(url, { method: 'GET', headers: h, timeoutMs: 12000 }).then(function (r) {
      var ms = r.ms || (Date.now() - t0);
      if (!r.status) return { ok: false, ms: ms, error: r.error || '无法连接' };
      // 200/401/403 都说明网络通畅（拿到响应），但 401/403 顺便标出密钥状态
      var ok = r.status >= 200 && r.status < 300;
      return {
        ok: ok,
        reachable: true,
        status: r.status,
        ms: ms,
        grade: ms < 400 ? '快' : ms < 1200 ? '正常' : '较慢',
        error: ok ? null : (r.status === 401 || r.status === 403 ? '网络通，但密钥被拒 (' + r.status + ')' : '状态码 ' + r.status),
        at: Date.now()
      };
    });
  };

  /**
   * 扫描所有已查过额度的账户，找出需要提醒的项（余额低于阈值，或套餐 3 天内到期，或窗口剩余 < 10%）。
   */
  P.alerts = function () {
    var out = [];
    var minUsd = C.settings.alertUsd != null ? +C.settings.alertUsd : 2;
    var minCny = C.settings.alertCny != null ? +C.settings.alertCny : 10;
    (U.accounts || []).forEach(function (a) {
      var r = U.results[a.id];
      if (!r || !r.ok || !r.fields) return;
      var f = r.fields, p = U.get(a.providerId), nm = a.label || (p ? p.name : a.providerId);
      var unit = r.unit || (p && p.unit) || 'USD';
      var th = unit === 'CNY' ? minCny : minUsd;
      if (typeof f.remaining === 'number' && th > 0 && f.remaining < th && !(f.limit && f.limit > 1e6)) {
        out.push({ id: a.id, name: nm, msg: '余额偏低（剩 ' + (unit === 'CNY' ? '¥' : '$') + f.remaining.toFixed(2) + '）' });
      }
      if (f.periodEnd) {
        var d = Math.ceil((Date.parse(f.periodEnd) - Date.now()) / 864e5);
        if (isFinite(d) && d <= 3) out.push({ id: a.id, name: nm, msg: d <= 0 ? '订阅已到期' : '订阅还剩 ' + d + ' 天到期' });
      }
      if (f.w5 && f.w5.cap > 0 && (1 - f.w5.used / f.w5.cap) < 0.1) {
        out.push({ id: a.id, name: nm, msg: '5 小时窗口快用完' });
      }
      if (f.w7 && f.w7.cap > 0 && (1 - f.w7.used / f.w7.cap) < 0.1) {
        out.push({ id: a.id, name: nm, msg: '每周窗口快用完' });
      }
    });
    return out;
  };

  /** 导出本地配置（纯设置、自选、置顶、自定义平台与套餐；绝不包含任何 API 密钥）。 */
  P.exportConfig = function () {
    var payload = {
      app: 'modelhub',
      ver: 1,
      at: Date.now(),
      settings: C.settings,
      customProviders: U.custom || [],
      customPlans: (w.Plans && w.Plans.custom) || []
    };
    return JSON.stringify(payload);
  };

  /** 导入配置文本，校验结构后合并保存。 */
  P.importConfig = function (text) {
    var j;
    try { j = JSON.parse(String(text || '').trim()); } catch (e) { throw new Error('内容不是有效的配置文本'); }
    if (!j || j.app !== 'modelhub') throw new Error('这不是「模型行情」导出的配置');
    if (j.settings && typeof j.settings === 'object') {
      // 只合并白名单字段
      var allow = ['theme', 'currency', 'blend', 'pinned', 'favorites', 'aaDedupe', 'est', 'alertUsd', 'alertCny'];
      var patch = {};
      allow.forEach(function (k) { if (k in j.settings) patch[k] = j.settings[k]; });
      C.saveSettings(patch);
    }
    if (Array.isArray(j.customProviders)) {
      U.custom = j.customProviders.filter(function (x) { return x && x.id && x.baseUrl; });
      U.saveCustom();
    }
    if (Array.isArray(j.customPlans) && w.Plans) {
      w.Plans.custom = j.customPlans.filter(function (x) { return x && x.id && x.name; });
      w.Plans.save();
    }
    return true;
  };

  w.Tools = P;
})(window);
