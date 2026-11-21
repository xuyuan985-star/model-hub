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
- **更多**：币种、深浅色、混合价比例、低余额提醒阈值、线上检查更新、AA 数据源切换、最近变动记录（最多 100 条）、配置导出/导入（不含密钥）与公益赞赏页。

## 本地构建

```bash
bash tools/build-apk.sh          # 输出 dist/modelhub.apk（版本号读取自 VERSION）
DEBUG=1 bash tools/build-apk.sh  # 输出可调试包 dist/modelhub-debug.apk
node tools/build-seed.mjs        # 更新内置数据快照
```
