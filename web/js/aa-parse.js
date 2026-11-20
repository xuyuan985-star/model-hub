/* aa-parse.js -- pure parser for the Artificial Analysis LLM leaderboard page.
 *
 * NO platform APIs: no Node (Buffer, fs, zlib, process, require), no DOM, no fetch.
 * Syntax and built-ins are ES2020 at most (target: Android System WebView / Chrome 91).
 * Works as a classic <script> (defines globalThis.AAParse), as CommonJS (module.exports)
 * and as a side-effect ES import (`import './aa-parse.js'` then globalThis.AAParse).
 *
 *   var r = AAParse.parseAA(text, { detailText: optionalText });
 *
 * `text` is the response body of https://artificialanalysis.ai/leaderboards/models, either
 *   - the React flight payload (request header `RSC: 1`, ~560K chars), or
 *   - the full HTML document (~1.43M chars).
 * `detailText` (optional) is the body of https://artificialanalysis.ai/models (same two forms);
 * it adds licence / country / capability indexes for the ~28 models featured there.
 *
 * Returns (never throws):
 *   { ok, error, errorMessage, models: [...], evals: [...],
 *     meta: { modelCount, detailCount, intelligenceIndexVersion, payloadKind,
 *             tableFoundVia, parseMs, warnings: [...] } }
 *   ok === false  -> do not replace the cached data (error: EMPTY_INPUT | PARSE_FAILED |
 *                    TOO_FEW_MODELS | EXCEPTION).
 *   ok === true with warnings -> usable, but some columns may be missing.
 */
(function (root) {
  'use strict';

  var ORIGIN = 'https://artificialanalysis.ai';
  var MIN_MODELS = 50; // sanity floor; the leaderboard had 287 rows on 2026-11-19

  /**
   * What the native HTTP bridge has to send, besides a User-Agent and gzip support.
   * RSC: '1' selects the 560K-char flight body; without it the 1.43M-char HTML comes back
   * (parseAA accepts both). See aa.md section 1 for the header tests.
   */
  var SOURCES = {
    leaderboard: {
      url: ORIGIN + '/leaderboards/models',
      headers: { RSC: '1' },
    },
    detail: {
      url: ORIGIN + '/models',
      headers: { RSC: '1' },
    },
  };

  function now() {
    return typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  // --------------------------------------------------------------------------- flight extraction

  /** End (exclusive) of the double-quoted string literal that starts at text[start], or -1. */
  function stringLiteralEnd(text, start) {
    var n = text.length;
    for (var i = start + 1; i < n; i++) {
      var c = text.charCodeAt(i);
      if (c === 92) i++; // backslash: skip the escaped char
      else if (c === 34) return i + 1;
    }
    return -1;
  }

  /** True if the first non-whitespace char is '<' (an HTML document). No regex on the big string. */
  function looksLikeHtml(body) {
    var n = Math.min(body.length, 2048);
    for (var i = 0; i < n; i++) {
      var c = body.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xfeff) continue;
      return c === 60;
    }
    return false;
  }

  /** HTML -> concatenated `self.__next_f.push([1,"..."])` chunks. Flight body -> itself. */
  function toFlight(body) {
    if (!looksLikeHtml(body)) return { flight: body, kind: 'rsc', chunks: 0 };
    var marker = 'self.__next_f.push([1,';
    var parts = [];
    var pos = 0;
    for (;;) {
      var i = body.indexOf(marker, pos);
      if (i < 0) break;
      var q = i + marker.length;
      if (body.charCodeAt(q) !== 34) { pos = q; continue; }
      var end = stringLiteralEnd(body, q);
      if (end < 0) break;
      try {
        parts.push(JSON.parse(body.slice(q, end)));
      } catch (e) { /* ignore one malformed chunk */ }
      pos = end;
    }
    return { flight: parts.join(''), kind: 'html', chunks: parts.length };
  }

  /** End (exclusive) of the JSON array/object starting at text[start] ('[' or '{'), string-aware. -1 if unbalanced. */
  function jsonValueEnd(text, start) {
    var depth = 0;
    var n = text.length;
    for (var i = start; i < n; i++) {
      var c = text.charCodeAt(i);
      if (c === 34) {
        var e = stringLiteralEnd(text, i);
        if (e < 0) return -1;
        i = e - 1;
      } else if (c === 91 || c === 123) {
        depth++;
      } else if (c === 93 || c === 125) {
        if (--depth === 0) return i + 1;
      }
    }
    return -1;
  }

  /**
   * React flight encodes some values as "$..." strings. Normalise in place:
   *   "$undefined" -> null, "$$text" -> "$text" (escaped literal), "$D<iso>" -> iso string,
   *   any other "$..." (reference to another row) -> null, counted in stats.unresolvedRefs.
   */
  function reviveFlight(value, stats) {
    if (typeof value === 'string') {
      if (value.charCodeAt(0) !== 36) return value;
      if (value === '$undefined') return null;
      if (value.charCodeAt(1) === 36) return value.slice(1);
      if (value.charCodeAt(1) === 68) return value.slice(2);
      stats.unresolvedRefs++;
      return null;
    }
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) value[i] = reviveFlight(value[i], stats);
    } else if (value && typeof value === 'object') {
      var keys = Object.keys(value);
      for (var k = 0; k < keys.length; k++) value[keys[k]] = reviveFlight(value[keys[k]], stats);
    }
    return value;
  }

  /** Every JSON array that is the value of `"key":[` in the flight text. */
  function arraysByKey(flight, key, stats) {
    var needle = '"' + key + '":[';
    var out = [];
    var pos = 0;
    for (;;) {
      var i = flight.indexOf(needle, pos);
      if (i < 0) break;
      var start = i + needle.length - 1;
      var end = jsonValueEnd(flight, start);
      pos = start + 1;
      if (end < 0) continue;
      try {
        var arr = JSON.parse(flight.slice(start, end));
        if (Array.isArray(arr)) out.push(reviveFlight(arr, stats));
      } catch (e) { /* not JSON, skip */ }
    }
    return out;
  }

  function looksLikeModelRow(o) {
    return Boolean(
      o && typeof o === 'object' && typeof o.name === 'string' && 'intelligenceIndex' in o &&
      ('contextWindowTokens' in o || 'price1mInputTokens' in o || 'isReasoning' in o)
    );
  }

  function modelRowCount(arr) {
    var n = 0;
    for (var i = 0; i < arr.length; i++) if (looksLikeModelRow(arr[i])) n++;
    return n;
  }

  function largest(arrays) {
    var best = null;
    for (var i = 0; i < arrays.length; i++) if (!best || arrays[i].length > best.length) best = arrays[i];
    return best;
  }

  /**
   * Primary: the `initialModels` prop. Fallback (prop renamed): scan every `"<key>":[{` array
   * and take the one with the most model-like rows.
   */
  function findModelRows(flight, stats) {
    var best = null;
    var bestScore = 0;
    var named = arraysByKey(flight, 'initialModels', stats);
    for (var i = 0; i < named.length; i++) {
      var s = modelRowCount(named[i]);
      if (s > bestScore) { best = { rows: named[i], via: 'key:initialModels' }; bestScore = s; }
    }
    if (best) return best;

    var marker = '":[{';
    var pos = 0;
    for (;;) {
      var m = flight.indexOf(marker, pos);
      if (m < 0) break;
      pos = m + marker.length;
      var start = m + 2;
      var end = jsonValueEnd(flight, start);
      if (end < 0 || end - start < 2000) continue;
      var ks = m;
      while (ks > 0 && flight.charCodeAt(ks - 1) !== 34 && m - ks < 64) ks--;
      var key = flight.slice(ks, m);
      try {
        var arr = JSON.parse(flight.slice(start, end));
        var sc = modelRowCount(arr);
        if (sc > bestScore) { best = { rows: reviveFlight(arr, stats), via: 'shape:' + key }; bestScore = sc; }
      } catch (e) { /* skip */ }
    }
    return best;
  }

  // --------------------------------------------------------------------------- normalisation

  function numOrNull(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function strOrNull(v) { return typeof v === 'string' && v.length ? v : null; }
  function boolOrNull(v) { return typeof v === 'boolean' ? v : null; }
  function round(v, d) {
    if (v === null) return null;
    var p = Math.pow(10, d === undefined ? 4 : d);
    return Math.round(v * p) / p;
  }
  function get(o, path) {
    var parts = path.split('.');
    var cur = o;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  /** First non-null value among several dotted paths (tolerates AA moving a field). */
  function pick(o, paths) {
    for (var i = 0; i < paths.length; i++) {
      var v = get(o, paths[i]);
      if (v !== undefined && v !== null) return v;
    }
    return null;
  }
  function absUrl(p) {
    if (typeof p !== 'string' || !p) return null;
    if (p.indexOf('http') === 0) return p;
    return ORIGIN + (p.charAt(0) === '/' ? p : '/img/logos/' + p);
  }
  /** "humanitys-last-exam" -> "evalHumanitysLastExam" */
  function evalKey(slug) {
    var words = slug.split(/[^A-Za-z0-9]+/);
    var out = 'eval';
    for (var i = 0; i < words.length; i++) {
      if (words[i]) out += words[i].charAt(0).toUpperCase() + words[i].slice(1);
    }
    return out;
  }
  function modalities(d, prefix) {
    if (!d) return null;
    var names = ['Text', 'Image', 'Speech', 'Video'];
    var out = [];
    for (var i = 0; i < names.length; i++) {
      if (d[prefix + 'Modality' + names[i]] === true) out.push(names[i].toLowerCase());
    }
    return out.length ? out : null;
  }

  function normalise(rows, releases, detailRows, flight) {
    var i;
    var releaseBySlug = {};
    if (releases) for (i = 0; i < releases.length; i++) if (releases[i] && releases[i].slug) releaseBySlug[releases[i].slug] = releases[i];
    var detailById = {};
    var countryByCreator = {};
    if (detailRows) {
      for (i = 0; i < detailRows.length; i++) {
        var dr = detailRows[i];
        if (!dr) continue;
        if (dr.id) detailById[dr.id] = dr;
        if (dr.creator && dr.creator.name && dr.creator.country) countryByCreator[dr.creator.name] = dr.creator.country;
      }
    }

    // union of eval slugs, so every model object has the same keys
    var slugSet = {};
    for (i = 0; i < rows.length; i++) {
      var sc = rows[i] && rows[i].scores;
      if (sc && typeof sc === 'object') for (var k in sc) if (Object.prototype.hasOwnProperty.call(sc, k)) slugSet[k] = true;
    }
    var evalSlugs = Object.keys(slugSet).sort();

    var models = [];
    for (i = 0; i < rows.length; i++) {
      var m = rows[i];
      if (!m || typeof m !== 'object') continue;
      var slug = pick(m, ['release.slug', 'slug']);
      var rel = (slug && releaseBySlug[slug]) || null;
      var d = (m.id && detailById[m.id]) || null;
      var relCreator = (rel && rel.creator) || null;
      var dCreator = (d && d.creator) || null;
      var creatorName = pick(m, ['modelCreatorName', 'creator.name']) || (relCreator && relCreator.name) || null;
      var pIn = numOrNull(pick(m, ['price1mInputTokens', 'pricing.price1mInputTokens']));
      var pOut = numOrNull(pick(m, ['price1mOutputTokens', 'pricing.price1mOutputTokens']));
      var caps = (d && d.capabilities) || null;
      var tok = (d && d.canonicalIntelligenceIndexTokenCount) || null;

      var out = {
        // identity
        id: strOrNull(m.id),
        name: strOrNull(m.name),
        shortName: strOrNull(m.shortName),
        variant: strOrNull(m.suffix),
        slug: strOrNull(slug),
        releaseName: strOrNull(pick(m, ['release.name'])) || (rel && strOrNull(rel.name)) || null,
        url: slug ? ORIGIN + '/models/' + slug : null,
        // creator
        creatorName: strOrNull(creatorName),
        creatorSlug: (relCreator && strOrNull(relCreator.slug)) || (dCreator && strOrNull(dCreator.slug)) || null,
        creatorCountry: (dCreator && strOrNull(dCreator.country)) || (creatorName && countryByCreator[creatorName]) || null,
        creatorLogoUrl: absUrl(pick(m, ['modelCreatorLogo', 'creator.logo']) || (relCreator && relCreator.logo)),
        creatorColor: strOrNull(pick(m, ['modelCreatorColor', 'creator.color'])),
        // metadata
        releaseDate: (rel && strOrNull(rel.releaseDate)) || (d && strOrNull(d.releaseDate)) || null,
        isReasoning: boolOrNull(pick(m, ['isReasoning', 'reasoningModel'])),
        isOpenWeights: boolOrNull(m.isOpenWeights),
        deprecated: boolOrNull(m.deprecated),
        sizeClass: strOrNull(pick(m, ['paramClass', 'sizeClass'])),
        priceClass: strOrNull(pick(m, ['priceClass', 'pricing.priceClass'])),
        contextWindowTokens: numOrNull(pick(m, ['contextWindowTokens', 'features.contextWindowTokens'])),
        // headline indices
        intelligenceIndex: numOrNull(m.intelligenceIndex),
        intelligenceRank: null, // filled below
        omniscienceIndex: numOrNull(m.omniscience),
        costPerTaskUsd: numOrNull(pick(m, ['intelligenceIndexCostPerTask', 'intelligenceIndexCostPerTask.cost.total', 'pricing.costPerTask'])),
        timePerTaskSeconds: numOrNull(pick(m, ['intelligenceIndexTimePerTask', 'performance.intelligenceIndexTimePerTask'])),
        // pricing, USD per 1M tokens
        priceInputPer1M: pIn,
        priceOutputPer1M: pOut,
        priceBlended3to1Per1M: pIn !== null && pOut !== null ? round((3 * pIn + pOut) / 4) : null, // derived here
        priceCacheReadPer1M: numOrNull(pick(m, ['cacheHitPrice', 'pricing.cacheHitPrice'])),
        priceCacheWritePer1M: numOrNull(pick(m, ['cacheWritePrice', 'pricing.cacheWritePrice'])),
        // performance
        outputTokensPerSecond: numOrNull(pick(m, ['outputSpeed', 'headline.outputSpeed', 'performance.outputSpeed'])),
        timeToFirstTokenSeconds: numOrNull(pick(m, ['timeToFirstToken', 'headline.timeToFirstToken', 'performance.timeToFirstToken'])),
        timeToFirstAnswerTokenSeconds: numOrNull(pick(m, ['timeToFirstAnswerToken', 'headline.timeToFirstAnswerToken', 'performance.timeToFirstAnswerToken'])),
        // enrichment from /models (only the ~28 featured models; null elsewhere)
        hasDetail: Boolean(d),
        effortLevel: d && d.effort ? strOrNull(d.effort.label) : null,
        knowledgeCutoffDate: d ? strOrNull(d.knowledgeCutoffDate) : null,
        openSourceCategory: d ? strOrNull(d.openSourceCategorization) : null,
        licenseName: d ? strOrNull(d.licenseName) : null,
        licenseUrl: d ? strOrNull(d.licenseUrl) : null,
        weightsUrl: d ? strOrNull(d.modelWeightsSourceUrl) : null,
        parameterCountBillions: d ? numOrNull(d.parameters) : null,
        activeParameterCountBillions: d ? numOrNull(d.inferenceParametersActiveBillions) : null,
        inputModalities: modalities(d, 'input'),
        outputModalities: modalities(d, 'output'),
        providerNames: d && Array.isArray(d.hosts)
          ? d.hosts.map(function (h) { return h && h.name; }).filter(Boolean)
          : null,
        opennessIndex: d && d.openness ? numOrNull(d.openness.opennessIndex) : null,
        capabilityFinanceAndAccountingIndex: caps ? numOrNull(caps.financeAndAccounting) : null,
        capabilityStrategyAndOpsIndex: caps ? numOrNull(caps.strategyAndOps) : null,
        capabilityLegalIndex: caps ? numOrNull(caps.legal) : null,
        capabilityHealthcareAndMedicalIndex: caps ? numOrNull(caps.healthcareAndMedical) : null,
        capabilityEngineeringIndex: caps ? numOrNull(caps.engineering) : null,
        capabilityEconomicsIndex: caps ? numOrNull(caps.economics) : null,
        indexCostTotalUsd: d && d.intelligenceIndexCost ? numOrNull(d.intelligenceIndexCost.total) : null,
        indexInputTokens: tok ? numOrNull(tok.input) : null,
        indexOutputTokens: tok ? numOrNull(tok.output) : null,
        indexReasoningTokens: tok ? numOrNull(tok.reasoning) : null,
      };
      // individual evaluation scores, flattened (raw AA value: fraction 0..1, or Elo for a few)
      var scores = m.scores && typeof m.scores === 'object' ? m.scores : null;
      for (var e = 0; e < evalSlugs.length; e++) {
        out[evalKey(evalSlugs[e])] = scores ? numOrNull(scores[evalSlugs[e]]) : null;
      }
      models.push(out);
    }

    // rank by Intelligence Index (1 = best), only among models that have one
    var ranked = models.filter(function (x) { return x.intelligenceIndex !== null; });
    ranked.sort(function (a, b) { return b.intelligenceIndex - a.intelligenceIndex; });
    for (i = 0; i < ranked.length; i++) ranked[i].intelligenceRank = i + 1;

    // eval catalogue: key <-> AA slug <-> display name, scale, coverage
    var evalNames = {};
    var nameRe = /\{"slug":"([a-z0-9-]+)","name":"((?:[^"\\]|\\.)*)","keywords"/g;
    var mm;
    while ((mm = nameRe.exec(flight))) {
      try { evalNames[mm[1]] = JSON.parse('"' + mm[2] + '"'); } catch (err) { /* ignore */ }
    }
    var evals = evalSlugs.map(function (slug) {
      var key = evalKey(slug);
      var count = 0;
      var min = null;
      var max = null;
      for (var j = 0; j < models.length; j++) {
        var v = models[j][key];
        if (v === null) continue;
        count++;
        if (min === null || v < min) min = v;
        if (max === null || v > max) max = v;
      }
      return {
        key: key,
        slug: slug,
        name: evalNames[slug] || evalNames[slug.replace(/-normalized$/, '')] || null,
        scale: max !== null && max > 1.5 ? 'elo' : 'fraction', // heuristic: fractions are 0..1
        count: count,
        min: round(min),
        max: round(max),
      };
    });

    return { models: models, evals: evals };
  }

  // --------------------------------------------------------------------------- validation

  function validate(models, stats) {
    var warnings = [];
    var n = models.length;
    function share(f) { return n ? models.filter(f).length / n : 0; }
    var ids = {};
    var dup = false;
    for (var i = 0; i < n; i++) {
      var id = models[i].id;
      if (!id || ids[id]) dup = true;
      ids[id] = true;
    }
    if (share(function (m) { return m.name; }) < 0.99) warnings.push('some models have no name');
    if (dup) warnings.push('duplicate or missing model ids');
    if (share(function (m) { return m.intelligenceIndex !== null; }) < 0.2) warnings.push('intelligenceIndex present on < 20% of models');
    if (models.some(function (m) { return m.intelligenceIndex !== null && (m.intelligenceIndex < 0 || m.intelligenceIndex > 100); }))
      warnings.push('intelligenceIndex outside 0..100 (scale changed?)');
    if (share(function (m) { return m.priceInputPer1M !== null; }) < 0.3) warnings.push('input price present on < 30% of models');
    if (share(function (m) { return m.outputTokensPerSecond !== null; }) < 0.3) warnings.push('output speed present on < 30% of models');
    if (share(function (m) { return m.contextWindowTokens !== null; }) < 0.5) warnings.push('context window present on < 50% of models');
    if (share(function (m) { return m.releaseDate !== null; }) < 0.5) warnings.push('release date join (releases[]) matched < 50% of models');
    if (stats.unresolvedRefs) warnings.push(stats.unresolvedRefs + ' unresolved React flight "$" references were nulled');
    return warnings;
  }

  // --------------------------------------------------------------------------- entry point

  function emptyResult(error, message, t0, extra) {
    var meta = {
      modelCount: 0, detailCount: 0, intelligenceIndexVersion: null, payloadKind: null,
      tableFoundVia: null, parseMs: Math.round((now() - t0) * 10) / 10, warnings: [],
    };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) meta[k] = extra[k];
    return { ok: false, error: error, errorMessage: message, models: [], evals: [], meta: meta };
  }

  /**
   * @param {string} text  body of /leaderboards/models (flight payload or full HTML)
   * @param {{detailText?: string, minModels?: number}} [options]
   */
  function parseAA(text, options) {
    var t0 = now();
    var opts = options || {};
    var minModels = typeof opts.minModels === 'number' ? opts.minModels : MIN_MODELS;
    try {
      if (typeof text !== 'string' || text.length < 100) {
        return emptyResult('EMPTY_INPUT', 'response body is empty or not a string', t0);
      }
      var stats = { unresolvedRefs: 0 };
      var warnings = [];

      var f = toFlight(text);
      var found = findModelRows(f.flight, stats);
      if (!found) {
        return emptyResult('PARSE_FAILED', 'no model table found in the page payload (page structure changed, or a block page was returned)', t0, { payloadKind: f.kind });
      }
      if (found.via !== 'key:initialModels') warnings.push('model table found by shape, not by key (' + found.via + ')');

      var releases = largest(arraysByKey(f.flight, 'releases', stats));
      if (!releases) warnings.push('releases[] not found: releaseDate / creatorSlug will be null');
      var vm = /Artificial Analysis Intelligence Index v(\d+(?:\.\d+)*)/.exec(f.flight);
      var iiVersion = vm ? vm[1] : null;

      var detailRows = null;
      if (typeof opts.detailText === 'string' && opts.detailText.length > 100) {
        try {
          var df = toFlight(opts.detailText).flight;
          var candidates = arraysByKey(df, 'initialModels', stats).filter(function (a) {
            return a.some(function (o) { return o && o.creator && 'intelligenceIndex' in o; });
          });
          detailRows = largest(candidates);
          if (!detailRows) warnings.push('enrichment: no detailed model rows found in detailText');
        } catch (e) {
          warnings.push('enrichment failed: ' + (e && e.message));
        }
      }

      var norm = normalise(found.rows, releases, detailRows, f.flight);
      var all = warnings.concat(validate(norm.models, stats));
      var tooFew = norm.models.length < minModels;
      return {
        ok: !tooFew,
        error: tooFew ? 'TOO_FEW_MODELS' : null,
        errorMessage: tooFew ? 'only ' + norm.models.length + ' models parsed (expected >= ' + minModels + ')' : null,
        models: norm.models,
        evals: norm.evals,
        meta: {
          modelCount: norm.models.length,
          detailCount: detailRows ? detailRows.length : 0,
          intelligenceIndexVersion: iiVersion,
          payloadKind: f.kind,
          tableFoundVia: found.via,
          parseMs: Math.round((now() - t0) * 10) / 10,
          warnings: all,
        },
      };
    } catch (err) {
      return emptyResult('EXCEPTION', String((err && err.message) || err), t0);
    }
  }

  var api = { parseAA: parseAA, SOURCES: SOURCES, ORIGIN: ORIGIN, MIN_MODELS: MIN_MODELS };
  root.AAParse = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
