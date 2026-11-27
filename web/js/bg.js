/* bg.js — 背景插件运行时：在页面最底层铺一张内置背景图，上面盖一层半透明遮罩保证文字可读。
 * 只读 Mods.backgroundId 决定是否显示；图片来自内置表（web/assets/backgrounds/），不接受外部地址。
 * 深色背景配深色遮罩，浅色背景配浅色遮罩，遮罩强度固定，防止背景抢内容。ES2019，面向 Chrome 91 WebView。
 */
(function (w) {
  'use strict';
  var C = w.Core;
  var BG_FILES = { 'palace': true };   // 与 mods.js 的 BACKGROUNDS 一致：一套宫殿背景，深浅两张随主题切换

  var layer = null;

  function ensure() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bgLayer';
    layer.setAttribute('aria-hidden', 'true');
    // 固定在最底层：z-index 为负，内容区（#app）盖在它上面，不挡点击
    layer.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;background-size:cover;background-position:center top;background-repeat:no-repeat;';
    document.body.insertBefore(layer, document.body.firstChild);
    return layer;
  }

  function sync() {
    var id = w.Mods && w.Mods.backgroundId;
    var m = id && w.Mods.get(id);
    var bg = m && m.type === 'background' ? m.background : null;
    if (!bg || !BG_FILES[bg]) {
      if (layer) { layer.remove(); layer = null; }
      document.body.classList.remove('has-bg');
      return;
    }
    document.body.classList.add('has-bg');
    var el = ensure();
    // 深浅随应用主题：深色主题用夜宫图，浅色用白昼图
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var file = dark ? 'bg-dark' : 'bg-light';
    // 遮罩很轻：大部分区域透出宫殿背景；文字区域的底色由 CSS 单独处理
    var veil = dark ? 'linear-gradient(rgba(11,15,24,.28),rgba(11,15,24,.36))' : 'linear-gradient(rgba(246,247,250,.22),rgba(246,247,250,.30))';
    el.style.backgroundImage = veil + ', url(assets/backgrounds/' + file + '.webp)';
  }

  C.on('background', sync);
  C.on('mods', sync);
  C.on('theme', sync);     // 深浅主题属性写好后再选图（系统主题与手动切换都经过这里）
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
  w.Background = { sync: sync };
})(window);
