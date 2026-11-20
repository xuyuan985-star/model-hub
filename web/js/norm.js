/* norm.js — 纯函数：价格表瘦身、模型名匹配、计算。不依赖浏览器/Node，供界面和构建脚本共用。ES2019。 */
(function (root) {
  'use strict';

  /** models.dev 的 api.json（约 6.7MB）瘦身为手机够用的紧凑结构。 */
  function trimModelsDev(md) {
    var providers = {};
    Object.keys(md).forEach(function (pid) {
      var p = md[pid];
      var list = [];
      Object.keys(p.models || {}).forEach(function (mid) {
        var m = p.models[mid];
        var c = m.cost;
        if (!c || typeof c.input !== 'number') return;
        var lim = m.limit || {};
        var mod = m.modalities || {};
        var row = {
          id: m.id || mid,
          n: m.name || mid,
          i: c.input,
          o: typeof c.output === 'number' ? c.output : null,
          cr: typeof c.cache_read === 'number' ? c.cache_read : null,
          cw: typeof c.cache_write === 'number' ? c.cache_write : null,
          ctx: lim.context || null,
          mo: lim.output || null,
          rd: m.release_date || null,
          rs: m.reasoning ? 1 : 0,
          tc: m.tool_call ? 1 : 0,
          ow: m.open_weights ? 1 : 0,
          im: (mod.input || []).indexOf('image') >= 0 ? 1 : 0,
        };
        // 超长上下文分档价（如 >200K 更贵），只保留最高一档的输入/输出
        if (c.tiers && c.tiers.length) {
          var t = c.tiers[c.tiers.length - 1];
          row.hi = { i: t.input, o: t.output, at: t.tier && t.tier.size };
        } else if (c.context_over_200k) {
          row.hi = { i: c.context_over_200k.input, o: c.context_over_200k.output, at: 200000 };
        }
        list.push(row);
      });
      if (list.length) providers[pid] = { id: pid, name: p.name || pid, doc: p.doc || '', api: p.api || '', models: list };
    });
    return { providers: providers };
  }

  /** 把模型名/ID 规整成可比较的键：小写、去日期后缀、去厂商前缀、点横杠统一。 */
  function modelKey(s) {
    if (!s) return '';
    s = String(s).toLowerCase();
    s = s.replace(/^.*\//, ''); // anthropic/claude-x -> claude-x
    s = s.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, ' ');
    s = s.replace(/[-_ ]?(20\d{2})[-]?(\d{2})[-]?(\d{2})$/, ''); // -20251001
    s = s.replace(/:(free|beta|thinking|exacto|nitro)$/, '');
    s = s.replace(/[^a-z0-9]+/g, '');
    return s;
  }

  /** AA 的一个模型（含推理档位）是否对应价格表里的某个模型。 */
  function aaKeys(m) {
    var ks = {};
    [m.slug, m.releaseName, m.shortName && m.shortName.replace(/\(.*?\)/g, '')].forEach(function (x) {
      var k = modelKey(x);
      if (k) ks[k] = 1;
    });
    return Object.keys(ks);
  }

  /** 混合价：输入:输出 = ratio:1 */
  function blended(i, o, ratio) {
    if (typeof i !== 'number' || typeof o !== 'number') return null;
    ratio = ratio || 3;
    return (i * ratio + o) / (ratio + 1);
  }

  /** 前沿：价格从低到高，只保留"比所有更便宜的都更聪明"的点。points: [{x:price,y:score}] */
  function frontier(points) {
    var s = points.slice().sort(function (a, b) { return a.x - b.x || b.y - a.y; });
    var best = -Infinity, out = [];
    s.forEach(function (p) { if (p.y > best) { out.push(p); best = p.y; } });
    return out;
  }

  var api = { trimModelsDev: trimModelsDev, modelKey: modelKey, aaKeys: aaKeys, blended: blended, frontier: frontier };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Norm = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
