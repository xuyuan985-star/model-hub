/* mods.js — 插件（Mod）系统 v1：主题类插件。纯 JSON 清单，不执行任何脚本，只能覆盖白名单内的颜色变量。ES2019，面向 Chrome 91 WebView。
 *
 * 清单格式（mod.json）：
 * {
 *   "id": "ocean-blue",            // 必填，小写字母/数字/连字符，1-40 位，全局唯一
 *   "name": "海蓝纸",               // 必填，显示名，<= 30 字
 *   "version": "1.0.0",            // 必填，语义版本
 *   "author": "someone",           // 可选，<= 30 字
 *   "description": "……",           // 可选，<= 120 字
 *   "type": "theme",               // 必填，v1 只支持 theme
 *   "light": { "--zhu": "#0E7490" }, // 可选，浅色模式覆盖
 *   "dark":  { "--zhu": "#22D3EE" }  // 可选，深色模式覆盖
 * }
 *
 * 安全边界：变量名必须在 ALLOWED 白名单内，值必须是 #RGB/#RRGGBB/#RRGGBBAA 或 rgb()/rgba() 颜色，
 * 其余字段一律忽略。不允许 url()、expression、选择器或脚本，插件拿不到 Native 桥、网络或密钥。
 */
(function (w) {
  'use strict';
  var C = w.Core;
  var STORE = 'mods.json';
  var ALLOWED = ['--paper', '--surface', '--surface-2', '--ink', '--ink2', '--ink3', '--line', '--line2',
    '--zhu', '--zhu-soft', '--dian', '--dian-soft', '--jin', '--jin-soft', '--good', '--bad', '--mask'];
  var ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
  var SEMVER_RE = /^\d+\.\d+\.\d+$/;
  var COLOR_RE = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*[\d.%\s,]+\))$/;

  function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max) : ''; }

  /** 校验并规范化清单。返回 {ok, mod} 或 {ok:false, error}。 */
  function validate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: '清单不是 JSON 对象' };
    var id = str(raw.id, 40);
    if (!ID_RE.test(id)) return { ok: false, error: 'id 只能用小写字母、数字和连字符，1-40 位' };
    var name = str(raw.name, 30);
    if (!name) return { ok: false, error: '缺少 name' };
    var version = str(raw.version, 20);
    if (!SEMVER_RE.test(version)) return { ok: false, error: 'version 需为 x.y.z 格式' };
    if (raw.type !== 'theme') return { ok: false, error: '暂只支持 type 为 theme 的插件' };
    var mod = {
      id: id, name: name, version: version, type: 'theme',
      author: str(raw.author, 30), description: str(raw.description, 120),
      light: pickVars(raw.light), dark: pickVars(raw.dark)
    };
    if (!Object.keys(mod.light).length && !Object.keys(mod.dark).length) return { ok: false, error: '插件没有任何有效的颜色变量' };
    return { ok: true, mod: mod };
  }

  function pickVars(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    ALLOWED.forEach(function (k) {
      var v = obj[k];
      if (typeof v === 'string' && COLOR_RE.test(v.trim())) out[k] = v.trim();
    });
    return out;
  }

  // ---------- 已安装插件的存储 ----------
  var state = C.store.get(STORE, { enabled: null, list: [] });
  if (!state || !Array.isArray(state.list)) state = { enabled: null, list: [] };
  var mods = {};
  state.list.forEach(function (m) { var r = validate(m); if (r.ok) mods[r.mod.id] = r.mod; });

  function save() { C.store.set(STORE, { enabled: state.enabled, list: Object.keys(mods).map(function (k) { return mods[k]; }) }); C.emit('mods'); }

  /** 把当前启用的主题覆盖写入页面（<style id="modStyle">，在 app.css 之后生效） */
  function apply() {
    var el = document.getElementById('modStyle');
    if (!el) { el = document.createElement('style'); el.id = 'modStyle'; document.head.appendChild(el); }
    var m = state.enabled && mods[state.enabled];
    if (!m) { el.textContent = ''; return; }
    function block(sel, vars) {
      var keys = Object.keys(vars);
      return keys.length ? sel + '{' + keys.map(function (k) { return k + ':' + vars[k] + ';'; }).join('') + '}' : '';
    }
    // 深色块选择器特异性更高（0,2,0），深色模式下会压过浅色块，无需在 JS 里判断主题
    el.textContent = block(':root', m.light) + block(':root[data-theme=dark]', m.dark);
  }

  var mods_api = {
    validate: validate,
    list: function () { return Object.keys(mods).map(function (k) { return mods[k]; }); },
    get enabledId() { return state.enabled; },
    /** 导入一份清单（对象或 JSON 字符串）。同 id 覆盖。 */
    install: function (src) {
      var raw;
      try { raw = typeof src === 'string' ? JSON.parse(src) : src; } catch (e) { return { ok: false, error: 'JSON 解析失败' }; }
      var r = validate(raw);
      if (!r.ok) return r;
      mods[r.mod.id] = r.mod;
      save();
      return { ok: true, mod: r.mod };
    },
    remove: function (id) {
      if (!mods[id]) return false;
      delete mods[id];
      if (state.enabled === id) state.enabled = null;
      save(); apply();
      return true;
    },
    /** 启用某个插件；传 null 恢复默认配色 */
    enable: function (id) {
      if (id && !mods[id]) return false;
      state.enabled = id || null;
      save(); apply();
      return true;
    },
    apply: apply
  };
  w.Mods = mods_api;

  apply();
})(window);
