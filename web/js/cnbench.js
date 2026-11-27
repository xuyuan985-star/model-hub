/* cnbench.js — 中文大模型评测榜（非线智能 ReLE），数据走内置快照 + 国内镜像。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core, esc = C.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var NB = {};

  // 中国厂商（ReLE 用中文机构名）
  var CN_ORG = /阿里|腾讯|百度|字节|智谱|月之暗面|商汤|小米|阶跃|MiniMax|DeepSeek|讯飞|零一|华为|昆仑|面壁|百川|书生|上海AI|OpenBMB|InternLM/i;

  C.defSource({
    id: 'cn_bench', title: '中文评测', ttlMin: 720, lazy: true,
    fetch: function () {
      return C.fetchMirrorSeed('cn_bench').then(function (r) {
        if (!r || !r.data || !Array.isArray(r.data.rows) || r.data.rows.length < 20) throw new Error('中文评测数据异常');
        return r;
      }).catch(function (e) {
        // 兜底：读内置快照，保证页面永远有数据
        var seed = C.store.asset('web/seed/cn_bench.json');
        if (seed && seed.data && seed.data.rows && seed.data.rows.length) {
          return { data: seed.data, meta: { via: '内置数据' } };
        }
        throw e;
      });
    }
  });

  function orgLogo(org) {
    var map = { 'Anthropic': 'Anthropic', 'OpenAI': 'OpenAI', 'Google': 'Google', 'DeepSeek': 'DeepSeek', 'Meta': 'Meta', 'Mistral': 'Mistral', 'NVIDIA': 'NVIDIA', '微软': 'Microsoft' };
    var zh = { '阿里巴巴': 'Alibaba', '阿里': 'Alibaba', '月之暗面': 'Kimi', '智谱': 'Z AI', '腾讯': 'Tencent', '百度': 'Baidu', '字节': 'ByteDance Seed', '小米': 'Xiaomi', '商汤': 'SenseTime' };
    var key = map[org] || zh[org] || org;
    var f = w.LOGOS && w.LOGOS[key];
    if (!f) return '<i class="lg ph">' + esc(String(org || '?').slice(0, 1)) + '</i>';
    return '<i class="lg"><img src="assets/logos/' + f + '" alt="" loading="lazy"></i>';
  }

  var SORTS = [['total', '总分'], ['reason', '推理'], ['coding', '编程'], ['edu', '教育'], ['medical', '医疗'], ['finance', '金融'], ['legal', '法律'], ['instruct', '指令'], ['agent', 'Agent']];
  // 分数档位色：越高越红
  function grade(v) {
    if (v == null) return '';
    return v >= 85 ? 'g5' : v >= 75 ? 'g4' : v >= 65 ? 'g3' : v >= 55 ? 'g2' : 'g1';
  }

  NB.registerView = function (A) {
    var page = A.page, st = A.st, toast = A.toast, openSheet = A.openSheet, closeSheet = A.closeSheet;
    var render = A.render, debounce = A.debounce;

    function view() {
      var s = C.sources.cn_bench;
      var d = s && s.data;
      if (!d) {
        if (!s.refreshing && !s.error) C.refresh('cn_bench', false);
        page.innerHTML = '<div class="empty"><b>正在获取中文评测榜</b><p>首次打开会从国内镜像拉取，之后直接读本地快照。</p></div>';
        return;
      }
      var key = st.cnSort || 'total';
      var cnOnly = st.cnOnly;
      var rows = d.rows.slice().filter(function (r) { return r[key] != null; });
      if (cnOnly) rows = rows.filter(function (r) { return CN_ORG.test(r.org); });
      if (st.cnQ) {
        var q = st.cnQ.toLowerCase();
        rows = rows.filter(function (r) { return (r.name + ' ' + r.org).toLowerCase().indexOf(q) >= 0; });
      }
      rows.sort(function (a, b) { return (b[key] || 0) - (a[key] || 0); });
      var maxV = rows.length ? rows[0][key] : 100;
      var minV = rows.length ? Math.min.apply(null, rows.map(function (r) { return r[key] || 0; })) : 0;

      var html = '<div class="chips">' + SORTS.map(function (x) {
        return '<button class="chip' + (x[0] === key ? ' on' : '') + '" data-cn="' + x[0] + '">' + esc(x[1]) + '</button>';
      }).join('') + '</div>' +
        '<div class="tools"><div class="sbox"><input class="search" id="cnQ" placeholder="搜索模型或机构（如 Qwen、月之暗面）" value="' + esc(st.cnQ || '') + '">' +
        (st.cnQ ? '<button class="sclr" data-clr="cnQ" aria-label="清空">×</button>' : '') + '</div>' +
        '<button class="tog' + (cnOnly ? ' on' : '') + '" id="cnOnly">仅中国模型</button></div>' +
        '<div class="hint"><span>非线智能 ReLE · ' + rows.length + ' 个模型</span><span>百分制 · 越高越好</span></div>';

      if (!rows.length) {
        html += '<div class="empty"><b>没有符合条件的模型</b></div>';
      } else {
        html += '<div class="list">' + rows.map(function (r, i) {
          var v = r[key] == null ? 0 : r[key];
          var pct = Math.max(5, 100 * (v - Math.min(minV, 40)) / Math.max(1, maxV - Math.min(minV, 40)));
          return '<button class="row" data-ci="' + i + '">' + '<span class="seal' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
            '<div class="mid"><div class="nm">' + orgLogo(r.org) + '<span class="nt">' + esc(r.name) + '</span>' +
            (r.tag ? ' <span class="tag">' + esc(r.tag) + '</span>' : '') + '</div>' +
            '<div class="sub">' + esc(r.org) + (r.priceYuan != null ? ' · 输出 ' + r.priceYuan + ' 元/百万字' : '') + '</div>' +
            '<div class="bar-track"><div class="bar" style="width:' + pct.toFixed(1) + '%"></div></div></div>' +
            '<div class="val">' + v.toFixed(1) + '<small>' + esc((SORTS.filter(function (x) { return x[0] === key; })[0] || ['', '总分'])[1]) + '</small></div></button>';
        }).join('') + '</div>';
      }
      html += '<p class="foot">数据来自 <a href="#" id="cnSrc">非线智能 ReLE 中文评测</a> · 百分制准确率 · ' + C.ago((C.sources.cn_bench.fetchedAt) || Date.now()) + '更新</p>';
      page.innerHTML = html;

      page.querySelector('.chips').addEventListener('click', function (e) {
        var b = e.target.closest('[data-cn]'); if (!b) return;
        st.cnSort = b.getAttribute('data-cn'); render();
      });
      $('#cnQ').addEventListener('input', debounce(function (e) {
        st.cnQ = e.target.value; var pos = e.target.selectionStart; render();
        var q = $('#cnQ'); if (q) { q.focus(); q.setSelectionRange(pos, pos); }
      }, 250));
      var clr = page.querySelector('[data-clr="cnQ"]'); if (clr) clr.onclick = function () { st.cnQ = ''; render(); };
      $('#cnOnly').onclick = function () { st.cnOnly = !st.cnOnly; render(); };
      $('#cnSrc').onclick = function (e) { e.preventDefault(); w.Native.openUrl('https://github.com/jeinlee1991/chinese-llm-benchmark'); };
      var lst = page.querySelector('.list');
      if (lst) lst.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ci]'); if (!b) return;
        var r = rows[+b.getAttribute('data-ci')];
        var dimRows = d.dims.map(function (dm) {
          var v = r[dm.key];
          return '<div class="kv"><span>' + esc(dm.name) + '</span><span class="' + grade(v) + '">' + (v == null ? '—' : v.toFixed(1)) + '</span></div>';
        }).join('');
        openSheet('<h2 class="h2lg">' + orgLogo(r.org) + '<span>' + esc(r.name) + '</span></h2>' +
          '<p class="mut" style="margin:-4px 0 10px;font-size:12.5px">' + esc(r.org) + (r.priceYuan != null ? ' · 输出价 ' + r.priceYuan + ' 元/百万字' : '') + '</p>' +
          '<div class="kv"><span>ReLE 总分</span><span class="big" style="font-size:22px">' + r.total.toFixed(1) + '</span></div>' +
          '<div class="sec" style="padding-left:0">分项能力（百分制）</div>' + dimRows +
          '<div class="btns"><button class="btn" id="cl">关闭</button></div>', function () { $('#cl').onclick = closeSheet; });
      });
    }
    return view;
  };

  w.CnBench = NB;
})(window);
