/* insights.js — 模型四维百分位定位、单次任务费用换算、自选主力对比辅助、国内镜像测速。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core, N = w.Norm, esc = C.esc;
  var I = {};

  /** 常见日常任务预设（以 tokens 计），帮非专业用户一眼看懂单次真实花费。 */
  I.TASKS = [
    { id: 'chat', name: '闲聊1轮', inTok: 1500, outTok: 600, desc: '约 1 千字对话' },
    { id: 'code', name: '写代码1次', inTok: 18000, outTok: 2000, desc: '读几个文件并改代码' },
    { id: 'doc', name: '读长文1篇', inTok: 35000, outTok: 1500, desc: '约 2 万字文档总结' },
    { id: 'trans', name: '翻译1万字', inTok: 15000, outTok: 15000, desc: '中英互译 1 万字' }
  ];

  function blendOf(m) {
    return N.blended(m.priceInputPer1M, m.priceOutputPer1M, C.settings.blend);
  }

  /** 计算单个数值在数组里的百分位（0~100），lowBetter=true 表示数值越小排名越高。 */
  function percentile(arr, val, lowBetter) {
    if (val == null || !arr.length) return null;
    var beat = 0;
    for (var i = 0; i < arr.length; i++) {
      if (lowBetter ? arr[i] >= val : arr[i] <= val) beat++;
    }
    return Math.max(1, Math.min(99, Math.round(100 * beat / arr.length)));
  }

  /**
   * 计算某个 AA 模型在全榜中的四维百分位（智能 / 速度 / 省钱 / 响应）。
   * 返回 [{label, pct, text, tone}]，供详情页渲染直观的能力条。
   */
  I.radarStats = function (m, aaData) {
    if (!m || !aaData || !aaData.models) return [];
    // 同系列只取最高档作为基准池，避免同一模型多个档位拉偏分布
    var best = {};
    aaData.models.forEach(function (x) {
      var k = x.releaseName || x.name;
      if (!best[k] || (x.intelligenceIndex || 0) > (best[k].intelligenceIndex || 0)) best[k] = x;
    });
    var pool = Object.keys(best).map(function (k) { return best[k]; });
    var iiArr = [], spArr = [], prArr = [], ttArr = [];
    pool.forEach(function (x) {
      if (x.intelligenceIndex != null) iiArr.push(x.intelligenceIndex);
      if (x.outputTokensPerSecond > 0) spArr.push(x.outputTokensPerSecond);
      var bp = blendOf(x); if (bp > 0) prArr.push(bp);
      if (x.timeToFirstTokenSeconds > 0) ttArr.push(x.timeToFirstTokenSeconds);
    });
    var out = [];
    var pII = percentile(iiArr, m.intelligenceIndex, false);
    if (pII != null) out.push({ label: '智能水平', pct: pII, text: '超过 ' + pII + '% 模型', tone: pII >= 80 ? 'zhu' : 'dian' });
    var pSp = percentile(spArr, m.outputTokensPerSecond, false);
    if (pSp != null) out.push({ label: '吐字速度', pct: pSp, text: Math.round(m.outputTokensPerSecond) + ' 字/秒 · 前 ' + (100 - pSp + 1) + '%', tone: pSp >= 70 ? 'good' : 'dian' });
    var bp = blendOf(m);
    var pPr = bp > 0 ? percentile(prArr, bp, true) : (bp === 0 ? 99 : null);
    if (pPr != null) out.push({ label: '价格亲民', pct: pPr, text: bp === 0 ? '免费使用' : (pPr >= 65 ? '偏便宜 · 省钱前 ' + (100 - pPr + 1) + '%' : '偏贵 · 高于 ' + (100 - pPr) + '% 模型'), tone: pPr >= 65 ? 'good' : pPr <= 25 ? 'bad' : 'dian' });
    var pTt = percentile(ttArr, m.timeToFirstTokenSeconds, true);
    if (pTt != null) out.push({ label: '首字响应', pct: pTt, text: (+m.timeToFirstTokenSeconds).toFixed(1) + ' 秒 · 快过 ' + pTt + '%', tone: pTt >= 70 ? 'good' : pTt <= 25 ? 'bad' : 'dian' });
    return out;
  };

  I.radarHtml = function (m, aaData) {
    var stats = I.radarStats(m, aaData);
    if (!stats.length) return '';
    return '<div class="radar-box">' + stats.map(function (s) {
      return '<div class="radar-row"><div class="radar-top"><span>' + esc(s.label) + '</span><span>' + esc(s.text) + '</span></div>' +
        '<div class="radar-track"><i class="t-' + s.tone + '" style="width:' + s.pct + '%"></i></div></div>';
    }).join('') + '</div>';
  };

  /** 生成「干这活花多少钱」单次任务费用换算块 HTML。 */
  I.costSimHtml = function (pIn, pOut, taskId) {
    if (typeof pIn !== 'number' || typeof pOut !== 'number') return '';
    var cur = I.TASKS.filter(function (t) { return t.id === taskId; })[0] || I.TASKS[1];
    var usd = (cur.inTok * pIn + cur.outTok * pOut) / 1e6;
    var cny = C.settings.currency === 'CNY', rate = cny ? C.fxRate() : 1, sym = cny ? '¥' : '$';
    var cost = usd * rate;
    var costStr = cost === 0 ? '免费' : (cost < 0.0001 ? '< ' + sym + '0.0001' : sym + cost.toFixed(cost >= 1 ? 2 : cost >= 0.01 ? 3 : 4).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));
    var unitAmt = cny ? 10 : 1; // 10元或1美元能跑多少次
    var runs = cost > 0 ? Math.floor(unitAmt / cost) : null;
    var runTip = cost === 0 ? '不花钱，随用随测' : (runs >= 10000 ? (sym + unitAmt + ' 可做 1 万次以上') : runs >= 1 ? (sym + unitAmt + ' 约可做 ' + runs + ' 次') : ('单次超过 ' + sym + unitAmt));
    return '<div class="sim-box" id="simBox">' +
      '<div class="sim-hd"><b>干这活大概花多少钱</b><span>' + esc(cur.desc) + '</span></div>' +
      '<div class="sim-tabs">' + I.TASKS.map(function (t) {
        return '<button class="' + (t.id === cur.id ? 'on' : '') + '" data-sim="' + t.id + '">' + esc(t.name) + '</button>';
      }).join('') + '</div>' +
      '<div class="sim-res"><b class="sim-val">' + esc(costStr) + '<small>/次</small></b><span class="sim-tip">' + esc(runTip) + '</span></div></div>';
  };

  I.bindCostSim = function (rootEl, pIn, pOut) {
    if (!rootEl || typeof pIn !== 'number' || typeof pOut !== 'number') return;
    var box = rootEl.querySelector('#simBox');
    if (!box) return;
    box.onclick = function (e) {
      var b = e.target.closest('[data-sim]'); if (!b) return;
      var nextId = b.getAttribute('data-sim');
      var tmp = document.createElement('div');
      tmp.innerHTML = I.costSimHtml(pIn, pOut, nextId);
      box.parentNode.replaceChild(tmp.firstChild, box);
      I.bindCostSim(rootEl, pIn, pOut);
    };
  };

  /** 测试国内下载镜像连通与延迟（单条完成立即通过 onEach 回调，不等最慢超时节点）。 */
  I.testMirrors = function (onEach) {
    var list = (w.Update && w.Update.MIRRORS) || [];
    var probeTarget = 'https://raw.githubusercontent.com/' + (w.Update ? w.Update.REPO : 'xuyuan985-star/model-hub') + '/main/VERSION';
    var results = [];
    return Promise.all(list.map(function (m) {
      var u = m.prefix + probeTarget + '?t=' + Date.now();
      var t0 = Date.now();
      return C.net(u, { timeoutMs: 6500, headers: { 'User-Agent': 'ModelHub-Android' } }).then(function (r) {
        var ms = r.ms || (Date.now() - t0);
        var ok = r.status >= 200 && r.status < 300 && /^\d+\.\d+/.test(String(r.body || '').trim());
        var item = { id: m.id, name: m.name, ok: ok, ms: ms, status: r.status || 0, error: ok ? null : (r.error || ('状态 ' + r.status)) };
        results.push(item);
        if (onEach) onEach(results.slice());
        return item;
      });
    }));
  };

  w.Insights = I;
})(window);
