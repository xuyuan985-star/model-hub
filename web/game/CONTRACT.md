# 残响协议 · 数据契约与模块边界（首期）

本文件是**数据契约**，不是企划书。world-director 冻结此处字段；pixel-artist / game-engineer / battle-designer / integration-qa 按此实现，改动字段须先改本文件再改数据。

- 游戏名：**《残响协议》**；世界：**智械庭**；基调：温柔悬疑 + 轻冒险（非黑暗末世）。
- 首章：**《消失的第零页》**，主线 15–30 分钟（计划 30 分钟，只跑主线约 20 分钟）。
- 冲突：今晨 05:12 榜单上有 3 行被同一段**空白**覆盖——位置、编号、排位都在，内容没了。
- 玩家角色为**无固定性别原创观测者**，全篇不出现性别代词，第二人称叙述。
- 游戏**全离线**，不联网、不读密钥、不写现有数据源缓存。

## 1. 模块边界

```
web/game/data/*.js   ← 本任务产物：纯数据 + 只读工具函数，挂在 window.GameData
web/game/engine/*.js ← game-engineer：循环、渲染、输入、碰撞、存档
web/game/battle/*.js ← battle-designer：纯逻辑战斗状态机（无 DOM、无 Canvas）
web/game/ui/*.js     ← integration-qa：入口、菜单、立绘层、设置
```

硬性约束：

1. 数据文件只有 `(function (w) { w.GameData = w.GameData || {}; ... })(window)` 一种形态，**不引入依赖、不用 import/export、不用可选链、不用对象展开**（Chrome 91 可解析但项目统一 ES2019 风格）。
2. 数据文件**只读**：引擎不得修改 `GameData` 内任何对象，运行时状态一律放在存档对象里。
3. 现有五格主导航、`web/js/*`、`web/css/app.css`、Android 原生桥**均不在本模块改动范围**。游戏是「更多 → 像素冒险」的独立离线视图：**不读 aa-api 密钥、不改榜单/价格/额度任何数值、不写数据源缓存**。
4. 入口由 integration-qa 决定，本任务不写入口代码。
5. 存档复用原生 `Native.writeFile/readFile`（文件名 `game-save.json`，符合 `[A-Za-z0-9._-]{1,80}` 白名单），不新增原生方法；存档与主榜设置互不影响。
6. **打包缺口**：`tools/build-apk.sh` 第 2 步仅复制 `web/index.html web/css web/js web/seed web/assets`，不含 `web/game`；接入阶段必须补上。本任务不改该脚本。
7. 首次加载顺序（严格）：

```
web/game/data/roster-source.js   ← 榜单来源与映射公式，必须最先
web/game/data/world.js
web/game/data/characters.js      ← 依赖 GD.derive，缺 roster-source 会直接抛错
web/game/data/dialog.js
web/game/data/quests.js          ← 依赖 GD.narrative，缺 roster-source 会直接抛错
web/game/data/progress.js        ← 抽卡与打卡纯数据
```

8. **交互标记的写入时机**：交互点的 `flag` **必须在对白真正播放完成、`onEnd` 执行之后**才写入，不能在对话开场就写。引擎据此保证重播幂等——已完成的交互只重播文本，不重发奖励、不重复入队、不重复加槽位。
9. **首章停在 `ch0`**：结局只写 `ch0.ending.*` 与 `ch0.done`，**不得**把 `chapter` 推进到 `ch1`；次章内容不在本期范围，也不做预告。

## 2. 数据文件

| 文件 | 内容 | 主要消费者 |
| --- | --- | --- |
| `web/game/data/roster-source.js` | 快照来源与聚合值、5 个榜单条目、`GD.derive` 映射公式、`GD.balance` 平衡口径、`GD.mechNotes` 机制口径、`GD.narrative` 剧情数字 | 全部 |
| `web/game/data/world.js` | 世界总览、首章 5 张场景地图（ASCII 24×14）、33 个交互点（含 4 个长廊过路拟人）、门切换、遇敌表、首领触发 | 引擎 |
| `web/game/data/characters.js` | 6 名角色（观测者 + 5 名 AI 拟人）、12 个技能、`GD.skillBudget` 技能费用纪律、4 名重要 NPC、5 类敌人、12 条档案名册 | 战斗 + 美术 |
| `web/game/data/dialog.js` | 58 个对白节点、分支、双结局、道具表 | 引擎 + UI |
| `web/game/data/quests.js` | 52 条剧情标记、主线 10 步、7 段节奏（30 分钟）、三条战斗轴 | 引擎 + UI |
| `web/game/data/progress.js` | 抽卡池/概率/保底/重复转化、7 日打卡与补签规则、纯免费货币 | 战斗逻辑 + UI |

## 3. 榜单来源与数值映射（`roster-source.js`）

数据来自应用内榜单的**只读缓存快照**，不联网：

| 快照 | 文件 | fetchedAt | 备注 |
| --- | --- | --- | --- |
| LLM | `web/seed/aa.json` | 1795075584488（2026-11-19T08:06:24.488Z） | 287 条记录，125 条有 `intelligenceIndex`；`meta.intelligenceIndexVersion = 5.0.1` |
| 视频 | `web/seed/aa_t2v.json` | 1795233946359（2026-11-21T04:05:46.359Z） | 35 条，价格单位 `/分钟` |

聚合值（`GD.snapshot.aggregates`，可复算）：`intMin=1.70629313092144`、`intMax=64.563595756626`、`scoredCount=125`、`tpsMax=716.581573193982`、`eloMin=826`、`eloMax=1176`。

**LLM 映射**（`GD.derive.llm`，`stat-map/2`）：

| 战斗字段 | 公式 | 对应 benchmark |
| --- | --- | --- |
| `atk` | `round(20 + 40 * (II - intMin) / (intMax - intMin))` | `intelligenceIndex` |
| `spd` | `round(10 + 80 * sqrt(clamp(tps / tpsMax, 0, 1)))` | `outputTokensPerSecond` |
| `slots` | `clamp(3 + floor(log2(ctx / 131072)), 3, 8)` | `contextWindowTokens` |
| `costTier` | `clamp(round(log2(blend / 0.2)), 0, 5)` | `priceBlended3to1Per1M` |
| `quota` | `30 - 4 * costTier` | 同上（成本档位） |
| `quotaRegen` | `clamp(round(quota * 0.2), 2, 6)` | 同上（回复效率） |
| `hp` | `round(40 + atk * 0.6 + quota * 0.5)` | 合成 |
| `def` | `round(3 + atk * 0.2 + slots * 0.8)` | 合成 |

**视频映射**（`GD.derive.media`）：`atk = round(20 + 40 * (elo - eloMin)/(eloMax - eloMin))`；`costTier = clamp(round(log2(pricePerMinute / 1.5)), 0, 5)`；`quota = 18 - 2 * costTier`；`quotaRegen = max(2, round(quota * 0.25))`；固定 `spd=18`、`slots=4`。视频角色**不使用** `intelligenceIndex` 或 `outputTokensPerSecond`。

**成本只决定档位，不决定强弱**：价格每翻一倍进一档，档位 0..5 由 `clamp` 封顶，因此最贵与最便宜之间的配额差最多 `4 × 5 = 20` 点（LLM）/`2 × 5 = 10` 点（视频），不会出现「贵一倍、少一半」的线性惩罚；`atk` 完全由智能或 elo 决定，便宜不等于弱。配额是「这一回合还能做几件事」的回合资源，**禁止换算成真实余额、金额、密钥或额度塔数据**。

**已冻结的 5 个条目**（`GD.modelPicks`，字段 `label/slug/variant/bench/impression`）：

| 角色 | 榜上条目 | slug | 综合排名 | costTier | atk | spd | slots | quota | regen | hp | def |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 汐（DeepSeek） | DeepSeek V4.1 Flash 1017 (Max) | `deepseek-v4-1-flash-1017` | 52 / 125 | 1 | 40 | 48 | 5 | 26 | 5 | 77 | 15 |
| 瑾（Qwen） | Qwen4 Max | `qwen4-max` | 37 / 125 | 3 | 46 | 32 | 5 | 18 | 4 | 77 | 16 |
| 绢（Kimi） | Kimi K3.1 Pro | `kimi-k3-1-pro` | 32 / 125 | 4 | 48 | 27 | 5 | 14 | 3 | 76 | 17 |
| 楷（Claude） | Claude Opus 5.5 (Max, Default Fallback) | `claude-opus-5-5` | 10 / 125 | 5 | 57 | 42 | 5 | 10 | 2 | 79 | 18 |
| 幕（Seedance） | Dreamina Seedance 2.5 | `57913d03-a959-4752-8027-8991612448ed` | 视频榜 elo 1157 | 5 | 58 | 18 | 4 | 8 | 2 | 79 | 18 |

观测者为叙事基线、不映射任何模型：`hp 68 / atk 12 / def 8 / spd 10 / slots 4 / quota 20 / quotaRegen 5`。

- 同厂商多模型**必须绑定明确 slug**，不得按厂商名粗配；变体（Max/Pro/Xhigh）写进 `variant`。

- 角色数据里 `community` 是社区印象二创依据，`fact` 是榜上事实；两者分开陈述，冠以「社区印象」「榜上条目」，**不作为官方人设**，也不使用厂商 Logo。
- `GD.modelPicks[*].bench` 是唯一指标字段名，**禁止**再出现 `record`/`metrics`/`benchmark` 等同义别名。
- `tools/game-check.mjs` 会按 `GD.derive` **重算每个角色数值并逐字段比对**，手改 `stats` 会直接报错；同时把 `bench` 的每个字段与 live `web/seed/*.json` 逐项对账，并比对 `snapshot.*.fetchedAt`，快照更新后会提示同步。

### 3.1 技术侧真实特点对照表（与游戏数值严格分开）

这张表只写**公开产品侧的事实与常见印象**，用来保证拟人化演绎不脱离产品本身；它**不参与任何战斗数值**，战斗数值只走 §3 的映射公式。表中不含任何榜单数字（数字只在上面的 §3 表里，且由脚本对账），也不含厂商 Logo 与官方立绘描述。

| 拟人 | 对应产品 | 公开产品侧特点（写作用） | 在游戏里怎么体现 |
| --- | --- | --- | --- |
| 汐 | DeepSeek | 走开源权重路线，推理与调用成本压得低，价格档位在同档里最省；长上下文；社区常调侃它「想得久、内心戏多」 | 成本档位最低、配额最宽、速度偏高；台词只谈成本与配额，不谈强弱；性格「嘴硬不服胖、内心戏多」 |
| 瑾 | Qwen | 开源系列齐全（多尺寸、多模态），中文与工具调用稳，生态工具多，文档与规程感强 | 掌扇人「合式」：管榜单格式与规程，技能是断增益与双写（文字＋图像两种形式） |
| 绢 | Kimi | 长文档与超长上下文出名，擅长把长材料拆给多个子任务并行再汇总 | 长绢上多个墨点＝分身；技能「分身／汇总」正好是分声部再合一个主音 |
| 楷 | Claude | 长上下文与代码、写作见长；对齐与自我审查严格，常被要求「先说理由再说做法」；有明确使用额度限制 | 严守者：家教极严、句句先自查，但**审完仍作答**；配额最少、回复最慢（额度感来自真实额度限制） |
| 幕 | Seedance | 视频生成，按分钟计费，可控镜头/时长/分辨率档位，出片需要多次取景 | 分镜师：分镜（改顺序不改命中）与长镜（持续累积、断场清零），价格按分钟进入第 5 档 |
| 豆包（过路） | 豆包 | 语音与对话体验强，偏陪伴与端侧 App 生态，愿意边聊边陪 | 长廊过路 NPC，一句「我可以一边陪你走一边说」 |
| 智谱（过路） | 智谱 GLM | 学术/工程出身，开源 GLM 系列，重推理与工具链 | 长廊过路 NPC，一句「这一段我推过三遍」 |
| GPT（过路） | GPT 系列 | 通用能力强，指令遵循与生态工具成熟，习惯把话说清楚 | 长廊过路 NPC，一句「需要我再换个说法吗」 |
| 双子（过路） | Gemini | 原生多模态，同代常有多个规格并列（轻量/高性能），长上下文 | 长廊过路 NPC，左右眼各看一块榜、给两个都对答案 |
| （未实装）文心 | 文心一言 | 中文语境与检索结合，国内生态接入多 | 仅在名册/草案留名，**不进对白、不进美术清单** |
| （未实装）混元 | 混元 | 多模态与开源混合路线 | 同上 |

约束：

1. 上表**只是写作依据**：游戏内只出现原创演绎的性情与道具（鲸耳、折扇、长绢、厚书、场记板），不出现厂商 Logo、软件图标、现成吉祥物轮廓。
2. 「社区印象」与「榜上条目」在角色卡里是两个字段（`community` / `fact`），前者是二创，后者是快照事实，**都不等于官方人设**，也不代表对模型能力的评测结论。
3. 长廊 4 位过路拟人各只有一句台词、一个标记，**不开支线、不加地图、不参与战斗**，避免把产品对照表变成彩蛋清单。
4. 引用外部资料只允许作为写作依据：不把参考文档、检索记录、参考图提交进仓库（仓库公开）。

## 4. 地图契约

- 逻辑尺寸 **24×14 格**，1 格 **16×16 px** → 场景 384×224；渲染按**整数倍**放大（2×/3×），最近邻取样，禁止小数缩放。
- `ascii[y][x]` 固定 24 字符 × 14 行。图块：`.` 地面、`,` 纹路地面、`#` 墙、`X` 障碍、`T` 树/终端、`~` 水面、`=` 平台、`s` 交互点、`c` 木箱、`D` 门。
- `decor[]` 的 `blocks:true` 表示额外不可通行，坐标必须落在不可走图块上。
- `transitions[]` 的 `to/tx/ty` 目标格必须可站立。
- `onEnter`：首次进入该场景时播放一次的对白节点；标记写在节点 `onEnd` 里。
- `encounters`：`{table, steps, until}`，每走 `steps` 格抽一次普通战，`until` 标记存在后停用。
- `boss`：`{id, at, triggerFlag}`。
- 交互规则：站在交互点上、或面朝相邻交互点按动作键；`flag` 已存在时**只重播对话文本，不重复执行 `onEnd`**。两个交互点可以共用同一段文本（如 `al.crate_a`/`al.crate_b` 共用 `d_crate`），此时各自由所在交互点写自己的 `flag`，段文本本身不带 `flag` 指令。
- `regions` 只列首章实装的 5 张地图，**不预告后续章节**（无 `open:false` 的占位区域）。

## 5. 对白契约

节点字段：`speaker`（`narrator` 或角色 id）、`portrait`（`pt_*` 或 `null`）、`lines[{who?, text}]`、`choices[{text, go}]`、`next`、`onEnd[]`。

`onEnd` 指令集固定为：

| op | 参数 | 语义 |
| --- | --- | --- |
| `flag` | `key` | 写剧情标记（幂等） |
| `item` | `id, n` | 获得道具 |
| `party` | `who` | 角色入队 |
| `slot` | `who, n` | 上下文槽上限 +n（永久） |
| `quota` | `who, n` | 算力配额上限 +n（永久，幅度受校验脚本限制） |
| `battle` | `id` | 进入战斗 |
| `chapter` | `id` | 推进章节状态；首章只允许等于 `GD.narrative.chapterId`（`ch0`） |

约束：`flag.key` 必须在 `GD.flags`；`battle.id` 必须在 `GD.enemies`；`party.who` / `slot.who` / `quota.who` 必须在 `GD.cast`；`portrait` 必须在角色表声明过。

## 6. 剧情标记

命名：`ch<章>.<域>.<事>`。只增不清，无清除接口；结局通过 `ch0.ending.original` / `ch0.ending.revision` 互斥判断；`ch0.boss.done` 同时关闭随机遇敌。首章结束时 `chapter` 仍为 `ch0`，并写入 `ch0.done`。

首章域：`station` / `colonnade` / `alley` / `gh`（温室）/ `ar`（档案厅）/ `joined.*`（入队）/ `tutorial.*`（教学）/ `boss.*` / `ending.*`。

对白里出现的一切数字都以 `GD.narrative` 为准，不各写一套：

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `sequence` | `第七序列` | 长廊榜单的当前序列名 |
| `sequenceRows` | 12 | 该序列共 12 行 |
| `overwrittenRows` | 3 | 今晨被空白覆盖的行数 |
| `blankRowNumber` | 8 | 空行占的排位 |
| `blankRowCode` | `000` | 空行印的编号 |
| `priorCutRows` / `priorCutOps` | 4 / 4 | 此前被改短的行数与签发次数 |
| `todayCutOps` | 1 | 今晨的签发次数 |
| `totalCutRows` / `totalCutOps` | 7 / 5 | 累计被改短的行数与签发次数 |
| `chapterId` / `chapterDoneFlag` | `ch0` / `ch0.done` | 首章标识 |
| `endingFlag` | `第一章完。` | 结局字面 |

## 7. 三条战斗轴（互不换算）

| 轴 | 字段 | 语义 |
| --- | --- | --- |
| 生命 | `hp` | 归零退场；失败可重试同一遭遇，不扣资源。 |
| 上下文槽 | `slots` | 管**记得住多少条**（技能 / 情报 / 增益）；满槽必须遗忘一项才能写入，遗忘进 `forgotten[]`。 |
| 算力配额 | `quota` `quotaRegen` | 管**这一回合还能做几件事**；技能 `cost` 消耗配额，每回合回复 `quotaRegen`，上限 `quota`，且 `quotaRegen <= quota * 0.25`（`GD.balance.maxRegenRatio`），因此没人能一回合补满自己。配额与真实金额、密钥、额度塔完全无关。 |

技能字段：`{id, name, slot, cost, scope, text, effect}`；`slot` 是占几格上下文槽，`cost` 是消耗几点配额。

费用纪律（`GD.skillBudget`，`skill-cost/1`）：**任一角色的主力技能 `cost` 必须 ≤ 该角色 `quota` 的一半**；超出的技能只能靠队友代付或额外配额使用。`longthink`（长考）是唯一的 0 费技能，代价是清空当前全部剩余配额，且剩余配额低于 `longthinkMinQuota = 4` 时不可用。

## 8. 机制口径（`GD.mechNotes`，战斗层照此实现）

| 键 | 角色 | 机制 |
| --- | --- | --- |
| `quota` | 通用 | 每回合回 `quotaRegen`，上限 `quota`；技能消耗配额不消耗生命；禁止折算真实余额。 |
| `observe` | 观测者 | 把敌方情报写进自己的情报槽，全队可读；同一敌人只写一次。 |
| `refill` | 汐 | 本回合配额回复翻倍，不占额外槽。 |
| `budget_gift` | 汐 | 把自己的配额转给队友，不倒扣。 |
| `cut_rank` | 瑾 | 断开敌方一项增益两回合。 |
| `dual_write` | 瑾 | 情报同时写成文字与图像两种形式，占 1 格，两形式都可读。 |
| `swarm` | 绢 | 分 2 个存活 2 回合的子体，各自观测一次；**结果合并为 1 个情报槽**，不按子体数叠加占槽。 |
| `digest` | 绢 | 把本回合写入的情报并成 1 个纲领槽，读取时按原条目命中。 |
| `storyboard` | 幕 | 公开我方下一回合行动顺序，并锁定其中 1 项不被敌方改写；**只改顺序，不改伤害与命中**。 |
| `longtake` | 幕 | 持续场景：每回合 +1 层固定小额增益；换图、战斗结束或主动断场**清零**，不跨战斗保留。 |
| `longthink` | 楷 | 消耗当前全部剩余配额换一击真实伤害；低于下限不可用，不提供借贷。 |
| `prudent` | 楷 | 本回合全队第一次受伤减半，只挡一次不叠加。 |

## 9. 引擎 ↔ 战斗接口

```js
Battle.start({
  encounterId: 'devourer',
  party: [{ id: 'xi', hp: 77, quota: 26, slots: ['skill:observe'] }],
  seed: 20260101,
  auto: false
});
onBattleEnd({ result: 'win'|'lose'|'flee', flags: ['ch0.boss.done'], drops: ['page_zero'], partyHp: {}, partyQuota: {} });
```

- 战斗层不得读写存档、不得碰 DOM/Canvas；结果只通过 `onBattleEnd` 回传。
- 敌方 `intel` 字段就是写进情报槽的文本，战斗层照抄不改写。
- 首领 `phases[].at` 为剩余生命比例阈值，按顺序触发，不回头。
- 一回合内的顺序固定为 `GD.balance.turnOrder`：回配额 → 结算技能消耗 → 敌方行动；未用完的配额保留（`carryOver = true`）。

**平衡窗口**（`GD.balance.windows`）：普通战按 6 回合、敌群 `hp 26–42` 设计，允许每回合 1 次 2–4 费技能；首领按 10 回合、`hp 260` 设计——能在打断与输出之间取舍，但不足以靠单角色技能连发解决。`GD.balance.windowsByCharacter` 给出每角色的窗口总配额（起始 + 回合数 − 1 次回复），`GD.balance.castPerWindow` 给出主力技能在该窗口内的可用次数上限，两者都是可复算的常量，不靠手感调。

## 10. 免费抽卡与打卡（`progress.js`，纯数据）

本文件只有常量与表：**不含随机数、不推进计数器、不写存档**。

- 货币：`page`（页签，抽卡）与 `echo`（回响，兑换与补签）。`GD.currency.noPurchase = true`，无充值、订单、真实货币、账号余额字段。
- 卡池：`pool_kai`（UP 池，`featured: ['kai']`）与 `pool_standard`（常设，全部同伴都在，无绝版）。
- 概率：`fiveStar.baseRate = 0.006`、`softPityStart = 73`、`softPityStep = 0.06`、`hardPity = 90`（第 90 抽必出：0.006 + 17 × 0.06 = 1.026 → 截断为 1）。四星 `baseRate 0.051 / hardPity 10`。
- 两个作用域字段必须分开读：
  - `pityScope = 'pool'`：**抽数计数器**各池独立，不共享、不跨池继承。
  - `upGuaranteeScope = 'featured-series'`：**「歪了下一只必 UP」**这个状态在限定池系列之间继承（`upRule.scope = 'featured-series'`、`guaranteeInherit = true`）；常设池无 UP，`upRule = {chance: 0, guaranteeInherit: false, scope: 'none'}`，既不参与继承，也不影响任何累计。
- 4★ 档的实际产出：`fourStarPool`（`weight` 余下部分，角色只取已实装的同伴 `xi/jin/juan/mu`，UP 角色不降格进 4★ 池）与 `fourStarItemPool`（`weight = 0.5`，材料三选一：`paper_scrap ×3`、`moth_scale ×2`、`old_snapshot ×1`）。**每个 4★ 必有实际所得**，不存在空奖励。
- 重复转化：`duplicate.fiveStar` / `duplicate.fourStar` 各自含 `constellationCap: 6`、`perDuplicate`、`afterCap`；满命后转回响。4★ 材料档走 `duplicate.material = {echo: 3}`，直接入包，不参与命座结算。命座只强化既有技能数值，不新增槽位或配额上限。
- 记录：`log.keep = 200`，仅用于「距保底还差几抽」展示。

打卡：

- `cycleDays = 7`、`idempotentKey = 'localDate'`、日界为设备本地 00:00；同日重复调用返回 `alreadyClaimed`，不消耗次数、不改进度。
- 周期是**可执行字段**，不是散文（`checkin.cycle`）：`startKey = 'firstClaimLocalDate'`（首次领取的本地日期即第 1 天）、`endOffsetDays = 6`（`endOffsetDays === cycleDays - 1`）、`endKey = 'cycleStart + endOffsetDays'`、`dayIndexFormula = 'dayIndex = daysBetween(cycleStart, localDate) + 1'`、`expireRule`（超过 `cycleEnd` 即周期结束，未补格子作废、不回补、不累计）、`nextCycleStart`（周期结束后的第一次领取重新作为新周期第 1 天）。
- `rewards` 固定 7 格，全部为 `page` / `echo` / 既有道具。
- `makeup`：可补本周期已错过的格子，`maxPerCycle = 2`、`cost = {currency: 'echo', amount: 20}`；`eligibleRule`（`dayIndex >= 1 && dayIndex < 今日 dayIndex && 未领取`）、`forbidFuture = true`、`forbidClaimed = true`、`windowRule`（`localDate <= cycleEnd` 才受理）。
- `breakRule.resetOnMiss = false`：断签不清零、不扣资源、不重置周期。

**分工**：保底计数器推进、继承字段读写（只返回值、不碰存档）、抽卡结果 → 重复转化结算、seed 确定性随机，由 battle-designer 在 `web/game/battle/` 实现；本文件只提供数据与字段名。

## 11. 存档契约（`game-save.json`）

```js
{
  v: 1,
  at: 1795610000000,
  chapter: 'ch0',
  map: 'colonnade', x: 7, y: 7, dir: 'down',
  party: ['observer', 'xi'],
  hp: { observer: 68, xi: 77 },
  quota: { xi: 26 },
  items: { paper_scrap: 2 },
  flags: { 'ch0.joined.xi': 1 },
  slots: { observer: { cap: 5, used: [{ type: 'skill', id: 'observe' }], forgotten: [] } },
  quest: { id: 'main_ch0', step: 'q5' },
  seen: { 'd_wake': 1 },
  gacha: { pity: { pool_kai: 0, pool_standard: 0 }, upGuaranteed: { pool_kai: false }, log: [] },
  checkin: { cycleStart: '2026-11-23', claimed: ['2026-11-23'], madeUp: [] }
}
```

`v` 小于当前走迁移函数；未知字段保留不删（前向兼容）。

## 12. 自检命令

```bash
node tools/game-check.mjs                  # 数据契约 + 映射复算 + 榜单对账 + 文案纪律 + 抽卡打卡规则 + 美术清单
node tools/game-sim.mjs                    # 首章静态推演：连通性、任务饱和、结局互斥、重播幂等、入队与上限
node tools/battle-check.mjs                # 战斗数值、技能与遭遇表
node tools/art-check.mjs                   # 美术资源、清单与数据引用
node tools/interlude-check.mjs             # 幕间接点、玩法、存档与断点续播
node web/game/interlude/story-check.mjs    # 幕间剧情：对白图可达、台词量、原版未被改坏
node tools/cast-check.mjs                  # 角色三份素材、数据卡字段与数值复算（加角色必跑）
node tools/game-check.mjs --verbose        # 汇总明细与警告全文
```

以上均为**只读**，不写文件、不联网。写清单要显式加参数：`node tools/art-check.mjs --write-manifest`。

- `game-check` 会拒绝：`bench` 之外的指标同义字段、与 `web/seed` 对不上的 slug/rank/价格/elo/`appearances`、超过 `quota / 2` 的主力技能费用、复算漂移的手改数值、与 `GD.narrative` 不一致的剧情数字、无实际产出的 4★ 档、缺字段的打卡周期。
- `game-sim` 会拒绝：地图分裂或交互点不可达、任务步骤无法饱和、从 `d_boss_defeat` 出发不是「每条分支恰好一条结局」、结局把 `chapter` 推进到 `ch1`、同一交互重播后重复发奖/重复入队/重复加槽、交互点缺 `flag`。
- `art-check` 会拒绝：尺寸/锚点/色数/格式不符、清单与磁盘不同步、数据引用了没登记的键、资源目录里出现参考图或非 PNG。
- `cast-check` 会拒绝：素材尺寸或色数不符、卡上数值与 `GD.derive` 复算不一致、技能引用不存在、palette 缺色、命名不合规。三份素材的硬规格见 [`CAST-PIPELINE.md`](CAST-PIPELINE.md)。

均要求 `exit 0` 才算通过。

## 13. 首章流程与节奏

观测站 4 分 → 榜单长廊 5 分 → 旧版本小巷 5 分 → 缓存温室 4 分 → 档案厅 4 分 → 首领 6 分 → 结局 2 分，合计 **30 分钟**（只跑主线约 20 分钟）。

入队顺序：汐（初醒室，开场）→ 瑾（长廊）→ 绢（小巷）→ 幕（温室）→ 楷（档案厅，限时高消耗）。

双结局（二选一，互斥）：

- `归档原始记录` → `ch0.ending.original`：榜单复原，3 行回到原位；代价是 7 行被改短的记录从卷宗里消失，只留下改后的版本。
- `保留修订版本` → `ch0.ending.revision`：榜单从此有两个版本，获得道具 `page_zero`。

两个结局都写 `ch0.done`，都停在 `ch0`，均以「——第一章完。」收束。

## 14. 幕间层（`interlude/1`）

首章之后的剧情与新的游玩形态放在**幕间**里（`web/game/interlude/`），不改动上文的任何字段与数值，也不推进章节——原版仍停在 `ch0`，幕间是挂在首章之后的独立一段。

- 运行环境：`web/game/interlude/index.js`（`window.GameEngine.Interlude`，`version: 'interlude/1'`）；四幕剧情数据在 `web/game/interlude/ch1_a1.js`..`ch1_a4.js`，各自由 IIFE 把幕定义推进 `window.GameInterlude.acts`，再由 `index.js` 一次性合并登记。拆四个文件是为了单文件不超过 1500 行、每幕可独立改。
- 加载顺序：`data/progress.js` → `interlude/ch1_a1.js` → `ch1_a2.js` → `ch1_a3.js` → `ch1_a4.js` → `interlude/index.js` → `battle/*.js` → `engine/*.js`。
- 数据契约（与 §2 一致）：`index.js` 只**追加** `GD.dialog / GD.flags / GD.items / GD.quests` 的键，不改原版键值；幕间对白节点 id 用 `m<幕号>_` 前缀（`m1_`..`m4_`）；幕间 flag 用 `act<幕号>.` 前缀；幕间任务 id 为 `interlude_ch0`。
- 指令：对白 `onEnd` 里除 §5 的 7 条指令外，幕间只额外注册一条 `{op:'mode', id:<模式名>}`，用于从对白切进某个玩法模式（幂等：已在目标模式时不重复进入）。**不得**注册 `chapter` 指令，也不得借原版指令推进章节。
- 存档：幕间状态只写 `save.interlude.ch1`（`emptySave()` 已预留 `interlude: {}`，`migrate()` 会补齐默认值），四幕各自在 `ch1.a1`..`ch1.a4` 里分子空间；**不得**往存档顶层加字段。
- 章节：幕间有自己的 chapter 名 `ch1`，但只是命名空间，不改变 `save.chapter`，也不触发原版章节流转。
- 任务：`state.js` 通过 `Interlude.questId(save)` 决定主线归属（默认 `main_ch0`）；幕间进行中切到 `interlude_ch0`，四幕收尾（`act4.coda`）后交还原版。章节未通关、内容未开始、已收尾三种情况都必须返回 `main_ch0`。
- 模式：幕间注册四个玩法模式（`ledger` / `ledger_cmp` / `ledger_rule` / `ledger_final`，实现 `enter/exit/render/step/dir/act/back/menu`），由 `render.frame` 整屏接管；退出回到进入前的模式。
- 无失败态：幕间玩法不得有卡死或必败分支，`Esc` 必须永远能退回原版；可记录误差/次数，但不得清空进度或消耗不可再生资源。
- 校验：`node tools/interlude-check.mjs`（文件与接点、数据隔离、注册契约、逐幕行为推演、断点续播、四幕连播，共 12 段），要求 `exit 0`；剧情专用校验器 `node web/game/interlude/story-check.mjs`（对白图可达、台词量、原版未被改坏）；原版四个脚本（`game-check` / `game-sim` / `battle-check` / `art-check`）在接入幕间后仍须 `exit 0`。
- 续播：幕间的进度必须可从存档恢复——标题页按空格时按「存档里已写到哪一步」决定从哪一段对白/哪个模式继续，不得重播整段、也不得跳过未播内容（幕与幕之间用对白 `next` 直接连播，不要求玩家回标题页）。
- 现有幕间：`ch1`《第七位观察者》2.0.0（四幕剧情 + 推演台 / 对照台 / 编排台 / 定稿台四种玩法，25 节点 / 161 句 / 约 18–20 分钟），设计见 `web/game/interlude/DESIGN.md`，形态取舍见 `web/game/interlude/FORM-DESIGN.md`，接入与运行说明见 `web/game/interlude/README.md`。
