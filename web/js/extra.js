/* extra.js — 性价比散点图、模型横向对比、更新说明渲染。ES2019，面向 Chrome 91 WebView。 */
(function (w) {
  'use strict';
  var C = w.Core, N = w.Norm, esc = C.esc;
  var X = {};

  function fmtNum(v, d) { return v == null ? '—' : (+v).toFixed(d == null ? 1 : d); }
  function fmtCtx(n) { return !n ? '—' : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.round(n / 1000) + 'K'; }
  function blendPrice(m) { return N.blended(m.priceInputPer1M, m.priceOutputPer1M, C.settings.blend); }

  /**
   * 绘制性价比散点图：横轴对数混合价，纵轴综合智能，朱红折线连接同价位最强前沿。
   * 规避 Chrome 91 问题：不把带引号的 CSS 变量拼进 ctx.font；容器宽度为 0 时下一帧补画。
   */
  X.drawScatter = function (cv, pts, fr) {
    if (!cv || !pts || !pts.length) return;
    var W = cv.clientWidth || (cv.parentElement && cv.parentElement.clientWidth - 20) || 0;
    if (W < 60) {
      if (!cv.__retry) {
        cv.__retry = 1;
        setTimeout(function () { cv.__retry = 0; X.drawScatter(cv, pts, fr); }, 60);
      }
      return;
    }
    var H = 268, dpr = Math.min(w.devicePixelRatio || 1, 3);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.height = H + 'px';
    var g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cs = getComputedStyle(document.documentElement);
    function col(k, fb) { var v = cs.getPropertyValue(k).trim(); return v || fb; }
    var ink = col('--ink', '#191F2B'), ink2 = col('--ink2', '#636C7C'), ink3 = col('--ink3', '#949CA9');
    var line = col('--line', '#E3E6EC'), dian = col('--dian', '#2B5B8A'), zhu = col('--zhu', '#C5282F'), bg = col('--surface', '#FFFFFF');

    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    var cny = C.settings.currency === 'CNY', rate = cny ? C.fxRate() : 1, sym = cny ? '¥' : '$';
    function priceOf(m) { var p = blendPrice(m); return p > 0 ? p * rate : 0; }

    var xs = pts.map(function (m) { return Math.log10(priceOf(m)); });
    var ys = pts.map(function (m) { return m.intelligenceIndex; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var x0 = Math.floor(minX * 5) / 5 - 0.08, x1 = Math.ceil(maxX * 5) / 5 + 0.08;
    if (x1 - x0 < 0.6) { x0 -= 0.3; x1 += 0.3; }
    var y0 = Math.max(0, Math.floor(minY / 10) * 10);
    var y1 = Math.ceil((maxY + 3) / 10) * 10;
    if (y1 - y0 < 20) y1 = y0 + 20;

    var L = 32, R = 14, T = 16, B = 32;
    function px(v) { return L + (Math.log10(v) - x0) / (x1 - x0) * (W - L - R); }
    function py(v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); }

    // 横向网格与纵轴刻度
    var yStep = (y1 - y0) > 60 ? 20 : 10;
    g.lineWidth = 1;
    g.font = '10px sans-serif';
    for (var y = y0; y <= y1; y += yStep) {
      var yy = Math.round(py(y)) + 0.5;
      g.strokeStyle = line;
      g.beginPath(); g.moveTo(L, yy); g.lineTo(W - R, yy); g.stroke();
      g.fillStyle = ink3; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.fillText(String(y), L - 6, yy);
    }

    // 纵向网格与横轴对数刻度
    g.textBaseline = 'alphabetic';
    var eStart = Math.ceil(x0), eEnd = Math.floor(x1);
    for (var e = eStart; e <= eEnd; e++) {
      var val = Math.pow(10, e);
      var xx = Math.round(px(val)) + 0.5;
      g.strokeStyle = line;
      g.beginPath(); g.moveTo(xx, T); g.lineTo(xx, H - B); g.stroke();
      g.fillStyle = ink3; g.textAlign = 'center';
      var lbl = val >= 1 ? sym + val : sym + val.toFixed(Math.max(1, -e));
      g.fillText(lbl, xx, H - B + 14);
    }

    // 轴说明
    g.fillStyle = ink3; g.font = '10px sans-serif';
    g.textAlign = 'right'; g.fillText('混合价 / 百万字（对数）', W - R, H - 5);
    g.textAlign = 'left'; g.fillText('智能指数', L, H - 5);

    // 前沿包络线及淡红底影
    if (fr.length > 1) {
      g.beginPath();
      g.moveTo(px(fr[0].x * rate), py(y0));
      fr.forEach(function (p) { g.lineTo(px(p.x * rate), py(p.y)); });
      g.lineTo(px(fr[fr.length - 1].x * rate), py(y0));
      g.closePath();
      g.fillStyle = zhu; g.globalAlpha = 0.06; g.fill(); g.globalAlpha = 1;

      g.strokeStyle = zhu; g.lineWidth = 1.7;
      g.beginPath();
      fr.forEach(function (p, i) {
        var cx = px(p.x * rate), cy = py(p.y);
        if (i) g.lineTo(cx, cy); else g.moveTo(cx, cy);
      });
      g.stroke();
    }

    // 普通模型散点
    g.fillStyle = dian; g.globalAlpha = 0.42;
    pts.forEach(function (m) {
      g.beginPath(); g.arc(px(priceOf(m)), py(m.intelligenceIndex), 2.8, 0, 6.29); g.fill();
    });
    g.globalAlpha = 1;

    // 前沿高亮圆点
    fr.forEach(function (p) {
      var cx = px(p.x * rate), cy = py(p.y);
      g.beginPath(); g.arc(cx, cy, 4.8, 0, 6.29); g.fillStyle = bg; g.fill();
      g.beginPath(); g.arc(cx, cy, 3.2, 0, 6.29); g.fillStyle = zhu; g.fill();
    });

    // 前沿模型文字标签（贪心避让，高分优先）
    var boxes = [];
    function overlaps(b) {
      if (b.x < L || b.x + b.w > W - R + 2 || b.y < 2 || b.y + b.h > H - B - 2) return true;
      for (var i = 0; i < boxes.length; i++) {
        var o = boxes[i];
        if (b.x < o.x + o.w + 3 && o.x < b.x + b.w + 3 && b.y < o.y + o.h + 2 && o.y < b.y + b.h + 2) return true;
      }
      return false;
    }
    g.font = 'bold 10px sans-serif';
    fr.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (p) {
      var cx = px(p.x * rate), cy = py(p.y);
      var t = String(p.m.releaseName || p.m.shortName || p.m.name).replace(/\(.*?\)/g, '').trim();
      if (t.length > 18) t = t.slice(0, 17) + '…';
      var tw = g.measureText(t).width, th = 12, gap = 7;
      var cands = [
        { x: cx + gap, y: cy - th / 2 },
        { x: cx - gap - tw, y: cy - th / 2 },
        { x: cx - tw / 2, y: cy - gap - th },
        { x: cx - tw / 2, y: cy + gap },
        { x: cx + gap, y: cy - th - 3 },
        { x: cx - gap - tw, y: cy + 4 }
      ];
      for (var i = 0; i < cands.length; i++) {
        var b = { x: cands[i].x, y: cands[i].y, w: tw, h: th };
        if (overlaps(b)) continue;
        boxes.push(b);
        g.fillStyle = bg; g.fillRect(b.x - 2, b.y - 1, b.w + 4, b.h + 2);
        g.fillStyle = ink; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillText(t, b.x, b.y + 1);
        break;
      }
    });

    // 保存命中点供点击查详情
    var dots = [];
    fr.forEach(function (p) { dots.push({ x: px(p.x * rate), y: py(p.y), m: p.m, z: 1 }); });
    pts.forEach(function (m) { dots.push({ x: px(priceOf(m)), y: py(m.intelligenceIndex), m: m, z: 0 }); });
    cv.__dots = dots;
  };

  // ---------- 更新说明简易 Markdown 排版 ----------
  X.notesHtml = function (md) {
    var out = [], inList = false;
    function inline(s) {
      return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    String(md || '').split(/\r?\n/).forEach(function (line) {
      var t = line.trim();
      if (!t) { if (inList) { out.push('</ul>'); inList = false; } return; }
      if (/^[-*]\s+/.test(t)) {
        if (!inList) { out.push('<ul class="relnotes">'); inList = true; }
        out.push('<li>' + inline(t.replace(/^[-*]\s+/, '')) + '</li>');
        return;
      }
      if (inList) { out.push('</ul>'); inList = false; }
      if (/^#{1,6}\s/.test(t)) { out.push('<p class="rn-h">' + inline(t.replace(/^#{1,6}\s+/, '')) + '</p>'); return; }
      if (/^\*\*[^*]+\*\*:?$/.test(t)) { out.push('<p class="rn-h">' + inline(t.replace(/[:：]$/, '')) + '</p>'); return; }
      out.push('<p class="rn-p">' + inline(t) + '</p>');
    });
    if (inList) out.push('</ul>');
    return out.join('');
  };

  // ---------- 模型对比表 HTML ----------
  var CMP_ROWS = [
    { n: '综合智能', f: 'intelligenceIndex', d: 1, hi: true },
    { n: '知识可靠', f: 'omniscienceIndex', d: 1, hi: true },
    { n: '输入价 / 百万字', f: 'priceInputPer1M', money: true, hi: false },
    { n: '输出价 / 百万字', f: 'priceOutputPer1M', money: true, hi: false },
    { n: '混合价', blend: true, money: true, hi: false },
    { n: '输出速度', f: 'outputTokensPerSecond', d: 0, u: ' 字/秒', hi: true },
    { n: '首字延迟', f: 'timeToFirstTokenSeconds', d: 1, u: ' 秒', hi: false },
    { n: '出答案延迟', f: 'timeToFirstAnswerTokenSeconds', d: 1, u: ' 秒', hi: false },
    { n: '上下文窗口', f: 'contextWindowTokens', ctx: true, hi: true },
    { n: '测评总花费', f: 'indexCostTotalUsd', money: true, hi: false }
  ];
  X.cmpTableHtml = function (ms) {
    var head = '<tr><th>指标</th>' + ms.map(function (m) {
      return '<th>' + esc(m.releaseName || m.shortName || m.name) +
        '<span class="rm" data-rm="' + esc(m.releaseName || m.name) + '">×</span></th>';
    }).join('') + '</tr>';
    var seen = {};
    var body = CMP_ROWS.filter(function (r) {
      var vs = ms.map(function (m) { return r.blend ? blendPrice(m) : m[r.f]; });
      if (!vs.some(function (v) { return typeof v === 'number'; })) return false;
      var sig = vs.join('|');
      if (seen[sig]) return false;
      seen[sig] = 1;
      return true;
    }).map(function (r) {
      var vals = ms.map(function (m) { return r.blend ? blendPrice(m) : m[r.f]; });
      var nums = vals.filter(function (v) { return typeof v === 'number'; });
      var differ = nums.length > 1 && nums.some(function (v) { return v !== nums[0]; });
      var best = differ ? (r.hi ? Math.max.apply(null, nums) : Math.min.apply(null, nums)) : null;
      return '<tr><td>' + esc(r.n) + '</td>' + vals.map(function (v) {
        var s = typeof v !== 'number' ? '—' : r.money ? C.money(v, v >= 100 ? 0 : undefined) : r.ctx ? fmtCtx(v) : fmtNum(v, r.d) + (r.u || '');
        return '<td' + (best != null && v === best ? ' class="best"' : '') + '>' + s + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="cmpwrap"><table class="cmp"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  };

  w.Extra = X;
})(window);
