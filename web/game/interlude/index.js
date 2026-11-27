/* web/game/interlude/index.js — 幕间《第七位观察者》运行时：四幕剧情 + 四种玩法形态。
   加载位置：data/*.js 之后、engine/*.js 之前。四幕数据（ch1_a1..ch1_a4）先挂到 GameInterlude.acts，
   本文件把它们合进 GameData、注册四个玩法模式、提供存档命名空间与主线归属。
   约定：只追加 GameData 的键；运行时状态只落 save.interlude.ch1；不推章节、不碰首章的任何 flag。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};
  var BAG = w.GameInterlude = w.GameInterlude || { acts: [] };
  var ACTS = BAG.acts;

  function GD() { return w.GameData || {}; }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function warn(msg) { if (w.console && w.console.warn) w.console.warn('[interlude] ' + msg); }

  var MODES = {};
  var OPS = {};

  /* ---------------- 合并四幕数据 ---------------- */
  var DEFAULTS = {};
  var NODES = {};
  var FLAGS = {};
  var ITEMS = {};

  ACTS.forEach(function (act) {
    DEFAULTS[act.nsKey] = act.defaults;
    var k;
    for (k in act.nodes) if (Object.prototype.hasOwnProperty.call(act.nodes, k)) NODES[k] = act.nodes[k];
    for (k in act.flags) if (Object.prototype.hasOwnProperty.call(act.flags, k)) FLAGS[k] = act.flags[k];
    for (k in act.items) if (Object.prototype.hasOwnProperty.call(act.items, k)) ITEMS[k] = act.items[k];
    if (act.mode2 && act.modeId) MODES[act.modeId] = act.mode2;
  });

  function actById(id) {
    for (var i = 0; i < ACTS.length; i++) if (ACTS[i].id === id) return ACTS[i];
    return null;
  }
  function actByMode(modeId) {
    for (var i = 0; i < ACTS.length; i++) if (ACTS[i].modeId === modeId) return ACTS[i];
    return null;
  }

  /* ---------------- 合进 GameData（只追加，不改原版键） ---------------- */
  var QUEST = {
    id: 'interlude_ch0', name: '第七位观察者', chapter: 'ch1',
    summary: '序列共 12 行，名册上只有 11 个名字。第 8 行的编号是 000。',
    steps: [
      { id: 's1', name: '摆开推演台', hint: '与庭务谈过', flagsAny: ['act1.ledger.intro'] },
      { id: 's2', name: '推完四列', hint: '编号 / 条目 / 读数 / 分档', flagsAny: ['act1.ledger.clean', 'act1.ledger.fuzzy'] },
      { id: 's3', name: '处置第 8 行', hint: '写进名册，或留空只写批注', flagsAny: ['act1.end.write', 'act1.end.blank'] },
      { id: 's4', name: '摊开两份卷宗', hint: '与笺谈过', flagsAny: ['act2.cmp.intro'] },
      { id: 's5', name: '标出五处出入', hint: '十二行并排', flagsAny: ['act2.cmp.clean', 'act2.cmp.fuzzy'] },
      { id: 's6', name: '接回第五条规则', hint: '规则墙第五块铜牌', flagsAny: ['act3.rule.clean', 'act3.rule.fuzzy'] },
      { id: 's7', name: '打开铁盒', hint: '温室的第十四号苗床', flagsAny: ['act4.final.intro'] },
      { id: 's8', name: '定稿第 8 行', hint: '写名字，或让它继续空着', flagsAny: ['act4.done'] }
    ]
  };

  function install() {
    var gd = GD();
    gd.dialog = gd.dialog || {};
    gd.flags = gd.flags || {};
    gd.items = gd.items || {};
    gd.quests = gd.quests || {};
    Object.keys(NODES).forEach(function (id) { gd.dialog[id] = NODES[id]; });
    Object.keys(FLAGS).forEach(function (k) { gd.flags[k] = FLAGS[k]; });
    Object.keys(ITEMS).forEach(function (k) { gd.items[k] = ITEMS[k]; });
    gd.quests[QUEST.id] = QUEST;
    gd.interludeDoc = {
      id: 'ch1', version: '2.0.0', chapter: 'ch1',
      kind: 'story+form', title: '第七位观察者',
      entry: '首章任一结局完成后，标题画面按空格（或 URL 加 ?interlude=1 预览）',
      acts: ACTS.map(function (a) { return { id: a.id, label: a.label, title: a.title, mode: a.modeId }; }),
      forms: ACTS.map(function (a) { return a.puzzle.title; }),
      saveNamespace: 'interlude.ch1',
      flags: Object.keys(FLAGS)
    };
  }
  install();

  /* ---------------- 存档命名空间 ---------------- */
  /** 幕间状态只写 save.interlude.ch1；缺的补齐，保证旧存档也能读。 */
  function nsOf(save) {
    if (!save) return copy(DEFAULTS);
    if (!save.interlude) save.interlude = {};
    var ns = save.interlude.ch1;
    if (!ns) ns = save.interlude.ch1 = copy(DEFAULTS);
    for (var i = 0; i < ACTS.length; i++) {
      var a = ACTS[i];
      if (!ns[a.nsKey]) ns[a.nsKey] = copy(a.defaults);
    }
    return ns;
  }
  BAG.nsOf = nsOf;
  BAG.act = actById;

  function migrate(save) {
    if (!save) return;
    if (!save.flags) save.flags = {};
    if (!save.items) save.items = {};
    nsOf(save);
    return save;
  }

  /* ---------------- 章节闸门与进度 ---------------- */
  /** 预览入口：URL 带 ?interlude=1 时不必等首章通关，直接看四幕（评审/交接用）。 */
  function preview() {
    var s = String((w.location && w.location.search) || '');
    return /(?:^\?|&)interlude=1(?:&|$)/.test(s);
  }

  /**
   * 当前该进哪一幕：按顺序找第一个「前幕已收尾、本幕未收尾」的。
   * 收尾 = doneFlag 已写（不是玩法推完，而是收束对白也播完），中途退出不会让后续幕提前解锁。
   * 幕四例外：doneFlag 之后还有一段附记，整幕真正结束以 endFlag 为准。
   */
  function currentAct(save) {
    var ns = nsOf(save), pv = preview();
    for (var i = 0; i < ACTS.length; i++) {
      var act = ACTS[i], a = ns[act.nsKey];
      if (!act.gate(save) && !pv) return null;
      if (save.flags && save.flags[act.doneFlag] && (!act.endFlag || save.flags[act.endFlag])) continue;
      return { act: act, a: a, index: i };
    }
    return null;
  }

  /** 是否真的进过幕间（有任何一幕 active 或写过任一 doneFlag）。 */
  function hasStarted(save) {
    var ns = nsOf(save), i;
    for (i = 0; i < ACTS.length; i++) {
      var a = ns[ACTS[i].nsKey];
      if (a && a.active) return true;
      if (save.flags && save.flags[ACTS[i].doneFlag]) return true;
    }
    return false;
  }

  /* ---------------- 引擎接点 ---------------- */

  /** 标题画面按空格：首章通关后由幕间接管；四幕全完成交还原版。返回 true 表示已接管。 */
  function titleAct(game) {
    var save = game && game.save;
    if (!game || !save) return false;
    var done = !!(save.flags && save.flags['ch0.done']);
    if (!done && !preview()) return false;
    var cur = currentAct(save);
    if (!cur) return false;
    return cur.act.start(game, save, cur.a) === true;
  }

  /** 标题页文案：有幕间可进时替换掉原版的「空格 继续」。 */
  function titleLine(game) {
    var save = game && game.save;
    if (!save) return null;
    var done = !!(save.flags && save.flags['ch0.done']);
    if (!done && !preview()) return null;
    var cur = currentAct(save);
    if (!cur) return null;
    return cur.act.titleLine(save, cur.a);
  }

  /** 主线归属：幕间进行中把顶栏任务切到幕间任务，四幕收尾之后交还首章。 */
  function questId(save) {
    if (!save || !save.flags || !save.flags['ch0.done']) return 'main_ch0';
    if (save.flags['act4.coda']) return 'main_ch0';
    if (!hasStarted(save)) return 'main_ch0';
    return QUEST.id;
  }

  /* ---------------- 自定义指令 ---------------- */
  /** 目前只有 {op:'mode', id:<模式 id>}：切进某一幕的玩法（幂等）。 */
  OPS.mode = function (save, op, game) {
    var act = actByMode(op.id) || actById(op.id);
    if (!act) return false;
    var ns = nsOf(save), a = ns[act.nsKey];
    if (a) a.active = 1;
    if (game && game.startMode && game.mode !== act.modeId) game.startMode(act.modeId);
    return true;
  };

  function applyOp(save, op, game) {
    if (!op || !op.op) return false;
    var h = OPS[op.op];
    if (!h) return false;
    try { return h(save, op, game) !== false; }
    catch (e) { warn('指令 ' + op.op + ' 执行失败：' + (e && e.message)); return true; }
  }

  /* ---------------- 自定义玩法模式 ---------------- */
  function mode(id) { return MODES[id] || null; }
  function isMode(id) { return !!MODES[id]; }

  /** 接管整屏绘制；未命中返回 false，交回原版 render.js。 */
  function renderMode(game, R) {
    var m = game && MODES[game.mode];
    if (!m || typeof m.render !== 'function') return false;
    try { m.render(game, R); } catch (e) { warn('模式 ' + game.mode + ' 绘制失败：' + (e && e.message)); return false; }
    return true;
  }

  /** 固定步长逻辑：玩法模式靠它做计时与提示消退。 */
  function stepMode(game, dt) {
    var m = game && MODES[game.mode];
    if (!m) return false;
    if (typeof m.step === 'function') { try { m.step(game, dt); } catch (e) { warn('模式 ' + game.mode + ' 步进失败：' + (e && e.message)); } }
    return true;
  }

  /** 输入分派：kind ∈ dir/act/back/menu/auto。返回 true 表示该模式已消费这次输入。 */
  function inputMode(game, kind, arg) {
    var m = game && MODES[game.mode];
    if (!m) return false;
    if (typeof m[kind] !== 'function') return false;
    try { m[kind](game, arg); } catch (e) { warn('模式 ' + game.mode + ' 处理 ' + kind + ' 失败：' + (e && e.message)); }
    return true;
  }

  /* ---------------- 导出 ---------------- */
  var IL = {
    version: 'interlude/1',
    chapter: 'ch1',
    name: '第七位观察者',
    acts: ACTS,
    modes: MODES,
    quest: QUEST,
    defaults: DEFAULTS,
    nsOf: nsOf,
    act: actById,
    migrate: migrate,
    titleAct: titleAct,
    titleLine: titleLine,
    questId: questId,
    applyOp: applyOp,
    mode: mode,
    isMode: isMode,
    render: renderMode,
    step: stepMode,
    inputMode: inputMode,
    preview: preview
  };
  BAG.runtime = IL;
  G.Interlude = IL;
})(window);
