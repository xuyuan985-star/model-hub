/* aa-api.js — Artificial Analysis 官方 API（免费档）。字段取自官方 OpenAPI 文档 /api/v2/language/models/free。
 * 密钥保存在原生加密库，id 固定为 aa-api-key；网页脚本里只出现 {{secret:aa-api-key}} 占位符。
 * 免费档：每天 100 次请求（固定 24 小时窗口），每页 200 个模型，要求在界面上署名。 */
(function (w) {
  'use strict';
  var C = w.Core;
  var API = { SECRET: 'aa-api-key', BASE: 'https://artificialanalysis.ai/api/v2/language/models/free', KEY_PAGE: 'https://artificialanalysis.ai/api-key-management-redirect' };

  function n(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function first(a, b) { return a != null ? a : b; }

  /** 官方一条记录 -> 和网页抓取版相同的模型结构（官方免费档没有的字段为 null）。 */
  API.mapItem = function (d) {
    var ev = d.evaluations || {}, pr = d.pricing || {}, pf = d.performance || {}, p3 = d.performance_v3 || {};
    var cr = d.model_creator || {}, ic = d.artificial_analysis_intelligence_index_cost || {};
    var name = String(d.name || d.slug || '');
    var i = n(pr.price_1m_input_tokens), o = n(pr.price_1m_output_tokens);
    return {
      id: d.id, name: name, shortName: null, variant: null, slug: d.slug,
      releaseName: name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name,
      url: 'https://artificialanalysis.ai/models/' + d.slug,
      creatorName: cr.name || null, creatorSlug: null, creatorCountry: null, creatorLogoUrl: null, creatorColor: null,
      releaseDate: d.release_date || null, isReasoning: null, isOpenWeights: null, deprecated: false, contextWindowTokens: null,
      intelligenceIndex: n(ev.artificial_analysis_intelligence_index), intelligenceRank: null, omniscienceIndex: null,
      capabilityFinanceAndAccountingIndex: n(ev.artificial_analysis_finance_and_accounting_index),
      capabilityStrategyAndOpsIndex: n(ev.artificial_analysis_strategy_and_ops_index),
      capabilityLegalIndex: n(ev.artificial_analysis_legal_index),
      capabilityHealthcareAndMedicalIndex: n(ev.artificial_analysis_healthcare_and_medical_index),
      capabilityEngineeringIndex: n(ev.artificial_analysis_engineering_index),
      capabilityEconomicsIndex: n(ev.artificial_analysis_economics_index),
      indexCostTotalUsd: n(ic.total_cost), costPerTaskUsd: ic.cost_per_task ? n(ic.cost_per_task.total_cost) : null,
      priceInputPer1M: i, priceOutputPer1M: o, priceBlended3to1Per1M: i != null && o != null ? (3 * i + o) / 4 : null,
      priceCacheReadPer1M: n(pr.price_1m_cache_hit_tokens), priceCacheWritePer1M: n(pr.price_1m_cache_write_tokens),
      outputTokensPerSecond: first(n(p3.mean_output_tokens_per_second), n(pf.median_output_tokens_per_second)),
      timeToFirstTokenSeconds: first(n(p3.mean_time_to_first_token_seconds), n(pf.median_time_to_first_token_seconds)),
      timeToFirstAnswerTokenSeconds: first(n(p3.mean_time_to_first_answer_token_seconds), n(pf.median_time_to_first_answer_token_seconds))
    };
  };

  function reason(r, body) {
    var msg = ''; try { var j = JSON.parse(body); msg = j.error || j.message || ''; } catch (e) { }
    if (r.status === 401) return '官方 API 说密钥无效。请到 AA 网站重新复制密钥。';
    if (r.status === 403) return '这个密钥没有权限访问免费接口。';
    if (r.status === 429) {
      var ra = r.headers && r.headers['retry-after'], hrs = ra ? Math.ceil(+ra / 3600) : 0;
      return '今天的 100 次免费请求用完了' + (hrs ? '，约 ' + hrs + ' 小时后恢复' : '') + '。已继续显示旧数据。';
    }
    return '官方 API 返回 ' + r.status + (msg ? '：' + String(msg).slice(0, 80) : '');
  }

  /** 拉取全部分页（通常 2 页）。返回 {data, meta}；失败抛出带中文原因的错误。 */
  API.fetchAll = function () {
    var models = [], rate = null, version = null, tier = null, page = 1;
    function step() {
      return C.net(API.BASE + '?page=' + page, { headers: { 'x-api-key': '{{secret:' + API.SECRET + '}}', Accept: 'application/json' }, timeoutMs: 30000 }).then(function (r) {
        if (!r.status) throw new Error('没能连上 AA 官方接口：' + (r.error || '网络不通'));
        if (r.status >= 400) throw new Error(reason(r, r.body));
        var j; try { j = JSON.parse(r.body); } catch (e) { throw new Error('官方接口返回的不是 JSON'); }
        if (!j || !Array.isArray(j.data)) throw new Error('官方接口返回格式变了，已保留旧数据');
        j.data.forEach(function (d) { models.push(API.mapItem(d)); });
        var h = r.headers || {};
        rate = { limit: +h['x-ratelimit-limit'] || null, remaining: h['x-ratelimit-remaining'] != null ? +h['x-ratelimit-remaining'] : null, reset: h['x-ratelimit-reset'] || null };
        version = j.intelligence_index_version; tier = j.tier || h['x-aa-tier'] || null;
        if (j.pagination && j.pagination.has_more && page < 6) { page++; return step(); }
      });
    }
    return step().then(function () {
      if (models.length < 30) throw new Error('官方接口只返回了 ' + models.length + ' 个模型，数据不完整，已保留旧数据');
      var ranked = models.filter(function (m) { return m.intelligenceIndex != null; }).sort(function (a, b) { return b.intelligenceIndex - a.intelligenceIndex; });
      ranked.forEach(function (m, i) { m.intelligenceRank = i + 1; });
      return { data: { models: models, evals: [], meta: { modelCount: models.length, intelligenceIndexVersion: version, source: 'api', tier: tier } }, meta: { mode: 'api', rate: rate, pages: page } };
    });
  };
  w.AaApi = API;
})(window);
