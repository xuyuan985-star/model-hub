/* calc.js — 同模型跨平台比价 & 预算选型/算账向导（纯本地计算，零网络开销）。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core, N = w.Norm;
  var K = {};

  /**
   * 跨平台同模型比价：把 models.dev 里 300+ 平台的同款模型聚合到一起。
   * 返回按上架平台数降序排列的模型组：[{ key, name, minIn, maxIn, bestPid, bestName, offers:[{pid,pname,i,o,cr,cw,ctx,id}] }]
   */
  K.buildCompareIndex = function (pricesData, pinned) {
    if (!pricesData || !pricesData.providers) return [];
    var groups = {}, pinSet = {};
    (pinned || []).forEach(function (id) { pinSet[id] = 1; });
    Object.keys(pricesData.providers).forEach(function (pid) {
      var p = pricesData.providers[pid];
      (p.models || []).forEach(function (m) {
        if (typeof m.i !== 'number') return;
        // 忽略明显异常的 0 免费和按单条计费极端值之外，保留免费作为单独标记
        var k = N.modelKey(m.id) || N.modelKey(m.n);
        if (!k || k.length < 3) return;
        var g = groups[k];
        if (!g) { g = groups[k] = { key: k, name: m.n || m.id, offers: [], seenPid: {} }; }
        if (g.seenPid[pid]) return; // 同一平台只取第一条
        g.seenPid[pid] = 1;
        if (m.n && m.n.length < g.name.length && m.n.length >= 4) g.name = m.n;
        g.offers.push({
          pid: pid, pname: p.name || pid, pin: !!pinSet[pid],
          id: m.id, i: m.i, o: m.o, cr: m.cr, cw: m.cw, ctx: m.ctx, rd: m.rd, ow: m.ow
        });
      });
    });
    var list = [];
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.offers.length < 2) return; // 至少 2 家平台有卖才值得比价
      var paid = g.offers.filter(function (x) { return x.i > 0 || (x.o && x.o > 0); });
      g.offers.sort(function (a, b) {
        var ba = N.blended(a.i, a.o || 0, C.settings.blend) || 0;
        var bb = N.blended(b.i, b.o || 0, C.settings.blend) || 0;
        return ba - bb || (b.pin - a.pin);
      });
      var minPaid = paid.length ? paid.reduce(function (a, b) { return a.i < b.i ? a : b; }) : g.offers[0];
      var maxPaid = paid.length ? paid.reduce(function (a, b) { return a.i > b.i ? a : b; }) : g.offers[0];
      g.minIn = minPaid.i; g.maxIn = maxPaid.i;
      g.best = minPaid;
      g.pinCount = g.offers.filter(function (x) { return x.pin; }).length;
      g.savePct = (maxPaid.i > 0 && minPaid.i < maxPaid.i) ? Math.round((1 - minPaid.i / maxPaid.i) * 100) : 0;
      delete g.seenPid;
      list.push(g);
    });
    list.sort(function (a, b) { return (b.pinCount - a.pinCount) || (b.offers.length - a.offers.length); });
    return list;
  };

  /**
   * 场景预设：不同用途下每月典型输入/输出百万字（M tokens）和缓存命中率。
   * 也可由用户自定义月预算、用量和缓存命中率。
   */
  K.SCENES = [
    { id: 'code', name: '写代码 / Agent', inM: 30, outM: 3, cache: 0.65, desc: '上下文长、重复读代码多，缓存省钱明显' },
    { id: 'chat', name: '日常问答聊天', inM: 5, outM: 3, cache: 0.1, desc: '单轮较短，输入和输出比例接近' },
    { id: 'doc', name: '长文总结 / 研报', inM: 25, outM: 1.5, cache: 0.25, desc: '单次喂大量文档，输出少' },
    { id: 'batch', name: '批量翻译 / 清洗', inM: 60, outM: 20, cache: 0.05, desc: '海量吞吐，追求极致低价' }
  ];

  /** 计算某个 AA 模型在指定用量与缓存命中率下的月花费（美元）。 */
  K.monthlyCost = function (m, inM, outM, cacheRate) {
    if (typeof m.priceInputPer1M !== 'number' || typeof m.priceOutputPer1M !== 'number') return null;
    var cr = typeof m.priceCacheReadPer1M === 'number' ? m.priceCacheReadPer1M : m.priceInputPer1M * 0.25;
    var effIn = inM * (1 - cacheRate) * m.priceInputPer1M + inM * cacheRate * cr;
    return effIn + outM * m.priceOutputPer1M;
  };

  /**
   * 按预算选模型：返回 { fit:[月费<=预算的按智能降序], stretch:[略超预算但更强的参考], planTips:[同预算可买的包月] }
   */
  K.recommend = function (aaData, opts) {
    if (!aaData || !aaData.models) return { fit: [], stretch: [], planTips: [] };
    var budgetUsd = Math.max(0.5, +opts.budgetUsd || 10);
    var inM = Math.max(0.1, +opts.inM || 20);
    var outM = Math.max(0.1, +opts.outM || 3);
    var cache = Math.max(0, Math.min(0.95, +opts.cache || 0));

    // 每个系列只留最高智能档
    var best = {};
    aaData.models.forEach(function (m) {
      if (m.intelligenceIndex == null) return;
      var k = m.releaseName || m.name;
      if (!best[k] || m.intelligenceIndex > best[k].intelligenceIndex) best[k] = m;
    });
    var fit = [], stretch = [];
    Object.keys(best).forEach(function (k) {
      var m = best[k];
      var cost = K.monthlyCost(m, inM, outM, cache);
      if (cost == null) return;
      var row = { m: m, cost: cost, noCache: K.monthlyCost(m, inM, outM, 0), ii: m.intelligenceIndex };
      if (cost <= budgetUsd) fit.push(row);
      else if (cost <= budgetUsd * 2) stretch.push(row);
    });
    fit.sort(function (a, b) { return b.ii - a.ii || a.cost - b.cost; });
    stretch.sort(function (a, b) { return b.ii - a.ii || a.cost - b.cost; });

    var planTips = (w.Plans ? w.Plans.all() : []).filter(function (p) {
      return p.usd <= budgetUsd && p.credit && p.credit >= budgetUsd * 1.5;
    }).sort(function (a, b) { return (b.credit / Math.max(1, b.usd)) - (a.credit / Math.max(1, a.usd)); }).slice(0, 4);

    return { fit: fit.slice(0, 8), stretch: stretch.slice(0, 3), planTips: planTips };
  };

  w.Calc = K;
})(window);
