/* share.js — 将模型横向对比表渲染成「张榜」风格分享长图并保存到相册。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core, N = w.Norm;
  var S = {};

  function fmtNum(v, d) { return v == null ? '—' : (+v).toFixed(d == null ? 1 : d); }
  function fmtCtx(n) { return !n ? '—' : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.round(n / 1000) + 'K'; }
  function blendPrice(m) { return N.blended(m.priceInputPer1M, m.priceOutputPer1M, C.settings.blend); }

  var ROWS = [
    { n: '综合智能', f: 'intelligenceIndex', d: 1, hi: true },
    { n: '知识可靠', f: 'omniscienceIndex', d: 1, hi: true },
    { n: '输入 / 百万字', f: 'priceInputPer1M', money: true, hi: false },
    { n: '输出 / 百万字', f: 'priceOutputPer1M', money: true, hi: false },
    { n: '混合价', blend: true, money: true, hi: false },
    { n: '输出速度', f: 'outputTokensPerSecond', d: 0, u: ' 字/秒', hi: true },
    { n: '首字延迟', f: 'timeToFirstTokenSeconds', d: 1, u: ' 秒', hi: false },
    { n: '上下文窗口', f: 'contextWindowTokens', ctx: true, hi: true }
  ];

  function clipText(g, text, maxW) {
    var s = String(text || '');
    if (g.measureText(s).width <= maxW) return s;
    while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  /** 生成分享 PNG 的 dataURL 并保存到相册，返回 boolean。 */
  S.saveCmpCard = function (ms) {
    if (!ms || !ms.length) return false;
    var active = ROWS.filter(function (r) {
      return ms.some(function (m) { return typeof (r.blend ? blendPrice(m) : m[r.f]) === 'number'; });
    });
    var cols = ms.length;
    var W = 900, pad = 44, labelW = 190, colW = Math.floor((W - pad * 2 - labelW) / cols);
    var headH = 128, thH = 74, rowH = 58, footH = 66;
    var H = headH + thH + active.length * rowH + footH;

    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    if (!g) return false;

    // 纸底
    g.fillStyle = '#F4F5F7'; g.fillRect(0, 0, W, H);
    // 顶部朱红小方章 + 标题
    g.fillStyle = '#C5282F';
    g.fillRect(pad, 36, 40, 40);
    g.fillStyle = '#FFFFFF'; g.font = 'bold 24px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('榜', pad + 20, 57);

    g.fillStyle = '#191F2B'; g.font = 'bold 30px serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('模型行情 · 横向对比', pad + 54, 54);
    g.fillStyle = '#636C7C'; g.font = '18px sans-serif';
    var dt = new Date();
    var dstr = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2);
    g.fillText('数据来源：Artificial Analysis · ' + dstr + ' · 混合价 ' + C.settings.blend + ':1', pad, 102);

    // 表格卡片外框
    var ty = headH, tableH = thH + active.length * rowH;
    g.fillStyle = '#FFFFFF'; g.fillRect(pad, ty, W - pad * 2, tableH);
    g.strokeStyle = '#DDE1E8'; g.lineWidth = 2; g.strokeRect(pad, ty, W - pad * 2, tableH);

    // 表头背景
    g.fillStyle = '#F8F9FB'; g.fillRect(pad + 1, ty + 1, W - pad * 2 - 2, thH - 1);
    g.fillStyle = '#636C7C'; g.font = 'bold 19px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('指标', pad + 18, ty + thH / 2);

    ms.forEach(function (m, i) {
      var x = pad + labelW + i * colW + colW - 16;
      g.fillStyle = '#191F2B'; g.font = 'bold 20px sans-serif'; g.textAlign = 'right';
      g.fillText(clipText(g, m.releaseName || m.shortName || m.name, colW - 22), x, ty + 28);
      g.fillStyle = '#636C7C'; g.font = '15px sans-serif';
      g.fillText(clipText(g, m.creatorName || '', colW - 22), x, ty + 54);
    });

    // 数据行
    active.forEach(function (r, ri) {
      var y = ty + thH + ri * rowH;
      g.strokeStyle = '#ECEEF2'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke();

      g.fillStyle = '#636C7C'; g.font = '19px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(r.n, pad + 18, y + rowH / 2);

      var vals = ms.map(function (m) { return r.blend ? blendPrice(m) : m[r.f]; });
      var nums = vals.filter(function (v) { return typeof v === 'number'; });
      var differ = nums.length > 1 && nums.some(function (v) { return v !== nums[0]; });
      var best = differ ? (r.hi ? Math.max.apply(null, nums) : Math.min.apply(null, nums)) : null;

      vals.forEach(function (v, ci) {
        var s = typeof v !== 'number' ? '—'
          : r.money ? C.money(v, v >= 100 ? 0 : undefined)
          : r.ctx ? fmtCtx(v)
          : fmtNum(v, r.d) + (r.u || '');
        var isBest = best != null && v === best;
        g.fillStyle = isBest ? '#137A59' : '#191F2B';
        g.font = (isBest ? 'bold ' : '') + '21px sans-serif';
        g.textAlign = 'right';
        g.fillText(s, pad + labelW + ci * colW + colW - 16, y + rowH / 2);
      });
    });

    // 页脚
    g.fillStyle = '#949CA9'; g.font = '16px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText('绿字为该项更优值 · 由「模型行情」生成', pad, H - footH / 2);

    var dataUrl = cv.toDataURL('image/png');
    var fname = '模型对比_' + dstr + '_' + String(Date.now()).slice(-4) + '.png';
    return !!(w.Native && w.Native.saveBase64Image && w.Native.saveBase64Image(dataUrl, fname));
  };

  w.Share = S;
})(window);
