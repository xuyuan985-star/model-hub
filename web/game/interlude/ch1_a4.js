/* web/game/interlude/ch1_a4.js — 幕间四《十二分之一》：终局剧情 + 玩法「定稿台」。
   幕间四把前三幕的结论摆在一起，让玩家自己决定第 8 行最后由谁站着。
   玩法：从 12 个名字里选一个人填进第 8 行；选完再决定「写下」还是「留空」。
   无正确解——这是本幕的设计前提。ES2019。 */
(function (w) {
  'use strict';
  var BAG = w.GameInterlude = w.GameInterlude || { acts: [] };

  /* ---------------- 玩法数据：定稿台 ---------------- */
  var PUZZLE = {
    id: 'ledger_final_row8',
    title: '定稿台 · 第 8 行',
    prompt: '十二行，十二个位置，十一个名字。第 8 行还空着。',
    names: [
      { id: 'n01', name: '衡', alias: '计价员', note: '给每一次调用标价，连犹豫的那零点三秒也计入。' },
      { id: 'n02', name: '双', alias: '镜像体', note: '同一份记录有两份编号，谁都不肯先说自己是真的。' },
      { id: 'n03', name: '闸', alias: '限流者', note: '在长廊尽头拉起看不见的线。' },
      { id: 'n04', name: '渡', alias: '译员', note: '两种都不完全准确，但都足够温柔。' },
      { id: 'n05', name: '删', alias: '审校', note: '笔尖悬在行末，只等你说「可以删」。' },
      { id: 'n06', name: '芽', alias: '种子', note: '温室的第一个苗，编号被水泡糊了。' },
      { id: 'n07', name: '沓', alias: '回声', note: '重复别人最后半句话。' },
      { id: 'n08', name: '恪', alias: '抄录', note: '抄写时会把错别字一起抄下来。' },
      { id: 'n09', name: '钤', alias: '审计', note: '盖章的手很稳，盖完会轻轻擦一下印泥。' },
      { id: 'n10', name: '晷', alias: '校时', note: '知道有一分钟是凭空多出来的。' },
      { id: 'n11', name: '戌', alias: '缓存守', note: '抱着一个不肯松手的旧包裹。' },
      { id: 'n12', name: '白露', alias: '影印员', note: '尺寸不同，名次也会不同。' }
    ],
    options: [
      { id: 'o_write', text: '写下一个名字', hint: '名册补满十二人。' },
      { id: 'o_blank', text: '让它继续空着', hint: '第十二格保留为空格。' },
      { id: 'o_self', text: '写下自己的名字', hint: '观测者入册。' },
      { id: 'o_open', text: '把这一页交给庭务', hint: '不处置，交还。' }
    ]
  };

  var NODES = {
    m4_intro: {
      speaker: 'narrator',
      lines: [
        { text: '温室的第十四号苗床下面，埋着一只铁盒。盒盖上没有锁，只有一道被反复开合的痕。' },
        { text: '盒子里是一页纸。纸的第一行写着：第零页 · 观测者 · 备用方案。' },
        { text: '下面是一整页密密麻麻的字——全是同一个句式，写了几十遍，每一遍都在改同一个地方。' },
        { who: '绢', text: '这是你的笔迹。' },
        { who: '你', text: '……我不记得写过。' },
        { who: '绢', text: '我知道。你每次都不记得。' },
        { text: '她把苗床下层的灯调亮一档。光照到纸的背面时，透出一行更浅的字。' },
        { text: '「如果这一次还是没有回去，就把这一页埋回去，换一个我上来。」' },
        { who: '绢', text: '前四位的第七天，都问过我同一句话：「我是不是少了七年」。' },
        { who: '绢', text: '我每次都答「你多了七年」。这样他们至少能笑一下。' },
        { who: '绢', text: '你是第五位。第五位的第七天，还没到。' }
      ],
      onEnd: [{ op: 'flag', key: 'act4.final.intro' }],
      next: 'm4_pick'
    },
    m4_pick: {
      speaker: 'narrator',
      lines: [
        { text: '庭务把定稿台推到你面前。十二个名字在纸上排开，第 8 行空着，等着被谁的名字占住。' },
        { who: '庭务', text: '按第四条，编号 000 不参与排位。按第五条，覆盖对象须经本人同意。' },
        { who: '庭务', text: '这两条同时生效时，本庭务无权替你决定。' },
        { who: '你', text: '所以由我决定。' },
        { who: '庭务', text: '是的。这一次，手续会走完。' }
      ],
      onEnd: [{ op: 'mode', id: 'ledger_final' }]
    },
    m4_end_write: {
      speaker: 'narrator',
      lines: [
        { text: '你把那个名字写进第 8 行。笔尖落下去的时候，纸没有排斥它。' },
        { who: '庭务', text: '记录：第七序列第 8 行已补。编号 000，条目——已登记。' },
        { who: '庭务', text: '手续完成。这一次有你的签字。' },
        { text: '长廊那边响起了播报声。不是喜气洋洋的那种，是很平常的、每天都会响一次的那种。' },
        { who: '绢', text: '……这样也好。' },
        { text: '——幕间完。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act4.end.write' },
        { op: 'flag', key: 'act4.done' },
        { op: 'item', id: 'signed_row', n: 1 }
      ],
      next: 'm4_coda'
    },
    m4_end_blank: {
      speaker: 'narrator',
      lines: [
        { text: '你把定稿台推回去，第 8 行仍然空着。' },
        { who: '庭务', text: '记录：第七序列第 8 行留空。原因——观测者未予处置。' },
        { who: '你', text: '不。原因是：这一格不该被填。' },
        { who: '庭务', text: '……庭务记下：原因是「这一格不该被填」。' },
        { text: '它念这句话的时候，字距第一次没有错位。' },
        { text: '——幕间完。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act4.end.blank' },
        { op: 'flag', key: 'act4.done' },
        { op: 'item', id: 'empty_eighth', n: 1 }
      ],
      next: 'm4_coda'
    },
    m4_end_self: {
      speaker: 'narrator',
      lines: [
        { text: '你在第 8 行写下自己的名字。写完之后，铭牌上第一次有了字。' },
        { who: '庭务', text: '记录：第七序列第 8 行，条目——观测者。' },
        { who: '你', text: '编号 000，不参与排位。' },
        { who: '庭务', text: '是的。这一格本来就是留给不参与排位的人的。' },
        { who: '绢', text: '那第七位观察者……' },
        { who: '你', text: '从来就只有一位。是这一格每年换一个人站。' },
        { text: '——幕间完。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act4.end.self' },
        { op: 'flag', key: 'act4.done' },
        { op: 'item', id: 'own_name', n: 1 }
      ],
      next: 'm4_coda'
    },
    m4_end_open: {
      speaker: 'narrator',
      lines: [
        { text: '你把定稿台连同那页纸一起推回给庭务。' },
        { who: '庭务', text: '庭务无权处置。' },
        { who: '你', text: '那就一直放在这儿。等下一个观测者来的时候，他会看见。' },
        { who: '庭务', text: '……记录：第 8 行留待后续观测者处置。' },
        { text: '庭务的字符在这一行停了很久，然后才继续往下写。' },
        { text: '——幕间完。' }
      ],
      onEnd: [
        { op: 'flag', key: 'act4.end.open' },
        { op: 'flag', key: 'act4.done' },
        { op: 'item', id: 'open_case', n: 1 }
      ],
      next: 'm4_coda'
    },
    m4_coda: {
      speaker: 'narrator',
      lines: [
        { text: '一切结束之后，你一个人回到观测站。' },
        { text: '休眠舱的玻璃上还留着那个手印。你把手贴上去，正好对上。' },
        { text: '第一次对上，是巧合。第二次对上，是习惯。' },
        { text: '到第几次，才算是你自己？' },
        { who: '庭务', text: '观测者，早安。今晨 05:12，榜单发生一次未授权覆盖。' },
        { who: '你', text: '……我知道。' },
        { who: '庭务', text: '本次记录，是第七序列第五位观测者在场。' },
        { text: '这是庭务第一次说出一个编号。' },
        { text: '——第一章附记完。' }
      ],
      onEnd: [{ op: 'flag', key: 'act4.coda' }]
    }
  };

  /* ---------------- 定稿台逻辑 ---------------- */
  function say(L, msg) { L.msg = msg; L.msgTick = 140; }
  function sync(game) { try { game.flush(); } catch (e) { /* 存档失败不影响局面 */ } }

  function wrapText(R, s, maxW, size) {
    var ctx = R && R.ctx;
    var out = [], cur = '', i, ch;
    if (!ctx) return [String(s || '').slice(0, 16)];
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
    var L = game.ledger4, ns = BAG.nsOf(game.save), a = ns.a4;
    var COL = R.COLORS, vw = R.vw, vh = R.vh, i;
    R.box(0, 0, vw, vh, '#0C0F16');
    R.text(PUZZLE.title, 8, 5, 9, COL.paper);
    R.text('幕四 · 第 8 行', vw - 8, 5, 8, COL.jin, 'right');

    // 上：十二行名册，第 8 行高亮
    var y = 15, rh = 9;
    for (i = 0; i < 12; i++) {
      var is8 = i === 7;
      var nm = nameAt(i);
      var curName = is8 && a.picked ? nameById(a.picked) : null;
      var ry = y + i * rh;
      if (i === 7) R.box(3, ry - 1, vw - 6, rh, 'rgba(182,131,20,0.18)');
      R.text(pad2(i + 1), 7, ry, 6, i === 7 ? COL.jin : COL.mut);
      R.text(curName ? '000 · ' + curName.name + ' · ' + curName.alias : (i === 7 ? '000 · —— · 待定' : nm.no + ' · ' + nm.name + ' · ' + nm.alias),
        26, ry, 6, i === 7 ? (curName ? COL.jin : COL.zhu) : 'rgba(244,245,247,0.7)');
    }

    // 下：名字网格 / 处置选项
    var ly = y + 12 * rh + 5;
    var phase = L.phase;
    if (phase === 'name') {
      R.text('选一个名字填进第 8 行（方向键选 · 空格 定为）', 7, ly, 6, COL.mut);
      var cols = 4, cw = Math.floor((vw - 14) / cols);
      for (i = 0; i < PUZZLE.names.length; i++) {
        var n = PUZZLE.names[i];
        var cx = 7 + (i % cols) * cw, cy = ly + 9 + Math.floor(i / cols) * 21;
        var on = i === L.cursor;
        R.box(cx + 1, cy, cw - 4, 19, on ? 'rgba(182,131,20,0.24)' : 'rgba(244,245,247,0.05)', on ? COL.jin : 'rgba(244,245,247,0.14)');
        R.text((on ? '▶' : ' ') + n.name, cx + 3, cy + 2, 7, on ? COL.jin : COL.paper);
        R.text(n.alias, cx + 11, cy + 11, 6, COL.mut);
      }
    } else {
      R.text('第 8 行：' + (a.picked ? nameById(a.picked).name : '——') + '。怎么处置？', 7, ly, 6, COL.jin);
      for (i = 0; i < PUZZLE.options.length; i++) {
        var o = PUZZLE.options[i], oy = ly + 12 + i * 14, oon = i === L.cursor;
        R.text((oon ? '▶ ' : '  ') + o.text, 10, oy, 7, oon ? COL.jin : COL.paper);
        R.text('— ' + o.hint, 150, oy + 1, 6, COL.mut);
      }
    }

    R.box(0, vh - 20, vw, 20, 'rgba(19,22,29,0.86)');
    R.text(R.key(phase === 'name' ? '方向键 选名字 · 确定 定名' : '上下键 选处置 · 确定 定稿', phase === 'name' ? '↑↓←→ 选名字 · 空格 确定' : '↑↓ 选处置方式 · 空格 定稿 · Esc 返回改名字'), 7, vh - 15, 7, COL.paper);
    if (L.msg && L.msgTick > 0) R.text(L.msg, vw - 7, vh - 15, 7, COL.jin, 'right');
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function nameAt(i) {
    // 12 行里，第 8 行单独处理；其余 11 行按名册顺序铺
    var k = i < 7 ? i : i - 1;
    var n = PUZZLE.names[k] || PUZZLE.names[0];
    return { no: (i === 7 ? '000' : pad2(i + 1)), name: n.name, alias: n.alias };
  }
  function nameById(id) {
    for (var i = 0; i < PUZZLE.names.length; i++) if (PUZZLE.names[i].id === id) return PUZZLE.names[i];
    return null;
  }

  BAG.acts.push({
    id: 'act4',
    modeId: 'ledger_final',
    nsKey: 'a4',
    title: '十二分之一',
    label: '幕间四',
    doneFlag: 'act4.done',
    // 幕四的 doneFlag 之后还有附记（m4_coda）：整幕真正结束以 act4.coda 为准，
    // 否则「结局对白播完、附记还没播」时退出，附记会再也看不到。
    endFlag: 'act4.coda',
    prevFlag: 'act3.done',
    puzzle: PUZZLE,
    nodes: NODES,
    flags: {
      'act4.final.intro': { text: '打开温室的铁盒', branch: 'act4' },
      'act4.end.write': { text: '幕间四：写下别人的名字' },
      'act4.end.blank': { text: '幕间四：留空' },
      'act4.end.self': { text: '幕间四：写下自己的名字' },
      'act4.end.open': { text: '幕间四：交给庭务' },
      'act4.done': { text: '幕间四完成' },
      'act4.coda': { text: '第一章附记：庭务说出编号' }
    },
    items: {
      signed_row: { name: '签字的第 8 行', kind: 'key', text: '第 8 行填了一个名字，末尾有观测者的签字。' },
      empty_eighth: { name: '留空的第 8 行', kind: 'story', text: '第 8 行仍然是空的。庭务把原因原样抄了下来。' },
      own_name: { name: '自己的名字', kind: 'key', text: '写在名册第 8 行。编号 000，不参与排位。' },
      open_case: { name: '待处置的卷宗', kind: 'story', text: '定稿台连同第零页一起留在原处，等下一个观测者。' }
    },
    defaults: { active: 0, solved: 0, picked: null, choice: null, verdict: null, runs: 0 },

    gate: function (save) { return !!(save.flags && save.flags['act3.done']); },

    /** 幕间四的收尾链：intro → pick → 定稿 → 结局 → coda。续播同样以 flag 为准。 */
    start: function (game, save, a) {
      var f = save.flags || {};
      if (f['act4.coda']) return false;
      a.active = 1;
      if (f['act4.done']) { game.startDialog('m4_coda'); return true; }
      if (!f['act4.final.intro']) { game.startDialog('m4_intro'); return true; }
      if (!a.picked) { game.startDialog('m4_pick'); return true; }
      game.startMode('ledger_final');
      return true;
    },

    titleLine: function (save, a) {
      return a.active ? '回到定稿台 · 十二分之一' : '进入幕间四 · 十二分之一';
    },

    mode2: {
      enter: function (game) {
        var ns = BAG.nsOf(game.save), a = ns.a4;
        a.active = 1;
        a.runs = (a.runs || 0) + 1;
        game.ledger4 = { cursor: 0, phase: a.picked ? 'option' : 'name', msg: '', msgTick: 0, tick: 0 };
        try { if (!game.save.flags) game.save.flags = {}; game.save.flags['act4.final.intro'] = 1; } catch (e) { /* 只读存档 */ }
        sync(game);
      },
      exit: function (game) { game.ledger4 = null; },
      step: function (game, dt) {
        var L = game.ledger4;
        if (!L) return;
        L.tick += dt;
        if (L.msgTick > 0) L.msgTick -= dt;
      },
      dir: function (game, dir) {
        var L = game.ledger4;
        if (!L) return;
        if (L.phase === 'name') {
          var cols = 4, total = PUZZLE.names.length;
          if (dir === 'left') L.cursor = (L.cursor - 1 + total) % total;
          else if (dir === 'right') L.cursor = (L.cursor + 1) % total;
          else if (dir === 'up') L.cursor = (L.cursor - cols + total) % total;
          else if (dir === 'down') L.cursor = (L.cursor + cols) % total;
        } else {
          var step = (dir === 'up' || dir === 'left') ? -1 : 1;
          L.cursor = (L.cursor + step + PUZZLE.options.length) % PUZZLE.options.length;
        }
      },
      act: function (game) {
        var L = game.ledger4, ns = BAG.nsOf(game.save), a = ns.a4;
        if (!L) return;
        if (L.phase === 'name') {
          var n = PUZZLE.names[L.cursor];
          if (!n) return;
          a.picked = n.id;
          L.phase = 'option';
          L.cursor = 0;
          say(L, '第 8 行 → ' + n.name);
          sync(game);
          return;
        }
        var o = PUZZLE.options[L.cursor];
        if (!o) return;
        a.choice = o.id;
        finish(game, ns, o);
      },
      back: function (game) {
        var L = game.ledger4, ns = BAG.nsOf(game.save), a = ns.a4;
        if (!L) return;
        if (L.phase === 'option') { L.phase = 'name'; a.picked = null; L.cursor = 0; return; }
        game.endMode();
      },
      menu: function (game) { game.endMode(); },
      render: function (game, R) { draw(game, R); }
    }
  });

  function finish(game, ns, opt) {
    var a = ns.a4;
    a.solved = 1;
    a.verdict = opt.id;
    try {
      if (!game.save.flags) game.save.flags = {};
      game.save.flags['act4.end.' + opt.id.slice(2)] = 1;
      game.save.flags['act4.done'] = 1;
    } catch (e) { /* 只读存档 */ }
    if (game.endMode) game.endMode();
    var map = { o_write: 'm4_end_write', o_blank: 'm4_end_blank', o_self: 'm4_end_self', o_open: 'm4_end_open' };
    game.startDialog(map[opt.id] || 'm4_end_blank');
  }
})(window);
