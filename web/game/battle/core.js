/* web/game/battle/core.js — 回合战斗的公共基座：确定性随机、数值口径、单位与槽位、伤害结算。无 DOM、无存档。ES2019。 */
(function (w) {
  'use strict';
  var B = w.GameBattle = w.GameBattle || {};
  var GD = w.GameData || {};

  B.version = 'battle/1';
  B.moduleOrder = ['core.js', 'skills.js', 'enemies.js', 'battle.js', 'gacha.js', 'checkin.js'];

  /**
   * 数值口径集中在这里，方便一次性调参：
   * 伤害只由 atk/def/技能倍率决定；价格从未进入本表（成本只影响 quota 档位，不进伤害也不进生命）。
   */
  B.CFG = {
    dmgScale: 0.34,         // atk 折算成伤害的系数（配合 6 回合 / 26–42 血的窗口）
    defScale: 0.4,          // def 的减伤系数
    enemyDmgScale: 8.0,     // 敌方攻击的独立系数：敌人 atk 数值天生偏低，靠这一段补回威胁
    bossDmgScale: 6.4,      // 首领单次伤害系数（比小怪低，靠护页与抹槽施加压力，不靠秒人）
    swallowCooldown: 2,     // 首领补护页的冷却回合：撕得比补得快，撕页才有意义
    longthinkPerPoint: 12,  // 长考每消耗 1 点配额增加的技能强度
    minDamage: 1,
    intelDefIgnore: 0.4,    // 已观测目标被无视的防御比例
    intelBonus: 0.15,       // 已观测目标的伤害加成
    dualWriteFlat: 2,       // 双写（文字+图像）额外固定伤害
    intelBonusNoText: 0.5,  // 读不懂文字的角色只吃一半情报加成（双写可读全）
    longtakePerStack: 1,    // 长镜每层的固定小额增伤
    longtakeMaxStack: 5,
    longtakeMaxTurns: 6,
    shieldStripPerCut: 3,   // 断列一次拆掉的护页层数
    longthinkShieldStrip: 2, // 长考一次撼掉的护页层数（仍不直接落血）
    swarmTurns: 2,
    prudentOnce: 1,
    deduct: 'all'
  };

  /** 确定性随机（mulberry32）：同一 seed 必然得到同一战报，自动结算与手动结算等价。 */
  B.rng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** 实际防御：基础值加上挂着的增益；增益到期由回合开始统一摘掉，不会把加值留在身上。 */
  B.effDef = function (unit) {
    var extra = 0;
    (unit.buffs || []).forEach(function (b) { extra += b.defUp || 0; });
    return unit.def + extra;
  };

  /**
   * 队伍成长（命座）：只把该角色既有技能的基础数值往前推一点——不加槽位、不提配额上限、不改技能费用。
   * 0 命时每一项加成都是 0（乘数为 1），与未接成长前的数值逐位相同。
   */
  B.GROWTH = {
    version: 'growth/1',
    cap: 6,
    perStack: { skillPower: 0.05, intelBonus: 0.02, refill: 0.34, transfer: 0.34, strip: 0.34 },
    note: '命座来自免费抽卡的重复转化，满命封顶；加成只落在技能上，普通出手不吃成长。'
  };

  B.growthOf = function (unit) {
    var g = B.GROWTH;
    var c = unit && unit.constellation ? unit.constellation : 0;
    c = B.clamp(c, 0, g.cap);
    return {
      stacks: c,
      skillPower: 1 + c * g.perStack.skillPower,
      intelBonus: c * g.perStack.intelBonus,
      refill: Math.floor(c * g.perStack.refill),
      transfer: Math.floor(c * g.perStack.transfer),
      strip: Math.floor(c * g.perStack.strip)
    };
  };

  /** 把「角色 → 命座数」写进队伍单位；owned 就是存档里的 owned 表，读不到当 0 命。 */
  B.applyGrowth = function (party, owned) {
    var map = owned || {};
    party.forEach(function (u) { u.constellation = B.clamp(map[u.id] || 0, 0, B.GROWTH.cap); });
    return party;
  };

  B.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  B.round = function (v) { return Math.round(v); };
  B.pick = function (arr, rnd) { return arr[Math.floor(rnd() * arr.length) % arr.length]; };

  /** 一份单位模板：角色取 GD.cast 的 stats，运行时只带 hp/quota/slots 三项可变状态。 */
  B.makeUnit = function (entry) {
    var card = (GD.cast || {})[entry.id];
    if (!card) throw new Error('battle: 未知角色 ' + entry.id);
    var st = card.stats;
    var slotState = B.readSlots(entry, st);
    return {
      uid: 'p:' + entry.id,
      id: entry.id,
      side: 'party',
      name: card.name,
      atk: st.atk, def: st.def, spd: st.spd,
      hp: typeof entry.hp === 'number' ? entry.hp : st.hp,
      maxHp: st.hp,
      quota: typeof entry.quota === 'number' ? entry.quota : st.quota,
      quotaMax: st.quota,
      quotaRegen: st.quotaRegen,
      slotCap: slotState.cap,
      slots: slotState.used,
      forgotten: slotState.forgotten,
      buffs: [],
      shieldOf: {},
      alive: true,
      acted: false,
      cloneTurns: 0,
      constellation: B.clamp(entry.constellation || 0, 0, B.GROWTH.cap),
      temp: {}
    };
  };

  /** 槽位三态（cap/used/forgotten）既接受数字上限，也接受存档里的对象形态。 */
  B.readSlots = function (entry, stats) {
    var s = entry.slots;
    var cap = stats.slots;
    var used = [];
    var forgotten = [];
    if (typeof s === 'number') cap = s;
    else if (Array.isArray(s)) used = B.normalizeSlotList(s);
    else if (s && typeof s === 'object') {
      if (typeof s.cap === 'number') cap = s.cap;
      if (Array.isArray(s.used)) used = B.normalizeSlotList(s.used);
      if (Array.isArray(s.forgotten)) forgotten = B.normalizeSlotList(s.forgotten);
    }
    return { cap: cap, used: used, forgotten: forgotten };
  };

  /** 存档与引擎可能用 'skill:observe' 这种短写，统一成对象，缺字段补默认。 */
  B.normalizeSlotList = function (list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (typeof it === 'string') out.push({ type: it.split(':')[0] || 'skill', id: it.split(':')[1] || it, forms: ['text'] });
      else if (it && typeof it === 'object') out.push({ type: it.type || 'skill', id: it.id || '', forms: it.forms || ['text'] });
    }
    return out;
  };

  /** 敌方单位：护页只对首领有意义，其余敌人 shields 恒为 0。 */
  B.makeEnemy = function (enemyId, uid) {
    var e = (GD.enemies || {})[enemyId];
    if (!e) throw new Error('battle: 未知敌人 ' + enemyId);
    return {
      uid: uid || ('e:' + enemyId + ':' + Math.floor(performanceish())),
      id: enemyId,
      side: 'enemy',
      name: e.name,
      atk: e.atk, def: e.def, spd: e.spd,
      hp: e.hp, maxHp: e.hp,
      quota: e.quota, quotaMax: e.quota, quotaRegen: e.quotaRegen,
      intel: e.intel,
      sprite: e.sprite || (e.boss ? 'boss_' + enemyId : null),
      drops: (e.drops || []).slice(),
      boss: !!e.boss,
      phases: e.phases || null,
      phaseIndex: 0,
      shields: e.boss ? 7 : 0,
      shieldMax: e.boss ? 7 : 0,
      buffs: [],
      lastAction: null,
      alive: true,
      observed: false,
      dualForm: {},
      acted: false,
      temp: {}
    };
  };

  // 仅用于生成 uid 后缀，不参与任何随机判定（随机一律走 B.rng）
  var seq = 0;
  function performanceish() { seq += 1; return seq; }

  /** 已写入的情报：谁把哪个敌人写进了自己槽里（全队可读，写一次即可）。 */
  B.intelFor = function (state, enemyUid) {
    return state.intel[enemyUid] || null;
  };

  B.writeIntel = function (state, actor, enemy, forms, kind) {
    var rec = { type: 'intel', id: enemy.uid, label: enemy.name + '的情报', forms: forms || ['text'], kind: kind || 'intel' };
    var intel = state.intel[enemy.uid];
    if (intel) return { ok: true, already: true, rec: intel };
    state.intel[enemy.uid] = rec;
    enemy.observed = true;
    enemy.dualForm.text = (forms || ['text']).indexOf('text') >= 0;
    enemy.dualForm.image = (forms || []).indexOf('image') >= 0;
    B.pushSlot(state, actor, rec);
    return { ok: true, already: false, rec: rec };
  };

  /** 满槽时遗忘最旧的一项，进入 forgotten[]，不静默丢数据（回响可以读回来）。 */
  B.pushSlot = function (state, unit, rec) {
    if (unit.slots.length >= unit.slotCap) {
      var oldest = unit.slots.shift();
      oldest.forgottenAt = state.turn;
      unit.forgotten.push(oldest);
      state.log.push({ turn: state.turn, kind: 'forget', actor: unit.uid, slot: oldest.id, reason: 'slots_full' });
    }
    unit.slots.push(rec);
    return rec;
  };

  /** 找到某项已遗忘的内容并放回槽位（回响技能用）。 */
  B.restoreSlot = function (state, unit, wantType) {
    var idx = -1;
    for (var i = 0; i < unit.forgotten.length; i++) {
      if (!wantType || unit.forgotten[i].type === wantType) { idx = i; break; }
    }
    if (idx < 0) return null;
    var rec = unit.forgotten.splice(idx, 1)[0];
    delete rec.forgottenAt;
    B.pushSlot(state, unit, rec);
    return rec;
  };

  /**
   * 伤害结算：所有伤害都必须经过这里，保证「情报、长镜、双写、护页」只有一套口径。
   * 护页大于 0 时正面伤害不落在生命上，改为削一层护页（首领机制，不让玩家硬扛血量）。
   */
  B.damage = function (state, attacker, target, skill, opts) {
    var o = opts || {};
    var cfg = B.CFG;
    var power = typeof o.power === 'number' ? o.power : 100;
    var out = { attacker: attacker.uid, target: target.uid, amount: 0, kind: o.kind || 'normal', notes: [] };

    if (!target.alive) { out.notes.push('目标已退场'); return out; }

    var atk = attacker.atk;
    var bonus = 0;
    var def = B.effDef(target);
    var intel = state.intel[target.uid];

    var growth = B.growthOf(attacker);

    if (intel && attacker.side === 'party') {
      var ratio = 1;
      if (attacker.isMedia && !(intel.forms || []).some(function (f) { return f === 'image'; })) ratio = cfg.intelBonusNoText;
      bonus += Math.round(atk * (cfg.intelBonus + ((o.kind === 'basic' || o.kind === undefined) ? 0 : growth.intelBonus)) * ratio);
      def = def * (1 - cfg.intelDefIgnore);
      if (attacker.isMedia && (intel.forms || []).indexOf('image') >= 0) {
        bonus += cfg.dualWriteFlat;
        out.notes.push('双写可读');
      }
    }
    if (attacker.side === 'party' && state.longtake > 0) {
      bonus += state.longtake * cfg.longtakePerStack;
      out.notes.push('长镜 ' + state.longtake + ' 层');
    }
    if (o.flatBonus) bonus += o.flatBonus;

    var scale = attacker.side === 'party'
      ? cfg.dmgScale
      : cfg.dmgScale * (attacker.boss ? cfg.bossDmgScale : cfg.enemyDmgScale);
    var skillMul = (o.kind === 'basic' || o.kind === undefined) ? 1 : growth.skillPower;
    var raw = (o.trueDamage ? atk * (o.trueMultiplier || 1.2) : atk) * (power / 100) * skillMul * scale + bonus;
    var mit = o.trueDamage ? 0 : def * cfg.defScale;
    var amount = Math.max(cfg.minDamage, B.round(raw - mit));

    // 护页：普通出手打不穿也不掉层，只能被「断列」「长考」这类专门的撕页手段削掉。
    if (target.shields > 0) {
      var strip = o.strip || 0;
      if (strip > 0) {
        target.shields = Math.max(0, target.shields - strip);
        out.kind = 'strip';
        out.stripped = strip;
        out.notes.push('撕掉 ' + strip + ' 页（剩 ' + target.shields + ' 层）');
        state.log.push({ turn: state.turn, kind: 'strip', target: target.uid, left: target.shields });
      } else {
        out.kind = 'shield_block';
        out.notes.push('被护页吞下，这一下不落血');
        state.log.push({ turn: state.turn, kind: 'shield_block', target: target.uid, left: target.shields });
      }
      out.amount = 0;
      return out;
    }

    // 审慎：本回合全队第一次受伤减半，只挡一次
    if (target.side === 'party' && state.prudent > 0) {
      state.prudent -= 1;
      amount = Math.max(1, B.round(amount / 2));
      out.notes.push('审慎减免');
    }

    target.hp = Math.max(0, target.hp - amount);
    out.amount = amount;
    if (target.hp === 0) { target.alive = false; out.notes.push('退场'); }
    state.log.push({ turn: state.turn, kind: 'damage', from: attacker.uid, target: target.uid, amount: amount, left: target.hp });
    return out;
  };

  /** 行动顺序：spd 降序；分镜锁定顺序时我方先手（只改顺序，不改伤害与命中）。 */
  B.turnOrder = function (state) {
    var side = function (u) { return u.side === 'party' ? 0 : 1; };
    var list = [];
    state.party.concat(state.enemies).forEach(function (u) {
      if (u.alive) list.push(u);
    });
    if (state.orderLock) {
      list.sort(function (a, b) {
        if (side(a) !== side(b)) return side(a) - side(b);
        return b.spd - a.spd;
      });
    } else {
      list.sort(function (a, b) {
        if (b.spd !== a.spd) return b.spd - a.spd;
        return side(a) - side(b);
      });
    }
    return list;
  };

  /** 回合开始：先回配额（上限 quota，回复不超过上限的四分之一由数据侧保证），未用完的保留。 */
  B.turnStart = function (state) {
    state.party.concat(state.enemies).forEach(function (u) {
      if (!u.alive) return;
      u.acted = false;
      u.quota = B.clamp(u.quota + u.quotaRegen, 0, u.quotaMax);
    });
    state.party.forEach(function (u) {
      for (var i = u.buffs.length - 1; i >= 0; i--) {
        u.buffs[i].turns -= 1;
        if (u.buffs[i].turns <= 0) u.buffs.splice(i, 1);
      }
    });
    if (state.longtake > 0) {
      state.longtake = Math.min(B.CFG.longtakeMaxStack, state.longtake + 1);
      state.longtakeTurns += 1;
      if (state.longtakeTurns > B.CFG.longtakeMaxTurns) B.endLongtake(state, 'scene_end');
    }
    state.prudent = 0;
    state.orderLock = false;
  };

  /** 长镜断场：换图、战斗结束或主动断场一律清零，不跨战斗保留。 */
  B.endLongtake = function (state, reason) {
    if (state.longtake > 0) state.log.push({ turn: state.turn, kind: 'longtake', action: 'end', reason: reason || 'break' });
    state.longtake = 0;
    state.longtakeTurns = 0;
  };

  B.aliveParty = function (state) {
    return state.party.filter(function (u) { return u.alive; });
  };

  B.aliveEnemies = function (state) {
    return state.enemies.filter(function (u) { return u.alive; });
  };

  B.findUnit = function (state, uid) {
    var all = state.party.concat(state.enemies);
    for (var i = 0; i < all.length; i++) if (all[i].uid === uid) return all[i];
    return null;
  };

  B.mediaIds = ['mu'];
})(window);
