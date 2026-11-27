/* web/game/interlude/story-check.mjs — 幕间《第七位观察者》剧情自检。
   只检查"内容"这一侧，不依赖浏览器、不依赖引擎：把 6 个 data 文件 + 幕间四幕 + 总装
   装进一个假 window 里，然后按数据契约推演。

   为什么和 tools/interlude-check.mjs 分开：
     interlude-check 管"接得对不对"（引擎接点、存档命名空间、玩法循环、断点续播）；
     本脚本管"故事成不成立"（对白图可达、台词量、原版没被改坏、四幕 flag 都有人写）。
     写作时最常犯的错是改一句台词顺手把 next 改丢，这类错在游戏里表现为"走到一半没下文"，
     很难靠手动试出来。

   检查项：
      1. 装配与注册面（1 个幕间 / 4 个模式 / 3 个指令 / 3 个入口函数）
      2. 对白图可达性（从入口 BFS，所有节点必须可达；所有 next/choices 目标必须存在）
      3. onEnd 指令白名单（只允许 flag / item / mode；禁止 chapter）
      4. 每一幕的 doneFlag 必须真的被某个节点写入（否则幕永远推不完）
      5. 四道谜题自洽（正确答案唯一、干扰项不在答案里、ord 连续无重复）
      6. 台词量 / 估算时长
      7. 原版数据未被改动（关键节点仍在、原版 58 节点未少）
      8. 台词不给观测者（玩家）指定性别

   用法：node web/game/interlude/story-check.mjs [--verbose]
   退出码：0 = 通过；1 = 有 error。 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');   // web/game/interlude → 仓库根
const verbose = process.argv.includes('--verbose');

const errors = [];
const notes = [];
function fail(msg) { errors.push(msg); }
function note(msg) { notes.push(msg); }
function ok(cond, msg) { if (!cond) fail(msg); }

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* ---------------- 装配假 window ---------------- */
function makeWindow() {
  const win = { console: { warn() { }, log() { }, error() { } }, location: { search: '' } };
  win.window = win;
  const files = [
    'web/game/data/roster-source.js',
    'web/game/data/world.js',
    'web/game/data/characters.js',
    'web/game/data/dialog.js',
    'web/game/data/quests.js',
    'web/game/data/progress.js',
    'web/game/interlude/ch1_a1.js',
    'web/game/interlude/ch1_a2.js',
    'web/game/interlude/ch1_a3.js',
    'web/game/interlude/ch1_a4.js',
    'web/game/interlude/index.js'
  ];
  for (const f of files) {
    const src = read(f);
    // eslint-disable-next-line no-new-func
    new Function('window', src)(win);
  }
  return win;
}

let win;
try {
  win = makeWindow();
} catch (e) {
  console.error('装配失败：' + (e && e.stack || e));
  process.exit(1);
}

const GD = win.GameData;
const IL = win.GameEngine && win.GameEngine.Interlude;
const BAG = win.GameInterlude;

ok(!!GD, 'GameData 未装配');
ok(!!IL, '幕间运行时未装配（index.js 未加载）');
ok(!!BAG, 'GameInterlude 未装配（四幕数据文件未加载）');
if (errors.length) { report(); }

/* ---------------- 1. 注册面 ---------------- */
ok(IL.version === 'interlude/1', '幕间版本应为 interlude/1，实际 ' + IL.version);

const MODE_IDS = ['ledger', 'ledger_cmp', 'ledger_rule', 'ledger_final'];
const MODE_METHODS = ['enter', 'exit', 'step', 'dir', 'act', 'back', 'menu', 'render'];
for (const id of MODE_IDS) {
  const m = IL.mode(id);
  ok(!!m, '缺少模式 ' + id);
  if (!m) continue;
  for (const fn of MODE_METHODS) ok(typeof m[fn] === 'function', '模式 ' + id + ' 缺少方法 ' + fn);
}

for (const fn of ['titleAct', 'titleLine', 'questId', 'applyOp', 'nsOf', 'migrate', 'render', 'step', 'inputMode']) {
  ok(typeof IL[fn] === 'function', '运行时缺少 ' + fn + '()');
}
// 指令面用真实分派函数验：mode 要认，chapter 必须不认（幕间不推章节）
{
  const probe = { flags: {}, items: {}, interlude: {} };
  const probeGame = { mode: 'explore', startMode() { probeGame.entered = true; } };
  ok(IL.applyOp(probe, { op: 'mode', id: 'ledger' }, probeGame) === true, 'applyOp 不认 {op:\'mode\'}');
  ok(probeGame.entered === true, '{op:\'mode\'} 没有切进玩法模式');
  ok(IL.applyOp(probe, { op: 'chapter', id: 'ch1' }, probeGame) === false, '幕间不得认领 chapter 指令');
}

/* ---------------- 2. 对白图 ---------------- */
const D = GD.dialog || {};
const newNodes = Object.keys(D).filter(id => /^m[1-4]_/.test(id));
ok(newNodes.length === 25, '新增对白节点应为 25 个，实际 ' + newNodes.length);

const byPrefix = { m1: 0, m2: 0, m3: 0, m4: 0 };
for (const id of newNodes) byPrefix[id.slice(0, 2)]++;
note('节点分布：m1=' + byPrefix.m1 + ' m2=' + byPrefix.m2 + ' m3=' + byPrefix.m3 + ' m4=' + byPrefix.m4);

for (const id of newNodes) {
  const n = D[id];
  ok(!!n, '节点 ' + id + ' 不存在');
  if (!n) continue;
  ok(Array.isArray(n.lines) && n.lines.length > 0, '节点 ' + id + ' 没有台词');
  for (const [i, line] of (n.lines || []).entries()) {
    ok(typeof line.text === 'string' && line.text.length > 0, id + ' 第 ' + (i + 1) + ' 句没有 text');
    if (line.who !== undefined) ok(typeof line.who === 'string' && line.who.length > 0, id + ' 第 ' + (i + 1) + ' 句 who 为空');
  }
  for (const line of (n.lines || [])) {
    // 本项目全篇不给"观测者"（玩家）指定性别：允许旁白用她/他描述既有 NPC（原版也这么做），
    // 但不允许把性别代词挂到"你"身上。
    if (line.text && /你是[男女]/.test(line.text)) {
      fail(id + ' 台词给观测者指定了性别：「' + line.text + '」');
    }
    if (line.text && /你[他她]/.test(line.text)) {
      fail(id + ' 台词用性别代词指代观测者：「' + line.text + '」');
    }
  }
}

// 入口：幕一的 intro 由 titleAct 直接 startDialog；幕四四个结局由 finish() 直接 startDialog；
// 各幕的收束/桥段/下一幕 intro 由代码里的 game.startDialog('...') 拉起。
// 从 ch1_aN.js 源码里抓这些节点名，保证"代码能拉起的节点"都算可达起点。
const ENTRIES = ['m1_intro', 'm4_end_write', 'm4_end_blank', 'm4_end_self', 'm4_end_open'];
for (const f of ['ch1_a1', 'ch1_a2', 'ch1_a3', 'ch1_a4']) {
  const src = read('web/game/interlude/' + f + '.js');
  // 抓所有以引号包裹的 m<幕>_ 节点名（代码里的 startDialog 目标，含三元分支）
  for (const m of src.matchAll(/'((?:m[1-4]_)[a-z_0-9]+)'/g)) {
    if (ENTRIES.indexOf(m[1]) < 0) ENTRIES.push(m[1]);
  }
}
for (const id of ENTRIES) ok(!!D[id], '缺少入口节点 ' + id);

const reached = new Set();
const queue = ENTRIES.slice();
while (queue.length) {
  const id = queue.shift();
  if (reached.has(id)) continue;
  const node = D[id];
  if (!node) { fail('对白图指向不存在的节点 ' + id); continue; }
  reached.add(id);
  if (node.next) queue.push(node.next);
  for (const c of (node.choices || [])) {
    ok(typeof c.go === 'string' && c.go, '节点 ' + id + ' 的选项没有 go');
    if (c.go) queue.push(c.go);
  }
}
const unreachable = newNodes.filter(id => !reached.has(id));
ok(unreachable.length === 0, '不可达节点：' + unreachable.join(', '));
note('可达节点 ' + (reached.size) + '/' + newNodes.length);

for (const id of newNodes) {
  const n = D[id];
  if (n.choices) ok(n.choices.length >= 2, '节点 ' + id + ' 的选项少于 2 个');
}

/* ---------------- 3. onEnd 指令白名单 ---------------- */
const ALLOWED_OPS = new Set(['flag', 'item', 'mode']);
for (const id of newNodes) {
  for (const op of (D[id].onEnd || [])) {
    ok(ALLOWED_OPS.has(op.op), '节点 ' + id + ' 使用了未登记的指令 ' + op.op);
    if (op.op === 'flag') ok(!!GD.flags[op.key], '节点 ' + id + ' 写了未登记的 flag ' + op.key);
    if (op.op === 'item') ok(!!GD.items[op.id], '节点 ' + id + ' 发了未登记的道具 ' + op.id);
    if (op.op === 'mode') ok(MODE_IDS.indexOf(op.id) >= 0, '节点 ' + id + ' 切到未注册的模式 ' + op.id);
  }
}

/* ---------------- 4. 每幕 doneFlag 必须真被写入 ---------------- */
const ACTS = (BAG && BAG.acts) || [];
ok(ACTS.length === 4, '应有 4 幕，实际 ' + ACTS.length);
for (const act of ACTS) {
  const writes = [];
  for (const nid of Object.keys(act.nodes || {})) {
    for (const op of (D[nid].onEnd || [])) {
      if (op.op === 'flag' && op.key === act.doneFlag) writes.push(nid);
    }
  }
  ok(writes.length > 0, '幕 ' + act.id + ' 的 doneFlag ' + act.doneFlag + ' 没有任何节点写入（幕永远推不完）');
  ok(!!GD.flags[act.doneFlag], '幕 ' + act.id + ' 的 doneFlag 未在 GD.flags 登记');
  note('幕 ' + act.id + ' doneFlag 由 ' + writes.join('/') + ' 写入');
}

// 幕四四个结局各自写自己的 flag
const ENDINGS = [
  { node: 'm4_end_write', flag: 'act4.end.write', item: 'signed_row' },
  { node: 'm4_end_blank', flag: 'act4.end.blank', item: 'empty_eighth' },
  { node: 'm4_end_self', flag: 'act4.end.self', item: 'own_name' },
  { node: 'm4_end_open', flag: 'act4.end.open', item: 'open_case' }
];
for (const e of ENDINGS) {
  const ops = (D[e.node].onEnd || []);
  ok(ops.some(o => o.op === 'flag' && o.key === e.flag), e.node + ' 没有写 ' + e.flag);
  ok(ops.some(o => o.op === 'flag' && o.key === 'act4.done'), e.node + ' 没有写 act4.done');
  ok(ops.some(o => o.op === 'item' && o.id === e.item), e.node + ' 没有发 ' + e.item);
  ok(D[e.node].next === 'm4_coda', e.node + ' 的 next 应指向 m4_coda');
}

/* ---------------- 5. 四道谜题自洽 ---------------- */
function puzzleOf(id) {
  const act = IL.act(id);
  return act && act.puzzle;
}

// 推演台：cells[].need 必须都在 cards[].id 里，且两两不同
{
  const p = puzzleOf('act1');
  ok(!!p, '幕一缺少 puzzle');
  if (p) {
    const cardIds = p.cards.map(c => c.id);
    const needs = p.cells.map(c => c.need);
    ok(new Set(needs).size === needs.length, '推演台正确项重复');
    for (const n of needs) ok(cardIds.indexOf(n) >= 0, '推演台正确项 ' + n + ' 不在手牌里');
    ok(cardIds.length === needs.length + 2, '推演台应为 4 张正确卡 + 2 张干扰卡');
    for (const c of p.cells) ok(typeof c.value === 'string' && c.value, '列格 ' + c.id + ' 没有展示值');
  }
}

// 对照台：diff:true 的行必须正好 5 行，且左右文字真的不同
{
  const p = puzzleOf('act2');
  ok(!!p, '幕二缺少 puzzle');
  if (p) {
    const diffs = p.rows.filter(r => r.diff);
    ok(diffs.length === 5, '对照台应有 5 处出入，实际 ' + diffs.length);
    ok(p.rows.length === 12, '对照台应有 12 行，实际 ' + p.rows.length);
    for (const r of p.rows) {
      ok(!!r.left && !!r.right, '对照台第 ' + r.no + ' 行缺页');
      if (r.diff) ok(r.left !== r.right, '对照台第 ' + r.no + ' 行标了 diff 但两侧文字相同');
      if (!r.diff) ok(r.left === r.right, '对照台第 ' + r.no + ' 行没标 diff 但两侧文字不同');
    }
  }
}

// 编排台：ord 1..5 连续，且正好 1 张 ord:0 干扰
{
  const p = puzzleOf('act3');
  ok(!!p, '幕三缺少 puzzle');
  if (p) {
    const real = p.cards.filter(c => c.ord > 0).map(c => c.ord).sort((a, b) => a - b);
    ok(real.length === 5, '编排台应有 5 条真条文，实际 ' + real.length);
    ok(real.join(',') === '1,2,3,4,5', '编排台条文序号不连续：' + real.join(','));
    const fake = p.cards.filter(c => c.ord === 0);
    ok(fake.length === 1, '编排台应有 1 张干扰残片（附录），实际 ' + fake.length);
    for (const c of p.cards) ok(!!c.clue, '残片 ' + c.id + ' 没有推理线索 clue');
  }
}

// 定稿台：names 里的名字必须能在 GD.roster 里找到，options 4 个
{
  const p = puzzleOf('act4');
  ok(!!p, '幕四缺少 puzzle');
  if (p) {
    ok(p.names.length === 12, '定稿台应有 12 个候选名字，实际 ' + p.names.length);
    ok(p.options.length === 4, '定稿台应有 4 种处置，实际 ' + p.options.length);
    const rosterNames = (GD.roster || []).map(r => r.name);
    for (const n of p.names) {
      ok(rosterNames.indexOf(n.name) >= 0, '定稿台候选 ' + n.name + ' 不在 GD.roster 里');
      ok(!!n.alias && !!n.note, '定稿台候选 ' + n.name + ' 缺少 alias/note');
    }
    const optIds = p.options.map(o => o.id);
    ok(new Set(optIds).size === optIds.length, '定稿台处置 id 重复');
    for (const o of p.options) ok(!!o.text && !!o.hint, '处置 ' + o.id + ' 缺少 text/hint');
  }
}

/* ---------------- 6. 台词量 / 时长 ---------------- */
let totalLines = 0, totalChars = 0;
for (const id of newNodes) {
  for (const line of (D[id].lines || [])) {
    totalLines++;
    totalChars += (line.text || '').length;
  }
}
// 阅读速度按中文 9 字/秒 + 每句 0.9 秒点击停顿估算；解谜操作按每道题 2.5 分钟估算
// （四道题的实测操作量：推演台 4 次落子、对照台 12 行标 5 处、编排台 5 条复位、定稿台 12 选 1+4 选 1）。
const estReadSeconds = totalChars / 9 + totalLines * 0.9;
const estPuzzleMinutes = 4 * 2.5;
const estMinutes = estReadSeconds / 60 + estPuzzleMinutes;
const estReadMinutes = estReadSeconds / 60;
note('台词 ' + totalLines + ' 句 / ' + totalChars + ' 字 → 纯阅读约 ' + estReadMinutes.toFixed(1) +
  ' 分钟；加四道解谜操作约 ' + estMinutes.toFixed(1) + ' 分钟');
ok(totalLines >= 120, '台词量偏少：' + totalLines + ' 句（应 ≥ 120）');
ok(estReadMinutes >= 7, '纯阅读时长偏短：' + estReadMinutes.toFixed(1) + ' 分钟（应 ≥ 7）');
ok(estMinutes >= 15, '估算时长偏短：' + estMinutes.toFixed(1) + ' 分钟（应 ≥ 15）');

/* ---------------- 7. 原版数据未被改动 ---------------- */
const ORIGINAL_NODES = ['d_wake', 'd_wake_plate', 'd_boss_defeat', 'd_ending_original', 'd_ending_revision'];
for (const id of ORIGINAL_NODES) {
  ok(!!D[id], '原版节点 ' + id + ' 不见了');
}
const originalCount = Object.keys(D).length - newNodes.length;
ok(originalCount === 58, '原版对白节点数应为 58，实际 ' + originalCount);

// 原版结局仍以「——第一章完。」收
for (const id of ['d_ending_original', 'd_ending_revision']) {
  const lines = (D[id].lines || []).map(l => l.text).join('');
  ok(lines.indexOf('第一章完') >= 0, '原版结局 ' + id + ' 的收束语被改动');
}

/* ---------------- 8. 任务 ---------------- */
const quest = GD.quests && GD.quests.interlude_ch0;
ok(!!quest, '缺少任务 interlude_ch0');
if (quest) {
  ok(quest.steps.length === 8, '任务应有 8 步，实际 ' + quest.steps.length);
  for (const s of quest.steps) {
    ok(!!s.id && !!s.name, '任务步骤缺 id/name');
    const flags = s.flagsAny || s.flagsAll || [];
    ok(flags.length > 0, '任务步骤 ' + s.id + ' 没有 flag 条件');
    for (const f of flags) ok(!!GD.flags[f], '任务步骤 ' + s.id + ' 引用了未登记的 flag ' + f);
  }
}

/* ---------------- 输出 ---------------- */
function report() {
  if (notes.length && (verbose || errors.length === 0)) {
    console.log('\n说明：');
    for (const n of notes) console.log('  · ' + n);
  }
  if (errors.length) {
    console.log('\n错误 ' + errors.length + ' 条：');
    for (const e of errors) console.log('  ✗ ' + e);
    process.exit(1);
  }
  console.log('\n剧情校验通过：' + newNodes.length + ' 个节点 / ' + totalLines + ' 句台词 / 约 ' + estMinutes.toFixed(1) + ' 分钟 / 4 幕 4 种玩法。');
  process.exit(0);
}

if (verbose) {
  console.log('幕间：' + IL.version + ' / ' + ACTS.length + ' 幕');
  console.log('模式：' + Object.keys(IL.modes).join(', '));
  console.log('指令：' + Object.keys(IL.ops).join(', '));
  console.log('新增 flag：' + Object.keys(GD.flags).filter(k => /^act[1-4]\./.test(k)).length);
  console.log('新增道具：' + Object.keys(GD.items).filter(k => ['roster_copy', 'blank_row', 'two_versions', 'rule_wall', 'signed_row', 'empty_eighth', 'own_name', 'open_case'].indexOf(k) >= 0).length);
}

report();
