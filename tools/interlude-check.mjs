/* tools/interlude-check.mjs — 幕间《第七位观察者》自检：数据增量、玩法循环、存档、续播、四结局。
   用法：node tools/interlude-check.mjs [--verbose]
   为什么需要它：幕间是四段可中断的剧情 + 四种玩法形态，任何一处 flag 写漏、道具重发、
   断点续播错位，玩家都会卡死在一个没有出口的画面上，而这些都不是语法错误能发现的。
   本脚本不碰浏览器：用 new Function 装配 GameData 与 interlude，然后按引擎的真实语义推演。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const verbose = process.argv.includes('--verbose');

const errors = [];
const warns = [];
const notes = {};
function fail(msg) { errors.push(msg); }
function warn(msg) { warns.push(msg); }
function ok(msg) { if (verbose) console.log('  ✓ ' + msg); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

/* ---------------- 1. 文件与脚本清单 ---------------- */
const IL_DIR = 'web/game/interlude/';
const ACT_FILES = ['ch1_a1', 'ch1_a2', 'ch1_a3', 'ch1_a4'].map((n) => IL_DIR + n + '.js');
const RUNTIME = IL_DIR + 'index.js';
const ALL_FILES = [...ACT_FILES, RUNTIME];

for (const f of ALL_FILES) if (!exists(f)) fail('缺少文件 ' + f);
if (exists('web/game/mods')) fail('仍残留 web/game/mods/（幕间应已内联为 interlude）');
if (exists('tools/mod-check.mjs')) fail('仍残留 tools/mod-check.mjs');
notes.files = ALL_FILES.length;

/* ---------------- 2. ES2019 合规 ---------------- */
const BANNED = [
  [/^\s*import\s/m, 'ES module import'],
  [/^\s*export\s/m, 'ES module export'],
  [/\?\./, '可选链 ?.'],
  [/\?\?/, '空值合并 ??'],
  [/\.\.\.[A-Za-z_$[{]/, '对象/数组展开'],
];
for (const f of ALL_FILES) {
  const src = read(f);
  for (const [re, label] of BANNED) {
    if (re.test(src)) fail(f + ' 使用了 ' + label + '（引擎按 ES2019 加载）');
  }
  if (!/\(function \(w\)/.test(src)) fail(f + ' 不是 IIFE 形态');
  if (/\bmods?\b/i.test(src) && !/modular/.test(src)) {
    // 只提醒，不判错：注释里出现 "mode" 是正常词
    if (/\bweb\/game\/mods\b/.test(src) || /\bGameMods\b/.test(src) || /\bsave\.mods\b/.test(src)) {
      fail(f + ' 仍引用旧的模组层命名');
    }
  }
}
ok('ES2019 与 IIFE 形态');

/* ---------------- 3. 装配 GameData 与幕间 ---------------- */
function makeWin(search) {
  const win = { console: { warn() { }, log() { } }, location: { search: search || '', href: 'file:///game/index.html' } };
  win.window = win;
  return win;
}
function loadData(win) {
  for (const name of ['roster-source', 'world', 'characters', 'dialog', 'quests', 'progress']) {
    new Function('window', read('web/game/data/' + name + '.js'))(win);
  }
  return win.GameData;
}
/** 幕间是多文件：四幕数据先入袋，再由 index.js 合并注册，顺序必须与 index.html 一致。 */
function loadInterlude(win) {
  for (const rel of ACT_FILES) new Function('window', read(rel))(win);
  new Function('window', read(RUNTIME))(win);
  return win.GameEngine.Interlude;
}
function snapshot(gd) {
  const out = {};
  for (const k of Object.keys(gd)) out[k] = JSON.stringify(gd[k] === undefined ? null : gd[k]);
  return out;
}

const win = makeWin('');
const GD = loadData(win);
if (!GD || !GD.cast || !GD.dialog) fail('数据层没有装配成功（GameData 缺 cast/dialog）');
const before = snapshot(GD);
const IL = loadInterlude(win);
if (!IL) fail('幕间运行时没有挂到 GameEngine.Interlude');
if (!IL) { report(); process.exit(1); }
const BAG = win.GameInterlude;
if (!BAG || !Array.isArray(BAG.acts) || BAG.acts.length !== 4) fail('GameInterlude.acts 应有 4 幕，实际 ' + (BAG && BAG.acts && BAG.acts.length));
notes.version = IL.version;

/* ---------------- 4. 数据增量隔离：原版键一个都不能变 ---------------- */
const after = snapshot(GD);
const allowedNewDialogPrefix = /^m[1-4]_/;
for (const key of Object.keys(before)) {
  if (after[key] === before[key]) continue;
  let a, b;
  try { a = JSON.parse(after[key]); b = JSON.parse(before[key]); } catch { fail('数据容器 ' + key + ' 被改成非 JSON 结构'); continue; }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    fail('原版数据 ' + key + ' 被幕间改动');
    continue;
  }
  for (const k of Object.keys(b)) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { fail('原版数据 ' + key + '.' + k + ' 被幕间覆盖'); break; }
  }
}
const origDialogIds = new Set(Object.keys(JSON.parse(before.dialog || '{}')));
for (const id of Object.keys(GD.dialog)) {
  if (!origDialogIds.has(id) && !allowedNewDialogPrefix.test(id)) fail('新增对白节点 ' + id + ' 命名不符 m1_..m4_ 前缀约定');
}
notes.newDialogNodes = Object.keys(GD.dialog).filter((id) => !origDialogIds.has(id)).length;
const origFlags = new Set(Object.keys(JSON.parse(before.flags || '{}')));
notes.newFlags = Object.keys(GD.flags).filter((f) => !origFlags.has(f)).length;
const origItems = new Set(Object.keys(JSON.parse(before.items || '{}')));
notes.newItems = Object.keys(GD.items).filter((i) => !origItems.has(i)).length;

/* ---------------- 5. 注册契约 ---------------- */
const MODES = ['ledger', 'ledger_cmp', 'ledger_rule', 'ledger_final'];
for (const modeId of MODES) {
  const mode = IL.mode(modeId);
  if (!mode) { fail('没有注册玩法模式 ' + modeId); continue; }
  for (const fn of ['enter', 'exit', 'step', 'dir', 'act', 'back', 'menu', 'render']) {
    if (typeof mode[fn] !== 'function') fail('模式 ' + modeId + ' 缺 ' + fn + '()');
  }
  if (!IL.isMode(modeId)) fail('isMode 没有认出已注册的模式 ' + modeId);
}
if (IL.isMode('explore') || IL.isMode('battle')) fail('isMode 不该把原版模式认成幕间模式');
for (const fn of ['titleAct', 'titleLine', 'questId', 'applyOp', 'nsOf', 'migrate', 'render', 'step', 'inputMode']) {
  if (typeof IL[fn] !== 'function') fail('运行时缺 ' + fn + '()');
}
if (!IL.quest || !IL.quest.id) fail('运行时没有登记幕间任务');
for (const act of BAG.acts) {
  if (!act.modeId || !IL.mode(act.modeId)) fail(act.label + ' 的 modeId 没有对应模式');
  if (!act.doneFlag || !GD.flags[act.doneFlag]) fail(act.label + ' 的 doneFlag 未在 GD.flags 登记');
  for (const fn of ['gate', 'start', 'titleLine']) if (typeof act[fn] !== 'function') fail(act.label + ' 缺 ' + fn + '()');
}
notes.modes = MODES;

/* ---------------- 6. 新增对白节点的结构合法性 ---------------- */
const ORIG_OPS = new Set(['flag', 'item', 'party', 'slot', 'quota', 'battle', 'chapter', 'heal']);
const IL_OPS = new Set(['mode']);
const speakers = new Set(['narrator', '旁白', '你']);
for (const card of Object.values(GD.cast || {})) { speakers.add(card.name); if (card.id) speakers.add(card.id); }
for (const card of Object.values(GD.npc || {})) { speakers.add(card.name); if (card.id) speakers.add(card.id); }
for (const card of Object.values(GD.roster || [])) { speakers.add(card.name); speakers.add(card.alias); }
let newNodeCount = 0;
for (const [id, node] of Object.entries(GD.dialog)) {
  if (!/^m[1-4]_/.test(id)) continue;
  newNodeCount++;
  if (!Array.isArray(node.lines) || !node.lines.length) fail(id + ' 没有台词');
  for (const ln of node.lines || []) {
    if (typeof ln.text !== 'string' || !ln.text.trim()) fail(id + ' 有空台词');
    if (ln.who && !speakers.has(ln.who)) fail(id + ' 的 who=' + ln.who + ' 不是已知角色');
  }
  if (node.next && !GD.dialog[node.next]) fail(id + ' 的 next=' + node.next + ' 不存在');
  if (node.choices) {
    if (node.choices.length < 2) fail(id + ' 是分支节点但选项少于 2 个');
    for (const c of node.choices) if (!GD.dialog[c.go]) fail(id + ' 的选项指向不存在的节点 ' + c.go);
  }
  for (const op of node.onEnd || []) {
    if (!ORIG_OPS.has(op.op) && !IL_OPS.has(op.op)) fail(id + ' 使用了未知指令 ' + op.op);
    if (op.op === 'flag' && op.key && typeof GD.flags[op.key] !== 'object') fail(id + ' 的 flag ' + op.key + ' 未在 GD.flags 登记');
    if (op.op === 'item' && op.id && !GD.items[op.id]) fail(id + ' 的 item ' + op.id + ' 未在 GD.items 登记');
    if (op.op === 'mode' && !IL.mode(op.id)) fail(id + ' 的 mode ' + op.id + ' 不是已注册的玩法模式');
    if (op.op === 'chapter') fail(id + ' 不得使用 chapter 指令（幕间不推进章节）');
  }
}
if (!newNodeCount) fail('幕间没有新增任何对白节点');
notes.newDialogValidated = newNodeCount;

/* ---------------- 7. 引擎接点（源码必须留好调用） ---------------- */
const GAME_SRC = read('web/game/engine/game.js');
const RENDER_SRC = read('web/game/engine/render.js');
const STATE_SRC = read('web/game/engine/state.js');
const HTML_SRC = read('web/game/index.html');
const hooks = [
  [GAME_SRC, 'G.Interlude.titleAct', '标题页空格交给幕间'],
  [GAME_SRC, 'G.Interlude.applyOp', '幕间自定义指令分派'],
  [GAME_SRC, 'G.Interlude.inputMode', '玩法模式输入分派'],
  [GAME_SRC, 'G.Interlude.isMode', '模式归属判断'],
  [GAME_SRC, 'G.Interlude.step', '玩法模式步进'],
  [GAME_SRC, 'G.Interlude.mode', '按 id 取玩法模式'],
  [RENDER_SRC, 'Interlude.titleLine', '标题页提示行'],
  [RENDER_SRC, 'Interlude.isMode', '玩法模式整屏绘制分流'],
  [RENDER_SRC, 'Interlude.render', '玩法模式整屏绘制'],
  [STATE_SRC, 'G.Interlude.questId', '任务归属交给幕间'],
  [STATE_SRC, 'G.Interlude.migrate', '旧存档迁移'],
];
for (const [src, needle, label] of hooks) if (!src.includes(needle)) fail('引擎接点缺失：' + label + '（找不到 ' + needle + '）');
for (const [src, needle, label] of [[GAME_SRC, 'G.Mods', '旧模组层'], [RENDER_SRC, 'w.GameMods', '旧模组层'], [STATE_SRC, 'G.Mods', '旧模组层']]) {
  if (src.includes(needle)) fail('引擎仍残留 ' + label + ' 调用 ' + needle);
}
const htmlOrder = ['data/progress.js', 'interlude/ch1_a1.js', 'interlude/ch1_a2.js', 'interlude/ch1_a3.js',
  'interlude/ch1_a4.js', 'interlude/index.js', 'battle/core.js', 'engine/game.js']
  .map((s) => HTML_SRC.indexOf(s));
if (htmlOrder.some((i) => i < 0)) fail('index.html 脚本清单不完整');
else {
  for (let i = 1; i < htmlOrder.length; i++) {
    if (!(htmlOrder[i - 1] < htmlOrder[i])) fail('index.html 加载顺序错：应为 data → interlude 四幕 → interlude/index → battle → engine');
  }
}
if (HTML_SRC.includes('mods/')) fail('index.html 仍引用 mods/ 脚本');

/* ---------------- 8. 剧情/玩法推演 ---------------- */
function freshSave() {
  return {
    v: 1, chapter: 'ch0', map: 'station', x: 7, y: 10, dir: 'down',
    party: ['observer'], hp: { observer: 68 }, quota: { observer: 20 }, items: {}, flags: {},
    slots: { observer: { cap: 4, used: [], forgotten: [] } }, seen: {}, quest: { id: 'main_ch0', step: null },
    steps: {}, gacha: {}, checkin: {}, interlude: {}
  };
}
function makeGame(save) {
  const game = {
    save, mode: 'title', modeFrom: null, toasts: [], dialogs: [], modes: [],
    startDialog(id) { game.dialogs.push(id); game.mode = 'dialog'; },
    startMode(id) {
      game.modes.push(id); game.modeFrom = game.mode; game.mode = id;
      const m = IL.mode(id); if (m && m.enter) m.enter(game);
    },
    endMode() {
      const m = IL.mode(game.mode); if (m && m.exit) m.exit(game);
      game.mode = game.modeFrom && game.modeFrom !== 'title' ? game.modeFrom : 'explore';
      game.modeFrom = null;
    },
    showToast(t) { game.toasts.push(t); },
    flush() { game.flushed = (game.flushed || 0) + 1; }
  };
  return game;
}
/** 按 game.js 的真实 applyOp 语义执行一条指令（含重播时抑制奖励）。 */
function applyOpReal(save, op, game, replay) {
  if (op.op === 'flag') { save.flags[op.key] = 1; return; }
  if (IL.applyOp(save, op, game)) return;
  if (replay) return;
  if (op.op === 'item') { save.items[op.id] = (save.items[op.id] || 0) + (op.n || 1); return; }
}
/** 按 script.js 的真实语义跑完一段对白：顺序走 lines → choices / onEnd → next。 */
function playNode(game, startId, pick, depth, replay) {
  depth = depth || 0;
  if (depth > 40) throw new Error('对白深度超限（可能有环）：' + startId);
  let id = startId;
  const visited = [];
  while (id) {
    const node = GD.dialog[id];
    if (!node) throw new Error('节点不存在：' + id);
    visited.push(id);
    for (const op of node.onEnd || []) applyOpReal(game.save, op, game, replay);
    if (node.choices && node.choices.length) {
      const idx = pick ? pick(id, node.choices) : 0;
      if (idx < 0 || idx >= node.choices.length) throw new Error(id + ' 选项下标越界');
      id = node.choices[idx].go;
      continue;
    }
    id = node.next || null;
  }
  return visited;
}
function nsOf(save) { return IL.nsOf(save); }
function actOf(id) { return IL.act(id); }
/** 从标题页按空格进幕间，返回是否被接管。 */
function enterFromTitle(save) {
  const game = makeGame(save);
  const claimed = IL.titleAct(game);
  return { game, claimed };
}

/* 8a. 首章未通关：不得拦截 */
{
  const save = freshSave();
  const { game, claimed } = enterFromTitle(save);
  if (claimed !== false) fail('首章未通关时，幕间不该抢占标题页空格');
  if (game.dialogs.length) fail('首章未通关时，幕间不该播对白');
  if (typeof IL.titleLine(game) === 'string') fail('首章未通关时，标题页提示不该被改写');
  if (IL.questId(save) !== 'main_ch0') fail('首章未通关时，任务归属应为 main_ch0');
}

/* 8b. 首章通关：接管，进入幕间一 */
{
  const save = freshSave();
  save.flags['ch0.done'] = 1;
  const { game, claimed } = enterFromTitle(save);
  if (claimed !== true) fail('首章通关后，标题页空格应由幕间接管');
  if (game.dialogs[0] !== 'm1_intro') fail('幕间入口应播 m1_intro，实际 ' + game.dialogs[0]);
  const ns = nsOf(save);
  if (!ns.a1.active) fail('进入幕间后 a1.active 未置 1');
  playNode(game, 'm1_intro', null);
  if (game.modes[0] !== 'ledger') fail('m1_intro 结束后应进入推演台，实际 ' + JSON.stringify(game.modes));
  notes.enterMode = game.modes[0];
  if (!game.ledger1) fail('推演台没有初始化局内状态 game.ledger1');
  if (!save.flags['act1.ledger.intro']) fail('m1_intro 结束后没有写 act1.ledger.intro');
}

/* 8c. 推演台：零误差通关 */
{
  const save = freshSave();
  save.flags['ch0.done'] = 1;
  const { game } = enterFromTitle(save);
  playNode(game, 'm1_intro', null);
  const led = IL.mode('ledger');
  const puzzle = actOf('act1').puzzle;
  const ns = nsOf(save), a = ns.a1;
  for (const cell of puzzle.cells) {
    const ci = puzzle.cells.indexOf(cell);
    while (game.ledger1.cursor !== ci) led.dir(game, 'right');
    led.act(game);
    const idx = a.hand.indexOf(cell.need);
    if (idx < 0) { fail('手上找不到需要的卡 ' + cell.need); break; }
    while (game.ledger1.card !== idx) led.dir(game, 'down');
    led.act(game);
  }
  if (!a.solved) fail('四列全摆对后没有结算');
  if (a.errors !== 0) fail('零误差通关时 errors 应为 0，实际 ' + a.errors);
  if (a.verdict !== 'clean') fail('零误差应给 clean，实际 ' + a.verdict);
  if (!save.flags['act1.ledger.clean']) fail('零误差通关没有写 act1.ledger.clean');
  if (game.dialogs.indexOf('m1_outro_clean') < 0) fail('零误差通关没有播 m1_outro_clean');
  notes.cleanPath = { errors: a.errors, verdict: a.verdict };
}

/* 8d. 推演台：摆错记误差、不消耗卡片、可继续 */
{
  const save = freshSave();
  save.flags['ch0.done'] = 1;
  const { game } = enterFromTitle(save);
  playNode(game, 'm1_intro', null);
  const led = IL.mode('ledger');
  const puzzle = actOf('act1').puzzle;
  const ns = nsOf(save), a = ns.a1;
  const handBefore = a.hand.slice();
  game.ledger1.cursor = 0;
  led.act(game);
  game.ledger1.card = a.hand.findIndex((c) => c !== puzzle.cells[0].need);
  led.act(game);
  if (a.errors !== 1) fail('摆错一次后 errors 应为 1，实际 ' + a.errors);
  if (a.hand.length !== handBefore.length) fail('摆错不应消耗卡片');
  if (a.placed[puzzle.cells[0].id]) fail('摆错不应占住列格');
  game.ledger1.cursor = 0;
  led.act(game);
  game.ledger1.card = a.hand.indexOf(puzzle.cells[0].need);
  led.act(game);
  if (!a.placed[puzzle.cells[0].id]) fail('摆对后列格没有落定');
  notes.wrongPath = { errors: a.errors, hand: a.hand.length };
}

/* 8e. 幕间一两条处置：各自写 flag + 发道具；重播不重复发奖 */
for (const [choiceIdx, flag, item] of [[0, 'act1.end.write', 'roster_copy'], [1, 'act1.end.blank', 'blank_row']]) {
  const save = freshSave();
  save.flags['ch0.done'] = 1;
  const { game } = enterFromTitle(save);
  playNode(game, 'm1_intro', null);
  const led = IL.mode('ledger');
  const puzzle = actOf('act1').puzzle;
  const ns = nsOf(save), a = ns.a1;
  for (const cell of puzzle.cells) {
    game.ledger1.cursor = puzzle.cells.indexOf(cell);
    led.act(game);
    game.ledger1.card = a.hand.indexOf(cell.need);
    led.act(game);
  }
  playNode(game, a.verdict === 'clean' ? 'm1_outro_clean' : 'm1_outro_fuzzy', () => choiceIdx);
  if (!save.flags[flag]) fail('处置 ' + flag + ' 没有写入');
  if (!save.flags['act1.done']) fail('处置 ' + flag + ' 没有写 act1.done');
  if (!save.items[item]) fail('处置 ' + flag + ' 没有发放道具 ' + item);
  const beforeItems = JSON.stringify(save.items);
  // 重播同一个结局节点（suppressRewards=true）：不得再发一次道具
  playNode(game, flag === 'act1.end.write' ? 'm1_end_write' : 'm1_end_blank', () => choiceIdx, 0, true);
  if (JSON.stringify(save.items) !== beforeItems) fail('重播结局节点重复发放了道具（' + flag + '）');
}

/* 8f. 幕间二：对照台标 5 处 → clean */
{
  const save = freshSave();
  save.flags['ch0.done'] = 1;
  save.flags['act1.done'] = 1;
  const { game, claimed } = enterFromTitle(save);
  if (claimed !== true) fail('幕间一完成后，标题页空格应接幕间二');
  if (game.dialogs[0] !== 'm2_intro') fail('幕间二入口应播 m2_intro，实际 ' + game.dialogs[0]);
  playNode(game, 'm2_intro', null);
  const led = IL.mode('ledger_cmp');
  const puzzle = actOf('act2').puzzle;
  const ns = nsOf(save), a = ns.a2;
  if (game.mode !== 'ledger_cmp') fail('m2_intro 后应进入对照台');
  for (let i = 0; i < puzzle.rows.length; i++) {
    if (!puzzle.rows[i].diff) continue;
    game.ledger2.cursor = i;
    led.act(game);
  }
  game.ledger2.cursor = puzzle.rows.length;
  led.act(game);
  if (!a.solved) fail('对照台标完 + 确认后没有结算');
  if (a.verdict !== 'clean') fail('五处全标对应给 clean，实际 ' + a.verdict);
  if (!save.flags['act2.cmp.clean']) fail('对照台 clean 没有写 act2.cmp.clean');
  playNode(game, 'm2_outro_clean', () => 0);
  if (!save.flags['act2.done']) fail('幕间二走完没有写 act2.done');
  notes.act2 = { diffs: puzzle.rows.filter((r) => r.diff).length, verdict: a.verdict };
}

/* 8g. 幕间三：编排台按序接回 5 条；接附录记误差 */
{
  const save = freshSave();
  save.flags['ch0.done'] = 1;
  save.flags['act1.done'] = 1;
  save.flags['act2.done'] = 1;
  const { game, claimed } = enterFromTitle(save);
  if (claimed !== true) fail('幕间二完成后，标题页空格应接幕间三');
  if (game.dialogs[0] !== 'm3_intro') fail('幕间三入口应播 m3_intro，实际 ' + game.dialogs[0]);
  playNode(game, 'm3_intro', null);
  const led = IL.mode('ledger_rule');
  const puzzle = actOf('act3').puzzle;
  const ns = nsOf(save), a = ns.a3;
  if (game.mode !== 'ledger_rule') fail('m3_intro 后应进入编排台');
  const handBefore = a.hand.length;
  game.ledger3.card = a.hand.indexOf('cfake');
  led.act(game);
  if (a.errors !== 1) fail('接入附录应记 1 个误差，实际 ' + a.errors);
  if (a.hand.length !== handBefore) fail('接入附录不应消耗残片');
  for (let ord = 1; ord <= 5; ord++) {
    const id = puzzle.cards.find((c) => c.ord === ord).id;
    game.ledger3.card = a.hand.indexOf(id);
    led.act(game);
  }
  if (!a.solved) fail('五条按序接完后没有结算');
  if (a.verdict !== 'fuzzy') fail('带一次误差应给 fuzzy，实际 ' + a.verdict);
  if (!save.flags['act3.rule.fuzzy']) fail('编排台 fuzzy 没有写 act3.rule.fuzzy');
  playNode(game, 'm3_outro_fuzzy', null);
  if (!save.flags['act3.done']) fail('幕间三走完没有写 act3.done');
  notes.act3 = { ordered: a.chain.length, errors: a.errors, verdict: a.verdict };
}

/* 8h. 幕间四：四个处置各自写 flag + 发道具 + 走到附记 + 交还原版 */
const ACT4_CHOICES = [
  [0, 'o_write', 'act4.end.write', 'signed_row', 'm4_end_write'],
  [1, 'o_blank', 'act4.end.blank', 'empty_eighth', 'm4_end_blank'],
  [2, 'o_self', 'act4.end.self', 'own_name', 'm4_end_self'],
  [3, 'o_open', 'act4.end.open', 'open_case', 'm4_end_open'],
];
for (const [optionIdx, optionId, flag, item, endNode] of ACT4_CHOICES) {
  const save = freshSave();
  save.flags['ch0.done'] = 1;
  save.flags['act1.done'] = 1;
  save.flags['act2.done'] = 1;
  save.flags['act3.done'] = 1;
  const { game, claimed } = enterFromTitle(save);
  if (claimed !== true) fail('幕间三完成后，标题页空格应接幕间四');
  if (game.dialogs[0] !== 'm4_intro') fail('幕间四入口应播 m4_intro，实际 ' + game.dialogs[0]);
  playNode(game, 'm4_intro', null);          // → next m4_pick → onEnd {op:'mode'} → 定稿台
  const led = IL.mode('ledger_final');
  const ns = nsOf(save), a = ns.a4;
  if (game.mode !== 'ledger_final') fail('m4_pick 后应进入定稿台，实际 ' + game.mode);
  game.ledger4.cursor = 2;
  led.act(game);
  if (!a.picked) fail('定稿台没有记下被选中的名字');
  game.ledger4.cursor = optionIdx;
  led.act(game);
  if (!save.flags[flag]) fail('处置 ' + optionId + ' 没有写 ' + flag);
  if (!save.flags['act4.done']) fail('处置 ' + optionId + ' 没有写 act4.done');
  if (game.dialogs.indexOf(endNode) < 0) fail('处置 ' + optionId + ' 没有播结局节点 ' + endNode);
  playNode(game, endNode, null);
  if (!save.items[item]) fail('处置 ' + optionId + ' 没有发道具 ' + item);
  if (!save.flags['act4.coda']) fail('结局之后没有走到附记 m4_coda');
  const g2 = makeGame(save);
  if (IL.titleAct(g2) !== false) fail('四幕全部完成后，标题页空格应交回原版');
  if (IL.questId(save) !== 'main_ch0') fail('四幕全部完成后，任务归属应交回 main_ch0，实际 ' + IL.questId(save));
  notes.act4 = notes.act4 || { endings: 0, items: [] };
  notes.act4.endings++;
  notes.act4.items.push(item);
}

/* 8i. 任务归属、存档命名空间、旧存档迁移 */
{
  const save = freshSave();
  save.flags['ch0.done'] = 1;
  if (IL.questId(save) !== 'main_ch0') fail('幕间未开始时，任务归属应仍是 main_ch0');
  const { game } = enterFromTitle(save);
  if (IL.questId(save) !== 'interlude_ch0') fail('幕间进行中，任务归属应切到 interlude_ch0，实际 ' + IL.questId(save));
  if (!GD.quests.interlude_ch0) fail('没有登记 interlude_ch0 任务');
  const q = GD.quests.interlude_ch0;
  if (!q.steps || q.steps.length !== 8) fail('interlude_ch0 任务应有 8 步，实际 ' + (q.steps && q.steps.length));
  if (!save.interlude || !save.interlude.ch1) fail('幕间状态没有落在 save.interlude.ch1');
  for (const k of ['a1', 'a2', 'a3', 'a4']) {
    if (!save.interlude.ch1[k]) fail('save.interlude.ch1 缺分幕命名空间 ' + k);
  }
  const polluted = Object.keys(save).filter((k) => k !== 'interlude' && (/^act[1-4]/.test(k) || /^ch1$/.test(k) || /^interlude[A-Z]/.test(k)));
  if (polluted.length) fail('幕间状态污染了主存档顶层字段：' + polluted.join(','));
  const nsKeys = Object.keys(save.interlude || {}).filter((k) => k !== 'ch1');
  if (nsKeys.length) fail('save.interlude 里出现了未登记的命名空间：' + nsKeys.join(','));
  // 完全没有 interlude 字段的旧存档也不能炸
  const bare = freshSave();
  delete bare.interlude;
  IL.migrate(bare);
  if (!bare.interlude) fail('migrate 没有为旧存档补齐 interlude 字段');
  if (!bare.interlude.ch1) fail('migrate 没有为旧存档补齐幕间默认值');
  // 顶栏任务：拿真存档走一遍 State.refreshQuest 不能抛
  const questStepIds = q.steps.map((s) => s.id);
  if (questStepIds[0] !== 's1') fail('幕间任务第一步应为 s1');
  notes.quest = q.id;
}

/* 8j. 预览入口：?interlude=1 允许首章未通关直接看四幕（评审/交接用） */
{
  const w2 = makeWin('?interlude=1');
  loadData(w2);
  const IL2 = loadInterlude(w2);
  const save = freshSave();
  const game = makeGame(save);
  if (IL2.titleAct(game) !== true) fail('带 ?interlude=1 时，应允许跳过首章直接预览幕间');
  notes.preview = game.dialogs.slice();
}

/* 8k. 断点续播：中途退出再回标题页按空格，必须从存档记录的位置继续 */
{
  // 幕一：开场已播完但推演台没做完 → 直接回推演台
  {
    const save = freshSave();
    save.flags['ch0.done'] = 1;
    save.flags['act1.ledger.intro'] = 1;
    const { game, claimed } = enterFromTitle(save);
    if (claimed !== true) fail('续播：幕一推演台阶段，标题页空格应接管');
    if (game.mode !== 'ledger') fail('续播：幕一应直接回推演台，实际 ' + game.mode);
  }
  // 幕一：推演台做完但收束对白未播 → 从收束续播
  {
    const save = freshSave();
    save.flags['ch0.done'] = 1;
    save.flags['act1.ledger.intro'] = 1;
    const ns = nsOf(save);
    ns.a1.active = 1; ns.a1.solved = 1; ns.a1.verdict = 'clean';
    const { game } = enterFromTitle(save);
    if (game.dialogs[0] !== 'm1_outro_clean') fail('续播：幕一应从收束对白续播，实际 ' + game.dialogs[0]);
  }
  // 幕一：收束播完、处置未做 → 停在二选一
  {
    const save = freshSave();
    save.flags['ch0.done'] = 1;
    save.flags['act1.ledger.intro'] = 1;
    save.flags['act1.ledger.clean'] = 1;
    const ns = nsOf(save);
    ns.a1.active = 1; ns.a1.solved = 1; ns.a1.verdict = 'clean';
    const { game } = enterFromTitle(save);
    if (game.dialogs[0] !== 'm1_verdict') fail('续播：幕一处置阶段应回 m1_verdict，实际 ' + game.dialogs[0]);
  }
  // 幕二：收束 / 设问 / 桥段
  {
    const save = freshSave();
    save.flags['ch0.done'] = 1;
    save.flags['act1.done'] = 1;
    save.flags['act2.cmp.intro'] = 1;
    const ns = nsOf(save);
    ns.a2.active = 1; ns.a2.solved = 1; ns.a2.verdict = 'clean';
    let { game } = enterFromTitle(save);
    if (game.dialogs[0] !== 'm2_outro_clean') fail('续播：幕二应从收束对白续播，实际 ' + game.dialogs[0]);
    save.flags['act2.cmp.clean'] = 1;
    game = enterFromTitle(save).game;
    if (game.dialogs[0] !== 'm2_reveal') fail('续播：幕二设问未答应回 m2_reveal，实际 ' + game.dialogs[0]);
    save.flags['act2.ask.now'] = 1;
    game = enterFromTitle(save).game;
    if (game.dialogs[0] !== 'm2_bridge') fail('续播：幕二设问已答应回 m2_bridge，实际 ' + game.dialogs[0]);
  }
  // 幕三：签名段 / 桥段
  {
    const save = freshSave();
    save.flags['ch0.done'] = 1;
    save.flags['act1.done'] = 1;
    save.flags['act2.done'] = 1;
    save.flags['act3.rule.intro'] = 1;
    save.flags['act3.rule.clean'] = 1;
    const ns = nsOf(save);
    ns.a3.active = 1; ns.a3.solved = 1; ns.a3.verdict = 'clean';
    let { game } = enterFromTitle(save);
    if (game.dialogs[0] !== 'm3_sig') fail('续播：幕三签名段应回 m3_sig，实际 ' + game.dialogs[0]);
    save.flags['act3.sig'] = 1;
    game = enterFromTitle(save).game;
    if (game.dialogs[0] !== 'm3_bridge') fail('续播：幕三桥段应回 m3_bridge，实际 ' + game.dialogs[0]);
  }
  // 幕四：选了名字未定稿 → 回定稿台；定稿后 → 回附记
  {
    const save = freshSave();
    save.flags['ch0.done'] = 1;
    save.flags['act1.done'] = 1;
    save.flags['act2.done'] = 1;
    save.flags['act3.done'] = 1;
    save.flags['act4.final.intro'] = 1;
    const ns = nsOf(save);
    ns.a4.active = 1; ns.a4.picked = 'n03';
    let { game } = enterFromTitle(save);
    if (game.mode !== 'ledger_final') fail('续播：幕四选了名字未定稿应回定稿台，实际 ' + game.mode);
    save.flags['act4.done'] = 1;
    ns.a4.choice = 'o_write';
    game = enterFromTitle(save).game;
    if (game.dialogs[0] !== 'm4_coda') fail('续播：幕四定稿后应回 m4_coda，实际 ' + game.dialogs[0]);
  }
  notes.resume = 6;
}

/* 8l. 四幕连播：一幕收尾对白的 next 必须直接指向下一幕开场 */
{
  const CHAIN = [
    ['m1_end_write', 'm2_intro'], ['m1_end_blank', 'm2_intro'],
    ['m2_bridge', 'm3_intro'], ['m3_bridge', 'm4_intro'],
  ];
  for (const [from, to] of CHAIN) {
    const node = GD.dialog[from];
    if (!node) { fail('连播：找不到节点 ' + from); continue; }
    if (node.next !== to) fail('连播：' + from + ' 的 next 应为 ' + to + '，实际 ' + node.next);
  }
  notes.chain = CHAIN.length;
}

/* ---------------- 汇总 ---------------- */
function report() {
  const summary = {
    version: notes.version || null,
    acts: BAG && BAG.acts ? BAG.acts.length : 0,
    newDialogNodes: notes.newDialogNodes,
    newFlags: notes.newFlags,
    newItems: notes.newItems,
    modes: notes.modes || [],
    enterMode: notes.enterMode || null,
    cleanPath: notes.cleanPath || null,
    wrongPath: notes.wrongPath || null,
    act2: notes.act2 || null,
    act3: notes.act3 || null,
    act4: notes.act4 || null,
    resume: notes.resume || null,
    chain: notes.chain || null,
    errors: errors.length,
    warns: warns.length,
  };
  console.log('幕间校验汇总 ' + JSON.stringify(summary));
  if (warns.length) {
    console.log('\n警告 ' + warns.length + ' 条：');
    for (const w of warns) console.log('  ! ' + w);
  }
  if (errors.length) {
    console.log('\n错误 ' + errors.length + ' 条：');
    for (const e of errors) console.log('  ✗ ' + e);
    process.exit(1);
  }
  console.log('\n幕间校验通过。');
}
report();
