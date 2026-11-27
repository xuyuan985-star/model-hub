/* web/game/battle/enemies.js — 敌方 AI 与首领三阶段：只在配额允许时出手，护页、反刍、抹槽按阶段阈值单向推进。ES2019。 */
(function (w) {
  'use strict';
  var B = w.GameBattle = w.GameBattle || {};
  var GD = w.GameData || {};
  var C = B.CFG;

  /** 敌方技能表：不写进 GD.skills（那是角色技能），敌方招式只在本文件内闭环。 */
  B.enemyMoves = {
    bite: { id: 'bite', name: '啃页', cost: 2, power: 90, kind: 'attack' },
    repeat: { id: 'repeat', name: '复诵', cost: 2, power: 80, kind: 'attack_then_repeat' },
    steal: { id: 'steal', name: '窃槽', cost: 3, power: 60, kind: 'steal_slot' },
    audit: { id: 'audit', name: '规程', cost: 3, power: 85, kind: 'self_buff' },
    swallow: { id: 'swallow', name: '吞页', cost: 3, power: 70, kind: 'grow_shield' },
    spit: { id: 'spit', name: '反刍', cost: 3, power: 60, kind: 'spawn_add' },
    blank: { id: 'blank', name: '空白', cost: 2, power: 75, kind: 'erase_slot' }
  };

  /** 首领阶段：at 是剩余生命比例阈值，按顺序单向触发；护页机制只在第一阶段成立。 */
  B.phaseFor = function (enemy) {
    if (!enemy.phases) return null;
    var ratio = enemy.hp / enemy.maxHp;
    var pick = enemy.phases[0];
    for (var i = 0; i < enemy.phases.length; i++) {
      if (ratio <= enemy.phases[i].at) pick = enemy.phases[i];
    }
    return pick;
  };

  /** 阶段切换：进入新阶段时补一次护页/召唤，并记一条日志，避免「阈值悄悄生效」。 */
  B.syncPhase = function (state, enemy) {
    if (!enemy.phases) return null;
    var next = B.phaseFor(enemy);
    var idx = enemy.phases.indexOf(next);
    if (idx <= enemy.phaseIndex) return null;
    enemy.phaseIndex = idx;
    state.log.push({ turn: state.turn, kind: 'phase', target: enemy.uid, phase: next.name });
    if (next.name === '打嗝') {
      enemy.spitReady = true;
      B.spawnAdd(state, enemy, 'page_mite');
    }
    if (next.name === '空页') {
      enemy.shields = 0;
      enemy.spotsBlank = true;
    }
    return next;
  };

  /** 打嗝阶段吐出的小怪携带一条可打捞的情报（写进 intel 表，不额外占玩家槽）。 */
  B.spawnAdd = function (state, boss, enemyId) {
    var add = B.makeEnemy(enemyId, 'e:add:' + (state.enemies.length + 1) + ':' + enemyId);
    add.hp = Math.max(8, Math.round(add.hp * 0.6));
    add.maxHp = add.hp;
    add.isAdd = true;
    add.hintDrop = 'old_snapshot';
    state.enemies.push(add);
    state.log.push({ turn: state.turn, kind: 'spawn', enemy: add.uid, id: enemyId });
    return add;
  };

  /** 敌方选招：配额够就用招牌招，不够就退化成普通啃页，永不空转。 */
  B.enemyMove = function (state, enemy) {
    var kind = enemy.id;
    if (enemy.boss) {
      // 吞页有冷却：护页补得比撕得慢，才能让「撕页」成为解法而不是拉锯
      if (enemy.swallowCd > 0) enemy.swallowCd -= 1;
      if (enemy.spotsBlank && enemy.quota >= B.enemyMoves.blank.cost) return B.enemyMoves.blank;
      if (enemy.spitReady && enemy.quota >= B.enemyMoves.spit.cost) return B.enemyMoves.spit;
      if (enemy.swallowCd <= 0 && enemy.shields < enemy.shieldMax && enemy.quota >= B.enemyMoves.swallow.cost) {
        return B.enemyMoves.swallow;
      }
      if (enemy.quota >= B.enemyMoves.bite.cost) return B.enemyMoves.bite;
      return B.enemyMoves.bite;
    }
    if (kind === 'rank_auditor' && enemy.quota >= B.enemyMoves.audit.cost) return B.enemyMoves.audit;
    if (kind === 'cache_moth' && enemy.quota >= B.enemyMoves.steal.cost) return B.enemyMoves.steal;
    if (kind === 'faded_snapshot' && enemy.quota >= B.enemyMoves.repeat.cost) return B.enemyMoves.repeat;
    if (enemy.quota >= B.enemyMoves.bite.cost) return B.enemyMoves.bite;
    return B.enemyMoves.bite;
  };

  /**
   * 敌方一次行动：先按 kind 结算，再交给统一伤害口径。
   * 首领「吞食」阶段自增护页（上限 7），护页大于零时免疫正面伤害——不要靠堆血量硬扛。
   */
  B.enemyAct = function (state, enemy, rnd) {
    if (!enemy.alive) return null;
    var target = B.pickTarget(state, rnd);
    if (!target) return null;
    var move = B.enemyMove(state, enemy);
    if (enemy.quota < move.cost) move = B.enemyMoves.bite;
    enemy.quota = Math.max(0, enemy.quota - move.cost);
    var res = { enemy: enemy.uid, move: move.id, notes: [] };

    if (move.kind === 'attack' || move.kind === 'attack_then_repeat') {
      var hit = B.damage(state, enemy, target, null, { power: move.power, kind: 'enemy_attack' });
      res.damage = hit.amount;
      res.target = target.uid;
      enemy.lastAction = move.id;
      if (move.kind === 'attack_then_repeat') {
        res.notes.push('它把上一个动作重复了一遍');
        var again = B.damage(state, enemy, target, null, { power: move.power - 10, kind: 'enemy_repeat' });
        res.damage += again.amount;
      }
    } else if (move.kind === 'steal_slot') {
      var victim = B.aliveParty(state).filter(function (u) { return u.slots.length > 0; })[0];
      if (victim) {
        var stolen = victim.slots.pop();
        victim.forgotten.push(stolen);
        res.notes.push('偷走了' + victim.name + '的 1 项已写入内容');
        state.log.push({ turn: state.turn, kind: 'steal', from: victim.uid, slot: stolen.id });
      }
      var h2 = B.damage(state, enemy, target, null, { power: move.power });
      res.damage = h2.amount;
    } else if (move.kind === 'self_buff') {
      enemy.buffs = enemy.buffs.filter(function (b) { return b.id !== 'compliance'; });
      enemy.buffs.push({ id: 'compliance', name: '合规', turns: 2, defUp: 4 });
      res.notes.push('给自己挂了「合规」，防御 +4（断列可拆）');
      var h3 = B.damage(state, enemy, target, null, { power: move.power });
      res.damage = h3.amount;
    } else if (move.kind === 'grow_shield') {
      enemy.shields = Math.min(enemy.shieldMax, enemy.shields + 1);
      enemy.swallowCd = C.swallowCooldown;
      res.notes.push('吞下一页：护页 ' + enemy.shields + '/' + enemy.shieldMax);
      var h4 = B.damage(state, enemy, target, null, { power: move.power });
      res.damage = h4.amount;
    } else if (move.kind === 'spawn_add') {
      enemy.spitReady = false;
      B.spawnAdd(state, enemy, 'faded_snapshot');
      res.notes.push('反刍：吐出一个携带旧档案的小怪');
    } else if (move.kind === 'erase_slot') {
      var picked = B.aliveParty(state).filter(function (u) { return u.slots.length > 0; });
      var vic = picked.length ? B.pick(picked, rnd) : null;
      if (vic) {
        var gone = vic.slots.shift();
        gone.forgottenAt = state.turn;
        vic.forgotten.push(gone);
        res.notes.push('空白抹掉了' + vic.name + '的 1 个槽位（当场遗忘）');
      }
      var h5 = B.damage(state, enemy, target, null, { power: move.power });
      res.damage = h5.amount;
    }
    state.log.push({ turn: state.turn, kind: 'enemy', actor: enemy.uid, move: move.id, text: res.notes.join('；') });
    return res;
  };

  /** 敌方目标：优先血少的我方（不做随机斩杀，避免读档式难度）。 */
  B.pickTarget = function (state, rnd) {
    var alive = B.aliveParty(state);
    if (!alive.length) return null;
    alive.sort(function (a, b) { return a.hp - b.hp; });
    var pool = alive.slice(0, Math.min(2, alive.length));
    return pool[Math.floor((rnd ? rnd() : 0.5) * pool.length) % pool.length];
  };

  /** 护页层数回写：供 UI 显示，不改生命。 */
  B.shieldLeft = function (enemy) { return enemy.shields; };
})(window);
