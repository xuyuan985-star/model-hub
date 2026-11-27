/* pet.js — 宠物插件运行时：鲸鱼娘形象在屏幕内游走，有五种状态。
 * 状态：idle 待机 / walk 游走 / surprised 被点击 / drag 按住拖动 / sleep 长时间无操作后睡觉。
 * 形象来自内置表（web/assets/pets/pet-<state>.webp），清单只能选形象集名字，不接受外部地址。
 * 尊重「减少动态效果」：开启时只显示待机或睡觉，不游走。ES2019，面向 Chrome 91 WebView。
 */
(function (w) {
  'use strict';
  var C = w.Core;
  var SIZE = 128;                 // 显示宽度（px），与美术原图 128 宽一致
  var IDLE_TO_SLEEP = 60000;      // 无操作 60 秒后入睡
  var SURPRISE_MS = 700;          // 被点击后惊讶表情持续时间
  var LONG_PRESS_MS = 350;        // 按住超过此时长进入拖动
  var SPRITE_SETS = { 'whale-girl': true };   // 内置形象集，清单只能选这里的名字

  var el = null, timer = null, sleepTimer = null, surpriseTimer = null;
  var x = 0, y = 0, dx = 0.6, dy = 0.22;
  var state = 'idle', set = null, lastAct = Date.now();
  var pressTimer = null, dragging = false, dragOffX = 0, dragOffY = 0;

  function reduced() {
    return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function src(s) { return 'assets/pets/pet-' + s + '.webp'; }

  function setState(s) {
    if (state === s && el) return;
    state = s;
    if (el) el.src = src(s);
    lastAct = Date.now();
  }

  function ensure() {
    if (el) return el;
    el = document.createElement('img');
    el.id = 'petSprite';
    el.alt = '';
    el.setAttribute('aria-hidden', 'true');
    el.draggable = false;
    el.style.cssText = 'position:fixed;width:' + SIZE + 'px;height:auto;z-index:50;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;will-change:transform;';
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('click', onTap);
    el.src = src(state);
    document.body.appendChild(el);
    return el;
  }

  function facing() { return dx < 0 ? -1 : 1; }

  function place() {
    if (!el || dragging) return;
    var W = window.innerWidth, H = window.innerHeight;
    x = Math.min(Math.max(x, 0), Math.max(0, W - SIZE));
    y = Math.min(Math.max(y, 40), Math.max(40, H - 180));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.transform = 'scaleX(' + facing() + ')';
  }

  // ---------- 游走 ----------
  function step() {
    if (dragging || state === 'sleep') return;
    var W = window.innerWidth, H = window.innerHeight;
    x += dx; y += dy;
    if (x < 0 || x > W - SIZE) dx = -dx;
    if (y < 40 || y > H - 180) dy = -dy;   // 避开顶部标题与底部导航
    setState('walk');
    place();
  }

  // ---------- 交互 ----------
  function onTap() {
    if (dragging) return;
    lastAct = Date.now();
    // 惊讶表情，持续一会儿后回到待机
    setState('surprised');
    clearTimeout(surpriseTimer);
    surpriseTimer = setTimeout(function () { if (state === 'surprised') setState('idle'); }, SURPRISE_MS);
    if (state === 'sleep') { setState('idle'); }
  }

  function onDown(e) {
    lastAct = Date.now();
    var r = el.getBoundingClientRect();
    dragOffX = e.clientX - r.left; dragOffY = e.clientY - r.top;
    pressTimer = setTimeout(function () {
      dragging = true;
      setState('drag');
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      w.addEventListener('pointermove', onMove);
      w.addEventListener('pointerup', onUp);
      w.addEventListener('pointercancel', onUp);
    }, LONG_PRESS_MS);
    // 短按由 click 处理；若很快松开，取消拖动计时
    w.addEventListener('pointerup', cancelPress, { once: true });
  }

  function cancelPress() { clearTimeout(pressTimer); pressTimer = null; }

  function onMove(e) {
    if (!dragging) return;
    x = e.clientX - dragOffX; y = e.clientY - dragOffY;
    var W = window.innerWidth, H = window.innerHeight;
    x = Math.min(Math.max(x, 0), W - SIZE); y = Math.min(Math.max(y, 40), H - 40);
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    w.removeEventListener('pointermove', onMove);
    w.removeEventListener('pointerup', onUp);
    w.removeEventListener('pointercancel', onUp);
    lastAct = Date.now();
    setState('idle');
    place();
  }

  // ---------- 睡觉计时 ----------
  function tickSleep() {
    if (dragging) return;
    if (state !== 'sleep' && Date.now() - lastAct > IDLE_TO_SLEEP) setState('sleep');
  }

  function start() {
    stop();
    if (reduced()) { setState('idle'); return; }
    timer = setInterval(step, 40);
    sleepTimer = setInterval(tickSleep, 2000);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (sleepTimer) { clearInterval(sleepTimer); sleepTimer = null; }
  }

  function sync() {
    var id = w.Mods && w.Mods.petId;
    var m = id && w.Mods.get(id);
    var sprite = m && m.type === 'pet' ? m.sprite : null;
    if (!sprite || !SPRITE_SETS[sprite]) {
      stop(); if (el) { el.remove(); el = null; } state = 'idle'; set = null;
      // 清单写了不认识的形象时不能静默消失：提示一次，便于发现
      if (id && m && sprite) { try { w.Native && w.Native.toast && w.Native.toast('桌宠形象「' + sprite + '」不可用，请更新插件'); } catch (e) {} }
      return;
    }
    set = sprite;
    ensure();
    if (!x && !y) { x = window.innerWidth - SIZE - 12; y = window.innerHeight * 0.45; }
    place();
    start();
  }

  C.on('pet', sync);
  C.on('mods', sync);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
  w.Pet = { sync: sync, state: function () { return state; } };
})(window);
