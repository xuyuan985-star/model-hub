/* web/game/engine/map.js — 地图查询层：可走判定、交互点解析、门与遇敌计数（数据只读，不改 GameData）。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};

  function GD() { return w.GameData || {}; }

  function world() { return GD().world || null; }

  function mapOf(id) {
    var W = world();
    return W && W.maps ? (W.maps[id] || null) : null;
  }

  function at(mapId, x, y) {
    var m = mapOf(mapId);
    if (!m) return '#';
    if (y < 0 || y >= m.ascii.length) return '#';
    var row = m.ascii[y] || '';
    return x < 0 || x >= row.length ? '#' : row.charAt(x);
  }

  function blockedByDecor(m, x, y) {
    var list = (m && m.decor) || [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i].blocks && list[i].x === x && list[i].y === y) return true;
    }
    return false;
  }

  /** 可站立：交给数据层的 GD.walkable 判图块与 decor，引擎只再挡一层越界。 */
  function walkable(mapId, x, y) {
    var m = mapOf(mapId), gd = GD();
    if (!m) return false;
    if (x < 0 || y < 0 || x >= (m.ascii[0] || '').length || y >= m.ascii.length) return false;
    if (typeof gd.walkable === 'function') {
      try { return !!gd.walkable(mapId, x, y); } catch (e) { /* 数据层异常时退到本地判定 */ }
    }
    var t = at(mapId, x, y);
    if (t === '#' || t === 'T' || t === '~' || t === 'X') return false;
    return !blockedByDecor(m, x, y);
  }

  function interactables(mapId) {
    var m = mapOf(mapId);
    return (m && m.interactables) || [];
  }

  function interactableAt(mapId, x, y) {
    var list = interactables(mapId), i;
    for (i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return list[i];
    }
    return null;
  }

  /** 交互解析：先看脚下，再看面前一格——站在点上按动作键与面朝点按动作键等价。 */
  function interactableFrom(mapId, x, y, dir) {
    var here = interactableAt(mapId, x, y);
    if (here) return here;
    var d = G.Util.DIRS[dir] || G.Util.DIRS.down;
    return interactableAt(mapId, x + d[0], y + d[1]);
  }

  function transitionAt(mapId, x, y) {
    var m = mapOf(mapId);
    var list = (m && m.transitions) || [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return list[i];
    }
    return null;
  }

  function decorTile(mapId, x, y) {
    var m = mapOf(mapId);
    var list = (m && m.decor) || [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i].x === x && list[i].y === y) return list[i].tile;
    }
    return null;
  }

  /** 图块字符 → 图集索引；图集顺序取自 manifest 的 tiles_world.order。 */
  var TILE_INDEX = {
    '.': 'ground', ',': 'ground_pattern', '#': 'wall', '=': 'platform',
    'T': 'tree', '~': 'water', 's': 'ground', 'c': 'crate', 'D': 'door', 'X': 'obstacle'
  };

  var DECOR_INDEX = {
    'archive-cabinet': 'archive_cabinet', 'terminal': 'terminal',
    'pillar-shadow': 'pillar_shadow', 'dead-tree': 'tree_dead',
    'seal-wax': 'seal_wax', 'shelf': 'shelf'
  };

  function tileName(ch) { return TILE_INDEX[ch] || 'ground'; }

  function tileIndex(name) {
    var order = G.Assets ? G.Assets.tileOrder() : [];
    var i = order.indexOf(name);
    return i < 0 ? 0 : i;
  }

  function decorName(tile) { return DECOR_INDEX[tile] || null; }

  function bgKey(mapId) { return 'bg_' + mapId; }

  /** 场景进入钩子：首次进图播 onEnter 对白，标记由对白节点的 onEnd 负责写。 */
  function enterDialog(mapId) {
    var m = mapOf(mapId);
    return m && m.onEnter ? m.onEnter : null;
  }

  G.Map = {
    world: world,
    mapOf: mapOf,
    at: at,
    walkable: walkable,
    interactables: interactables,
    interactableAt: interactableAt,
    interactableFrom: interactableFrom,
    transitionAt: transitionAt,
    decorTile: decorTile,
    decorName: decorName,
    tileName: tileName,
    tileIndex: tileIndex,
    bgKey: bgKey,
    enterDialog: enterDialog,
    cols: function (mapId) { var m = mapOf(mapId); return m ? (m.ascii[0] || '').length : 0; },
    rows: function (mapId) { var m = mapOf(mapId); return m ? m.ascii.length : 0; }
  };
})(window);
