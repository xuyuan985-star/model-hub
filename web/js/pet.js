/* pet.js — 宠物插件运行时：一只小形象在屏幕内慢慢游走，点一下会晃一晃。
 * 只读 Mods.petId 决定是否显示；形象来自内置表（web/assets/pets/），不接受外部地址。
 * 尊重「减少动态效果」：开启时只静止显示，不游走。ES2019，面向 Chrome 91 WebView。
 */
(function (w) {
  'use strict';
  var C = w.Core;
  var el = null, timer = null, x = 0, y = 0, dx = 0.6, dy = 0.25, shown = null;

  function reduced() {
    return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function ensure() {
    if (el) return el;
    el = document.createElement('img');
    el.id = 'petSprite';
    el.alt = '';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:fixed;width:56px;height:auto;z-index:50;pointer-events:auto;touch-action:manipulation;transition:transform .18s ease;will-change:transform;user-select:none;-webkit-user-select:none;';
    el.addEventListener('click', function () {
      var flip = dx < 0 ? 'scaleX(-1)' : 'scaleX(1)';
      el.style.transform = flip + ' scale(1.08) rotate(-6deg)';
      setTimeout(function () { if (el) el.style.transform = flip; }, 180);
    });
    document.body.appendChild(el);
    return el;
  }

  function place() {
    if (!el) return;
    var W = window.innerWidth, H = window.innerHeight;
    x = Math.min(Math.max(x, 0), Math.max(0, W - 56));
    y = Math.min(Math.max(y, 0), Math.max(0, H - 40));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.transform = (dx < 0 ? 'scaleX(-1)' : 'scaleX(1)');
  }

  function step() {
    var W = window.innerWidth, H = window.innerHeight;
    x += dx; y += dy;
    if (x < 0 || x > W - 56) dx = -dx;
    if (y < 40 || y > H - 160) dy = -dy; // 避开底部导航与顶部标题
    place();
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function sync() {
    var id = w.Mods && w.Mods.petId;
    var m = id && w.Mods.get(id);
    var sprite = m && m.type === 'pet' ? m.sprite : null;
    if (!sprite) { stop(); if (el) { el.remove(); el = null; } shown = null; return; }
    var e = ensure();
    if (shown !== sprite) { e.src = 'assets/pets/' + sprite + '.svg'; shown = sprite; }
    if (!x && !y) { x = window.innerWidth - 90; y = window.innerHeight * 0.45; }
    place();
    stop();
    if (!reduced()) timer = setInterval(step, 40);
  }

  C.on('pet', sync);
  C.on('mods', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
  w.Pet = { sync: sync };
})(window);
