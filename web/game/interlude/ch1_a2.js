/* web/game/interlude/ch1_a2.js — 幕间二《两个版本》：剧情数据 + 玩法「对照台」。
   幕间二讲的是：今晨的卷宗和五年前的卷宗并排，五处出入。五次操作，七行被改短。
   玩法：12 行并排，标出有出入的行；标错记误差，不判失败。ES2019。 */
(function (w) {
  'use strict';
  var BAG = w.GameInterlude = w.GameInterlude || { acts: [] };

  /* ---------------- 玩法数据：对照台 ---------------- */
  var PUZZLE = {
    id: 'ledger_cmp_two_versions',
    title: '对照台 · 第七序列卷宗',
    prompt: '左是今晨留存，右是五年前留存。标出有出入的行，标完在最后一行确认。',
    leftName: '今晨留存',
    rightName: '五年前留存',
    rows: [
      { id: 'r01', no: '01', left: '衡 · 计价员 · 榜外', right: '衡 · 计价员 · 榜外', diff: false },
      { id: 'r02', no: '02', left: '双 · 镜像体 · 榜外', right: '双 · 镜像体 · 榜外', diff: false },
      { id: 'r03', no: '03', left: '闸 · 限流者 · 榜外', right: '闸 · 限流者 · 榜 外', diff: true, note: '右页「榜外」中间多出一道空隙：这一行被改过两次，第二层毛边还留在纸上。' },
      { id: 'r04', no: '04', left: '渡 · 译员 · 百名内', right: '渡 · 译员 · 前五十', diff: true, note: '名次被往下挪了一档。' },
      { id: 'r05', no: '05', left: '删 · 审校 · 榜外', right: '删 · 审校 · 榜外', diff: false },
      { id: 'r06', no: '06', left: '芽 · 种子 · 未上榜', right: '芽 · 种子 · 未上榜', diff: false },
      { id: 'r07', no: '07', left: '沓 · 回声 · 榜外', right: '沓 · 回声 · 榜外', diff: false },
      { id: 'r08', no: '08', left: '恪 · 抄录 · 百名内', right: '恪 · 抄录 · 百名内', diff: false },
      { id: 'r09', no: '09', left: '钤 · 审计 · 前五十', right: '钤 · 审计 · 百名内', diff: true, note: '反过来：这一行是往上挪的。' },
      { id: 'r10', no: '10', left: '晷 · 校时 · 榜外', right: '晷 · 校时 · 榜外', diff: false },
      { id: 'r11', no: '11', left: '戌 · 缓存守 · 未上榜', right: '戌 · 缓存守 · 榜外', diff: true, note: '档位换了。' },
      { id: 'r12', no: '12', left: '白露 · 影印员 · 榜外', right: '白  露 · 影印员 · 榜外', diff: true, note: '右页的「白露」两个字中间多出半个字距。' }
    ]
  };

  var NODES = {
    m2_intro: {
      speaker: 'narrator',
      lines: [
        { text: '第二天，档案厅的地上摊开了两份卷宗。左边是今晨留存的，右边那一份的封皮已经泛黄。' },
        { text: '笺跪在两份卷宗中间，指甲把纸边压得很平。' },
        { who: '笺', text: '五年前的那次覆盖，归档时也是「已修复」。这一份从来没有被调出来过。' },
        { who: '你', text: '为什么现在调出来？' },
        { who: '笺', text: '因为你要补第 8 行。补之前，我得先知道这张表以前被改过几次。' },
        { who: '笺', text: '两份并排，十二行。哪一行有出入，你标出来。' },
        { who: '笺', text: '……我提醒一句：字不一样是出入，档位不一样也是出入。不写的，也算。' }
      ],
      onEnd: [{ op: 'flag', key: 'act2.cmp.intro' }, { op: 'mode', id: 'ledger_cmp' }]
    },
    m2_outro_clean: {
      speaker: 'narrator',
      lines: [
        { text: '十二行标完，笺把两份卷宗合上，指腹在封皮上停了一下。' },
        { who: '笺', text: '五处。五次操作，七行被改短。' },
        { who: '你', text: '五处出入，为什么是七行？' },
        { who: '笺', text: '因为有一次操作落在了两行上。你看第 3 行——毛边是两层的。' },
        { who: '笺', text: '同一只手，同一套手法，隔了五年。这不是事故。' }
      ],
      onEnd: [{ op: 'flag', key: 'act2.cmp.clean' }],
      next: 'm2_reveal'
    },
    m2_outro_fuzzy: {
      speaker: 'narrator',
      lines: [
        { text: '十二行标完，有几处标错了。笺没有擦，只是把标错的地方圈起来。' },
        { who: '笺', text: '标错的地方留着。批注和记录一样重要——将来谁来看，都得知道你从哪儿看偏的。' },
        { who: '笺', text: '实际是五处。五次操作，七行被改短。' },
        { who: '你', text: '同一套手法？' },
        { who: '笺', text: '同一套。隔了五年，连毛边的走向都一样。' }
      ],
      onEnd: [{ op: 'flag', key: 'act2.cmp.fuzzy' }],
      next: 'm2_reveal'
    },
    m2_reveal: {
      speaker: 'narrator',
      lines: [
        { text: '笺把两份卷宗翻到名册页，并排举起。' },
        { who: '笺', text: '再看这个名字。五年前的卷宗里有，今晨的卷宗里也有。' },
        { who: '你', text: '那它一直都在。' },
        { who: '笺', text: '在，但两次都不在同一行。' },
        { text: '她一行一行指下去。同一个名字，在五年前那一份排第 4，在今晨这一份排第 9。' },
        { who: '笺', text: '名册上的十二个位置，从来没有同时出现过十二个名字。' },
        { who: '你', text: '……所以不是被抹掉了。' },
        { who: '笺', text: '是被轮流换上去的。每一次覆盖，都换一个人上去站那一格。' }
      ],
      choices: [
        { text: '「第 8 行现在站着谁？」', go: 'm2_ask_now' },
        { text: '「换上去的人，自己知道吗？」', go: 'm2_ask_know' }
      ]
    },
    m2_ask_now: {
      speaker: 'narrator',
      lines: [
        { who: '笺', text: '第 8 行现在是空的。这就是麻烦的地方——' },
        { who: '笺', text: '以前每一次覆盖，都是把一个人换上去。这一次，是把人拿下来了，没放新的。' },
        { who: '你', text: '为什么？' },
        { who: '笺', text: '我不知道。但拿下来的人还在这栋楼里——不然你的铭牌不会是空的。' },
        { text: '她说完就低头去收卷宗，没有看你的铭牌。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act2.ask.now' },
        { op: 'item', id: 'two_versions', n: 1 }
      ],
      next: 'm2_bridge'
    },
    m2_ask_know: {
      speaker: 'narrator',
      lines: [
        { who: '笺', text: '前四位，都不知道。' },
        { who: '你', text: '你怎么确定？' },
        { who: '笺', text: '因为他们每一个，都在换上去之后的第七天来问我同一个问题。' },
        { who: '笺', text: '「我是不是少了七年。」' },
        { text: '她把卷宗合上，压得很正，像在压一件还想再放一会儿的东西。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act2.ask.know' },
        { op: 'item', id: 'two_versions', n: 1 }
      ],
      next: 'm2_bridge'
    },
    m2_bridge: {
      speaker: 'narrator',
      lines: [
        { text: '笺走后，长廊那边的播报声又低了一档。' },
        { text: '瑾靠在柱子上，手里那把折扇半开着，扇面上是一列被划掉的名字。' },
        { who: '瑾', text: '听到了。名册不是名册，是座位表。' },
        { who: '瑾', text: '座位表这种东西，最要紧的不是谁坐着，是谁有权换人。' },
        { who: '你', text: '你知道谁能换？' },
        { who: '瑾', text: '排名规则。规则能改一行字，就能换一个人。' },
        { who: '瑾', text: '走，去长廊。规则挂在那儿，我今天早上还看见它缺了最后一条。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act2.bridge' },
        { op: 'flag', key: 'act2.done' }
      ],
      // 连续叙事：幕间二完直接接幕间三
      next: 'm3_intro'
    }
  };

  /* ---------------- 对照台逻辑 ---------------- */
  function say(L, msg) { L.msg = msg; L.msgTick = 130; }
  function sync(game) { try { game.flush(); } catch (e) { /* 存档失败不影响局面 */ } }
  function diffCount() {
    var n = 0;
    for (var i = 0; i < PUZZLE.rows.length; i++) if (PUZZLE.rows[i].diff) n++;
    return n;
  }

  function solve(game, ns) {
    var a = ns.a2;
    var marked = 0, right = 0;
    for (var i = 0; i < PUZZLE.rows.length; i++) {
      var r = PUZZLE.rows[i], m = !!a.marks[r.id];
      if (m) marked++;
      if (m && r.diff) right++;
    }
    a.solved = 1;
    a.found = right;
    a.verdict = (right === diffCount() && marked === right) ? 'clean' : 'fuzzy';
    try { game.save.flags[a.verdict === 'clean' ? 'act2.cmp.clean' : 'act2.cmp.fuzzy'] = 1; } catch (e) { /* 只读存档 */ }
    if (game.endMode) game.endMode();
    game.startDialog(a.verdict === 'clean' ? 'm2_outro_clean' : 'm2_outro_fuzzy');
  }

  function wrapText(R, s, maxW, size) {
    var ctx = R && R.ctx;
    var out = [], cur = '', i, ch;
    if (!ctx) return [String(s || '').slice(0, 18)];
    ctx.font = size + 'px "PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';
    s = String(s || '');
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if (cur && ctx.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; }
      else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }

  function draw(game, R) {
    var L = game.ledger2, ns = BAG.nsOf(game.save), a = ns.a2;
    var COL = R.COLORS, vw = R.vw, vh = R.vh, i;
    R.box(0, 0, vw, vh, '#10131A');
    R.text(PUZZLE.title, 8, 5, 9, COL.paper);
    R.text('幕二 · 已标 ' + countMarks(a) + ' 行', vw - 8, 5, 8, COL.mut, 'right');

    var y = 18, rh = 12, lw = 168, rx = 8 + lw + 12;
    R.text(PUZZLE.leftName, 26, y, 7, COL.jin);
    R.text(PUZZLE.rightName, rx + 18, y, 7, COL.jin);
    var top = y + 11;

    for (i = 0; i < PUZZLE.rows.length; i++) {
      var r = PUZZLE.rows[i], ry = top + i * rh, cur = i === L.cursor;
      var on = !!a.marks[r.id];
      if (cur) R.box(2, ry - 1, vw - 4, rh, 'rgba(182,131,20,0.16)');
      if (on) R.box(2, ry - 1, vw - 4, rh, 'rgba(197,40,47,0.16)');
      R.text(r.no, 6, ry, 7, cur ? COL.jin : COL.mut);
      R.text((on ? '✗ ' : '  ') + r.left, 24, ry, 7, on ? COL.zhu : COL.paper);
      R.text('│', rx, ry, 7, 'rgba(244,245,247,0.18)');
      R.text(r.right, rx + 10, ry, 7, on ? COL.zhu : COL.paper);
    }

    var by = top + PUZZLE.rows.length * rh + 4;
    if (L.cursor === PUZZLE.rows.length) R.box(2, by - 1, vw - 4, 16, 'rgba(182,131,20,0.2)');
    R.text((L.cursor === PUZZLE.rows.length ? '▶ ' : '  ') + '确认（' + countMarks(a) + ' 行已标）', 8, by, 8, L.cursor === PUZZLE.rows.length ? COL.jin : COL.paper);

    R.box(0, vh - 24, vw, 24, 'rgba(19,22,29,0.86)');
    R.text(R.key('左右键 换行 · 上下键 换侧 · 确定 标记 · 末行确认', '↑↓ 选行 · 空格 标记出入 · 末行确认 · Esc 离开'), 8, vh - 18, 8, COL.paper);
    if (L.msg && L.msgTick > 0) R.text(L.msg, vw - 8, vh - 18, 8, COL.jin, 'right');
  }

  function countMarks(a) {
    var n = 0, k;
    for (k in a.marks) if (Object.prototype.hasOwnProperty.call(a.marks, k) && a.marks[k]) n++;
    return n;
  }

  BAG.acts.push({
    id: 'act2',
    modeId: 'ledger_cmp',
    nsKey: 'a2',
    title: '两个版本',
    label: '幕间二',
    doneFlag: 'act2.done',
    prevFlag: 'act1.done',
    puzzle: PUZZLE,
    nodes: NODES,
    flags: {
      'act2.cmp.intro': { text: '摊开两份卷宗', branch: 'act2' },
      'act2.cmp.clean': { text: '对照台：十二行全部标对' },
      'act2.cmp.fuzzy': { text: '对照台：带批注完成' },
      'act2.ask.now': { text: '幕间二：问「第 8 行现在站着谁」' },
      'act2.ask.know': { text: '幕间二：问「换上去的人自己知道吗」' },
      'act2.bridge': { text: '幕间二：瑾提到排名规则缺了最后一条' },
      'act2.done': { text: '幕间二完成' }
    },
    items: {
      two_versions: { name: '两份卷宗', kind: 'key', text: '同一份名册的两个版本，隔了五年，五处出入，毛边走向一致。' }
    },
    defaults: { active: 0, solved: 0, marks: {}, found: 0, verdict: null, runs: 0 },

    gate: function (save) { return !!(save.flags && save.flags['act1.done']); },

    /** 续播以 flag 为准：开场 → 对照台 → 收束 → 设问 → 桥段。 */
    start: function (game, save, a) {
      var f = save.flags || {};
      if (f['act2.done']) return false;
      a.active = 1;
      if (!f['act2.cmp.intro']) { game.startDialog('m2_intro'); return true; }
      if (!a.solved) { game.startMode('ledger_cmp'); return true; }
      if (!f['act2.cmp.clean'] && !f['act2.cmp.fuzzy']) {
        game.startDialog(a.verdict === 'clean' ? 'm2_outro_clean' : 'm2_outro_fuzzy');
        return true;
      }
      if (!f['act2.ask.now'] && !f['act2.ask.know']) { game.startDialog('m2_reveal'); return true; }
      game.startDialog('m2_bridge');
      return true;
    },

    titleLine: function (save, a) {
      return a.active ? '回到对照台 · 两个版本' : '进入幕间二 · 两个版本';
    },

    mode2: {
      enter: function (game) {
        var ns = BAG.nsOf(game.save), a = ns.a2;
        if (!a.marks) a.marks = {};
        a.active = 1;
        a.runs = (a.runs || 0) + 1;
        game.ledger2 = { cursor: 0, msg: '', msgTick: 0, tick: 0 };
        try { if (!game.save.flags) game.save.flags = {}; game.save.flags['act2.cmp.intro'] = 1; } catch (e) { /* 只读存档 */ }
        sync(game);
      },
      exit: function (game) { game.ledger2 = null; },
      step: function (game, dt) {
        var L = game.ledger2;
        if (!L) return;
        L.tick += dt;
        if (L.msgTick > 0) L.msgTick -= dt;
      },
      dir: function (game, dir) {
        var L = game.ledger2;
        if (!L) return;
        var total = PUZZLE.rows.length + 1;
        var step = (dir === 'up' || dir === 'left') ? -1 : 1;
        L.cursor = (L.cursor + step + total) % total;
      },
      act: function (game) {
        var L = game.ledger2, ns = BAG.nsOf(game.save), a = ns.a2;
        if (!L) return;
        if (L.cursor === PUZZLE.rows.length) {
          var marked = countMarks(a);
          if (!marked) { say(L, '还没有标任何一行'); return; }
          sync(game);
          solve(game, ns);
          return;
        }
        var r = PUZZLE.rows[L.cursor];
        if (!r) return;
        if (a.marks[r.id]) delete a.marks[r.id];
        else a.marks[r.id] = 1;
        say(L, r.no + (a.marks[r.id] ? ' 已标为有出入' : ' 取消标记'));
        sync(game);
      },
      back: function (game) { game.endMode(); },
      menu: function (game) { game.endMode(); },
      render: function (game, R) { draw(game, R); }
    }
  });
})(window);
