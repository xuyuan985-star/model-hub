/* web/game/engine/main.js — 启动入口：装配画布、资源、渲染与游戏循环。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine;

  /** 屏幕按键：按下走一格，长按方向键 260ms 后按 120ms 连走；按下期间给按钮加 .on 视觉反馈。 */
  function bindPad(game) {
    var pad = document.getElementById('pad');
    if (!pad) return;
    var timer = 0, repeater = 0, held = null, pressedBtn = null;

    function stop() {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (repeater) { clearInterval(repeater); repeater = 0; }
      held = null;
      if (pressedBtn) { pressedBtn.classList.remove('on'); pressedBtn = null; }
    }

    function down(e) {
      var b = e.target && e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      e.preventDefault();
      var dir = b.getAttribute('data-dir'), cmd = b.getAttribute('data-cmd');
      stop();
      pressedBtn = b;
      b.classList.add('on');
      if (dir) {
        held = dir;
        game.dir(dir);
        timer = setTimeout(function () {
          repeater = setInterval(function () { if (held) game.dir(held); }, 120);
        }, 260);
      } else if (cmd === 'act') game.act();
      else if (cmd === 'menu') game.menu();
      else if (cmd === 'auto') game.auto();
    }

    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointerup', stop);
    pad.addEventListener('pointercancel', stop);
    pad.addEventListener('pointerleave', stop);
    // 安卓 WebView 里 pointerup 偶发丢失（手指滑出按钮），补一道兜底
    w.addEventListener('blur', stop);
  }

  function boot() {
    var canvas = document.getElementById('game');
    var host = document.getElementById('stage');
    if (!canvas) return;
    var cam = G.Camera.create();
    cam.fit(canvas, host);
    var render = G.Render.create(canvas, cam);
    var game = G.Game.create({ canvas: canvas, cam: cam, render: render });
    w.__game = game;

    w.addEventListener('resize', function () { cam.fit(canvas, host); });
    w.addEventListener('orientationchange', function () { setTimeout(function () { cam.fit(canvas, host); }, 120); });

    // 安卓返回键：游戏内先收菜单与对白，探索与标题状态回主榜页面
    w.__onBack = function () {
      var g = w.__game;
      if (g && g.back && g.back()) return true;
      if (g && g.flush) g.flush();
      w.location.href = '../index.html';
      return true;
    };

    // 切后台或被系统回收前强制存一次：WebView 里页面不一定触发 unload，原生 onResume 也会回调这里
    function flush() { if (w.__game && w.__game.flush) w.__game.flush(); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    w.addEventListener('pagehide', flush);
    var prevResume = w.__onResume;
    w.__onResume = function () {
      flush();
      if (typeof prevResume === 'function') return prevResume.apply(w, arguments);
      return true;
    };

    bindPad(game);

    G.Assets.init(function () {
      game.boot();
      game.start();
      cam.fit(canvas, host);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
