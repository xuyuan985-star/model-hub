/* usage.js — 额度查询：用 JSON 描述"怎么查"，不写代码就能新增提供商。
 *
 * 一个提供商 = { id, name, baseUrl, auth, requests[], fields{}, ... }
 *   auth:    'bearer'（Authorization: Bearer 密钥）| 'x-api-key' | 'query'
 *   requests: [{ id, path, method, query:{}, headers:{}, body, dates:true }]  可以有多个，后面的能用前面的结果
 *   fields:  { balance, granted, used, plan, currency, resetAt, ... } 每项 = { from:'请求id.json.路径', op?, ...}
 *
 * 路径语法：a.b.c  数组下标 a.0.b  数组按条件挑选 a[currency=CNY].balance
 * 运算 op：div(除) mul(乘) sub(a-b) add num(转数字)，例如 {from:'r.data.quota', op:'div', by:500000}
 *
 * 密钥永远不进入网页：请求里写 {{secret:账户id}}，由原生层在发出前替换。
 */
(function (w) {
  'use strict';
  var C = w.Core;
  var U = {};

  // ---- 内置提供商（自带，随版本更新）；可信度：doc=官方文档写明 / community=社区通用 / probe=已探测地址存在 ----
  U.builtin = [
    { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai', conf: 'doc', auth: 'bearer',
      requests: [{ id: 'k', path: '/api/v1/key' }],
      fields: { used: { from: 'k.data.usage' }, limit: { from: 'k.data.limit' }, remaining: { from: 'k.data.limit_remaining' }, plan: { from: 'k.data.is_free_tier', map: { 'true': '免费', 'false': '付费' } } },
      unit: 'USD', note: '余额 = 额度上限 − 已用；未设上限时只显示已用。' },
    { id: 'deepseek', name: 'DeepSeek 深度求索', baseUrl: 'https://api.deepseek.com', conf: 'doc', auth: 'bearer',
      requests: [{ id: 'b', path: '/user/balance' }],
      fields: { remaining: { from: 'b.balance_infos[currency=CNY].total_balance', op: 'num' }, granted: { from: 'b.balance_infos[currency=CNY].granted_balance', op: 'num' }, topped: { from: 'b.balance_infos[currency=CNY].topped_up_balance', op: 'num' } },
      unit: 'CNY', note: '人民币余额；赠送额与充值额分开显示。' },
    { id: 'siliconflow', name: '硅基流动 SiliconFlow', baseUrl: 'https://api.siliconflow.cn', conf: 'doc', auth: 'bearer',
      requests: [{ id: 'u', path: '/v1/user/info' }],
      fields: { remaining: { from: 'u.data.totalBalance', op: 'num' }, granted: { from: 'u.data.balance', op: 'num' }, topped: { from: 'u.data.chargeBalance', op: 'num' }, plan: { from: 'u.data.status' } },
      unit: 'CNY', note: '总余额 = 赠送 + 充值。' },
    { id: 'moonshot', name: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn', conf: 'doc', auth: 'bearer',
      requests: [{ id: 'b', path: '/v1/users/me/balance' }],
      fields: { remaining: { from: 'b.data.available_balance' }, granted: { from: 'b.data.voucher_balance' }, topped: { from: 'b.data.cash_balance' } },
      unit: 'CNY', note: '国际站请把网址改成 https://api.moonshot.ai' },
    { id: 'commandcode', name: 'Command Code', baseUrl: 'https://api.commandcode.ai', conf: 'cli', auth: 'bearer', unit: 'USD',
      requests: [
        { id: 'w', path: '/alpha/whoami', query: { limits: '1' } },
        { id: 'c', path: '/alpha/billing/credits', query: { orgId: '{{id:w.org.id}}' } },
        { id: 's', path: '/alpha/billing/subscriptions', query: { orgId: '{{id:w.org.id}}' } }],
      fields: {
        remaining: { from: 'c.credits.monthlyCredits', op: 'num' }, topped: { from: 'c.credits.purchasedCredits', op: 'num' }, free: { from: 'c.credits.freeCredits', op: 'num' },
        plan: { from: 's.data.planId' }, status: { from: 's.data.status' }, periodEnd: { from: 's.data.currentPeriodEnd' },
        w5: { from: 'c.credits.windowLimits.fiveHour' }, w7: { from: 'c.credits.windowLimits.weekly' } },
      note: '数据来自 Command Code 命令行工具使用的接口（官方没有公开文档），今后可能变动。密钥在 commandcode.ai 的 Studio → API keys 创建。' },
    { id: 'newapi', name: '中转站（One API / New API）', baseUrl: '', conf: 'community', auth: 'bearer', needBaseUrl: true,
      requests: [
        { id: 's', path: '/v1/dashboard/billing/subscription' },
        { id: 'u', path: '/v1/dashboard/billing/usage', query: { start_date: '{{date:-90}}', end_date: '{{date:+1}}' } }],
      fields: { limit: { from: 's.hard_limit_usd' }, used: { from: 'u.total_usage', op: 'div', by: 100 }, remaining: { from: 's.hard_limit_usd', op: 'sub', other: { from: 'u.total_usage', op: 'div', by: 100 } } },
      unit: 'USD', note: '填中转站网址（例如 https://xxx.com）和 sk- 开头的令牌。额度很大（如 1亿）通常代表"不限额"。' }
  ];
  // 暂不支持查询的（探测过没有公开的密钥查询接口），界面里直接说明，不让用户白填
  U.unsupported = [
    { id: 'opencode', name: 'OpenCode / Zen', why: '没有公开的余额接口。', link: 'https://opencode.ai' },
    { id: 'opendesign', name: 'Open Design', why: '额度要登录态，密钥查不到。', link: 'https://open-design.ai/cloud/' },
    { id: 'anthropic', name: 'Anthropic / Claude', why: '只有管理员密钥能查余额。', link: 'https://console.anthropic.com' },
    { id: 'openai', name: 'OpenAI', why: '普通密钥查不到余额。', link: 'https://platform.openai.com' }
  ];

  // ---- 自定义提供商：用户在表单里填的，存手机里 ----
  U.custom = C.store.get('custom-providers.json', []);
  U.saveCustom = function () { C.store.set('custom-providers.json', U.custom); };
  U.all = function () { return U.builtin.concat(U.custom); };
  U.get = function (id) { return U.all().filter(function (p) { return p.id === id; })[0]; };

  /** 表单 → 提供商定义。kind: 'newapi'（只填网址）| 'json'（任意接口，指定取值路径） */
  U.fromForm = function (f) {
    var base = String(f.baseUrl || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(base)) throw new Error('网址要以 http:// 或 https:// 开头');
    var id = 'c_' + C.uid();
    if (f.kind === 'newapi') {
      var t = U.get('newapi');
      return { id: id, name: f.name || base.replace(/^https?:\/\//, ''), baseUrl: base, custom: true, conf: 'community', auth: 'bearer', requests: t.requests, fields: t.fields, unit: 'USD' };
    }
    var path = String(f.path || '').trim(); if (path && path[0] !== '/') path = '/' + path;
    var fields = {};
    if (f.remainingPath) fields.remaining = { from: 'r.' + f.remainingPath.trim() };
    if (f.usedPath) fields.used = { from: 'r.' + f.usedPath.trim() };
    if (f.limitPath) fields.limit = { from: 'r.' + f.limitPath.trim() };
    if (!Object.keys(fields).length) throw new Error('至少要填一个取值位置（剩余 / 已用 / 总额）');
    return { id: id, name: f.name || base, baseUrl: base, custom: true, conf: 'custom', auth: f.auth || 'bearer',
      requests: [{ id: 'r', path: path || '/', method: 'GET' }], fields: fields, unit: f.unit || 'USD' };
  };

  // ---- 取值 ----
  function walk(obj, path) {
    var cur = obj, parts = path.match(/[^.\[\]]+|\[[^\]]+\]/g) || [];
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      var p = parts[i];
      if (p[0] === '[') {
        var m = p.slice(1, -1).split('=');
        if (!Array.isArray(cur)) return undefined;
        cur = cur.filter(function (x) { return x && String(x[m[0]]) === m[1]; })[0];
      } else cur = cur[p];
    }
    return cur;
  }
  function pick(ctx, expr) {
    var i = expr.indexOf('.'); var rid = i < 0 ? expr : expr.slice(0, i);
    if (!(rid in ctx)) return undefined;
    return i < 0 ? ctx[rid] : walk(ctx[rid], expr.slice(i + 1));
  }
  function num(v) { if (v == null || v === '') return null; var n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; }
  function evalField(ctx, f) {
    var v = pick(ctx, f.from);
    if (f.map) return v == null ? null : (f.map[String(v)] != null ? f.map[String(v)] : String(v));
    if (f.op === 'num') return num(v);
    var a = num(v); if (a == null) return typeof v === 'string' ? v : null;
    if (f.op === 'div') return a / f.by; if (f.op === 'mul') return a * f.by;
    if (f.op === 'sub' || f.op === 'add') { var b = f.other ? evalField(ctx, f.other) : null; if (b == null) return null; return f.op === 'sub' ? a - b : a + b; }
    return a;
  }
  function dateStr(offsetDays) { var d = new Date(Date.now() + offsetDays * 86400000); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function tplCtx(s, ctx) {
    return String(s).replace(/\{\{id:([^}]+)\}\}/g, function (_, e) { var v = pick(ctx, e); return v == null ? '' : String(v); });
  }
  function tpl(s) { return String(s).replace(/\{\{date:([+-]?\d+)\}\}/g, function (_, n) { return dateStr(parseInt(n, 10)); }); }

  /** 查询一个账户。acct = {id, providerId, label, baseUrl, hasKey}。返回 {ok, fields, error, raw} */
  U.query = function (acct) {
    var p = U.get(acct.providerId);
    if (!p) return Promise.resolve({ ok: false, error: '找不到这个提供商的查询方式' });
    var base = (acct.baseUrl || p.baseUrl || '').replace(/\/+$/, '');
    if (!base) return Promise.resolve({ ok: false, error: '请先填写网址' });
    var secret = '{{secret:' + acct.id + '}}';
    var ctx = {};
    var chain = Promise.resolve();
    var failed = null;
    p.requests.forEach(function (rq) {
      chain = chain.then(function () {
        if (failed) return;
        var q = rq.query ? '?' + Object.keys(rq.query).filter(function (k) { return tplCtx(rq.query[k], ctx) !== ''; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(tpl(tplCtx(rq.query[k], ctx))); }).join('&') : '';
        var h = {}; Object.keys(rq.headers || {}).forEach(function (k) { h[k] = rq.headers[k]; });
        if (p.auth === 'x-api-key') h['x-api-key'] = secret; else if (p.auth !== 'query') h['Authorization'] = 'Bearer ' + secret;
        h['Accept'] = 'application/json';
        var url = base + rq.path + q;
        if (p.auth === 'query') url += (q ? '&' : '?') + 'key=' + secret;
        return C.net(url, { method: rq.method || 'GET', headers: h, timeoutMs: 20000 }).then(function (r) {
          if (!r.status) { failed = r.error || '网络不通'; return; }
          var j = null; try { j = JSON.parse(r.body); } catch (e) { }
          if (r.status === 401 || r.status === 403) { failed = '密钥被拒绝（' + r.status + '）：请检查密钥是否正确、是否已过期' + (j && (j.error && (j.error.message || j.error) || j.message) ? '。服务器说：' + String(j.error && (j.error.message || j.error) || j.message).slice(0, 80) : ''); return; }
          if (r.status === 404) { failed = '这个网址没有查询接口（404），请确认网址是否正确'; return; }
          if (r.status >= 400) { failed = '服务器返回 ' + r.status + (j && (j.message || (j.error && j.error.message)) ? '：' + String(j.message || j.error.message).slice(0, 80) : ''); return; }
          if (j == null) { failed = '返回的不是 JSON，可能网址填错了（填到了网页地址）'; return; }
          ctx[rq.id] = j;
        });
      });
    });
    return chain.then(function () {
      if (failed) return { ok: false, error: failed };
      var out = {}, any = false;
      Object.keys(p.fields).forEach(function (k) {
        var f = p.fields[k], v = f.op || f.map ? evalField(ctx, f) : pick(ctx, f.from);
        if (v != null && typeof v === 'object') out[k] = v; else out[k] = typeof v === 'string' || typeof v === 'number' ? (f.op === 'num' ? num(v) : (typeof v === 'string' && f.op == null && /^-?\d+(\.\d+)?$/.test(v) && !f.map ? v : v)) : null;
        if (out[k] != null) any = true;
      });
      if (!any) return { ok: false, error: '请求成功，但没有找到想要的数据。可能接口返回的格式和预期不同。', raw: ctx };
      if (out.remaining == null && out.limit != null && out.used != null) out.remaining = out.limit - out.used;
      return { ok: true, fields: out, unit: p.unit, at: Date.now() };
    });
  };

  // ---- 账户（不含密钥；密钥在原生加密库里） ----
  U.accounts = C.store.get('accounts.json', []);
  U.saveAccounts = function () { C.store.set('accounts.json', U.accounts); };
  U.results = C.store.get('usage-results.json', {});
  U.addAccount = function (a, key) {
    if (!key) throw new Error('请填写密钥');
    a.id = a.id || ('a' + C.uid());
    if (!w.Native.setSecret(a.id, String(key).trim())) throw new Error('密钥没能保存到手机的安全存储里');
    U.accounts = U.accounts.filter(function (x) { return x.id !== a.id; }); U.accounts.push(a);
    U.saveAccounts(); return a;
  };
  U.removeAccount = function (id) {
    w.Native.deleteSecret(id); U.accounts = U.accounts.filter(function (x) { return x.id !== id; }); delete U.results[id];
    U.saveAccounts(); C.store.set('usage-results.json', U.results);
  };
  U.refreshAccount = function (id) {
    var a = U.accounts.filter(function (x) { return x.id === id; })[0]; if (!a) return Promise.resolve();
    return U.query(a).then(function (r) { U.results[id] = r; C.store.set('usage-results.json', U.results); C.emit('usage'); return r; });
  };
  w.Usage = U;
})(window);
