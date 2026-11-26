/* app.js — 骨架、榜单页、价格页、性价比页与模型详情。ES2019，面向 Chrome 91 WebView。 */
(function (w) {
  'use strict';
  var C = w.Core, N = w.Norm, X = w.Extra, esc = C.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var page = $('#page'), TABS = { rank: '榜单', price: '价格', value: '性价比', usage: '额度', more: '更多', thanks: '赞赏', news: 'AI 快讯' };
  var st = { tab: 'rank', rankMode: 'llm', priceMode: 'prov', valMode: 'chart', metric: 'ii', q: '', favOnly: false, openOnly: false, creator: '', provider: null, sort: 'in', pq: '', vq: '', showFree: false, rankLimit: 60 };
  var sheetOpen = false;

  // ---------- 主题 ----------
  function applyTheme() {
    var t = C.settings.theme, dark = t === 'dark' || (t === 'auto' && C.info.night);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { w.Native.setTheme(dark); } catch (e) {}
  }
  w.__onSystemTheme = function (night) { C.info.night = night; applyTheme(); if (st.tab === 'value') render(); };
  w.__onResume = function () { C.refreshAll(false); };

  // ---------- 通用小工具 ----------
  function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2200); }
  function seal(n) { return '<span class="seal' + (n <= 3 ? ' top' : '') + '">' + n + '</span>'; }
  function isFav(key) { return C.settings.favorites.indexOf(key) >= 0; }
  function toggleFav(key) { var f = C.settings.favorites, i = f.indexOf(key); if (i >= 0) f.splice(i, 1); else f.push(key); C.saveSettings(); }
  function empty(t, d) { return '<div class="empty"><b>' + esc(t) + '</b>' + (d ? '<p>' + esc(d) + '</p>' : '') + '</div>'; }
  function fmtNum(v, d) { return v == null ? '—' : (+v).toFixed(d == null ? 1 : d); }
  function fmtCtx(n) { return !n ? '—' : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.round(n / 1000) + 'K'; }
  function debounce(f, ms) { var t; return function (a) { var self = this; clearTimeout(t); t = setTimeout(function () { f.call(self, a); }, ms); }; }

  function logo(name, cls) {
    var f = w.LOGOS && w.LOGOS[name];
    if (!f) return '<i class="lg ph' + (cls ? ' ' + cls : '') + '">' + esc((name || '?').slice(0, 1)) + '</i>';
    return '<i class="lg' + (cls ? ' ' + cls : '') + '"><img src="assets/logos/' + f + '" alt="" loading="lazy"></i>';
  }

  // ---------- 底部弹层 ----------
  function openSheet(html, onMount) {
    var s = $('#sheet'); s.onclick = null; s.innerHTML = html; s.hidden = false; $('#sheetMask').hidden = false; s.scrollTop = 0;
    sheetOpen = true; if (onMount) onMount(s);
  }
  function closeSheet() { $('#sheet').hidden = true; $('#sheetMask').hidden = true; sheetOpen = false; }
  function confirmSheet(title, okText, onOk) {
    openSheet('<h2>' + esc(title) + '</h2><div class="btns"><button class="btn main" id="okDo">' + esc(okText) + '</button><button class="btn" id="okNo">取消</button></div>', function () {
      $('#okDo').onclick = function () { closeSheet(); onOk(); };
      $('#okNo').onclick = closeSheet;
    });
  }
  $('#sheetMask').addEventListener('click', closeSheet);
  w.__onBack = function () { if (sheetOpen) { closeSheet(); return true; } if (st.tab === 'thanks') { go('more'); return true; } if (st.tab === 'news') { go('rank'); return true; } if (st.tab !== 'rank') { go('rank'); return true; } return false; };

  // ---------- 模型对比（最多 4 个） ----------
  var cmpKeys = [], CMP_MAX = 4;
  function cmpModels() {
    var aa = C.sources.aa.data; if (!aa) return [];
    var by = {}; aa.models.forEach(function (m) { var k = m.releaseName || m.name; if (!by[k] || (m.intelligenceIndex || 0) > (by[k].intelligenceIndex || 0)) by[k] = m; });
    return cmpKeys.map(function (k) { return by[k]; }).filter(Boolean);
  }
  function cmpHas(key) { return cmpKeys.indexOf(key) >= 0; }
  function cmpToggle(key) {
    var i = cmpKeys.indexOf(key);
    if (i >= 0) { cmpKeys.splice(i, 1); renderCmpBar(); return 'removed'; }
    if (cmpKeys.length >= CMP_MAX) { toast('最多同时对比 ' + CMP_MAX + ' 个，先移出一个'); return 'full'; }
    cmpKeys.push(key); renderCmpBar(); return 'added';
  }
  function cmpClear() { cmpKeys = []; renderCmpBar(); }
  function cmpListSheet() {
    var ms = cmpModels(); if (!ms.length) return;
    openSheet('<h2>已选 ' + ms.length + ' 个对比模型</h2>' + ms.map(function (m) {
      return '<div class="kv"><span>' + esc(m.releaseName || m.shortName || m.name) + '</span><button class="btn sm" data-x="' + esc(m.releaseName || m.name) + '">移除</button></div>';
    }).join('') + '<div class="btns"><button class="btn main" id="cGo">开始对比</button><button class="btn" id="cAll">清空</button><button class="btn" id="cl">关闭</button></div>', function () {
      $('#sheet').onclick = function (e) {
        var x = e.target.getAttribute('data-x'); if (!x) return;
        cmpToggle(x); closeSheet(); if (cmpKeys.length) cmpListSheet();
      };
      $('#cGo').onclick = function () { closeSheet(); cmpSheet(); };
      $('#cAll').onclick = function () { cmpClear(); closeSheet(); toast('已清空'); };
      $('#cl').onclick = closeSheet;
    });
  }
  function cmpSheet() {
    var ms = cmpModels(); if (!ms.length) { toast('长按榜单或性价比里的模型即可加入对比'); return; }
    openSheet('<h2>模型对比</h2>' + X.cmpTableHtml(ms) +
      '<div class="btns"><button class="btn main" id="cImg">存为分享图</button><button class="btn" id="clr">清空重选</button><button class="btn" id="cl">关闭</button></div>', function () {
      $('#cImg').onclick = function () {
        var ok = w.Share && w.Share.saveCmpCard(ms);
        toast(ok ? '已存到相册（Pictures/模型行情）' : '生成失败，可直接截屏');
      };
      $('#cl').onclick = closeSheet;
      $('#clr').onclick = function () { cmpClear(); closeSheet(); toast('已清空'); };
      [].forEach.call($('#sheet').querySelectorAll('[data-rm]'), function (b) {
        b.onclick = function () { cmpToggle(b.getAttribute('data-rm')); closeSheet(); if (cmpKeys.length) cmpSheet(); };
      });
    });
  }
  function renderCmpBar() {
    var bar = $('#cmpBar'); if (!bar) return;
    if (!cmpKeys.length || st.tab === 'usage' || st.tab === 'more' || st.tab === 'thanks' || st.tab === 'news') { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = '<button class="cmpdots" id="cmpList" aria-label="已选的模型">' +
      [0, 1, 2, 3].map(function (i) { return '<i' + (i < cmpKeys.length ? '' : ' class="off"') + '></i>'; }).join('') +
      '<em>已选 ' + cmpKeys.length + ' / ' + CMP_MAX + '</em></button>' +
      '<button class="btn sm main" id="cmpGo">对比</button>';
    $('#cmpList').onclick = cmpListSheet;
    $('#cmpGo').onclick = cmpSheet;
  }
  function bindLongPress(container, resolve) {
    if (!container) return;
    var timer = null, moved = false, row = null, fired = false;
    function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
    container.addEventListener('touchstart', function (e) {
      var el = e.target.closest && e.target.closest('[data-i]'); if (!el) return;
      row = el; moved = false; fired = false;
      timer = setTimeout(function () {
        timer = null; if (moved || !row) return;
        fired = true;
        var m = resolve(+row.getAttribute('data-i')); if (!m) return;
        var k = m.releaseName || m.name;
        var res = cmpToggle(k);
        if (res === 'added') toast('已加入对比：' + (m.releaseName || m.name));
        else if (res === 'removed') toast('已移出对比');
        if (navigator.vibrate) { try { navigator.vibrate(18); } catch (x) {} }
      }, 450);
    }, { passive: true });
    container.addEventListener('touchmove', function () { moved = true; cancel(); }, { passive: true });
    container.addEventListener('touchend', function () { cancel(); row = null; }, { passive: true });
    container.addEventListener('touchcancel', function () { cancel(); row = null; }, { passive: true });
    container.addEventListener('click', function (e) { if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // ---------- 导航与状态条 ----------
  var VIEWS = {}, moreMod = null, subMod = null;
  function updateUsageBadge() {
    var b = document.querySelector('#tabs button[data-tab=usage]');
    if (b && w.Tools) b.classList.toggle('hasupd', w.Tools.alerts().length > 0);
  }
  function searchBox(id, val, ph) {
    return '<div class="sbox"><input class="search" id="' + id + '" placeholder="' + esc(ph) + '" value="' + esc(val || '') + '">' +
      (val ? '<button class="sclr" data-clr="' + id + '" aria-label="清空">×</button>' : '') + '</div>';
  }

  // ---------- 顶部吸顶边线 & 回到顶部浮钮 ----------
  var topEl = $('#top'), toTopEl = $('#toTop');
  page.addEventListener('scroll', function () {
    var y = page.scrollTop;
    if (topEl) topEl.classList.toggle('scrolled', y > 6);
    if (toTopEl) toTopEl.hidden = y < 480;
  }, { passive: true });
  if (toTopEl) toTopEl.onclick = function () { page.scrollTop = 0; };

  function go(tab) {
    if (st.tab !== tab) st.rankLimit = 60;
    st.tab = tab; $('#title').textContent = TABS[tab];
    var hi = tab === 'thanks' ? 'more' : tab === 'news' ? 'rank' : tab;
    [].forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === hi); });
    render(); page.scrollTop = 0;
    if (topEl) topEl.classList.remove('scrolled');
    if (toTopEl) toTopEl.hidden = true;
  }
  function render() {
    page.onclick = null;
    try { VIEWS[st.tab](); } catch (e) { console.error(e); page.innerHTML = empty('这个页面出错了', String(e && e.message || e)); }
    updateSrc(); renderCmpBar(); updateUsageBadge();
  }
  $('#tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(b.getAttribute('data-tab')); });

  function updateSrc() {
    var rkId = st.rankMode === 'prov' ? 'aa_providers' : st.rankMode === 't2i' ? 'aa_t2i' : st.rankMode === 't2v' ? 'aa_t2v' : 'aa';
    var ids = { rank: [rkId], price: ['prices', 'fx'], value: ['aa', 'prices'], usage: [], more: ['aa', 'prices', 'fx'], thanks: [], news: ['news'] }[st.tab];
    var all = Object.keys(C.sources).map(function (k) { return C.sources[k]; });
    var rel = ids.length ? ids.map(function (k) { return C.sources[k]; }).filter(Boolean) : all;
    var busy = all.some(function (s) { return s.refreshing; });
    var err = rel.some(function (s) { return s.error; });
    var dead = rel.some(function (s) { return s.error && !s.data; });
    var b = $('#srcBtn'); b.className = 'src' + (busy ? ' busy' : '') + (err && !busy ? ' err' : '');
    var s0 = rel[0] || all[0];
    $('#srcText').textContent = busy ? '更新中…' : dead ? '更新失败' : (s0 ? C.sourceLabel(s0) : '');
  }
  $('#srcBtn').addEventListener('click', function () {
    var rows = Object.keys(C.sources).map(function (k) {
      var s = C.sources[k];
      var val = s.error ? '失败' : s.origin === 'seed' ? '内置数据' : C.sourceLabel(s);
      return '<div class="kv"><span>' + esc(s.def.title) + '</span><span class="' + (s.error ? 'bad' : '') + '">' + esc(val) + '</span></div>' +
        (s.error ? '<p class="mut" style="margin:0 0 8px">' + esc(s.error.message) + '</p>' : '');
    }).join('');
    openSheet('<h2>数据更新</h2>' + rows + '<div class="btns"><button class="btn main" id="doRefresh">立即刷新</button><button class="btn" id="closeS">关闭</button></div>', function () {
      $('#doRefresh').onclick = function () { closeSheet(); toast('正在刷新…'); C.refreshAll(true).then(function (r) { toast(r.every(Boolean) ? '已刷新' : '部分数据未刷新成功'); }); };
      $('#closeS').onclick = closeSheet;
    });
  });

  C.on('source', updateSrc);
  C.on('data', function () { if (!sheetOpen) render(); });
  C.on('settings', function () { applyTheme(); });
  C.on('update', function (l) {
    var b = document.querySelector('#tabs button[data-tab=more]');
    if (b) b.classList.toggle('hasupd', !!(l && l.newer));
    if (st.tab === 'more' && moreMod) moreMod.upCard();
  });

  // ================= 榜单 =================
  var METRICS = [
    { k: 'ii', n: '综合智能', f: 'intelligenceIndex', d: 1 },
    { k: 'cost', n: '省钱', blend: true, low: true, money: true },
    { k: 'speed', n: '速度', f: 'outputTokensPerSecond', d: 0, u: '字/秒' },
    { k: 'ttft', n: '首字延迟', f: 'timeToFirstTokenSeconds', low: true, d: 1, u: '秒' },
    { k: 'ttfa', n: '出答案', f: 'timeToFirstAnswerTokenSeconds', low: true, d: 1, u: '秒' },
    { k: 'omni', n: '知识可靠', f: 'omniscienceIndex', d: 1 },
    { k: 'ctx', n: '上下文', f: 'contextWindowTokens', ctx: true }
  ];
  var CAPS = [['capabilityFinanceAndAccountingIndex', '财会'], ['capabilityStrategyAndOpsIndex', '战略运营'], ['capabilityLegalIndex', '法律'], ['capabilityHealthcareAndMedicalIndex', '医疗'], ['capabilityEngineeringIndex', '工程'], ['capabilityEconomicsIndex', '经济']];
  function capMetrics() { return CAPS.map(function (c) { return { k: c[0], n: c[1], f: c[0], d: 1 }; }); }
  function blendPrice(m) { return N.blended(m.priceInputPer1M, m.priceOutputPer1M, C.settings.blend); }
  function metricVal(m, met) { return met.blend ? blendPrice(m) : m[met.f]; }
  function shortEval(e) {
    var m = { evalGpqaDiamond: 'GPQA 科学', evalHumanitysLastExam: 'HLE 难题', evalTerminalbenchHard: '终端任务', evalScicode: 'SciCode', evalLivecodebench: 'LiveCode', evalGdpvalAaNormalized: 'GDPval 办公', evalTau2Bench: 'τ² 工具', evalIfbench: '指令遵循', evalAime2025: 'AIME 数学' };
    return m[e.key] || e.name;
  }
  function evalMetrics(aa) {
    var pop = ['evalGpqaDiamond', 'evalHumanitysLastExam', 'evalTerminalbenchHard', 'evalScicode', 'evalLivecodebench', 'evalGdpvalAaNormalized', 'evalTau2Bench', 'evalIfbench', 'evalAime2025'];
    var out = [];
    (aa.evals || []).forEach(function (e) { if (pop.indexOf(e.key) >= 0) out.push({ k: e.key, n: shortEval(e), f: e.key, d: e.scale === 'elo' ? 0 : 1, pct: e.scale !== 'elo' }); });
    return out;
  }
  function dedupeVariants(ms) {
    var best = {};
    ms.forEach(function (m) { var k = m.releaseName || m.name; if (!best[k] || (m.intelligenceIndex || 0) > (best[k].intelligenceIndex || 0)) best[k] = m; });
    return Object.keys(best).map(function (k) { return best[k]; });
  }
  function rawVariant(m) {
    if (m.variant) return String(m.variant);
    var mm = String(m.name || '').match(/\(([^()]+)\)\s*$/);
    if (mm && /\b(non-reasoning|reasoning|xhigh|max|high|medium|low|minimal|adaptive)\b/i.test(mm[1])) return mm[1];
    return '';
  }
  function effortName(m) {
    var raw = rawVariant(m), v = raw.toLowerCase();
    if (!v) return '默认';
    var nonR = v.indexOf('non-reasoning') >= 0;
    var lvl = v.indexOf('xhigh') >= 0 ? '极高'
      : /\bmax\b/.test(v) ? '最高'
      : /\bhigh\b/.test(v) ? '高'
      : /\bmedium\b/.test(v) ? '中'
      : /\bminimal\b/.test(v) ? '极低'
      : /\blow\b/.test(v) ? '低'
      : /\badaptive\b/.test(v) ? '自适应' : '';
    var out = nonR ? (lvl ? '不思考 · ' + lvl : '不思考')
      : lvl ? lvl
      : v.indexOf('reasoning') >= 0 ? '思考'
      : raw.split(',')[0].trim();
    // 保留除 Default Fallback / Based on / 档位词之外的附加标签（如 Daybreak Blue）
    var extras = raw.split(',').map(function (s) { return s.trim(); }).filter(function (s) {
      return s && !/^(default fallback|non-reasoning|reasoning|xhigh|max|high|medium|low|minimal|adaptive)$/i.test(s) && !/^based on\b/i.test(s);
    });
    if (extras.length && out !== extras[0]) out += ' · ' + extras[0];
    return out;
  }
  function variantsOf(m) {
    var aa = C.sources.aa.data; if (!aa) return [m];
    var k = m.releaseName || m.name;
    return aa.models.filter(function (x) { return (x.releaseName || x.name) === k; })
      .sort(function (a, b) { return (b.intelligenceIndex || 0) - (a.intelligenceIndex || 0); });
  }
  function byId(id) {
    var aa = C.sources.aa.data; if (!aa) return null;
    return aa.models.filter(function (m) { return m.id === id; })[0] || null;
  }
  function findPrice(m) {
    var d = C.sources.prices.data; if (!d) return [];
    var ks = N.aaKeys(m), out = [];
    Object.keys(d.providers).forEach(function (pid) {
      var p = d.providers[pid];
      for (var i = 0; i < p.models.length; i++) {
        var pm = p.models[i];
        if (ks.indexOf(N.modelKey(pm.id)) >= 0 || ks.indexOf(N.modelKey(pm.n)) >= 0) { out.push({ pid: pid, pn: p.name, i: pm.i, o: pm.o }); break; }
      }
    });
    out.sort(function (a, b) { return ((C.settings.pinned.indexOf(b.pid) >= 0) - (C.settings.pinned.indexOf(a.pid) >= 0)) || (a.i - b.i); });
    return out.slice(0, 12);
  }

  function modelSheet(m) {
    var key = m.releaseName || m.name, aa = C.sources.aa.data, ev = [];
    (aa.evals || []).forEach(function (e) { if (m[e.key] != null) ev.push({ n: e.name || e.key, v: m[e.key], elo: e.scale === 'elo' }); });
    ev.sort(function (a, b) { return a.n < b.n ? -1 : 1; });
    var p = findPrice(m), vs = variantsOf(m);
    var html = '<h2 class="h2lg">' + logo(m.creatorName, 'lg2') + '<span>' + esc(m.releaseName || m.name) + '</span></h2>' +
      '<p class="mut" style="margin:-4px 0 8px;font-size:12.5px">' + esc(m.creatorName || '') + (m.releaseDate ? ' · ' + esc(m.releaseDate) + ' 发布' : '') + (rawVariant(m) ? ' · ' + esc(effortName(m)) + '档' : '') + (m.isOpenWeights ? ' · 开源' : '') + '</p>' +
      (w.Insights ? w.Insights.radarHtml(m, aa) : '') +
      '<div class="kv"><span>综合智能指数</span><span>' + fmtNum(m.intelligenceIndex) + (m.intelligenceRank ? '（第 ' + m.intelligenceRank + ' 名）' : '') + '</span></div>' +
      '<div class="kv"><span>输入 / 输出（每百万字）</span><span>' + C.money(m.priceInputPer1M) + ' / ' + C.money(m.priceOutputPer1M) + '</span></div>' +
      '<div class="kv"><span>混合价（' + C.settings.blend + ':1）</span><span>' + C.money(blendPrice(m)) + '</span></div>' +
      '<div class="kv"><span>输出速度</span><span>' + (m.outputTokensPerSecond != null ? fmtNum(m.outputTokensPerSecond, 0) + ' 字/秒' : '—') + '</span></div>' +
      '<div class="kv"><span>首字延迟</span><span>' + (m.timeToFirstTokenSeconds != null ? fmtNum(m.timeToFirstTokenSeconds) + ' 秒' : '—') + '</span></div>' +
      (m.timeToFirstAnswerTokenSeconds != null && m.timeToFirstAnswerTokenSeconds !== m.timeToFirstTokenSeconds
        ? '<div class="kv"><span>出答案延迟</span><span>' + fmtNum(m.timeToFirstAnswerTokenSeconds) + ' 秒</span></div>' : '') +
      '<div class="kv"><span>上下文窗口</span><span>' + fmtCtx(m.contextWindowTokens) + '</span></div>' +
      (w.Insights ? w.Insights.costSimHtml(m.priceInputPer1M, m.priceOutputPer1M, 'code') : '');
    if (vs.length > 1) {
      html += '<div class="sec" style="padding-left:0">思考档位</div><div class="list boxed" id="tv" style="margin:0">' + vs.map(function (x) {
        var cur = x.id === m.id;
        return '<button class="row' + (cur ? ' fav' : '') + '" data-v="' + esc(x.id) + '">' + (cur ? '<i class="gdot"></i>' : '') +
          '<div class="mid"><div class="nm"><span class="nt">' + esc(effortName(x)) + (cur ? ' · 当前' : '') + '</span></div>' +
          '<div class="sub">' + (x.intelligenceRank ? '第 ' + x.intelligenceRank + ' 名' : '未排名') + (x.priceInputPer1M != null ? ' · ' + C.money(blendPrice(x)) + ' 混合价' : '') + '</div></div>' +
          '<div class="val">' + fmtNum(x.intelligenceIndex) + '<small>智能</small></div></button>';
      }).join('') + '</div>';
    }
    if (p.length) html += '<div class="sec" style="padding-left:0">各平台报价</div>' + p.map(function (x) { return '<div class="kv"><span>' + esc(x.pn) + '</span><span>' + C.money(x.i) + ' / ' + C.money(x.o) + '</span></div>'; }).join('');
    if (ev.length) html += '<div class="sec" style="padding-left:0">单项成绩</div>' + ev.map(function (e) { return '<div class="kv"><span>' + esc(e.n.replace(/ Benchmark.*$/, '')) + '</span><span>' + (e.elo ? Math.round(e.v) : (e.v * 100).toFixed(1) + '%') + '</span></div>'; }).join('');
    html += '<div class="btns"><button class="btn main" id="fv">' + (isFav(key) ? '移出自选' : '加入自选') + '</button>' +
      '<button class="btn" id="cmp">' + (cmpHas(key) ? '移出对比' : '加入对比') + '</button>' +
      '<button class="btn" id="op">官网</button><button class="btn" id="cl">关闭</button></div>';
    openSheet(html, function (sheetEl) {
      if (w.Insights) w.Insights.bindCostSim(sheetEl, m.priceInputPer1M, m.priceOutputPer1M);
      $('#fv').onclick = function () { toggleFav(key); closeSheet(); render(); toast(isFav(key) ? '已加入自选' : '已移出自选'); };
      $('#cmp').onclick = function () {
        if (cmpHas(key)) { cmpToggle(key); closeSheet(); toast('已移出对比'); return; }
        if (cmpToggle(key) === 'full') return;
        closeSheet(); toast('已加入对比'); render();
      };
      $('#op').onclick = function () { w.Native.openUrl(m.url); };
      $('#cl').onclick = closeSheet;
      var tv = $('#tv');
      if (tv) tv.onclick = function (e) { var b = e.target.closest('[data-v]'); if (!b) return; var x = byId(b.getAttribute('data-v')); if (x) modelSheet(x); };
    });
  }

  VIEWS.rank = function () {
    var topSeg = subMod.segHtml([['llm', '大语言'], ['prov', '供应商速度'], ['t2i', '生图'], ['t2v', '视频']], st.rankMode, 'data-rm');
    if (st.rankMode === 'prov') return subMod.viewProviders(topSeg);
    if (st.rankMode === 't2i' || st.rankMode === 't2v') return subMod.viewMedia(topSeg, st.rankMode);
    var aa = C.sources.aa.data;
    if (!aa) { page.innerHTML = topSeg + empty('正在获取榜单', '联网完成后会自动显示'); subMod.bindSeg('.seg', 'data-rm', 'rankMode'); return; }
    var ms = aa.models;
    var all = METRICS.concat(capMetrics(), evalMetrics(aa)).filter(function (m) { return aa.models.some(function (x) { return m.blend ? blendPrice(x) != null : x[m.f] != null; }); });
    var met = all.filter(function (m) { return m.k === st.metric; })[0] || all[0];
    var creators = {}; ms.forEach(function (m) { if (m.creatorName) creators[m.creatorName] = (creators[m.creatorName] || 0) + 1; });
    var cl = Object.keys(creators).sort(function (a, b) { return creators[b] - creators[a]; });
    var rows = ms.filter(function (m) { return metricVal(m, met) != null; });
    var allTiers = !C.settings.aaDedupe;
    if (!allTiers) rows = dedupeVariants(rows);
    if (st.creator) rows = rows.filter(function (m) { return m.creatorName === st.creator; });
    if (st.favOnly) rows = rows.filter(function (m) { return isFav(m.releaseName || m.name); });
    if (st.openOnly) rows = rows.filter(function (m) { return !!m.isOpenWeights; });
    if (st.q) { var q = st.q.toLowerCase(); rows = rows.filter(function (m) { return (m.name + ' ' + m.creatorName).toLowerCase().indexOf(q) >= 0; }); }
    rows.sort(function (a, b) { return met.low ? metricVal(a, met) - metricVal(b, met) : metricVal(b, met) - metricVal(a, met); });
    var max = 0, min = Infinity; rows.forEach(function (m) { var v = metricVal(m, met); if (v > max) max = v; if (v < min) min = v; });
    var shown = rows.slice(0, st.rankLimit || 60);
    var hasOw = ms.some(function (m) { return !!m.isOpenWeights; });

    var newsBar = w.News ? w.News.bannerHtml() : '';
    var html = topSeg + newsBar + '<div class="chips">' + all.map(function (m) { return '<button class="chip' + (m.k === met.k ? ' on' : '') + '" data-m="' + m.k + '">' + esc(m.n) + '</button>'; }).join('') + '</div>' +
      '<div class="tools wrap">' + searchBox('q', st.q, '搜索模型或厂商') +
      '<button class="tog' + (st.favOnly ? ' on' : '') + '" id="fav">自选</button>' +
      (hasOw ? '<button class="tog' + (st.openOnly ? ' on' : '') + '" id="ow">仅开源</button>' : '') +
      '<button class="tog' + (allTiers ? ' on' : '') + '" id="allv">全档位</button>' +
      '<select class="tog" id="cr"><option value="">全部厂商</option>' + cl.map(function (c) { return '<option' + (c === st.creator ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="hint"><span><a href="#" id="aal" class="src-link">Artificial Analysis</a>' + (aa.meta && aa.meta.source === 'api' ? ' 官方接口' : '') + (C.sources.aa.meta && C.sources.aa.meta.via === '国内镜像' ? ' · 镜像' : '') + ' · ' + rows.length + ' 个模型</span>' +
      (st.favOnly && rows.length >= 2 ? '<button class="fmore" id="cmpFav">一键对比自选 ›</button>' : '<span>长按加入对比</span>') + '</div>';

    if (!shown.length) {
      html += '<div class="empty"><b>没有符合的模型</b><div class="btns"><button class="btn sm" id="clrFil">清除筛选</button></div></div>';
    } else {
      html += '<div class="list">' + shown.map(function (m, i) {
        var v = metricVal(m, met), key = m.releaseName || m.name;
        var w1 = met.low ? Math.max(6, 100 * (min || 0.0001) / Math.max(v, 0.0001)) : Math.max(4, 100 * v / (max || 1));
        var vs = met.money ? C.money(v) : met.ctx ? fmtCtx(v) : fmtNum(met.pct ? v * 100 : v, met.d);
        var unit = met.money ? '每百万字' : met.pct ? '%' : (met.u || '');
        var title = m.releaseName || m.shortName || m.name;
        var tier = allTiers ? effortName(m) : '';
        return '<button class="row' + (isFav(key) ? ' fav' : '') + '" data-i="' + i + '">' + (isFav(key) ? '<i class="gdot"></i>' : '') + seal(i + 1) +
          '<div class="mid"><div class="nm">' + logo(m.creatorName) + '<span class="nt">' + esc(title) + '</span></div>' +
          '<div class="sub">' + esc(m.creatorName || '') + (tier ? ' · ' + esc(tier) : '') + (m.isOpenWeights ? ' · 开源' : '') + '</div>' +
          '<div class="bar-track"><div class="bar" style="width:' + w1.toFixed(1) + '%"></div></div></div>' +
          '<div class="val">' + vs + (unit ? '<small>' + unit + '</small>' : '') + '</div></button>';
      }).join('') + '</div>';
    }
    if (rows.length > shown.length) html += '<div class="morewrap"><button class="btn sm" id="moreRank">再看 ' + Math.min(40, rows.length - shown.length) + ' 个</button></div>';
    page.innerHTML = html;
    subMod.bindSeg('.seg', 'data-rm', 'rankMode');
    if ($('#openNews')) $('#openNews').onclick = function () { go('news'); };

    page.querySelector('.chips').addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (b) { st.metric = b.getAttribute('data-m'); render(); } });
    $('#q').addEventListener('input', debounce(function (e) { st.q = e.target.value; var pos = e.target.selectionStart; render(); var q = $('#q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250));
    var clrQ = page.querySelector('[data-clr="q"]'); if (clrQ) clrQ.onclick = function () { st.q = ''; render(); };
    $('#fav').onclick = function () { st.favOnly = !st.favOnly; render(); };
    if ($('#ow')) $('#ow').onclick = function () { st.openOnly = !st.openOnly; st.rankLimit = 60; render(); };
    if ($('#cmpFav')) $('#cmpFav').onclick = function () {
      cmpKeys = [];
      rows.slice(0, CMP_MAX).forEach(function (m) { var k = m.releaseName || m.name; if (cmpKeys.indexOf(k) < 0) cmpKeys.push(k); });
      renderCmpBar(); cmpSheet();
    };
    if ($('#aal')) $('#aal').onclick = function (e) { e.preventDefault(); w.Native.openUrl('https://artificialanalysis.ai/'); };
    $('#cr').onchange = function (e) { st.creator = e.target.value; st.rankLimit = 60; render(); };
    $('#allv').onclick = function () { C.saveSettings({ aaDedupe: allTiers }); st.rankLimit = 60; render(); toast(allTiers ? '只显示每个模型的最高档' : '已展开全部思考档位'); };
    if ($('#moreRank')) $('#moreRank').onclick = function () { st.rankLimit += 40; render(); };
    if ($('#clrFil')) $('#clrFil').onclick = function () { st.q = ''; st.creator = ''; st.favOnly = false; st.openOnly = false; st.rankLimit = 60; render(); };
    var lst = page.querySelector('.list');
    if (lst) {
      lst.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) modelSheet(shown[+b.getAttribute('data-i')]); });
      bindLongPress(lst, function (i) { return shown[i]; });
    }
  };

  // ================= 价格 =================
  var PROV_NAMES = { opencode: 'OpenCode Zen', 'opencode-go': 'OpenCode Go', commandcode: 'Command Code' };
  function provName(p) { return PROV_NAMES[p.id] || p.name; }
  function priceSheet(p, m) {
    var ratio = C.settings.blend, e = C.settings.est, cost = e.inM * m.i + e.outM * (m.o || 0);
    openSheet('<h2>' + esc(m.n) + '</h2><p class="mut" style="margin:-4px 0 10px;font-size:12.5px">' + esc(provName(p)) + ' · ' + esc(m.id) + '</p>' +
      '<div class="kv"><span>输入价</span><span>' + C.money(m.i) + ' / 百万字</span></div>' +
      '<div class="kv"><span>输出价</span><span>' + C.money(m.o) + ' / 百万字</span></div>' +
      '<div class="kv"><span>缓存读取</span><span>' + C.money(m.cr) + '</span></div>' +
      '<div class="kv"><span>缓存写入</span><span>' + C.money(m.cw) + '</span></div>' +
      '<div class="kv"><span>混合价（' + ratio + ':1）</span><span>' + C.money(N.blended(m.i, m.o, ratio)) + '</span></div>' +
      (m.hi ? '<div class="kv"><span>超 ' + fmtCtx(m.hi.at) + ' 上下文</span><span>' + C.money(m.hi.i) + ' / ' + C.money(m.hi.o) + '</span></div>' : '') +
      '<div class="kv"><span>上下文 / 最大输出</span><span>' + fmtCtx(m.ctx) + ' / ' + fmtCtx(m.mo) + '</span></div>' +
      '<div class="kv"><span>月费参考（' + e.inM + 'M 入 + ' + e.outM + 'M 出）</span><span>' + C.money(cost) + '</span></div>' +
      (w.Insights ? w.Insights.costSimHtml(m.i, m.o, 'code') : '') +
      '<div class="btns"><button class="btn main" id="goCmp">跨平台比价</button><button class="btn" id="cl">关闭</button></div>', function (sheetEl) {
      if (w.Insights) w.Insights.bindCostSim(sheetEl, m.i, m.o);
      $('#goCmp').onclick = function () { st.priceMode = 'cmp'; st.cmpQ = m.n; st.rankLimit = 50; closeSheet(); render(); };
      $('#cl').onclick = closeSheet;
    });
  }
  function providerPicker() {
    var d = C.sources.prices.data, ids = Object.keys(d.providers).sort(function (a, b) { return d.providers[b].models.length - d.providers[a].models.length; });
    openSheet('<h2>选择平台</h2><input class="search" id="pp" placeholder="搜索平台" style="width:100%;margin-bottom:8px"><div id="pl"></div><div class="btns"><button class="btn" id="cl">完成</button></div>', function () {
      function draw() {
        var q = $('#pp').value.toLowerCase();
        $('#pl').innerHTML = ids.filter(function (id) { return !q || (d.providers[id].name + id).toLowerCase().indexOf(q) >= 0; }).slice(0, 60).map(function (id) {
          var on = C.settings.pinned.indexOf(id) >= 0;
          return '<div class="kv"><button data-v="' + id + '" style="text-align:left;flex:1">' + esc(provName(d.providers[id])) + ' <span class="mut" style="font-size:12px">' + d.providers[id].models.length + ' 个</span></button>' +
            '<button class="btn sm" data-t="' + id + '">' + (on ? '取消置顶' : '置顶') + '</button></div>';
        }).join('');
      }
      draw(); $('#pp').oninput = draw;
      $('#pl').onclick = function (e) {
        var t = e.target.getAttribute('data-t'), v = e.target.getAttribute('data-v');
        if (t) { var i = C.settings.pinned.indexOf(t); if (i >= 0) C.settings.pinned.splice(i, 1); else C.settings.pinned.push(t); C.saveSettings(); draw(); }
        if (v) { st.provider = v; st.pq = ''; st.rankLimit = 60; closeSheet(); render(); }
      };
      $('#cl').onclick = function () { closeSheet(); render(); };
    });
  }

  VIEWS.price = function () {
    var topSeg = subMod.segHtml([['prov', '按平台'], ['cmp', '按模型比价'], ['plans', '订阅套餐']], st.priceMode, 'data-pm');
    if (st.priceMode === 'cmp') return subMod.viewPriceCompare(topSeg);
    if (st.priceMode === 'plans') return subMod.viewPlans(topSeg);
    var d = C.sources.prices.data;
    if (!d) { page.innerHTML = topSeg + empty('正在获取价格', ''); subMod.bindSeg('.seg', 'data-pm', 'priceMode'); return; }
    var pins = C.settings.pinned.filter(function (id) { return d.providers[id]; });
    if (!st.provider || !d.providers[st.provider]) st.provider = pins[0] || Object.keys(d.providers)[0];
    var p = d.providers[st.provider];
    var rows = p.models.slice();
    var nFree = rows.filter(function (m) { return !m.i && !m.o; }).length;
    if (!st.showFree) rows = rows.filter(function (m) { return m.i || m.o; });
    var ratio = C.settings.blend;
    var key = { in: function (m) { return m.i; }, out: function (m) { return m.o == null ? 1e9 : m.o; }, blend: function (m) { var b = N.blended(m.i, m.o, ratio); return b == null ? 1e9 : b; }, new: function (m) { return -(Date.parse(m.rd || '2000-01-01') || 0); } }[st.sort];
    if (st.pq) { var q = st.pq.toLowerCase(); rows = rows.filter(function (m) { return (m.n + ' ' + m.id).toLowerCase().indexOf(q) >= 0; }); }
    rows.sort(function (a, b) { return key(a) - key(b); });
    var pShown = rows.slice(0, st.rankLimit || 60);

    var html = topSeg + '<div class="chips">' + pins.map(function (id) { return '<button class="chip' + (id === st.provider ? ' on' : '') + '" data-p="' + id + '">' + esc(provName(d.providers[id])) + '</button>'; }).join('') + '<button class="chip" id="morep">＋ 更多平台</button></div>' +
      '<div class="tools">' + searchBox('pq', st.pq, '搜索 ' + provName(p)) +
      (nFree ? '<button class="tog' + (st.showFree ? ' on' : '') + '" id="fr">免费 ' + nFree + '</button>' : '') +
      '<select class="tog" id="so"><option value="in"' + (st.sort === 'in' ? ' selected' : '') + '>按输入价</option><option value="out"' + (st.sort === 'out' ? ' selected' : '') + '>按输出价</option><option value="blend"' + (st.sort === 'blend' ? ' selected' : '') + '>按混合价</option><option value="new"' + (st.sort === 'new' ? ' selected' : '') + '>最新发布</option></select></div>' +
      '<div class="hint"><span>' + rows.length + ' 个模型 · 每百万字</span><span>' + (C.settings.currency === 'CNY' ? '人民币（汇率 ' + C.fxRate().toFixed(2) + '）' : '美元 USD') + '</span></div>';

    html += pShown.length ? '<div class="list">' + pShown.map(function (m, i) {
      return '<button class="row" data-i="' + i + '"><div class="mid"><div class="nm"><span class="nt">' + esc(m.n) + '</span></div>' +
        '<div class="sub">' + [fmtCtx(m.ctx) + ' 上下文', m.rs ? '推理' : '', m.ow ? '开源' : '', m.rd || ''].filter(Boolean).map(esc).join(' · ') + '</div></div>' +
        '<div class="pn">' + C.money(m.i) + '<small>输入</small></div><div class="pn">' + C.money(m.o) + '<small>输出</small></div></button>';
    }).join('') + '</div>' : '<div class="empty"><b>没有符合的模型</b><div class="btns"><button class="btn sm" id="clrFp">清除筛选</button></div></div>';
    if (rows.length > pShown.length) html += '<div class="morewrap"><button class="btn sm" id="morePrice">再看 ' + Math.min(40, rows.length - pShown.length) + ' 个</button></div>';
    page.innerHTML = html;
    subMod.bindSeg('.seg', 'data-pm', 'priceMode');

    page.querySelector('.chips').addEventListener('click', function (e) { var b = e.target.closest('[data-p]'); if (b) { st.provider = b.getAttribute('data-p'); st.pq = ''; st.rankLimit = 60; render(); } if (e.target.id === 'morep') providerPicker(); });
    $('#pq').addEventListener('input', debounce(function (e) { st.pq = e.target.value; st.rankLimit = 60; var pos = e.target.selectionStart; render(); var q = $('#pq'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250));
    var clrPq = page.querySelector('[data-clr="pq"]'); if (clrPq) clrPq.onclick = function () { st.pq = ''; st.rankLimit = 60; render(); };
    $('#so').onchange = function (e) { st.sort = e.target.value; render(); };
    if ($('#fr')) $('#fr').onclick = function () { st.showFree = !st.showFree; render(); };
    if ($('#morePrice')) $('#morePrice').onclick = function () { st.rankLimit += 40; render(); };
    if ($('#clrFp')) $('#clrFp').onclick = function () { st.pq = ''; st.showFree = false; st.rankLimit = 60; render(); };
    var lst = page.querySelector('.list'); if (lst) lst.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) priceSheet(p, pShown[+b.getAttribute('data-i')]); });
  };

  // ================= 性价比 =================
  VIEWS.value = function () {
    var topSeg = subMod.segHtml([['chart', '前沿排行'], ['calc', '预算选型 / 算账']], st.valMode, 'data-vm');
    if (st.valMode === 'calc') return subMod.viewCalc(topSeg);
    var aa = C.sources.aa.data;
    if (!aa) { page.innerHTML = topSeg + empty('正在获取榜单', ''); subMod.bindSeg('.seg', 'data-vm', 'valMode'); return; }
    var pts = dedupeVariants(aa.models).filter(function (m) { var p = blendPrice(m); return m.intelligenceIndex != null && p > 0; });
    var fr = N.frontier(pts.map(function (m) { return { x: blendPrice(m), y: m.intelligenceIndex, m: m }; }));
    var frSet = {}; fr.forEach(function (p) { frSet[p.m.id] = 1; });
    var rows = pts.map(function (m) { return { m: m, v: m.intelligenceIndex / Math.sqrt(blendPrice(m)), front: !!frSet[m.id] }; });
    rows.sort(function (a, b) { return b.v - a.v; });
    if (st.vq) { var q = st.vq.toLowerCase(); rows = rows.filter(function (r) { return (r.m.name + ' ' + r.m.creatorName).toLowerCase().indexOf(q) >= 0; }); }
    var vShown = rows.slice(0, st.rankLimit || 60);

    var html = topSeg + '<div class="pad"><div class="chartbox">' +
      '<div class="chart-hd"><b>价格与智能前沿</b><span>点圆点看模型详情</span></div>' +
      '<canvas id="cv"></canvas>' +
      '<div class="chartlg"><span><i class="z"></i>同价位最强</span><span><i class="d"></i>其他模型</span><span class="tip">越靠左上越划算</span></div></div></div>' +
      '<div class="tools">' + searchBox('vq', st.vq, '搜索模型或厂商') + '</div>' +
      '<div class="hint"><span>' + rows.length + ' 个官方报价模型</span><span>长按加入对比</span></div>';

    if (!vShown.length) {
      html += '<div class="empty"><b>没有符合的模型</b><div class="btns"><button class="btn sm" id="clrFv">清除筛选</button></div></div>';
    } else {
      html += '<div class="list">' + vShown.map(function (r, i) {
        var key = r.m.releaseName || r.m.name;
        return '<button class="row' + (isFav(key) ? ' fav' : '') + '" data-i="' + i + '">' + (isFav(key) ? '<i class="gdot"></i>' : '') + seal(i + 1) +
          '<div class="mid"><div class="nm">' + logo(r.m.creatorName) + '<span class="nt">' + esc(r.m.releaseName || r.m.shortName || r.m.name) + '</span></div>' +
          '<div class="sub">智能 ' + fmtNum(r.m.intelligenceIndex) + ' · ' + C.money(blendPrice(r.m)) + ' / 百万字' + (r.front ? ' · 同价位最强' : '') + '</div></div>' +
          '<div class="val">' + r.v.toFixed(1) + '<small>性价比</small></div></button>';
      }).join('') + '</div>';
    }
    if (rows.length > vShown.length) html += '<div class="morewrap"><button class="btn sm" id="moreVal">再看 ' + Math.min(40, rows.length - vShown.length) + ' 个</button></div>';
    page.innerHTML = html;
    subMod.bindSeg('.seg', 'data-vm', 'valMode');

    $('#vq').addEventListener('input', debounce(function (e) { st.vq = e.target.value; st.rankLimit = 60; var pos = e.target.selectionStart; render(); var q = $('#vq'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250));
    var clrVq = page.querySelector('[data-clr="vq"]'); if (clrVq) clrVq.onclick = function () { st.vq = ''; st.rankLimit = 60; render(); };
    if ($('#moreVal')) $('#moreVal').onclick = function () { st.rankLimit += 40; render(); };
    if ($('#clrFv')) $('#clrFv').onclick = function () { st.vq = ''; st.rankLimit = 60; render(); };
    var vlist = page.querySelector('.list');
    if (vlist) {
      vlist.addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (b) modelSheet(vShown[+b.getAttribute('data-i')].m); });
      bindLongPress(vlist, function (i) { return vShown[i] && vShown[i].m; });
    }
    var cvv = $('#cv');
    if (cvv) {
      X.drawScatter(cvv, pts, fr);
      cvv.onclick = function (e) {
        var r = cvv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 26;
        (cvv.__dots || []).forEach(function (p) {
          var d = Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) - (p.z ? 4 : 0);
          if (d < bd) { bd = d; best = p; }
        });
        if (best) modelSheet(best.m);
      };
    }
  };

  // ---------- 注册子视图与额度/更多/赞赏页并启动 ----------
  subMod = w.registerSubViews({ page: page, st: st, toast: toast, openSheet: openSheet, closeSheet: closeSheet, confirmSheet: confirmSheet, render: render, debounce: debounce, modelSheet: modelSheet });
  moreMod = w.registerMoreViews({ page: page, toast: toast, openSheet: openSheet, closeSheet: closeSheet, confirmSheet: confirmSheet, render: render, go: go });
  VIEWS.usage = moreMod.usage; VIEWS.more = moreMod.more; VIEWS.thanks = moreMod.thanks;
  if (w.News) VIEWS.news = w.News.registerView({ page: page, st: st, toast: toast, openSheet: openSheet, closeSheet: closeSheet, confirmSheet: confirmSheet, render: render, debounce: debounce, go: go });

  applyTheme();
  go('rank');
  setInterval(updateSrc, 30000);
  setTimeout(function () { C.refreshAll(false); }, 400);
  if (w.Update && w.Update.autoCheck) setTimeout(function () { w.Update.autoCheck(); }, 1500);
})(window);
