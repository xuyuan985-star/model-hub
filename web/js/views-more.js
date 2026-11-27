/* views-more.js — 额度页、更多页、版本更新卡片、AA 官方接口卡片、赞赏页。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core, U = w.Usage, X = w.Extra, esc = C.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function sizeOf(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function fmtNum(v, d) { return v == null ? '—' : (+v).toFixed(d == null ? 1 : d); }

  function winRow(label, wobj) {
    if (!wobj || typeof wobj !== 'object' || !(wobj.cap > 0)) return '';
    var pct = Math.min(100, Math.round(100 * wobj.used / wobj.cap)), left = 100 - pct;
    var reset = wobj.resetAt ? (wobj.resetAt > 1e12 ? wobj.resetAt : wobj.resetAt * 1000) - Date.now() : 0;
    var rs = reset > 0 ? ' · ' + (reset > 864e5 ? Math.floor(reset / 864e5) + ' 天后重置'
      : reset > 36e5 ? Math.floor(reset / 36e5) + ' 小时后重置'
      : Math.max(1, Math.round(reset / 6e4)) + ' 分钟后重置') : '';
    return '<div class="kv"><span>' + label + '</span><span class="' + (left < 10 ? 'bad' : '') + '">剩余 ' + left + '%' + esc(rs) + '</span></div>';
  }
  function daysLeft(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return String(iso);
    var d = Math.ceil((t - Date.now()) / 864e5);
    return d > 0 ? '还剩 ' + d + ' 天' : '今天到期';
  }

  function feedRow(x) {
    var t = x.k === 'aa-new' ? '榜单新增：' + x.title + (x.ii != null ? '（智能 ' + fmtNum(x.ii) + '）' : '')
      : x.k === 'price-new' ? '新上架：' + x.title : '调价：' + x.title;
    var s = x.k === 'price-change'
      ? x.sub + ' · 输入 ' + C.money(x.i0) + ' → ' + C.money(x.i) + '，输出 ' + C.money(x.o0) + ' → ' + C.money(x.o)
      : x.k === 'price-new' ? x.sub + ' · ' + C.money(x.i) + ' / ' + C.money(x.o) : x.sub;
    return '<div class="row"><span class="fk k-' + esc(x.k) + '"></span><div class="mid"><div class="nm"><span class="nt">' + esc(t) + '</span></div><div class="sub">' + esc(s || '') + ' · ' + C.ago(x.t) + '</div></div></div>';
  }

  w.registerMoreViews = function (A) {
    var page = A.page, toast = A.toast, openSheet = A.openSheet, closeSheet = A.closeSheet;
    var confirmSheet = A.confirmSheet, render = A.render, go = A.go, pickDlg = A.pickDlg, openDlg = A.openDlg;
    var updateDlgFn = null;
    function setUpdateDlg(fn) { updateDlgFn = fn; }

    // 偏好设置：用居中小选择器代替原生下拉（v1.1.2）
    var PREFS = [
      { id: 'cur', name: '显示币种', opts: [['USD', '美元 $'], ['CNY', '人民币 ¥']], get: function () { return C.settings.currency || 'USD'; }, set: function (v) { C.saveSettings({ currency: v }); } },
      { id: 'th', name: '外观主题', opts: [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']], get: function () { return C.settings.theme || 'auto'; }, set: function (v) { C.saveSettings({ theme: v }); } },
      { id: 'bl', name: '混合价比例', opts: [['1', '1 : 1'], ['3', '3 : 1'], ['5', '5 : 1'], ['10', '10 : 1']], get: function () { return String(C.settings.blend || 3); }, set: function (v) { C.saveSettings({ blend: +v }); toast('已更新混合价比例'); } },
      { id: 'dd', name: '榜单档位', opts: [['1', '只留最高档'], ['0', '全部档位']], get: function () { return C.settings.aaDedupe ? '1' : '0'; }, set: function (v) { C.saveSettings({ aaDedupe: v === '1' }); toast('已更新'); } },
      { id: 'dr', name: '数据抓取线路', opts: [['auto', '直连（失败走国内镜像）', '默认，有梯子时更实时'], ['mirror', '仅国内镜像', '无梯推荐'], ['direct', '仅直连原站', '只走官方原站']], get: function () { return C.settings.dataRoute || 'auto'; }, set: function (v) { C.saveSettings({ dataRoute: v }); toast('已切换数据线路'); } }
    ];
    function prefLabel(p) { var cur = p.get(); var hit = p.opts.filter(function (o) { return String(o[0]) === String(cur); })[0]; return hit ? hit[1] : String(cur); }
    function prefRows() {
      return PREFS.map(function (p) {
        return '<div class="kv"><span>' + esc(p.name) + '</span><button class="sel" id="pf_' + p.id + '">' + esc(prefLabel(p)) + '</button></div>';
      }).join('');
    }

    // ================= 额度 =================
    function noUsageSheet(u) {
      openSheet('<h2>' + esc(u.name) + '</h2><p class="mut">' + esc(u.why) + '</p>' +
        '<div class="btns"><button class="btn main" id="go">打开控制台</button><button class="btn" id="cl">关闭</button></div>', function () {
        $('#go').onclick = function () { w.Native.openUrl(u.link); };
        $('#cl').onclick = closeSheet;
      });
    }

    function customSheet() {
      openSheet('<h2>添加其他平台</h2>' +
        '<label class="fld"><span>类型</span><select id="ck"><option value="newapi">中转站（One API / New API 一类）</option><option value="json">自定义 JSON 接口</option></select></label>' +
        '<label class="fld"><span>名称</span><input id="cn" placeholder="例如：我的中转站"></label>' +
        '<label class="fld"><span>网址</span><input id="cu" placeholder="https://xxx.com"></label><div id="cx"></div>' +
        '<div class="btns"><button class="btn main" id="cs">保存平台</button><button class="btn" id="cl">取消</button></div>', function () {
        function sync() {
          $('#cx').innerHTML = $('#ck').value === 'json'
            ? '<label class="fld"><span>查询路径</span><input id="cp" placeholder="/v1/user/balance"></label>' +
              '<label class="fld"><span>剩余额度路径</span><input id="cr" placeholder="data.balance"></label>' +
              '<label class="fld"><span>已用路径（可选）</span><input id="cd" placeholder="data.used"></label>' +
              '<label class="fld"><span>总额路径（可选）</span><input id="cm" placeholder="data.total"></label>' : '';
        }
        $('#ck').onchange = sync; sync(); $('#cl').onclick = closeSheet;
        $('#cs').onclick = function () {
          try {
            var p = U.fromForm({
              kind: $('#ck').value, name: $('#cn').value.trim(), baseUrl: $('#cu').value,
              path: $('#cp') && $('#cp').value, remainingPath: $('#cr') && $('#cr').value,
              usedPath: $('#cd') && $('#cd').value, limitPath: $('#cm') && $('#cm').value
            });
            U.custom.push(p); U.saveCustom(); closeSheet(); toast('已添加，现在可以填密钥了'); addKeySheet();
          } catch (e) { toast(e.message); }
        };
      });
    }

    function addKeySheet() {
      var opts = U.all().map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('');
      openSheet('<h2>添加密钥</h2>' +
        '<label class="fld"><span>平台</span><select id="kp">' + opts + '<option value="__new">＋ 添加其他平台…</option></select></label>' +
        '<div id="kb"></div>' +
        '<label class="fld"><span>密钥</span><input id="kk" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-..."></label>' +
        '<label class="fld"><span>备注（可选）</span><input id="kl" placeholder="我的主账号"></label>' +
        '<p class="mut" id="kn" style="font-size:12px;margin:0 0 4px"></p>' +
        '<div class="btns"><button class="btn main" id="ks">保存并查询</button><button class="btn" id="cl">取消</button></div>', function () {
        function sync() {
          var v = $('#kp').value; if (v === '__new') { closeSheet(); customSheet(); return; }
          var p = U.get(v); $('#kn').textContent = p.note || '';
          $('#kb').innerHTML = '<label class="fld"><span>网址</span><input id="ku" value="' + esc(p.baseUrl || '') + '" placeholder="https://你的平台网址"></label>';
        }
        $('#kp').onchange = sync; sync(); $('#cl').onclick = closeSheet;
        $('#ks').onclick = function () {
          try {
            var p = U.get($('#kp').value);
            var a = U.addAccount({ providerId: p.id, label: $('#kl').value.trim(), baseUrl: $('#ku').value.trim() }, $('#kk').value);
            closeSheet(); toast('已保存，正在查询…');
            U.refreshAccount(a.id).then(function (r) { render(); toast(r.ok ? '查询成功' : '查询失败：' + r.error); });
            render();
          } catch (e) { toast(e.message); }
        };
      });
    }

    var pingState = {}; // acctId -> {ok, ms, grade, error}

    function viewUsage() {
      var info = U.accounts, html = '';
      var alerts = w.Tools ? w.Tools.alerts() : [];
      if (alerts.length) {
        html += '<div class="alert-bar"><b>额度提醒：</b>' + alerts.map(function (x) { return esc(x.name) + ' ' + esc(x.msg); }).join('；') + '</div>';
      }
      if (!info.length) {
        html += '<div class="card"><div class="empty" style="padding:26px 12px 18px">' +
          '<b>还没有添加密钥</b>' +
          '<p>密钥仅存在本机硬件加密存储中，不上传、不备份。支持 OpenRouter、DeepSeek、硅基流动、Kimi、Command Code 及中转站。</p>' +
          '<div class="btns"><button class="btn main" id="add">添加密钥</button></div></div></div>';
      } else {
        info.forEach(function (a) {
          var p = U.get(a.providerId), r = U.results[a.id], f = r && r.ok ? r.fields : null;
          var unit = (r && r.unit) || (p && p.unit) || 'USD', sym = unit === 'CNY' ? '¥' : '$';
          var pg = pingState[a.id];
          function m(v) { return v == null ? '—' : sym + (+v).toFixed(v >= 100 ? 0 : 2); }
          html += '<div class="card"><div class="acct-hd"><div><h3>' + esc(a.label || (p ? p.name : '未知')) + '</h3><p>' + esc(p ? p.name : a.providerId) + '</p></div>' +
            '<span class="tag">' + esc(unit) + '</span></div>';
          if (f) {
            html += (f.remaining != null ? '<div class="big ' + (f.limit && f.remaining / f.limit < 0.1 ? 'bad' : 'good') + '">' + m(f.remaining) + '<small class="mut" style="font:400 12px var(--sans)"> 剩余</small></div>' : '') +
              (f.limit != null ? '<div class="kv"><span>总额度</span><span>' + m(f.limit) + '</span></div>' : '') +
              (f.used != null ? '<div class="kv"><span>已使用</span><span>' + m(f.used) + '</span></div>' : '') +
              (f.granted != null ? '<div class="kv"><span>赠送余额</span><span>' + m(f.granted) + '</span></div>' : '') +
              (f.topped != null ? '<div class="kv"><span>充值余额</span><span>' + m(f.topped) + '</span></div>' : '') +
              (f.free != null ? '<div class="kv"><span>免费额度</span><span>' + m(f.free) + '</span></div>' : '') +
              winRow('5 小时窗口', f.w5) + winRow('每周窗口', f.w7) +
              (f.periodEnd ? '<div class="kv"><span>本期结束</span><span>' + esc(daysLeft(f.periodEnd)) + '</span></div>' : '') +
              (f.plan != null ? '<div class="kv"><span>套餐</span><span>' + esc(f.plan) + (f.status ? '（' + esc(f.status) + '）' : '') + '</span></div>' : '') +
              '<div class="acct-meta">' + C.ago(r.at) + '查询' + (f.limit != null && f.limit > 1e6 ? ' · 额度极大，通常为不限额' : '') + '</div>';
          } else if (r) {
            html += '<p class="bad" style="margin-top:8px">' + esc(r.error) + '</p>';
          } else {
            html += '<p class="mut" style="margin-top:6px">尚未查询</p>';
          }
          if (pg) {
            html += '<div class="ping-tag">' + (pg.ok
              ? '<span class="tag good">延迟 ' + pg.ms + 'ms · ' + esc(pg.grade) + '</span>'
              : '<span class="tag zhu">' + esc(pg.error || '测速失败') + (pg.ms ? ' (' + pg.ms + 'ms)' : '') + '</span>') + '</div>';
          }
          html += '<div class="btns"><button class="btn sm main" data-q="' + a.id + '">查询额度</button>' +
            '<button class="btn sm" data-p="' + a.id + '">测速</button>' +
            '<button class="btn sm" data-d="' + a.id + '">删除</button></div></div>';
        });
        html += '<div class="pad"><div class="btns" style="margin-top:2px"><button class="btn main" id="add">添加密钥</button>' +
          (info.length > 1 ? '<button class="btn" id="all">全部查询</button>' : '') + '</div></div>';
      }
      html += '<div class="sec">以下平台需在官网控制台查看</div><div class="list boxed">' +
        U.unsupported.map(function (u) {
          return '<button class="un-row" data-u="' + esc(u.id) + '"><span>' + esc(u.name) + '</span><span class="ar">控制台 ›</span></button>';
        }).join('') + '</div>';
      page.innerHTML = html;
      page.onclick = function (e) {
        var q = e.target.getAttribute('data-q'), pBtn = e.target.getAttribute('data-p'), d = e.target.getAttribute('data-d'), un = e.target.closest('[data-u]');
        if (q) { e.target.textContent = '查询中…'; U.refreshAccount(q).then(function (r) { render(); toast(r.ok ? '已查询' : '查询失败'); }); }
        if (pBtn && w.Tools) {
          var acct = U.accounts.filter(function (x) { return x.id === pBtn; })[0];
          if (acct) {
            e.target.textContent = '测速中…';
            w.Tools.testLatency(acct).then(function (res) { pingState[pBtn] = res; render(); toast(res.ok ? '延迟 ' + res.ms + 'ms' : (res.error || '测速失败')); });
          }
        }
        if (d) confirmSheet('删除这个密钥？', '删除', function () { U.removeAccount(d); delete pingState[d]; render(); toast('已删除'); });
        if (e.target.id === 'add') addKeySheet();
        if (e.target.id === 'all') {
          U.accounts.reduce(function (p, a) { return p.then(function () { return U.refreshAccount(a.id); }); }, Promise.resolve())
            .then(function () { render(); toast('已全部查询'); });
        }
        if (un) { var u = U.unsupported.filter(function (x) { return x.id === un.getAttribute('data-u'); })[0]; if (u) noUsageSheet(u); }
      };
    }

    // ================= 更多 =================
    function mirrorSheet() {
      var list = (w.Update && w.Update.MIRRORS) || [];
      var cur = C.settings.updateMirror || 'auto';
      var custom = C.settings.customMirror || '';
      var html = '<h2>国内下载镜像与线路</h2>' +
        '<p class="mut" style="margin:-4px 0 10px">默认优先走中国境内可直接访问的加速镜像，无需梯子即可检查和下载更新，并自带 SHA-256 完整性校验。</p>' +
        '<label class="fld"><span>下载线路优先</span><select id="um">' +
        '<option value="auto"' + (cur === 'auto' ? ' selected' : '') + '>自动（国内加速镜像优先）</option>' +
        list.map(function (m) { return '<option value="' + esc(m.id) + '"' + (cur === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="fld"><span>自定义镜像前缀（可选）</span><input id="ucm" value="' + esc(custom) + '" placeholder="例如：https://你的代理域名/"></label>' +
        '<div class="sec" style="padding:4px 0 6px">线路连通测速</div><div id="mTest"><p class="mut">点下方按钮一键测试当前网络下各镜像的耗时</p></div>' +
        '<div class="btns"><button class="btn main" id="umSave">保存线路</button><button class="btn" id="umPing">测速</button><button class="btn" id="cl">关闭</button></div>';
      openSheet(html, function () {
        $('#cl').onclick = closeSheet;
        $('#umSave').onclick = function () {
          C.saveSettings({ updateMirror: $('#um').value, customMirror: $('#ucm').value.trim() });
          closeSheet(); upCard(); toast('已保存下载线路');
        };
        $('#umPing').onclick = function () {
          if (!w.Insights) return;
          $('#mTest').innerHTML = '<p class="mut">正在并发测速…</p>';
          var draw = function (rows) {
            rows.sort(function (a, b) { return (b.ok - a.ok) || (a.ms - b.ms); });
            var box = $('#mTest'); if (!box) return;
            box.innerHTML = rows.map(function (r) {
              return '<button class="m-row" data-pick="' + esc(r.id) + '"><span class="mn">' + esc(r.name) + '</span>' +
                '<span class="ms ' + (r.ok ? 'good' : 'bad') + '">' + (r.ok ? r.ms + ' ms' : esc(r.error || '不可用')) + '</span></button>';
            }).join('');
            box.onclick = function (e) {
              var b = e.target.closest('[data-pick]'); if (!b) return;
              $('#um').value = b.getAttribute('data-pick');
              toast('已选中该线路，点「保存线路」生效');
            };
          };
          w.Insights.testMirrors(draw).then(draw);
        };
      });
    }

    function doDownload(asset) {
      w.Update.start();
    }

    function upCard() {
      var el = $('#upcard'); if (!el) return;
      var Up = w.Update, v = Up.current(), l = Up.latest, d = Up.dl;
      var pref = C.settings.updateMirror || 'auto';
      var prefName = pref === 'auto' ? '国内加速自动' : ((Up.MIRRORS || []).filter(function (m) { return m.id === pref; })[0] || { name: pref }).name;
      var statusTag = Up.checking ? '<span class="tag">检查中…</span>'
        : l && l.newer ? '<span class="tag zhu">有新版 ' + esc(l.tag) + '</span>'
        : l ? '<span class="tag good">已是最新</span>' : '';
      var h = '<div class="kv"><span>当前版本</span><span>' + esc(v) + (statusTag ? ' ' + statusTag : '') + '</span></div>' +
        '<div class="kv"><span>更新线路</span><span>' + esc(prefName) + (l && l.via ? ' · ' + esc(l.via) : '') + '</span></div>';
      if (!Up.checking && !l && Up.error) h += '<p class="mut" style="margin-top:6px">' + esc(Up.error.message) + '</p>';
      if (d) {
        var pct = Math.max(0, Math.min(100, d.pct || 0));
        h += '<div class="ptrack"><i class="pfill" style="width:' + pct + '%"></i></div>' +
          '<p class="dlmsg">' + (pct >= 100 ? '下载与校验完成，正在打开安装' : pct + '%' + (d.total ? ' · ' + sizeOf(d.total) : '') + (d.via ? ' · ' + esc(d.via) : '')) + '</p>';
      }
      h += '<div class="btns">' +
        (l && l.newer
          ? '<button class="btn sm main" id="dl"' + (d ? ' disabled' : '') + '>' + (d ? '下载中…' : '一键更新' + (l.apk ? '（' + sizeOf(l.apk.size) + '）' : '')) + '</button>'
          : '<button class="btn sm" id="ck">检查更新</button>') +
        '<button class="btn sm" id="mir">选择线路</button>' +
        (l && l.newer && l.apk ? '<button class="btn sm" id="cpUrl">复制链接</button>' : '') +
        (l && l.newer && l.notes ? '<button class="btn sm" id="rn">更新说明</button>' : '') +
        '</div>';
      el.innerHTML = h;
      if ($('#ck')) $('#ck').onclick = function () { toast('正在检查…'); Up.check().then(function (r) { upCard(); toast(r ? (r.newer ? '发现新版本 ' + r.tag : '已是最新') : '检查失败'); }); };
      if ($('#mir')) $('#mir').onclick = mirrorSheet;
      if ($('#cpUrl')) $('#cpUrl').onclick = function () {
        var u = Up.copyUrl(l.apk);
        if (u) { w.Native.copy(u); toast('已复制当前镜像下载地址'); }
      };
      if ($('#rn')) $('#rn').onclick = function () {
        openSheet('<h2>更新说明 ' + esc(l.tag) + '</h2>' + X.notesHtml(l.notes) +
          '<div class="btns"><button class="btn" id="pg2">在浏览器打开</button><button class="btn" id="cl">关闭</button></div>', function () {
          $('#pg2').onclick = function () { w.Native.openUrl(l.page); };
          $('#cl').onclick = closeSheet;
        });
      };
      if ($('#dl')) $('#dl').onclick = function () { Up.start(); };
    }

    function aaCard() {
      var el = $('#aacard'); if (!el) return;
      var api = C.settings.aaMode === 'api', has = w.Native.hasSecret(w.AaApi.SECRET), s = C.sources.aa, rate = s.meta && s.meta.rate;
      var h = '<div class="kv"><span>AA 数据源</span><span>' + (api ? '官方接口' : '公开页面') + '</span></div>';
      if (api && rate && rate.remaining != null) h += '<div class="kv"><span>今日剩余请求</span><span>' + rate.remaining + ' / ' + (rate.limit || 100) + '</span></div>';
      if (api && s.error) h += '<p class="bad" style="margin-top:6px">' + esc(s.error.message) + '</p>';
      h += '<div class="btns"><button class="btn sm main" id="aak">' + (has ? '更换密钥' : '填官方密钥') + '</button>' +
        (has ? '<button class="btn sm" id="aam">' + (api ? '改用公开页面' : '改用官方接口') + '</button>' : '') + '</div>';
      el.innerHTML = h;
      $('#aak').onclick = function () {
        openSheet('<h2>AA 官方密钥</h2><label class="fld"><span>密钥</span><input id="aav" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="免费，每天 100 次请求"></label>' +
          '<div class="btns"><button class="btn main" id="aas">保存并使用</button><button class="btn" id="aag">去获取密钥</button><button class="btn" id="cl">取消</button></div>', function () {
          $('#aag').onclick = function () { w.Native.openUrl(w.AaApi.KEY_PAGE); };
          $('#cl').onclick = closeSheet;
          $('#aas').onclick = function () {
            var v = $('#aav').value.trim(); if (!v) { toast('请粘贴密钥'); return; }
            if (!w.Native.setSecret(w.AaApi.SECRET, v)) { toast('密钥未能保存到安全存储'); return; }
            var prev = C.settings.aaMode; C.settings.aaMode = 'api'; C.saveSettings(); closeSheet(); toast('正在验证…');
            C.refresh('aa', true).then(function (ok) {
              if (ok) toast('已切换到官方接口');
              else { C.settings.aaMode = prev; C.saveSettings(); toast(s.error ? s.error.message : '验证失败'); w.Native.deleteSecret(w.AaApi.SECRET); }
              render();
            });
          };
        });
      };
      if ($('#aam')) $('#aam').onclick = function () {
        C.settings.aaMode = api ? 'scrape' : 'api'; C.saveSettings(); toast('正在刷新…');
        C.refresh('aa', true).then(function (ok) {
          if (!ok) { C.settings.aaMode = api ? 'api' : 'scrape'; C.saveSettings(); toast(s.error ? s.error.message : '刷新失败'); }
          else toast('已切换');
          render();
        });
      };
    }

    function openFeedSheet(feed) {
      openSheet('<h2>全部变动（' + feed.length + '）</h2><div class="list" style="margin:0 -16px">' +
        feed.map(feedRow).join('') + '</div><div class="btns"><button class="btn" id="cl">关闭</button></div>', function () {
        $('#cl').onclick = closeSheet;
      });
    }

    function viewMore() {
      var feed = C.feed || [];
      var html = '<div class="sec" style="padding-top:6px">偏好设置</div><div class="card">' +
        prefRows() + '</div>' +
        '<div class="sec">版本与数据源</div><div class="card" id="upcard"></div><div class="card" id="aacard"></div>';
      // 有新版时给一个醒目的弹窗入口，免得用户只在「更多」里看到小红点
      if (w.Update && w.Update.latest && w.Update.latest.newer) {
        html = html.replace('<div class="sec">版本与数据源</div>',
          '<div class="fhead"><span>版本与数据源</span><button class="fmore" id="upNow">发现新版本 ' + esc(w.Update.latest.tag) + '，一键更新 ›</button></div>');
      }

      // 变动记录默认只放 3 条紧凑预览，点「全部」进弹层看，也可直达 AI 快讯页
      html += '<div class="fhead"><span>最近变动与快讯</span><span>' +
        '<button class="fmore" id="goNews" style="margin-right:12px">AI 快讯 ›</button>' +
        (feed.length ? '<button class="fmore" id="fmore">调价 ' + feed.length + ' ›</button>' : '') + '</span></div>';
      html += feed.length
        ? '<div class="list boxed">' + feed.slice(0, 3).map(feedRow).join('') + '</div>'
        : '<div class="card"><p class="mut" style="margin:0">暂无变动。后续刷新若发现新模型或调价，会自动记在这里。</p></div>';

        html += '<div class="sec">插件工坊</div><div class="card" id="modcard"></div>';

      html += '<div class="sec">存储与备份</div><div class="card">' +
        '<div class="kv"><span>低余额提醒阈值（美元 / 人民币）</span><span><input id="au" type="number" class="inline-num sm" value="' + (C.settings.alertUsd != null ? C.settings.alertUsd : 2) + '"> / <input id="ac" type="number" class="inline-num sm" value="' + (C.settings.alertCny != null ? C.settings.alertCny : 10) + '"></span></div>' +
        '<div class="kv"><span>本地缓存占用</span><span>' + (w.Native.dataSize() / 1048576).toFixed(1) + ' MB</span></div>' +
        '<div class="btns"><button class="btn sm" id="rf">刷新全部数据</button><button class="btn sm" id="cfg">导出 / 导入配置</button><button class="btn sm" id="cc">清空缓存和密钥</button></div></div>' +
        '<div class="thankswrap"><button id="thx" class="btn sm ghost">觉得好用？请作者喝杯茶</button></div>';

      page.innerHTML = html;
      PREFS.forEach(function (p) {
        var b = $('#pf_' + p.id); if (!b) return;
        b.onclick = function () { pickDlg(p.name, p.opts, p.get(), function (v) { p.set(v); render(); }); };
      });
      upCard(); aaCard();
      if ($('#goNews')) $('#goNews').onclick = function () { go('news'); };
      if ($('#upNow')) $('#upNow').onclick = function () { if (updateDlgFn) updateDlgFn(); };
      if ($('#fmore')) $('#fmore').onclick = function () { openFeedSheet(feed); };
      $('#au').onchange = function (e) { C.saveSettings({ alertUsd: Math.max(0, +e.target.value || 0) }); toast('已保存提醒阈值'); };
      $('#ac').onchange = function (e) { C.saveSettings({ alertCny: Math.max(0, +e.target.value || 0) }); toast('已保存提醒阈值'); };
      $('#rf').onclick = function () { toast('正在刷新…'); C.refreshAll(true).then(function (r) { toast(r.every(Boolean) ? '已刷新' : '部分数据未刷新成功'); render(); }); };
      $('#cfg').onclick = function () {
        if (!w.Tools) return;
        var exported = w.Tools.exportConfig();
        openSheet('<h2>配置导出 / 导入</h2><p class="mut" style="margin:-4px 0 8px">包含自选模型、置顶平台、自定义额度接口与自定义套餐；不含任何 API 密钥。</p>' +
          '<textarea class="cfg-box" id="cfgTxt">' + esc(exported) + '</textarea>' +
          '<div class="btns"><button class="btn main" id="cfgCp">复制配置</button><button class="btn" id="cfgIm">按文本框内容导入</button><button class="btn" id="cl">关闭</button></div>', function () {
          $('#cfgCp').onclick = function () { w.Native.copy($('#cfgTxt').value); toast('已复制到剪贴板'); };
          $('#cfgIm').onclick = function () {
            try { w.Tools.importConfig($('#cfgTxt').value); closeSheet(); render(); toast('配置已导入'); }
            catch (e) { toast(e.message); }
          };
          $('#cl').onclick = closeSheet;
        });
      };
      $('#cc').onclick = function () { confirmSheet('清空所有缓存和密钥？', '清空', function () { w.Native.clearData(); toast('已清空，请重新打开应用'); }); };
      $('#thx').onclick = function () { go('thanks'); };
      modCard();
      // 首次进入「更多」才自动拉一次列表；失败不自动重试（避免 render 循环），用户可点「刷新列表」
      if (w.Workshop && !w.Workshop.loading && !w.Workshop.tried) { w.Workshop.tried = true; w.Workshop.refresh().then(function () { render(); }, function () { render(); }); }
    }

    // ---------- 插件卡片：列出、启用/停用、导入、删除 ----------
    function modCard() {
      var el = $('#modcard'); if (!el || !w.Mods) return;
      var list = w.Mods.list(), on = w.Mods.enabledId;
      var rows = list.length ? list.map(function (m) {
        var active = m.id === on;
        return '<div class="kv"><span>' + esc(m.name) + ' <span class="mut" style="font-size:12px">v' + esc(m.version) + (m.author ? ' · ' + esc(m.author) : '') + '</span></span>' +
          '<span><button class="btn sm' + (active ? ' main' : '') + '" data-en="' + esc(m.id) + '">' + (active ? '使用中' : '启用') + '</button> ' +
          '<button class="btn sm ghost" data-rm="' + esc(m.id) + '">删除</button></span></div>' +
          (m.description ? '<p class="mut" style="margin:0 0 8px;font-size:12px">' + esc(m.description) + '</p>' : '');
      }).join('') : '<p class="mut" style="margin:0 0 8px">还没有安装插件。插件是一份 JSON 清单，只能换颜色，不能联网或读取密钥。</p>';
      el.innerHTML = '<div class="sec">收录插件</div>' + workshopHtml() +
        '<div class="btns"><button class="btn sm" id="wsRef">刷新列表</button></div>' +
        '<div class="sec">已安装</div>' + rows +
        '<div class="btns"><button class="btn sm" id="modImp">粘贴导入</button>' +
        (on ? '<button class="btn sm ghost" id="modOff">恢复默认配色</button>' : '') + '</div>';
      [].forEach.call(el.querySelectorAll('[data-dl]'), function (b) {
        b.onclick = function () {
          var entry = (w.Workshop.cached() || []).filter(function (x) { return x.id === b.getAttribute('data-dl'); })[0];
          if (!entry) return;
          b.textContent = '下载中…'; b.disabled = true;
          w.Workshop.install(entry).then(function (r) {
            if (!r.ok) { toast(r.error); render(); return; }
            w.Mods.enable(r.mod.id); toast('已安装并启用「' + r.mod.name + '」'); render();
          });
        };
      });
      if ($('#wsRef')) $('#wsRef').onclick = function () {
        toast('正在刷新…');
        w.Workshop.refresh().then(function () { toast('列表已更新'); render(); }, function (e) { toast('刷新失败：' + (e.message || e)); render(); });
      };
      [].forEach.call(el.querySelectorAll('[data-en]'), function (b) {
        b.onclick = function () { var id = b.getAttribute('data-en'); w.Mods.enable(id === on ? null : id); toast(id === on ? '已恢复默认配色' : '已启用'); render(); };
      });
      [].forEach.call(el.querySelectorAll('[data-rm]'), function (b) {
        b.onclick = function () { var id = b.getAttribute('data-rm'); confirmSheet('删除这个插件？', '删除', function () { w.Mods.remove(id); toast('已删除'); render(); }); };
      });
      $('#modImp').onclick = modImportSheet;
      if ($('#modOff')) $('#modOff').onclick = function () { w.Mods.enable(null); toast('已恢复默认配色'); render(); };
    }

    function workshopHtml() {
      var list = w.Workshop ? w.Workshop.cached() : [];
      var inst = {}; w.Mods.list().forEach(function (m) { inst[m.id] = m; });
      if (!list.length) return '<p class="mut" style="margin:0 0 8px">' + (w.Workshop && w.Workshop.error ? '收录列表加载失败：' + esc(w.Workshop.error) : '还没有收录的插件。') + '</p>';
      return list.map(function (p) {
        var have = inst[p.id];
        var btn = have ? (have.version === p.version ? '<span class="mut" style="font-size:12px">已安装</span>' : '<button class="btn sm" data-dl="' + esc(p.id) + '">更新</button>')
          : '<button class="btn sm main" data-dl="' + esc(p.id) + '">下载</button>';
        return '<div class="kv"><span>' + esc(p.name) + ' <span class="mut" style="font-size:12px">v' + esc(p.version) + (p.author ? ' · ' + esc(p.author) : '') + '</span></span>' + btn + '</div>' +
          (p.description ? '<p class="mut" style="margin:0 0 10px;font-size:12px">' + esc(p.description) + '</p>' : '');
      }).join('');
    }

    function modImportSheet() {
      openSheet('<h2>导入插件</h2><p class="mut">粘贴插件的 mod.json 内容：</p>' +
        '<textarea id="modTxt" rows="8" style="width:100%;box-sizing:border-box;font:12px monospace" placeholder="粘贴 mod.json 内容"></textarea>' +
        '<div class="btns"><button class="btn main" id="modOk">导入并启用</button><button class="btn" id="cl">取消</button></div>', function () {
        $('#modOk').onclick = function () {
          var r = w.Mods.install($('#modTxt').value);
          if (!r.ok) { toast('导入失败：' + r.error); return; }
          w.Mods.enable(r.mod.id); closeSheet(); toast('已导入并启用「' + r.mod.name + '」'); render();
        };
        $('#cl').onclick = closeSheet;
      });
    }

    function viewThanks() {
      page.innerHTML = '<div class="thanks-page">' +
        '<h2>谢谢你用这个小工具</h2>' +
        '<p>个人做的公益小工具，没有广告，不收费，也不会收集你的任何数据。如果帮到了你，欢迎随意赞赏，完全自愿。</p>' +
        '<img class="thanks-qr" src="assets/donate.png" alt="赞赏码">' +
        '<p class="thanks-tip">保存后在微信「扫一扫」点右上角相册图标选择即可</p>' +
        '<div class="btns" style="justify-content:center"><button class="btn main" id="sv">保存到相册</button><button class="btn" id="bk">返回</button></div></div>';
      $('#sv').onclick = function () { toast(w.Native.saveImage('web/assets/donate.png', '赞赏码.png') ? '已保存到相册（Pictures/模型行情）' : '保存失败，可以直接截屏'); };
      $('#bk').onclick = function () { go('more'); };
    }

    return { usage: viewUsage, more: viewMore, thanks: viewThanks, upCard: upCard, setUpdateDlg: setUpdateDlg };
  };
})(window);
