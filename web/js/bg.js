/* bg.js — 背景插件运行时：在页面最底层铺一张内置背景图，上面盖一层半透明遮罩保证文字可读。
 * 只读 Mods.backgroundId 决定是否显示；图片来自内置表（web/assets/backgrounds/），不接受外部地址。
 * 深色背景配深色遮罩，浅色背景配浅色遮罩，遮罩强度固定，防止背景抢内容。ES2019，面向 Chrome 91 WebView。
 */
(function (w) {
  'use strict';
  var C = w.Core;
  var BG_FILES = { 'bg-dark': true, 'bg-light': true };   // 与 mods.js 的 BACKGROUNDS 一致

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
    var dark = bg === 'bg-dark';
    // 遮罩：深色背景压暗一层，浅色背景提亮一层，让列表文字保持可读
    var veil = dark ? 'linear-gradient(rgba(11,15,24,.62),rgba(11,15,24,.72))' : 'linear-gradient(rgba(246,247,250,.78),rgba(246,247,250,.86))';
    el.style.backgroundImage = veil + ', url(assets/backgrounds/' + bg + '.webp)';
  }

  C.on('background', sync);
  C.on('mods', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
  w.Background = { sync: sync };
})(window);
