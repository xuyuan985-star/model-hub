/* web/game/battle/skills.js — 十二个技能的实际结算：每条 effect 对应 characters.js 的 effect 字段，观感同构、数值不靠梗。ES2019。 */
(function (w) {
  'use strict';
  var B = w.GameBattle = w.GameBattle || {};
  var GD = w.GameData || {};
  var C = B.CFG;

  /** 普通攻击：不吃配额，是「这一回合没别的可做」时的保底动作，不是弱化版技能。 */
  B.BASIC = { id: 'basic', name: '出手', slot: 0, cost: 0, scope: 'enemy', power: 100 };

  /** 技能的攻击倍率：只有长考是攻击技，其余技能的收益在别的轴上。 */
  B.skillPower = function (skillId) {
    if (skillId === 'longthink') return 100;
    return 100;
  };

  B.pay = function (unit, skill) {
    if (unit.quota < skill.cost) return false;
    unit.quota -= skill.cost;
    return true;
  };

  /** scope 决定可选目标：敌方技能必须指到活着的敌人，队友技能必须指到活着的我方。 */
  B.targetsFor = function (state, skill) {
    if (skill.scope === 'enemy') return B.aliveEnemies(state);
    if (skill.scope === 'ally' || skill.scope === 'party' || skill.scope === 'field') return B.aliveParty(state);
    return [state.party[0]];
  };

  B.effects = {
    /** 观测：把敌人情报写进自己的槽，全队可读；同一敌人只写一次。 */
    intel_enemy: function (state, actor, target, skill) {
      if (!target) return { ok: false, reason: 'no_target' };
      var r = B.writeIntel(state, actor, target, ['text'], 'intel');
      return { ok: true, already: r.already, text: r.already ? '这条情报已经在槽里了' : '记下：' + target.name };
    },

    /** 回响：把一项已遗忘的内容放回槽位。 */
    restore_forgotten: function (state, actor) {
      var rec = B.restoreSlot(state, actor, null);
      if (!rec) return { ok: false, reason: 'nothing_forgotten' };
      return { ok: true, text: '重新记起：' + rec.id };
    },

    /** 续杯：本回合配额回复翻倍——把这一回合该回的那份立刻补上，槽位不额外占用。 */
    quota_regen_double: function (state, actor) {
      var before = actor.quota;
      var grow = B.growthOf(actor).refill;
      actor.quota = B.clamp(actor.quota + actor.quotaRegen + grow, 0, actor.quotaMax);
      return { ok: true, gained: actor.quota - before, text: '续杯 +' + (actor.quota - before) };
    },

    /** 代付：把自己的配额转给队友，转多少收多少，不倒扣、不抽税。 */
    quota_transfer: function (state, actor, target, skill, opts) {
      if (!target || target === actor) return { ok: false, reason: 'need_ally' };
      var want = Math.max(1, (opts && opts.amount) || ((actor.quotaRegen || 2) + B.growthOf(actor).transfer));
      var give = Math.min(want, Math.max(0, actor.quota));
      if (give <= 0) return { ok: false, reason: 'no_quota' };
      actor.quota -= give;
      var before = target.quota;
      target.quota = B.clamp(target.quota + give, 0, target.quotaMax);
      return { ok: true, given: give, received: target.quota - before, text: '代付 ' + give + ' 点给' + target.name };
    },

    /** 断列：合扇切断敌方一项增益两回合；对护页同样有效（这是首领战的破局手段）。 */
    strip_buff: function (state, actor, target) {
      if (!target) return { ok: false, reason: 'no_target' };
      var cut = 0;
      if (target.buffs.length) {
        target.buffs[0].turns = 0;
        target.buffs.shift();
        cut += 1;
      }
      if (target.shields > 0) {
        var layers = Math.min(target.shields, C.shieldStripPerCut + B.growthOf(actor).strip);
        target.shields -= layers;
        cut += layers;
      }
      if (!cut) return { ok: false, reason: 'nothing_to_cut' };
      return { ok: true, cut: cut, text: '断列：拆掉 ' + cut + ' 项增益' + (target.shields >= 0 ? '（护页剩 ' + target.shields + '）' : '') };
    },

    /** 双写：情报同时写成文字与图像，占 1 格；图像形式让影像角色也能读到全份。 */
    intel_dual_form: function (state, actor, target) {
      if (!target) return { ok: false, reason: 'no_target' };
      var r = B.writeIntel(state, actor, target, ['text', 'image'], 'intel');
      if (r.already) return { ok: true, already: true, text: '这条情报已经把两种形式都写下了' };
      return { ok: true, text: '双写：' + target.name + '的情报写成文字与图像' };
    },

    /** 分身：两个子体各观测一个目标，结果合并成一条情报，不按子体数叠加占槽。 */
    spawn_observers: function (state, actor, target, skill, opts) {
      var list = (opts && opts.targets) || [];
      var picked = [];
      for (var i = 0; i < list.length && picked.length < 2; i++) {
        var e = B.findUnit(state, list[i]);
        if (e && e.side === 'enemy' && e.alive) picked.push(e);
      }
      if (!picked.length && target) picked.push(target);
      if (!picked.length) return { ok: false, reason: 'no_target' };
      var firstNew = null;
      picked.forEach(function (en) {
        if (!state.intel[en.uid]) firstNew = firstNew || en;
        else B.writeIntel(state, actor, en, ['text'], 'intel');
      });
      if (firstNew) {
        var merged = B.writeIntel(state, actor, firstNew, ['text'], 'intel');
        picked.forEach(function (en) { if (en !== firstNew) state.intel[en.uid] = state.intel[firstNew.uid]; });
      }
      state.clones.push({ turns: C.swarmTurns, owner: actor.uid, targets: picked.map(function (e) { return e.uid; }) });
      return { ok: true, targets: picked.length, text: '分身：' + picked.length + ' 个子体各自观测，合并为 1 格' };
    },

    /** 汇总：把本回合写入的情报并成一条纲领槽，仍占 1 格，读取时按原条目命中。 */
    merge_intel: function (state, actor) {
      var mine = actor.slots.filter(function (s) { return s.type === 'intel'; });
      if (mine.length < 2) return { ok: false, reason: 'not_enough_intel' };
      var merged = { type: 'intel', id: 'digest', label: '纲领：' + mine.length + ' 条情报', forms: ['text'], kind: 'digest', covers: [] };
      mine.forEach(function (s) {
        merged.covers.push(s.id);
        var idx = actor.slots.indexOf(s);
        if (idx >= 0) actor.slots.splice(idx, 1);
      });
      B.pushSlot(state, actor, merged);
      return { ok: true, merged: merged.covers.length, text: '汇总：' + merged.covers.length + ' 条并成 1 格' };
    },

    /** 分镜：公开下一回合行动顺序并锁定，只改顺序，不改伤害与命中。 */
    order_preview_lock: function (state) {
      state.orderLock = true;
      state.preview = B.turnOrder(state).map(function (u) { return u.uid; });
      return { ok: true, preview: state.preview, text: '分镜：下一回合顺序已公开并锁定' };
    },

    /** 长镜：持续场景，每回合 +1 层小额增益；换图、战斗结束或主动断场清零。 */
    scene_stack: function (state) {
      state.longtake = Math.max(1, state.longtake);
      state.longtakeTurns = 0;
      state.longtakeEngaged = true;
      return { ok: true, layers: state.longtake, text: '长镜开拍：第 1 层' };
    },

    /** 长考：清空当前剩余配额换一击真实伤害；不足下限不可用，不预支、不借贷。 */
    spend_all_quota_true_damage: function (state, actor, target) {
      var min = (GD.skillBudget && GD.skillBudget.longthinkMinQuota) || 4;
      if (actor.quota < min) return { ok: false, reason: 'quota_below_min', min: min };
      if (!target) return { ok: false, reason: 'no_target' };
      var spent = actor.quota;
      actor.quota = 0;
      var power = 100 + spent * (C.longthinkPerPoint || 12);
      var hit = B.damage(state, actor, target, null, { trueDamage: true, power: power, kind: 'longthink', strip: C.longthinkShieldStrip });
      return { ok: true, spent: spent, damage: hit.amount, text: '长考：清空 ' + spent + ' 点配额，真实伤害 ' + hit.amount };
    },

    /** 审慎：本回合全队第一次受伤减半，只挡一次，不叠加。 */
    first_hit_halved: function (state) {
      state.prudent = Math.max(state.prudent, C.prudentOnce);
      return { ok: true, text: '审慎：下一次受伤减半' };
    }
  };

  /** 统一入口：查表 → 校验配额 → 结算 → 记日志。任何技能失败都不消耗配额。 */
  B.useSkill = function (state, actor, skillId, targetUid, opts) {
    var skill = (GD.skills || {})[skillId];
    if (!skill) return { ok: false, reason: 'unknown_skill' };
    var fn = B.effects[skill.effect];
    if (!fn) return { ok: false, reason: 'unimplemented:' + skill.effect };
    if (actor.quota < skill.cost) return { ok: false, reason: 'quota_short', need: skill.cost, have: actor.quota };
    var target = targetUid ? B.findUnit(state, targetUid) : null;
    var res = fn(state, actor, target, skill, opts || {});
    if (!res.ok && skill.effect !== 'spend_all_quota_true_damage') return res;
    if (!res.ok) return res;
    B.pay(actor, skill);
    res.skill = skillId;
    res.cost = skill.cost;
    state.log.push({ turn: state.turn, kind: 'skill', actor: actor.uid, skill: skillId, text: res.text || '' });
    return res;
  };
})(window);
