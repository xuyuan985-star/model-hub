# 残响协议 · 美术资源清单（首期）

给 pixel-artist 的**验收清单**。分两类：像素游戏内资源（探索与战斗）与非像素高清立绘（剧情与绝招）。**禁止**把过程稿、截图、参考图入库。

## 0. 通用规范

- 调色板：纸张系 `#F4F5F7` `#E7E3DA`，墨 `#191F2B` `#22262F`，朱 `#C5282F`，靛 `#2B5B8A`，金 `#B68314`，苔 `#4E6B4A`，夜 `#13161D`；每张像素图**不超过 24 色**。
- 像素图**无抗锯齿**，无半透明边缘（水面除外），导出 PNG-8（pngquant 256 色以内即可，禁真彩渐变）。
- 命名：`<类别>_<id>[_<状态>].png`，id 与 `characters.js` 完全一致。
- 锚点：角色精灵**脚底中心**；道具/装饰**包围盒左下**；粒子视为角色。
- 深色主题下不得失色：像素图边缘留 1px 描边，色值统一取 `#4A5A70`（`tools/art/tokens.mjs` 的 `OUTLINE_RGB`）。旧墨色 `#191F2B` 对深底只有 1.10:1，压不住 `#13161D`，故改用冷灰蓝，实测 2.58:1 / 2.42:1（详见 §9.3）。
- 真块纪律：单块不小于 2×2 像素；曲线与圆环一律按 2px 网格落色，单点笔刷只在 1px 描边上使用。

## 1. 像素角色精灵（16×24，4 向 × 4 帧）

帧序固定：`down, left, right, up` × `idle, walk1, idle, walk2`（8 帧循环）——即 4 列 × 4 行 = 16 帧一张图集。

| id | 角色 | 备注 |
| --- | --- | --- |
| `pc_observer` | 观测者 | 无性别特征；深灰蓝外套 + 空白铭牌；行走时外套下摆微摆 |
| `npc_xi` | 汐（DeepSeek） | 深蓝连帽外套，帽檐缝鲸尾，头侧一对鳍状鲸耳（边缘有鳍条分叉，不是兽耳），外套下系深蓝围裙、下摆压两层荷叶边；待机帧双手捧着扣盖的半碗白饭 |
| `npc_jin` | 瑾（Qwen） | 深蓝长发编成一条垂辫 + 素面折扇 + 短披襦裙 + 腰间小印盒（盒内一枚朱红方章）；待机帧合扇抵下颌，判定成立帧按章 |
| `npc_juan` | 绢（Kimi） | 银白长发（发尾泛银紫）+ 星夜长裙（绣星点与月牙）+ 肩上长绢，绢上墨点即子体；待机帧抱月琴（四弦短颈）；行走帧绢尾拖出半格 |
| `npc_mu` | 幕（Seedance） | 胶片青短外套 + 腰后场记板 + 左眼取景框；待机帧侧头取景 |
| `npc_kai` | 楷（Claude） | 暖橙长发（素色缎带松系）+ 纸白立领 + 臂弯常夹一本翻旧的厚书（页边有批注）+ 袖口花形火漆；待机帧翻书，火漆只在判定已核对的帧上按一次（封口，不随说话减少） |
| `npc_pan` | 磐 | 围裙 + 七支螺丝刀；只做 2 向（下/左）即可，NPC 不动 |
| `npc_jian` | 笺 | 抱册子；只做 2 向 |

> 精灵只做**原创画法**：鲸尾、折扇、场记板、火漆都是通用道具或自造纹样，不得出现厂商 logo、软件图标或现成吉祥物轮廓。

## 2. 首领（32×32，4 帧循环 + 3 阶段变体）

`boss_devourer`：`phase1` 碎纸包裹、`phase2` 吐出小怪后露出口部空洞、`phase3` 边缘透光将散。每阶段 4 帧呼吸循环。无四向，单朝向（面向下）。

## 3. 场景图块集（16×16，单张图集）

`tiles_world.png` 首期 24 格，索引见 `world.js` 字符表：

`ground` `ground_pattern` `wall` `wall_top` `obstacle` `tree` `tree_dead` `water` `water_edge` `platform` `door` `door_side` `terminal` `crate` `shelf` `seal_wax` `pillar_shadow` `archive_cabinet` `soil` `sprout` `glass_wall` `stage_rim` `rug` `rug_edge`

五个场景各一张 `bg_<map>.png`（384×224 底图，不含角色，用于远景/视差，可选）。

## 3.5 对话头像（48×60，单帧）与杂兵（32×32，单帧）

两样都是**手机对话框/战斗界面**才需要的小图，尺寸小、用途固定，单独登记：

| 键 | 用途 | 规格 | 生成方式 |
| --- | --- | --- | --- |
| `face_<id>` | 对话框左侧头像（六名可玩角色） | 48×60、PNG-8、≤24 色、单帧、1px 墨色 `#171D29` 外描边 | `node tools/art/gen-face.mjs`，从对应 `pt_<id>_half` 的头部区（`CROP={x:286,y:100,w:452,h:565}`）区域平均降采样后量化 |
| `page_mite` `faded_photo` `cache_moth` `rank_auditor` | 战斗中四种杂兵 | 32×32、PNG-8、≤8 色、单帧、1px 墨色外描边 | `node tools/art/gen-enemy.mjs`，`Pix` 直接落笔 + `p.outline(1)` |

- **立绘 alpha 只有 0–109**：`gen-face.mjs` 降采样时只统计 `alpha>=90` 的像素，否则整张会变成半透明糊图。改这个脚本别把这条删掉。
- 杂兵**不要**用 `faded_snapshot` 当文件名：`art-check` 的 `FORBID_FILE` 正则里有 `shots?`，会被误判成过程稿。数据里敌人 id 仍叫 `faded_snapshot`，只要 `sprite` 字段写 `'faded_photo'`。
- 首领仍走 §2 的 `boss_<id>` 三阶段图集，不在这里登记。

## 4. 高清立绘（非像素，1024×1536 PNG-24）

**只用于剧情对话与绝招演出**，禁止放进地图渲染路径。

| 键 | 角色 | 差分（默认 / 情绪 / 绝招半身 / 特写） | 差分文件后缀 |
| --- | --- | --- | --- |
| `pt_observer` | 观测者 | 默认 / 侧脸看铭牌 / 半身·观测 / 特写 | `` `_profile` `_half` `_bust` |
| `pt_xi` | 汐 | 默认 / 皱眉（被说「便宜所以不行」，嘴硬反驳） / 半身·续杯 / 特写 | `` `_frown` `_half` `_bust` |
| `pt_jin` | 瑾 | 默认 / 合扇（按红章） / 半身·断列 / 特写 | `` `_fold` `_half` `_bust` |
| `pt_juan` | 绢 | 默认 / 摊绢 / 半身·汇总 / 特写 | `` `_unroll` `_half` `_bust` |
| `pt_mu` | 幕 | 默认 / 举取景框 / 半身·长镜 / 特写 | `` `_frame` `_half` `_bust` |
| `pt_kai` | 楷 | 默认 / 翻书（页边批注特写） / 半身·长考 / 特写 | `` `_thin` `_half` `_bust` |
| `pt_pan` | 磐 | 默认 / 停手 / 特写 | `` `_stop` `_bust` |
| `pt_jian` | 笺 | 默认 / 册子遮口 / 特写 | `` `_cover` `_bust` |
| `pt_devourer` | 吞页兽 | 三阶段（半身，横向构图） | `_p1` `_p2` `_p3` |

九个立绘键共 **33 张图**（6 套全套 ×4 + 磐/笺 各 3 + 吞页兽 3）；立绘键与 `characters.js` 的 `portrait` 字段一一对应，`_bust` 只用于绝招特写，不参与对话默认图。

立绘公约：透明背景；人物占画布高度的 78%–86%；上边缘留白 ≥ 8%；不得含文字与 UI；同一角色所有差分**头部位置像素级对齐**。

## 5. UI 与特效（像素优先，16 的整数倍）

- `ui_slot_frame.png` 上下文槽格（48×48，含空/占用/遗忘三态）。
- `ui_slot_icons.png` 三行图标（技能/情报/增益，各 16×16 × 12 枚）。
- `fx_slash.png` `fx_page_burst.png` `fx_silence.png`（各 4 帧，64×64）。
- `ui_portrait_frame.png` 立绘对话框边框（9-patch，64×64 角料）。

## 6. 压缩与预算

| 类别 | 预算 | 格式 |
| --- | --- | --- |
| 角色图集 | 单张 ≤ 40 KB | PNG-8 |
| 场景图块集 | ≤ 120 KB | PNG-8 |
| 首领 | 单阶段 ≤ 30 KB | PNG-8 |
| 高清立绘 | 单张 ≤ 220 KB（1024×1536） | PNG-24 + pngquant 85 |
| 合计首期 | ≤ 3.2 MB | — |

预算实测（2026-11-26，dev 线）：像素 21 张合计 55,688 B（占比 1.7%，最大单张 `bg_alley` 11,322 B）；立绘 33 张合计 785,036 B（最大单张 49,670 B，仍在 220 KB 线内）；全部美术 840,724 B，3.2 MB 预算余量 >2.3 MB。

## 7. 交付与放置

- 路径：`web/game/assets/pixel/`（像素）与 `web/game/assets/portrait/`（立绘）。
- **打包风险（需 integration-qa 处理）**：`tools/build-apk.sh` 第 2 步只复制 `web/index.html web/css web/js web/seed web/assets`，**不含 `web/game`**。接入时必须把该行补成同时复制 `web/game`，否则 APK 内取不到游戏与美术资源。本任务不改构建脚本（越界）。
- 每张图在 `web/game/assets/manifest.json` 登记：`{key, file, w, h, anchor:[x,y], frames, bytes}`，引擎按 key 取图。
- 参考图、废稿、过程截图**一律放 `docs/shots/` 或本地忽略目录**，不得入库。

## 8. 验收命令（pixel-artist 自测）

```bash
node tools/game-check.mjs           # 数据契约 + 美术清单完整性
node tools/game-sim.mjs             # 首章静态可通关推演
node tools/art-check.mjs            # manifest 登记 / 尺寸 / 预算（--write-manifest 重扫）
node tools/art/pixel-metrics.mjs    # 同色邻接、2×2 真块、色数、游程
node tools/art/verify-cast.mjs      # 剪影 IoU、摆臂差异
node tools/art/verify-assets.mjs    # 帧底对齐、描边对比度、立绘头部锚点
node tools/cast-check.mjs           # 角色三份素材 + 数据卡 + 数值复算（加角色必跑）
```

一键重绘：`node tools/art/gen-cast.mjs && node tools/art/gen-boss.mjs && node tools/art/gen-tiles.mjs && node tools/art/gen-ui.mjs && node tools/art/gen-bg.mjs && node tools/art/gen-face.mjs && node tools/art/gen-enemy.mjs`。
## 9. 实测记录（首期像素资源，dev 线）

生成脚本：`tools/art/gen-cast.mjs` `gen-boss.mjs` `gen-tiles.mjs` `gen-ui.mjs` `gen-bg.mjs`（零依赖，纯 Node 写 PNG-8）。
度量：`node tools/art/pixel-metrics.mjs`（同色邻接占比 / 色数 / 水平游程 / 2×2 真块覆盖率），`node tools/art/verify-cast.mjs`（剪影 IoU、摆臂差异），`node tools/art/verify-assets.mjs`（尺寸、锚点、描边对比度），`node tools/art-check.mjs`（manifest 登记与预算）。

### 9.1 尺寸与锚点

| 资源 | 整图 | 帧 | 排布 | 锚点（帧内） |
| --- | --- | --- | --- | --- |
| `pc_observer` `npc_xi` `npc_jin` `npc_juan` `npc_mu` `npc_kai` | 64×96 | 16×24 | 4 列 × 4 行，16 帧 | 脚底中心 (8,23) |
| `npc_pan` `npc_jian` | 64×96 | 16×24 | 同上，只用 down/left 两向（right/up 由引擎镜像） | 脚底中心 (8,23) |
| `boss_devourer` | 128×96 | 32×32 | 4 列（呼吸帧）× 3 行（phase1/2/3） | 脚底中心 (16,31) |
| `tiles_world` | 96×64 | 16×16 | 6 列 × 4 行，24 格，序同 §3 | 包围盒左下 (0,16) |
| `bg_station` 等 5 张 | 384×224 | — | 单帧 | 左下 (0,224) |
| `fx_slash` `fx_page_burst` `fx_silence` | 256×64 | 64×64 | 4 帧横排 | 中心 (32,64) |
| `ui_slot_frame` | 144×48 | 48×48 | 3 态横排（空/占用/遗忘） | 格左下 (0,48) |
| `ui_slot_icons` | 192×48 | 16×16 | 12 列 × 3 行（技能/情报/增益） | 格左下 (0,16) |
| `ui_portrait_frame` | 64×64 | — | 9-patch，角料 16px | 左下 (0,64) |
| `face_<id>` ×6 | 48×60 | — | 单帧 | 左下 (0,60) |
| 杂兵 ×4 | 32×32 | — | 单帧 | 脚底中心 (16,32) |

16 帧内无一空帧；8 张图集的帧底行统一落在 23/47/71/95（图集行内对齐），横向重心偏移 ≤1px。

### 9.2 真块与调色板（`pixel-metrics.mjs` 实测）

同色邻接占比（4 邻域）全部 ≥70%，最低 `npc_jian` 70.9%（单帧最差 69.0%）；2×2 真块覆盖率（整图口径，含 1px 描边）最低 `npc_jian` 61.8%，剔除强制 1px 描边后为 80.0%（描边按 §0 必须 1px，天然不构成 2×2）。

| 文件 | 同色邻接 | 2×2 真块 | 色数 | 水平游程 |
| --- | --- | --- | --- | --- |
| `pc_observer` | 74.7% | 66.8% | 9 | 3.61 |
| `npc_xi` | 73.7% | 72.4% | 8 | 3.88 |
| `npc_jin` | 74.9% | 68.8% | 7 | 3.31 |
| `npc_juan` | 79.1% | 72.0% | 8 | 4.36 |
| `npc_mu` | 73.7% | 65.0% | 7 | 3.81 |
| `npc_kai` | 72.0% | 65.4% | 9 | 3.15 |
| `npc_pan` | 73.6% | 68.7% | 8 | 3.62 |
| `npc_jian` | 70.9% | 61.8% | 7 | 3.37 |
| `boss_devourer` | 74.0% | 81.5% | 6 | 4.36 |
| `tiles_world` | 77.4% | 100% | 22 | 5.43 |
| `fx_slash` | 92.9% | 100% | 2 | 2.86 |
| `fx_page_burst` | 96.7% | 100% | 3 | 5.87 |
| `fx_silence` | 81.6% | 91.4% | 4 | 3.03 |
| `ui_slot_frame` | 87.8% | 83.6% | 8 | 7.49 |
| `ui_slot_icons` | 92.4% | 100% | 7 | 3.14 |
| `ui_portrait_frame` | 89.5% | 87.2% | 5 | 8.36 |
| `bg_station` `bg_colonnade` `bg_alley` `bg_greenhouse` `bg_archive` | 71.3%–79.2% | 100% | 19–24 | 3.35–5.43 |

全部图 ≤24 色（最高 `tiles_world` 22）；角色图集专色 7–9 色，跨角色并集 29 色仍属同一母版家族。

### 9.3 可辨性与动画

- 剪影 IoU（归一化 24×24，同帧 down/idle）：最高 `npc_xi`/`npc_juan` 0.855，其余 ≤0.84，全部低于 0.90 上限。
- 摆臂差异（walk 帧 0 vs 帧 2，手臂带内变化像素）：`npc_xi` 14、`npc_kai` 11、`npc_mu` 10、`npc_jin` 9、`npc_juan` 8，全部 ≥8。
- 描边色统一 `#4A5A70`（`tools/art/tokens.mjs` OUTLINE_RGB），对 `#13161D` 对比度 2.58:1、对 `#191B2D` 2.42:1，均过 1.6:1 下限（旧墨色 `#191F2B` 仅 1.10/1.03，故 §0 的「1px 描边」在深色底改用冷灰蓝实现）。

### 9.4 体积

像素资源合计 **55,688 字节**（21 张），预算 3.2 MB 中占 1.7%；单张最大 `bg_alley` 11,322 B，远低于 120 KB / 40 KB 分级预算。立绘（33 张，队长管线）785,036 B，合计 840,724 B。

### 9.5 复现

```bash
node tools/art/gen-cast.mjs && node tools/art/gen-boss.mjs && node tools/art/gen-tiles.mjs \
  && node tools/art/gen-ui.mjs && node tools/art/gen-bg.mjs
node tools/art/pixel-metrics.mjs      # 真块与色数
node tools/art/verify-cast.mjs        # IoU 与摆臂
node tools/art/verify-assets.mjs      # 尺寸/锚点/对比度
node tools/art-check.mjs              # manifest 与预算（--write-manifest 可重扫登记）
```