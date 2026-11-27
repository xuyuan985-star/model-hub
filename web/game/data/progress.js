/* web/game/data/progress.js — 免费抽卡与每日打卡的纯数据契约；只放常量与表，判定与计数器推进在逻辑模块，全免费无余额字段。 */
(function (w) {
  'use strict';
  var GD = w.GameData = w.GameData || {};

  // 货币：只靠游戏内产出
  GD.currency = {
    page: { id: 'page', name: '页签', kind: 'gacha', text: '抽卡凭证，一枚一抽。只能从打卡、任务、重复角色转化获得。', cap: 9999 },
    echo: { id: 'echo', name: '回响', kind: 'exchange', text: '重复角色转化的副产物，可在兑换口换成页签。', cap: 99999 },
    noPurchase: true,
    note: '不设充值、订单、真实货币或账号余额；本模块不读 aa-api 密钥、不写数据源缓存、不改主榜数值。'
  };

  // ---------- 抽卡 ----------
  GD.gacha = {
    version: 'gacha/2',
    costPerPull: { currency: 'page', amount: 1 },
    tenPull: { pulls: 10, discount: 0, guarantee: '至少一个 4★ 及以上' },
    exchange: { from: 'echo', to: 'page', rate: 160, text: '160 回响换 1 页签。' },

    pityScope: 'pool',
    upGuaranteeScope: 'featured-series',

    fourStarPool: {
      kind: 'character',
      members: ['xi', 'jin', 'juan', 'mu'],
      note: '4★ 角色只来自 cast 中已实装的同伴；UP 角色不降格进 4★ 池，避免与 5★ 语义冲突。'
    },
    fourStarItemPool: {
      kind: 'item',
      weight: 0.5,
      entries: [
        { item: 'paper_scrap', amount: 3 },
        { item: 'moth_scale', amount: 2 },
        { item: 'old_snapshot', amount: 1 }
      ],
      note: '另一半 4★ 档给材料（道具已在 GD.items 登记），保证每次 4★ 都有实际所得。'
    },

    pools: [
      {
        id: 'pool_kai',
        name: '严守者 · 楷',
        kind: 'up',
        featured: ['kai'],
        pool: ['kai', 'jin', 'juan', 'mu', 'xi'],
        fiveStar: { baseRate: 0.006, softPityStart: 73, softPityStep: 0.06, hardPity: 90 },
        fourStar: { baseRate: 0.051, hardPity: 10 },
        upRule: { chance: 0.5, guaranteeInherit: true, scope: 'featured-series', note: '首次 5★ 有 50% 是 UP；歪了则下一只 5★ 必为 UP。该状态在本系列的限定池之间继承，常设池不参与，也不影响常设池的抽数计数器。' },
        note: '楷是本章唯一的 UP；他高智能但配额低，抽到只增加可用角色，不改任何配额上限。'
      },
      {
        id: 'pool_standard',
        name: '常设档案',
        kind: 'standard',
        featured: [],
        pool: ['xi', 'jin', 'juan', 'mu', 'kai'],
        fiveStar: { baseRate: 0.006, softPityStart: 73, softPityStep: 0.06, hardPity: 90 },
        fourStar: { baseRate: 0.051, hardPity: 10 },
        upRule: { chance: 0, guaranteeInherit: false, scope: 'none', note: '常设池无 UP，抽数计数器单独维护，不与其他池共享。' },
        note: '所有同伴都会进常设池，不存在「限时错过」的绝版角色。'
      }
    ],
    duplicate: {
      fiveStar: { constellationCap: 6, perDuplicate: { constellation: 1, echo: 10 }, afterCap: { echo: 25 } },
      fourStar: { constellationCap: 6, perDuplicate: { constellation: 1, echo: 2 }, afterCap: { echo: 5 } },
      material: { echo: 3, note: '抽到 4★ 材料档时按条目直接入包，不参与命座结算。' },
      note: '命座只强化该角色的既有技能数值，不新增槽位与配额上限，避免付费感。'
    },
    log: { keep: 200, note: '本地存档内保留最近 200 条，用于展示「距离保底还有几抽」。' }
  };

  // 每日打卡：7 日一循环，按设备本地日期幂等，断签不清零只顺延
  GD.checkin = {
    version: 'checkin/2',
    cycleDays: 7,
    idempotentKey: 'localDate',
    dayBoundary: '00:00 设备本地时间',
    rule: '同一本地日期只能领取一次；重复调用返回 alreadyClaimed，不消耗次数、不改进度。',

    cycle: {
      startKey: 'firstClaimLocalDate',
      startRule: '首次领取当天的本地日期即本周期第 1 天',
      endOffsetDays: 6,
      endKey: 'cycleStart + endOffsetDays',
      dayIndexFormula: 'dayIndex = daysBetween(cycleStart, localDate) + 1',
      expireRule: '本地日期超过 cycleEnd 时，本周期结束：未补的格子作废，不回补、不累计到下周期',
      nextCycleStart: '周期结束后的第一次领取，重新作为新周期第 1 天'
    },

    rewards: [
      { day: 1, items: [{ currency: 'page', amount: 1 }], text: '页签 ×1' },
      { day: 2, items: [{ currency: 'echo', amount: 20 }], text: '回响 ×20' },
      { day: 3, items: [{ currency: 'page', amount: 1 }], text: '页签 ×1' },
      { day: 4, items: [{ currency: 'echo', amount: 30 }, { item: 'paper_scrap', amount: 2 }], text: '回响 ×30、残页碎片 ×2' },
      { day: 5, items: [{ currency: 'page', amount: 2 }], text: '页签 ×2' },
      { day: 6, items: [{ currency: 'echo', amount: 40 }], text: '回响 ×40' },
      { day: 7, items: [{ currency: 'page', amount: 3 }, { currency: 'echo', amount: 60 }], text: '页签 ×3、回响 ×60 · 本周满勤' }
    ],

    makeup: {
      allow: true,
      maxPerCycle: 2,
      cost: { currency: 'echo', amount: 20 },
      eligibleRule: 'dayIndex >= 1 且 dayIndex < 今日 dayIndex，且该格未领取',
      forbidFuture: true,
      forbidClaimed: true,
      windowRule: '仅在本周期内（localDate <= cycleEnd）可补；周期结束后不再受理',
      text: '轻补签：补一格花 20 回响，每周期最多补两格，不能补未来的格子。'
    },

    breakRule: {
      resetOnMiss: false,
      text: '断签不重置周期、不清空已领奖励、不扣除任何资源；只是当天格子保持未领，可在本周期内补签。'
    },
    note: '全部奖励为游戏内货币与既有道具，不发放真实货币、券码或账号权益。'
  };
})(window);