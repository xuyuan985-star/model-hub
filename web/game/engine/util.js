/* web/game/engine/util.js — 数学、确定性随机与文本换行（引擎内部，无 DOM 依赖）。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  /** 确定性随机：同一种子同一序列，遇敌与占位结算都靠它复现。 */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    var h = 2166136261, i;
    str = String(str);
    for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function pickOne(list, r) {
    if (!list || !list.length) return null;
    return list[Math.floor(r * list.length) % list.length];
  }

  /** 逐字断行：中文按字、西文按词，供方块式对话框使用。 */
  function wrapText(ctx, text, maxWidth) {
    var lines = [], line = '', i, ch, test;
    text = String(text == null ? '' : text);
    for (i = 0; i < text.length; i++) {
      ch = text.charAt(i);
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** 方向向量：四个朝向对应的格子位移。 */
  var DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function dirOf(dx, dy) {
    if (dx > 0) return 'right';
    if (dx < 0) return 'left';
    if (dy > 0) return 'down';
    if (dy < 0) return 'up';
    return null;
  }

  G.Util = {
    clamp: clamp, lerp: lerp, rng: rng, hash: hash, pickOne: pickOne,
    wrapText: wrapText, DIRS: DIRS, dirOf: dirOf
  };
})(window);
