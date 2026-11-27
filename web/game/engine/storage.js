/* web/game/engine/storage.js — 存档读写：优先原生桥 Native.readFile/writeFile('game-save.json')，退到 localStorage。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};
  var FILE = 'game-save.json';
  var LS = 'modelhub.game-save';

  function bridge() {
    var N = w.Native;
    if (!N || typeof N.readFile !== 'function' || typeof N.writeFile !== 'function') return null;
    return N;
  }

  function readRaw() {
    var N = bridge();
    if (N) {
      try { var s = N.readFile(FILE); if (s) return s; } catch (e) { /* 桥不可用时继续走 localStorage */ }
    }
    try { return w.localStorage ? w.localStorage.getItem(LS) : null; } catch (e2) { return null; }
  }

  function writeRaw(text) {
    var N = bridge(), ok = false;
    if (N) {
      try { ok = !!N.writeFile(FILE, text); } catch (e) { ok = false; }
    }
    if (!ok) {
      try { w.localStorage.setItem(LS, text); ok = true; } catch (e2) { ok = false; }
    }
    return ok;
  }

  function load() {
    var raw = readRaw();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function save(obj) { return writeRaw(JSON.stringify(obj)); }

  function clear() {
    var N = bridge();
    if (N) {
      try { if (typeof N.deleteFile === 'function') N.deleteFile(FILE); } catch (e) { /* 忽略 */ }
    }
    try { w.localStorage.removeItem(LS); } catch (e2) { /* 忽略 */ }
  }

  G.Storage = {
    FILE: FILE,
    load: load,
    save: save,
    clear: clear,
    available: function () { return !!bridge() || !!w.localStorage; }
  };
})(window);
