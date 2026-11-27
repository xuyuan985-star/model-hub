# 像素冒险 · 幕间《第七位观察者》

首章《消失的第零页》之后接着的一段，做在游戏本体里（不是插件、不是外挂包）。四幕剧情 + 四种新玩法，共 **25 个剧情节点 / 161 句台词 / 约 18–20 分钟**。

- 运行时：`web/game/interlude/index.js`（`window.GameEngine.Interlude`，`version: 'interlude/1'`）
- 四幕数据：`web/game/interlude/ch1_a1.js`..`ch1_a4.js`
- 校验：`tools/interlude-check.mjs`（接点 / 存档 / 玩法循环 / 续播）+ `web/game/interlude/story-check.mjs`（剧情）
- 契约：`web/game/CONTRACT.md §14`

---

## 1. 它接在原版的哪里

原版首章《消失的第零页》故意留了一个空档：第 8 行编号 `000` 的位置被空白覆盖，庭务说"这一行本该有内容"。首章的两个结局（归档原始记录 / 保留修订版本）都**只是处置了那一页纸，没有回答那一行本来该是谁**。

幕间从这里接：**编号 000 按规则属于「观测者」，而观测者只有一个。** 玩家自己就是观测者——那么记录里那个空位，是被谁占着？

不新增地图、不新增战斗、不新增美术。四幕都发生在观测站 / 档案厅 / 长廊 / 温室的既有场景里，复用既有 `bg_*` 与既有 NPC（庭务 / 笺 / 瑾 / 绢）。这是刻意的：幕间是**加在既有场景上的一段推理**，不是新关卡。

## 2. 文件与加载顺序

```
web/game/interlude/
  README.md           ← 本文
  FORM-DESIGN.md      ← 游玩形式设计：为什么是"核实驱动"而不是"战斗驱动"
  DESIGN.md           ← 四幕剧情总纲 + 四种玩法设计说明
  ch1_a1.js           ← 幕间一《第七位观察者》  玩法：推演台 ledger
  ch1_a2.js           ← 幕间二《两个版本》      玩法：对照台 ledger_cmp
  ch1_a3.js           ← 幕间三《排序的代价》    玩法：编排台 ledger_rule
  ch1_a4.js           ← 幕间四《十二分之一》    玩法：定稿台 ledger_final
  index.js            ← 汇总：合进 GameData、注册模式、存档命名空间、任务归属
  story-check.mjs     ← 只查剧情的独立校验器（Node 直跑，不进网页）
```

`web/game/index.html` 里插在 `data/progress.js` 之后、`battle/core.js` 之前：

```html
<script src="interlude/ch1_a1.js"></script>
<script src="interlude/ch1_a2.js"></script>
<script src="interlude/ch1_a3.js"></script>
<script src="interlude/ch1_a4.js"></script>
<script src="interlude/index.js"></script>
```

顺序要求：`ch1_aN.js` 只往 `window.GameInterlude.acts` 里塞数据、不依赖彼此，谁先谁后都行（但按幕序排最好读）；`index.js` 必须最后（它读 `GameInterlude.acts` 一次性合并登记）；整组在 `GameData` 六个数据文件之后（要往 `GameData` 上追加键），在 `engine/*.js` 之前（引擎初始化时要用模式表）。

**为什么拆四个文件**：单文件会破 1500 行，且每幕可以独立评审/替换。想删掉某一幕，只要不引它的 `ch1_aN.js` 并删掉 `index.js` 里对应的那条 `ACTS` 项——`interlude-check` 会立刻报出哪一幕缺失。

## 3. 引擎接点（这是唯一动过原版的地方）

改动都在 `web/game/engine/`，**没有删除或重命名原版任何字段**：

- `game.js`
  - `api.modeFrom`；`api.startMode(id)` / `api.endMode()`：进出幕间的玩法模式（`endMode` 回到来源模式；从 title 进来的回 title）。
  - `api.startDialog(nodeId)` / `api.showToast(msg)`：给幕间用的出口。
  - `applyOp()`：`flag` 之后、原版分支之前先问 `G.Interlude.applyOp(...)`；没人认领再走原版。
  - `onAction` 的 `title` 分支最前面调用 `G.Interlude.titleAct(api)`（返回 `true` 表示接管这次空格）。
  - `onDir/onAction/onCancel/onAuto/onMenu` 第一行调用 `G.Interlude.inputMode(api, kind)`，玩法模式优先。
  - `step()` 末尾调用 `G.Interlude.step(api, dt)`。
  - 对白播完时若模式已被幕间指令切走（`dialogDone` / `advanceDialog` / `chooseDialog` / `script.done`），只收尾不改模式——否则 `{op:'mode'}` 刚开出来的玩法界面会在同一帧被踩回 `explore`。
- `render.js`
  - `create()` 额外返回 `surface`（`{ctx, canvas, vw, vh, TILE, COLORS, text, box, bar}`）。
  - `drawTitle` 里由 `Interlude.titleLine(game)` 决定是否替换「空格 继续」那一行文案。
  - `frame()` 在 title/battle 之后插一档：`isMode(mode)` 时走 `Interlude.render(game, surface)` 整屏接管。
- `state.js`
  - `emptySave()` 增 `interlude: {}`；`migrate()` 调 `G.Interlude.migrate(raw)`。
  - `activeQuest(save)`：任务归属由 `G.Interlude.questId(save)` 决定（默认仍是 `main_ch0`）；`questStep/refreshQuest/questStepDef` 改用它。
- `assets.js`：`resolveBase()` 修正——原版用 `indexOf('game/')` 找资源根，解包路径里只要更早出现一段 `game/`（比如 `..._tmp_game/...`、或百分号编码的中文目录）就会取错一级，导致 21 张像素图全部 404。现在先 `lastIndexOf('engine/assets.js')` 反推，退路改 `lastIndexOf('/game/')`。**这是原版 bug，和幕间无关，建议单独保留。**
- `index.html`：加 5 行 `<script>`（见上）。

原版四个校验脚本（`game-check` / `game-sim` / `battle-check` / `art-check`）在打了这些补丁之后**全部仍然 exit 0**——补丁是纯增量。

## 4. 四幕剧情与四种玩法

| 幕 | 标题 | 玩法 | 模式 id | 收尾 flag |
| --- | --- | --- | --- | --- |
| 一 | 第七位观察者 | 推演台：4 列格 × 6 张证据卡，把「编号/条目/读数/分档」摆回去 | `ledger` | `act1.done` |
| 二 | 两个版本 | 对照台：12 行"今晨"与"五年前"并排，标出 5 处出入 | `ledger_cmp` | `act2.done` |
| 三 | 排序的代价 | 编排台：5 条残片按序接回规则墙，附录是干扰项 | `ledger_rule` | `act3.done` |
| 四 | 十二分之一 | 定稿台：从 12 个名字里选一个填第 8 行，再四选一处置 | `ledger_final` | `act4.done` |

四幕共用一条叙事主线：首章"3 行被空白覆盖"只是表层，真正的问题是**第 8 行编号 000 按规则属于观测者，而观测者只有一位**——每一序列都会把一个人换上去，第七天再由下一位接手。玩家在四幕里依次：确认那一行确实属于自己 → 发现十二个位置从没同时出现过十二个名字 → 找回被摘走的第五条规则（覆盖观测者须经本人同意，而你的手续根本没走完）→ 亲手决定第 8 行最后由谁站着。

幕间四的四个结局都写 `act4.done`，接着进 `m4_coda` 附记（`act4.coda` 是这一整段的终点）：写下别人的名字（`signed_row`）/ 让它继续空着（`empty_eighth`）/ 写下自己的名字（`own_name`）/ 交给庭务（`open_case`）。**没有正确解**，四选一都算通关。

> 详细剧情流程图、设计约束、可扩展点见 `DESIGN.md`；为什么选"核实驱动"而不是"战斗驱动"见 `FORM-DESIGN.md`。

## 5. 存档

- 运行时状态只落 `save.interlude.ch1`，按幕分四个子空间：`save.interlude.ch1.a1` `a2` `a3` `a4`。
- 每幕默认值：`{ active:0, solved:0, ..., verdict:null, runs:0 }`（各幕略有不同，见 `ch1_aN.js` 的 `defaults`）。
- 旧存档（完全没有 `interlude` 字段）由 `state.js` 的 `migrate()` + `Interlude.migrate()` 补齐，**玩家不需要清档**。
- `save.interlude` 是幕间独占的顶层字段；删掉 `web/game/interlude/` 后 `migrate` 会忽略它，原版照常读档（只是幕间那段剧情没了）。

## 6. 怎么运行 / 怎么验证

1. 直接用浏览器打开 `web/game/index.html`（`file://` 也行，存档走 `localStorage`）。
2. 玩通首章任一结局（写 `ch0.done`）后**回标题页按空格**，标题提示会变成金色的「空格 进入幕间 · 第七位观察者」。
3. 不想通关首章、只想看四幕：URL 加 `?interlude=1`，如 `index.html?interlude=1`。预览只跳过**章节闸门**，四幕顺序、玩法、结局分支全部照常；四幕都走完后标题页空格交回原版。
4. 跑校验：

```bash
node tools/interlude-check.mjs              # 接点 / 存档 / 玩法 / 续播（12 段）
node web/game/interlude/story-check.mjs     # 剧情（对白图可达、台词量、原版未被改坏）
node tools/game-check.mjs                   # 原版数据契约
node tools/game-sim.mjs                     # 首章可通关推演
node tools/battle-check.mjs                 # 战斗数值
node tools/art-check.mjs                    # 美术资源
```

六个全部 `exit 0` 才算过。

## 7. 怎么删掉

1. 删 `web/game/interlude/`。
2. 删 `index.html` 里那 5 行 `<script>`。
3. 删引擎里的接点行（搜索 `G.Interlude` / `Interlude.`，全部是 `if (G.Interlude && ...)` 守卫，删掉不影响原版逻辑）。
4. 存档里的 `save.interlude` 字段会被 `migrate` 忽略，不用清档。
5. （建议保留 `assets.js` 的 `resolveBase()` 修正，那是原版 bug。）

## 8. 怎么加一幕 / 换一道题

四道玩法都是纯数据驱动，`PUZZLE` 结构与渲染/输入解耦：

```js
PUZZLE = { cells: [{id, col, need, value}], cards: [{id, key, text}] }   // 推演台
PUZZLE = { leftName, rightName, rows: [{id, no, left, right, diff, note}] }  // 对照台
PUZZLE = { wall, cards: [{id, ord, text, clue}] }                        // 编排台，ord:0 = 干扰项
PUZZLE = { names: [{id, name, alias, note}], options: [{id, text, hint}] }   // 定稿台
```

加一道新题的完整步骤：

1. 复制一个 `ch1_aN.js` 当模板，改 `id` / `nsKey`（如 `a5`）/ `modeId`（如 `ledger_five`）/ `doneFlag` / `prevFlag` / `nodes` / `puzzle` / `defaults` / `mode2`。
2. 新对白节点 id 用 `m5_` 前缀（`story-check` 按 `/^m[1-4]_/` 查现有四幕，加幕要同步放开前缀）。
3. `index.js` 的 `ACTS` 里加一项、`QUEST.steps` 加一步。
4. `index.html` 加一行 `<script>`。
5. 跑 `node tools/interlude-check.mjs` + `node web/game/interlude/story-check.mjs`。

**必须遵守的几条**（`interlude-check` 会查）：

- ES2019 + IIFE：不写 `import/export`、可选链 `?.`、空值合并 `??`、对象展开 `...`。
- 只往 `GameData` **追加**键，不改原版键值（`interlude-check` 会逐一 JSON 对比）。
- 对白节点 id 用 `m<幕号>_` 前缀，避免和原版 58 个节点撞。
- 运行时状态只写 `save.interlude.ch1.<幕>`，不往存档顶层塞新字段。
- 不写 `{op:'chapter'}`：原版 `chapter` 指令会把章节推到 `ch1` 并触发 `chapter-stop` 警告；幕间有自己的 chapter 名 `ch1`，但那只是命名空间，不改 `save.chapter`。
- 新玩法要有"无失败"出口：停在那里不卡档，`Esc` 永远能退回原版；摆错可以计数，但不清零、不消耗、不判负。
- 断点续播：`start()` 必须按存档 flag 逐段决定从哪继续，不得重播整段、也不得跳过未播内容；幕与幕之间用对白 `next` 直接连播，不要求玩家回标题页。

## 9. 运行时 API 速查

| 方法 | 用途 |
| --- | --- |
| `Interlude.version` | `'interlude/1'` |
| `Interlude.acts` | 四幕定义数组（每幕含 `id/nsKey/modeId/nodes/flags/items/defaults/puzzle/gate/start/titleLine/mode2`） |
| `Interlude.act(id)` | 按幕 id（`act1`..`act4`）取幕定义 |
| `Interlude.modes` / `mode(id)` / `isMode(id)` | 四个玩法模式表 / 取模式 / 判断是不是幕间模式 |
| `Interlude.nsOf(save)` | 取 `save.interlude.ch1`（缺则补默认值） |
| `Interlude.migrate(save)` | 补 `save.interlude` 默认值（引擎启动时调） |
| `Interlude.currentAct` 内部用 | 按 `doneFlag`（幕四再看 `endFlag`）找当前该进哪一幕 |
| `Interlude.titleAct(game)` | 标题页空格：返回 `true` 表示幕间接管了 |
| `Interlude.titleLine(game)` | 标题页提示文案；返回 `null` 保持原版 |
| `Interlude.questId(save)` | 当前主线归属 id（`main_ch0` / `interlude_ch0`） |
| `Interlude.applyOp(save, op, game)` | 指令分发：只认 `{op:'mode', id:<模式名>}` |
| `Interlude.render / step / inputMode` | 由引擎调用，幕间代码不用手动调 |

模式对象可实现的方法（都可选）：`enter/exit/render/step/dir/act/back/menu/auto`。

## 10. 现在的状态

| 项 | 状态 |
| --- | --- |
| 版本 | `interlude/1`，四幕 / 四种玩法 / 三个引擎层接点（game/render/state） |
| 规模 | **4 幕 / 25 个剧情节点 / 161 句台词 / 约 18–20 分钟 / 26 个 flag / 8 个道具 / 8 步任务** |
| `story-check` | 通过：`nodesReachable 25/25`、`totalLines 161`、纯阅读 8.7 分钟 + 四道解谜约 10 分钟 ≈ 18.7 分钟 |
| `interlude-check` | exit 0，12 段 70+ 条断言（含四幕逐幕行为推演、断点续播、四幕连播） |
| 原版四脚本 | 全部 exit 0（接点前后一致） |
| 连播 | 四幕连续播完不用回标题页：`m1_end_*` → `m2_intro` → `m2_bridge` → `m3_intro` → `m3_bridge` → `m4_intro` |
| 断点续播 | 中途 `Esc`/关页面再回来，按存档 flag 续播到当前进度（开场→玩法→收束→设问/签名→桥段），不重播整段也不跳过 |
| 视觉验收 | 无头 Chrome 全流程实跑：标题 → 四幕玩法 → 四个结局 → 附记，`renderErr = null` |
| 评审入口 | `index.html?interlude=1` 跳过首章直接进幕间（只跳过章节闸门，四幕顺序不变） |

## 11. 交付物清单

| 文件 | 说明 |
| --- | --- |
| `web/game/interlude/ch1_a1.js` | 幕间一 + 推演台 |
| `web/game/interlude/ch1_a2.js` | 幕间二 + 对照台 |
| `web/game/interlude/ch1_a3.js` | 幕间三 + 编排台 |
| `web/game/interlude/ch1_a4.js` | 幕间四 + 定稿台 + 附记 |
| `web/game/interlude/index.js` | 汇总登记、存档迁移、任务归属、模式分派 |
| `web/game/interlude/story-check.mjs` | 剧情校验器（Node 直跑） |
| `web/game/interlude/README.md` | 本文 |
| `web/game/interlude/FORM-DESIGN.md` | 游玩形式设计（交给策划/主项目） |
| `web/game/interlude/DESIGN.md` | 四幕剧情总纲 + 四种玩法设计 |
| `web/game/index.html` | +5 行 script |
| `web/game/engine/game.js` | 模式切换、指令分发、输入优先级、标题接管 |
| `web/game/engine/render.js` | `surface`、标题行替换、玩法模式整屏接管 |
| `web/game/engine/state.js` | `save.interlude`、`migrate`、`activeQuest` |
| `web/game/engine/assets.js` | `resolveBase()` 修正（中文/百分号路径取根） |
| `web/game/CONTRACT.md` | +§14 幕间契约 |
| `tools/interlude-check.mjs` | 幕间校验器 |
