/* web/game/interlude/ch1_a3.js — 幕间三《排序的代价》：剧情数据 + 玩法「编排台」。
   幕间三讲的是：排名规则挂在长廊尽头，最后一条被人摘走了。
   玩法：把规则残片按条文顺序一条条接回去。接错记误差，不判失败。ES2019。 */
(function (w) {
  'use strict';
  var BAG = w.GameInterlude = w.GameInterlude || { acts: [] };

  /* ---------------- 玩法数据：编排台 ---------------- */
  var PUZZLE = {
    id: 'ledger_rule_order',
    title: '编排台 · 排名规则',
    prompt: '把残片按条文顺序一条条接上去。接错记一个误差，残片退回手上。',
    wall: '规则墙 · 第七序列',
    cards: [
      { id: 'c1', ord: 1, text: '第一条：本序列凡十二行，编号依序而列，不得空置。', clue: '全文第一句。它前面没有前文。' },
      { id: 'c2', ord: 2, text: '第二条：覆盖须由两名在场者共同确认。', clue: '上一条不许空行，这一条不许一个人负责。' },
      { id: 'c3', ord: 3, text: '第三条：覆盖记录归档后不再调阅，除本规则另有规定。', clue: '「另有规定」——它后面一定还有。' },
      { id: 'c4', ord: 4, text: '第四条：编号 000 保留，不参与排位。', clue: '排在两条程序规定之后：000 是唯一不参与排位的位置。' },
      { id: 'c5', ord: 5, text: '第五条：如覆盖对象为观测者，须经其本人同意。', clue: '唯一提到「观测者」的条文。它本该在最末。' },
      { id: 'cfake', ord: 0, text: '附录：本规则自公布之日起生效。', clue: '附录不是条文，不占编号。' }
    ]
  };

  var NODES = {
    m3_intro: {
      speaker: 'narrator',
      lines: [
        { text: '长廊尽头立着一面规则墙。铜框、玻璃面，里面夹着五条铜牌，每块都有小指那么厚。' },
        { text: '第五个位置上，铜牌不见了。玻璃却完好，蒙着一层从来没有被擦过的灰。' },
        { who: '瑾', text: '摘得很干净。不是撬的——是从背面松开螺丝，再装回去的。' },
        { who: '你', text: '谁会特意装回去？' },
        { who: '瑾', text: '一个不想让人发现它被摘过的人。可惜他忘了留一道划痕。' },
        { text: '她把折扇翻过来，扇骨内侧有一行很淡的铅笔字——是被人反复描过的抄件。' },
        { who: '瑾', text: '我抄过它。十年前，抄在我扇子上。' },
        { who: '你', text: '你抄的时候，知道它会消失吗？' },
        { who: '瑾', text: '不知道。我只是觉得，规则这种东西，总得有人手上留一份。' },
        { who: '瑾', text: '残片在这儿。你把它们接回去——顺序错一条，整面墙就不成立了。' }
      ],
      onEnd: [{ op: 'flag', key: 'act3.rule.intro' }, { op: 'mode', id: 'ledger_rule' }]
    },
    m3_outro_clean: {
      speaker: 'narrator',
      lines: [
        { text: '第五条接上去的时候，铜牌自己咬合了一声，像一句话终于落了地。' },
        { text: '「如覆盖对象为观测者，须经其本人同意。」' },
        { who: '瑾', text: '……所以那次覆盖，程序上不成立。' },
        { who: '你', text: '没人问过我。' },
        { who: '瑾', text: '对。这才是重点——不是「有人被换掉了」，是「换人的手续根本没走完」。' },
        { who: '瑾', text: '第五序列、第六序列那两次，都是问过的。有人签了字。' },
        { who: '你', text: '那我的签字在哪？' },
        { who: '瑾', text: '这就是我要问你的下一句了。' }
      ],
      onEnd: [{ op: 'flag', key: 'act3.rule.clean' }],
      next: 'm3_sig'
    },
    m3_outro_fuzzy: {
      speaker: 'narrator',
      lines: [
        { text: '最后一块铜牌接上去，位置偏了一格。瑾伸手把它推正。' },
        { who: '瑾', text: '偏一格也是偏。不过内容是对的，先这样。' },
        { text: '「如覆盖对象为观测者，须经其本人同意。」' },
        { who: '瑾', text: '所以那次覆盖，程序上不成立。' },
        { who: '你', text: '没人问过我。' },
        { who: '瑾', text: '对。不是「有人被换掉了」，是「换人的手续根本没走完」。' },
        { who: '瑾', text: '第五、第六序列那两次都问过，都有人签字。你的那一份，没有。' }
      ],
      onEnd: [{ op: 'flag', key: 'act3.rule.fuzzy' }],
      next: 'm3_sig'
    },
    m3_sig: {
      speaker: 'narrator',
      lines: [
        { text: '瑾把扇子合上，扇面上那列被划掉的名字正对着你。' },
        { text: '划掉的不是墨迹，是刻痕——每划一个名字，扇骨就薄一丝。' },
        { who: '瑾', text: '十二行，十二个位置，从来只有十一个人。第五个位置空过一次，第八个又空了一次。' },
        { who: '你', text: '空的那一格，是谁的位置？' },
        { who: '瑾', text: '按第一条，不能空。按第四条，000 不参与排位。' },
        { who: '瑾', text: '两条放在一起，只有一个解释：000 那一格是留给「不参与排位的人」的。' },
        { who: '瑾', text: '而第 8 行的编号，正好是 000。' },
        { text: '她把扇子递过来。扇骨内侧那行铅笔字下面，还压着四个字，被反复描过：「留一格空」。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act3.sig' },
        { op: 'item', id: 'rule_wall', n: 1 }
      ],
      next: 'm3_bridge'
    },
    m3_bridge: {
      speaker: 'narrator',
      lines: [
        { text: '规则墙接回去之后，长廊安静得不像长廊。' },
        { text: '绢从温室那边走过来，鞋底还带着湿土，手里捧着一小盆刚发芽的东西。' },
        { who: '绢', text: '瑾说你找到第五条了。' },
        { who: '你', text: '「须经其本人同意」。' },
        { who: '绢', text: '那你现在有两个问题。第一个：谁替你签的字。第二个：签完之后，你去哪了。' },
        { who: '你', text: '……第二个更重要。' },
        { who: '绢', text: '是。第一个是别人的事，第二个是你自己的事。' },
        { who: '绢', text: '跟我来。温室的第十四号苗床下面，埋着一样东西。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act3.bridge' },
        { op: 'flag', key: 'act3.done' }
      ],
      // 连续叙事：幕间三完直接接幕间四
      next: 'm4_intro'
    }
  };

  /* ---------------- 编排台逻辑 ---------------- */
  function findCard(id) {
    for (var i = 0; i < PUZZLE.cards.length; i++) if (PUZZLE.cards[i].id === id) return PUZZLE.cards[i];
    return null;
  }
  function totalNeeded() {
    var n = 0;
    for (var i = 0; i < PUZZLE.cards.length; i++) if (PUZZLE.cards[i].ord > 0) n++;
    return n;
  }
  function say(L, msg) { L.msg = msg; L.msgTick = 130; }
  function sync(game) { try { game.flush(); } catch (e) { /* 存档失败不影响局面 */ } }

  function solve(game, ns) {
    var a = ns.a3;
    a.solved = 1;
    a.verdict = a.errors > 0 ? 'fuzzy' : 'clean';
    try { game.save.flags[a.verdict === 'clean' ? 'act3.rule.clean' : 'act3.rule.fuzzy'] = 1; } catch (e) { /* 只读存档 */ }
    if (game.endMode) game.endMode();
    game.startDialog(a.verdict === 'clean' ? 'm3_outro_clean' : 'm3_outro_fuzzy');
  }

  function wrapText(R, s, maxW, size) {
    var ctx = R && R.ctx;
    var out = [], cur = '', i, ch;
    if (!ctx) return [String(s || '').slice(0, 20)];
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
    var L = game.ledger3, ns = BAG.nsOf(game.save), a = ns.a3;
    var COL = R.COLORS, vw = R.vw, vh = R.vh, i, j;
    R.box(0, 0, vw, vh, '#10131A');
    R.text(PUZZLE.title, 8, 5, 9, COL.paper);
    R.text('幕三 · 误差 ' + (a.errors || 0) + ' · 已接 ' + (a.chain || []).length + '/' + totalNeeded(), vw - 8, 5, 8, a.errors ? COL.zhu : COL.mut, 'right');

    // 左：已接好的规则墙
    var wx = 8, wy = 18, ww = 176, wh = vh - 50;
    R.box(wx, wy, ww, wh, 'rgba(182,131,20,0.07)', 'rgba(244,245,247,0.18)');
    R.text(PUZZLE.wall, wx + 6, wy + 4, 7, COL.jin);
    var chain = a.chain || [];
    for (i = 0; i < totalNeeded(); i++) {
      var cy = wy + 16 + i * 20;
      var cid = chain[i], cc = cid ? findCard(cid) : null;
      R.box(wx + 5, cy, ww - 10, 17, cc ? 'rgba(43,91,138,0.28)' : 'rgba(0,0,0,0.22)', cc ? COL.jin : 'rgba(244,245,247,0.12)');
      if (cc) {
        R.text(cc.text.slice(0, 16), wx + 9, cy + 4, 7, COL.paper);
        if (cc.text.length > 16) R.text(cc.text.slice(16), wx + 9, cy + 10, 6, COL.mut);
      } else {
        R.text('第 ' + (i + 1) + ' 条 · 空位', wx + 9, cy + 5, 7, COL.mut);
      }
    }

    // 右：手上的残片
    var hx = wx + ww + 8, hw = vw - hx - 8;
    var hand = a.hand || [];
    R.text('手上的残片 ' + hand.length + ' 张', hx, wy + 4, 7, COL.mut);
    for (j = 0; j < hand.length; j++) {
      var card = findCard(hand[j]);
      if (!card) continue;
      var cy2 = wy + 15 + j * 24, on = j === L.card;
      R.box(hx, cy2, hw, 21, on ? 'rgba(182,131,20,0.22)' : 'rgba(244,245,247,0.05)', on ? COL.jin : 'rgba(244,245,247,0.16)');
      R.text((on ? '▶ ' : '') + card.text.slice(0, 9), hx + 4, cy2 + 3, 7, on ? COL.jin : COL.paper);
      var cl = wrapText(R, card.clue, hw - 8, 6);
      if (cl[0]) R.text(cl[0], hx + 4, cy2 + 12, 6, COL.mut);
    }

    R.box(0, vh - 24, vw, 24, 'rgba(19,22,29,0.86)');
    R.text(R.key('上下键 选残片 · 确定 接到墙上', '↑↓ 选残片 · 空格 接到墙上 · Esc 离开编排台'), 8, vh - 18, 8, COL.paper);
    if (L.msg && L.msgTick > 0) R.text(L.msg, vw - 8, vh - 18, 8, COL.jin, 'right');
  }

  BAG.acts.push({
    id: 'act3',
    modeId: 'ledger_rule',
    nsKey: 'a3',
    title: '排序的代价',
    label: '幕间三',
    doneFlag: 'act3.done',
    prevFlag: 'act2.done',
    puzzle: PUZZLE,
    nodes: NODES,
    flags: {
      'act3.rule.intro': { text: '规则墙第五块铜牌不见了', branch: 'act3' },
      'act3.rule.clean': { text: '编排台：五条全部接对' },
      'act3.rule.fuzzy': { text: '编排台：带批注接回' },
      'act3.sig': { text: '幕间三：读到「留一格空」' },
      'act3.bridge': { text: '幕间三：绢提到第十四号苗床' },
      'act3.done': { text: '幕间三完成' }
    },
    items: {
      rule_wall: { name: '规则抄件', kind: 'key', text: '扇骨内侧的五条规则，末条写着：如覆盖对象为观测者，须经其本人同意。' }
    },
    defaults: { active: 0, solved: 0, errors: 0, chain: [], hand: [], verdict: null, runs: 0 },

    gate: function (save) { return !!(save.flags && save.flags['act2.done']); },

    /** 续播以 flag 为准：开场 → 编排台 → 收束 → 签名/留一格空 → 桥段。 */
    start: function (game, save, a) {
      var f = save.flags || {};
      if (f['act3.done']) return false;
      a.active = 1;
      if (!f['act3.rule.intro']) { game.startDialog('m3_intro'); return true; }
      if (!a.solved) { game.startMode('ledger_rule'); return true; }
      if (!f['act3.rule.clean'] && !f['act3.rule.fuzzy']) {
        game.startDialog(a.verdict === 'clean' ? 'm3_outro_clean' : 'm3_outro_fuzzy');
        return true;
      }
      if (!f['act3.sig']) { game.startDialog('m3_sig'); return true; }
      game.startDialog('m3_bridge');
      return true;
    },

    titleLine: function (save, a) {
      return a.active ? '回到编排台 · 排序的代价' : '进入幕间三 · 排序的代价';
    },

    mode2: {
      enter: function (game) {
        var ns = BAG.nsOf(game.save), a = ns.a3;
        if (!a.chain) a.chain = [];
        if (!a.hand || !a.hand.length) a.hand = PUZZLE.cards.map(function (c) { return c.id; });
        a.active = 1;
        a.runs = (a.runs || 0) + 1;
        game.ledger3 = { card: 0, msg: '', msgTick: 0, tick: 0 };
        try { if (!game.save.flags) game.save.flags = {}; game.save.flags['act3.rule.intro'] = 1; } catch (e) { /* 只读存档 */ }
        sync(game);
      },
      exit: function (game) { game.ledger3 = null; },
      step: function (game, dt) {
        var L = game.ledger3;
        if (!L) return;
        L.tick += dt;
        if (L.msgTick > 0) L.msgTick -= dt;
      },
      dir: function (game, dir) {
        var L = game.ledger3, ns = BAG.nsOf(game.save), a = ns.a3;
        if (!L) return;
        var hand = a.hand || [];
        if (!hand.length) return;
        L.card = (L.card + ((dir === 'up' || dir === 'left') ? -1 : 1) + hand.length) % hand.length;
      },
      act: function (game) {
        var L = game.ledger3, ns = BAG.nsOf(game.save), a = ns.a3;
        if (!L) return;
        var hand = a.hand || [];
        if (!hand.length) { say(L, '手上已经没有残片了'); return; }
        if (L.card >= hand.length) L.card = 0;
        var card = findCard(hand[L.card]);
        if (!card) return;
        var nextOrd = (a.chain || []).length + 1;
        if (card.ord === nextOrd) {
          a.chain.push(card.id);
          a.hand = hand.filter(function (c) { return c !== card.id; });
          if (L.card >= a.hand.length) L.card = 0;
          say(L, '第 ' + nextOrd + ' 条 已接上');
          if (a.chain.length === totalNeeded()) { sync(game); solve(game, ns); return; }
        } else if (card.ord === 0) {
          a.errors = (a.errors || 0) + 1;
          say(L, '附录不是条文 · 误差 ' + a.errors);
        } else {
          a.errors = (a.errors || 0) + 1;
          say(L, '顺序对不上 · 误差 ' + a.errors);
        }
        sync(game);
      },
      back: function (game) { game.endMode(); },
      menu: function (game) { game.endMode(); },
      render: function (game, R) { draw(game, R); }
    }
  });
})(window);
