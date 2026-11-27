/* web/game/battle/checkin.js — 每日打卡与轻补签的纯逻辑：本地日期幂等、7 日周期、断签不清零。只返回新状态，不写存档。ES2019。 */
(function (w) {
  'use strict';
  var B = w.GameBattle = w.GameBattle || {};
  var GD = w.GameData || {};
  var K = function () { return GD.checkin || null; };

  /** 'YYYY-MM-DD' → 当天 00:00 的本地时间戳；不经过 UTC，避免时区把日界挪走。 */
  B.parseDay = function (localDate) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate || '');
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  };

  /** 时间戳 → 'YYYY-MM-DD'（本地日）。 */
  B.formatDay = function (ts) {
    var d = new Date(ts);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  };

  /** 整天差：两端都落在本地 00:00，所以直接除 86400000 不会有夏令时偏差以外的误差。 */
  B.daysBetween = function (fromDate, toDate) {
    var a = B.parseDay(fromDate), b = B.parseDay(toDate);
    if (a === null || b === null) return null;
    return Math.round((b - a) / 86400000);
  };

  B.addDays = function (localDate, n) {
    var t = B.parseDay(localDate);
    if (t === null) return null;
    var d = new Date(t);
    d.setDate(d.getDate() + n);
    return B.formatDay(d.getTime());
  };

  B.checkinState = function (localDate) {
    return { cycleStart: localDate || null, claimed: [], madeUp: [] };
  };

  /**
   * 读当前周期位置：返回 {inCycle, dayIndex, cycleEnd, expired}。
   * 超过 cycleEnd 即周期结束，未补的格子作废、不回补、不累计（checkin.cycle.expireRule）。
   */
  B.cycleInfo = function (state, localDate) {
    var cfg = K();
    if (!cfg) return null;
    if (!state.cycleStart) return { inCycle: false, dayIndex: 0, cycleEnd: null, expired: false };
    var diff = B.daysBetween(state.cycleStart, localDate);
    var cycleEnd = B.addDays(state.cycleStart, cfg.cycle.endOffsetDays);
    if (diff === null) return { inCycle: false, dayIndex: 0, cycleEnd: cycleEnd, expired: false };
    if (diff < 0) return { inCycle: false, dayIndex: 0, cycleEnd: cycleEnd, expired: false };
    if (diff > cfg.cycle.endOffsetDays) return { inCycle: false, dayIndex: diff + 1, cycleEnd: cycleEnd, expired: true };
    return { inCycle: true, dayIndex: diff + 1, cycleEnd: cycleEnd, expired: false };
  };

  /** 领取：同一本地日期只能领一次；周期结束时第一次领取开启新周期第 1 天。 */
  B.checkinClaim = function (state, localDate) {
    var cfg = K();
    if (!cfg) return { ok: false, reason: 'no_config' };
    var st = { cycleStart: state.cycleStart || null, claimed: (state.claimed || []).slice(), madeUp: (state.madeUp || []).slice() };
    var info = B.cycleInfo(st, localDate);

    if (info.inCycle && st.claimed.indexOf(localDate) >= 0) {
      return { ok: false, reason: 'alreadyClaimed', localDate: localDate, rewards: [] };
    }
    if (!info.inCycle) {
      st.cycleStart = localDate;
      st.claimed = [];
      st.madeUp = [];
      info = B.cycleInfo(st, localDate);
    }
    var day = cfg.rewards[info.dayIndex - 1];
    if (!day) return { ok: false, reason: 'no_reward_slot', dayIndex: info.dayIndex };
    st.claimed.push(localDate);
    st.claimed.sort();
    return {
      ok: true,
      localDate: localDate,
      dayIndex: info.dayIndex,
      cycleStart: st.cycleStart,
      cycleEnd: info.cycleEnd,
      rewards: day.items.slice(),
      state: st
    };
  };

  /**
   * 轻补签：只补本周期内「已过去且未领取」的格子，每周期最多 maxPerCycle 次，花 echo。
   * 不补未来、不补已领、周期结束不再受理。
   */
  B.checkinMakeup = function (state, localDate, dayIndex, echo) {
    var cfg = K();
    if (!cfg) return { ok: false, reason: 'no_config' };
    var mk = cfg.makeup;
    if (!mk || !mk.allow) return { ok: false, reason: 'makeup_disabled' };
    var st = { cycleStart: state.cycleStart || null, claimed: (state.claimed || []).slice(), madeUp: (state.madeUp || []).slice() };
    var info = B.cycleInfo(st, localDate);
    if (!info.inCycle) return { ok: false, reason: info.expired ? 'cycle_expired' : 'no_cycle' };
    if (dayIndex < 1 || dayIndex >= info.dayIndex) return { ok: false, reason: mk.forbidFuture ? 'future_or_today' : 'bad_day' };
    var slotDate = B.addDays(st.cycleStart, dayIndex - 1);
    if (mk.forbidClaimed && st.claimed.indexOf(slotDate) >= 0) return { ok: false, reason: 'already_claimed' };
    if (st.madeUp.indexOf(slotDate) >= 0) return { ok: false, reason: 'already_made_up' };
    if (st.madeUp.length >= mk.maxPerCycle) return { ok: false, reason: 'makeup_limit' };
    var cost = mk.cost.amount;
    if ((echo || 0) < cost) return { ok: false, reason: 'echo_short', need: cost, have: echo || 0 };
    var day = cfg.rewards[dayIndex - 1];
    st.madeUp.push(slotDate);
    st.claimed.push(slotDate);
    st.claimed.sort();
    return {
      ok: true,
      localDate: localDate,
      dayIndex: dayIndex,
      slotDate: slotDate,
      cost: cost,
      rewards: day.items.slice(),
      state: st,
      echoAfter: (echo || 0) - cost
    };
  };

  /** 展示用：本周期哪些格已领、哪些还能补。 */
  B.checkinStatus = function (state, localDate) {
    var cfg = K();
    var st = state || B.checkinState(null);
    var info = B.cycleInfo(st, localDate);
    var rows = cfg.rewards.map(function (r) {
      var slotDate = st.cycleStart ? B.addDays(st.cycleStart, r.day - 1) : null;
      return {
        day: r.day,
        text: r.text,
        claimed: !!(slotDate && st.claimed.indexOf(slotDate) >= 0),
        makeup: !!(slotDate && st.madeUp.indexOf(slotDate) >= 0),
        date: slotDate
      };
    });
    return { todayIndex: info ? info.dayIndex : 0, inCycle: info ? info.inCycle : false, cycleStart: st.cycleStart, cycleEnd: info ? info.cycleEnd : null, days: rows };
  };
})(window);
