/* filters.js — 厂商分级、国产厂商名单、开源/国产范围筛选、榜单分组与中文名（v1.1.2）。ES2019。 */
(function (w) {
  'use strict';
  var F = {};

  // 主流厂商：榜单页高权重展示区，按知名度排序
  F.TIER1 = ['OpenAI', 'Anthropic', 'Google', 'SpaceXAI', 'Meta', 'DeepSeek', 'Alibaba', 'Kimi', 'Z AI', 'MiniMax', 'ByteDance Seed', 'Tencent', 'Xiaomi', 'Baidu', 'Mistral'];

  // 国产厂商名单（数据源里没有国家字段，这里手工维护，只收确定的）
  F.CN = {};
  ['Alibaba', 'Alibaba-ATH', 'DeepSeek', 'Kimi', 'Z AI', 'MiniMax', 'ByteDance Seed', 'Bytedance', 'ByteDance',
    'Tencent', 'Xiaomi', 'Baidu', 'StepFun', 'InclusionAI', 'LongCat', 'KwaiKAT', 'KlingAI', 'OpenBMB', 'Nanbeige',
    'China Mobile', 'AI9Stars', 'Joy Future Academy', 'Meituan', 'Vidu', 'HiDream', 'PixVerse', 'Skywork AI', 'Sand.ai',
    'VectorSpaceLab', 'Moonshot AI', 'Zhipu AI', 'SenseTime', 'iFlytek', '01.AI', 'Kuaishou', 'Shengshu'
  ].forEach(function (n) { F.CN[n] = 1; });
  F.isCN = function (name) { return !!F.CN[name]; };

  // 官方接口模式下数据不带「是否开源」，用内置快照按模型名补上
  var owMap = null;
  function norm(s) { return String(s || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, ''); }
  function owLookup() {
    if (owMap) return owMap;
    owMap = {};
    try {
      var seed = w.Core.store.asset('web/seed/aa.json');
      ((seed && seed.data && seed.data.models) || []).forEach(function (m) {
        if (m.isOpenWeights) owMap[norm(m.releaseName || m.name)] = 1;
      });
    } catch (e) {}
    return owMap;
  }
  F.isOpen = function (m) {
    if (m.ow != null) return !!m.ow;
    if (m.isOpenWeights != null) return !!m.isOpenWeights;
    return !!owLookup()[norm(m.releaseName || m.name)];
  };

  // 范围筛选：all 全部 / open 开源 / cn 国产
  F.SCOPES = [['all', '全部'], ['open', '开源'], ['cn', '国产']];
  F.scopeOk = function (m, scope) {
    if (scope === 'open') return F.isOpen(m);
    if (scope === 'cn') return F.isCN(m.creatorName || m.creator);
    return true;
  };
  /** 范围切换小分段的 HTML；only 可限定只出现哪几项（如供应商榜没有开源信息） */
  F.scopeHtml = function (cur, only) {
    return '<div class="mseg">' + F.SCOPES.filter(function (s) { return !only || only.indexOf(s[0]) >= 0; }).map(function (s) {
      return '<button class="' + (s[0] === cur ? 'on' : '') + '" data-scp="' + s[0] + '">' + s[1] + '</button>';
    }).join('') + '</div>';
  };

  // 把厂商拆成「主流」与「其他」两层：主流固定顺序，其他按模型数量从多到少
  F.vendorLists = function (models) {
    var cnt = {};
    models.forEach(function (m) { if (m.creatorName) cnt[m.creatorName] = (cnt[m.creatorName] || 0) + 1; });
    var top = F.TIER1.filter(function (n) { return cnt[n]; });
    var rest = Object.keys(cnt).filter(function (n) { return top.indexOf(n) < 0; })
      .sort(function (a, b) { return (cnt[b] - cnt[a]) || (a < b ? -1 : 1); });
    return { top: top, rest: rest, counts: cnt };
  };

  // 单项评测中文名（数据源只给英文键名；拿不准含义的不硬翻，保留原名）
  F.EVAL_NAMES = {
    evalTerminalbenchHard: '终端编程', evalLivecodebench: '实战编程', evalScicode: '科研编程', evalFrontiercode20: '前沿编程',
    evalGdpvalAaNormalized: '办公实务', evalTau2Bench: '工具调用', evalIfbench: '指令遵循',
    evalArtificialAnalysisLongContextReasoning: '长文推理', evalMmmuPro: '看图理解', evalAutomationbenchAa: '流程自动化',
    evalAime2025: '数学', evalGpqaDiamond: '科学问答', evalHumanitysLastExam: '超难考题', evalCritpt: '物理推理',
    evalTau3Banking: '银行客服', evalHarveyLabAa: '法律实务', evalHealthbench: '医疗问答', evalAaAnalystAgent: '分析师任务',
    evalAa3d: '3D 生成', evalCode2videoAa: '代码做视频',
    evalOmniscienceAccuracy: '知识准确率', evalOmniscienceNonHallucination: '不乱编率',
    evalHleDiamond: '超难考题（精选）', evalGdpPdf: 'GDPval PDF',
    evalTerminalbench40: '终端编程 4.0', evalTerminalbench41: '终端编程 4.1', evalTerminalbench21: '终端编程 2.1',
    evalTerminalBenchScience: '科研终端任务', evalCritptV2Hard: '物理推理（难）', evalFrontiercode: '前沿编程 1.0',
    evalFrontierphysics: '前沿物理', evalEnterpriseOpsGymAa: '企业运维', evalHealthbenchProfessional: '医疗问答（专业）',
    evalItbenchAa: 'IT 运维', evalApexAgentsAa: 'APEX 智能体'
  };
  F.evalName = function (key, fallback) {
    if (F.EVAL_NAMES[key]) return F.EVAL_NAMES[key];
    if (fallback) return String(fallback).replace(/ Benchmark.*$/, '');
    return String(key).replace(/^eval/, '').replace(/^Aa(?=[A-Z0-9])/, '').replace(/Aa$/, '').replace(/([a-z])([A-Z0-9])/g, '$1 $2');
  };

  // 榜单分组：组与组、组内都按普通用户的实用程度从高到低排
  F.BOARD_GROUPS = [
    ['常用', ['ii', 'cost', 'speed', 'ttft', 'ttfa', 'omni', 'ctx']],
    ['编程开发', ['capabilityEngineeringIndex', 'evalTerminalbenchHard', 'evalLivecodebench', 'evalFrontiercode20', 'evalScicode']],
    ['办公与工具', ['evalGdpvalAaNormalized', 'evalTau2Bench', 'evalIfbench', 'evalAutomationbenchAa', 'evalArtificialAnalysisLongContextReasoning', 'evalMmmuPro']],
    ['视觉与审美', ['evalAa3d', 'evalCode2videoAa']],
    ['学科能力', ['evalAime2025', 'evalGpqaDiamond', 'evalCritpt', 'evalHumanitysLastExam']],
    ['专业领域', ['capabilityFinanceAndAccountingIndex', 'capabilityStrategyAndOpsIndex', 'capabilityEconomicsIndex', 'evalAaAnalystAgent', 'evalTau3Banking', 'capabilityLegalIndex', 'evalHarveyLabAa', 'capabilityHealthcareAndMedicalIndex', 'evalHealthbench']]
  ];
  // 榜单页直接露出的高频榜，其余收进「更多榜单」
  F.BOARD_INLINE = ['ii', 'cost', 'speed', 'capabilityEngineeringIndex', 'evalTerminalbenchHard', 'evalGdpvalAaNormalized', 'omni'];

  w.Filters = F;
})(window);
