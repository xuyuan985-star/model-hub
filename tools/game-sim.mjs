#!/usr/bin/env node
/* tools/game-sim.mjs — 首章静态可通关性推演：连通性、交互可达、任务步骤饱和、结局互斥、重播幂等。
   不依赖引擎，只按数据契约（world/dialog/quests）推演；不写任何文件。用法：node tools/game-sim.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'web/game/data');

const win = {};
for (const f of ['roster-source.js', 'world.js', 'characters.js', 'dialog.js', 'quests.js', 'progress.js']) {
  new Function('window', fs.readFileSync(path.join(DATA, f), 'utf8'))(win);
}
const GD = win.GameData;
const W = GD.world;
const errors = [];
const fail = (m) => errors.push(m);

const BLOCK = new Set(['#', 'T', '~', 'X']);
const blockedByDecor = (m, x, y) => (m.decor || []).some((d) => d.blocks && d.x === x && d.y === y);
const walk = (mapId, x, y) => {
  const m = W.maps[mapId];
  if (!m || x < 0 || y < 0 || x >= W.cols || y >= W.rows) return false;
  return !BLOCK.has(m.ascii[y][x]) && !blockedByDecor(m, x, y);
};

// ---------- 1. 每张地图必须只有一个可走连通域 ----------
const NEI = [[0, -1], [0, 1], [-1, 0], [1, 0]];
for (const [id, m] of Object.entries(W.maps)) {
  const seen = new Set();
  let components = 0;
  let largest = 0;
  for (let y = 0; y < W.rows; y++) for (let x = 0; x < W.cols; x++) {
    if (!walk(id, x, y) || seen.has(x + ',' + y)) continue;
    components++;
    const q = [[x, y]];
    seen.add(x + ',' + y);
    let size = 0;
    while (q.length) {
      const [cx, cy] = q.pop();
      size++;
      for (const [dx, dy] of NEI) {
        const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
        if (walk(id, nx, ny) && !seen.has(k)) { seen.add(k); q.push([nx, ny]); }
      }
    }
    largest = Math.max(largest, size);
  }
  if (components > 1) fail(`${m.name}: 可走区域分裂成 ${components} 块（最大 ${largest} 格），交互点可能不可达`);
  (m.interactables || []).filter((it) => !seen.has(it.x + ',' + it.y))
    .forEach((it) => fail(`${m.name}: 交互点 ${it.id} 与主区域不连通`));
}

// ---------- 2. 地图连通：从出生点出发能否走到所有开局可进入的地图 ----------
const reached = new Set([W.spawn.map]);
const queue = [W.spawn.map];
while (queue.length) {
  const cur = queue.pop();
  for (const t of W.maps[cur].transitions || []) {
    if (!reached.has(t.to)) { reached.add(t.to); queue.push(t.to); }
  }
}
Object.keys(W.maps).forEach((id) => { if (!reached.has(id)) fail(`地图 ${id} 从出生点无法到达`); });

// ---------- 3. 状态机：分支各自克隆，合并时取并集 / 取最大 ----------
// 同一个全局 state 同时跑完两条结局会产生「双结局同时成立」的假象，因此分支必须独立。
const makeState = () => ({
  flags: new Set(), items: {}, party: new Set(['observer']),
  slots: {}, quotas: {}, dialogDone: new Set()
});
const cloneState = (s) => ({
  flags: new Set(s.flags), items: Object.assign({}, s.items), party: new Set(s.party),
  slots: Object.assign({}, s.slots), quotas: Object.assign({}, s.quotas), dialogDone: new Set(s.dialogDone)
});
const mergeState = (dst, src) => {
  src.flags.forEach((f) => dst.flags.add(f));
  src.party.forEach((p) => dst.party.add(p));
  src.dialogDone.forEach((d) => dst.dialogDone.add(d));
  Object.keys(src.items).forEach((k) => { dst.items[k] = Math.max(dst.items[k] || 0, src.items[k]); });
  Object.keys(src.slots).forEach((k) => { dst.slots[k] = Math.max(dst.slots[k] || 0, src.slots[k]); });
  Object.keys(src.quotas).forEach((k) => { dst.quotas[k] = Math.max(dst.quotas[k] || 0, src.quotas[k]); });
};
const applyOps = (st, ops) => {
  for (const o of ops || []) {
    if (o.op === 'flag') st.flags.add(o.key);
    else if (o.op === 'item') st.items[o.id] = (st.items[o.id] || 0) + (o.n || 1);
    else if (o.op === 'party') st.party.add(o.who);
    else if (o.op === 'slot') st.slots[o.who] = (st.slots[o.who] || 0) + o.n;
    else if (o.op === 'quota') st.quotas[o.who] = (st.quotas[o.who] || 0) + o.n;
    else if (o.op === 'battle') st.flags.add('battle:' + o.id);
    else if (o.op === 'chapter') st.flags.add('chapter:' + o.id);
  }
};
/** 执行节点：沿 next 走完；遇 choices 时每个分支各自克隆 state，最后合并。 */
const runNode = (id, st, depth = 0, guard = new Set()) => {
  if (!id || depth > 40 || guard.has(id)) return;
  const d = GD.dialog[id];
  if (!d) { fail(`对白节点 ${id} 不存在`); return; }
  guard.add(id);
  st.dialogDone.add(id);
  applyOps(st, d.onEnd);
  if (d.choices) {
    d.choices.forEach((c) => {
      const branch = cloneState(st);
      runNode(c.go, branch, depth + 1, new Set(guard));
      mergeState(st, branch);
    });
    return;
  }
  if (d.next) runNode(d.next, st, depth + 1, guard);
};

// ---------- 4. 章节推演：反复执行可达交互，直到标记饱和 ----------
const state = makeState();
const mapOrder = ['station', 'colonnade', 'alley', 'greenhouse', 'archive'];
for (let pass = 0; pass < 6; pass++) {
  for (const mapId of mapOrder) {
    const m = W.maps[mapId];
    if (m.onEnter && !state.dialogDone.has(m.onEnter)) runNode(m.onEnter, state);
    for (const it of m.interactables || []) {
      if (state.dialogDone.has(it.dialog)) continue;
      runNode(it.dialog, state);
    }
  }
  if (state.flags.has('ch0.boss.ready') && !state.dialogDone.has('d_boss_intro')) {
    runNode('d_boss_intro', state);
    state.flags.add('ch0.boss.done');
    runNode('d_boss_defeat', state);
  }
}

// ---------- 5. 任务步骤必须全部饱和 ----------
const steps = GD.quests.main_ch0.steps;
const satisfied = (st, s) => {
  const all = (s.flagsAll || []).every((f) => st.flags.has(f));
  const any = !s.flagsAny || s.flagsAny.some((f) => st.flags.has(f));
  return all && any;
};
steps.filter((s) => !satisfied(state, s)).forEach((s) => {
  fail(`任务步骤 ${s.id}「${s.name}」在推演中无法达成（缺 ${(s.flagsAll || []).join(',') || (s.flagsAny || []).join('|')}）`);
});

// ---------- 6. 结局互斥：从 d_boss_defeat 出发，每条分支各自独立，恰好命中一条结局 ----------
const defeat = GD.dialog.d_boss_defeat;
if (!defeat || !defeat.choices) fail('d_boss_defeat 缺少 choices，无法判定结局');
else {
  const ENDING_NODES = { d_ending_original: 'ch0.ending.original', d_ending_revision: 'ch0.ending.revision' };
  const endingFlags = Object.values(ENDING_NODES);
  const reachedEndings = new Set();
  defeat.choices.forEach((c, i) => {
    if (!ENDING_NODES[c.go]) { fail(`d_boss_defeat 的选项「${c.text}」未导向结局节点`); return; }
    const branch = cloneState(state);
    // 主推演为了让两分支都走过，会把两条结局标记并进同一份 state；
    // 判定互斥前必须先清掉，否则「两条都命中」只是推演残留，不是数据问题。
    endingFlags.forEach((f) => branch.flags.delete(f));
    branch.dialogDone.add('d_boss_defeat');
    // 只走这一条分支，绝不执行其它选项
    runNode(c.go, branch, 0, new Set(['d_boss_defeat']));
    const hits = endingFlags.filter((f) => branch.flags.has(f));
    if (hits.length !== 1) fail(`选择「${c.text}」后命中 ${hits.length} 条结局标记（应为恰好 1 条）`);
    else if (hits[0] !== ENDING_NODES[c.go]) fail(`选择「${c.text}」命中的是 ${hits[0]}，与节点表不符`);
    else reachedEndings.add(hits[0]);
    if (!branch.flags.has('ch0.done')) fail(`选择「${c.text}」后未写入 ch0.done`);
    const q10 = steps[steps.length - 1];
    if (!satisfied(branch, q10)) fail(`选择「${c.text}」后末步 ${q10.id} 未达成`);
    [...branch.flags].filter((f) => f.indexOf('chapter:') === 0).forEach((f) => {
      fail(`结局「${c.text}」推进了章节 ${f.slice(8)}，首章必须停留在 ch0`);
    });
  });
  if (reachedEndings.size !== endingFlags.length) fail(`只有 ${reachedEndings.size} 条结局可达，应为 ${endingFlags.length} 条`);
}

// ---------- 7. 重播幂等：同一交互重复触发不得重复发奖 / 重复入队 ----------
{
  const once = makeState();
  for (const m of Object.values(W.maps)) {
    for (const it of m.interactables || []) {
      if (it.flag && once.flags.has(it.flag)) continue;
      runNode(it.dialog, once);
      if (it.flag) once.flags.add(it.flag); // 契约：交互 flag 在对白真正完成后写入
    }
  }
  // 第二轮：所有 flag 都在，按契约必须全部跳过
  const replay = cloneState(once);
  for (const m of Object.values(W.maps)) {
    for (const it of m.interactables || []) {
      if (it.flag && replay.flags.has(it.flag)) continue;
      runNode(it.dialog, replay);
      if (it.flag) replay.flags.add(it.flag);
    }
  }
  Object.keys(once.items).concat(Object.keys(replay.items)).forEach((k) => {
    if ((once.items[k] || 0) !== (replay.items[k] || 0)) {
      fail(`道具 ${k} 在重复触发后由 ${once.items[k] || 0} 变成 ${replay.items[k] || 0}，交互不幂等`);
    }
  });
  if (JSON.stringify([...once.party].sort()) !== JSON.stringify([...replay.party].sort())) {
    fail('重复触发后队伍成员发生变化，入队不幂等');
  }
  (Object.keys(once.slots).concat(Object.keys(replay.slots))).forEach((k) => {
    if ((once.slots[k] || 0) !== (replay.slots[k] || 0)) fail(`槽位加成 ${k} 在重复触发后被叠加`);
  });
  Object.values(W.maps).forEach((m) => (m.interactables || []).forEach((it) => {
    if (!it.flag) fail(`交互点 ${it.id} 缺少 flag，无法保证重播幂等`);
  }));

  // ---------- 7b. 共用文本节点：onEnd 里没有 flag 指令的节点，产物只能靠所在交互点的 flag 幂等 ----------
  // 契约：这类节点（如 al.crate_a / al.crate_b 共用 d_crate）每完成一次就发一次奖；
  // 因为节点本身不写标记，必须由交互点的 flag 保证「同一个交互点只发一次」。
  const refBy = {};
  Object.values(W.maps).forEach((m) => (m.interactables || []).forEach((it) => {
    (refBy[it.dialog] = refBy[it.dialog] || []).push(it);
  }));
  Object.keys(refBy).forEach((nodeId) => {
    const d = GD.dialog[nodeId];
    if (!d) return;
    const hasFlagOp = (d.onEnd || []).some((o) => o.op === 'flag');
    const owners = refBy[nodeId];
    if (hasFlagOp) return;
    // 节点自己不写 flag：所有引用它的交互点必须各自带 flag，否则重播会重复发奖
    owners.forEach((it) => {
      if (!it.flag) fail(`共用文本节点 ${nodeId} 的交互点 ${it.id} 没有自己的 flag，重播会重复发奖`);
    });
    const rewardOps = (d.onEnd || []).filter((o) => o.op === 'item' || o.op === 'party' || o.op === 'slot' || o.op === 'quota');
    if (!rewardOps.length) return;
    // 干跑一遍：每个交互点各完成一次 = 奖励按交互点数量摊开；重播一次必须不再增长
    const fresh = makeState();
    let fired = 0;
    owners.forEach((it) => {
      if (it.flag && fresh.flags.has(it.flag)) return;
      runNode(it.dialog, fresh);
      if (it.flag) fresh.flags.add(it.flag);
      fired++;
    });
    const before = Object.assign({}, fresh.items);
    owners.forEach((it) => {
      if (it.flag && fresh.flags.has(it.flag)) return;
      runNode(it.dialog, fresh);
      if (it.flag) fresh.flags.add(it.flag);
    });
    Object.keys(fresh.items).forEach((k) => {
      if ((fresh.items[k] || 0) !== (before[k] || 0)) {
        fail(`共用文本节点 ${nodeId} 重播后道具 ${k} 由 ${before[k] || 0} 变成 ${fresh.items[k]}，交互点 flag 未起作用`);
      }
    });
    if (fired !== owners.length) fail(`共用文本节点 ${nodeId} 的 ${owners.length} 个交互点只触发 ${fired} 次`);
  });
}

// ---------- 8. 队伍与配额：入队角色必须在 cast，槽位与配额加成有上界 ----------
['xi', 'jin', 'juan', 'mu', 'kai'].forEach((who) => {
  if (!state.party.has(who)) fail(`角色 ${who} 在推演中未能入队`);
});
for (const [who, add] of Object.entries(state.slots)) {
  const base = GD.cast[who].stats.slots;
  if (base + add > 8) fail(`${who} 槽位上限被加到 ${base + add}，超出战斗层可读范围（≤8）`);
}
for (const [who, add] of Object.entries(state.quotas)) {
  const base = GD.cast[who].stats.quota;
  if (add > Math.ceil(base * 0.5)) fail(`${who} 配额上限被加 ${add}，超过基础值 ${base} 的一半`);
}

// ---------- 9. 分支出入口：每个 choices 节点至少两条可走路径 ----------
Object.entries(GD.dialog).forEach(([id, d]) => {
  if (d.choices && d.choices.length < 2) fail(`dialog.${id}: 分支不足两条`);
});

// ---------- 输出 ----------
const summary = {
  maps: Object.keys(W.maps).length,
  mapsReachable: reached.size,
  nodesPlayed: state.dialogDone.size,
  flags: state.flags.size,
  items: Object.keys(state.items).length,
  party: [...state.party],
  slots: state.slots,
  quotas: state.quotas,
  questStepsSatisfied: steps.filter((s) => satisfied(state, s)).length + '/' + steps.length
};
console.log('推演 ' + JSON.stringify(summary, null, 0));
if (errors.length) { console.log('\n不可通关问题 ' + errors.length + ' 条：'); errors.forEach((m) => console.log('  x ' + m)); process.exit(1); }
console.log('\n首章可通关：连通、任务饱和、结局互斥（每条分支恰好一条）、交互重播幂等、五名同伴全部可入队');
