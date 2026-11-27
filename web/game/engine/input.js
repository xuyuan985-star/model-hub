/* web/game/engine/input.js — 键盘与触控（方向键/十字/长按连走），只产出意图，不改游戏状态。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};

  var KEY_DIR = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right',
    W: 'up', S: 'down', A: 'left', D: 'right'
  };

  var KEY_ACTION = { ' ': 'action', Enter: 'action', e: 'action', E: 'action', j: 'action', J: 'action' };
  var KEY_CANCEL = { Escape: 'cancel', Backspace: 'cancel', x: 'cancel', X: 'cancel', k: 'cancel' };
  var KEY_MENU = { m: 'menu', M: 'menu', Tab: 'menu' };
  var KEY_AUTO = { q: 'auto', Q: 'auto' };

  function create(canvas, handlers) {
    var held = Object.create(null);
    var repeatTimer = 0, repeatDir = null, repeatDelay = 0;
    var pointerStart = null, pointerActive = false;
    handlers = handlers || {};

    function emit(kind, value) {
      if (typeof handlers[kind] === 'function') handlers[kind](value);
    }

    function onKey(e) {
      var dir = KEY_DIR[e.key], act = KEY_ACTION[e.key], cancel = KEY_CANCEL[e.key], menu = KEY_MENU[e.key];
      var auto = KEY_AUTO[e.key];
      if (!dir && !act && !cancel && !menu && !auto) return;
      if (!e.repeat) {
        if (dir) { emit('dir', dir); held[dir] = true; repeatDir = dir; repeatDelay = 0; }
        else if (act) emit('action');
        else if (cancel) emit('cancel');
        else if (menu) emit('menu');
        else if (auto) emit('auto');
      }
      if (e.preventDefault) e.preventDefault();
    }

    function onKeyUp(e) {
      var dir = KEY_DIR[e.key];
      if (dir) {
        held[dir] = false;
        if (repeatDir === dir) repeatDir = null;
      }
    }

    /** 触控：半格位移算一次转向/一次移动，长按超过 260ms 转连续走。 */
    function dirFromDelta(dx, dy) {
      if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
      if (Math.abs(dy) > 0) return dy > 0 ? 'down' : 'up';
      return null;
    }

    function onPointerDown(e) {
      pointerActive = true;
      pointerStart = { x: e.clientX, y: e.clientY, at: Date.now() };
      if (e.pointerId != null && canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 部分 WebView 不支持捕获 */ }
      }
    }

    function onPointerMove(e) {
      if (!pointerActive || !pointerStart) return;
      var dx = e.clientX - pointerStart.x, dy = e.clientY - pointerStart.y;
      var cell = Math.max(18, Math.min(canvas.clientWidth, canvas.clientHeight) / 8);
      if (Math.abs(dx) < cell && Math.abs(dy) < cell) return;
      var dir = dirFromDelta(dx, dy);
      if (!dir) return;
      pointerStart.x = e.clientX;
      pointerStart.y = e.clientY;
      emit('dir', dir);
    }

    function onPointerUp(e) {
      if (!pointerActive) return;
      pointerActive = false;
      var dx = pointerStart ? e.clientX - pointerStart.x : 0;
      var dy = pointerStart ? e.clientY - pointerStart.y : 0;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var tapped = dist < 12 && Date.now() - (pointerStart ? pointerStart.at : 0) < 400;
      pointerStart = null;
      if (tapped) emit('action');
    }

    /** 固定步长里调用：长按方向键 260ms 后按 120ms 间隔复读方向意图。 */
    function tick(dt) {
      if (!repeatDir) { repeatTimer = 0; return; }
      repeatTimer += dt;
      if (repeatTimer < (repeatDelay ? 120 : 260)) return;
      repeatTimer = 0;
      repeatDelay = 1;
      if (held[repeatDir]) emit('dir', repeatDir);
    }

    function clear() {
      held = Object.create(null);
      repeatDir = null;
      repeatTimer = 0;
      pointerActive = false;
      pointerStart = null;
    }

    w.addEventListener('keydown', onKey);
    w.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    return {
      tick: tick,
      clear: clear,
      held: held,
      dispose: function () {
        w.removeEventListener('keydown', onKey);
        w.removeEventListener('keyup', onKeyUp);
        canvas.removeEventListener('pointerdown', onPointerDown);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerup', onPointerUp);
        canvas.removeEventListener('pointercancel', onPointerUp);
      }
    };
  }

  G.Input = { create: create };
})(window);
