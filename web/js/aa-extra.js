/* aa-extra.js — AA 供应商速度榜、生图榜(T2I)、视频榜(T2V)。按需拉取并缓存，不拖慢启动。ES2019。 */
(function (w) {
  'use strict';
  var C = w.Core;
  var UA = 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  var E = {};

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  /** 从 RSC 文本中按括号配对提取指定 key 后的 JSON 对象或数组。 */
  function extractBalanced(text, startIdx, openCh, closeCh) {
    var i = startIdx, d = 0, inStr = false, esc = false, len = text.length;
    for (; i < len; i++) {
      var c = text.charCodeAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === 92) esc = true;
        else if (c === 34) inStr = false;
      } else {
        if (c === 34) inStr = true;
        else if (c === openCh) d++;
        else if (c === closeCh) { if (--d === 0) return text.slice(startIdx, i + 1); }
      }
    }
    return null;
  }

  /** 解析 AA /leaderboards/providers 的 initialRows。 */
  E.parseProviders = function (text) {
    var idx = text.indexOf('"initialRows":[');
    if (idx < 0) throw new Error('未能找到供应商数据');
    var raw = extractBalanced(text, text.indexOf('[', idx), 91, 93);
    if (!raw) throw new Error('供应商数据不完整');
    var arr = JSON.parse(raw);
    var rows = [];
    arr.forEach(function (r) {
      if (!r || !r.host) return;
      var pr = r.pricing || {}, pf = r.performance || {}, ft = r.features || {}, md = r.model || {};
      var pIn = num(pr.price1mInputTokens), pOut = num(pr.price1mOutputTokens);
      rows.push({
        id: r.id,
        model: r.label || r.hostApiId || '',
        host: r.host.name || '',
        creator: md.creator && md.creator.name || '',
        speed: num(pf.outputSpeed),
        ttft: num(pf.timeToFirstToken),
        ttfa: num(pf.timeToFirstAnswerToken),
        errRate: num(pf.endpointErrorRate),
        pIn: pIn,
        pOut: pOut,
        pBlend: pIn != null && pOut != null ? (3 * pIn + pOut) / 4 : null,
        ctx: num(ft.contextWindowTokens),
        ii: num(md.intelligenceIndex),
        ow: !!md.isOpenWeights
      });
    });
    if (rows.length < 20) throw new Error('供应商数据条数异常');
    return { rows: rows, count: rows.length };
  };

  /** 解析 AA 生图/视频公开页中首个完整排行榜（各条目含 "values":{"id":...,"elo":...}，按 id 去重取第一段主榜）。 */
  E.parseMediaRsc = function (text, kind) {
    var needle = '"values":{"id":', pos = 0, seen = {}, rows = [];
    // RSC 中会包含主榜和各分类子榜，每个榜单首条 rank===0；遇到第二轮 rank===0 且已收集足够多条目就停
    var seenZero = false;
    while ((pos = text.indexOf(needle, pos)) >= 0) {
      var objStart = pos + '"values":'.length;
      var raw = extractBalanced(text, objStart, 123, 125);
      pos += needle.length;
      if (!raw) continue;
      var v;
      try { v = JSON.parse(raw); } catch (e) { continue; }
      if (!v || !v.id || typeof v.elo !== 'number') continue;
      if (v.rank === 0) {
        if (seenZero && rows.length >= 10) break;
        seenZero = true;
      }
      if (seen[v.id]) continue;
      seen[v.id] = 1;
      rows.push({
        id: v.id,
        name: v.name || '',
        creator: v.creator && v.creator.name || '',
        elo: Math.round(v.elo),
        appearances: num(v.appearances),
        rd: v.releaseDate || null,
        ow: !!v.openWeightsUrl,
        price: kind === 't2i' ? num(v.pricePer1kImages) : num(v.pricePerMinute),
        priceUnit: kind === 't2i' ? '/千图' : '/分钟'
      });
    }
    if (rows.length < 8) throw new Error('榜单数据解析失败');
    rows.sort(function (a, b) { return b.elo - a.elo; });
    return { rows: rows, count: rows.length, source: 'web' };
  };

  /** 官方免费 API 的生图/视频映射。 */
  function fetchMediaApi(kind) {
    var ep = kind === 't2i' ? 'text-to-image' : 'text-to-video';
    var url = 'https://artificialanalysis.ai/api/v2/media/' + ep + '/models/free';
    return C.net(url, { headers: { 'x-api-key': '{{secret:' + w.AaApi.SECRET + '}}', Accept: 'application/json' }, timeoutMs: 30000 }).then(function (r) {
      if (!r.status || r.status >= 400) throw new Error('官方媒体接口返回 ' + (r.status || r.error));
      var j = JSON.parse(r.body);
      var rows = (j.data || []).filter(function (d) { return typeof d.elo === 'number'; }).map(function (d) {
        return {
          id: d.id || d.slug,
          name: d.name || d.slug || '',
          creator: d.model_creator && d.model_creator.name || '',
          elo: Math.round(d.elo),
          appearances: num(d.appearances),
          rd: d.release_date || null,
          ow: false,
          price: null,
          priceUnit: kind === 't2i' ? '/千图' : '/分钟'
        };
      });
      if (rows.length < 5) throw new Error('官方媒体接口数据为空');
      rows.sort(function (a, b) { return b.elo - a.elo; });
      return { data: { rows: rows, count: rows.length, source: 'api' } };
    });
  }

  function fetchMediaWeb(kind) {
    var url = kind === 't2i'
      ? 'https://artificialanalysis.ai/image/leaderboard/text-to-image'
      : 'https://artificialanalysis.ai/video/leaderboard/text-to-video';
    return C.net(url, { headers: { RSC: '1', 'User-Agent': UA }, timeoutMs: 35000 }).then(function (r) {
      if (!r.status || r.status >= 400) throw new Error('未能获取榜单（' + (r.status || r.error || '网络不通') + '）');
      return new Promise(function (res) { setTimeout(function () { res(r); }, 0); });
    }).then(function (r) {
      return { data: E.parseMediaRsc(r.body, kind) };
    });
  }

  // 注册三个按需数据源（lazy: true，启动时不自动拉取，点到对应标签才拉）
  C.defSource({
    id: 'aa_providers', title: '供应商速度', ttlMin: 180, lazy: true,
    fetch: function () {
      return C.net('https://artificialanalysis.ai/leaderboards/providers', { headers: { RSC: '1', 'User-Agent': UA }, timeoutMs: 35000 }).then(function (r) {
        if (!r.status || r.status >= 400) throw new Error('未能获取供应商速度（' + (r.status || r.error || '网络不通') + '）');
        return new Promise(function (res) { setTimeout(function () { res(r); }, 0); });
      }).then(function (r) { return { data: E.parseProviders(r.body) }; });
    }
  });

  ['t2i', 't2v'].forEach(function (kind) {
    C.defSource({
      id: 'aa_' + kind, title: kind === 't2i' ? '生图榜' : '视频榜', ttlMin: 360, lazy: true,
      fetch: function () {
        if (C.settings.aaMode === 'api' && w.Native && w.Native.hasSecret && w.Native.hasSecret(w.AaApi.SECRET)) {
          return fetchMediaApi(kind).catch(function () { return fetchMediaWeb(kind); });
        }
        return fetchMediaWeb(kind);
      }
    });
  });

  w.AaExtra = E;
})(window);
