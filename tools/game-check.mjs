#!/usr/bin/env node
/* tools/game-check.mjs — 《残响协议》数据契约自检：地图尺寸、交互点、对白引用、剧情标记、角色技能、美术清单。
   只读：仅加载数据文件求值，不写任何文件。用法：node tools/game-check.mjs [--verbose] */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// --root DIR 只用于验收演练（在临时副本上验证校验器是否真的会红），默认就是仓库根
const ROOT_ARG = (() => { const i = process.argv.indexOf('--root'); return i >= 0 ? process.argv[i + 1] : null; })();
const ROOT = ROOT_ARG ? path.resolve(ROOT_ARG) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'web/game/data');
const VERBOSE = process.argv.includes('--verbose');

const errors = [];
const ENTRY_NODES = [];
const warns = [];
const fail = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// 在 Node 里模拟浏览器全局，直接求值数据文件（无依赖、无 ESM 语法）
function loadData() {
  const win = {};
  // 顺序即浏览器加载顺序：roster-source 先于 characters（后者依赖 GD.derive）
  for (const f of ['roster-source.js', 'world.js', 'characters.js', 'dialog.js', 'quests.js', 'progress.js']) {
    const file = path.join(DATA, f);
    if (!fs.existsSync(file)) { fail(`缺少数据文件 web/game/data/${f}`); continue; }
    const src = fs.readFileSync(file, 'utf8');
    if (/^\s*(import|export)\s/m.test(src)) fail(`${f}: 数据文件不得使用 import/export`);
    if (/\.\?\.|\.\?\.\?/.test(src)) warn(`${f}: 出现可选链，与项目 ES2019 风格不一致`);
    try { new Function('window', src)(win); } catch (e) { fail(`${f}: 求值失败 ${e.message}`); }
  }
  return win.GameData || {};
}

const GD = loadData();
const W = GD.world;

if (!W) fail('world.js 未挂载 GameData.world');
else {
  const { cols, rows, tile } = W;
  if (cols !== 24 || rows !== 14) fail(`world 尺寸应为 24×14，实际 ${cols}×${rows}`);
  if (tile !== 16) fail(`world.tile 应为 16，实际 ${tile}`);

  const WALK_BLOCK = new Set(['#', 'T', '~', 'X']);
  const isWalk = (mapId, x, y) => {
    const m = W.maps[mapId];
    if (!m) return false;
    if (y < 0 || y >= rows || x < 0 || x >= cols) return false;
    const t = m.ascii[y][x];
    if (WALK_BLOCK.has(t)) return false;
    return !m.decor.some((d) => d.blocks && d.x === x && d.y === y);
  };

  for (const [id, m] of Object.entries(W.maps)) {
    if (m.ascii.length !== rows) fail(`${id}: 行数 ${m.ascii.length} ≠ ${rows}`);
    m.ascii.forEach((row, y) => {
      if (row.length !== cols) fail(`${id}: 第 ${y} 行长度 ${row.length} ≠ ${cols}`);
      [...row].forEach((ch, x) => {
        if (!'.,#X T~=scD'.replace(' ', '').includes(ch)) fail(`${id}: 未知图块 '${ch}' at ${x},${y}`);
      });
    });

    // 交互点必须落在 s 或 c 上，且 s/c 必须有对应交互点
    const marks = new Set();
    m.ascii.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 's' || ch === 'c') marks.add(x + ',' + y); }));
    const used = new Set();
    (m.interactables || []).forEach((it) => {
      const k = it.x + ',' + it.y;
      const ch = m.ascii[it.y] && m.ascii[it.y][it.x];
      if (ch !== 's' && ch !== 'c') fail(`${id}/${it.id}: 交互点坐标 ${k} 图块是 '${ch}'，应为 s 或 c`);
      if (used.has(k)) fail(`${id}: 坐标 ${k} 有重复交互点`);
      used.add(k);
      if (!GD.dialog || !GD.dialog[it.dialog]) fail(`${id}/${it.id}: 对白节点 ${it.dialog} 不存在`);
      if (it.flag && (!GD.flags || !GD.flags[it.flag])) fail(`${id}/${it.id}: 剧情标记 ${it.flag} 未在 GD.flags 登记`);
      if (!it.id.startsWith((m.prefix || '') + '.')) fail(`${id}/${it.id}: id 应以地图前缀 ${m.prefix}. 开头`);
    });
    m.ascii.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === 's' && !used.has(x + ',' + y)) fail(`${id}: 交互点图块 ${x},${y} 没有 interactables 条目`);
    }));

    if (m.onEnter) {
      if (!GD.dialog || !GD.dialog[m.onEnter]) fail(`${id}: onEnter 对白 ${m.onEnter} 不存在`);
      else if (!ENTRY_NODES.includes(m.onEnter)) ENTRY_NODES.push(m.onEnter);
    }
    if (m.boss) {
      if (GD.enemies && !GD.enemies[m.boss.id]) fail(`${id}: boss ${m.boss.id} 不存在`);
      if (!GD.flags || !GD.flags[m.boss.triggerFlag]) fail(`${id}: boss.triggerFlag ${m.boss.triggerFlag} 未登记`);
    }
    // 门必须有 transitions，transitions 必须落在 D 上且目标可站
    const doors = new Set();
    m.ascii.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'D') doors.add(x + ',' + y); }));
    const doorUsed = new Set();
    (m.transitions || []).forEach((t) => {
      const k = (t.x === undefined ? '' : t.x + ',' + t.y);
      if (m.ascii[t.y] && m.ascii[t.y][t.x] !== 'D') fail(`${id}: 切换点 ${t.x},${t.y} 不是门`);
      doorUsed.add(k);
      if (!W.maps[t.to]) fail(`${id}: 切换目标地图 ${t.to} 不存在`);
      else {
        const tc = W.maps[t.to].ascii[t.ty] && W.maps[t.to].ascii[t.ty][t.tx];
        if (!isWalk(t.to, t.tx, t.ty)) fail(`${id} → ${t.to}: 落点 ${t.tx},${t.ty} 不可站立（图块 '${tc}'）`);
      }
      if (!['up', 'down', 'left', 'right'].includes(t.dir)) fail(`${id}: 切换方向非法 ${t.dir}`);
    });
    doors.forEach((d) => { if (!doorUsed.has(d)) fail(`${id}: 门 ${d} 没有 transitions`); });

    (m.decor || []).forEach((d) => {
      if (!isWalk(id, d.x, d.y) && !d.blocks) warn(`${id}: 装饰 ${d.x},${d.y} 叠在不可走格上`);
    });
  }

  // 出生点可站
  if (!isWalk(W.spawn.map, W.spawn.x, W.spawn.y)) fail('出生点不可站立');

  // 区域与地图一致
  (W.regions || []).forEach((r) => {
    if (r.open && !W.maps[r.id]) fail(`区域 ${r.id} 标记 open 但没有地图`);
    if (r.open === false && W.maps[r.id]) fail(`区域 ${r.id} 标记未开放但有地图`);
  });
}

// ---------- 角色与技能 ----------
const cast = GD.cast || {};
const skills = GD.skills || {};
const enemies = GD.enemies || {};
const npc = GD.npc || {};

for (const [id, c] of Object.entries(cast)) {
  if (c.id !== id) fail(`cast.${id}: 内部 id 不一致（${c.id}）`);
  (c.skills || []).forEach((s) => { if (!skills[s]) fail(`cast.${id}: 技能 ${s} 不存在`); });
  const st = c.stats || {};
  for (const k of ['hp', 'atk', 'def', 'spd', 'slots', 'quota', 'quotaRegen']) {
    if (typeof st[k] !== 'number' || st[k] <= 0) fail(`cast.${id}: stats.${k} 缺失或非正数`);
  }
  if (st.slots < 3 || st.slots > 8) warn(`cast.${id}: slots=${st.slots} 超出建议区间 3–8`);
  if (st.quota < 1) fail(`cast.${id}: stats.quota 必须 ≥1`);
  if (st.quotaRegen < 1 || st.quotaRegen > st.quota) fail(`cast.${id}: quotaRegen 必须在 1..quota 之间`);
  for (const k of ['sprite', 'portrait']) if (!c[k]) fail(`cast.${id}: 缺少 ${k}`);
  if (!/^(pc|npc)_/.test(c.sprite || '')) fail(`cast.${id}: sprite 命名应为 pc_/npc_ 前缀`);
  if (!/^pt_/.test(c.portrait || '')) fail(`cast.${id}: portrait 命名应为 pt_ 前缀`);
}
for (const [id, s] of Object.entries(skills)) {
  if (s.id !== id) fail(`skills.${id}: 内部 id 不一致`);
  if (!['self', 'ally', 'enemy', 'party', 'field'].includes(s.scope)) fail(`skills.${id}: scope 非法 ${s.scope}`);
  if (typeof s.slot !== 'number' || s.slot < 1) fail(`skills.${id}: slot 占位非法`);
}
Object.entries(enemies).forEach(([id, e]) => {
  if (e.id !== id) fail(`enemies.${id}: 内部 id 不一致`);
  if (!e.intel) fail(`enemies.${id}: 缺少 intel（情报槽文本）`);
  if (e.boss && !(e.phases && e.phases.length)) warn(`enemies.${id}: 首领未定义 phases`);
  (e.phases || []).forEach((p, i) => {
    if (i > 0 && !(p.at < e.phases[i - 1].at)) fail(`enemies.${id}: phases 阈值必须递减`);
  });
});
Object.entries(npc).forEach(([id, n]) => { if (n.id !== id) fail(`npc.${id}: 内部 id 不一致`); });

// 名册唯一
const roster = GD.roster || [];
const seenRoster = new Set();
roster.forEach((r, i) => {
  if (!r.id || seenRoster.has(r.id)) fail(`roster[${i}]: id 重复或缺失`);
  seenRoster.add(r.id);
  if (cast[r.id] || npc[r.id]) fail(`roster[${i}]: id ${r.id} 与主角/重要 NPC 冲突`);
});
if (roster.length < 10) warn(`roster 仅 ${roster.length} 条，首期目标 ≥10`);

// 队伍顺序覆盖
(GD.partyOrder || []).forEach((id) => { if (!cast[id]) fail(`partyOrder: 未知角色 ${id}`); });

// ---------- 对白 ----------
const dialog = GD.dialog || {};
const items = GD.items || {};
const flagKeys = new Set(Object.keys(GD.flags || {}));
const ops = new Set(['flag', 'item', 'party', 'slot', 'quota', 'battle', 'chapter']);

for (const [id, d] of Object.entries(dialog)) {
  if (!d.lines || !d.lines.length) fail(`dialog.${id}: 缺少 lines`);
  if (d.choices) {
    if (!Array.isArray(d.choices) || d.choices.length < 2) fail(`dialog.${id}: choices 至少 2 项`);
    (d.choices || []).forEach((c) => {
      if (!c.text || !c.go) fail(`dialog.${id}: 选项缺 text/go`);
      else if (!dialog[c.go]) fail(`dialog.${id}: 选项跳转到不存在的节点 ${c.go}`);
    });
    if (d.next) fail(`dialog.${id}: 同时存在 choices 与 next`);
  }
  if (d.next && !dialog[d.next]) fail(`dialog.${id}: next 指向不存在的节点 ${d.next}`);
  (d.onEnd || []).forEach((o) => {
    if (!ops.has(o.op)) fail(`dialog.${id}: 未知 onEnd 指令 ${o.op}`);
    if (o.op === 'flag' && !flagKeys.has(o.key)) fail(`dialog.${id}: 标记 ${o.key} 未在 GD.flags 登记`);
    if (o.op === 'item' && !items[o.id]) fail(`dialog.${id}: 道具 ${o.id} 不存在`);
    if (o.op === 'battle' && !enemies[o.id]) fail(`dialog.${id}: 战斗 ${o.id} 不存在`);
    if (o.op === 'party' && !cast[o.who]) fail(`dialog.${id}: 入队角色 ${o.who} 不存在`);
    if (o.op === 'slot' && !cast[o.who]) fail(`dialog.${id}: slot 目标 ${o.who} 不存在`);
    if (o.op === 'slot' && (typeof o.n !== 'number' || o.n < 1)) fail(`dialog.${id}: slot.n 非法`);
    if (o.op === 'quota' && !cast[o.who]) fail(`dialog.${id}: quota 目标 ${o.who} 不存在`);
    if (o.op === 'quota' && (typeof o.n !== 'number' || o.n < 1)) fail(`dialog.${id}: quota.n 非法`);
  });
  if (d.portrait && !/^pt_/.test(d.portrait)) fail(`dialog.${id}: portrait 命名应为 pt_ 前缀`);
  if (d.portrait) {
    const owner = Object.values(cast).concat(Object.values(npc)).find((c) => c.portrait === d.portrait);
    if (!owner) fail(`dialog.${id}: 立绘 ${d.portrait} 未在角色表中声明`);
  }
}

// 不可达节点（除入口外每个节点都应被引用或被引擎显式调用）
const referenced = new Set();
Object.values(dialog).forEach((d) => {
  if (d.next) referenced.add(d.next);
  (d.choices || []).forEach((c) => referenced.add(c.go));
});
const ENTRIES = new Set(['d_wake', 'd_colonnade_enter', 'd_boss_intro', 'd_boss_defeat', 'd_slot_tutorial']);
// 地图交互点直接调用的节点也算入口（地图进入点、首领、教学）
(W && Object.values(W.maps) || []).forEach((m) => (m.interactables || []).forEach((it) => ENTRIES.add(it.dialog)));
Object.keys(dialog).forEach((id) => {
  if (!referenced.has(id) && !ENTRIES.has(id) && !ENTRY_NODES.includes(id)) warn(`dialog.${id}: 未被任何节点引用，也不是入口`);
});

// ---------- 任务与章节 ----------
const quests = GD.quests || {};
for (const [id, q] of Object.entries(quests)) {
  if (q.id !== id) fail(`quests.${id}: 内部 id 不一致`);
  let prevStep = null;
  (q.steps || []).forEach((s) => {
    if (prevStep === s.id) fail(`quests.${id}: 步骤 id 重复`);
    prevStep = s.id;
    (s.flagsAll || []).concat(s.flagsAny || []).forEach((f) => {
      if (!flagKeys.has(f)) fail(`quests.${id}/${s.id}: 标记 ${f} 未登记`);
    });
    if (!s.flagsAll && !s.flagsAny) fail(`quests.${id}/${s.id}: 缺少完成条件`);
  });
}

const budget = GD.chapterBudget || {};
if (!(budget.min >= 15 && budget.max <= 30)) fail('chapterBudget 必须落在 15–30 分钟');
const flow = GD.chapterFlow || [];
const flowSum = flow.reduce((a, b) => a + (b.minutes || 0), 0);
if (flowSum < 15 || flowSum > 30) fail(`chapterFlow 合计 ${flowSum} 分钟，超出 15–30`);
if (flow.length < 5) warn('chapterFlow 段落过少');

const policy = GD.battlePolicy || {};
if (!policy.manualEncounters || !policy.manualEncounters.includes('devourer')) fail('battlePolicy: 首领必须手动');
(policy.autoEncounters || []).forEach((t) => { if (W && W.maps && !W.maps[t]) fail(`battlePolicy: 未知遭遇表 ${t}`); });
(W && Object.values(W.maps) || []).forEach((m) => {
  if (m.encounters && policy.autoEncounters && !policy.autoEncounters.includes(m.encounters.table)) {
    fail(`${m.name}: 遇敌表 ${m.encounters.table} 未在 autoEncounters 声明`);
  }
});

// ---------- 标记登记完整性 ----------
Object.entries(GD.flags || {}).forEach(([k, v]) => {
  if (!/^ch\d+\./.test(k)) fail(`flags.${k}: 命名应为 ch<章>.<域>.<事>`);
  if (!v.text) fail(`flags.${k}: 缺少 text`);
});

// ---------- 榜单来源：可复算映射 ----------
const picks = GD.modelPicks || {};
const derive = GD.derive || {};
const snap = GD.snapshot || {};
const agg = snap.aggregates || {};

if (!Object.keys(picks).length) fail('roster-source.js 未定义 GD.modelPicks');
if (!derive.llm || !derive.media) fail('roster-source.js 未定义 GD.derive.llm / GD.derive.media');
if (!(agg.intMax > agg.intMin)) fail('snapshot.aggregates.intMax 必须大于 intMin');
if (!(agg.tpsMax > 0)) fail('snapshot.aggregates.tpsMax 缺失');

// 每个 cast 的 stats 必须能被 GD.derive 复算出来，禁止手写数值漂移
Object.entries(castSourceAll()).forEach(([cid, srcId]) => {
  const c = cast[cid];
  if (!c) return;
  const d = (derive.pick || (() => null))(srcId);
  if (!d) { fail(`cast.${cid}: 来源 ${srcId} 无法换算`); return; }
  ['hp', 'atk', 'def', 'spd', 'slots', 'quota', 'quotaRegen'].forEach((k) => {
    if (c.stats[k] !== d[k]) fail(`cast.${cid}.stats.${k}=${c.stats[k]}，按来源 ${srcId} 应为 ${d[k]}`);
  });
  if (!c.source || c.source !== srcId) fail(`cast.${cid}: source 应为 ${srcId}`);
  if (!c.community) warn(`cast.${cid}: 缺少 community 社区印象说明`);
  if (!c.fact) warn(`cast.${cid}: 缺少 fact 榜单事实说明`);
});
function castSourceAll() {
  return Object.entries(GD.castSource || {}).filter(([cid]) => cast[cid]);
}

// 每个 pick 必须绑定具体 slug（厂商名不足以定位条目）
Object.entries(picks).forEach(([id, p]) => {
  if (p.id !== id) fail(`modelPicks.${id}: 内部 id 不一致`);
  if (!p.slug) fail(`modelPicks.${id}: 缺少 slug`);
  if (!p.label) fail(`modelPicks.${id}: 缺少榜单条目名`);
  if (!p.impression) fail(`modelPicks.${id}: 缺少社区印象/产品侧说明`);
  if (p.kind === 'llm') {
    const b = p.bench || {};
    ['intelligenceIndex', 'intelligenceRank', 'contextWindowTokens', 'outputTokensPerSecond',
      'priceInputPer1M', 'priceOutputPer1M', 'priceBlended3to1Per1M'].forEach((k) => {
      if (typeof b[k] !== 'number') fail(`modelPicks.${id}: bench.${k} 缺失`);
    });
    if (b.intelligenceIndex != null && (b.intelligenceIndex < agg.intMin || b.intelligenceIndex > agg.intMax)) {
      fail(`modelPicks.${id}: intelligenceIndex 超出快照区间`);
    }
  } else if (p.kind === 'media') {
    const b = p.bench || {};
    ['elo', 'pricePerMinute'].forEach((k) => {
      if (typeof b[k] !== 'number') fail(`modelPicks.${id}: bench.${k} 缺失`);
    });
    if (!b.priceUnit) fail(`modelPicks.${id}: bench.priceUnit 缺失（视频按分钟计费，必须标单位）`);
    if (b.intelligenceIndex != null) fail(`modelPicks.${id}: 视频模型不得借用 intelligenceIndex`);
  } else fail(`modelPicks.${id}: kind 应为 llm 或 media`);
});

// 快照漂移：数据源缓存被更新后，此处摘录必须同步（只告警，不阻断）
const livePath = path.join(ROOT, 'web/seed/aa.json');
if (snap.llm && fs.existsSync(livePath)) {
  try {
    const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));
    if (live.fetchedAt && live.fetchedAt !== snap.llm.fetchedAt) {
      warn(`快照已更新（live=${live.fetchedAt}，摘录=${snap.llm.fetchedAt}），roster-source.js 数值可能过期`);
    }
  } catch (e) { warn('web/seed/aa.json 解析失败，跳过漂移检查：' + e.message); }
}

// ---------- 榜单事实：与 web/seed 逐项对账（不看文字，只看数字） ----------
const SEED_LLM = path.join(ROOT, 'web/seed/aa.json');
const SEED_T2V = path.join(ROOT, 'web/seed/aa_t2v.json');
let liveModels = null;
let liveRows = null;
try { liveModels = JSON.parse(fs.readFileSync(SEED_LLM, 'utf8')).data.models; } catch (e) { warn('读取 web/seed/aa.json 失败：' + e.message); }
try { liveRows = JSON.parse(fs.readFileSync(SEED_T2V, 'utf8')).data.rows; } catch (e) { warn('读取 web/seed/aa_t2v.json 失败：' + e.message); }

// 快照聚合值必须能从 live 复算（分母写错会让百分位整体失真）
if (liveModels) {
  const scored = liveModels.filter((m) => m.intelligenceIndex != null);
  const tps = liveModels.filter((m) => m.outputTokensPerSecond != null);
  const intMin = Math.min.apply(null, scored.map((m) => m.intelligenceIndex));
  const intMax = Math.max.apply(null, scored.map((m) => m.intelligenceIndex));
  const tpsMax = Math.max.apply(null, tps.map((m) => m.outputTokensPerSecond));
  if (liveModels.length !== snap.llm.modelCount) fail(`快照 modelCount 应为 ${liveModels.length}，摘录写 ${snap.llm.modelCount}`);
  if (scored.length !== snap.llm.scoredCount) fail(`快照已评分条目应为 ${scored.length}，摘录写 ${snap.llm.scoredCount}`);
  if (agg.scoredCount !== scored.length) fail(`aggregates.scoredCount 应为 ${scored.length}，写 ${agg.scoredCount}`);
  if (Math.abs(intMin - agg.intMin) > 1e-9) fail(`aggregates.intMin 应为 ${intMin}`);
  if (Math.abs(intMax - agg.intMax) > 1e-9) fail(`aggregates.intMax 应为 ${intMax}`);
  if (Math.abs(tpsMax - agg.tpsMax) > 1e-9) fail(`aggregates.tpsMax 应为 ${tpsMax}`);
}
if (liveRows) {
  const elos = liveRows.map((r) => r.elo);
  if (liveRows.length !== snap.media.rows) fail(`视频榜应为 ${liveRows.length} 行，摘录写 ${snap.media.rows}`);
  if (Math.min.apply(null, elos) !== agg.eloMin) fail(`aggregates.eloMin 应为 ${Math.min.apply(null, elos)}`);
  if (Math.max.apply(null, elos) !== agg.eloMax) fail(`aggregates.eloMax 应为 ${Math.max.apply(null, elos)}`);
}

// 禁用同义字段别名：只允许 bench
const BANNED_ALIAS = new Set(['record', 'records', 'metrics', 'stats_ref', 'benchmark']);
const walkKeys = (obj, trail, seen) => {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
  seen.add(obj);
  Object.keys(obj).forEach((k) => {
    if (BANNED_ALIAS.has(k)) fail(`${trail}.${k}: 同义字段别名，统一改用 bench`);
    walkKeys(obj[k], trail + '.' + k, seen);
  });
};
walkKeys(picks, 'modelPicks', new Set());

// 每个 pick 的数字必须与 web/seed 的那一条记录逐字段相等
Object.entries(picks).forEach(([id, pick]) => {
  const b = pick.bench || {};
  if (pick.kind === 'llm') {
    if (!liveModels) return;
    const hit = liveModels.filter((m) => m.name === pick.label);
    if (hit.length !== 1) { fail(`modelPicks.${id}: 榜单里名为「${pick.label}」的条目有 ${hit.length} 条，label 必须唯一`); return; }
    const m = hit[0];
    if (m.slug !== pick.slug) fail(`modelPicks.${id}: slug 应为 ${m.slug}，写 ${pick.slug}`);
    if (m.deprecated) fail(`modelPicks.${id}: 条目已 deprecated`);
    const expect = {
      intelligenceIndex: m.intelligenceIndex, intelligenceRank: m.intelligenceRank,
      contextWindowTokens: m.contextWindowTokens, outputTokensPerSecond: m.outputTokensPerSecond,
      priceInputPer1M: m.priceInputPer1M, priceOutputPer1M: m.priceOutputPer1M,
      priceBlended3to1Per1M: m.priceBlended3to1Per1M
    };
    Object.keys(expect).forEach((k) => {
      if (Math.abs((b[k] === undefined ? NaN : b[k]) - expect[k]) > 1e-9) fail(`modelPicks.${id}.bench.${k}=${b[k]}，快照为 ${expect[k]}`);
    });
    if (b.openWeights !== m.isOpenWeights) fail(`modelPicks.${id}: openWeights 与快照不一致`);
    if (b.releaseDate !== m.releaseDate) fail(`modelPicks.${id}: releaseDate 应为 ${m.releaseDate}`);
  } else if (pick.kind === 'media') {
    if (!liveRows) return;
    const hit = liveRows.filter((r) => r.id === pick.slug);
    if (hit.length !== 1) { fail(`modelPicks.${id}: 视频榜里 id ${pick.slug} 有 ${hit.length} 条`); return; }
    const r = hit[0];
    if (r.name !== pick.label) fail(`modelPicks.${id}: label 应为 ${r.name}`);
    if (b.elo !== r.elo) fail(`modelPicks.${id}.bench.elo=${b.elo}，快照为 ${r.elo}`);
    if (b.appearances !== r.appearances) fail(`modelPicks.${id}.bench.appearances=${b.appearances}，快照为 ${r.appearances}`);
    if (Math.abs(b.pricePerMinute - r.price) > 1e-9) fail(`modelPicks.${id}.bench.pricePerMinute=${b.pricePerMinute}，快照为 ${r.price}`);
    if (b.priceUnit !== r.priceUnit) fail(`modelPicks.${id}: priceUnit 应为 ${r.priceUnit}`);
    if (b.releaseDate !== r.rd) fail(`modelPicks.${id}: releaseDate 应为 ${r.rd}`);
    if (b.openWeights !== r.ow) fail(`modelPicks.${id}: openWeights 与快照不一致`);
    if (b.intelligenceIndex != null) fail(`modelPicks.${id}: 视频模型不得借用 intelligenceIndex`);
  }
});

// ---------- 技能费用：不得超过自身配额的一半 ----------
const skillBudget = GD.skillBudget || {};
Object.entries(cast).forEach(([cid, c]) => {
  const q = c.stats && c.stats.quota;
  if (!q) return;
  (c.skills || []).forEach((sid) => {
    const s = skills[sid];
    if (!s || s.cost === 0) return;
    if (s.cost > q / 2) fail(`cast.${cid}: 技能 ${sid} 费用 ${s.cost} 超过配额 ${q} 的一半`);
  });
  if (c.stats.quotaRegen > q * (GD.balance ? GD.balance.maxRegenRatio : 0.25)) {
    fail(`cast.${cid}: quotaRegen ${c.stats.quotaRegen} 超过配额 ${q} 的 ${(GD.balance ? GD.balance.maxRegenRatio : 0.25) * 100}%`);
  }
});
if (!GD.balance || !GD.balance.windows) fail('roster-source.js 未定义 GD.balance.windows（给 t4 的回合窗口预算）');
if (!skillBudget.rule) fail('characters.js 未定义 GD.skillBudget.rule');

// ---------- 技能回合循环账：12 个技能必须逐条对应真实技能与真实费用，窗口配额由 GD.derive 复算 ----------
const perSkill = (skillBudget.perSkill || []);
const perSkillIds = new Set();
perSkill.forEach((p) => {
  if (!p || !p.id) { fail('skillBudget.perSkill: 缺少 id'); return; }
  const s = skills[p.id];
  if (!s) { fail(`skillBudget.perSkill: 技能 ${p.id} 不存在`); return; }
  if (perSkillIds.has(p.id)) fail(`skillBudget.perSkill: 技能 ${p.id} 重复登记`);
  perSkillIds.add(p.id);
  if (p.cost !== s.cost) fail(`skillBudget.perSkill.${p.id}: cost ${p.cost} 与 GD.skills 的 ${s.cost} 不一致`);
  if (!p.cadence) fail(`skillBudget.perSkill.${p.id}: 缺少 cadence（实战节奏说明）`);
  const owner = cast[p.owner];
  if (!owner) { fail(`skillBudget.perSkill.${p.id}: owner ${p.owner} 不在 cast`); return; }
  if ((owner.skills || []).indexOf(p.id) < 0) fail(`skillBudget.perSkill.${p.id}: ${p.owner} 的技能表里没有它`);
  const q = owner.stats.quota;
  const regen = owner.stats.quotaRegen;
  const win = (GD.balance && GD.balance.windows) || {};
  if (win.normal && p.cost > 0) {
    const total = q + regen * (win.normal.turns - 1);
    if (total < p.cost) fail(`skillBudget.perSkill.${p.id}: ${p.owner} 普通战窗口总配额 ${total} 不足以支付一次 ${p.cost}`);
  }
  if (win.boss && p.cost > 0) {
    const totalBoss = q + regen * (win.boss.turns - 1);
    if (totalBoss < p.cost) fail(`skillBudget.perSkill.${p.id}: ${p.owner} 首领战窗口总配额 ${totalBoss} 不足以支付一次 ${p.cost}`);
  }
});
Object.keys(skills).forEach((sid) => { if (!perSkillIds.has(sid)) fail(`skillBudget.perSkill: 技能 ${sid} 未登记回合循环账`); });

// ---------- 叙事数字：对白必须与 GD.narrative 一致 ----------
const narr = GD.narrative || {};
if (!narr.version) fail('roster-source.js 未定义 GD.narrative（剧情数字的唯一来源）');
const dialogSrc = fs.readFileSync(path.join(DATA, 'dialog.js'), 'utf8');
const questSrc = fs.readFileSync(path.join(DATA, 'quests.js'), 'utf8');
const prose = dialogSrc + '\n' + questSrc;
[
  [/(?<!第)三行/, '中文数字「三行」与 narrative.overwrittenRows=3 的写法不一致，统一写「3 行」'],
  [/(?<!第)七行/, '「七行」应写「7 行」'],
  [/七次/, '「七次」应写「5 次」（narrative.totalCutOps）'],
  [/两个手印|大手印|小手印/, '休眠舱只能留一个人的痕迹，手印描述与单人设定冲突'],
  [/榜上最便宜/, '「榜上最便宜」是排名语义，超出快照事实'],
  [/火漆薄一层|火漆就薄/, '火漆随说话变薄与配额回复（每回合回两点）自相矛盾'],
  [/靠猜|出片靠抽卡/, '无来源的具体差评，不得写成事实'],
  [/id: 'ch1'/, '首章结尾不得推进到 ch1']
].forEach(([re, why]) => { const m = prose.match(re); if (m) fail(`文案：出现「${m[0]}」——${why}`); });
if (narr.totalCutRows !== narr.priorCutRows + narr.overwrittenRows) fail('narrative: totalCutRows 应等于 priorCutRows + overwrittenRows');
if (narr.totalCutOps !== narr.priorCutOps + narr.todayCutOps) fail('narrative: totalCutOps 应等于 priorCutOps + todayCutOps');
if (dialogSrc.indexOf(String(narr.totalCutRows) + ' 行') < 0) fail(`对白未出现「${narr.totalCutRows} 行」`);
if (dialogSrc.indexOf(String(narr.totalCutOps) + ' 次') < 0) fail(`对白未出现「${narr.totalCutOps} 次」`);
if (dialogSrc.indexOf(String(narr.overwrittenRows) + ' 行') < 0) warn(`对白未出现「${narr.overwrittenRows} 行」`);
if (dialogSrc.indexOf('第 ' + narr.blankRowNumber + ' 位') < 0) fail(`对白未出现「第 ${narr.blankRowNumber} 位」`);
if (dialogSrc.indexOf(narr.blankRowCode) < 0) fail(`对白未出现编号 ${narr.blankRowCode}`);
if (dialogSrc.indexOf(narr.sequence) < 0) fail(`对白未出现「${narr.sequence}」`);
Object.values(dialog).forEach((d) => {
  (d.onEnd || []).forEach((o) => {
    if (o.op === 'chapter' && o.id !== narr.chapterId) fail(`dialog: 章节指令只能停留在 ${narr.chapterId}`);
  });
});
if (!flagKeys.has(narr.chapterDoneFlag)) fail(`narrative.chapterDoneFlag ${narr.chapterDoneFlag} 未登记`);

// ---------- 世界：只保留首章 5 张地图，不预告后续章节 ----------
(W && W.regions || []).forEach((r) => {
  if (r.note && /次章|下章|后续章节/.test(r.note)) fail(`world.regions.${r.id}: 不得预告后续章节`);
});

// ---------- 抽卡与打卡：纯数据规则 ----------
const gacha = GD.gacha || {};
const checkin = GD.checkin || {};
if (!Object.keys(gacha).length) fail('progress.js 未定义 GD.gacha');
if (!Object.keys(checkin).length) fail('progress.js 未定义 GD.checkin');

(gacha.pools || []).forEach((pool) => {
  const f = pool.fiveStar || {};
  if (!(f.baseRate > 0 && f.baseRate < 1)) fail(`gacha.${pool.id}: 5★ 基础概率非法`);
  if (f.hardPity !== 90) fail(`gacha.${pool.id}: 5★ 硬保底应为 90，实际 ${f.hardPity}`);
  if (f.softPityStart !== 73) fail(`gacha.${pool.id}: 5★ 递增起点应为 73，实际 ${f.softPityStart}`);
  if (!(f.softPityStep > 0)) fail(`gacha.${pool.id}: softPityStep 必须为正`);
  if (f.softPityStart >= f.hardPity) fail(`gacha.${pool.id}: 递增起点必须早于硬保底`);
  // 从起点到硬保底必须能确实收敛到 1
  const at90 = Math.min(1, f.baseRate + (f.hardPity - f.softPityStart) * f.softPityStep);
  if (at90 < 1) fail(`gacha.${pool.id}: 第 ${f.hardPity} 抽概率仅 ${at90.toFixed(3)}，未达硬保底`);
  (pool.pool || []).forEach((cid) => { if (!cast[cid]) fail(`gacha.${pool.id}: 卡池角色 ${cid} 不在 cast`); });
  (pool.featured || []).forEach((cid) => {
    if (!cast[cid]) fail(`gacha.${pool.id}: UP 角色 ${cid} 不在 cast`);
    if (!(pool.pool || []).includes(cid)) fail(`gacha.${pool.id}: UP 角色 ${cid} 不在本池`);
  });
  if (pool.kind === 'up') {
    if (!(pool.featured || []).length) fail(`gacha.${pool.id}: UP 池必须有 featured`);
    if (!pool.upRule || pool.upRule.guaranteeInherit !== true) fail(`gacha.${pool.id}: UP 保底必须声明可继承`);
    if (!(pool.upRule.chance > 0 && pool.upRule.chance < 1)) fail(`gacha.${pool.id}: UP 命中率非法`);
  }
});
if (!gacha.duplicate || !gacha.duplicate.fiveStar) fail('gacha.duplicate.fiveStar 缺失');
else {
  const d5 = gacha.duplicate.fiveStar;
  if (!(d5.constellationCap >= 1)) fail('gacha.duplicate.fiveStar.constellationCap 非法');
  if (!d5.perDuplicate || !d5.afterCap) fail('gacha.duplicate.fiveStar 需同时声明 perDuplicate 与 afterCap');
}
if (!gacha.costPerPull || gacha.costPerPull.amount <= 0) fail('gacha.costPerPull 缺失');
if (!GD.currency || GD.currency.noPurchase !== true) fail('currency.noPurchase 必须为 true（纯免费、无付款口）');
['page', 'echo'].forEach((c) => { if (!GD.currency || !GD.currency[c]) fail(`currency.${c} 缺失`); });

if (checkin.cycleDays !== 7) fail(`checkin.cycleDays 应为 7，实际 ${checkin.cycleDays}`);
if (checkin.idempotentKey !== 'localDate') fail('checkin.idempotentKey 应为 localDate（本地日期幂等）');
if (!Array.isArray(checkin.rewards) || checkin.rewards.length !== 7) fail('checkin.rewards 必须正好 7 天');
(checkin.rewards || []).forEach((r, i) => {
  if (r.day !== i + 1) fail(`checkin.rewards[${i}].day 应为 ${i + 1}`);
  if (!r.items || !r.items.length) fail(`checkin.rewards[${i}] 缺少 items`);
  (r.items || []).forEach((it) => {
    if (it.currency && (!GD.currency || !GD.currency[it.currency])) fail(`checkin.rewards[${i}]: 货币 ${it.currency} 不存在`);
    if (it.item && !items[it.item]) fail(`checkin.rewards[${i}]: 道具 ${it.item} 不存在`);
  });
});
if (checkin.breakRule && checkin.breakRule.resetOnMiss !== false) fail('checkin.breakRule.resetOnMiss 必须为 false（断签不清零）');
if (checkin.makeup && checkin.makeup.allow) {
  if (!(checkin.makeup.maxPerCycle >= 1)) fail('checkin.makeup.maxPerCycle 非法');
  if (!checkin.makeup.cost || !checkin.makeup.cost.amount) fail('checkin.makeup.cost 缺失');
  if (checkin.makeup.forbidFuture !== true) fail('checkin.makeup.forbidFuture 必须为 true（不能预领未来格子）');
  if (checkin.makeup.forbidClaimed !== true) fail('checkin.makeup.forbidClaimed 必须为 true（不能重复补已领取的格子）');
  if (!checkin.makeup.eligibleRule) fail('checkin.makeup.eligibleRule 缺失');
  if (!checkin.makeup.windowRule) fail('checkin.makeup.windowRule 缺失');
}
// 周期计算必须是可执行字段，而不是散文
const cycle = checkin.cycle || {};
['startKey', 'startRule', 'endOffsetDays', 'endKey', 'dayIndexFormula', 'expireRule', 'nextCycleStart'].forEach((k) => {
  if (cycle[k] === undefined) fail(`checkin.cycle.${k} 缺失（补签周期必须可执行）`);
});
if (cycle.endOffsetDays !== checkin.cycleDays - 1) fail(`checkin.cycle.endOffsetDays 应为 ${checkin.cycleDays - 1}`);
if (cycle.expireRule && !/作废|结束/.test(cycle.expireRule)) fail('checkin.cycle.expireRule 必须写明过期处理');

// 保底作用域：抽数与 UP 分别声明，语义不能字面冲突
if (gacha.pityScope !== 'pool') fail('gacha.pityScope 应为 pool（5★ 计数器按池各自计数）');
if (!['featured-series', 'pool', 'none'].includes(gacha.upGuaranteeScope)) fail('gacha.upGuaranteeScope 非法');
(gacha.pools || []).forEach((pool) => {
  const u = pool.upRule || {};
  if (u.guaranteeInherit && gacha.upGuaranteeScope !== 'featured-series') {
    fail(`gacha.${pool.id}: 声明 UP 保底继承，但 upGuaranteeScope=${gacha.upGuaranteeScope}`);
  }
  if (u.guaranteeInherit && u.scope !== 'featured-series') fail(`gacha.${pool.id}: upRule.scope 应为 featured-series`);
  if (!u.guaranteeInherit && u.scope === 'featured-series') fail(`gacha.${pool.id}: 常设池不得声明 featured-series`);
});

// 4★ 档必须有真实产出：角色必须在 cast，材料必须在 items
const f4 = gacha.fourStarPool || {};
const f4i = gacha.fourStarItemPool || {};
if (!Array.isArray(f4.members) || !f4.members.length) fail('gacha.fourStarPool.members 缺失（4★ 必须有真实角色产出）');
(f4.members || []).forEach((cid) => {
  if (!cast[cid]) fail(`gacha.fourStarPool: 角色 ${cid} 不在 cast`);
  if ((gacha.pools || []).some((p) => (p.featured || []).includes(cid))) fail(`gacha.fourStarPool: ${cid} 是 UP 角色，不得降格进 4★ 池`);
});
if (!Array.isArray(f4i.entries) || !f4i.entries.length) fail('gacha.fourStarItemPool.entries 缺失');
(f4i.entries || []).forEach((e) => {
  if (!items[e.item]) fail(`gacha.fourStarItemPool: 道具 ${e.item} 不存在`);
  if (!(e.amount >= 1)) fail(`gacha.fourStarItemPool: ${e.item} 数量非法`);
});
if (!(f4i.weight > 0 && f4i.weight < 1)) fail('gacha.fourStarItemPool.weight 必须在 0..1');
if (!gacha.duplicate || !gacha.duplicate.material) fail('gacha.duplicate.material 缺失（材料档的发放规则）');

// ---------- 美术清单 ----------
// 硬校验统一由 tools/art-check.mjs 承担（manifest 登记、PNG 尺寸/色数、预算、来源合规），
// 这里只做 ART-SPEC 文本引用检查，并向它转交一次验收，避免两套规则漂移。
const spec = path.join(ROOT, 'web/game/ART-SPEC.md');
if (!fs.existsSync(spec)) fail('缺少 web/game/ART-SPEC.md');
else {
  const md = fs.readFileSync(spec, 'utf8');
  Object.values(cast).forEach((c) => {
    if (!md.includes(c.sprite)) fail(`ART-SPEC 未列出精灵 ${c.sprite}`);
    if (!md.includes(c.portrait)) fail(`ART-SPEC 未列出立绘 ${c.portrait}`);
  });
  Object.values(npc).forEach((n) => {
    if (n.sprite && !md.includes(n.sprite)) fail(`ART-SPEC 未列出 NPC 精灵 ${n.sprite}`);
    if (n.portrait && !md.includes(n.portrait)) fail(`ART-SPEC 未列出 NPC 立绘 ${n.portrait}`);
  });
  Object.values(enemies).forEach((e) => {
    if (e.boss && !md.includes('boss_' + e.id)) fail(`ART-SPEC 未列出首领精灵 boss_${e.id}`);
  });
}

// 资源硬校验：manifest + PNG 实测，任何一项不过都算失败（不再降级为警告）
try {
  execFileSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'art-check.mjs'), '--root', ROOT], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
} catch (e) {
  const out = ((e.stdout || '') + (e.stderr || '')).trim().split('\n').filter((l) => /^\s+x /.test(l));
  if (out.length) out.slice(0, 8).forEach((l) => fail('美术资源 ' + l.trim().replace(/^x /, '')));
  else fail('tools/art-check.mjs 未通过：' + (e.message || '').split('\n')[0]);
}

// ---------- 输出 ----------
const summary = {
  maps: Object.keys(W && W.maps || {}).length,
  interactables: Object.values(W && W.maps || {}).reduce((a, m) => a + (m.interactables || []).length, 0),
  dialogNodes: Object.keys(dialog).length,
  cast: Object.keys(cast).length,
  npc: Object.keys(npc).length,
  roster: roster.length,
  skills: Object.keys(skills).length,
  enemies: Object.keys(enemies).length,
  flags: flagKeys.size,
  questSteps: (quests.main_ch0 && quests.main_ch0.steps || []).length,
  chapterMinutes: flowSum,
  picks: Object.keys(picks).length,
  gachaPools: (gacha.pools || []).length,
  checkinDays: (checkin.rewards || []).length
};

if (VERBOSE) console.log(JSON.stringify({ summary, warns }, null, 2));
else console.log('汇总 ' + JSON.stringify(summary));

if (warns.length) { console.log('\n警告 ' + warns.length + ' 条：'); warns.forEach((m) => console.log('  ! ' + m)); }
if (errors.length) { console.log('\n错误 ' + errors.length + ' 条：'); errors.forEach((m) => console.log('  x ' + m)); process.exit(1); }
console.log('\n数据契约校验通过：' + (warns.length ? '有警告，无错误' : '零警告零错误'));