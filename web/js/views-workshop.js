/* views-workshop.js — 插件工坊独立页：收录列表 / 已安装 两个分段，插件详情页，安装 / 更新 / 启用 / 删除。ES2019，面向 Chrome 91 WebView。
 * 数据来自 workshop.js（收录列表）与 mods.js（已安装）。更多页只保留入口卡片。
 */
(function (w) {
  'use strict';
  var C = w.Core, esc = C.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /** 收录项与已装项的关系：未装 / 已装 / 可更新 */
  function status(entry) {
    var m = w.Mods.get(entry.id);
    if (!m) return { k: 'none', label: '下载', cls: 'main' };
    if (w.Mods.cmpVersion(entry.version, m.version) > 0) return { k: 'update', label: '更新', cls: 'main' };
    return { k: 'ok', label: '已安装', cls: '' };
  }

  /** 插件是否处于启用状态：主题看 enabledId，效果看 effectId */
  function isActive(m) {
    if (!m) return false;
    return m.type === 'effect' ? w.Mods.effectId === m.id : w.Mods.enabledId === m.id;
  }
  /** 按类型开启（传 null 关闭）。主题与效果各自独立。 */
  function setActive(m, on) {
    if (!m) return;
    if (m.type === 'effect') w.Mods.enableEffect(on ? m.id : null);
    else w.Mods.enable(on ? m.id : null);
  }

  /** 工坊概况，供更多页入口卡片使用：已装数量与可更新数量。 */
  w.Workshop = w.Workshop || {};
  w.Workshop.summary = function () {
    var list = w.Workshop.cached ? w.Workshop.cached() : [];
    var updates = list.filter(function (e) { return status(e).k === 'update'; }).length;
    return { installed: w.Mods.list().length, listed: list.length, updates: updates };
  };

  w.registerWorkshopView = function (A) {
    var page = A.page, toast = A.toast, openSheet = A.openSheet, closeSheet = A.closeSheet;
    var confirmSheet = A.confirmSheet, render = A.render, go = A.go;
    var st = { seg: 'list', detail: null }; // detail: 收录项 id

    function entries() { return w.Workshop.cached ? w.Workshop.cached() : []; }
    function findEntry(id) { return entries().filter(function (e) { return e.id === id; })[0] || null; }

    // ---------- 动作 ----------
    function doInstall(entry, btn) {
      var before = status(entry).k; // 安装前记录：'none' | 'update' | 'ok'，安装后再算就不对了
      if (btn) { btn.disabled = true; btn.textContent = '下载中…'; }
      w.Workshop.install(entry).then(function (r) {
        if (!r.ok) { toast(r.error); render(); return; }
        var isUpdate = before === 'update';
        // 新装的插件自动启用；正在使用的插件更新后保持启用；其它已装插件的更新不改变当前选择
        var wasActive = isActive(w.Mods.get(r.mod.id));
        if (!isUpdate || wasActive) setActive(r.mod, true);
        toast((isUpdate ? '已更新到 ' : '已安装 ') + r.mod.version);
        render();
      });
    }

    function removeMod(id) {
      var m = w.Mods.get(id); if (!m) return;
      confirmSheet('删除「' + m.name + '」？', '删除', function () { w.Mods.remove(id); toast('已删除'); render(); });
    }

    // ---------- 列表 ----------
    function listView() {
      var list = entries();
      if (!list.length) {
        return '<div class="empty"><b>' + (w.Workshop.error ? '收录列表加载失败' : '还没有收录的插件') + '</b>' +
          (w.Workshop.error ? '<p>' + esc(w.Workshop.error) + '</p>' : '') + '</div>' +
          '<div class="btns" style="justify-content:center"><button class="btn sm" id="wsRef">刷新列表</button></div>';
      }
      return '<div class="list boxed">' + list.map(function (e) {
        var s = status(e);
        var btn = s.k === 'ok' ? '<span class="mut" style="font-size:12px">已安装</span>'
          : '<button class="btn sm ' + s.cls + '" data-dl="' + esc(e.id) + '">' + s.label + '</button>';
        return '<div class="row" data-detail="' + esc(e.id) + '" style="cursor:pointer">' +
          '<div class="mid"><div class="nm"><span class="nt">' + esc(e.name) + '</span> <span class="mut" style="font-size:12px">v' + esc(e.version) + (e.author ? ' · ' + esc(e.author) : '') + '</span></div>' +
          '<div class="sub">' + esc(e.description || '') + '</div></div>' + btn + '</div>';
      }).join('') + '</div><div class="btns" style="justify-content:center;margin-top:10px"><button class="btn sm" id="wsRef">刷新列表</button></div>';
    }

    function installedView() {
      var list = w.Mods.list();
      if (!list.length) return '<div class="empty"><b>还没有安装插件</b><p>在「收录」里下载，或粘贴 mod.json 导入。</p></div>';
      return '<div class="list boxed">' + list.map(function (m) {
        var active = isActive(m);
        return '<div class="row" data-detail="' + esc(m.id) + '" style="cursor:pointer">' +
          '<div class="mid"><div class="nm"><span class="nt">' + esc(m.name) + '</span> <span class="mut" style="font-size:12px">v' + esc(m.version) + '</span></div>' +
          '<div class="sub">' + esc(m.description || '') + '</div></div>' +
          (active ? '<span class="mut" style="font-size:12px;color:var(--dian)">使用中</span>' : '') + '</div>';
      }).join('') + '</div><div class="btns" style="justify-content:center;margin-top:10px"><button class="btn sm" id="wsImp">粘贴导入</button></div>';
    }

    // ---------- 详情 ----------
    function detailView(id) {
      var entry = findEntry(id), m = w.Mods.get(id);
      var info = entry || m; // 收录信息优先，否则用已装清单
      if (!info) return '<div class="empty"><b>找不到这个插件</b></div>';
      var s = entry ? status(entry) : { k: 'ok' };
      var on = isActive(m);
      var rows = '<div class="kv"><span>版本</span><span>' + esc(info.version) + (m && entry && s.k === 'update' ? ' <span class="mut" style="font-size:12px">（已装 ' + esc(m.version) + '）</span>' : '') + '</span></div>' +
        (info.author ? '<div class="kv"><span>作者</span><span>' + esc(info.author) + '</span></div>' : '') +
        '<div class="kv"><span>状态</span><span>' + (m ? (on ? '已安装 · 使用中' : '已安装') : '未安装') + '</span></div>';
      var btns = '';
      if (!m) btns += '<button class="btn main" id="dDl">下载安装</button>';
      if (m && s.k === 'update') btns += '<button class="btn main" id="dDl">更新到 ' + esc(entry.version) + '</button>';
      var offLabel = m && m.type === 'effect' ? '关闭效果' : '恢复默认配色';
      if (m && !on) btns += '<button class="btn" id="dOn">' + (m.type === 'effect' ? '开启效果' : '启用') + '</button>';
      if (m && on) btns += '<button class="btn" id="dOff">' + offLabel + '</button>';
      if (m) btns += '<button class="btn ghost" id="dRm">删除</button>';
      return '<div class="card"><h3>' + esc(info.name) + '</h3><p>' + esc(info.description || '暂无简介') + '</p>' + rows +
        '<div class="btns">' + btns + '</div></div>';
    }

    // ---------- 页面 ----------
    function viewWorkshop() {
      if (st.detail) {
        page.innerHTML = '<div style="padding:8px 16px"><button class="btn sm ghost" id="back">‹ 返回工坊</button></div>' + detailView(st.detail);
        bindDetail(st.detail);
        return;
      }
      page.innerHTML = '<div class="seg-wrap"><div class="seg"><button data-seg="list" class="' + (st.seg === 'list' ? 'on' : '') + '">收录</button>' +
        '<button data-seg="installed" class="' + (st.seg === 'installed' ? 'on' : '') + '">已安装</button></div></div>' +
        (st.seg === 'list' ? listView() : installedView()) + '<div style="height:24px"></div>';
      page.onclick = function (e) {
        var seg = e.target.closest('[data-seg]');
        if (seg) { st.seg = seg.getAttribute('data-seg'); render(); return; }
        var dl = e.target.closest('[data-dl]');
        if (dl) { var en = findEntry(dl.getAttribute('data-dl')); if (en) doInstall(en, dl); return; }
        if (e.target.closest('#wsRef')) {
          toast('正在刷新…');
          w.Workshop.refresh().then(function () { toast('列表已更新'); render(); }, function (err) { toast('刷新失败：' + (err.message || err)); render(); });
          return;
        }
        if (e.target.closest('#wsImp')) { importSheet(); return; }
        var row = e.target.closest('[data-detail]');
        if (row) { st.detail = row.getAttribute('data-detail'); render(); }
      };
      if (!w.Workshop.tried && !w.Workshop.loading) {
        w.Workshop.tried = true;
        w.Workshop.refresh().then(function () { render(); }, function () { render(); });
      }
    }

    function bindDetail(id) {
      var entry = findEntry(id);
      page.onclick = function (e) {
        if (e.target.closest('#back')) { st.detail = null; render(); return; }
        if (e.target.closest('#dDl') && entry) { doInstall(entry, e.target.closest('#dDl')); return; }
        var mm = w.Mods.get(id);
        if (e.target.closest('#dOn')) { setActive(mm, true); toast(mm.type === 'effect' ? '已开启效果' : '已启用'); render(); return; }
        if (e.target.closest('#dOff')) { setActive(mm, false); toast(mm.type === 'effect' ? '已关闭效果' : '已恢复默认配色'); render(); return; }
        if (e.target.closest('#dRm')) { removeMod(id); return; }
      };
    }

    function importSheet() {
      openSheet('<h2>粘贴导入</h2><p class="mut">粘贴插件的 mod.json 内容：</p>' +
        '<textarea id="wsTxt" rows="8" style="width:100%;box-sizing:border-box;font:12px monospace" placeholder="粘贴 mod.json 内容"></textarea>' +
        '<div class="btns"><button class="btn main" id="wsOk">导入并启用</button><button class="btn" id="cl">取消</button></div>', function () {
        $('#wsOk').onclick = function () {
          var r = w.Mods.install($('#wsTxt').value);
          if (!r.ok) { toast('导入失败：' + r.error); return; }
          setActive(r.mod, true); closeSheet(); toast('已导入并启用「' + r.mod.name + '」'); render();
        };
        $('#cl').onclick = closeSheet;
      });
    }

    return { view: viewWorkshop, reset: function () { st.detail = null; st.seg = 'list'; } };
  };
})(window);
