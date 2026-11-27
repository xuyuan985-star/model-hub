/* web/game/battle/gacha.js — 免费抽卡的纯逻辑：保底推进、UP 必中继承、十连、重复转化与兑换。只返回新状态，不写存档。ES2019。 */
(function (w) {
  'use strict';
  var B = w.GameBattle = w.GameBattle || {};
  var GD = w.GameData || {};

  var G = function () { return GD.gacha || null; };

  /** 空状态：字段名与存档契约一致，pity/upGuaranteed 都按池建键。 */
  B.gachaState = function () {
    var g = G();
    var st = { pity: {}, upGuaranteed: {}, log: [] };
    (g ? g.pools : []).forEach(function (p) {
      st.pity[p.id] = 0;
      st.upGuaranteed[p.id] = false;
    });
    return st;
  };

  B.poolById = function (poolId) {
    var g = G();
    if (!g) return null;
    for (var i = 0; i < g.pools.length; i++) if (g.pools[i].id === poolId) return g.pools[i];
    return null;
  };

  /** 5★ 概率：基础 + 软保底每抽累加，硬保底直接置 1；不做「概率随抽数衰减」。 */
  B.fiveStarRate = function (pool, pityCount) {
    var f = pool.fiveStar;
    var n = pityCount + 1;
    if (n >= f.hardPity) return 1;
    if (n <= f.softPityStart) return f.baseRate;
    return Math.min(1, f.baseRate + (n - f.softPityStart) * f.softPityStep);
  };

  /** 4★ 计数从 log 反推：硬保底 10 抽，log.keep = 200 足够覆盖，不需要额外字段。 */
  B.fourStarPity = function (state, poolId) {
    var n = 0;
    for (var i = state.log.length - 1; i >= 0; i--) {
      var e = state.log[i];
      if (e.pool !== poolId) continue;
      if (e.rarity >= 4) break;
      n += 1;
    }
    return n;
  };

  /** UP 必中状态按作用域读：限定池系列共享，常设池不参与。 */
  B.isGuaranteed = function (state, pool) {
    if (!pool.upRule || !pool.upRule.chance) return false;
    if (pool.upRule.scope === 'featured-series' && pool.upRule.guaranteeInherit) {
      var g = G();
      for (var i = 0; i < g.pools.length; i++) {
        var p = g.pools[i];
        if (p.upRule && p.upRule.scope === 'featured-series' && state.upGuaranteed[p.id]) return true;
      }
      return false;
    }
    return !!state.upGuaranteed[pool.id];
  };

  /** 写回 UP 状态：同一作用域的池一起写，保证「继承」在存档里也读得回来。 */
  B.setGuaranteed = function (state, pool, flag) {
    if (!pool.upRule || !pool.upRule.chance) return;
    if (pool.upRule.scope === 'featured-series' && pool.upRule.guaranteeInherit) {
      var g = G();
      for (var i = 0; i < g.pools.length; i++) {
        var p = g.pools[i];
        if (p.upRule && p.upRule.scope === 'featured-series') state.upGuaranteed[p.id] = flag;
      }
      return;
    }
    state.upGuaranteed[pool.id] = flag;
  };

  B.pullOnce = function (state, pool, rnd) {
    var pityBefore = state.pity[pool.id] || 0;
    var rate5 = B.fiveStarRate(pool, pityBefore);
    var roll5 = rnd() < rate5;
    var fourPity = B.fourStarPity(state, pool.id);
    var rate4 = fourPity + 1 >= pool.fourStar.hardPity ? 1 : pool.fourStar.baseRate;
    var out = null;

    if (roll5) {
      state.pity[pool.id] = 0;
      var guaranteed = B.isGuaranteed(state, pool);
      var isUp = guaranteed || rnd() < pool.upRule.chance;
      var id;
      if (isUp && pool.featured.length) {
        id = pool.featured[Math.floor(rnd() * pool.featured.length) % pool.featured.length];
        B.setGuaranteed(state, pool, false);
      } else {
        var others = pool.pool.filter(function (x) { return pool.featured.indexOf(x) < 0; });
        var bag = others.length ? others : pool.pool;
        id = bag[Math.floor(rnd() * bag.length) % bag.length];
        if (pool.upRule && pool.upRule.chance) B.setGuaranteed(state, pool, true);
      }
      out = { rarity: 5, kind: 'character', id: id, up: !!(isUp && pool.featured.indexOf(id) >= 0), pityUsed: pityBefore + 1 };
    } else if (rnd() < rate4) {
      state.pity[pool.id] = pityBefore + 1;
      var g = G();
      var item = rnd() < g.fourStarItemPool.weight;
      if (item) {
        var entries = g.fourStarItemPool.entries;
        var pick = entries[Math.floor(rnd() * entries.length) % entries.length];
        out = { rarity: 4, kind: 'item', item: pick.item, amount: pick.amount };
      } else {
        var mem = g.fourStarPool.members;
        out = { rarity: 4, kind: 'character', id: mem[Math.floor(rnd() * mem.length) % mem.length], pityUsed: fourPity + 1 };
      }
    } else {
      state.pity[pool.id] = pityBefore + 1;
      out = { rarity: 3, kind: 'item', item: 'paper_scrap', amount: 1 };
    }
    out.pool = pool.id;
    out.index = (state.log.length + 1);
    state.log.push({ pool: pool.id, rarity: out.rarity, kind: out.kind, id: out.id || out.item || null });
    var keep = (G() && G().log.keep) || 200;
    if (state.log.length > keep) state.log = state.log.slice(state.log.length - keep);
    return out;
  };

  /**
   * 重复转化：owned 是 {角色id: 已拥有命座数}。
   * 命中已达上限的重复只转回响；材料档按 duplicate.material 直接入包，不参与命座。
   */
  B.resolveDuplicate = function (owned, result) {
    var g = G();
    var d = g.duplicate;
    var gain = { echo: 0, items: {}, constellation: {} };
    if (result.kind === 'item') {
      gain.items[result.item] = (gain.items[result.item] || 0) + (result.amount || 1);
      if (result.rarity === 4) gain.echo += d.material.echo;
      return gain;
    }
    if (result.rarity === 5) {
      var cur5 = owned[result.id] || 0;
      if (cur5 >= d.fiveStar.constellationCap) gain.echo += d.fiveStar.afterCap.echo;
      else { gain.constellation[result.id] = d.fiveStar.perDuplicate.constellation; gain.echo += d.fiveStar.perDuplicate.echo; }
    } else {
      var cur4 = owned[result.id] || 0;
      if (cur4 >= d.fourStar.constellationCap) gain.echo += d.fourStar.afterCap.echo;
      else { gain.constellation[result.id] = d.fourStar.perDuplicate.constellation; gain.echo += d.fourStar.perDuplicate.echo; }
    }
    return gain;
  };

  /**
   * 对外入口：抽 1 次或 10 次。
   * opts = { poolId, count, state, owned, seed }：state/owned 不被修改，返回新副本。
   */
  B.gachaPull = function (opts) {
    var o = opts || {};
    var pool = B.poolById(o.poolId);
    if (!pool) return { ok: false, reason: 'unknown_pool' };
    var count = o.count === 10 ? 10 : (o.count || 1);
    var st = cloneState(o.state || B.gachaState());
    var owned = {};
    var src = o.owned || {};
    Object.keys(src).forEach(function (k) { owned[k] = src[k]; });
    var rnd = B.rng(o.seed === undefined ? 20260101 : o.seed);
    var results = [];
    for (var i = 0; i < count; i++) results.push(B.pullOnce(st, pool, rnd));

    // 十连保底：若恰好没有 4★ 及以上，把最后一张 3★ 提升为 4★ 材料（实际因硬保底 10 几乎不触发）
    var tenGuarantee = false;
    if (count === 10) {
      var has4 = results.some(function (r) { return r.rarity >= 4; });
      if (!has4) {
        var last = results[results.length - 1];
        var entries = g().fourStarItemPool.entries;
        last.rarity = 4;
        last.kind = 'item';
        last.item = entries[0].item;
        last.amount = entries[0].amount;
        last.tenGuarantee = true;
        st.log[st.log.length - 1].rarity = 4;
        tenGuarantee = true;
      }
    }

    // 只结算一次：首次获得的角色不入转化，其余按命座/回响结算
    var gains = { echo: 0, items: {}, constellation: {}, fresh: [] };
    results.forEach(function (r) {
      if (r.kind === 'character' && !(r.id in owned)) {
        owned[r.id] = 0;
        r.first = true;
        gains.fresh.push(r.id);
        return;
      }
      var gain = B.resolveDuplicate(owned, r);
      gains.echo += gain.echo;
      Object.keys(gain.items).forEach(function (k) { gains.items[k] = (gains.items[k] || 0) + gain.items[k]; });
      Object.keys(gain.constellation).forEach(function (k) {
        gains.constellation[k] = (gains.constellation[k] || 0) + gain.constellation[k];
        owned[k] = (owned[k] || 0) + gain.constellation[k];
      });
      r.gain = gain;
    });

    return {
      ok: true,
      pool: pool.id,
      count: count,
      results: results,
      state: st,
      owned: owned,
      gains: gains,
      tenGuaranteeUsed: tenGuarantee,
      pityAfter: st.pity[pool.id],
      upGuaranteedAfter: B.isGuaranteed(st, pool)
    };
  };

  function g() { return G(); }
  function cloneState(s) {
    var out = { pity: {}, upGuaranteed: {}, log: [] };
    Object.keys(s.pity || {}).forEach(function (k) { out.pity[k] = s.pity[k]; });
    Object.keys(s.upGuaranteed || {}).forEach(function (k) { out.upGuaranteed[k] = s.upGuaranteed[k]; });
    out.log = (s.log || []).slice();
    return out;
  }

  /** 兑换：160 回响换 1 页签；不足时原样返回，不做部分兑换。 */
  B.exchangeEcho = function (opts) {
    var o = opts || {};
    var rate = (G() && G().exchange && G().exchange.rate) || 160;
    var times = Math.max(0, Math.floor(o.times || 0));
    if (!times) return { ok: false, reason: 'bad_times' };
    var cost = rate * times;
    if ((o.echo || 0) < cost) return { ok: false, reason: 'echo_short', need: cost, have: o.echo || 0 };
    return { ok: true, cost: cost, pages: times, echo: o.echo - cost, page: (o.page || 0) + times };
  };
})(window);
