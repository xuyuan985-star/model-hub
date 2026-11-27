/* web/game/battle/battle.js — 战斗状态机：遇敌表、回合推进、自动结算、首领三阶段与战报回传。不读写存档、不碰 DOM。ES2019。 */
(function (w) {
  'use strict';
  var B = w.GameBattle = w.GameBattle || {};
  var GD = w.GameData || {};

  /**
   * 普通战遇敌表：与 world.js 的 encounters.table 一一对应。
   * hpScale 把 characters.js 里的单体血量放大到「满队 3–5 回合」的实际战线长度，
   * 不放大小怪的攻击力，避免一场普通战就把队伍的配额和生命打穿。
   */
  B.tables = {
    colonnade: [
      { id: 'colonnade_a', enemies: ['page_mite'], weight: 3, hpScale: 4 },
      { id: 'colonnade_b', enemies: ['page_mite', 'page_mite'], weight: 2, hpScale: 3 },
      { id: 'colonnade_c', enemies: ['cache_moth'], weight: 2, hpScale: 4 },
      { id: 'colonnade_d', enemies: ['rank_auditor'], weight: 1, hpScale: 3 }
    ],
    alley: [
      { id: 'alley_a', enemies: ['faded_snapshot'], weight: 3, hpScale: 4 },
      { id: 'alley_b', enemies: ['faded_snapshot', 'page_mite'], weight: 2, hpScale: 3 },
      { id: 'alley_c', enemies: ['rank_auditor', 'page_mite'], weight: 1, hpScale: 3 }
    ],
    greenhouse: [
      { id: 'gh_a', enemies: ['cache_moth', 'page_mite'], weight: 3, hpScale: 3 },
      { id: 'gh_b', enemies: ['cache_moth', 'cache_moth'], weight: 2, hpScale: 3 },
      { id: 'gh_c', enemies: ['rank_auditor', 'faded_snapshot'], weight: 1, hpScale: 3 }
    ]
  };

  /** 首领战：单场，手动；阶段阈值由 characters.js 的 phases 决定，此处只给护页上限与掉落。 */
  B.encounters = {
    devourer: { id: 'devourer', boss: true, enemies: ['devourer'], manual: true, name: '吞页兽' }
  };

  /** 掉落：普通战按敌人自身 drops，首领额外必掉 page_zero（与结局道具分开，结局再发一次也不冲突）。 */
  B.rollDrops = function (state, rnd) {
    var got = {};
    if (state.result !== 'win') return [];
    state.enemies.forEach(function (e) {
      if (e.isAdd && e.hintDrop) { got[e.hintDrop] = (got[e.hintDrop] || 0) + 1; return; }
      (e.drops || []).forEach(function (id) {
        if (rnd() < 0.6) got[id] = (got[id] || 0) + 1;
      });
    });
    var out = [];
    Object.keys(got).sort().forEach(function (id) { out.push({ id: id, n: got[id] }); });
    return out;
  };

  /** 按 weight 从遇敌表抽一组敌群；seed 相同则抽到的组合相同。 */
  B.rollGroup = function (table, rnd) {
    var list = B.tables[table];
    if (!list || !list.length) return null;
    var total = 0;
    list.forEach(function (g) { total += g.weight || 1; });
    var roll = rnd() * total;
    for (var i = 0; i < list.length; i++) {
      roll -= list[i].weight || 1;
      if (roll < 0) return list[i];
    }
    return list[list.length - 1];
  };

  /** 建局：encounterId 既可是首领 id，也可是 world.js 的遇敌表名；party 只带 hp/quota/slots 三项可变状态。 */
  B.create = function (opts) {
    var o = opts || {};
    var seed = o.seed === undefined ? 20260101 : (o.seed >>> 0);
    var rnd = B.rng(seed);
    var enc = o.encounterId && B.encounters[o.encounterId];
    var table = null;
    var group = null;
    var enemyList;
    if (enc) {
      enemyList = enc.enemies;
    } else if (o.encounterId && B.tables[o.encounterId]) {
      table = o.encounterId;
      group = B.rollGroup(table, rnd);
      if (!group) throw new Error('battle: 空遇敌表 ' + table);
      enemyList = group.enemies;
    } else if (o.enemies) {
      enemyList = o.enemies;
    } else {
      throw new Error('battle: 未知遭遇 ' + o.encounterId);
    }

    var party = (o.party || []).map(function (p) { return B.makeUnit(p); });
    if (o.owned) B.applyGrowth(party, o.owned);
    var enemies = [];
    var hpScale = (group && group.hpScale) || 1;
    enemyList.forEach(function (id, i) {
      var unit = B.makeEnemy(id, 'e:' + id + ':' + (i + 1));
      if (hpScale > 1 && !unit.boss) {
        unit.maxHp = Math.round(unit.maxHp * hpScale);
        unit.hp = unit.maxHp;
      }
      enemies.push(unit);
    });

    var state = {
      encounterId: enc ? enc.id : (group ? group.id : (o.encounterId || 'custom')),
      table: table,
      groupId: group ? group.id : null,
      boss: enc ? !!enc.boss : false,
      manual: enc ? !!enc.manual : !!o.manual,
      seed: o.seed === undefined ? 20260101 : (o.seed >>> 0),
      turn: 1,
      party: party,
      enemies: enemies,
      intel: {},
      clones: [],
      log: [],
      longtake: 0,
      longtakeTurns: 0,
      longtakeEngaged: false,
      prudent: 0,
      orderLock: false,
      preview: null,
      result: null,
      ended: false,
      flags: [],
      drops: []
    };
    state.rnd = rnd;
    // 分镜：战斗开始时先公开一次下一回合顺序（幕在场时才成立）
    if (B.hasSkill(state, 'storyboard')) {
      state.preview = B.turnOrder(state).map(function (u) { return u.uid; });
      state.log.push({ turn: 1, kind: 'storyboard', text: '开场分镜：下一回合顺序已公开' });
    }
    return state;
  };

  B.hasSkill = function (state, skillId) {
    return state.party.some(function (u) {
      var card = (GD.cast || {})[u.id];
      return !!(card && (card.skills || []).indexOf(skillId) >= 0);
    });
  };

  /** 一次行动：玩家指定谁对谁用什么；不带 skillId 即普通出手（0 费）。 */
  B.act = function (state, actorUid, skillId, targetUid, opts) {
    if (state.ended) return { ok: false, reason: 'battle_ended' };
    var actor = B.findUnit(state, actorUid);
    if (!actor || !actor.alive || actor.acted) return { ok: false, reason: 'actor_unavailable' };
    var res;
    if (!skillId || skillId === 'basic') {
      var target = targetUid ? B.findUnit(state, targetUid) : B.aliveEnemies(state)[0];
      if (!target) return { ok: false, reason: 'no_target' };
      var hit = B.damage(state, actor, target, null, { power: 100, kind: 'basic' });
      res = { ok: true, skill: 'basic', damage: hit.amount, target: target.uid };
      state.log.push({ turn: state.turn, kind: 'basic', actor: actor.uid, target: target.uid, amount: hit.amount });
    } else {
      res = B.useSkill(state, actor, skillId, targetUid, opts);
      if (!res.ok) return res;
    }
    actor.acted = true;
    B.syncPhases(state);
    B.checkEnd(state);
    return res;
  };

  /** 敌方回合：逐个行动，护页与阶段在这里推进。 */
  B.enemyTurn = function (state) {
    if (state.ended) return [];
    var acts = [];
    B.aliveEnemies(state).forEach(function (e) {
      var r = B.enemyAct(state, e, state.rnd);
      if (r) acts.push(r);
      B.syncPhases(state);
      B.checkEnd(state);
    });
    return acts;
  };

  B.syncPhases = function (state) {
    state.enemies.forEach(function (e) {
      if (e.alive) B.syncPhase(state, e);
    });
  };

  /** 一整个回合：回合开始回配额 → 我方行动（手动或 AI）→ 敌方行动 → 提交并进入下一回合。 */
  B.step = function (state, actions) {
    if (state.ended) return { ok: false, reason: 'battle_ended' };
    var report = { turn: state.turn, party: [], enemy: [] };
    B.turnStart(state);
    var plan = actions && actions.length ? actions : B.autoPlan(state);
    plan.forEach(function (a) {
      var r = B.act(state, a.actor, a.skill, a.target, a.opts);
      if (r && r.ok) report.party.push(r);
    });
    if (!state.ended) report.enemy = B.enemyTurn(state);
    B.checkEnd(state);
    report.result = state.result;
    if (!state.ended) state.turn += 1;
    return report;
  };

  /** 自动结算：普通战可一键；首领必须手动（battlePolicy.manualEncounters）。 */
  B.runAuto = function (state, maxTurns) {
    var limit = maxTurns || 40;
    while (!state.ended && state.turn <= limit) B.step(state, null);
    if (!state.ended) { state.result = 'lose'; state.ended = true; }
    return B.finish(state);
  };

  /**
   * 自动出招：先拆护页，再补情报，最后输出；低频技能每场只放一次，不做无意义重复。
   * 顺序刻意「先情报后输出」，因为情报是伤害口径的一部分，不是装饰。
   */
  B.autoPlan = function (state) {
    var plan = [];
    var enemies = B.aliveEnemies(state);
    var shielded = enemies.filter(function (e) { return e.shields > 0; })[0];
    var weakest = enemies.slice().sort(function (a, b) { return a.hp - b.hp; })[0];
    var minQuota = (GD.skillBudget && GD.skillBudget.longthinkMinQuota) || 4;

    /** 按固定优先级挑一招：先撕护页，再补情报，然后支援，最后输出。 */
    var chooseFor = function (u, o) {
      var card = (GD.cast || {})[u.id];
      var skills = (card && card.skills) || [];
      for (var i = 0; i < skills.length; i++) {
        var sk = GD.skills[skills[i]];
        if (!sk || sk.cost > u.quota) continue;
        var eff = sk.effect;
        if (eff === 'strip_buff' && o.strip) return { actor: u.uid, skill: sk.id, target: o.strip };
        if (eff === 'spend_all_quota_true_damage' && o.longthink && u.quota >= minQuota) {
          return { actor: u.uid, skill: sk.id, target: o.longthink };
        }
        if ((eff === 'intel_enemy' || eff === 'intel_dual_form') && o.intel) {
          return { actor: u.uid, skill: sk.id, target: o.intel };
        }
        if (eff === 'spawn_observers' && o.swarm) {
          return { actor: u.uid, skill: sk.id, target: o.swarm[0], opts: { targets: o.swarm } };
        }
        if (eff === 'merge_intel' && o.digest) return { actor: u.uid, skill: sk.id };
        if (eff === 'quota_regen_double' && o.refill) return { actor: u.uid, skill: sk.id };
        if (eff === 'quota_transfer' && o.gift) return { actor: u.uid, skill: sk.id, target: o.gift };
        if (eff === 'order_preview_lock' && o.storyboard) return { actor: u.uid, skill: sk.id };
        if (eff === 'scene_stack' && o.longtake) return { actor: u.uid, skill: sk.id };
        if (eff === 'first_hit_halved' && o.prudent) return { actor: u.uid, skill: sk.id };
        if (eff === 'restore_forgotten' && o.recall) return { actor: u.uid, skill: sk.id };
      }
      return null;
    };

    B.aliveParty(state).forEach(function (u) {
      var unobserved = enemies.filter(function (e) { return !state.intel[e.uid]; })[0];
      var needy = B.aliveParty(state).filter(function (x) { return x !== u && x.quota <= x.quotaRegen; })[0];
      var buffed = enemies.filter(function (e) { return e.buffs.length > 0; })[0];
      var intelSlots = u.slots.filter(function (s) { return s.type === 'intel'; }).length;
      var o = {
        strip: shielded ? shielded.uid : (buffed ? buffed.uid : null),
        longthink: shielded ? shielded.uid : (weakest && weakest.hp <= u.atk * 3 ? weakest.uid : null),
        intel: unobserved ? unobserved.uid : null,
        swarm: unobserved && enemies.length >= 2 ? [enemies[0].uid, enemies[1].uid] : null,
        digest: intelSlots >= 2,
        refill: u.quota <= u.quotaMax - u.quotaRegen,
        gift: needy ? needy.uid : null,
        storyboard: !state.orderLock,
        longtake: state.longtake <= 0 && u.quota >= 8,
        prudent: state.prudent <= 0 && u.quota >= 6,
        recall: u.forgotten.length > 0
      };
      var chose = chooseFor(u, o);
      if (!chose) {
        var t = weakest || enemies[0];
        chose = t ? { actor: u.uid, skill: 'basic', target: t.uid } : { actor: u.uid, skill: 'basic' };
      }
      plan.push(chose);
    });
    return plan;
  };

  B.checkEnd = function (state) {
    if (state.ended) return state.result;
    if (!B.aliveEnemies(state).length) { state.result = 'win'; state.ended = true; }
    else if (!B.aliveParty(state).length) { state.result = 'lose'; state.ended = true; }
    return state.result;
  };

  /** 结束结算：长镜断场、掉落、标记、回传三项可变状态；不改存档、不碰 UI。 */
  B.finish = function (state) {
    B.checkEnd(state);
    B.endLongtake(state, 'battle_end');
    if (state.result === 'win') {
      state.drops = B.rollDrops(state, state.rnd);
      if (state.boss) state.flags = state.flags.concat(['ch0.boss.done']);
    }
    var partyHp = {}, partyQuota = {}, partySlots = {}, partyGrowth = {};
    state.party.forEach(function (u) {
      partyHp[u.id] = u.hp;
      partyQuota[u.id] = u.quota;
      partySlots[u.id] = { cap: u.slotCap, used: u.slots, forgotten: u.forgotten };
      partyGrowth[u.id] = u.constellation || 0;
    });
    return {
      result: state.result,
      flags: state.flags.slice(),
      drops: state.drops.slice(),
      partyHp: partyHp,
      partyQuota: partyQuota,
      partySlots: partySlots,
      partyGrowth: partyGrowth,
      turns: state.turn,
      log: state.log.slice()
    };
  };

  /** 自动结算的准入：队伍平均战力高于敌群两档、且全体生命高于 70%（battlePolicy.autoRule）。 */
  B.autoEligible = function (state) {
    if (state.boss) return false;
    var avgParty = B.avgPower(state.party);
    var avgEnemy = B.avgPower(state.enemies);
    var healthy = B.aliveParty(state).every(function (u) { return u.hp >= u.maxHp * 0.7; });
    return healthy && avgParty >= avgEnemy * 1.15;
  };

  B.avgPower = function (list) {
    var live = list.filter(function (u) { return u.alive; });
    if (!live.length) return 0;
    var sum = 0;
    live.forEach(function (u) { sum += u.atk + u.def + u.spd / 4; });
    return sum / live.length;
  };

  /** 撤退：没有惩罚、不消耗资源，只把结果标成 flee，交由引擎决定回到哪一格。 */
  B.flee = function (state) {
    if (state.ended) return B.finish(state);
    state.result = 'flee';
    state.ended = true;
    state.log.push({ turn: state.turn, kind: 'flee', text: '离场：这一页先不读完' });
    return B.finish(state);
  };

  /**
   * 对外唯一入口：引擎调它，拿战报；战斗层不知道存档、地图与 UI 的存在。
   * onBattleEnd 只回调一次——无论是手动打到结束、自动结算还是撤退。
   */
  var Battle = {
    version: B.version,
    tables: B.tables,
    encounters: B.encounters,
    start: function (opts) {
      var o = opts || {};
      var state = B.create(o);
      var settled = false;
      var notify = function (report) {
        if (settled) return report;
        settled = true;
        if (typeof o.onBattleEnd === 'function') o.onBattleEnd(report);
        return report;
      };
      var wrap = function (report) {
        return (state.ended && report && report.result !== undefined) ? notify(report) : report;
      };
      return {
        state: state,
        act: function (actor, skill, target, extra) { return wrap(B.act(state, actor, skill, target, extra)); },
        step: function (actions) {
          B.step(state, actions);
          return wrap(state.ended ? B.finish(state) : { turn: state.turn, result: null });
        },
        auto: function () { return notify(B.runAuto(state)); },
        flee: function () { return notify(B.flee(state)); },
        end: function () { return wrap(B.finish(state)); },
        canAuto: function () { return B.autoEligible(state); }
      };
    }
  };

  B.Battle = Battle;
  w.GameBattle = B;
})(window);
