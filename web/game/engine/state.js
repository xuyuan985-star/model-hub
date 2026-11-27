/* web/game/engine/state.js — 存档状态：标记、队伍、道具、槽位、任务步与版本迁移（GameData 只读，运行时状态全在这里）。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};
  var SAVE_V = 1;
  var CHAPTER = 'ch0';

  function GD() { return w.GameData || {}; }

  function castCard(id) {
    var gd = GD();
    if (gd.cast && gd.cast[id]) return gd.cast[id];
    if (gd.npc && gd.npc[id]) return gd.npc[id];
    return null;
  }

  function emptySave() {
    var gd = GD(), world = gd.world || {}, spawn = world.spawn || { map: 'station', x: 1, y: 1, dir: 'down' };
    var obs = castCard('observer'), st = (obs && obs.stats) || { hp: 68, quota: 20, slots: 4, quotaRegen: 5 };
    var save = {
      v: SAVE_V,
      at: Date.now(),
      chapter: CHAPTER,
      map: spawn.map, x: spawn.x, y: spawn.y, dir: spawn.dir || 'down',
      party: ['observer'],
      hp: {}, quota: {}, items: {}, flags: {}, slots: {}, seen: {},
      quest: { id: 'main_ch0', step: null },
      interlude: {},
      steps: {},
      gacha: {}, checkin: {}
    };
    save.hp.observer = st.hp;
    save.quota.observer = st.quota;
    save.slots.observer = { cap: st.slots, used: [], forgotten: [] };
    return save;
  }

  /** 版本迁移：v 更小的存档补默认字段；未知字段原样保留，保证前后兼容。 */
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var base = emptySave(), k;
    for (k in base) {
      if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
      if (raw[k] === undefined) raw[k] = base[k];
    }
    raw.v = SAVE_V;
    if (!raw.slots.observer) raw.slots.observer = base.slots.observer;
    if (!raw.quest || !raw.quest.id) raw.quest = { id: 'main_ch0', step: null };
    if (!raw.interlude) raw.interlude = {};
    if (!raw.steps) raw.steps = {};
    if (!raw.party || !raw.party.length) raw.party = ['observer'];
    if (G.Interlude && G.Interlude.migrate) G.Interlude.migrate(raw);
    return raw;
  }

  function create() {
    var save = emptySave();
    syncPartyStats(save);
    return save;
  }

  /** 入队时把角色数值抄进存档；之后只在存档里加槽/加配额，不回写 GameData。 */
  function syncPartyStats(save) {
    var gd = GD(), i, id, card, st;
    for (i = 0; i < save.party.length; i++) {
      id = save.party[i];
      card = castCard(id);
      st = card && card.stats ? card.stats : null;
      if (!st) continue;
      if (save.hp[id] == null) save.hp[id] = st.hp;
      if (save.quota[id] == null) save.quota[id] = st.quota;
      if (!save.slots[id]) save.slots[id] = { cap: st.slots, used: [], forgotten: [] };
    }
  }

  function hasFlag(save, key) { return !!(save && save.flags && save.flags[key]); }

  function setFlag(save, key) {
    if (!save.flags) save.flags = {};
    if (save.flags[key]) return false;
    save.flags[key] = 1;
    return true;
  }

  function addItem(save, id, n) {
    if (!save.items) save.items = {};
    save.items[id] = (save.items[id] || 0) + (n || 1);
    return save.items[id];
  }

  function joinParty(save, who) {
    if (!who) return false;
    if (save.party.indexOf(who) >= 0) return false;
    save.party.push(who);
    syncPartyStats(save);
    return true;
  }

  function slotCapOf(save, who) {
    var s = save.slots && save.slots[who];
    if (s) return s.cap;
    var card = castCard(who);
    return card && card.stats ? card.stats.slots : 0;
  }

  function addSlotCap(save, who, n) {
    if (!who) return;
    if (!save.slots) save.slots = {};
    if (!save.slots[who]) save.slots[who] = { cap: slotCapOf(save, who), used: [], forgotten: [] };
    save.slots[who].cap += (n || 1);
  }

  function addQuotaCap(save, who, n) {
    if (!who) return;
    var card = castCard(who), st = card && card.stats ? card.stats : null;
    if (save.quota[who] == null) save.quota[who] = st ? st.quota : 0;
    save.quota[who] += (n || 1);
  }

  /** 槽位写入：满槽先遗忘最旧的一项，进 forgotten[]，与战斗层的规则一致。 */
  function writeSlot(save, who, item) {
    if (!save.slots) save.slots = {};
    var s = save.slots[who];
    if (!s) { s = save.slots[who] = { cap: slotCapOf(save, who), used: [], forgotten: [] }; }
    if (s.used.length >= s.cap && s.used.length) {
      var dropped = s.used.shift();
      s.forgotten.push(dropped);
    }
    s.used.push(item);
    return true;
  }

  function markSeen(save, nodeId) {
    if (!save.seen) save.seen = {};
    save.seen[nodeId] = 1;
  }

  function seen(save, nodeId) { return !!(save && save.seen && save.seen[nodeId]); }

  /** 主线步：按 flagsAll / flagsAny 从前往后取最后一个满足的检查点。任务归属可由幕间认领（默认 main_ch0）。 */
  function activeQuest(save) {
    var gd = GD(), qs = gd.quests || {};
    var id = (G.Interlude && G.Interlude.questId) ? G.Interlude.questId(save) : 'main_ch0';
    return qs[id] || qs.main_ch0 || null;
  }

  function questStep(save) {
    var quest = activeQuest(save);
    if (!quest) return null;
    var last = null, i, st, okAll, okAny;
    for (i = 0; i < quest.steps.length; i++) {
      st = quest.steps[i];
      okAll = (st.flagsAll || []).every(function (f) { return hasFlag(save, f); });
      okAny = !st.flagsAny || st.flagsAny.some(function (f) { return hasFlag(save, f); });
      if (okAll && okAny) last = st;
    }
    return last;
  }

  function refreshQuest(save) {
    var st = questStep(save);
    var quest = activeQuest(save);
    save.quest = { id: quest ? quest.id : 'main_ch0', step: st ? st.id : null };
    return st;
  }

  function questStepDef(save) {
    var quest = activeQuest(save);
    if (!quest) return null;
    var id = save.quest && save.quest.step, i;
    for (i = 0; i < quest.steps.length; i++) if (quest.steps[i].id === id) return quest.steps[i];
    return quest.steps[0] || null;
  }

  G.State = {
    SAVE_V: SAVE_V,
    CHAPTER: CHAPTER,
    create: create,
    migrate: migrate,
    emptySave: emptySave,
    castCard: castCard,
    syncPartyStats: syncPartyStats,
    hasFlag: hasFlag,
    setFlag: setFlag,
    addItem: addItem,
    joinParty: joinParty,
    addSlotCap: addSlotCap,
    addQuotaCap: addQuotaCap,
    writeSlot: writeSlot,
    slotCapOf: slotCapOf,
    markSeen: markSeen,
    seen: seen,
    refreshQuest: refreshQuest,
    questStepDef: questStepDef
  };
})(window);
