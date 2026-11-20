# 模型行情

查看 AI 模型智能榜单、平台报价、性价比与 API 额度的安卓小工具。无广告，不收集数据，所有抓取均在手机本地完成。

## 安装

到 [Releases](https://github.com/xuyuan985-star/model-hub/releases/latest) 下载 `modelhub.apk` 安装到手机。

装好后，应用内「更多 → 检查更新」会自动从 GitHub 检查新版、下载并拉起系统安装，无需手动回到网页下载。

## 功能

- **榜单**：Artificial Analysis 综合智能、省钱、速度、首字延迟、出答案延迟、知识可靠、上下文，以及 6 项行业能力和 9 项单项成绩；支持搜索、按厂商筛选、切换思考档位、自选与长按横向对比（最多 4 个）。
- **价格**：收录 models.dev 300 多家平台每百万字报价，默认置顶 OpenCode Zen、OpenCode Go、Command Code；支持输入/输出/混合/缓存/超长上下文价格查看与人民币换算。
- **性价比**：混合价对综合智能的对数散点图与「同价位最强」前沿线，点击圆点直接看详情。
- **额度**：填密钥查询 OpenRouter、DeepSeek、硅基流动、Kimi、Command Code 与 One API / New API 中转站余额，支持表单自定义其他平台。密钥保存在手机硬件加密存储中，不上传、不备份。
- **最近变动**：自动记录每次刷新发现的新模型与调价（最多保留 100 条）。

## 线上更新机制

1. 启动后静默检查 GitHub Releases 最新版本（6 小时内不重复），有新版时在「更多」标签右上角显示红点。
2. 下载安装包按「直连 → ghproxy.net → gh-proxy.com → ghfast.top」依次尝试，支持实时进度条。
3. 校验安装包完整性后，通过内置 `ApkProvider` 拉起系统安装器。

## 本地构建

```bash
bash tools/build-apk.sh          # 输出 dist/modelhub.apk（版本号读取自 VERSION）
DEBUG=1 bash tools/build-apk.sh  # 输出可调试包 dist/modelhub-debug.apk
node tools/build-seed.mjs        # 更新内置数据快照
```

## 数据来源与说明

- 榜单：Artificial Analysis（默认读取公开页面，可在「更多」中填写官方免费 API 密钥切换）
- 价格：models.dev；汇率：open.er-api.com
- 内置初始数据快照，打开即显示内容，联网刷新在后台进行。
