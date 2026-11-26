/* news.js — AI 快讯数据源（国内 CDN 镜像直读 news.json + 可选本机自定义 RSS 源）与快讯页渲染。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core, esc = C.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  var NS = {};

  NS.customFeeds = C.store.get('custom-rss.json', []);
  NS.saveFeeds = function () { C.store.set('custom-rss.json', NS.customFeeds); };

  function cleanText(s) {
    var t = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    for (var pass = 0; pass < 2; pass++) {
      t = t
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
        .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(+n); });
    }
    return t.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ').replace(/<[^>]*$/g, '').replace(/\s+/g, ' ').trim();
  }
  function decodeXml(s) { return cleanText(s); }
  function tagText(block, tag) {
    var m = block.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
    return m ? decodeXml(m[1]) : '';
  }
  function parseCustomRss(xml, feed) {
    var blocks = xml.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
    var out = [];
    for (var i = 0; i < blocks.length && out.length < 10; i++) {
      var b = blocks[i];
      var title = tagText(b, 'title');
      var atom = b.match(/<link[^>]+href=["']([^"']+)["']/i);
      var url = atom ? atom[1].replace(/&amp;/g, '&') : tagText(b, 'link');
      if (!title || !url) continue;
      var desc = (tagText(b, 'description') || tagText(b, 'summary')).slice(0, 180);
      var rd = tagText(b, 'pubDate') || tagText(b, 'published') || tagText(b, 'updated');
      out.push({
        id: 'rss_' + feed.id + '_' + i,
        cat: 'custom',
        src: feed.name || '自定义源',
        title: title.slice(0, 120),
        summary: desc,
        url: url,
        at: Date.parse(rd) || Date.now(),
        pin: false
      });
    }
    return out;
  }

  function fetchAllCustom() {
    if (!NS.customFeeds.length) return Promise.resolve([]);
    return Promise.all(NS.customFeeds.map(function (f) {
      return C.net(f.url, { timeoutMs: 12000, headers: { 'User-Agent': UA } }).then(function (r) {
        if (!r.status || r.status >= 400) return [];
        try { return parseCustomRss(r.body, f); } catch (e) { return []; }
      }).catch(function () { return []; });
    })).then(function (arrs) {
      var merged = [];
      arrs.forEach(function (a) { merged = merged.concat(a); });
      return merged;
    });
  }

  // 注册 news 数据源：优先走国内免梯 CDN 读仓库 web/seed/news.json（内置 snapshots 秒开）
  C.defSource({
    id: 'news', title: 'AI 快讯', ttlMin: 90,
    fetch: function () {
      var baseP = C.fetchMirrorSeed ? C.fetchMirrorSeed('news') : Promise.reject(new Error('无镜像'));
      return Promise.all([baseP.catch(function (e) { return { err: e }; }), fetchAllCustom()]).then(function (res) {
        var r0 = res[0], extra = res[1] || [];
        var baseItems = r0 && r0.data && Array.isArray(r0.data.items) ? r0.data.items : [];
        if (!baseItems.length && !extra.length) {
          throw (r0 && r0.err) || new Error('快讯获取失败');
        }
        var seen = {}, items = [];
        baseItems.concat(extra).forEach(function (x) {
          if (!x || !x.title || seen[x.url || x.id]) return;
          seen[x.url || x.id] = 1;
          items.push(x);
        });
        items.sort(function (a, b) {
          return (Number(!!b.pin) - Number(!!a.pin)) || (Number(!!b.urgent) - Number(!!a.urgent)) || ((b.at || 0) - (a.at || 0));
        });
        return {
          data: { items: items.slice(0, 100), meta: (r0 && r0.data && r0.data.meta) || {} },
          meta: (r0 && r0.meta) || { via: '国内镜像' }
        };
      });
    }
  });

  /** 把本机监测到的调价/上新记录转成快讯卡片条目，融合进「模型与调价」分类。 */
  function localPriceItems() {
    return (C.feed || []).slice(0, 25).map(function (x, i) {
      var title = x.k === 'aa-new' ? '新上榜：' + x.title + (x.ii != null ? '（智能 ' + (+x.ii).toFixed(1) + '）' : '')
        : x.k === 'price-new' ? '新上架：' + x.title
        : '调价：' + x.title;
      var summary = x.k === 'price-change'
        ? x.sub + ' · 输入 ' + C.money(x.i0) + ' → ' + C.money(x.i) + '，输出 ' + C.money(x.o0) + ' → ' + C.money(x.o)
        : x.k === 'price-new' ? x.sub + ' · ' + C.money(x.i) + ' / ' + C.money(x.o) : (x.sub || '');
      return { id: 'loc_' + i + '_' + x.t, cat: 'model', src: '本机监测', title: title, summary: summary, url: '', at: x.t || 0, pin: false, local: true };
    });
  }

  /** 榜单页顶部单行快讯头条条幅 HTML（置顶速报优先，否则显示最新一条；在「更多」里可关）。 */
  NS.bannerHtml = function () {
    if (C.settings.showNewsBar === false) return '';
    var s = C.sources.news;
    var items = (s && s.data && s.data.items) || [];
    var top = items[0];
    if (!top) {
      var loc = localPriceItems()[0];
      if (!loc) return '';
      top = loc;
    }
    var badge = top.pin ? '<span class="nbadge pin">速报</span>' : '<span class="nbadge">快讯</span>';
    return '<div class="pad" style="margin-bottom:6px"><button class="news-bar" id="openNews">' +
      badge + '<span class="ntxt">' + esc(cleanText(top.title)) + '</span><span class="nar">›</span></button></div>';
  };

  function catLabel(c) {
    return { pin: '置顶速报', model: '模型/调价', tool: '工具/平台', industry: '行业动态', custom: '自定义' }[c] || '资讯';
  }

  /** 注册独立的「AI 快讯」整页视图。 */
  NS.registerView = function (A) {
    var page = A.page, st = A.st, toast = A.toast, openSheet = A.openSheet, closeSheet = A.closeSheet, confirmSheet = A.confirmSheet, render = A.render;

    function customRssSheet() {
      var listHtml = NS.customFeeds.length
        ? '<div class="list boxed" style="margin:0 0 12px">' + NS.customFeeds.map(function (f) {
            return '<div class="kv" style="padding:8px 12px"><span>' + esc(f.name) + '</span><button class="btn sm" data-rdel="' + esc(f.id) + '">移除</button></div>';
          }).join('') + '</div>'
        : '<p class="mut" style="margin:0 0 12px">还没有添加自定义 RSS 源。</p>';
      openSheet('<h2>自定义 RSS 快讯源</h2>' + listHtml +
        '<label class="fld"><span>名称</span><input id="rnName" placeholder="例如：某 AI 博客"></label>' +
        '<label class="fld"><span>RSS / Atom 网址</span><input id="rnUrl" placeholder="https://example.com/feed.xml"></label>' +
        '<div class="btns"><button class="btn main" id="rnAdd">添加并刷新</button><button class="btn" id="cl">关闭</button></div>', function () {
        $('#cl').onclick = closeSheet;
        $('#sheet').onclick = function (e) {
          var id = e.target.getAttribute('data-rdel'); if (!id) return;
          NS.customFeeds = NS.customFeeds.filter(function (x) { return x.id !== id; });
          NS.saveFeeds(); closeSheet(); toast('已移除'); C.refresh('news', true);
        };
        $('#rnAdd').onclick = function () {
          var nm = $('#rnName').value.trim(), u = $('#rnUrl').value.trim();
          if (!/^https?:\/\//.test(u)) { toast('网址要以 http:// 或 https:// 开头'); return; }
          NS.customFeeds.push({ id: C.uid(), name: nm || u.replace(/^https?:\/\/([^/]+).*$/, '$1'), url: u });
          NS.saveFeeds(); closeSheet(); toast('已添加，正在抓取…');
          C.refresh('news', true).then(function () { render(); });
        };
      });
    }

    function viewNews() {
      var s = C.sources.news;
      var remote = (s && s.data && s.data.items) || [];
      var cat = st.newsCat || 'all';
      var locals = localPriceItems();
      var all = remote.concat(cat === 'model' ? locals : locals.slice(0, 2));
      all.sort(function (a, b) {
        return (Number(!!b.pin) - Number(!!a.pin)) || (Number(!!b.urgent) - Number(!!a.urgent)) || (Number(!!a.local) - Number(!!b.local)) || ((b.at || 0) - (a.at || 0));
      });
      var cats = [
        ['all', '全部'],
        ['pin', '置顶速报'],
        ['model', '模型与调价'],
        ['tool', '工具与平台'],
        ['industry', '行业快讯']
      ];
      if (NS.customFeeds.length) cats.push(['custom', '自定义源']);

      var rows = all.filter(function (x) {
        if (cat === 'all') return true;
        if (cat === 'pin') return !!x.pin;
        return x.cat === cat;
      });
      if (st.newsQ) {
        var q = st.newsQ.toLowerCase();
        rows = rows.filter(function (x) { return (x.title + ' ' + (x.summary || '') + ' ' + (x.src || '')).toLowerCase().indexOf(q) >= 0; });
      }
      var shown = rows.slice(0, st.rankLimit || 50);

      var html = '<div class="chips">' + cats.map(function (c) {
        return '<button class="chip' + (c[0] === cat ? ' on' : '') + '" data-nc="' + c[0] + '">' + esc(c[1]) + '</button>';
      }).join('') + '</div>' +
        '<div class="tools"><div class="sbox"><input class="search" id="newsQ" placeholder="搜索快讯关键词（如 GPT、调价、DeepSeek）" value="' + esc(st.newsQ || '') + '">' +
        (st.newsQ ? '<button class="sclr" data-clr="newsQ" aria-label="清空">×</button>' : '') + '</div>' +
        '<button class="tog" id="rssCfg">订阅源</button></div>' +
        '<div class="hint"><span>' + rows.length + ' 条快讯 · 每日自动轮换</span>' +
        '<button class="fmore" id="newsBack">返回榜单 ›</button></div>';

      if (!shown.length) {
        html += '<div class="empty"><b>' + (cat === 'pin' ? '暂时没有置顶速报' : '没有符合的快讯') + '</b>' +
          '<p>' + (cat === 'pin' ? '在 GitHub 仓库新建带「快讯」标签的 Issue，1 分钟内会自动推送到这里。' : '点右上角刷新或切换其他分类看看。') + '</p></div>';
      } else {
        html += '<div class="list">' + shown.map(function (x, i) {
          var ct = cleanText(x.title), cs = cleanText(x.summary);
          return '<button class="row news-row' + (x.pin ? ' is-pin' : '') + '" data-ni="' + i + '">' +
            '<div class="mid">' +
            '<div class="news-meta">' +
              '<span class="tag' + (x.pin ? ' zhu' : x.local ? ' good' : '') + '">' + esc(x.pin ? '置顶速报' : x.src || catLabel(x.cat)) + '</span>' +
              '<span class="news-time">' + (x.at ? C.ago(x.at) : '') + '</span>' +
            '</div>' +
            '<div class="news-title">' + esc(ct) + '</div>' +
            (cs ? '<div class="news-sum">' + esc(cs) + '</div>' : '') +
            '</div></button>';
        }).join('') + '</div>';
      }
      if (rows.length > shown.length) html += '<div class="morewrap"><button class="btn sm" id="moreN">再看 ' + Math.min(30, rows.length - shown.length) + ' 条</button></div>';

      page.innerHTML = html;
      page.querySelector('.chips').addEventListener('click', function (e) {
        var b = e.target.closest('[data-nc]'); if (!b) return;
        st.newsCat = b.getAttribute('data-nc'); st.rankLimit = 50; render();
      });
      $('#newsQ').addEventListener('input', A.debounce(function (e) {
        st.newsQ = e.target.value; st.rankLimit = 50;
        var pos = e.target.selectionStart; render();
        var q = $('#newsQ'); if (q) { q.focus(); q.setSelectionRange(pos, pos); }
      }, 250));
      var clr = page.querySelector('[data-clr="newsQ"]'); if (clr) clr.onclick = function () { st.newsQ = ''; render(); };
      $('#rssCfg').onclick = customRssSheet;
      $('#newsBack').onclick = function () { A.go('rank'); };
      if ($('#moreN')) $('#moreN').onclick = function () { st.rankLimit += 30; render(); };
      var lst = page.querySelector('.list');
      if (lst) lst.addEventListener('click', function (e) {
        var b = e.target.closest('[data-ni]'); if (!b) return;
        var x = shown[+b.getAttribute('data-ni')];
        var ct = cleanText(x.title), cs = cleanText(x.summary);
        openSheet('<h2>' + esc(ct) + '</h2>' +
          '<p class="mut" style="margin:-4px 0 10px;font-size:12.5px">' + esc(x.src || catLabel(x.cat)) + (x.at ? ' · ' + C.ago(x.at) : '') + '</p>' +
          '<p style="margin:0 0 14px;line-height:1.65;color:var(--ink)">' + esc(cs || '暂无更多摘要，点下方按钮阅读原文。') + '</p>' +
          '<div class="btns">' +
          (x.url ? '<button class="btn main" id="nOpen">阅读原文</button><button class="btn" id="nCopy">复制链接</button>' : '') +
          '<button class="btn" id="cl">关闭</button></div>', function () {
          if ($('#nOpen')) $('#nOpen').onclick = function () { w.Native.openUrl(x.url); };
          if ($('#nCopy')) $('#nCopy').onclick = function () { w.Native.copy(x.url); toast('已复制原文链接'); };
          $('#cl').onclick = closeSheet;
        });
      });
    }

    return viewNews;
  };

  w.News = NS;
})(window);
