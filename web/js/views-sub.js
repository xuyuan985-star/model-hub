/* views-sub.js — 新增子视图：供应商速度/生图/视频榜、同模型比价、订阅套餐、预算选型向导。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core, K = w.Calc, P = w.Plans, esc = C.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function fmtNum(v, d) { return v == null ? '—' : (+v).toFixed(d == null ? 1 : d); }
  function fmtCtx(n) { return !n ? '—' : n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M' : Math.round(n / 1000) + 'K'; }
  function seal(n) { return '<span class="seal' + (n <= 3 ? ' top' : '') + '">' + n + '</span>'; }
  function logo(name, cls) {
    var f = w.LOGOS && w.LOGOS[name];
    if (!f) return '<i class="lg ph' + (cls ? ' ' + cls : '') + '">' + esc((name || '?').slice(0, 1)) + '</i>';
    return '<i class="lg' + (cls ? ' ' + cls : '') + '"><img src="assets/logos/' + f + '" alt="" loading="lazy"></i>';
  }
  function searchBox(id, val, ph) {
    return '<div class="sbox"><input class="search" id="' + id + '" placeholder="' + esc(ph) + '" value="' + esc(val || '') + '">' +
      (val ? '<button class="sclr" data-clr="' + id + '" aria-label="清空">×</button>' : '') + '</div>';
  }
  function bindClr(page, id, key, render, resetLimit) {
    var b = page.querySelector('[data-clr="' + id + '"]');
    if (b) b.onclick = function () { resetLimit(); key(); render(); };
  }
  function segHtml(items, cur, attr) {
    return '<div class="seg-wrap"><div class="seg">' + items.map(function (it) {
      return '<button class="' + (it[0] === cur ? 'on' : '') + '" ' + attr + '="' + it[0] + '">' + esc(it[1]) + '</button>';
    }).join('') + '</div></div>';
  }

  var cmpIndexCache = { ver: -1, blend: -1, list: [] };
  function getCmpIndex() {
    var s = C.sources.prices;
    if (!s || !s.data) return [];
    if (cmpIndexCache.ver !== s.version || cmpIndexCache.blend !== C.settings.blend) {
      cmpIndexCache.list = K.buildCompareIndex(s.data, C.settings.pinned);
      cmpIndexCache.ver = s.version;
      cmpIndexCache.blend = C.settings.blend;
    }
    return cmpIndexCache.list;
  }

  w.registerSubViews = function (A) {
    var page = A.page, st = A.st, toast = A.toast, openSheet = A.openSheet, closeSheet = A.closeSheet;
    var confirmSheet = A.confirmSheet, render = A.render, debounce = A.debounce, modelSheet = A.modelSheet;

    function bindSeg(sel, attr, key, onPick) {
      var el = page.querySelector(sel);
      if (el) el.addEventListener('click', function (e) {
        var b = e.target.closest('[' + attr + ']'); if (!b) return;
        st[key] = b.getAttribute(attr);
        st.rankLimit = 60;
        if (onPick) onPick(st[key]);
        render();
      });
    }

    // ---------- 1) 榜单子视图：供应商速度榜 ----------
    function viewProviders(topSeg) {
      var s = C.sources.aa_providers;
      if (!s.data && !s.refreshing && !s.error) C.refresh('aa_providers', false);
      if (!s.data) {
        page.innerHTML = topSeg + (s.error
          ? '<div class="empty"><b>获取失败</b><p>' + esc(s.error.message) + '</p><div class="btns"><button class="btn main sm" id="retryP">重试</button></div></div>'
          : '<div class="empty"><b>正在获取供应商速度榜…</b><p>拉取各家 API 托管商的实测吐字速度、首字延迟与报价。</p></div>');
        if ($('#retryP')) $('#retryP').onclick = function () { C.refresh('aa_providers', true); render(); };
        bindSeg('.seg', 'data-rm', 'rankMode');
        return;
      }
      var pSort = st.provSort || 'speed';
      var sc = st.provScope || 'all';
      var rows = s.data.rows.filter(function (r) { return w.Filters.scopeOk(r, sc); });
      if (pSort === 'speed') rows = rows.filter(function (r) { return r.speed > 0; }).sort(function (a, b) { return b.speed - a.speed; });
      else if (pSort === 'ttft') rows = rows.filter(function (r) { return r.ttft > 0; }).sort(function (a, b) { return a.ttft - b.ttft; });
      else rows = rows.filter(function (r) { return r.pBlend > 0; }).sort(function (a, b) { return a.pBlend - b.pBlend; });
      if (st.provQ) {
        var q = st.provQ.toLowerCase();
        rows = rows.filter(function (r) { return (r.model + ' ' + r.host + ' ' + r.creator).toLowerCase().indexOf(q) >= 0; });
      }
      var shown = rows.slice(0, st.rankLimit || 60);
      var maxV = shown.length ? Math.max.apply(null, shown.map(function (r) { return pSort === 'speed' ? r.speed : pSort === 'ttft' ? r.ttft : r.pBlend; })) : 1;
      var minV = shown.length ? Math.min.apply(null, shown.map(function (r) { return pSort === 'speed' ? r.speed : pSort === 'ttft' ? r.ttft : r.pBlend; })) : 1;

      var html = topSeg +
        '<div class="chips">' +
        [['speed', '最快吐字'], ['ttft', '最低首字延迟'], ['price', '最省钱']].map(function (x) {
          return '<button class="chip' + (pSort === x[0] ? ' on' : '') + '" data-ps="' + x[0] + '">' + x[1] + '</button>';
        }).join('') + '</div>' +
        '<div class="tools">' + searchBox('provQ', st.provQ, '搜模型或托管商（如 DeepSeek、Groq）') + w.Filters.scopeHtml(sc) + '</div>' +
        '<div class="hint"><span>' + rows.length + ' 个托管节点</span><span>按模型搜可比各家速度</span></div>';
      html += shown.length ? '<div class="list">' + shown.map(function (r, i) {
        var val = pSort === 'speed' ? fmtNum(r.speed, 0) : pSort === 'ttft' ? fmtNum(r.ttft, 2) : C.money(r.pBlend);
        var unit = pSort === 'speed' ? '字/秒' : pSort === 'ttft' ? '秒' : '混合价';
        var pct = pSort === 'speed' ? Math.max(5, 100 * r.speed / (maxV || 1)) : Math.max(6, 100 * (minV || 0.01) / Math.max(pSort === 'ttft' ? r.ttft : r.pBlend, 0.01));
        return '<button class="row" data-pi="' + i + '">' + seal(i + 1) +
          '<div class="mid"><div class="nm">' + logo(r.creator || r.host) + '<span class="nt">' + esc(r.model) + '</span></div>' +
          '<div class="sub">' + esc(r.host) + (r.pBlend != null ? ' · ' + C.money(r.pBlend) : '') + (r.ttft != null ? ' · 首字 ' + fmtNum(r.ttft, 1) + 's' : '') + '</div>' +
          '<div class="bar-track"><div class="bar" style="width:' + pct.toFixed(1) + '%"></div></div></div>' +
          '<div class="val">' + val + '<small>' + unit + '</small></div></button>';
      }).join('') + '</div>' : '<div class="empty"><b>没有匹配的节点</b></div>';
      if (rows.length > shown.length) html += '<div class="morewrap"><button class="btn sm" id="moreP">再看 ' + Math.min(40, rows.length - shown.length) + ' 条</button></div>';

      page.innerHTML = html;
      bindSeg('.seg', 'data-rm', 'rankMode');
      page.querySelector('.chips').addEventListener('click', function (e) { var b = e.target.closest('[data-ps]'); if (b) { st.provSort = b.getAttribute('data-ps'); st.rankLimit = 60; render(); } });
      page.querySelector('.mseg').addEventListener('click', function (e) { var b = e.target.closest('[data-scp]'); if (b) { st.provScope = b.getAttribute('data-scp'); st.rankLimit = 60; render(); } });
      $('#provQ').addEventListener('input', debounce(function (e) { st.provQ = e.target.value; st.rankLimit = 60; var pos = e.target.selectionStart; render(); var q = $('#provQ'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250));
      bindClr(page, 'provQ', function () { st.provQ = ''; }, render, function () { st.rankLimit = 60; });
      if ($('#moreP')) $('#moreP').onclick = function () { st.rankLimit += 40; render(); };
      var lst = page.querySelector('.list');
      if (lst) lst.addEventListener('click', function (e) {
        var b = e.target.closest('[data-pi]'); if (!b) return;
        var r = shown[+b.getAttribute('data-pi')];
        openSheet('<h2>' + esc(r.model) + '</h2><p class="mut" style="margin:-4px 0 10px">托管商：' + esc(r.host) + (r.creator ? ' · 原厂 ' + esc(r.creator) : '') + '</p>' +
          '<div class="kv"><span>吐字速度</span><span>' + (r.speed != null ? fmtNum(r.speed, 1) + ' 字/秒' : '—') + '</span></div>' +
          '<div class="kv"><span>首字延迟</span><span>' + (r.ttft != null ? fmtNum(r.ttft, 2) + ' 秒' : '—') + '</span></div>' +
          '<div class="kv"><span>输入 / 输出（每百万字）</span><span>' + C.money(r.pIn) + ' / ' + C.money(r.pOut) + '</span></div>' +
          '<div class="kv"><span>上下文窗口</span><span>' + fmtCtx(r.ctx) + '</span></div>' +
          (r.ii != null ? '<div class="kv"><span>原模型智能指数</span><span>' + fmtNum(r.ii, 1) + '</span></div>' : '') +
          '<div class="btns"><button class="btn main" id="sameM">同模型换别家比速</button><button class="btn" id="cl">关闭</button></div>', function () {
          $('#sameM').onclick = function () { st.provQ = r.model.replace(/\([^)]*\)/g, '').trim(); closeSheet(); render(); };
          $('#cl').onclick = closeSheet;
        });
      });
    }

    function curScope() { return st.mediaScope || 'all'; }

    // ---------- 2) 榜单子视图：生图 / 视频多模态榜 ----------
    function viewMedia(topSeg, kind) {
      var sid = 'aa_' + kind, s = C.sources[sid];
      if (!s.data && !s.refreshing && !s.error) C.refresh(sid, false);
      if (!s.data) {
        page.innerHTML = topSeg + (s.error
          ? '<div class="empty"><b>获取失败</b><p>' + esc(s.error.message) + '</p><div class="btns"><button class="btn main sm" id="retryM">重试</button></div></div>'
          : '<div class="empty"><b>正在获取' + (kind === 't2i' ? '生图' : '视频') + '榜…</b></div>');
        if ($('#retryM')) $('#retryM').onclick = function () { C.refresh(sid, true); render(); };
        bindSeg('.seg', 'data-rm', 'rankMode');
        return;
      }
      var mediaSc = curScope();
      var rows = s.data.rows.filter(function (r) { return w.Filters.scopeOk(r, mediaSc); });
      if (st.mediaQ) {
        var q = st.mediaQ.toLowerCase();
        rows = rows.filter(function (r) { return (r.name + ' ' + r.creator).toLowerCase().indexOf(q) >= 0; });
      }
      var shown = rows.slice(0, st.rankLimit || 60);
      var maxE = rows.length ? rows[0].elo : 1300, minE = rows.length ? Math.max(800, rows[rows.length - 1].elo - 40) : 900;
      var html = topSeg +
        '<div class="tools">' + searchBox('mediaQ', st.mediaQ, '搜索' + (kind === 't2i' ? '生图' : '视频') + '模型或厂商') + w.Filters.scopeHtml(mediaSc) + '</div>' +
        '<div class="hint"><span>Artificial Analysis ' + (kind === 't2i' ? '文生图 Elo' : '文生视频 Elo') + ' · ' + rows.length + ' 款</span><span>' + (s.data.source === 'api' ? '官方接口' : '公开榜') + '</span></div>';
      html += shown.length ? '<div class="list">' + shown.map(function (r, i) {
        var pct = Math.max(6, 100 * (r.elo - minE) / Math.max(1, maxE - minE));
        return '<button class="row" data-mi="' + i + '">' + seal(i + 1) +
          '<div class="mid"><div class="nm">' + logo(r.creator) + '<span class="nt">' + esc(r.name) + '</span></div>' +
          '<div class="sub">' + [r.creator, r.price != null ? C.money(r.price) + r.priceUnit : '', r.ow ? '开源' : '', r.rd || ''].filter(Boolean).map(esc).join(' · ') + '</div>' +
          '<div class="bar-track"><div class="bar" style="width:' + pct.toFixed(1) + '%"></div></div></div>' +
          '<div class="val">' + r.elo + '<small>Elo</small></div></button>';
      }).join('') + '</div>' : '<div class="empty"><b>没有符合的模型</b></div>';
      if (rows.length > shown.length) html += '<div class="morewrap"><button class="btn sm" id="moreM">再看 ' + Math.min(40, rows.length - shown.length) + ' 款</button></div>';

      page.innerHTML = html;
      bindSeg('.seg', 'data-rm', 'rankMode');
      page.querySelector('.mseg').onclick = function (e) { var b = e.target.closest('[data-scp]'); if (b) { st.mediaScope = b.getAttribute('data-scp'); st.rankLimit = 60; render(); } };
      $('#mediaQ').addEventListener('input', debounce(function (e) { st.mediaQ = e.target.value; st.rankLimit = 60; var pos = e.target.selectionStart; render(); var q = $('#mediaQ'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250));
      bindClr(page, 'mediaQ', function () { st.mediaQ = ''; }, render, function () { st.rankLimit = 60; });
      if ($('#moreM')) $('#moreM').onclick = function () { st.rankLimit += 40; render(); };
      var lst = page.querySelector('.list');
      if (lst) lst.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mi]'); if (!b) return;
        var r = shown[+b.getAttribute('data-mi')];
        openSheet('<h2 class="h2lg">' + logo(r.creator, 'lg2') + '<span>' + esc(r.name) + '</span></h2>' +
          '<div class="kv"><span>Arena Elo</span><span>' + r.elo + '</span></div>' +
          '<div class="kv"><span>厂商</span><span>' + esc(r.creator || '—') + '</span></div>' +
          '<div class="kv"><span>参考价</span><span>' + (r.price != null ? C.money(r.price) + r.priceUnit : '—') + '</span></div>' +
          '<div class="kv"><span>发布日期</span><span>' + esc(r.rd || '—') + '</span></div>' +
          (r.appearances ? '<div class="kv"><span>盲测投票数</span><span>' + r.appearances + '</span></div>' : '') +
          '<div class="btns"><button class="btn" id="cl">关闭</button></div>', function () { $('#cl').onclick = closeSheet; });
      });
    }

    // ---------- 3) 价格子视图：按模型跨平台比价 ----------
    function viewPriceCompare(topSeg) {
      var list = getCmpIndex();
      if (!list.length) { page.innerHTML = topSeg + '<div class="empty"><b>正在整理比价数据</b></div>'; bindSeg('.seg', 'data-pm', 'priceMode'); return; }
      var rows = list;
      if (st.cmpQ) {
        var q = st.cmpQ.toLowerCase();
        rows = rows.filter(function (g) { return g.name.toLowerCase().indexOf(q) >= 0 || g.key.indexOf(q.replace(/[^a-z0-9]/g, '')) >= 0; });
      }
      var shown = rows.slice(0, st.rankLimit || 50);
      var html = topSeg +
        '<div class="tools">' + searchBox('cmpQ', st.cmpQ, '搜模型名比全网价（如 Claude、DeepSeek、GLM）') + '</div>' +
        '<div class="hint"><span>' + rows.length + ' 款可跨平台比价模型</span><span>点击看所有平台报价</span></div>';
      html += shown.length ? '<div class="list">' + shown.map(function (g, i) {
        return '<button class="row" data-gi="' + i + '"><div class="mid"><div class="nm"><span class="nt">' + esc(g.name) + '</span></div>' +
          '<div class="sub">' + g.offers.length + ' 家在售 · 最低 ' + esc(g.best.pname) + (g.savePct >= 15 ? ' · 最高省 ' + g.savePct + '%' : '') + '</div></div>' +
          '<div class="pn">' + C.money(g.best.i) + '<small>最低入</small></div>' +
          '<div class="pn">' + C.money(g.best.o) + '<small>输出</small></div></button>';
      }).join('') + '</div>' : '<div class="empty"><b>没找到这个模型</b></div>';
      if (rows.length > shown.length) html += '<div class="morewrap"><button class="btn sm" id="moreG">再看 ' + Math.min(40, rows.length - shown.length) + ' 款</button></div>';

      page.innerHTML = html;
      bindSeg('.seg', 'data-pm', 'priceMode');
      $('#cmpQ').addEventListener('input', debounce(function (e) { st.cmpQ = e.target.value; st.rankLimit = 50; var pos = e.target.selectionStart; render(); var q = $('#cmpQ'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250));
      bindClr(page, 'cmpQ', function () { st.cmpQ = ''; }, render, function () { st.rankLimit = 50; });
      if ($('#moreG')) $('#moreG').onclick = function () { st.rankLimit += 40; render(); };
      var lst = page.querySelector('.list');
      if (lst) lst.addEventListener('click', function (e) {
        var b = e.target.closest('[data-gi]'); if (!b) return;
        var g = shown[+b.getAttribute('data-gi')];
        openSheet('<h2>' + esc(g.name) + '</h2><p class="mut" style="margin:-4px 0 10px">共 ' + g.offers.length + ' 家平台在售，按混合价（' + C.settings.blend + ':1）从低到高排</p>' +
          '<div class="list boxed" style="margin:0">' + g.offers.slice(0, 30).map(function (o, idx) {
            return '<div class="row" style="min-height:50px;padding:9px 12px"><div class="mid"><div class="nm"><span class="nt">' + esc(o.pname) +
              (o.pin ? ' <span class="tag good">常用</span>' : '') + (idx === 0 && o.i > 0 ? ' <span class="tag zhu">最低</span>' : '') + '</span></div>' +
              '<div class="sub">' + esc(o.id) + (o.cr != null ? ' · 缓存读 ' + C.money(o.cr) : '') + '</div></div>' +
              '<div class="pn">' + C.money(o.i) + '<small>输入</small></div><div class="pn">' + C.money(o.o) + '<small>输出</small></div></div>';
          }).join('') + '</div><div class="btns"><button class="btn" id="cl">关闭</button></div>', function () { $('#cl').onclick = closeSheet; });
      });
    }

    // ---------- 4) 价格子视图：od / cc / oc 及主流订阅套餐 ----------
    function addPlanSheet() {
      openSheet('<h2>添加自定义套餐</h2>' +
        '<label class="fld"><span>平台名</span><input id="pg" placeholder="例如：某中转站包月"></label>' +
        '<label class="fld"><span>档位名</span><input id="pn" placeholder="例如：Pro 月卡"></label>' +
        '<label class="fld"><span>月费（美元 $）</span><input id="pu" type="number" step="0.1" placeholder="10"></label>' +
        '<label class="fld"><span>包含额度（美元 $，可选）</span><input id="pc" type="number" step="1" placeholder="100"></label>' +
        '<label class="fld"><span>包含模型说明</span><input id="pm" placeholder="例如：DeepSeek / Claude / GPT"></label>' +
        '<label class="fld"><span>支持 API 调用</span><select id="pa"><option value="1">支持 API</option><option value="0">仅客户端/网页</option></select></label>' +
        '<div class="btns"><button class="btn main" id="ps">保存套餐</button><button class="btn" id="cl">取消</button></div>', function () {
        $('#cl').onclick = closeSheet;
        $('#ps').onclick = function () {
          try {
            P.add({ grp: $('#pg').value, name: $('#pn').value, usd: $('#pu').value, credit: $('#pc').value, models: $('#pm').value, api: $('#pa').value === '1' });
            closeSheet(); toast('已添加套餐'); render();
          } catch (e) { toast(e.message); }
        };
      });
    }

    function viewPlans(topSeg) {
      var all = P.all();
      var grpList = ['全部', 'Open Design', 'Command Code', 'OpenCode', '其他'];
      var curG = st.planGrp || '全部';
      var shown = all.filter(function (x) {
        if (curG === '全部') return true;
        if (curG === '其他') return x.grp !== 'Open Design' && x.grp !== 'Command Code' && x.grp !== 'OpenCode';
        return x.grp === curG;
      });
      var html = topSeg +
        '<div class="chips">' + grpList.map(function (g) {
          return '<button class="chip' + (g === curG ? ' on' : '') + '" data-pg="' + esc(g) + '">' + esc(g) + '</button>';
        }).join('') + '</div>' +
        '<div class="hint"><span>od / cc / oc 及主流包月对照（价格随币种换算）</span><span>可自行添加</span></div>';

      shown.forEach(function (x) {
        var mult = x.credit && x.usd > 0 ? (x.credit / x.usd).toFixed(1) + '× 额度杠杆' : '';
        html += '<div class="card"><div class="acct-hd"><div><h3>' + esc(x.grp) + ' · ' + esc(x.name) + '</h3>' +
          '<p>' + (x.firstUsd ? '首月 ' + C.money(x.firstUsd, 0) + '，续费 ' : '') + '<b style="color:var(--ink)">' + C.money(x.usd, 0) + '/月</b>' +
          (x.credit ? ' · 含 ' + C.money(x.credit, 0) + ' 额度' : '') + '</p></div>' +
          '<span class="tag ' + (x.api ? 'good' : '') + '">' + (x.api ? '支持 API' : '仅客户端') + '</span></div>' +
          (mult ? '<div style="margin:6px 0 2px"><span class="tag zhu">' + mult + '</span></div>' : '') +
          (x.models ? '<p style="margin-top:6px;color:var(--ink)">' + esc(x.models) + '</p>' : '') +
          (x.note ? '<p class="mut">' + esc(x.note) + '</p>' : '') +
          '<div class="btns" style="margin-top:8px">' +
          (x.url ? '<button class="btn sm" data-purl="' + esc(x.url) + '">官网定价</button>' : '') +
          (x.custom ? '<button class="btn sm" data-pdel="' + esc(x.id) + '">删除</button>' : '') +
          '</div></div>';
      });
      html += '<div class="pad"><button class="btn main" id="addPlan">＋ 添加自定义套餐</button></div>';

      page.innerHTML = html;
      bindSeg('.seg', 'data-pm', 'priceMode');
      page.querySelector('.chips').addEventListener('click', function (e) { var b = e.target.closest('[data-pg]'); if (b) { st.planGrp = b.getAttribute('data-pg'); render(); } });
      page.onclick = function (e) {
        var u = e.target.getAttribute('data-purl'), d = e.target.getAttribute('data-pdel');
        if (u) w.Native.openUrl(u);
        if (d) confirmSheet('删除这条自定义套餐？', '删除', function () { P.remove(d); render(); toast('已删除'); });
        if (e.target.id === 'addPlan') addPlanSheet();
      };
    }

    // ---------- 5) 性价比子视图：预算选型 / 算账向导 ----------
    function viewCalc(topSeg) {
      var aa = C.sources.aa.data;
      if (!aa) { page.innerHTML = topSeg + '<div class="empty"><b>正在加载榜单数据</b></div>'; bindSeg('.seg', 'data-pm', 'priceMode'); return; }
      var cs = st.calc || { scene: 'code', budgetUsd: 10, inM: 30, outM: 3, cache: 65 };
      st.calc = cs;
      var cny = C.settings.currency === 'CNY', fx = C.fxRate();
      var res = K.recommend(aa, { budgetUsd: cs.budgetUsd, inM: cs.inM, outM: cs.outM, cache: cs.cache / 100 });

      var html = topSeg +
        '<div class="chips">' + K.SCENES.map(function (sc) {
          return '<button class="chip' + (cs.scene === sc.id ? ' on' : '') + '" data-sc="' + sc.id + '">' + esc(sc.name) + '</button>';
        }).join('') + '</div>' +
        '<div class="card">' +
        '<div class="kv"><span>每月预算（' + (cny ? '人民币 ¥' : '美元 $') + '）</span>' +
        '<input id="cbud" type="number" step="1" class="inline-num" value="' + Math.round(cny ? cs.budgetUsd * fx : cs.budgetUsd) + '"></div>' +
        '<div class="kv"><span>月输入 / 输出（百万字）</span>' +
        '<span><input id="cin" type="number" step="1" class="inline-num sm" value="' + cs.inM + '"> / <input id="cout" type="number" step="0.5" class="inline-num sm" value="' + cs.outM + '"></span></div>' +
        '<div class="kv"><span>缓存命中率</span>' +
        '<select class="inline" id="ccache">' + [0, 25, 50, 65, 80].map(function (v) { return '<option value="' + v + '"' + (cs.cache === v ? ' selected' : '') + '>' + v + '%</option>'; }).join('') + '</select></div>' +
        '</div>';

      html += '<div class="sec">预算内最聪明的模型（按量直连）</div>';
      if (res.fit.length) {
        html += '<div class="list">' + res.fit.map(function (r, i) {
          var save = r.noCache > r.cost + 0.05 ? ' · 缓存省 ' + C.money(r.noCache - r.cost) : '';
          return '<button class="row" data-fi="' + i + '">' + seal(i + 1) +
            '<div class="mid"><div class="nm">' + logo(r.m.creatorName) + '<span class="nt">' + esc(r.m.releaseName || r.m.name) + '</span></div>' +
            '<div class="sub">智能 ' + fmtNum(r.ii, 1) + save + '</div></div>' +
            '<div class="val">' + C.money(r.cost) + '<small>预估/月</small></div></button>';
        }).join('') + '</div>';
      } else {
        html += '<div class="card"><p class="mut" style="margin:0">这个预算下按量直连较紧张，建议提高预算、调高缓存命中率，或看下方包月方案。</p></div>';
      }

      if (res.planTips.length) {
        html += '<div class="sec">同预算更值的包月方案</div><div class="list boxed">' + res.planTips.map(function (p) {
          return '<div class="row" style="min-height:54px"><div class="mid"><div class="nm"><span class="nt">' + esc(p.grp + ' · ' + p.name) + '</span></div>' +
            '<div class="sub">含约 ' + C.money(p.credit, 0) + ' 额度 · ' + (p.api ? '支持 API' : '仅客户端') + '</div></div>' +
            '<div class="val">' + C.money(p.usd, 0) + '<small>/月</small></div></div>';
        }).join('') + '</div>';
      }

      if (res.stretch.length) {
        html += '<div class="sec">加一点预算可升级</div><div class="list">' + res.stretch.map(function (r, i) {
          return '<button class="row" data-si="' + i + '"><div class="mid"><div class="nm">' + logo(r.m.creatorName) + '<span class="nt">' + esc(r.m.releaseName || r.m.name) + '</span></div>' +
            '<div class="sub">智能 ' + fmtNum(r.ii, 1) + '</div></div>' +
            '<div class="val">' + C.money(r.cost) + '<small>预估/月</small></div></button>';
        }).join('') + '</div>';
      }

      page.innerHTML = html;
      bindSeg('.seg', 'data-pm', 'priceMode');
      page.querySelector('.chips').addEventListener('click', function (e) {
        var b = e.target.closest('[data-sc]'); if (!b) return;
        var sc = K.SCENES.filter(function (x) { return x.id === b.getAttribute('data-sc'); })[0];
        if (sc) { cs.scene = sc.id; cs.inM = sc.inM; cs.outM = sc.outM; cs.cache = Math.round(sc.cache * 100); render(); }
      });
      var applyInp = debounce(function () {
        var b = parseFloat($('#cbud').value); if (isFinite(b) && b > 0) cs.budgetUsd = cny ? b / fx : b;
        var i1 = parseFloat($('#cin').value); if (isFinite(i1) && i1 > 0) cs.inM = i1;
        var o1 = parseFloat($('#cout').value); if (isFinite(o1) && o1 > 0) cs.outM = o1;
        render();
      }, 450);
      $('#cbud').oninput = applyInp; $('#cin').oninput = applyInp; $('#cout').oninput = applyInp;
      $('#ccache').onchange = function (e) { cs.cache = +e.target.value; render(); };
      page.addEventListener('click', function (e) {
        var fb = e.target.closest('[data-fi]'), sb = e.target.closest('[data-si]');
        if (fb) modelSheet(res.fit[+fb.getAttribute('data-fi')].m);
        if (sb) modelSheet(res.stretch[+sb.getAttribute('data-si')].m);
      });
    }

    return {
      segHtml: segHtml,
      bindSeg: bindSeg,
      viewProviders: viewProviders,
      viewMedia: viewMedia,
      viewPriceCompare: viewPriceCompare,
      viewPlans: viewPlans,
      viewCalc: viewCalc
    };
  };
})(window);
