# 残响协议 · 角色接入管线

给**美术 / 策划**看的接入说明：怎么把一个新的角色（三份 PNG + 一张数据卡）放进游戏，以及它会被哪几条命令自动卡住。

看完这一页你应该能自己判断：我的图能不能进、我的数据卡会不会被退、退在哪一条。

---

## 0. 一句话

> 要加一个角色 = **交 3 个文件 + 写 1 段数据 + 跑 1 条命令**。
> 3 个文件是 `npc_<id>.png`（精灵）、`face_<id>.png`（对话头像）、`pt_<id>.png`（立绘，可选）；
> 1 段数据是 `web/game/data/characters.js` 里的一张角色卡；
> 1 条命令是 `node tools/cast-check.mjs`，它 exit 0 才算接进去了。

`<id>` 是角色 id，全小写字母/数字（如 `xi`、`pan`），三个文件名和数据卡里的 id 必须是同一个词。

---

## 1. 三份素材的硬规格

素材是给**像素艺术家**的：用 Aseprite 或 Photoshop 画，**导出 PNG-8（调色板）**，导出时**关掉抗锯齿（Anti-alias）**、**关掉隔行（Interlaced）**，透明背景只保留全透明/不透明两档。

| 素材 | 文件名 | 放哪 | 尺寸 | 帧布局 | 色数 | 透明 | 锚点 | 体积上限 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 精灵图集（必需） | `npc_<id>.png`（普通角色）<br>`pc_<id>.png`（玩家角色） | `web/game/assets/pixel/` | **64×96** | 4 列 × 4 行，每格 **16×24**，共 16 帧 | ≤24 色，PNG-8（colorType 3） | 透明底 | 脚底中心 **(8,24)** | 40 KB |
| 对话头像（建议） | `face_<id>.png` | `web/game/assets/pixel/` | **48×60** | 单帧（1 列 × 1 行） | ≤24 色，PNG-8 | 透明底 | 左下 **(0,60)** | 8 KB |
| 剧情立绘（可选） | `pt_<id>.png` | `web/game/assets/portrait/` | **1024×1536** | 单帧 | PNG-8 或 PNG-24（colorType 3 或 2） | 透明底 | 底边中心 (512,1536)，只做对齐参考 | 220 KB |
| 首领图集（特殊） | `boss_<id>.png` | `web/game/assets/pixel/` | **128×96** | 4 列呼吸帧 × 3 行阶段，每格 32×32 | ≤24 色，PNG-8 | 透明底 | 脚底中心 (16,32) | 30 KB |

### 1.1 精灵图集的帧序（最容易反的一格）

```
            列 1        列 2        列 3        列 4
          下 down     左 left     右 right     上 up
行 1  idle   [0,0]      [1,0]      [2,0]      [3,0]
行 2  walk1  [0,1]      [1,1]      [2,1]      [3,1]
行 3  idle   [0,2]      [1,2]      [2,2]      [3,2]
行 4  walk2  [0,3]      [1,3]      [2,3]      [3,3]
```

- **列 = 朝向**（下 / 左 / 右 / 上），**行 = 动作**（idle / walk1 / idle / walk2）。行序不是 idle/walk1/walk2/idle，是 **闲置、迈一步、回闲置、迈另一步**——两条腿各一帧。
- 只做两向的 NPC（如磐、笺，只做下/左）也要交满 4 列 × 4 行的画布、每格都对齐 16×24：引擎按 `dirs: 2` 只用前两列，**右向取左向镜像、上向也复用左向那一帧**，第 3、4 列不会被渲染（留空或照着左向再画一遍都行，但别把画布裁成 32×96）。
- 四向角色的 16 格都不许空（两向 NPC 校验前两列共 8 格）：整列没画是 **FAIL**，只是某一行漏画是 **WARN**；空帧会在走路循环里闪一下。

### 1.2 锚点与描边

- 锚点是**脚底中心**：每格第 23 行是脚底那一行，人物站在 `y=23` 上。第 1 行是头顶上沿，别把人物画得比格子高。
- 1px 描边统一用 **`#4A5A70`**（深色底上压得住，实测对比度 2.58:1）。
- 建议色板：纸张系 `#F4F5F7` `#E7E3DA`，墨 `#191F2B` `#22262F`，朱 `#C5282F`，靛 `#2B5B8A`，金 `#B68314`，苔 `#4E6B4A`，夜 `#13161D`。角色卡上的 `palette` 就从这里面挑 3–6 个写。
- **不得**出现厂商 Logo、软件图标、官方吉祥物轮廓（`GD.characterPolicy.noVendorLogo`）。鲸尾、折扇、场记板这类通用道具或自造纹样可以。

### 1.3 对话头像的构图

头像会在对话框左侧以 **48×60 原始尺寸**画出来（引擎 `FACE_W/FACE_H`），幕间卡另按比例放大。所以它**不是**立绘缩略图，是「只画头 + 肩」的一张小画：

- 头顶（不透明区域第一行）落在 **y = 0..6**，不要留大块空；
- 肩线（不透明区域最后一行）落在 **y ≥ 54**，画到画布底边附近；
- 脸尽量占满画面宽度。**把 1024×1536 的整张立绘缩进 48×60 是最常见的退件原因**——那样脸只有十几个像素，对话框里什么都看不清。

### 1.4 立绘的构图

- 1024 宽 × 1536 高，单张，不要拼图集。
- 人物占画布高度的 **78%–86%**，**上边缘留白 ≥ 8%**（给对话框标题条留空间）。
- 透明背景；不含文字、不含 UI 框；同一角色的所有差分（`_half` / `_bust` / `_frown` …）**头部位置像素级对齐**。
- 首领走三阶段图集：`pt_<id>_p1.png` / `_p2.png` / `_p3.png` 三张，不是一张 `pt_<id>.png`。

---

## 2. 数据卡字段表

数据卡写在 `web/game/data/characters.js`。**只允许追加新键，不许改已有角色的任何键值**（CONTRACT §1）。文件形态固定：`(function (w) { … })(window)`，**不用 import/export、不用可选链、不用对象展开**（ES2019）。

### 2.1 战斗角色（进 `GD.cast`，有数值、能入队）

| 字段 | 必填 | 说明 | 示例 |
| --- | --- | --- | --- |
| `id` | ✅ | 与键名一致，全小写 | `'xi'` |
| `name` | ✅ | 显示名 | `'汐'` |
| `alias` | ➖ | 称号 · 排名 | `'续杯者 · 综合第 52'` |
| `join` | ➖ | 入队交互点 | `'ch0.colonnade'` |
| `gender` | ➖ | 不指定就写「未设定」；玩家角色全篇不指定 | `'女'` |
| `role` | ✅ | 定位 | `'开场同伴 · 续战力'` |
| `source` | ✅ | 榜单来源，必须是 `GD.modelPicks` 的键（`deepseek` / `qwen` / `kimi` / `claude` / `seedance`） | `'deepseek'` |
| `voice` | ✅ | 说话风格：自称、口癖、怎么称呼玩家角色 | `'话软，句尾常带「啦」…'` |
| `look` | ✅ | 外形与随身道具，一两句，供美术照画 | `'深蓝连帽外套，帽檐缝着一枚鲸尾…'` |
| `props` | ➖ | 道具清单（字符串数组） | `['鲸耳', '荷叶边围裙']` |
| `manners` | ➖ | 行为习惯（字符串数组） | `['嘴硬不服胖', '管玩家叫「鱼片」']` |
| `sprite` | ✅ | 精灵键，`pc_`/`npc_` 前缀 | `'npc_xi'` |
| `portrait` | ➖ | 立绘键，`pt_` 前缀；没有写 `null` | `'pt_xi'` |
| `face` | ➖ | **对话头像键（新增可选字段）**，`face_` 前缀；没有就省略或写 `null` | `'face_xi'` |
| `palette` | ➖ | 3–6 个 `#RRGGBB` | `['#2E6FA8', '#12324F', '#F4F5F7', '#C9D6E2']` |
| `stats` | ❌ | **不许手写**，由 `withStats` 生成 | — |
| `derived` | ❌ | 同上，`withStats` 写 `costTier` 与 `note` | — |
| `skills` | ✅ | 技能 id 数组，每个 id 必须已存在于 `GD.skills` | `['refill', 'budget_gift']` |
| `bio` | ✅ | 两三句小传 | `'智械庭里报价最低档位的那个拟人…'` |
| `community` | ➖ | 社区印象二创，**必须带来源标注**「社区印象（二创）：…」 | `'社区印象（二创）：蓝鲸被亲昵成…'` |
| `fact` | ➖ | 榜上条目的可查事实，句首写「榜上条目 …」 | `'榜上条目 DeepSeek V4.1 Flash…'` |

### 2.2 剧情 NPC（进 `GD.npc`，无战斗数值）

`id` / `name` / `look` / `sprite` / `bio` 为主；没有 `stats`、`derived`、`skills`、`role`、`voice`；`sprite` 和 `portrait` 可以是 `null`（没有形体的角色，如「庭务」只以终端字符出现）。`face` 同样是可选字段。

### 2.3 数值不许手写（硬约束）

战斗角色的 `stats` 必须由 `GD.derive.pick(source)` 换算出来，**手写会被判「数值漂移」**：

```js
// ✅ 正确：卡上不写 stats，交给 withStats
xi: withStats({
  id: 'xi', name: '汐', source: 'deepseek',
  /* …其余字段… */
}, 'deepseek'),

// ❌ 错误：手写 stats，改一次就和榜上对不上账
xi: withStats({
  id: 'xi', name: '汐', source: 'deepseek',
  stats: { hp: 99, atk: 40, def: 15, spd: 48, slots: 5, quota: 26, quotaRegen: 5 },
  /* … */
}, 'deepseek'),
```

`withStats(card, source)` 会调 `GD.derive.pick(source)` 写入 `stats` 的 `hp / atk / def / spd / slots / quota / quotaRegen`，并把来源与口径写进 `derived.note`。校验器逐项比对卡上的 `stats` 与复算结果，不一致就列两边数字：

```
[错误] cast.xi：数值漂移（stats 与 GD.derive.pick("deepseek") 对不上）：hp：卡上 84，复算 77
```

当前五个来源的换算结果（**仅供核对，不要抄进卡里**）：

| source | hp | atk | def | spd | slots | quota | quotaRegen | costTier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `deepseek` | 77 | 40 | 15 | 48 | 5 | 26 | 5 | 1 |
| `qwen` | 77 | 46 | 16 | 32 | 5 | 18 | 4 | 3 |
| `kimi` | 76 | 48 | 17 | 27 | 5 | 14 | 3 | 4 |
| `claude` | 79 | 57 | 18 | 42 | 5 | 10 | 2 | 5 |
| `seedance` | 79 | 58 | 18 | 18 | 4 | 8 | 2 | 5 |

**唯一的例外是玩家角色 `observer`**：它不映射任何榜单，`source: null`，`stats` 是叙事基线（hp 68 / atk 12 / def 8 / spd 10 / slots 4 / quota 20 / quotaRegen 5），`derived.note` 写明「玩家角色不映射榜单模型，数值为叙事基线」。新增角色**不是** observer，别学它。

---

## 3. 三步接入流程

命令都在**仓库根目录**跑（`C:\Users\10913\Desktop\model-hub-dev`）。

### 第 1 步：把素材丢进收件箱

```
web/game/assets/incoming/<id>/
    npc_<id>.png      64×96
    face_<id>.png     48×60      （可缺，缺只 warn）
    pt_<id>.png       1024×1536  （可缺，缺只 warn）
```

`incoming/` 是**中转站**，不是游戏资源目录：这里的图不会被引擎加载，也不会被 `art-check` 登记成资源。但它在 `assets/` 底下，所以**里面同样只放这三份 PNG**（放 `.psd` / 参考图会被 `art-check` 的递归扫描判违规），接入完成后整个 `incoming/<id>/` 删掉。

### 第 2 步：自查素材包（不进游戏，只查合规）

```bash
node tools/cast-check.mjs --dir web/game/assets/incoming/<id>
```

全绿（exit 0）再往下做。这一步会查命名、尺寸、PNG 格式、色数、精灵逐帧内容、头像构图、立绘尺寸与体积，每条不合格都直接给改法。想同时校验工程里已有的全部角色（回归守卫）：

```bash
node tools/cast-check.mjs
```

### 第 3 步：入库 + 补数据卡 + 重登记 + 复核

1. **拷文件**：`npc_<id>.png`、`face_<id>.png` → `web/game/assets/pixel/`；`pt_<id>.png` → `web/game/assets/portrait/`。拷完**删掉** `incoming/<id>/`（`assets/` 下若留下 `.psd` / `.jpg` / `.zip` 这类非交付格式，或「参考/草稿/废稿」命名的图，`art-check` 会判违规；`pixel/`、`portrait/` 里更是只收 `.png`）。
2. **补角色卡**：先拿模板，再照着填：

   ```bash
   node tools/cast-check.mjs --scaffold <id>
   ```

   它打印一份可以直接抄的 JS 对象字面量（`withStats` 版和 `GD.npc` 版各一份）、该交哪几个文件、五个来源的换算数值，以及接入步骤本身。把 `characters.js` 里对应的那一块**追加**进去（只追加新键）。
3. **重新登记 manifest**：

   ```bash
   node tools/art-check.mjs --write-manifest
   ```

   `web/game/assets/manifest.json` 和 `manifest.js` 由脚本派生，**永远不要手改**。不跑这一步，新图不会被引擎按 key 找到，`cast-check` 也会报「未在 manifest.json 登记」。
4. **复核**：

   ```bash
   node tools/cast-check.mjs --id <id>
   ```

### 3.1 命令速查

```bash
node tools/cast-check.mjs                  # 校验工程内全部角色（回归守卫，有问题 exit 1）
node tools/cast-check.mjs --id xi           # 只校验一个角色
node tools/cast-check.mjs --dir web/game/assets/incoming/xi   # 校验素材包目录
node tools/cast-check.mjs --scaffold yi     # 打印角色卡模板 + 交付清单
node tools/cast-check.mjs --verbose         # 打印每条检查明细（尺寸、色数、bbox、复算数值）
```

输出顺序：每人一行状态表（`id | 精灵 | 头像 | 立绘 | 数值 | 结论`，`OK` / `WARN` / `FAIL` / `—`）→ 问题清单（每条错误/警告都带中文原因和修法）→ 体积合计 → 最后一行 JSON 汇总 + 结论。

**`WARN` 不阻断接入，`FAIL` 阻断。** 头像缺失目前只 warn：首期只有 6 名主角有头像（`face_observer` / `face_xi` / `face_jin` / `face_juan` / `face_mu` / `face_kai`），磐、笺还没有。

---

## 4. 常见不合格与改法

| # | 症状（校验器报的） | 真实原因 | 怎么改 |
| --- | --- | --- | --- |
| 1 | `尺寸 48×60，应为 64×96` | 交错了文件，或把单帧尺寸当整图 | 精灵画布必须是 **64×96**：4 列 × 4 行、每格 16×24。别把 16×24 的单帧直接当图集交，也别缩放每格尺寸去凑整图。 |
| 2 | `有 N 个半透明像素（抗锯齿/羽化边缘）`（警告，不阻断但会被记录） | 导出时没关抗锯齿、用了软笔刷或羽化 | 关掉 Anti-alias / 羽化，透明只留 0 和 255 两档；缩放请用「最近邻（Nearest Neighbor）」，不要双线性。 |
| 3 | `不是调色板 PNG（colorType=6 真彩 RGBA，应为 3 调色板）` | 导成了 PNG-24/PNG-32 | Aseprite：`File → Export → 8-bit PNG`；Photoshop：`存储为 Web 所用格式 → PNG-8`。像素图**必须**是调色板 PNG。 |
| 4 | `用了 30 色，超过每张 ≤24 色` | 用了渐变、多层阴影、孤立杂色 | 色板压到 24 色以内：合并相近色、删渐变、去掉只出现一两个像素的孤立色。注意 **256 色（pngquant 默认）不满足本项目规范**。 |
| 5 | `不是合法 PNG（PNG 文件头不对）` | 把 `.jpg` / `.webp` 改名成 `.png`，或把 `.psd` 直接后缀改掉 | 用画图工具**重新导出** PNG，不要改后缀。素材只收 `.png`。 |
| 6 | `第 1 列（下(down)方向）4 帧全透明`，或走起来动作错乱 | 帧序反了：把列当成动作、行当成了朝向 | 列 = 朝向（**下 / 左 / 右 / 上**），行 = 动作（**idle / walk1 / idle / walk2**）。参考 §1.1 的表格逐格对一遍。 |
| 7 | `不透明区域…最高只到帧内 y=18（要求贴到 22–23）`（警告）/ 游戏里角色浮空或陷地 | 锚点不是脚底中心，人物没贴住格子底边 | 把脚底对齐到每格第 **23** 行，锚点是 **(8,24)**。浮空＝脚没到底；陷地＝人物画到格子外被裁掉了。 |
| 8 | `尺寸 512×768，应为 1024×1536` | 立绘按别的比例导出 | 立绘固定 **1024×1536**（2:3）。原图比例不对就先扩画布再导出，不要拉伸变形。 |
| 9 | `不透明区域顶部在 y=12（要求 0..6）` / `底部在 y=40（要求 ≥54）` | 头像里塞了整张立绘，人缩得很小、周围一圈空 | 头像只画**头 + 肩**并**占满 48×60**：头顶贴 y≈0，肩线画到 y≥54。不是立绘缩略图。 |
| 10 | `npc_xi 未在 manifest.json 登记` | 忘了跑 `--write-manifest`，或手改了 manifest | 跑 `node tools/art-check.mjs --write-manifest`。`manifest.json` / `manifest.js` 是派生物，手改会被下一次重扫覆盖。 |
| 11 | `数值漂移（stats 与 GD.derive.pick("qwen") 对不上）：hp：卡上 84，复算 77` | 手写了 `stats`，或改了 `source` 没重新生成 | 删掉卡上的 `stats`，改用 `withStats(card, '<source>')`；数字只从 `GD.derive` 来。 |
| 12 | `技能 "ghost_skill" 不在 GD.skills 里` | 角色卡引用了一个还没定义的技能 | 先在 `characters.js` 的 `GD.skills` 里定义该技能（`id / name / slot / cost / scope / text / effect`），再在 `skills` 数组里引用。 |
| 13 | `face "xi_face" 不符合命名 /^face_[a-z0-9]+$/` | 命名前缀写反了，或用了大写、连字符 | 三种前缀固定：`npc_`/`pc_`（精灵）、`face_`（头像）、`pt_`（立绘）。全小写，id 与角色卡一致。 |
| 14 | `palette 有 2 个颜色（要求 3–6 个）` / `非法颜色 "#FFF"` | 色板写少了或写了缩写 | 写 3–6 个 **6 位**十六进制 `#RRGGBB`，从 §1.2 的建议色板里挑。 |
| 15 | `用了隔行扫描（interlace=1）` | 导出时开了 Interlaced | 导出面板关掉 Interlaced / 交错。Chrome 解码慢，像素图还会被插值糊掉。 |

---

## 5. 不要做的事

1. **不要改 `web/game/data/*.js` 里已有角色的键值**（包括 `stats`、`skills`、`look`、`palette` 和文案）。CONTRACT 的口径是**只追加**新键；改动已有角色会被 `tools/game-check.mjs` 和数据契约对账抓出来，也会让别人的工作冲突。
2. **不要在 `web/game/assets/` 里放参考图、草稿、`.psd`、截图、`.zip`**。`assets/` 只收交付用的 PNG；过程稿放 `docs/shots/` 或本地忽略目录。`art-check` 会对 `assets/` 下的非 PNG 与「参考/草稿/废稿/screenshot」这类命名直接判违规。
3. **不要放厂商 Logo 或官方立绘**（`GD.characterPolicy.noVendorLogo`）。角色外形只作「社区印象二创」，用通用道具和自造纹样表达特征。
4. **不要手改 `manifest.json` / `manifest.js`**，也不要手写 `stats`。两份都是脚本派生物。
5. **不要用 PowerShell 的 `Set-Content` / `-replace` 去写这些中文文件**——会把 UTF-8 写成 GBK 乱码。改数据卡请用编辑器，并保持 **UTF-8 无 BOM、LF 换行**。
6. **不要把立绘塞进地图渲染路径**：立绘只用于剧情对话与绝招演出，地图上画的是 16×24 的精灵。
7. **不要改构建脚本 / 引擎 / 入口**，那是别人的改动范围；接入只碰 `assets/` 与 `characters.js`。

---

## 6. 验收命令

接入完成（或每次改完素材/数据）跑这两条，**都必须 exit 0**：

```bash
node tools/cast-check.mjs    # 角色管线：命名/尺寸/PNG 规范/帧内容/头像构图/立绘/字段/数值复算/manifest 登记/体积
node tools/art-check.mjs     # 全量美术：manifest 对账/尺寸/预算/来源合规
```

再稳一点可以顺带跑（数据契约与通关推演，改数据卡后建议）：

```bash
node tools/game-check.mjs    # 数据契约：字段、技能、数值漂移、文案来源标注
node tools/game-sim.mjs      # 首章静态可通关推演
```

`cast-check` 的最后一行是机器可读的汇总，CI 里可以直接取：

```json
{"chars":10,"errors":0,"warns":2,"bytes":{"pixel":10592,"portrait":211567}}
```

结论行只有两种：「**角色校验通过**」（exit 0，含只有警告）或「**角色校验未通过**」（exit 1，必须修）。

---

## 附录 A：一次完整的接入示例

给 id 为 `yan` 的新角色接入：

```bash
# 1) 素材先放收件箱
mkdir -p web/game/assets/incoming/yan
#   把 npc_yan.png（64×96）、face_yan.png（48×60）、pt_yan.png（1024×1536）放进去

# 2) 自查素材包
node tools/cast-check.mjs --dir web/game/assets/incoming/yan

# 3) 拿数据卡模板
node tools/cast-check.mjs --scaffold yan
```

把模板里的 `withStats({ … }, 'deepseek')` 块追加进 `characters.js` 的 `GD.cast`，然后把 PNG 拷到 `pixel/` 与 `portrait/`：

```bash
cp web/game/assets/incoming/yan/npc_yan.png  web/game/assets/pixel/
cp web/game/assets/incoming/yan/face_yan.png web/game/assets/pixel/
cp web/game/assets/incoming/yan/pt_yan.png   web/game/assets/portrait/
rm -rf web/game/assets/incoming/yan

# 4) 重登记 + 复核
node tools/art-check.mjs --write-manifest
node tools/cast-check.mjs --id yan
node tools/cast-check.mjs
```

全绿即接入成功。若 `--id yan` 报「找不到角色 yan」，说明数据卡还没追加进 `GD.cast`；若报「未在 manifest.json 登记」，说明第 4 步的 `--write-manifest` 没跑或跑在拷文件之前。

## 附录 B：目前还没有头像的角色

首期只有 6 名主角有 `face_*`：`face_observer`、`face_xi`、`face_jin`、`face_juan`、`face_mu`、`face_kai`。
`pan`（磐）、`jian`（笺）暂无头像，角色卡上也没有 `face` 字段——这是**已知且允许**的状态，`cast-check` 只给 warn。有头像后补一张 48×60 的 PNG-8、在卡上加 `face: 'face_<id>'`、重跑 `--write-manifest` 即可转绿。
