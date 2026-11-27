/* tokencalc.js — Token 与费用计算器：本地估算 token 数，按当前价格表算单次成本。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core, esc = C.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var T = {};

  /**
   * 本地 token 估算。没有内置分词表（体积过大），按字符类型加权：
   * 中日韩文字约 1 字 1 token 偏高估 15%，英文约 4 字符 1 token，数字/符号单独计。
   * 这是工程近似值，界面上必须标明「估算」，不能声称精确。
   */
  T.estimate = function (text) {
    if (!text) return { tokens: 0, cjk: 0, latin: 0 };
    var cjk = (text.match(/[㐀-鿿぀-ヿ가-힯]/g) || []).length;
    var rest = text.replace(/[㐀-鿿぀-ヿ가-힯]/g, '');
    var words = (rest.match(/[A-Za-z]+/g) || []).reduce(function (n, s) { return n + Math.ceil(s.length / 4); }, 0);
    var digits = (rest.match(/\d+/g) || []).reduce(function (n, s) { return n + Math.ceil(s.length / 2); }, 0);
    var punct = (rest.match(/[^\sA-Za-z0-9]/g) || []).length;
    var tokens = Math.round(cjk * 1.15 + words + digits + punct * 0.5);
    return { tokens: tokens, cjk: cjk, latin: words + digits };
  };

  T.SAMPLES = [
    ['short', '一句话提问', '帮我用 Python 写一个读取 Excel 并画柱状图的脚本，要求处理空值和日期列。'],
    ['code', '读一段代码', 'function debounce(fn, ms) {\n  var t = null;\n  return function () {\n    var self = this, args = arguments;\n    clearTimeout(t);\n    t = setTimeout(function () { fn.apply(self, args); }, ms);\n  };\n}\n\n// 用法：输入框防抖\nvar onInput = debounce(function (e) { console.log(e.target.value); }, 300);'],
    ['doc', '一篇长文', '这是一段用于测试的长文本。'.repeat(60)],
    ['article', '一篇中文文章（约 1000 字）', ('人工智能正在改变我们处理信息的方式。大模型的上下文窗口越来越长，价格却在持续下降。' +
      '对于普通用户来说，最关心的问题往往是：同样的任务，用哪个模型最省钱，效果又够用。').repeat(12)]
  ];

  T.registerView = function (A) {
    var page = A.page, st = A.st, toast = A.toast, openSheet = A.openSheet, closeSheet = A.closeSheet;
    var render = A.render, debounce = A.debounce, pickDlg = A.pickDlg, setCalcMode = A.setCalcMode;

    /**
     * 只在用户自己加进「自选」的模型里挑。自选存的是 AA 榜单的模型名，
     * 这里到价格表里按名称匹配出对应报价；匹配不到的不列出。
     */
    function modelOptions() {
      var favs = (C.settings && C.settings.favorites) || [];
      if (!favs.length) return [];
      var d = C.sources.prices && C.sources.prices.data;
      if (!d) return [];
      var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
      var want = {};
      favs.forEach(function (f) { want[norm(f)] = f; });
      var out = [], seenFav = {};
      Object.keys(d.providers).forEach(function (pid) {
        var p = d.providers[pid];
        (p.models || []).forEach(function (m) {
          if (m.i == null && m.o == null) return;
          var k = norm(m.n) || norm(m.id);
          var hit = want[k];
          // 名称不完全一致时，允许「自选名包含在报价名里」的宽松匹配
          if (!hit) {
            Object.keys(want).forEach(function (w) {
              if (!hit && w.length >= 4 && (k.indexOf(w) >= 0 || w.indexOf(k) >= 0)) hit = want[w];
            });
          }
          if (!hit || seenFav[hit]) return;
          seenFav[hit] = 1;
          out.push({ id: 'fav|' + hit, name: hit, prov: p.name, i: m.i || 0, o: m.o || 0 });
        });
      });
      return out;
    }

    function view(topSeg) {
      if (!st.tc) st.tc = { text: '', inM: 1, outM: 0.3, reqs: 1000, modelId: '' };
      var tc = st.tc;
      var est = T.estimate(tc.text);
      var opts = modelOptions();
      var hasFav = opts.length > 0;
      if (hasFav && !opts.some(function (o) { return o.id === tc.modelId; })) tc.modelId = opts[0].id;
      var pick = opts.filter(function (o) { return o.id === tc.modelId; })[0] || null;

      // 单次请求成本 = 输入 token × 输入价 + 输出 token × 输出价
      var inTok = est.tokens, outTok = Math.round(est.tokens * (tc.outM / Math.max(0.01, tc.inM)));
      var oneCost = pick ? (inTok / 1e6 * pick.i + outTok / 1e6 * pick.o) : 0;
      var monthCost = oneCost * (tc.reqs || 0);

      var html = (topSeg || '') +
        '<div class="chips">' + [['plan', '按用量算'], ['token', '按文本算']].map(function (x) {
          return '<button class="chip' + (x[0] === 'token' ? ' on' : '') + '" data-cm="' + x[0] + '">' + x[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="card">' +
        '<p class="mut" style="margin:0 0 8px;font-size:12.5px">粘贴要处理的文本，估算 token 数与成本。只在本机计算，不上传。</p>' +
        '<div class="chips" style="padding:0 0 8px">' + T.SAMPLES.map(function (s) {
          return '<button class="chip" data-tc="' + s[0] + '">' + esc(s[1]) + '</button>';
        }).join('') + '</div>' +
        '<textarea class="tc-box" id="tcText" placeholder="把要发给模型的文本粘进来…（不会上传，只在本机计算）">' + esc(tc.text) + '</textarea>' +
        '<div class="kv"><span>估算 token 数</span><span class="big" style="font-size:20px">' + (inTok ? inTok.toLocaleString() : '—') + '</span></div>' +
        '<div class="kv"><span>其中中文字符</span><span>' + est.cjk + ' 字 · 英文数字约 ' + est.latin + ' token</span></div>' +
        '</div>';

      html += '<div class="sec" style="padding-left:16px">按哪个模型计价</div><div class="card">' +
        (pick
          ? '<div class="kv"><span>模型（来自自选）</span><button class="sel" id="tcPick">' + esc(pick.name) + '</button></div>' +
            '<div class="kv"><span>输入 / 输出价</span><span>' + C.money(pick.i) + ' / ' + C.money(pick.o) + ' 每百万字</span></div>'
          : (hasFav === false && !((C.settings && C.settings.favorites) || []).length
              ? '<p class="mut" style="margin:0 0 8px">还没有自选模型。先在榜单里长按或点开模型「加入自选」，这里就能按自选模型计价。</p>'
              : '<p class="mut" style="margin:0 0 8px">自选的模型暂时在价格表里没找到对应报价，换一个试试。</p>')) +
        '<div class="kv"><span>输入 : 输出 比例</span><span><input id="tcIn" type="number" step="0.1" class="inline-num sm" value="' + tc.inM + '"> : <input id="tcOut" type="number" step="0.1" class="inline-num sm" value="' + tc.outM + '"></span></div>' +
        '<div class="kv"><span>预计调用次数（次/月）</span><input id="tcReqs" type="number" step="100" class="inline-num" value="' + tc.reqs + '"></div>' +
        '</div>';

      html += '<div class="card"><div class="sec" style="padding:0 0 6px">费用估算</div>' +
        '<div class="kv"><span>单次调用</span><span class="big" style="font-size:22px;color:var(--zhu)">' + (oneCost ? C.money(oneCost) : '—') + '</span></div>' +
        '<div class="kv"><span>每月 ' + (tc.reqs || 0).toLocaleString() + ' 次</span><span class="big" style="font-size:22px">' + (monthCost ? C.money(monthCost) : '—') + '</span></div>' +
        '<p class="mut" style="margin:8px 0 0;font-size:11.5px">输出 token 按输入估量的 ' + (tc.outM / Math.max(0.01, tc.inM)).toFixed(1) + ' 倍推算；实际以各家计费为准。</p>' +
        '</div>';

      html += '<p class="foot">Token 数按中文 1 字≈1 token、英文 4 字母≈1 token 估算，与真实分词器可能有 ±10~15% 偏差。</p>';
      page.innerHTML = html;

      var tabRow = page.querySelector('.chips');
      if (tabRow) tabRow.addEventListener('click', function (e) {
        var cm = e.target.closest('[data-cm]');
        if (cm && cm.getAttribute('data-cm') === 'plan') { st.priceMode = 'calc'; if (setCalcMode) setCalcMode('plan'); render(); return; }
        var b = e.target.closest('[data-tc]'); if (!b) return;
        var s = T.SAMPLES.filter(function (x) { return x[0] === b.getAttribute('data-tc'); })[0];
        if (s) { tc.text = s[2]; render(); }
      });
      var ta = $('#tcText');
      ta.addEventListener('input', debounce(function (e) {
        tc.text = e.target.value; var pos = e.target.selectionStart;
        render();
        var t2 = $('#tcText'); if (t2) { t2.focus(); t2.setSelectionRange(pos, pos); }
      }, 400));
      if ($('#tcPick')) $('#tcPick').onclick = function () {
        var list = opts.map(function (o) { return [o.id, o.name, o.prov + ' · ' + C.money(o.i) + ' / ' + C.money(o.o)]; });
        pickDlg('自选模型（' + list.length + '）', list, tc.modelId, function (v) { tc.modelId = v; render(); });
      };
      ['tcIn', 'tcOut', 'tcReqs'].forEach(function (id) {
        var el = $('#' + id); if (!el) return;
        el.oninput = debounce(function () {
          var a = parseFloat($('#tcIn').value), b = parseFloat($('#tcOut').value), c = parseFloat($('#tcReqs').value);
          if (isFinite(a) && a > 0) tc.inM = a;
          if (isFinite(b) && b >= 0) tc.outM = b;
          if (isFinite(c) && c >= 0) tc.reqs = c;
          render();
        }, 500);
      });
    }
    return view;
  };

  w.TokenCalc = T;
})(window);
