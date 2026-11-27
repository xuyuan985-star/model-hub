/* web/game/engine/script.js — 对白播放器：顺序播放 lines、分支 choices、节点结束时执行 onEnd 指令（标记在对白播完之后才写）。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};

  function GD() { return w.GameData || {}; }

  function node(id) {
    var d = GD().dialog || {};
    return d[id] || null;
  }

  function create(hooks) {
    hooks = hooks || {};
    var st = {
      active: false,
      nodeId: null,
      node: null,
      line: 0,
      choices: null,
      waitingBattle: false,
      owner: null,
      visited: []
    };

    function fire(kind, payload) {
      if (typeof hooks[kind] === 'function') hooks[kind](payload);
    }

    function finish() {
      st.active = false;
      st.nodeId = null;
      st.node = null;
      st.line = 0;
      st.choices = null;
      fire('done', { owner: st.owner });
      st.owner = null;
    }

    /** 跳到 next 链上的下一个节点；没有 next 就收尾。 */
    function advanceNode() {
      var cur = st.node;
      if (cur && cur.next) { enter(cur.next); return; }
      finish();
    }

    /** 执行 onEnd：battle 必须停下来等战斗层回调，其余指令立即生效。 */
    function runOps(ops, next) {
      var list = ops || [], i, op, gd = GD();
      for (i = 0; i < list.length; i++) {
        op = list[i];
        if (!op) continue;
        if (op.op === 'battle') {
          st.waitingBattle = true;
          fire('battle', { id: op.id, resume: function () { st.waitingBattle = false; next(); } });
          return;
        }
        fire('op', op);
        if (op.op === 'chapter' && gd.narrative && op.id !== gd.narrative.chapterId) {
          fire('warn', { code: 'chapter-stop', id: op.id });
        }
      }
      next();
    }

    function enter(id) {
      var n = node(id);
      if (!n) { finish(); return; }
      st.active = true;
      st.nodeId = id;
      st.node = n;
      st.line = 0;
      st.choices = null;
      st.visited.push(id);
      fire('enter', { id: id, node: n });
      if (!n.lines || !n.lines.length) completeNode();
    }

    function currentLine() {
      if (!st.node || !st.node.lines) return null;
      return st.node.lines[st.line] || null;
    }

    /** 推进一句；最后一句之后进入分支或 onEnd。 */
    function next() {
      if (!st.active || st.waitingBattle) return null;
      var n = st.node;
      if (!n) return null;
      if (n.lines && st.line < n.lines.length - 1) {
        st.line++;
        fire('line', { id: st.nodeId, line: currentLine(), index: st.line });
        return currentLine();
      }
      if (n.choices && n.choices.length) {
        st.choices = n.choices;
        fire('choices', { id: st.nodeId, choices: n.choices });
        return null;
      }
      completeNode();
      return null;
    }

    function completeNode() {
      var n = st.node, id = st.nodeId;
      if (!n) { finish(); return; }
      fire('complete', { id: id, node: n });
      runOps(n.onEnd, function () {
        if (st.nodeId !== id) return;
        advanceNode();
      });
    }

    function choose(index) {
      if (!st.choices) return false;
      var c = st.choices[index];
      if (!c) return false;
      st.choices = null;
      var from = st.nodeId;
      fire('choose', { from: from, choice: c });
      enter(c.go);
      return true;
    }

    function start(id, owner) {
      st.owner = owner || null;
      st.visited = [];
      enter(id);
      return st.active;
    }

    function stop() {
      st.active = false;
      st.waitingBattle = false;
      st.node = null;
      st.nodeId = null;
      st.choices = null;
      st.owner = null;
    }

    return {
      state: st,
      start: start,
      next: next,
      choose: choose,
      stop: stop,
      isActive: function () { return st.active; },
      isWaitingBattle: function () { return st.waitingBattle; },
      currentLine: currentLine,
      nodeId: function () { return st.nodeId; },
      owner: function () { return st.owner; }
    };
  }

  G.Script = { create: create };
})(window);
