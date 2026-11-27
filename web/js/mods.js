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
  /** 插件分类（工坊里按此筛选）。清单写了未知分类或不写，统一归到 ui。 */
  var CATEGORIES = { ui: '界面', rank: '榜单', tool: '工具' };
  var ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
  var SEMVER_RE = /^\d+\.\d+\.\d+$/;
  var COLOR_RE = /^(#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*[\d.%\s,]+\))$/;

  /** 内置效果样式表：清单只能引用名字，具体样式在这里写死。 */
  var EFFECTS = {
    gold:   { cls: 'pod-gold',   label: '金' },
    silver: { cls: 'pod-silver', label: '银' },
    bronze: { cls: 'pod-bronze', label: '铜' }
  };

  /** 内置宠物形象：清单只能引用名字，图由 web/assets/pets/<name>.svg 提供，不接受外部地址。 */
  var PETS = { 'whale-girl': { label: '鲸鱼娘' } };
  /** 内置背景：清单只能选名字，图由 web/assets/backgrounds/<name>.webp 提供。 */
  var BACKGROUNDS = { 'bg-dark': { label: '深色夜宫' }, 'bg-light': { label: '浅色白昼' } };

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
    var cat = CATEGORIES[raw.category] ? raw.category : 'ui';
    var base = { id: id, name: name, version: version, author: str(raw.author, 30), description: str(raw.description, 120), category: cat };
    if (raw.type === 'background') {
      if (!BACKGROUNDS[raw.background]) return { ok: false, error: '背景只能是 ' + Object.keys(BACKGROUNDS).join(' / ') };
      base.type = 'background'; base.background = raw.background;
      return { ok: true, mod: base };
    }
    if (raw.type === 'pet') {
      if (!PETS[raw.sprite]) return { ok: false, error: '宠物形象只能是 ' + Object.keys(PETS).join(' / ') };
      base.type = 'pet'; base.sprite = raw.sprite;
      return { ok: true, mod: base };
    }
    if (raw.type === 'effect') {
      // 效果插件只能从内置样式表里选，不接受任何自定义 CSS
      if (!EFFECTS[raw.style]) return { ok: false, error: '效果样式只能是 ' + Object.keys(EFFECTS).join(' / ') };
      base.type = 'effect'; base.style = raw.style;
      return { ok: true, mod: base };
    }
    if (raw.type !== 'theme') return { ok: false, error: '暂只支持 type 为 theme / effect / pet / background 的插件' };
    base.type = 'theme';
    base.light = pickVars(raw.light); base.dark = pickVars(raw.dark);
    if (!Object.keys(base.light).length && !Object.keys(base.dark).length) return { ok: false, error: '插件没有任何有效的颜色变量' };
    return { ok: true, mod: base };
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
  var state = C.store.get(STORE, { enabled: null, effect: null, pet: null, background: null, list: [] });
  if (!state || !Array.isArray(state.list)) state = { enabled: null, effect: null, pet: null, background: null, list: [] };
  if (state.background === undefined) state.background = null;
  if (state.effect === undefined) state.effect = null;
  if (state.pet === undefined) state.pet = null;
  var mods = {};
  state.list.forEach(function (m) { var r = validate(m); if (r.ok) mods[r.mod.id] = r.mod; });

  function save() { C.store.set(STORE, { enabled: state.enabled, effect: state.effect, pet: state.pet, background: state.background, list: Object.keys(mods).map(function (k) { return mods[k]; }) }); C.emit('mods'); }

  /** 把当前启用的主题覆盖写入页面（<style id="modStyle">，在 app.css 之后生效） */
  function apply() {
    var el = document.getElementById('modStyle');
    if (!el) { el = document.createElement('style'); el.id = 'modStyle'; document.head.appendChild(el); }
    var m = state.enabled && mods[state.enabled];
    function block(sel, vars) {
      var keys = Object.keys(vars);
      return keys.length ? sel + '{' + keys.map(function (k) { return k + ':' + vars[k] + ';'; }).join('') + '}' : '';
    }
    // 只有主题类插件写入颜色变量；深色块选择器特异性更高（0,2,0），无需在 JS 里判断主题
    el.textContent = (m && m.type === 'theme') ? block(':root', m.light) + block(':root[data-theme=dark]', m.dark) : '';
    applyEffect();
  }

  /** 效果：给 <body> 加上内置样式类，并打标记让榜单前三名套用。与主题互不影响。 */
  function applyEffect() {
    var body = document.body; if (!body) return;
    Object.keys(EFFECTS).forEach(function (k) { body.classList.remove(EFFECTS[k].cls); });
    var e = state.effect && mods[state.effect];
    // 殿堂效果是一整套：第一名金、第二名银、第三名铜，由 CSS 按名次分别着色。
    // 清单里的 style 只作标识，开启即整套生效。
    // 开启时三档一起挂上，CSS 才能让第一名金、第二名银、第三名铜同时生效
    if (e && e.type === 'effect' && EFFECTS[e.style]) Object.keys(EFFECTS).forEach(function (k) { body.classList.add(EFFECTS[k].cls); });
  }

  var mods_api = {
    validate: validate,
    list: function () { return Object.keys(mods).map(function (k) { return mods[k]; }); },
    get: function (id) { return mods[id] || null; },
    /** 语义版本比较：a 新于 b 返回 1，相等 0，旧于 -1。 */
    cmpVersion: function (a, b) {
      var x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
      for (var i = 0; i < 3; i++) { var d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
      return 0;
    },
    CATEGORIES: CATEGORIES,
    get enabledId() { return state.enabled; },
    get effectId() { return state.effect; },
    get petId() { return state.pet; },
    get backgroundId() { return state.background; },
    BACKGROUNDS: BACKGROUNDS,
    /** 启用/停用背景（与主题、效果、宠物独立）。传 null 关闭。 */
    enableBackground: function (id) {
      if (id && (!mods[id] || mods[id].type !== 'background')) return false;
      state.background = id || null;
      save(); apply();
      C.emit('background');
      return true;
    },
    PETS: PETS,
    /** 启用/停用宠物（与主题、效果独立）。传 null 关闭。 */
    enablePet: function (id) {
      if (id && (!mods[id] || mods[id].type !== 'pet')) return false;
      state.pet = id || null;
      save(); apply();
      C.emit('pet');
      return true;
    },
    /** 启用/停用效果插件（与主题独立）。传 null 关闭效果。 */
    enableEffect: function (id) {
      if (id && (!mods[id] || mods[id].type !== 'effect')) return false;
      state.effect = id || null;
      save(); apply();
      return true;
    },
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
      if (state.effect === id) state.effect = null;
      if (state.pet === id) state.pet = null;
      if (state.background === id) state.background = null;
      save(); apply();
      return true;
    },
    /** 启用某个插件；传 null 恢复默认配色 */
    enable: function (id) {
      if (id && (!mods[id] || mods[id].type !== 'theme')) return false;
      state.enabled = id || null;
      save(); apply();
      return true;
    },
    apply: apply
  };
  w.Mods = mods_api;

  apply();
})(window);
