/* web/game/data/roster-source.js — 榜单快照摘录、社区印象二创与 bench→战斗数值映射；运行时只读 GameData，快照漂移由 game-check 断言。 */
(function (w) {
  'use strict';
  var GD = w.GameData = w.GameData || {};

  // 快照来源与聚合值：所有映射公式只依赖这一块，可复算
  GD.snapshot = {
    llm: {
      id: 'aa', source: 'web/seed/aa.json', fetchedAt: 1795688511201,
      at: '2026-11-26T10:21:51.201Z',
      modelCount: 290, scoredCount: 124,
      note: '应用内榜单快照（只读缓存）。scoredCount 为 intelligenceIndex 非 null 的记录数，百分位均以此为分母。'
    },
    media: {
      id: 'aa_t2v', source: 'web/seed/aa_t2v.json', fetchedAt: 1795688511830,
      at: '2026-11-26T10:21:51.830Z', rows: 39, count: 39, dataSource: 'web', priceUnit: '/分钟',
      note: '视频榜快照。视频模型不参与 intelligenceIndex 比较，另用 elo 与每分钟价格换算。'
    },
    aggregates: {
      intMin: 1.70629313092144, intMax: 64.7656159586463, scoredCount: 124,
      tpsMax: 758.107661151047, eloMin: 828, eloMax: 1175
    }
  };

  GD.characterPolicy = {
    version: 'persona/1',
    communityImpressionIsFanArt: true,
    notOfficialPersona: true,
    noVendorLogo: true,
    rule: '角色外形与口头禅只作「社区印象二创」；每一句涉及数字的台词必须能对到 bench 字段，不许凭印象写评价。'
  };

  // 选定的角色来源：同厂商多模型绑定明确 slug，字段只用 bench 命名
  GD.modelPicks = {
    deepseek: {
      id: 'deepseek', kind: 'llm', vendor: 'DeepSeek',
      label: 'DeepSeek V4.1 Flash 1017 (Max)', slug: 'deepseek-v4-1-flash-1017', variant: 'Max',
      bench: {
        intelligenceIndex: 32.4041772319906, intelligenceRank: 52, scoredCount: 124,
        contextWindowTokens: 1000000, outputTokensPerSecond: 177.603366077317,
        ttftSeconds: 1.18085081008313, priceInputPer1M: 0.3, priceOutputPer1M: 1.2,
        priceBlended3to1Per1M: 0.525, cacheReadPer1M: 0.006, costPerTask: 0.6021,
        openWeights: true, releaseDate: '2026-10-17'
      },
      impression: '社区印象（二创依据）：蓝鲸 Logo 被亲昵成「蓝色大肥鱼/鲸鱼娘」，衍生出「吃白饭」的梗；榜上同一条目的价格档位低、输出速度快。'
    },
    qwen: {
      id: 'qwen', kind: 'llm', vendor: 'Alibaba',
      label: 'Qwen4 Max', slug: 'qwen4-max', variant: 'Max',
      bench: {
        intelligenceIndex: 42.7904442277464, intelligenceRank: 37, scoredCount: 124,
        contextWindowTokens: 983616, outputTokensPerSecond: 107.538333847242,
        ttftSeconds: 6.50177672968908, priceInputPer1M: 1.5, priceOutputPer1M: 4.5,
        priceBlended3to1Per1M: 2.25, cacheReadPer1M: 0.075, costPerTask: 3.2681,
        openWeights: false, releaseDate: '2026-11-16'
      },
      impression: '社区印象（二创依据）：通义千问被画成「千问大小姐/千问娘」，蓝紫长发、折扇、汉洋折衷长裙，谈吐文雅；也有老师、开源队友的版本。'
    },
    kimi: {
      id: 'kimi', kind: 'llm', vendor: 'Kimi',
      label: 'Kimi K3.1 Pro', slug: 'kimi-k3-1-pro', variant: 'Pro',
      bench: {
        intelligenceIndex: 46.553633775429, intelligenceRank: 32, scoredCount: 124,
        contextWindowTokens: 1000000, outputTokensPerSecond: 35.9892281376247,
        ttftSeconds: 3.22311493259742, priceInputPer1M: 2, priceOutputPer1M: 10,
        priceBlended3to1Per1M: 4, cacheReadPer1M: 0.2, costPerTask: 3.6812,
        openWeights: true, releaseDate: '2026-10-23'
      },
      impression: '社区印象（二创依据）：长文档处理是公认强项；产品侧 Agent 集群、多智能体协作是可查的能力点。'
    },
    claude: {
      id: 'claude', kind: 'llm', vendor: 'Anthropic',
      label: 'Claude Opus 5.5 (Max, Default Fallback)', slug: 'claude-opus-5-5', variant: 'Max',
      bench: {
        intelligenceIndex: 59.1249717392035, intelligenceRank: 10, scoredCount: 124,
        contextWindowTokens: 1000000, outputTokensPerSecond: 116.403986075362,
        ttftSeconds: 356.065453901663, priceInputPer1M: 4, priceOutputPer1M: 20,
        priceBlended3to1Per1M: 8, cacheReadPer1M: 0.2, cacheWritePer1M: 5, costPerTask: 10.0364,
        openWeights: false, releaseDate: '2026-09-22'
      },
      impression: '社区印象（二创依据）：高能力、代码强；订阅与额度按档位管理（窗口与周限额），用户对它「额度紧」的印象很集中。'
    },
    seedance: {
      id: 'seedance', kind: 'media', vendor: 'ByteDance Seed',
      label: 'Dreamina Seedance 2.5', slug: '57913d03-a959-4752-8027-8991612448ed', variant: '标准',
      bench: {
        elo: 1154, appearances: 9260, pricePerMinute: 34.12, openWeights: false, releaseDate: '2026-07-31',
        priceUnit: '/分钟', boardSource: 'web/seed/aa_t2v.json'
      },
      impression: '产品侧（可查）：统一多模态音视频生成，支持文字/图片/音频/视频多路参考；按分钟计费，单条镜头成本高。'
    }
  };

  // 映射公式：benchmark→战斗数值；费用只进算力配额，不换算成余额
  var round4 = function (v) { return Math.round(v * 10000) / 10000; };
  var clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  // 成本分档：价格每翻一倍进一档，clamp 0..5，差幅有界
  var costTier = function (unitPrice, basePrice) {
    return clamp(Math.round(Math.log(unitPrice / basePrice) / Math.LN2), 0, 5);
  };

  GD.derive = {
    version: 'stat-map/2',
    dims: ['hp', 'atk', 'def', 'spd', 'slots', 'quota', 'quotaRegen'],
    costTier: costTier,
    // LLM：智能→atk、输出速度→spd、上下文→slots、混合价→成本档位→配额
    llm: function (b, agg) {
      var iiNorm = (b.intelligenceIndex - agg.intMin) / (agg.intMax - agg.intMin);
      var power = Math.round(20 + 40 * iiNorm);
      var speedNorm = Math.sqrt(clamp(b.outputTokensPerSecond / agg.tpsMax, 0, 1));
      var spd = Math.round(10 + 80 * speedNorm);
      var slots = clamp(3 + Math.floor(Math.log(b.contextWindowTokens / 131072) / Math.LN2), 3, 8);
      var tier = costTier(b.priceBlended3to1Per1M, 0.2);
      var quota = 30 - 4 * tier;
      var quotaRegen = clamp(Math.round(quota * 0.2), 2, 6);
      var hp = Math.round(40 + power * 0.6 + quota * 0.5);
      var def = Math.round(3 + power * 0.2 + slots * 0.8);
      return {
        hp: hp, atk: power, def: def, spd: spd, slots: slots,
        quota: quota, quotaRegen: quotaRegen, costTier: tier,
        derived: {
          iiNorm: round4(iiNorm), speedNorm: round4(speedNorm), costTier: tier,
          percentile: Math.round(100 * (1 - (b.intelligenceRank - 1) / agg.scoredCount) * 10) / 10
        }
      };
    },
    // 视频生成：elo→atk、每分钟价格→成本档位→配额；固定慢出手与 4 格场景槽
    media: function (b, agg) {
      var eloNorm = (b.elo - agg.eloMin) / (agg.eloMax - agg.eloMin);
      var power = Math.round(20 + 40 * eloNorm);
      var tier = costTier(b.pricePerMinute, 1.5);
      var quota = 18 - 2 * tier;
      var quotaRegen = Math.max(2, Math.round(quota * 0.25));
      var slots = 4;
      var spd = 18;
      var hp = Math.round(40 + power * 0.6 + quota * 0.5);
      var def = Math.round(3 + power * 0.2 + slots * 0.8);
      return {
        hp: hp, atk: power, def: def, spd: spd, slots: slots,
        quota: quota, quotaRegen: quotaRegen, costTier: tier,
        derived: {
          eloNorm: round4(eloNorm), costTier: tier,
          percentile: Math.round(100 * (1 - (b.elo - agg.eloMin) / (agg.eloMax - agg.eloMin)) * 10) / 10
        }
      };
    },
    pick: function (id) {
      var p = GD.modelPicks[id];
      if (!p) return null;
      var agg = GD.snapshot.aggregates;
      return p.kind === 'media' ? GD.derive.media(p.bench, agg) : GD.derive.llm(p.bench, agg);
    }
  };

  // 角色 id → 来源 id；玩家角色不映射任何模型
  GD.castSource = { deepseek: 'deepseek', qwen: 'qwen', kimi: 'kimi', claude: 'claude', seedance: 'seedance' };

  // 平衡口径：回合先回 quotaRegen（上限 quota）并保留余量，技能消耗配额；regen/quota ≤1/4，没人能自补满或无限连招
  GD.balance = {
    version: 'balance/1',
    turnOrder: '回合开始 → 回复 quotaRegen（上限 quota）→ 结算技能消耗 → 敌方行动',
    carryOver: true,
    maxRegenRatio: 0.25,
    windows: {
      normal: { turns: 6, enemyHp: '26–42', note: '普通战按 6 回合预算，允许每回合 1 次 2–4 费技能。' },
      boss: { turns: 10, enemyHp: 260, note: '首领按 10 回合预算，需在撕护页与打断之间取舍。' }
    },
    // 每角色窗口预算：起始配额 + (回合数-1) × 每回合回复
    windowsByCharacter: {
      xi: { normal: 26 + 5 * 5, boss: 26 + 5 * 9, note: '续航位：续杯(2)+代付(3) 可每回合各一次，用来把队友的断档接上。' },
      jin: { normal: 18 + 4 * 5, boss: 18 + 4 * 9, note: '断列(4) 每两回合一次即可覆盖敌方增益；余量给双写(3)。' },
      juan: { normal: 14 + 3 * 5, boss: 14 + 3 * 9, note: '分身(5) 与汇总(4) 交替，一回合只做一件，避免同回合双开。' },
      kai: { normal: 10 + 2 * 5, boss: 10 + 2 * 9, note: '审慎(3) 约每两回合一次；长考(0) 会清空剩余配额，只在斩杀回合用。' },
      mu: { normal: 8 + 2 * 5, boss: 8 + 2 * 9, note: '分镜(4) 与长镜(5)：受每回合 2 点回复限制，普通战约 3 次分镜，长镜需攒两三回合才能开，断场即清零。' }
    },
    castPerWindow: {
      note: '每角色每场战斗可支配总配额 ÷ 主力技能费用 = 该技能最多可用次数（向下取整）。',
      kai_prudent: '普通战 20 ÷ 3 = 6 次；首领战 28 ÷ 3 = 9 次。',
      mu_storyboard: '总量上普通战 18 ÷ 4 = 4 次、首领战 26 ÷ 4 = 6 次；但每回合只回 2 点，实战节奏约为每两回合一次。',
      mu_longtake: '首领战 26 ÷ 4 = 6 次上限，实战通常只开 1 次长镜并保持到结束。',
      xi_refill: '普通战 51 ÷ 2 = 25 次，但受槽位与回合数限制，实际每回合 1 次。'
    }
  };

  // 机制口径：battle-designer 可直接照此实现
  GD.mechNotes = {
    quota: '算力配额：回合开始回复 quotaRegen（上限 quota），技能消耗配额，不消耗生命。配额是回合资源，与真实余额、密钥、额度塔、版本更新都无关，禁止换算成金额。',
    observe: '观测：把一个敌人的情报写进自己的情报槽，之后全队可读；同一敌人只写一次。',
    storyboard: '分镜预演：战斗开始与每 3 回合公开我方下一回合的行动顺序，并允许锁定其中 1 项不被敌方改写；只影响顺序，不改伤害与命中。',
    longtake: '持续场景：开启后每回合 +1 层，每层给固定小额增益；换图、战斗结束或主动断场即清零，不跨战斗保留。',
    anchor: '参考锚点：以 1 名队友为参考，复制其 1 项技能为本回合可用项；被复制者槽位与配额不变。',
    swarm: '分身集群：生成 2 个只存活 2 回合的子体，各自独立执行一次观测；结果最后合并为 1 个情报槽，不按子体数量叠加占槽。',
    digest: '汇总：把本回合子体与队友写入的情报合并成 1 个纲领槽，占 1 格，读取时按原条目命中。',
    longthink: '长考：消耗当前全部剩余配额打出一击真实伤害；剩余配额低于下限时不可使用，不提供借贷，也不预支下一回合。',
    prudent: '审慎：本回合全队受到的第一次伤害减半，只挡一次，不叠加。',
    multimodal: '多模态转写：把一项情报同时写成文字与图像两种形式，占 1 格，可供不懂文字的角色读取。',
    allround: '全能补位：临时接管任一队友的下一项技能，消耗按被接管技能结算。',
    refill: '续杯：本回合配额回复翻倍，不占槽位。'
  };

  // 剧情数字唯一来源：对白里的序列/行数/次数必须与此一致，由 game-check 逐句断言
  GD.narrative = {
    version: 'canon/1',
    sequence: '第七序列',
    sequenceRows: 12,
    overwrittenRows: 3,
    blankRowNumber: 8,
    blankRowCode: '000',
    priorCutRows: 4,
    priorCutOps: 4,
    todayCutOps: 1,
    totalCutRows: 7,
    totalCutOps: 5,
    chapterId: 'ch0',
    chapterDoneFlag: 'ch0.done',
    endingFlag: '第一章完。'
  };
})(window);