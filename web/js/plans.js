/* plans.js — od / cc / oc 及主流 AI 订阅套餐对照，支持本地新增与编辑。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core;
  var P = {};

  P.builtin = [
    // Open Design (od)
    { id: 'od-go', grp: 'Open Design', name: 'Go', usd: 10, firstUsd: 8, credit: 220, api: true,
      models: 'DeepSeek V4.1 / V4、GLM-5.3 Flash、Kimi K2.7 Code、MiniMax M3.1、MiMo V2.6（11 款）',
      note: '首月 $8，团队无限成员共享额度；不含顶级闭源模型。', url: 'https://open-design.ai/pricing/' },
    { id: 'od-plus', grp: 'Open Design', name: 'Go Plus', usd: 20, firstUsd: 16, credit: 310, api: true,
      models: '11 款 Coding Plan + $20 顶级模型额度（Sonnet 5.5 / GPT-6 Sol / Gemini 4 Argon 等）',
      note: '首月 $16，20 并发共享；含图像/视频 API 额度。', url: 'https://open-design.ai/pricing/' },
    { id: 'od-pro', grp: 'Open Design', name: 'Go Pro', usd: 100, firstUsd: 80, credit: 780, api: true,
      models: 'Coding Plan $660 + Top Models $120（含 Claude Fable 5.2 / Opus 5.5 / GPT-6 Astra）',
      note: '首月 $80，30 并发共享。', url: 'https://open-design.ai/pricing/' },

    // Command Code (cc)
    { id: 'cc-go', grp: 'Command Code', name: 'Go', usd: 1, credit: 15, api: false,
      models: 'GLM-5.2、DeepSeek V4.1 Flash、Qwen 3.8 等 24 款（每款约 $10 额度）',
      note: '仅 CLI 使用，不含 Provider API；约 9K 次请求。', url: 'https://commandcode.ai/pricing' },
    { id: 'cc-goat', grp: 'Command Code', name: 'GOAT', usd: 10, credit: 100, api: true,
      models: 'DeepSeek V4.1 Flash / GLM-5.3 Flash / Ling 3.1 各 $100 + 33 款模型',
      note: '含 OpenAI/Anthropic 兼容 API，约 75K 次请求，支持 5h/周/月额度查询。', url: 'https://commandcode.ai/pricing' },
    { id: 'cc-pro', grp: 'Command Code', name: 'Pro', usd: 20, credit: 110, api: true,
      models: '开源 + 主流闭源模型全覆盖，支持 API 调用与优惠叠加',
      note: '适合高频写代码，支持 5h/周/月窗口查询。', url: 'https://commandcode.ai/pricing' },
    { id: 'cc-max', grp: 'Command Code', name: 'Max', usd: 100, credit: 300, api: true,
      models: '含 $150 基础额度 + 优惠最高折合 $300（含顶级闭源模型）',
      note: '高并发速率限制、优先支持。', url: 'https://commandcode.ai/pricing' },
    { id: 'cc-prov', grp: 'Command Code', name: 'Provider (API)', usd: 15, credit: 15, api: true,
      models: '全部开源 + 闭源模型原价无加价',
      note: '含 $15 额度，超额按量付费，充值永不过期。', url: 'https://commandcode.ai/docs/provider' },

    // OpenCode (oc)
    { id: 'oc-go', grp: 'OpenCode', name: 'Go', usd: 10, credit: 60, api: true,
      models: '32 款精选开源/编程模型（DeepSeek V4、Kimi K3、GLM-5.2、Qwen4 Max、Gemini 4 Argon 等）',
      note: '支持 OpenCode / Claude Code / Codex，5 小时限额为月额度的 20%。', url: 'https://opencode.ai/go' },
    { id: 'oc-plus', grp: 'OpenCode', name: 'Go Plus', usd: 40, credit: 180, api: true,
      models: '同 Go 全部 32 款模型，5 小时与月度限额翻 3~4 倍',
      note: '适合重度 Agent 编码项目。', url: 'https://opencode.ai/go' },

    // 主流参考
    { id: 'cl-pro', grp: 'Claude', name: 'Pro', usd: 20, credit: 60, api: false,
      models: 'Claude Fable / Opus / Sonnet / Haiku，含 Claude Code 额度',
      note: '官方订阅，不含按量 API。', url: 'https://claude.ai/pricing' },
    { id: 'gpt-plus', grp: 'ChatGPT', name: 'Plus', usd: 20, credit: 60, api: false,
      models: 'GPT-6.2 / Codex CLI 订阅额度',
      note: '官方订阅，不含按量 API。', url: 'https://chatgpt.com/pricing' }
  ];

  P.custom = C.store.get('custom-plans.json', []);
  P.save = function () { C.store.set('custom-plans.json', P.custom); };
  P.all = function () { return P.builtin.concat(P.custom); };
  P.add = function (item) {
    var usd = parseFloat(item.usd);
    if (!item.name || !isFinite(usd) || usd < 0) throw new Error('请填写套餐名称和有效月费');
    var rec = {
      id: 'cp_' + C.uid(),
      grp: String(item.grp || '自定义').trim(),
      name: String(item.name).trim(),
      usd: usd,
      credit: parseFloat(item.credit) || null,
      api: !!item.api,
      models: String(item.models || '').trim(),
      note: String(item.note || '').trim(),
      custom: true
    };
    P.custom.push(rec);
    P.save();
    return rec;
  };
  P.remove = function (id) {
    P.custom = P.custom.filter(function (x) { return x.id !== id; });
    P.save();
  };

  w.Plans = P;
})(window);
