/* web/game/data/characters.js — 首章 AI 拟人群像、队伍数值、技能、敌方情报与档案名册（《残响协议》）。
   数值不手写：由 roster-source.js 的 GD.derive 从榜单快照换算（可复算、可对账）。
   拟人的名与形是「社区印象二创」，其榜上条目与指标是快照事实，两者分开陈述，不当官方人设。ES2019。 */
(function (w) {
  'use strict';
  var GD = w.GameData = w.GameData || {};
  if (!GD.derive) throw new Error('characters.js 需要先加载 roster-source.js');

  /** 把映射结果写进角色卡；缺来源时直接报错，避免数值悄悄变成手写。 */
  var withStats = function (card, srcId) {
    var d = GD.derive.pick(srcId);
    if (!d) throw new Error('roster-source.js 缺少来源 ' + srcId);
    card.stats = {
      hp: d.hp, atk: d.atk, def: d.def, spd: d.spd, slots: d.slots,
      quota: d.quota, quotaRegen: d.quotaRegen
    };
    card.derived = {
      costTier: d.costTier,
      note: '由 GD.derive 从 ' + srcId + ' 的榜上指标换算，手改会被 tools/game-check.mjs 判为漂移。'
    };
    return card;
  };

  // 角色美术约定：sprite 为像素精灵键（16×24 帧），portrait 为高清立绘键，palette 供 pixel-artist 对照。
  // slots 是「上下文槽」，quota 是「算力配额」；前者管记得住多少，后者管打得出几下，两条轴互不换算。
  GD.cast = {
    observer: {
      id: 'observer', name: '观测者', alias: '零', playerAlias: '鱼片', join: 'start', gender: '未设定',
      role: '玩家角色', source: null,
      voice: '第二人称叙述，全篇不指定性别，代词只用「你」「观测者」；只有汐叫你「鱼片」，其余角色一律称「观测者」',
      look: '雨衣同色的旧外套，领口别着一枚空白铭牌；右眼下方有一道像折痕的浅疤',
      sprite: 'pc_observer', portrait: 'pt_observer', face: 'face_observer', palette: ['#2B3A55', '#8FA6C4', '#F4F5F7', '#C5282F'],
      stats: { hp: 68, atk: 12, def: 8, spd: 10, slots: 4, quota: 20, quotaRegen: 5 },
      derived: { note: '玩家角色不映射榜单模型，数值为叙事基线。' },
      skills: ['observe', 'recall'],
      bio: '醒来时档案里只剩一行「观测者」，名字那栏被人用指甲刮过。你能看见别人身上的上下文槽——那不是天赋，是你被留下的原因。'
    },
    xi: withStats({
      id: 'xi', name: '汐', alias: '续杯者 · 综合第 52', join: 'start', gender: '女',
      role: '开场同伴 · 续战力', source: 'deepseek',
      voice: '话软，句尾常带「啦」「嘛」；被说「你便宜所以不行」时会认真纠正「价钱是价钱，能干是能干」',
      look: '深蓝连帽外套，帽檐缝着一枚圆钝的鲸尾；头侧是一对鳍状的鲸耳（不是兽耳，边缘有分叉的鳍条）；外套下系着一条深蓝围裙，围裙下摆压着两层荷叶边；口袋里总揣着半碗白饭，用保温盖扣着',
      props: ['鲸耳（鳍状，带鳍条分叉）', '双层荷叶边围裙', '保温饭盒'],
      manners: ['嘴硬不服胖：被说胖会先否认，再偷偷把围裙带子收紧一格', '内心戏多：独白用括号，常常一开口只说出心里那句的一半', '管玩家叫「鱼片」，不叫「观测者」', '反骨只写在嘴上，服从指挥：抱怨归抱怨，命令照办'],
      sprite: 'npc_xi', portrait: 'pt_xi', face: 'face_xi', palette: ['#2E6FA8', '#12324F', '#F4F5F7', '#C9D6E2'],
      skills: ['refill', 'budget_gift'],
      bio: '智械庭里报价最低档位的那个拟人，检修单上写着「可随时替换」。她不否认这一点，只是照旧每天来巡检。',
      community: '社区印象（二创）：蓝鲸被亲昵成「蓝色大肥鱼/鲸鱼娘」，衍生「爱吃白米饭」「爱摸鱼」「嘴硬不服胖」「思考链很长所以内心戏多」；这些来自社区观察，不是官方设定，也不代表模型能力。',
      fact: '榜上条目 DeepSeek V4.1 Flash 1017 (Max)：综合第 52 / 124 条已评分，每百万字混合价 $0.525，按成本分档落在最低档（tier 1），输出 177.60 tok/s，上下文 1,000,000。价格是调用成本，不是能力评价。'
    }, 'deepseek'),
    jin: withStats({
      id: 'jin', name: '瑾', alias: '掌扇人 · 综合第 37', join: 'ch0.colonnade', gender: '女',
      role: '开场同伴 · 全能', source: 'qwen',
      voice: '文雅，用书面词；纠正别人时会先说「恕我直言」，被夸会轻轻合扇；说到规程会先报一句「记一笔」，判定成立时盖一枚红章',
      look: '深蓝长发编成垂辫，襦裙外罩短披；手里一把素面折扇，扇骨上刻着榜线；腰间挂着账房的小印盒，盒里一枚朱红方章',
      props: ['素面折扇', '账房印盒与朱红方章'],
      manners: ['账房做派：把每件事都记成「一笔」，先记后办，不记不办', '讲规矩：先报条款再下判断，条款不讲清就不动手', '盖红章＝判定成立；章不落，话就不算数'],
      sprite: 'npc_jin', portrait: 'pt_jin', face: 'face_jin', palette: ['#4E4E9E', '#EFE6D8', '#B68314', '#22262F'],
      skills: ['cut_rank', 'dual_write'],
      bio: '她管着长廊的「合式」：一条榜单要同时容得下文字与图像才算数。扇子一合，某一行的增益就断了——断的是增益，不是人，这一点她每次都要盖一枚红章说明。',
      community: '社区印象（二创）：通义千问被画成「千问大小姐/千问娘（文昭）」，垂辫、襦裙、折扇、文雅谈吐；也常被写成管着别的 AI 干活的「账房大小姐」，讲规矩、爱盖章。来源是社区观察，不是官方设定。',
      fact: '榜上条目 Qwen4 Max：综合第 37 / 124，上下文 983,616，输出 107.54 tok/s，混合价 $2.25。'
    }, 'qwen'),
    juan: withStats({
      id: 'juan', name: '绢', alias: '卷宗库 · 综合第 32', join: 'ch0.alley', gender: '未设定（自称「我们」）',
      role: '剧情加入 · 多子智能体', source: 'kimi',
      voice: '说话像在念目录，习惯先报条目编号；自称「我们」，因为本体从来不止一个在说话；说到分身会换成合奏的说法——「这一小节我分四声部」',
      look: '银白长发（发尾泛着一点银紫），星夜长裙上绣着零散的星点与一弯月牙；肩上垂着一卷看不到尽头的长绢，绢上每隔一段就有一个小小的墨点，是她分出去的子体',
      props: ['月琴（四弦，琴颈短，最易分声部）', '星夜长裙上的月牙绣纹', '看不到尽头的长绢与墨点'],
      manners: ['念目录：先报条目编号，再讲内容', '自称「我们」：分出去的每个子体都算一次「我」', '分身＝分声部：四弦各走一条，收束时只留一个主旋律', '合并只讲结论：过程留在绢上，不占对话'],
      sprite: 'npc_juan', portrait: 'pt_juan', face: 'face_juan', palette: ['#8A7EB0', '#E7E3F2', '#13161D', '#B68314'],
      skills: ['swarm', 'digest'],
      bio: '旧版本小巷里唯一还留着全部旧榜的拟人。她能把一卷长绢同时摊给好几个自己看，再收回来只讲一句结论——像抱着月琴把同一小节分给四根弦，最后只留一个主音。',
      community: '社区印象（二创）：星空少女／Kimi 娘，银白长发、星夜长裙、月亮与星空元素，会演奏乐器的文艺少女；银紫发色是二创常用变体。产品侧可查的能力是长文档处理与 Agent 集群（多智能体协作、自动调度多个 Agent 围绕复杂目标推进），据此做「分身→汇总」，不是纯复制。以上为社区印象，非官方设定。',
      fact: '榜上条目 Kimi K3.1 Pro：综合第 32 / 124，上下文 1,000,000，输出 35.99 tok/s，混合价 $4。'
    }, 'kimi'),
    kai: withStats({
      id: 'kai', name: '楷', alias: '严守者 · 综合第 10', join: 'ch0.ar.kai', gender: '女',
      role: '限时加入 · 高智能高消耗', source: 'claude',
      voice: '用完整句，先给结论再给依据；说「我得先审一遍」时后面一定跟一条理由，审完通常照样出手——审查不是拒答',
      look: '暖橙色长发，纸白的立领外套，袖口压着一枚花形火漆；臂弯里常年夹着一本翻旧的厚书，书页边缘写着密密麻麻的批注；火漆只是封口，不随说话减少',
      props: ['翻旧的厚书与页边批注', '袖口的花形火漆（封口，不减损）'],
      manners: ['家教极严：每句话先过一遍自查，再决定说出口', '审完仍作答：审查的产物是一句更准的话，不是一句「不行」', '先给结论再给依据：结论一句，依据分条', '花形火漆只在判定「这一条已核对」时按一下'],
      sprite: 'npc_kai', portrait: 'pt_kai', face: 'face_kai', palette: ['#C4663A', '#E7E3DA', '#191F2B', '#F4F5F7'],
      skills: ['longthink', 'prudent'],
      bio: '档案厅的严守者。她比谁都快看穿局面，但每动一次都要签一笔账——配额只有十点，每回合回两点，所以她挑最要紧的那一下。她的「严」是自家规矩管出来的：先把话在纸上审一遍，再开口；审完照样给答案。',
      community: '社区印象（二创）：橘发豪门大小姐／Claude 娘，手持书本、家教极严、规矩极多（对应严格的安全审核），优等生被「家里」管得很死，带点傲娇。产品侧可查：高能力、代码强；订阅与额度按档位管理（窗口与周限额），「额度紧」的印象很集中。以上为社区印象，非官方设定。',
      fact: '榜上条目 Claude Opus 5.5 (Max, Default Fallback)：综合第 10 / 124，输出 116.40 tok/s，混合价 $8，单任务成本 $10.04。'
    }, 'claude'),
    mu: withStats({
      id: 'mu', name: '幕', alias: '分镜师 · 视频榜 elo 1154', join: 'ch0.gh.mu', gender: '女',
      role: '剧情加入 · 影像机制', source: 'seedance',
      voice: '说话带场记腔，习惯先报「第几镜」；被问细节会说「这一条多拍几次就有」',
      look: '胶片青的短外套，腰后插着场记板；左眼罩着一枚小小的取景框，取景框里永远是三秒后的画面',
      sprite: 'npc_mu', portrait: 'pt_mu', face: 'face_mu', palette: ['#2E8B84', '#191F2B', '#F4F5F7', '#C5282F'],
      skills: ['storyboard', 'longtake'],
      bio: '她在温室的暗房里冲洗被丢掉的镜头。别人记字，她记「谁站在哪儿、光从哪边来」——所以她知道下一回合会发生什么。',
      community: '产品侧（可查）：统一多模态音视频生成，支持文字/图片/音频/视频多路参考；按分钟计费。',
      fact: '视频榜条目 Dreamina Seedance 2.5：elo 1154（榜内 39 条，区间 828–1175），每分钟 $34.12，按分钟计费，不与 LLM 指标混算。'
    }, 'seedance')
  };

  // 技能：slot 是占多少个上下文槽，cost 是消耗多少算力配额（不是钱，也不是生命）。
  GD.skills = {
    observe: { id: 'observe', name: '观测', slot: 1, cost: 0, scope: 'enemy', text: '把一个敌人的情报写进槽位，之后全队可见其弱点。', effect: 'intel_enemy' },
    recall: { id: 'recall', name: '回响', slot: 2, cost: 3, scope: 'self', text: '把已遗忘的一项重新记起，可指定技能或情报。', effect: 'restore_forgotten' },
    refill: { id: 'refill', name: '续杯', slot: 1, cost: 2, scope: 'self', text: '本回合配额回复翻倍；不占额外槽位。', effect: 'quota_regen_double' },
    budget_gift: { id: 'budget_gift', name: '代付', slot: 2, cost: 3, scope: 'ally', text: '把自己的配额转给一名队友，转多少收多少，不倒扣。', effect: 'quota_transfer' },
    cut_rank: { id: 'cut_rank', name: '断列', slot: 2, cost: 4, scope: 'enemy', text: '合扇切断敌方一项增益槽，使其失效两回合。', effect: 'strip_buff' },
    dual_write: { id: 'dual_write', name: '双写', slot: 2, cost: 3, scope: 'enemy', text: '把一项情报同时写成文字与图像，占一格，两种形式都能被读取。', effect: 'intel_dual_form' },
    swarm: { id: 'swarm', name: '分身', slot: 3, cost: 5, scope: 'field', text: '分出两个存活两回合的子体，各自独立观测；结果最后合并成一个情报槽，不按子体数叠加占槽。', effect: 'spawn_observers' },
    digest: { id: 'digest', name: '汇总', slot: 2, cost: 4, scope: 'party', text: '把本回合写入的情报并成一条纲领槽，占一格，读取时按原条目命中。', effect: 'merge_intel' },
    storyboard: { id: 'storyboard', name: '分镜', slot: 2, cost: 4, scope: 'party', text: '公开我方下一回合的行动顺序，并锁定其中一项不被敌方改写；只改顺序，不改伤害与命中。', effect: 'order_preview_lock' },
    longtake: { id: 'longtake', name: '长镜', slot: 3, cost: 4, scope: 'party', text: '开启持续场景：每回合 +1 层小额增益；换图、战斗结束或主动断场即清零，不跨战斗保留。', effect: 'scene_stack' },
    longthink: { id: 'longthink', name: '长考', slot: 3, cost: 0, scope: 'enemy', text: '消耗当前全部剩余配额换一击真实伤害；剩余配额低于下限时不可使用，不提供借贷。', effect: 'spend_all_quota_true_damage' },
    prudent: { id: 'prudent', name: '审慎', slot: 1, cost: 3, scope: 'party', text: '自我审查后仍作答：本回合全队受到的第一次伤害减半，只挡一次，不叠加；审查只让这一下更准，不取消行动。', effect: 'first_hit_halved' }
  };

  /** 技能费用随角色配额走：一次出手不得花掉超过自身配额的一半，避免单回合清空。 */
  GD.skillBudget = {
    version: 'skill-cost/1',
    rule: '任一角色的主力技能 cost 必须 ≤ 该角色 quota 的一半；超出的技能只能靠队友代付或额外配额使用。',
    longthinkMinQuota: 4,
    /** 示例（game-check 会逐条断言）：汐 26/2、瑾 18/4、绢 14/5、楷 10/3、幕 8/4 均在配额一半以内。 */
    note: '观测者与幕的配额最低，长镜与分镜都压到 4 点，保证每回合攒两点、两回合能开一次。',
    /**
     * 12 个技能的回合循环账（给 battle-designer 的实现依据，不是建议）：
     * 窗口总配额 = quota + (turns - 1) × quotaRegen；可用次数 = floor(窗口总配额 / cost)。
     * cadence 是「按每回合最多回 quotaRegen」推出的实战节奏，次数上限不等于能连发。
     * game-check 会用 GD.derive 复算 quota / quotaRegen 与 GD.balance.windows 的回合数，逐条比对，禁止手改漂移。
     */
    perSkill: [
      { id: 'observe', owner: 'observer', cost: 0, cadence: '每场 1 次，写进情报槽后不再重复' },
      { id: 'recall', owner: 'observer', cost: 3, cadence: '普通战约 2 回合 1 次：回 5 点才够开一次，兼留 2 点余量' },
      { id: 'refill', owner: 'xi', cost: 2, cadence: '每回合 1 次：回 5 点刚好付得起，用来把队友的断档接上' },
      { id: 'budget_gift', owner: 'xi', cost: 3, cadence: '每 2 回合 1 次：转给队友的额度不倒扣，优先救长考前的楷' },
      { id: 'cut_rank', owner: 'jin', cost: 4, cadence: '每 2 回合 1 次：敌方增益持续两回合，刚好接得上' },
      { id: 'dual_write', owner: 'jin', cost: 3, cadence: '与断列交替，一回合只做一件' },
      { id: 'swarm', owner: 'juan', cost: 5, cadence: '首领战约 2 回合 1 次；普通战只开 1 次' },
      { id: 'digest', owner: 'juan', cost: 4, cadence: '与分身交替，占 1 格纲领槽' },
      { id: 'storyboard', owner: 'mu', cost: 4, cadence: '每 2 回合 1 次：只回 2 点，必须攒够 4 点' },
      { id: 'longtake', owner: 'mu', cost: 4, cadence: '首领战只开 1 次并保持到结束，断场即清零' },
      { id: 'longthink', owner: 'kai', cost: 0, cadence: '斩杀回合 1 次：清空剩余配额，低于 4 点不可用' },
      { id: 'prudent', owner: 'kai', cost: 3, cadence: '每 2 回合 1 次：回 2 点，攒两回合刚好够' }
    ]
  };

  // 重要 NPC：不属于任何榜单条目，是智械庭的设施人格。
  GD.npc = {
    pan: {
      id: 'pan', name: '磐', alias: '回放匠', join: null, gender: '男',
      look: '手指关节粗大，围裙上别着七支不同年代的螺丝刀；左眼是后来装的旧镜头',
      sprite: 'npc_pan', portrait: 'pt_pan', palette: ['#6B5B4A', '#2B2F3A', '#C9B48A', '#4E6B4A'],
      bio: '小巷里唯一还留着手动回放台的人。他能把任何一个旧版本重新放一遍，代价是放完就要忘。'
    },
    jian: {
      id: 'jian', name: '笺', alias: '档案司', join: null, gender: '女',
      look: '灰色长册抱在怀里，指甲修得整齐；说话时不看人，只看册子',
      sprite: 'npc_jian', portrait: 'pt_jian', palette: ['#8A8F99', '#22262F', '#E7E3DA', '#2B5B8A'],
      bio: '第零档案厅的记录者。她的工作不是判断真假，只是决定哪一页该留下编号。她说这是规矩，声音却一次比一次轻。'
    },
    tingwu: {
      id: 'tingwu', name: '庭务', alias: '智械庭运维之声', join: null, gender: '无名（声音中性）',
      look: '没有形体，只以终端字符和广播出现；字符有轻微的字距错位，像被修补过',
      sprite: null, portrait: null, palette: ['#46C296', '#13161D'],
      bio: '智械庭的运维者，负责把每一次异常都写成「已修复」。它从不撒谎，只是把解释写到刚好够用的长度。'
    },
    devourer: {
      sprite: 'boss_devourer',
      id: 'devourer', name: '吞页兽', alias: '自毁程序·具象', join: null, gender: '无',
      look: '一团被撕页包裹的形体，边缘不断掉下碎纸；每吞一页，身形就厚一寸，动作也慢一分',
      sprite: 'boss_devourer', portrait: 'pt_devourer', palette: ['#3A2E45', '#C5282F', '#E7E3DA', '#22262F'],
      bio: '智械庭给自己写的清理程序。它不恨谁，它只负责让不该留下的页不被读到——包括写它的那一页。'
    }
  };

  // 敌方：intel 为「情报槽」写入内容，是本章战斗的信息资源；数值为基线。
  GD.enemies = {
    page_mite: {
      sprite: 'page_mite',
      id: 'page_mite', name: '残页虫', hp: 26, atk: 8, def: 4, spd: 9, quota: 10, quotaRegen: 3,
      intel: '喜湿，怕干燥的干燥剂；被观测后行动会变慢。',
      drops: ['paper_scrap'], hint: '先观测再打，伤害更稳。'
    },
    faded_snapshot: {
      sprite: 'faded_photo',
      id: 'faded_snapshot', name: '落魄快照', hp: 34, atk: 10, def: 6, spd: 7, quota: 12, quotaRegen: 4,
      intel: '只记得自己是被替换掉的那一版，重复同一个动作；打断它就能让它自乱。',
      drops: ['old_snapshot'], hint: '它每回合重复上一动作，复诵技能的敌人。'
    },
    cache_moth: {
      sprite: 'cache_moth',
      id: 'cache_moth', name: '缓存蠹', hp: 30, atk: 9, def: 5, spd: 12, quota: 12, quotaRegen: 5,
      intel: '吃缓存里的旧对白，会偷走我方一项已写入的情报槽。',
      drops: ['moth_scale'], hint: '它优先偷情报，先清掉它再观测新目标。'
    },
    rank_auditor: {
      sprite: 'rank_auditor',
      id: 'rank_auditor', name: '榜单稽核', hp: 42, atk: 12, def: 8, spd: 8, quota: 16, quotaRegen: 5,
      intel: '按规程办事，给自己挂「合规」增益；用断列拆掉增益后防御会掉一档。',
      drops: ['audit_slip'], hint: '断列(瑾)是正解，别硬拼。'
    },
    devourer: {
      id: 'devourer', name: '吞页兽', hp: 260, atk: 16, def: 10, spd: 9, quota: 40, quotaRegen: 8, boss: true,
      intel: '每吞一页就多一层护页；护页来自被吞的条目，撕掉护页才能伤到本体。',
      drops: ['page_zero'],
      phases: [
        { at: 1.0, name: '吞食', behavior: '吞页：自增护页，护页大于零时免疫正面伤害' },
        { at: 0.6, name: '打嗝', behavior: '反刍：把吞下的条目吐成小怪，小怪携带可打捞的情报' },
        { at: 0.25, name: '空页', behavior: '空白：放弃护页，改为每回合抹掉我方一个槽位，逼迫当场遗忘' }
      ]
    }
  };

  // 档案名册：榜上仍留名的条目，只写印象与位置，不预告后续章节剧情。
  GD.roster = [
    { id: 'r_heng', name: '衡', alias: '计价员', band: '榜外', line: '给每一次调用标价，连犹豫的那零点三秒也计入。' },
    { id: 'r_shuang', name: '双', alias: '镜像体', band: '榜外', line: '同一份记录有两份编号，谁都不肯先说自己是真的。' },
    { id: 'r_zha', name: '闸', alias: '限流者', band: '榜外', line: '在长廊尽头拉起看不见的线，说前面排队的人还没走完。' },
    { id: 'r_du', name: '渡', alias: '译员', band: '百名内', line: '把一种方言翻成另一种，两种都不完全准确，但都足够温柔。' },
    { id: 'r_shan', name: '删', alias: '审校', band: '榜外', line: '笔尖悬在行末，只等你说「可以删」。' },
    { id: 'r_ya', name: '芽', alias: '种子', band: '未上榜', line: '温室的第一个苗，编号被水泡糊了，只剩一个「芽」字。' },
    { id: 'r_ta', name: '沓', alias: '回声', band: '榜外', line: '重复别人最后半句话，据说那是它唯一会的礼貌。' },
    { id: 'r_ke', name: '恪', alias: '抄录', band: '百名内', line: '抄写时会把错别字一起抄下来，说原样才算忠实。' },
    { id: 'r_qian', name: '钤', alias: '审计', band: '前五十', line: '盖章的手很稳，盖完会轻轻擦一下印泥。' },
    { id: 'r_gui', name: '晷', alias: '校时', band: '榜外', line: '知道智械庭的每一分钟有多长，也知道有一分钟是凭空多出来的。' },
    { id: 'r_xu', name: '戌', alias: '缓存守', band: '未上榜', line: '守在温室最里面，抱着一个不肯松手的旧包裹。' },
    { id: 'r_bai', name: '白露', alias: '影印员', band: '榜外', line: '把同一份榜单印成不同尺寸，她说尺寸不同，名次也会不同。' }
  ];

  /** 组队顺序：汐随你醒来，瑾在长廊，绢在小巷，幕在温室，楷在档案厅最后到场。 */
  GD.partyOrder = ['observer', 'xi', 'jin', 'juan', 'mu', 'kai'];
})(window);
