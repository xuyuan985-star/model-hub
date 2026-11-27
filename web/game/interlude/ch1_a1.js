/* web/game/interlude/ch1_a1.js — 幕间一《第七位观察者》：剧情数据 + 玩法「推演台」。
   本文件只把数据推进 GameInterlude.acts；场景注册在 interlude/index.js。
   幕间一讲的是一件事：序列共 12 行，名册上只有 11 个名字，第 8 行的编号是 000。
   玩法：把 6 张证据卡放进 4 个列格。摆错记一个误差，不判失败。ES2019。 */
(function (w) {
  'use strict';
  var BAG = w.GameInterlude = w.GameInterlude || { acts: [] };

  /* ---------------- 玩法数据：推演台 ---------------- */
  var PUZZLE = {
    id: 'ledger_seq7_row8',
    title: '推演台 · 第七序列第 8 行',
    prompt: '四列各要一张卡。摆错记一个误差，误差不清零，也不判失败。',
    cells: [
      { id: 'no', col: '编号', need: 'c_no', value: '000' },
      { id: 'name', col: '条目', need: 'c_name', value: '观测者' },
      { id: 'read', col: '读数', need: 'c_read', value: '（空）' },
      { id: 'band', col: '分档', need: 'c_band', value: '榜外' }
    ],
    cards: [
      { id: 'c_no', key: '编号', text: '000：覆盖发生过四次，四次都写回同一个编号。' },
      { id: 'c_name', key: '条目', text: '「观测者」：庭务的记录里，观测者应当只有一位。' },
      { id: 'c_read', key: '读数', text: '读数是空：覆盖时读数被一起吃掉了。' },
      { id: 'c_band', key: '分档', text: '「榜外」：它从未进过百名内。' },
      { id: 'c_time', key: '时间', text: '05:12：这是覆盖发生的时刻，不是这一行的内容。' },
      { id: 'c_who', key: '归属', text: '庭务：记录者，不是被记录者。' }
    ]
  };

  var NODES = {
    m1_intro: {
      speaker: 'narrator',
      lines: [
        { text: '你回到观测站的时候，长廊的播报声换成了另一种频率——更慢，也更低。' },
        { text: '庭务在廊下摆了一张推演台：四列格、六张卡，纸面还空着。' },
        { who: '庭务', text: '归档之后，记录里多出一行没人写过的字。序列共 12 行，名册上却只有 11 个名字。' },
        { who: '庭务', text: '第 8 行的编号是 000。按规则，编号 000 的位置属于「观测者」。' },
        { who: '你', text: '观测者应当只有一位。' },
        { who: '庭务', text: '是的。所以那一位要么不存在，要么被从名册里抹掉了。' },
        { who: '庭务', text: '六张卡，四个列格。摆对了，这一行就是它本来的样子。' }
      ],
      onEnd: [{ op: 'flag', key: 'act1.ledger.intro' }, { op: 'mode', id: 'ledger' }]
    },
    m1_outro_clean: {
      speaker: 'narrator',
      lines: [
        { text: '四列落定，纸面发出一声很轻的响，像有人在很远的地方合上抽屉。' },
        { who: '庭务', text: '编号 000、条目观测者、读数空、分档榜外——四列之间没有出入。' },
        { who: '庭务', text: '记录成立。第七序列第 8 行，从今天起有内容了。' },
        { who: '你', text: '……可它本来就不该是空的。' },
        { who: '庭务', text: '是的。空白不是没有内容，是内容被拿走了。' }
      ],
      onEnd: [{ op: 'flag', key: 'act1.ledger.clean' }],
      next: 'm1_verdict'
    },
    m1_outro_fuzzy: {
      speaker: 'narrator',
      lines: [
        { text: '四列勉强落定，纸面一直没响。误差还亮在角落，像没擦干净的粉笔灰。' },
        { who: '庭务', text: '四列都在，顺序上留下过痕迹。记录可以成立，但会带着批注。' },
        { who: '你', text: '批注会留下来吗？' },
        { who: '庭务', text: '会。被改过的记录，从来不假装自己没被改过。' }
      ],
      onEnd: [{ op: 'flag', key: 'act1.ledger.fuzzy' }],
      next: 'm1_verdict'
    },
    m1_verdict: {
      speaker: 'tingwu',
      lines: [
        { who: '庭务', text: '这一行随你处置。补上名字，或者让它继续空着。' },
        { text: '推演台的光落在纸面上，四列格已经填满，只剩最后一道手续。' }
      ],
      choices: [
        { text: '把这一行写进名册', go: 'm1_end_write' },
        { text: '留空，只写批注', go: 'm1_end_blank' }
      ]
    },
    m1_end_write: {
      speaker: 'narrator',
      lines: [
        { text: '你把这一行写进名册。名册从 11 个名字变成 12 个，纸却没有变厚。' },
        { who: '庭务', text: '观测者：两位。记录里第一次出现这个数字。' },
        { who: '你', text: '那另一位现在在哪？' },
        { who: '庭务', text: '……在下一行的空白里。' },
        { text: '——幕间一完。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act1.end.write' },
        { op: 'flag', key: 'act1.done' },
        { op: 'item', id: 'roster_copy', n: 1 }
      ],
      // 连续叙事：幕间一完直接接幕间二，玩家不必回标题页重新按空格。
      // 中途按 Esc 退出也没关系：currentAct() 只看 doneFlag，回来时标题页会写「进入幕间二」。
      next: 'm2_intro'
    },
    m1_end_blank: {
      speaker: 'narrator',
      lines: [
        { text: '你没有写名字，只在行末添了一句批注：此处曾有一位观测者，姓名已被覆盖。' },
        { who: '庭务', text: '批注已记录。空白保留。' },
        { who: '你', text: '空白也算一条。' },
        { who: '庭务', text: '……这句话，我会原样记下来。' },
        { text: '——幕间一完。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act1.end.blank' },
        { op: 'flag', key: 'act1.done' },
        { op: 'item', id: 'blank_row', n: 1 }
      ],
      next: 'm2_intro'
    }
  };

  /* ---------------- 推演台逻辑 ---------------- */
  function findCard(id) {
    for (var i = 0; i < PUZZLE.cards.length; i++) if (PUZZLE.cards[i].id === id) return PUZZLE.cards[i];
    return null;
  }
  function nextEmpty(ns, from) {
    for (var k = 0; k < PUZZLE.cells.length; k++) {
      var i = (from + k) % PUZZLE.cells.length;
      if (!ns.a1.placed[PUZZLE.cells[i].id]) return i;
    }
    return from;
  }
  function say(L, msg) { L.msg = msg; L.msgTick = 110; }
  function sync(game) { try { game.flush(); } catch (e) { /* 存档失败不影响局面 */ } }

  /** 四列落定：按误差决定收束对白；两种都不算失败。 */
  function solve(game, ns) {
    ns.a1.solved = 1;
    ns.a1.verdict = ns.a1.errors > 0 ? 'fuzzy' : 'clean';
    try { game.save.flags[ns.a1.errors > 0 ? 'act1.ledger.fuzzy' : 'act1.ledger.clean'] = 1; } catch (e) { /* 只读存档 */ }
    if (game.endMode) game.endMode();
    game.startDialog(ns.a1.errors > 0 ? 'm1_outro_fuzzy' : 'm1_outro_clean');
  }

  /* ---------------- 画面 ---------------- */
  function wrapText(R, s, maxW, size) {
    var ctx = R && R.ctx;
    var out = [], cur = '', i, ch;
    if (!ctx) return [String(s || '').slice(0, 22)];
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
    var L = game.ledger1, ns = BAG.nsOf(game.save), a = ns.a1;
    var COL = R.COLORS, vw = R.vw, vh = R.vh, i, j;
    R.box(0, 0, vw, vh, '#10131A');
    R.text(PUZZLE.title, 8, 6, 10, COL.paper);
    R.text('幕一 · 误差 ' + (a.errors || 0) + ' · 手上 ' + (a.hand || []).length + ' 张', vw - 8, 6, 8, a.errors ? COL.zhu : COL.mut, 'right');

    var x0 = 8, cw = 88, gap = 6, y = 20;
    for (i = 0; i < PUZZLE.cells.length; i++) {
      var cell = PUZZLE.cells[i], x = x0 + i * (cw + gap);
      var done = !!a.placed[cell.id], cur = i === L.cursor;
      R.box(x, y, cw, 46, done ? 'rgba(43,91,138,0.34)' : 'rgba(244,245,247,0.06)', cur ? COL.jin : 'rgba(244,245,247,0.22)');
      R.text(cell.col, x + 5, y + 4, 8, COL.mut);
      if (done) {
        R.text(cell.value, x + 5, y + 20, 11, COL.paper);
        R.text('已落定', x + cw - 5, y + 34, 7, COL.jin, 'right');
      } else {
        R.text(cur ? '▽' : '·', x + 5, y + 22, 10, cur ? COL.jin : COL.mut);
        R.text('待推', x + cw - 5, y + 34, 7, COL.mut, 'right');
      }
    }

    R.text(PUZZLE.prompt, 8, 72, 8, COL.mut);

    var hy = 84, hw = 182, hh = 34, hand = a.hand || [];
    for (j = 0; j < hand.length; j++) {
      var card = findCard(hand[j]);
      if (!card) continue;
      var cx = 8 + (j % 2) * (hw + 8), cy = hy + Math.floor(j / 2) * (hh + 4);
      var on = L.picking && j === L.card;
      R.box(cx, cy, hw, hh, on ? 'rgba(182,131,20,0.22)' : 'rgba(244,245,247,0.05)', on ? COL.jin : 'rgba(244,245,247,0.18)');
      R.text((on ? '▶ ' : '') + card.key, cx + 5, cy + 3, 9, on ? COL.jin : COL.paper);
      var lines = wrapText(R, card.text, hw - 10, 7);
      for (var li = 0; li < lines.length && li < 2; li++) {
        R.text(lines[li], cx + 5, cy + 15 + li * 9, 7, COL.mut);
      }
    }
    if (!hand.length) R.text('手上的卡已经全部落定。', 8, hy + 8, 9, COL.paper);

    R.box(0, vh - 24, vw, 24, 'rgba(19,22,29,0.86)');
    R.text(L.picking ? R.key('方向键 选卡 · 确定 放置', '↑↓ 选卡 · 空格 放置 · Esc 取消选卡') : R.key('左右键 选列 · 确定 选卡', '←→ 选列 · 空格 选卡 · Esc 离开推演台'), 8, vh - 18, 8, COL.paper);
    if (L.msg && L.msgTick > 0) R.text(L.msg, vw - 8, vh - 18, 8, COL.jin, 'right');
  }

  /* ---------------- 注册进幕列表 ---------------- */
  BAG.acts.push({
    id: 'act1',
    modeId: 'ledger',
    nsKey: 'a1',
    title: '第七位观察者',
    label: '幕间一',
    doneFlag: 'act1.done',
    puzzle: PUZZLE,
    nodes: NODES,
    flags: {
      'act1.ledger.intro': { text: '摆开推演台', branch: 'act1' },
      'act1.ledger.clean': { text: '推演台：无误差完成' },
      'act1.ledger.fuzzy': { text: '推演台：带误差完成' },
      'act1.end.write': { text: '幕间一：把第 8 行写进名册' },
      'act1.end.blank': { text: '幕间一：留空，只写批注' },
      'act1.done': { text: '幕间一完成' }
    },
    items: {
      roster_copy: { name: '名册抄本', kind: 'key', text: '多出一行的名册抄本，第 12 个名字是空的。' },
      blank_row: { name: '空白行', kind: 'story', text: '一行什么都没有的记录，边缘有被反复覆盖的毛边。' }
    },
    defaults: {
      active: 0, solved: 0, errors: 0, placed: {}, hand: [], verdict: null, runs: 0
    },
    quest: {
      id: 'interlude_ch0', name: '第七位观察者', chapter: 'interlude1',
      summary: '序列共 12 行，名册上只有 11 个名字。第 8 行的编号是 000。',
      steps: [
        { id: 's1', name: '摆开推演台', hint: '与庭务谈过', flagsAny: ['act1.ledger.intro'] },
        { id: 's2', name: '推完四列', hint: '编号 / 条目 / 读数 / 分档', flagsAny: ['act1.ledger.clean', 'act1.ledger.fuzzy'] },
        { id: 's3', name: '处置这一行', hint: '写进名册，或留空只写批注', flagsAny: ['act1.end.write', 'act1.end.blank'] }
      ]
    },

    /** 幕间一可进入：首章任一结局之后。 */
    gate: function (save) { return !!(save.flags && save.flags['ch0.done']); },

    /** 标题页按空格时的行为：返回 true 表示已接管。
     *  续播以「存档里已写到哪」为准（flag 驱动），中途退出再回来不会漏内容、也不会重复播：
     *  开场 → 推演台 → 收束对白 → 处置二选一 → 完成。 */
    start: function (game, save, a) {
      var f = save.flags || {};
      if (f['act1.done']) return false;
      a.active = 1;
      if (!f['act1.ledger.intro']) { game.startDialog('m1_intro'); return true; }
      if (!a.solved) { game.startMode('ledger'); return true; }
      if (!f['act1.ledger.clean'] && !f['act1.ledger.fuzzy']) {
        game.startDialog(a.verdict === 'clean' ? 'm1_outro_clean' : 'm1_outro_fuzzy');
        return true;
      }
      game.startDialog('m1_verdict');
      return true;
    },

    titleLine: function (save, a) {
      return a.active ? '回到推演台 · 第七位观察者' : '进入幕间 · 第七位观察者';
    },

    mode2: {
      enter: function (game) {
        var ns = BAG.nsOf(game.save), a = ns.a1;
        if (!a.placed) a.placed = {};
        if (!a.hand || !a.hand.length) a.hand = PUZZLE.cards.map(function (c) { return c.id; });
        a.active = 1;
        a.runs = (a.runs || 0) + 1;
        game.ledger1 = { cursor: nextEmpty(ns, 0), card: 0, picking: false, msg: '', msgTick: 0, tick: 0 };
        try { if (!game.save.flags) game.save.flags = {}; game.save.flags['act1.ledger.intro'] = 1; } catch (e) { /* 只读存档 */ }
        sync(game);
      },
      exit: function (game) { game.ledger1 = null; },
      step: function (game, dt) {
        var L = game.ledger1;
        if (!L) return;
        L.tick += dt;
        if (L.msgTick > 0) L.msgTick -= dt;
      },
      dir: function (game, dir) {
        var L = game.ledger1, ns = BAG.nsOf(game.save), a = ns.a1;
        if (!L) return;
        if (L.picking) {
          var hand = a.hand || [];
          if (!hand.length) { L.picking = false; return; }
          L.card = (L.card + ((dir === 'up' || dir === 'left') ? -1 : 1) + hand.length) % hand.length;
          return;
        }
        var step = (dir === 'left' || dir === 'up') ? -1 : 1;
        L.cursor = (L.cursor + step + PUZZLE.cells.length) % PUZZLE.cells.length;
      },
      act: function (game) {
        var L = game.ledger1, ns = BAG.nsOf(game.save), a = ns.a1;
        if (!L) return;
        var cell = PUZZLE.cells[L.cursor];
        if (!cell) return;
        if (a.placed[cell.id]) { say(L, '这一列已经落定'); return; }
        if (!L.picking) {
          if (!(a.hand || []).length) { say(L, '手上已经没有卡片了'); return; }
          L.picking = true; L.card = 0; return;
        }
        var cardId = (a.hand || [])[L.card], card = findCard(cardId);
        L.picking = false;
        if (!card) return;
        if (card.id === cell.need) {
          a.placed[cell.id] = card.id;
          a.hand = a.hand.filter(function (c) { return c !== card.id; });
          L.cursor = nextEmpty(ns, L.cursor);
          say(L, cell.col + ' → ' + cell.value);
          if (Object.keys(a.placed).length === PUZZLE.cells.length) { sync(game); solve(game, ns); return; }
        } else {
          a.errors = (a.errors || 0) + 1;
          say(L, '这一张对不上这一列 · 误差 ' + a.errors);
        }
        sync(game);
      },
      back: function (game) {
        var L = game.ledger1;
        if (!L) return;
        if (L.picking) { L.picking = false; return; }
        game.endMode();
      },
      menu: function (game) { game.endMode(); },
      render: function (game, R) { draw(game, R); }
    }
  });
})(window);
