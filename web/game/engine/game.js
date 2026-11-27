/* web/game/engine/game.js — 主循环与玩法编排：标题、探索、对白、战斗、菜单五种模式，负责存档落盘与场景切换。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};
  var TILE = 16, STEP_MS = 130;
  var NPC_SPRITE = {
    'st.xi': 'npc_xi', 'cl.jin': 'npc_jin', 'al.workshop': 'npc_pan',
    'al.juan': 'npc_juan', 'gh.mu': 'npc_mu', 'ar.kai': 'npc_kai', 'ar.desk': 'npc_jian'
  };
  var SKILL_ORDER = ['basic'];

  function GD() { return w.GameData || {}; }

  function create(deps) {
    var canvas = deps.canvas, render = deps.render, cam = deps.cam || null;
    var FIXED = 1000 / 60;
    var api = {
      mode: 'title', modeFrom: null, mapId: 'station', save: null, hasSave: false,
      player: { x: 7, y: 10, dir: 'down', frame: 0, moving: false, cool: 0 },
      dialog: { speakerName: '', text: '', choices: null, choiceIndex: 0, face: null, portrait: null },
      battle: null, tick: 0, toast: null, toastTick: 0, fade: 0, menuPage: 0, menuSel: 0, menuScroll: 0,
      input: null, script: null, steps: 0, npcs: listNpcs, menuDir: menuDir, menuAct: menuAct
    };

    var suppressRewards = false;
    var pendingBattle = null;
    var battleSnapshot = null;
    var activeInteract = null;

    /** 场上站着的人：已入队的同伴不再画在原地（他们跟着队伍走了）。 */
    function listNpcs() {
      var list = G.Map.interactables(api.mapId), out = [], i, it;
      for (i = 0; i < list.length; i++) {
        it = list[i];
        if (it.kind !== 'npc') continue;
        if (/^ch0\.joined\./.test(it.flag || '') && G.State.hasFlag(api.save, it.flag)) continue;
        out.push({ x: it.x, y: it.y, dir: 'down', sprite: NPC_SPRITE[it.id] || null, label: it.label, id: it.id });
      }
      return out;
    }

    var lastSaveAt = 0, savePending = false;

    /** 落盘：走位时按 600ms 节流，对白收尾/战斗结算/换图这类节点强制写一次。 */
    function save(force) {
      if (!api.save) return;
      api.save.map = api.mapId;
      api.save.x = api.player.x;
      api.save.y = api.player.y;
      api.save.dir = api.player.dir;
      api.save.at = Date.now();
      G.State.refreshQuest(api.save);
      var now = Date.now();
      if (!force && now - lastSaveAt < 600) { savePending = true; return; }
      lastSaveAt = now;
      savePending = false;
      G.Storage.save(api.save);
    }

    function toast(msg) { api.toast = msg; api.toastTick = 0; }

    function goMap(mapId, x, y, dir) {
      api.mapId = mapId;
      api.player.x = x; api.player.y = y;
      api.player.dir = dir || 'down';
      api.steps = 0;
      activeInteract = null;
      api.save.map = mapId; api.save.x = x; api.save.y = y;
      save(true);
      var node = G.Map.enterDialog(mapId);
      if (node && !api.save.seen[mapId + ':enter']) {
        G.State.markSeen(api.save, mapId + ':enter');
        startDialog(node);
      }
    }

    // ---------- 对白 ----------
    /** 逐行刷新说话人：名字、对话头像与整张立绘都跟着「这一句是谁说的」走。 */
    function refreshLine() {
      var line = api.script.currentLine();
      var node = (GD().dialog || {})[api.script.nodeId()] || {};
      var card = node.speaker ? G.State.castCard(node.speaker) : null;
      api.dialog.speakerName = card ? card.name : (node.speaker === 'narrator' ? '旁白' : (node.speaker || '旁白'));
      api.dialog.text = line ? line.text : '';
      if (line && line.who) api.dialog.speakerName = line.who;
      // 头像/立绘优先跟「这一句的 who」走（同一节点里可能换人说话），其次退回节点级 speaker 的角色卡
      var whoId = line && line.who ? whoIdOf(line.who) : node.speaker;
      var whoCard = whoId ? G.State.castCard(whoId) : null;
      api.dialog.face = saysFace(whoCard, node, line);
      api.dialog.portrait = saysPortrait(whoCard, node, line);
      if (!(api.script.state && api.script.state.choices)) {
        api.dialog.choices = null;
        api.dialog.choiceIndex = 0;
      }
    }

    /** 显示名 → 角色 id（「汐」「庭务」「你」「旁白」这类）。找不到就返回 null。 */
    function whoIdOf(name) {
      var GDd = GD(), cast = GDd.cast || {}, npc = GDd.npc || {}, k;
      for (k in cast) if (Object.prototype.hasOwnProperty.call(cast, k) && cast[k].name === name) return k;
      for (k in npc) if (Object.prototype.hasOwnProperty.call(npc, k) && npc[k].name === name) return k;
      return null;
    }

    /** 头像：角色有 face 就用；「你」= 玩家角色用观测者的；旁白/终端旁白不给头像。 */
    function saysFace(card, node, line) {
      if (line && line.who === '你') card = (GD().cast || {}).observer;
      if (!card) return null;
      return card.face || null;
    }

    /** 立绘：节点级 portrait（原版数据就是这个口径）优先，其次角色卡上的立绘。 */
    function saysPortrait(card, node, line) {
      if (node && node.portrait) return node.portrait;
      if (line && line.who === '你') return ((GD().cast || {}).observer || {}).portrait || null;
      return card ? (card.portrait || null) : null;
    }

    function startDialog(nodeId, replay) {
      if (!api.script) return;
      suppressRewards = !!replay;
      api.mode = 'dialog';
      api.dialog.choices = null;
      api.dialog.choiceIndex = 0;
      G.State.markSeen(api.save, nodeId);
      api.script.start(nodeId, 'engine');
      if (!api.script.isActive()) api.mode = 'explore';
      else refreshLine();
    }

    function applyOp(op) {
      var s = api.save, card;
      if (!op) return;
      if (op.op === 'flag') { G.State.setFlag(s, op.key); return; }
      // 幕间自定义指令（例如 {op:'mode'} 直接开某一幕的玩法）先给幕间；没人认领再走原版
      if (G.Interlude && G.Interlude.applyOp(s, op, api)) return;
      if (suppressRewards) return;
      if (op.op === 'item') { G.State.addItem(s, op.id, op.n || 1); return; }
      if (op.op === 'party') { G.State.joinParty(s, op.who); return; }
      if (op.op === 'slot') { G.State.addSlotCap(s, op.who, op.n || 1); return; }
      if (op.op === 'quota') { G.State.addQuotaCap(s, op.who, op.n || 1); return; }
      if (op.op === 'chapter') { s.chapter = op.id; return; }
      card = op.who ? G.State.castCard(op.who) : null;
      if (card && op.op === 'heal') s.hp[op.who] = card.stats.hp;
    }

    /** 对白收尾：交互点的 flag 只在整段真正播完、onEnd 执行之后写一次；中途取消不写。 */
    function dialogDone(completed) {
      if (completed && activeInteract && activeInteract.flag && !suppressRewards) {
        G.State.setFlag(api.save, activeInteract.flag);
      }
      activeInteract = null;
      api.mode = 'explore';
      api.dialog.choices = null;
      save(true);
    }

    /** 对白播完时模式可能已被幕间指令切走（例如 {op:'mode'} 直接开推演台），此时只收尾不改模式。 */
    function modeGrabbed() {
      return !!(G.Interlude && G.Interlude.isMode(api.mode));
    }

    function advanceDialog() {
      if (api.dialog.choices) { chooseDialog(api.dialog.choiceIndex); return; }
      api.script.next();
      if (api.script.isActive()) refreshLine();
      else if (!api.script.isWaitingBattle()) {
        if (modeGrabbed()) { activeInteract = null; save(true); }
        else dialogDone(true);
      }
    }

    function chooseDialog(i) {
      if (!api.dialog.choices) return;
      api.script.choose(i);
      if (api.script.isActive()) refreshLine();
      else if (modeGrabbed()) { activeInteract = null; save(true); }
      else dialogDone(true);
    }

    function moveChoice(delta) {
      if (!api.dialog.choices) return;
      var n = api.dialog.choices.length;
      api.dialog.choiceIndex = (api.dialog.choiceIndex + delta + n) % n;
    }

    // ---------- 战斗 ----------
    function partyUnits() {
      return api.save.party.map(function (id) {
        return { id: id, hp: api.save.hp[id], quota: api.save.quota[id], slots: api.save.slots[id] };
      });
    }

    function startBattle(encounterId, resume) {
      var B = w.GameBattle;
      // 战斗层缺失时不能把对白卡死在 waitingBattle：提示后继续走剧本
      if (!B || !B.Battle) { toast('战斗层未加载，这场先跳过'); if (resume) resume(); return; }
      battleSnapshot = { hp: JSON.parse(JSON.stringify(api.save.hp)), quota: JSON.parse(JSON.stringify(api.save.quota)), slots: JSON.parse(JSON.stringify(api.save.slots)) };
      var seed = (Date.now() % 100000) + Object.keys(api.save.flags).length;
      var settled = false;
      var handle = B.Battle.start({
        encounterId: encounterId,
        party: partyUnits(),
        seed: seed,
        onBattleEnd: function (report) { settled = true; finishBattle(report, encounterId, resume); }
      });
      // 战斗层若在 start 内就结算（桩或极短局），不再进入战斗界面
      if (settled) return;
      scaleForParty(handle.state);
      api.mode = 'battle';
      // 标题优先用遭遇战登记名；遇敌表抽出来的杂兵战就用敌人名字拼一个（不要一屏「遭遇 · 遇敌」）
      var title = (B.encounters[encounterId] && B.encounters[encounterId].name) || null;
      if (!title) {
        var names = [];
        for (var ei = 0; ei < handle.state.enemies.length; ei++) {
          var en = handle.state.enemies[ei];
          if (en.alive && names.indexOf(en.name) < 0) names.push(en.name);
        }
        title = names.join(' · ') || '遇敌';
      }
      api.battle = {
        id: encounterId, handle: handle,
        title: title,
        actorIndex: 0, skillIndex: 0, targetIndex: 0, actions: [],
        hint: ''
      };
      syncBattleCursor();
    }

    /** 队伍不满六人时按人数收缩敌群：数量不超人数，血量攻力同向下调，避免开局单挑满编怪只能重开。 */
    function scaleForParty(state) {
      var n = state.party.length, i;
      if (state.boss || n >= 6) return;
      var cap = Math.max(1, n);
      while (state.enemies.length > cap) {
        var cut = state.enemies.pop();
        if (cut) cut.alive = false;
      }
      var hpMul = G.Util.clamp(Math.pow(n / 6, 0.85), 0.18, 1);
      var atkMul = G.Util.clamp(0.28 + 0.72 * n / 6, 0.28, 1);
      for (i = 0; i < state.enemies.length; i++) {
        var e = state.enemies[i];
        e.maxHp = Math.max(6, Math.round(e.maxHp * hpMul));
        e.hp = e.maxHp;
        e.atk = Math.max(2, Math.round(e.atk * atkMul));
      }
    }

    function aliveActors() {
      return api.battle.handle.state.party.filter(function (u) { return u.alive; });
    }

    function currentActor() {
      var list = aliveActors();
      return list[api.battle.actorIndex] || null;
    }

    function skillsOf(unit) {
      var card = (GD().cast || {})[unit.id];
      var ids = SKILL_ORDER.concat((card && card.skills) || []);
      var out = [], i, sk;
      for (i = 0; i < ids.length; i++) {
        sk = ids[i] === 'basic' ? w.GameBattle.BASIC : (GD().skills || {})[ids[i]];
        if (!sk) continue;
        if (sk.id !== 'basic' && sk.cost > unit.quota) continue;
        out.push(sk);
      }
      return out;
    }

    function syncBattleCursor() {
      var b = api.battle;
      if (!b) return;
      var ulist = aliveActors();
      if (b.actorIndex >= ulist.length) b.actorIndex = 0;
      var u = ulist[b.actorIndex];
      if (!u) return;
      var sk = skillsOf(u);
      if (b.skillIndex >= sk.length) b.skillIndex = 0;
      var en = b.handle.state.enemies.filter(function (e) { return e.alive; });
      if (b.targetIndex >= en.length) b.targetIndex = 0;
      b.skillName = (sk[b.skillIndex] || { name: '出手' }).name;
      b.skillCost = (sk[b.skillIndex] || {}).cost || 0;
      b.hint = u.name + '：' + b.skillName + ' → ' + ((en[b.targetIndex] || {}).name || '无目标');
    }

    function battleAction() {
      var b = api.battle, u = currentActor();
      if (!u) return;
      var sk = skillsOf(u)[b.skillIndex] || { id: 'basic' };
      var en = b.handle.state.enemies.filter(function (e) { return e.alive; });
      var target = en[b.targetIndex];
      if (!target && sk.scope !== 'self' && sk.scope !== 'party') { toast('没有可攻击的目标'); return; }
      b.actions.push({ actor: u.uid, skill: sk.id, target: target ? target.uid : null });
      b.actorIndex += 1;
      if (b.actorIndex >= aliveActors().length) {
        var plan = b.actions.slice();
        b.actions = [];
        b.actorIndex = 0;
        var report = b.handle.step(plan);
        if (report && report.result !== undefined && report.result !== null) return;
        syncBattleCursor();
      } else {
        b.skillIndex = 0; b.targetIndex = 0;
        syncBattleCursor();
      }
    }

    function finishBattle(report, encounterId, resume) {
      var s = api.save, i;
      if (report) {
        // 战报字段可缺省：只回写战斗层真正给出的部分，避免把存档写空
        var rHp = report.partyHp || {}, rQuota = report.partyQuota || {}, rSlots = report.partySlots || {};
        if (report.result === 'win' || report.result === 'flee') {
          for (i = 0; i < s.party.length; i++) {
            var id = s.party[i];
            if (rHp[id] != null) s.hp[id] = Math.max(1, rHp[id]);
            if (rQuota[id] != null) s.quota[id] = rQuota[id];
            if (rSlots[id]) s.slots[id] = rSlots[id];
          }
          (report.flags || []).forEach(function (f) { G.State.setFlag(s, f); });
          (report.drops || []).forEach(function (d) { G.State.addItem(s, d.id, d.n); });
          if (report.drops && report.drops.length) toast('获得 ' + report.drops.map(function (d) { return (GD().items[d.id] || {}).name || d.id; }).join('、'));
        } else {
          s.hp = battleSnapshot.hp;
          s.quota = battleSnapshot.quota;
          s.slots = battleSnapshot.slots;
          toast('这一页没读完，可以再来一次');
        }
      }
      api.battle = null;
      api.mode = 'explore';
      save(true);
      if (resume) resume();
      if (report && report.result === 'win' && encounterId === 'devourer') {
        startDialog('d_boss_defeat');
      }
    }

    function battleAuto() {
      var b = api.battle;
      if (!b) return;
      var r = b.handle.auto();
      if (!r || r.result == null) { toast('自动结算不可用'); }
    }

    // ---------- 探索 ----------
    function tryMove(dx, dy) {
      var p = api.player, dir = G.Util.dirOf(dx, dy);
      if (dir) p.dir = dir;
      var nx = p.x + dx, ny = p.y + dy;
      if (!G.Map.walkable(api.mapId, nx, ny)) return;
      p.x = nx; p.y = ny; p.moving = true; p.frame = p.frame === 1 ? 2 : 1;
      save();
      var tr = G.Map.transitionAt(api.mapId, nx, ny);
      if (tr) { goMap(tr.to, tr.tx, tr.ty, tr.dir); return; }
      api.steps += 1;
      checkBoss();
      checkEncounter();
    }

    function checkBoss() {
      var m = G.Map.mapOf(api.mapId);
      if (!m || !m.boss) return;
      if (!G.State.hasFlag(api.save, m.boss.triggerFlag)) return;
      if (G.State.hasFlag(api.save, 'ch0.boss.done')) return;
      var d = Math.abs(api.player.x - m.boss.at.x) + Math.abs(api.player.y - m.boss.at.y);
      if (d <= 1) startDialog('d_boss_intro');
    }

    function checkEncounter() {
      var m = G.Map.mapOf(api.mapId);
      if (!m || !m.encounters) return;
      if (m.encounters.until && G.State.hasFlag(api.save, m.encounters.until)) return;
      if (api.steps < m.encounters.steps) return;
      api.steps = 0;
      startBattle(m.encounters.table, null);
    }

    function interact() {
      var it = G.Map.interactableFrom(api.mapId, api.player.x, api.player.y, api.player.dir);
      if (!it) { toast('这里没有可以读的东西'); return; }
      if (!it.dialog) { toast((it.label || '') + '：暂时没有内容'); return; }
      var replay = !!(it.flag && G.State.hasFlag(api.save, it.flag));
      activeInteract = { id: it.id, flag: it.flag };
      startDialog(it.dialog, replay);
    }

    // ---------- 菜单 ----------
    /** 菜单页：0 记录 / 1 角色 / 2 图鉴 / 3 设置。左右翻页，上下在「角色」页里换人。 */
    var MENU_PAGES = 4;
    function menuPageCount() { return MENU_PAGES; }
    function menuDir(dir) {
      if (dir === 'left') { api.menuPage = (api.menuPage + menuPageCount() - 1) % menuPageCount(); api.menuScroll = 0; return; }
      if (dir === 'right') { api.menuPage = (api.menuPage + 1) % menuPageCount(); api.menuScroll = 0; return; }
      if (api.menuPage === 1) {
        var n = (GD().partyOrder || []).length || 6;
        if (dir === 'up') api.menuSel = (api.menuSel + n - 1) % n;
        else if (dir === 'down') api.menuSel = (api.menuSel + 1) % n;
      } else if (api.menuPage === 2) {
        if (dir === 'up') api.menuScroll = Math.max(0, (api.menuScroll || 0) - 1);
        else if (dir === 'down') api.menuScroll = (api.menuScroll || 0) + 1;
      }
    }
    function menuAct() {
      if (api.menuPage === 1) {
        var n = (GD().partyOrder || []).length || 6;
        api.menuSel = (api.menuSel + 1) % n;
      } else if (api.menuPage === 2) {
        api.menuScroll = (api.menuScroll || 0) + 1;
      }
    }

    // ---------- 调度 ----------
    function onDir(dir) {
      if (api.mode === 'title') return;
      if (api.mode === 'menu') { menuDir(dir); return; }
      if (api.mode === 'dialog') {
        if (api.dialog.choices) {
          if (dir === 'up') moveChoice(-1);
          else if (dir === 'down') moveChoice(1);
        }
        return;
      }
      // 幕间玩法模式优先消费方向键（例如推演台的选列 / 选卡）
      if (G.Interlude && G.Interlude.inputMode(api, 'dir', dir)) return;
      if (api.mode === 'battle') {
        var b = api.battle;
        if (dir === 'up') { b.skillIndex = (b.skillIndex + 1) % Math.max(1, skillsOf(currentActor()).length); }
        else if (dir === 'down') { b.skillIndex = (b.skillIndex - 1 + Math.max(1, skillsOf(currentActor()).length)) % Math.max(1, skillsOf(currentActor()).length); }
        else if (dir === 'left') { b.targetIndex = (b.targetIndex + 1) % Math.max(1, b.handle.state.enemies.filter(function (e) { return e.alive; }).length); }
        else if (dir === 'right') {
          var n = Math.max(1, b.handle.state.enemies.filter(function (e) { return e.alive; }).length);
          b.targetIndex = (b.targetIndex - 1 + n) % n;
        }
        syncBattleCursor();
        return;
      }
      var d = G.Util.DIRS[dir];
      if (d) { api.player.cool = 0; tryMove(d[0], d[1]); }
    }

    function onAction() {
      if (api.mode === 'title') {
        // 幕间可以认领标题页的「空格」（首章通关后进入幕间）
        if (G.Interlude && G.Interlude.titleAct(api)) return;
        api.mode = 'explore';
        if (!api.hasSave) startDialog('d_wake');
        return;
      }
      if (api.mode === 'dialog') { advanceDialog(); return; }
      if (G.Interlude && G.Interlude.inputMode(api, 'act')) return;
      if (api.mode === 'battle') { battleAction(); return; }
      if (api.mode === 'menu') { menuAct(); return; }
      interact();
    }

    function onCancel() {
      if (G.Interlude && G.Interlude.inputMode(api, 'back')) return;
      if (api.mode === 'menu') { api.mode = 'explore'; return; }
      if (api.mode === 'dialog' && !api.script.isWaitingBattle()) { api.script.stop(); dialogDone(false); return; }
      if (api.mode === 'battle') { toast('首领战不能中途离场'); return; }
    }

    function onAuto() {
      if (G.Interlude && G.Interlude.inputMode(api, 'auto')) return;
      if (api.mode !== 'battle' || !api.battle) return;
      if (!api.battle.handle.canAuto()) { toast('这一场要自己打完'); return; }
      battleAuto();
    }

    function onMenu() {
      if (G.Interlude && G.Interlude.inputMode(api, 'menu')) return;
      if (api.mode === 'battle' || api.mode === 'dialog') return;
      api.mode = api.mode === 'menu' ? 'explore' : 'menu';
    }

    // ---------- 幕间玩法模式切换 ----------
    /** 切进幕间玩法模式（例：推演台）。原版模式名保持不变，退出时回到 explore。 */
    function startMode(modeId) {
      var m = G.Interlude && G.Interlude.mode ? G.Interlude.mode(modeId) : null;
      if (!m) { toast('这个玩法还没有装上'); return false; }
      var prev = api.mode;
      api.mode = modeId;
      api.modeFrom = prev;
      if (typeof m.enter === 'function') m.enter(api);
      save(true);
      return true;
    }

    function endMode() {
      var m = G.Interlude && G.Interlude.mode ? G.Interlude.mode(api.mode) : null;
      if (m && typeof m.exit === 'function') m.exit(api);
      var from = api.modeFrom;
      // 从标题页进来的回标题页，从对白进来的回探索（对白自身会被随后 startDialog 重新接管）
      if (from === 'title') api.mode = 'title';
      else if (from && from !== 'dialog') api.mode = from;
      else api.mode = 'explore';
      api.modeFrom = null;
      save(true);
    }

    api.startMode = startMode;
    api.endMode = endMode;
    /** 幕间用：播一段对白、弹一条提示（注意 api.toast 是提示文本本身，这里叫 showToast）。 */
    api.startDialog = startDialog;
    api.showToast = toast;
    /** 验收/调试用：直接开一场遭遇战（encounterId 也可以是 GD.enemies 里的敌人 id）。 */
    api.startBattle = startBattle;

    api.boot = function () {
      var raw = G.Storage.load();
      if (raw) {
        api.save = G.State.migrate(raw) || G.State.create();
        api.hasSave = true;
      } else {
        api.save = G.State.create();
      }
      api.mapId = api.save.map || 'station';
      api.player.x = api.save.x; api.player.y = api.save.y; api.player.dir = api.save.dir || 'down';
      api.script = G.Script.create({
        enter: function () { },
        line: function () { refreshLine(); },
        choices: function (p) { api.dialog.choices = p.choices; api.dialog.choiceIndex = 0; },
        complete: function () { },
        done: function () {
          if (api.script.isWaitingBattle()) return;
          // 战斗结果或幕间玩法模式可能已经把模式切走，此时只清交互上下文，不写 flag、不改模式
          if (api.mode === 'battle' || (G.Interlude && G.Interlude.isMode(api.mode))) { activeInteract = null; return; }
          if (api.mode === 'dialog') dialogDone(true);
        },
        op: function (op) { applyOp(op); },
        warn: function (p) { if (p && p.code === 'chapter-stop') toast('本章到此为止'); },
        battle: function (p) { pendingBattle = p; startBattle(p.id, p.resume); }
      });
      api.input = G.Input.create(canvas, { dir: onDir, action: onAction, cancel: onCancel, menu: onMenu, auto: onAuto });
      var keys = ['tiles_world'].concat(
        Object.keys((G.Assets.manifest() || {}).items || {}).filter(function (k) {
          return /^(pc_|npc_|face_|boss_|bg_|fx_|ui_)/.test(k) && k.indexOf('pt_') !== 0;
        })
      );
      G.Assets.preload(keys);
      api.mode = 'title';
    };

    var last = 0, acc = 0;

    /** 固定步长推进一次逻辑：输入复读、走位收脚、镜头跟随都在这里，渲染按帧独立进行。 */
    function step() {
      api.tick += 1;
      if (savePending && Date.now() - lastSaveAt >= 600) save(true);
      if (api.toastTick <= 200) api.toastTick += 1;
      if (api.input) api.input.tick(FIXED);
      if (api.mode === 'explore') {
        api.player.cool += FIXED;
        if (api.player.cool > STEP_MS) { api.player.frame = 0; api.player.moving = false; }
      }
      if (G.Interlude) G.Interlude.step(api, FIXED);
      if (cam && cam.follow && api.save) cam.follow(api.mapId, api.player.x, api.player.y);
    }

    api.start = function () {
      last = 0; acc = 0;
      function loop(t) {
        var dt = last ? Math.min(200, t - last) : FIXED;
        last = t;
        acc += dt;
        // 单帧最多补 5 步，切后台回来不会一次瞬移
        var n = 0;
        while (acc >= FIXED && n < 5) { step(); acc -= FIXED; n++; }
        if (n === 5) acc = 0;
        try { render.frame(api); } catch (err) { w.__renderErr = w.__renderErr || err; }
        w.requestAnimationFrame(loop);
      }
      w.requestAnimationFrame(loop);
    };

    // 输入入口对外暴露一层，触控按钮与自动化测试都走这里
    api.dir = onDir;
    api.act = onAction;
    api.back = function () {
      if (api.mode === 'menu') { api.mode = 'explore'; return true; }
      if (api.mode === 'dialog') { onCancel(); return true; }
      if (api.mode === 'battle') { toast('首领战不能中途离场'); return true; }
      return false;
    };
    /** 切后台/被系统回收前强制落盘一次。 */
    api.flush = function () { save(true); };
    api.cancel = onCancel;
    api.menu = onMenu;
    api.auto = onAuto;
    api.interact = interact;

    return api;
  }

  G.Game = { create: create };
})(window);
