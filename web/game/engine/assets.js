/* web/game/engine/assets.js — 资源清单读取、图片缓存与缺图占位（一律按 manifest key 取图，找不到就画纯色方块 + 首字）。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};

  var FALLBACK_ORDER = [
    'ground', 'ground_pattern', 'wall', 'wall_top', 'obstacle', 'tree',
    'tree_dead', 'water', 'water_edge', 'platform', 'door', 'door_side',
    'terminal', 'crate', 'shelf', 'seal_wax', 'pillar_shadow', 'archive_cabinet',
    'soil', 'sprout', 'glass_wall', 'stage_rim', 'rug', 'rug_edge'
  ];

  var manifest = null;
  var byKey = {};
  var images = {};
  var missing = [];
  var base = null;
  var ready = false;

  /** 资源根即本脚本所在的 game/ 目录：页面在 web/index.html 还是 web/game/index.html 都能取对路径。 */
  function resolveBase() {
    if (base !== null) return base;
    base = '';
    var scripts = document.getElementsByTagName('script'), i, src, at;
    // 优先用引擎脚本自身的地址反推（最可靠，与页面层级无关）
    for (i = 0; i < scripts.length; i++) {
      src = scripts[i].src || '';
      at = src.lastIndexOf('engine/assets.js');
      if (at >= 0) { base = src.slice(0, at); break; }
    }
    // 退路：取最后一个 /game/ 之前的部分。用 lastIndexOf 而不是 indexOf，
    // 否则路径里更靠前的 *game 目录（如解包目录 ..._tmp_game/、Android assets/game/）会把根截错一级。
    if (!base) {
      for (i = 0; i < scripts.length; i++) {
        src = scripts[i].src || '';
        at = src.lastIndexOf('/game/');
        if (at >= 0) { base = src.slice(0, at + 6); break; }
      }
    }
    return base;
  }

  /** manifest 里的 file 是相对 game/ 的路径，直接拼根，不额外补 assets/。 */
  function assetUrl(file) { return resolveBase() + String(file || ''); }

  function index() {
    if (!manifest) return;
    var a = manifest.items || manifest.assets || {}, k;
    byKey = {};
    for (k in a) { if (Object.prototype.hasOwnProperty.call(a, k)) byKey[k] = a[k]; }
  }

  function readScriptManifest() {
    var m = w.GameAssetManifest || w.GameAssets;
    if (!m || !(m.items || m.assets)) return false;
    manifest = m;
    index();
    return true;
  }

  /** 没有 <script> 镜像时（http 环境）再试 manifest.json；file:// 下 WebView 禁止读本地 JSON，直接跳过。 */
  function fetchManifest(cb) {
    if (readScriptManifest()) { cb(null); return; }
    var xhr, proto = w.location ? w.location.protocol : 'file:';
    if (proto === 'file:' || typeof w.XMLHttpRequest !== 'function') { cb(null); return; }
    xhr = new w.XMLHttpRequest();
    xhr.open('GET', resolveBase() + 'manifest.json', true);
    xhr.onload = function () {
      try { manifest = JSON.parse(xhr.responseText); index(); } catch (e) { manifest = null; }
      cb(null);
    };
    xhr.onerror = function () { cb(null); };
    xhr.send();
  }

  function init(cb) {
    fetchManifest(function () {
      ready = true;
      if (cb) cb(null);
    });
  }

  function entry(key) { return byKey[key] || null; }

  function ensure(key) {
    if (images[key]) return images[key];
    var e = byKey[key];
    var rec = { key: key, entry: e || null, img: null, ok: false, failed: false };
    images[key] = rec;
    if (!e || !e.file) { rec.failed = true; if (missing.indexOf(key) < 0) missing.push(key); return rec; }
    var im = new Image();
    im.onload = function () { rec.img = im; rec.ok = true; };
    im.onerror = function () { rec.failed = true; if (missing.indexOf(key) < 0) missing.push(key); };
    im.src = assetUrl(e.file);
    return rec;
  }

  function preload(keys) {
    for (var i = 0; i < keys.length; i++) ensure(keys[i]);
  }

  function isReady(key) { var r = images[key]; return !!(r && r.ok); }

  function tileOrder() {
    var e = byKey.tiles_world;
    return e && e.order && e.order.length ? e.order : FALLBACK_ORDER;
  }

  /** 从图集里取一帧；图集缺失返回 false，由调用方画占位。 */
  function drawFrame(ctx, key, frame, dx, dy, dw, dh) {
    var rec = images[key] || ensure(key);
    var e = rec.entry;
    var fw = e && (e.cell ? e.cell[0] : e.fw);
    var fh = e && (e.cell ? e.cell[1] : e.fh);
    if (!rec.ok || !fw || !fh) return false;
    var cols = e.cols || Math.max(1, Math.round(e.w / fw));
    var sx = (frame % cols) * fw;
    var sy = Math.floor(frame / cols) * fh;
    ctx.drawImage(rec.img, sx, sy, fw, fh, dx, dy, dw || fw, dh || fh);
    return true;
  }

  var DIR_COL = { down: 0, left: 1, right: 2, up: 3 };

  /**
   * 精灵取帧：图集 4 列（下/左/右/上）× 4 行（idle/walk1/idle/walk2）。
   * 只做了两向的 NPC 用左向帧水平镜像冒充右/上，保持走位动作一致。
   */
  function drawSprite(ctx, key, dir, frame, dx, dy) {
    var rec = images[key] || ensure(key);
    var e = rec.entry;
    var fw = e && (e.cell ? e.cell[0] : e.fw);
    var fh = e && (e.cell ? e.cell[1] : e.fh);
    if (!rec.ok || !fw || !fh) return false;
    var cols = e.cols || 4;
    var dirs = e.dirs || 4;
    var col = DIR_COL[dir] == null ? 0 : DIR_COL[dir];
    var mirror = false;
    if (dirs < 4 && col > 1) { col = 1; mirror = dir === 'right'; }
    var row = frame === 1 ? 1 : (frame === 2 ? 3 : 0);
    var sx = (col % cols) * fw;
    var sy = row * fh;
    if (!mirror) {
      ctx.drawImage(rec.img, sx, sy, fw, fh, dx, dy, fw, fh);
      return true;
    }
    ctx.save();
    ctx.translate(dx + fw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(rec.img, sx, sy, fw, fh, 0, 0, fw, fh);
    ctx.restore();
    return true;
  }

  /** 缺图回退：纯色方块 + 首字，尺寸完全取自调用方，不写死任何路径。 */
  function drawPlaceholder(ctx, key, label, x, y, wd, ht, textColor) {
    var h = G.Util.hash(key) % 360;
    ctx.save();
    ctx.fillStyle = 'hsl(' + h + ',32%,38%)';
    ctx.fillRect(x + 0.5, y + 0.5, wd - 1, ht - 1);
    ctx.strokeStyle = 'rgba(25,31,43,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, wd - 1, ht - 1);
    if (wd >= 14 && ht >= 14) {
      var text = String(label || key || '?').slice(0, 1);
      ctx.fillStyle = textColor || '#F4F5F7';
      ctx.font = Math.round(Math.min(wd, ht) * 0.62) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + wd / 2, y + ht / 2 + 0.5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  G.Assets = {
    init: init,
    ensure: ensure,
    preload: preload,
    entry: entry,
    isReady: isReady,
    drawFrame: drawFrame,
    drawSprite: drawSprite,
    drawPlaceholder: drawPlaceholder,
    tileOrder: tileOrder,
    assetUrl: assetUrl,
    missing: function () { return missing.slice(); },
    manifest: function () { return manifest; },
    isReadyAll: function () { return ready; }
  };
})(window);
