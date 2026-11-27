# 模型行情

查看 AI 模型智能榜单、多模态榜、API 供应商实测速度、跨平台比价、订阅套餐、预算选型与 API 额度的安卓小工具。无广告，不收集数据，所有抓取与计算均在手机本地完成。

## 安装与更新

到 [Releases](https://github.com/xuyuan985-star/model-hub/releases/latest) 下载 `modelhub.apk` 安装到手机。

装好后，应用内「更多 → 检查更新」会自动从 GitHub 检查新版、走国内镜像回退下载并拉起系统安装。

## 页面与功能规划

底栏保持 **榜 / 价 / 值 / 额 / 多** 五格：

- **榜单**：顶部切换 `大语言` / `供应商速度` / `生图` / `视频`（后三项按需拉取缓存，不拖慢启动）。大语言榜支持思考档位切换、厂商筛选、自选与长按横向对比（最多 4 个，支持一键存为分享长图）；支持填入 AA 官方免费 API 密钥切换官方接口。
- **价格**：顶部切换 `按平台` / `按模型比价` / `订阅套餐`。收录 models.dev 300+ 平台报价，默认置顶 OpenCode Zen、OpenCode Go、Command Code；可跨平台横向比价，也可查看并自定义 od / cc / oc 及主流订阅套餐。
- **性价比**：顶部切换 `前沿排行` / `预算选型`。提供混合价对综合智能的对数散点图与「同价位最强」前沿线；选型向导按场景、月预算与缓存命中率给出同预算最强推荐及包月对比。
- **额度**：填密钥查 OpenRouter、DeepSeek、硅基流动、Kimi、Command Code、One API / New API 中转站余额及自定义 JSON 接口；支持一键零消耗测速与低余额 / 订阅到期预警提醒。密钥只保存在手机硬件加密存储中，不上传、不备份。
- **更多**：币种、深浅色、混合价比例、低余额提醒阈值、线上检查更新、AA 数据源切换、配置导出/导入（不含密钥）、插件工坊与公益赞赏页。

## 像素冒险《残响协议》

「更多 → 像素冒险 → 进入观测站」是一个完全离线的像素小游戏，整屏运行（进游戏时原生侧自动切沉浸模式，收起状态栏与导航栏）。

- **第一章 · 消失的第零页**：5 张地图探索、对白分支、回合制战斗、本地存档，约 15–30 分钟。
- **幕间 · 第七位观察者**（`web/game/interlude/`）：第一章任一结局后自动衔接到四幕幕间，四种「核实」玩法——推演台（分类填格）、对照台（并排比对）、编排台（按序复位）、定稿台（亲手定稿），四个结局，约 18 分钟。

设计文档：`web/game/CONTRACT.md`（数据契约）、`web/game/ART-SPEC.md`（美术规格）、`web/game/CAST-PIPELINE.md`（新角色接入）、`web/game/interlude/DESIGN.md`（幕间剧情）、`web/game/interlude/FORM-DESIGN.md`（游玩形式）。

## 本地构建

```bash
bash tools/build-apk.sh          # 输出 dist/modelhub.apk（版本号读取自 VERSION）
DEBUG=1 bash tools/build-apk.sh  # 输出可调试包 dist/modelhub-debug.apk
node tools/build-seed.mjs        # 更新内置数据快照
```

## 自检（均只读，改动前后各跑一遍）

```bash
node tools/game-check.mjs        # 游戏数据契约（地图/对白/任务/数值）
node tools/game-sim.mjs          # 纯数据推演：能否走通首章
node tools/battle-check.mjs      # 战斗数值与技能表
node tools/art-check.mjs         # 美术清单、尺寸、色数、体积
node tools/interlude-check.mjs   # 幕间四幕与四种玩法
node tools/cast-check.mjs        # 角色素材与数值是否与榜单一致
node web/game/interlude/story-check.mjs  # 幕间剧情可达性、台词量、时长
```

写清单要显式加 `node tools/art-check.mjs --write-manifest`。

