/* web/game/engine/render.js — 画面绘制：场景、角色、对话框、状态条、战斗与菜单，全部按 384×224 逻辑像素排版。
   排版目标设备是安卓手机（竖屏或横屏都在 WebView 里跑），所以：
   - 所有操作提示按「触屏 / 键盘」两套文案，触屏设备不出现空格、M、WASD 这类键盘措辞；
   - 正文 11px、标题 11–13px、提示 9–10px，保证在 3 倍以上的整数放大后仍然看得清；
   - 对话框左侧带 48×60 的对话头像（face_*），说话人换一句就换一张脸。ES2019。 */
(function (w) {
  'use strict';
  var G = w.GameEngine = w.GameEngine || {};

  var COL = {
    paper: '#F4F5F7', dark: '#13161D', ink: '#191F2B', zhu: '#C5282F',
    dian: '#2B5B8A', jin: '#B68314', mut: '#8A8F99', shade: 'rgba(19,22,29,0.86)',
    line: 'rgba(244,245,247,0.22)', fill: 'rgba(244,245,247,0.08)'
  };
  var FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif';
  var TILE = 16;
  var FACE_W = 48, FACE_H = 60;

  function create(canvas, cam) {
    var ctx = cam.ctx;

    function setFont(size, bold) { ctx.font = (bold ? '600 ' : '') + size + 'px ' + FONT; }

    function text(str, x, y, size, color, align) {
      setFont(size);
      ctx.fillStyle = color || COL.paper;
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(str == null ? '' : str), Math.round(x), Math.round(y));
      ctx.textAlign = 'left';
    }

    function box(x, y, wd, ht, fill, stroke) {
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(Math.round(x), Math.round(y), Math.round(wd), Math.round(ht)); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(wd) - 1, Math.round(ht) - 1); }
    }

    function bar(x, y, wd, ht, ratio, color, back) {
      box(x, y, wd, ht, back || 'rgba(244,245,247,0.16)');
      var w2 = Math.max(0, Math.min(1, ratio)) * (wd - 2);
      if (w2 > 0) box(x + 1, y + 1, w2, ht - 2, color);
    }

    /** 触屏还是键盘：安卓 WebView 命中触屏分支，桌面浏览器命中键盘分支。可被 w.__touchMode 强行覆盖（截图验收用）。 */
    function isTouch() {
      if (typeof w.__touchMode === 'boolean') return w.__touchMode;
      var coarse = false;
      try { coarse = !!(w.matchMedia && w.matchMedia('(pointer: coarse)').matches); } catch (e) { coarse = false; }
      return coarse || ('ontouchstart' in w) || ((w.navigator && w.navigator.maxTouchPoints) || 0) > 0;
    }
    /** 两套提示文案：t=触屏，k=键盘。 */
    function pick(t, k) { return isTouch() ? t : k; }

    /** 幕间画界面用的画布原语：与 render.js 内部同一套排版参数，避免每段剧情各写一份。 */
    var surface = {
      ctx: ctx, canvas: canvas,
      vw: cam.vw, vh: cam.vh, TILE: TILE, COLORS: COL,
      text: text, box: box, bar: bar, touch: isTouch, key: pick
    };

    /** 场景层：有整图背景就用背景，没有就按 ASCII 铺图块；装饰物叠在图块之上。 */
    function drawMap(game) {
      var mapId = game.mapId, x, y, ch, idx, name;
      if (G.Assets.isReady('bg_' + mapId)) {
        G.Assets.drawFrame(ctx, 'bg_' + mapId, 0, 0, 0, cam.vw, cam.vh);
      } else {
        for (y = 0; y < G.Map.rows(mapId); y++) {
          for (x = 0; x < G.Map.cols(mapId); x++) {
            ch = G.Map.at(mapId, x, y);
            name = G.Map.tileName(ch);
            idx = G.Map.tileIndex(name);
            if (!G.Assets.drawFrame(ctx, 'tiles_world', idx, x * TILE, y * TILE, TILE, TILE)) {
              G.Assets.drawPlaceholder(ctx, name, name, x * TILE, y * TILE, TILE, TILE, COL.paper);
            }
          }
        }
      }
      // 底图是烘焙好的整图，角色站上去容易"飘"：压一层很淡的暗角 + 贴地渐变，把人物衬出来
      var vg = ctx.createRadialGradient(cam.vw / 2, cam.vh / 2, Math.min(cam.vw, cam.vh) * 0.34,
        cam.vw / 2, cam.vh / 2, Math.max(cam.vw, cam.vh) * 0.72);
      vg.addColorStop(0, 'rgba(11,13,17,0)');
      vg.addColorStop(1, 'rgba(11,13,17,0.42)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, cam.vw, cam.vh);
      var foot = ctx.createLinearGradient(0, cam.vh - 34, 0, cam.vh);
      foot.addColorStop(0, 'rgba(11,13,17,0)');
      foot.addColorStop(1, 'rgba(11,13,17,0.5)');
      ctx.fillStyle = foot;
      ctx.fillRect(0, cam.vh - 34, cam.vw, 34);
      var decor = (G.Map.mapOf(mapId) || {}).decor || [];
      for (var i = 0; i < decor.length; i++) {
        var d = decor[i], dn = G.Map.decorName(d.tile);
        if (!dn) continue;
        if (!G.Assets.drawFrame(ctx, 'tiles_world', G.Map.tileIndex(dn), d.x * TILE, d.y * TILE, TILE, TILE)) {
          G.Assets.drawPlaceholder(ctx, dn, dn, d.x * TILE, d.y * TILE, TILE, TILE, COL.paper);
        }
      }
    }

    /** 交互提示：未读过且玩家在附近一格时，在格子上方闪一个点。 */
    function drawHints(game) {
      var list = G.Map.interactables(game.mapId), i, it, near;
      for (i = 0; i < list.length; i++) {
        it = list[i];
        if (it.flag && G.State.hasFlag(game.save, it.flag)) continue;
        near = Math.abs(it.x - game.player.x) + Math.abs(it.y - game.player.y) <= 1;
        if (!near) continue;
        ctx.fillStyle = game.tick % 60 < 30 ? COL.jin : 'rgba(182,131,20,0.45)';
        ctx.fillRect(it.x * TILE + 7, it.y * TILE - 4, 2, 3);
      }
    }

    function drawActor(spriteKey, gx, gy, dir, frame, label) {
      var dx = gx * TILE, dy = gy * TILE - 8;
      ctx.fillStyle = 'rgba(19,22,29,0.35)';
      ctx.beginPath();
      ctx.ellipse(dx + 8, gy * TILE + 14, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!spriteKey || !G.Assets.drawSprite(ctx, spriteKey, dir, frame, dx, dy)) {
        G.Assets.drawPlaceholder(ctx, spriteKey, label, dx, dy, 16, 24, COL.paper);
      }
    }

    function drawActors(game) {
      var list = [], npcs = game.npcs(), i;
      for (i = 0; i < npcs.length; i++) list.push({ y: npcs[i].y, x: npcs[i].x, n: npcs[i] });
      list.push({ y: game.player.y, x: game.player.x, p: true });
      list.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      for (i = 0; i < list.length; i++) {
        if (list[i].p) drawActor('pc_observer', game.player.x, game.player.y, game.player.dir, game.player.frame, '我');
        else drawActor(list[i].n.sprite, list[i].n.x, list[i].n.y, list[i].n.dir || 'down', 0, (list[i].n.label || '?').charAt(0));
      }
      if (game.mode === 'explore') drawHints(game);
    }

    /** 状态条：顶栏常驻；底部队伍条在对话框/菜单打开时让位，避免两层 UI 叠在一起。 */
    function drawHud(game, withParty) {
      var m = G.Map.mapOf(game.mapId) || {};
      box(0, 0, cam.vw, 15, 'rgba(19,22,29,0.74)');
      text(m.name || game.mapId, 6, 3, 10, COL.paper);
      var step = G.State.questStepDef(game.save);
      if (step) text('主线 ' + step.id + ' · ' + step.name, cam.vw - 6, 3, 10, COL.jin, 'right');
      if (withParty === false) return;
      var y = cam.vh - 24;
      box(0, y, cam.vw, 24, 'rgba(19,22,29,0.74)');
      var px = 6;
      for (var i = 0; i < game.save.party.length; i++) {
        var id = game.save.party[i], card = G.State.castCard(id);
        if (!card) continue;
        var hp = game.save.hp[id] || 0, mx = (card.stats && card.stats.hp) || 1;
        text(card.name, px, y + 8, 9, COL.paper);
        setFont(9);
        var nw = ctx.measureText(card.name).width;
        bar(px + nw + 3, y + 8, 24, 7, hp / mx, hp / mx > 0.4 ? '#7FB77E' : COL.zhu);
        px += nw + 33;
        if (px > cam.vw - 118) break;
      }
      text(pick('方向键 走动 · 确定 交互', '空格 交互 · M 菜单'), cam.vw - 6, y + 8, 9, COL.mut, 'right');
    }

    function wrap(textStr, maxWidth) { return G.Util.wrapText(ctx, textStr, maxWidth); }

    /** 对话框：左侧头像 + 右侧正文。高度按行数自适应（旁白没有头像，就不用留头像位）。 */
    function drawDialog(game) {
      var d = game.dialog;
      var face = d.face && G.Assets.isReady(d.face) ? d.face : null;
      var hasChoices = !!(d.choices && d.choices.length);
      var tx = face ? 68 : 10, tw = cam.vw - tx - 12;
      var body = d.text || '';
      setFont(11);
      var lines = wrap(body, tw);
      var maxLines = hasChoices ? 3 : 4;
      var shown = Math.min(lines.length, maxLines);
      var textH = Math.max(15, shown * 15);
      var choiceH = hasChoices ? Math.min(d.choices.length, 3) * 14 + 2 : 0;
      var footer = 18;
      var bodyH = Math.max(face ? FACE_H + 8 : 0, textH + choiceH);
      var h = 16 + 8 + bodyH + footer;
      var y = cam.vh - h - 4;

      box(2, y, cam.vw - 4, h, COL.shade, COL.line);
      box(2, y, cam.vw - 4, 16, 'rgba(244,245,247,0.10)');
      var who = d.speakerName || '旁白';
      text(who, 10, y + 4, 11, (who === '旁白' || !face) ? COL.mut : COL.jin, 'left');
      if (face) {
        box(6, y + 22, FACE_W + 4, FACE_H + 4, 'rgba(11,13,17,0.55)', COL.line);
        G.Assets.drawFrame(ctx, face, 0, 8, y + 24, FACE_W, FACE_H);
      }
      var ty = y + 22;
      for (var i = 0; i < shown; i++) text(lines[i], tx, ty + i * 15, 11, COL.paper);
      if (hasChoices) {
        var cy = ty + textH + 1;
        for (var j = 0; j < d.choices.length && j < 3; j++) {
          var sel = j === d.choiceIndex;
          if (sel) box(8, cy + j * 14 - 1, cam.vw - 20, 14, 'rgba(182,131,20,0.20)');
          text((sel ? '▶ ' : '　') + d.choices[j].text, 10, cy + j * 14, 10, sel ? COL.jin : COL.mut);
        }
        text(pick('方向键 选择 · 确定', '↑↓ 选择 · 空格 确认'), cam.vw - 10, y + h - 14, 9, COL.mut, 'right');
      } else {
        text(game.tick % 60 < 30 ? '⌄' : ' ', cam.vw - 14, y + h - 20, 12, COL.paper);
        text(pick('点「确定」继续', '空格 继续'), cam.vw - 10, y + h - 14, 9, COL.mut, 'right');
      }
    }

    /** 战场：384×224 竖直切四段 —— 顶栏(0-15) / 敌人台(16-104) / 我方名单(104-182) / 日志(182-224)。
        敌人站在 104 那条地平线上，名字与血条压在地平线下沿，不会和贴图打架。 */
    function drawBattle(game) {
      var b = game.battle, st = b.handle.state, i, u;
      var GROUND = 100;

      box(0, 0, cam.vw, cam.vh, '#0B0D11');
      var grd = ctx.createLinearGradient(0, 16, 0, GROUND);
      grd.addColorStop(0, 'rgba(42,31,40,0.60)');
      grd.addColorStop(0.65, 'rgba(26,25,33,0.30)');
      grd.addColorStop(1, 'rgba(11,13,17,0.92)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 16, cam.vw, GROUND - 16);
      box(0, 0, cam.vw, 15, 'rgba(25,31,43,0.95)');
      text((st.boss ? '首领战 · ' : '遭遇 · ') + (b.title || ''), 6, 3, 10, st.boss ? COL.zhu : COL.paper);
      text('第 ' + st.turn + ' 回合', cam.vw - 6, 3, 10, COL.jin, 'right');
      box(0, GROUND, cam.vw, 1, 'rgba(182,131,20,0.22)');

      var alive = st.enemies.filter(function (e) { return e.alive; });
      var n = Math.max(1, alive.length);
      var size = st.boss ? 64 : (n >= 3 ? 28 : 32);
      var gap = st.boss ? 76 : (n >= 3 ? 42 : 54);
      var baseX = Math.max(6, Math.round((cam.vw - n * gap) / 2) + 4);
      for (i = 0; i < alive.length; i++) {
        u = alive[i];
        var boss = !!u.boss;
        var dx = baseX + i * gap, dy = GROUND - size;
        var on = i === game.battle.targetIndex;
        ctx.fillStyle = 'rgba(8,9,13,0.62)';
        ctx.beginPath();
        ctx.ellipse(dx + size / 2, GROUND, size * 0.36, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        if (on) {
          box(dx - 3, dy - 3, size + 6, size + 6, 'rgba(197,40,47,0.12)', 'rgba(197,40,47,0.6)');
          text('▼', dx + size / 2, dy - 13, 9, COL.zhu, 'center');
        }
        var okDraw = u.sprite && (boss
          ? G.Assets.drawFrame(ctx, u.sprite, (st.turn + i) % 4, dx, dy, size, size)
          : G.Assets.drawFrame(ctx, u.sprite, 0, dx, dy, size, size));
        if (!okDraw) G.Assets.drawPlaceholder(ctx, u.id, u.name, dx, dy, size, size, COL.paper);
        // 护页：金点排在贴图右上，数量一眼可数
        if (u.shields > 0) {
          var sh = Math.min(7, u.shields);
          for (var s2 = 0; s2 < sh; s2++) box(dx + size - sh * 3 + s2 * 3, dy - 6, 2, 2, COL.jin);
        }
        // 名字与血条压在地平线下方，各给一块暗底，免得和背景渐变糊在一起
        setFont(8);
        var nameW = ctx.measureText(u.name).width;
        box(dx + size / 2 - nameW / 2 - 3, GROUND + 2, nameW + 6, 10, 'rgba(11,13,17,0.72)');
        text(u.name, dx + size / 2, GROUND + 3, 8, on ? COL.zhu : COL.paper, 'center');
        bar(dx + 3, GROUND + 14, size - 6, 3, u.hp / u.maxHp, COL.zhu, 'rgba(11,13,17,0.75)');
      }

      // 我方名单：每人一行 11px（六人 66px），当前行动者整行描金
      var py = 122, rowH = 11;
      for (i = 0; i < st.party.length; i++) {
        u = st.party[i];
        var cur = b.actions.length === i && i === b.actorIndex;
        var by = py + i * rowH;
        box(4, by, cam.vw - 8, rowH - 1, u.alive ? (cur ? 'rgba(182,131,20,0.16)' : 'rgba(244,245,247,0.05)') : 'rgba(244,245,247,0.02)');
        if (cur) box(4, by, 2, rowH - 1, COL.jin);
        text(u.name, 9, by + 1, 9, u.alive ? (cur ? COL.jin : COL.paper) : COL.mut);
        bar(58, by + 4, 40, 3, u.hp / u.maxHp, u.hp / u.maxHp > 0.4 ? '#7FB77E' : COL.zhu);
        text(Math.round(u.hp) + '/' + u.maxHp, 102, by + 1, 8, u.alive ? COL.paper : COL.mut);
        bar(140, by + 4, 32, 3, u.quota / Math.max(1, u.quotaMax), COL.dian);
        text(Math.round(u.quota), 176, by + 1, 8, COL.dian);
        if (cur) text('▶ ' + (b.skillName || '出手') + (b.skillCost ? '(' + b.skillCost + ')' : ''), 200, by + 1, 8, COL.jin);
        else if (u.acted) text('已行动', cam.vw - 10, by + 1, 8, COL.mut, 'right');
      }

      // 情报条：队伍人少时下方会空出一块，用它显示当前目标的情报（战斗中可读，不占额外空间）
      var iy = py + st.party.length * rowH + 5;
      if (iy < 184 && alive.length) {
        var tgt = alive[Math.min(game.battle.targetIndex, alive.length - 1)];
        var intel = (tgt && (w.GameData.enemies || {})[tgt.id] || {}).intel;
        if (intel) {
          box(4, iy, cam.vw - 8, 18, 'rgba(43,91,138,0.13)', 'rgba(43,91,138,0.42)');
          text('情报', 8, iy + 2, 8, COL.dian);
          setFont(8);
          var il = wrap(intel, cam.vw - 46);
          for (var k2 = 0; k2 < il.length && k2 < 2; k2++) text(il[k2], 32, iy + 2 + k2 * 9, 8, COL.mut);
        }
      }

      // 日志：两条，最后一条高亮
      var ly = 188;
      box(0, ly, cam.vw, cam.vh - ly, 'rgba(16,19,26,0.96)');
      box(0, ly, cam.vw, 1, COL.line);
      var logs = st.log.slice(-2);
      for (i = 0; i < logs.length; i++) {
        var lg = logs[i];
        text('· ' + (lg.text || lg.kind), 8, ly + 4 + i * 10, 8, i === logs.length - 1 ? COL.paper : COL.mut);
      }
      var hint = b.hint || pick('方向键 技能/目标 · 确定 出手', '↑↓ 选技能 · ←→ 选目标 · 空格 出手 · Q 自动');
      box(0, cam.vh - 11, cam.vw, 11, 'rgba(11,13,17,0.97)');
      text(hint, cam.vw - 8, cam.vh - 10, 9, COL.paper, 'right');
    }

    // ---------- 菜单：记录 / 角色 / 图鉴 / 设置 ----------
    var PAGE_NAMES = ['记录', '角色', '图鉴', '设置'];

    function drawMenu(game) {
      var x = 18, y = 14, wd = cam.vw - 36, ht = cam.vh - 28;
      var page = game.menuPage || 0;
      box(0, 0, cam.vw, cam.vh, 'rgba(11,13,17,0.62)');
      box(x, y, wd, ht, COL.shade, COL.line);
      // 页签
      var tx = x + 8;
      for (var p = 0; p < PAGE_NAMES.length; p++) {
        var on = p === page;
        var label = PAGE_NAMES[p];
        setFont(11, on);
        var lw = ctx.measureText(label).width;
        if (on) box(tx - 4, y + 5, lw + 8, 17, 'rgba(182,131,20,0.22)');
        text(label, tx, y + 8, 11, on ? COL.jin : COL.mut);
        tx += lw + 16;
      }
      box(x + 6, y + 24, wd - 12, 1, COL.line);
      var cy = y + 30;
      if (page === 0) drawMenuRecord(game, x + 10, cy, wd - 20, ht);
      else if (page === 1) drawMenuCast(game, x + 10, cy, wd - 20, ht);
      else if (page === 2) drawMenuRoster(game, x + 10, cy, wd - 20, ht);
      else drawMenuSettings(game, x + 10, cy, wd - 20, ht);
      text(pick('左右换页 · 菜单关闭', '← → 换页 · M / Esc 关闭'), x + 8, y + ht - 15, 9, COL.mut);
    }

    function drawMenuRecord(game, x, y, wd, ht) {
      var save = game.save, s = G.Map.mapOf(save.map) || {};
      text('位置：' + (s.name || save.map), x, y, 10, COL.paper);
      var step = G.State.questStepDef(save);
      text('主线：' + (step ? step.name : '—'), x, y + 15, 10, COL.paper);
      if (step && step.hint) text(step.hint, x, y + 30, 9, COL.mut);
      text('队伍：' + save.party.map(function (id) { var c = G.State.castCard(id); return c ? c.name : id; }).join(' / '), x, y + 47, 10, COL.paper);
      var items = Object.keys(save.items || {});
      text('道具：' + (items.length ? items.map(function (k) { return ((w.GameData.items || {})[k] || {}).name || k; }).join('、') : '无'), x, y + 62, 9, COL.paper);
      var flags = Object.keys(save.flags || {}).length;
      var ending = G.State.hasFlag(save, 'ch0.ending.original') ? '归档' : G.State.hasFlag(save, 'ch0.ending.revision') ? '修订' : '未定';
      text('已记录 ' + flags + ' 项 · 结局：' + ending, x, y + 77, 9, COL.mut);
      text('每一次走动都会自动记录。', x, y + 94, 9, COL.mut);
    }

    function drawMenuCast(game, x, y, wd, ht) {
      var order = (w.GameData.partyOrder || []), sel = game.menuSel || 0, i;
      var colW = 78;
      for (i = 0; i < order.length; i++) {
        var id = order[i], card = G.State.castCard(id);
        if (!card) continue;
        var joined = game.save.party.indexOf(id) >= 0;
        var on = i === sel;
        if (on) box(x - 4, y + i * 17 - 3, colW, 17, 'rgba(182,131,20,0.22)');
        text((on ? '▶ ' : '　') + card.name, x, y + i * 17, 10, joined ? (on ? COL.jin : COL.paper) : COL.mut);
      }
      var card2 = G.State.castCard(order[sel]);
      if (!card2) return;
      var rx = x + colW + 6, rw = wd - colW - 6, bottom = y + ht - 30;
      box(rx - 4, y - 5, rw + 6, bottom - y + 6, 'rgba(11,13,17,0.5)', COL.line);
      // 头像放在左上，右侧排姓名与数值；简介从两者下方通栏开始，绝不压到头像
      var faceH = 84, faceW = faceWOf(faceH);
      if (card2.face && G.Assets.isReady(card2.face)) {
        box(rx, y, faceW + 2, faceH + 2, 'rgba(11,13,17,0.6)', COL.line);
        G.Assets.drawFrame(ctx, card2.face, 0, rx + 1, y + 1, faceW, faceH);
      } else {
        box(rx, y, faceW, faceH, 'rgba(244,245,247,0.06)', COL.line);
      }
      var bx = rx + faceW + 8, bw = Math.max(40, rw - faceW - 10);
      text(card2.name, bx, y - 2, 13, COL.paper);
      text(card2.role || '', bx, y + 17, 9, COL.jin);
      var st = card2.stats || {};
      text('生命 ' + (st.hp || 0), bx, y + 33, 9, COL.mut);
      text('攻 ' + (st.atk || 0) + ' · 防 ' + (st.def || 0) + ' · 速 ' + (st.spd || 0), bx, y + 46, 9, COL.mut);
      text('槽 ' + (st.slots || 0) + ' · 配额 ' + (st.quota || 0) + '（每回合 +' + (st.quotaRegen || 0) + '）', bx, y + 59, 9, COL.mut);
      var skills = (card2.skills || []).map(function (k) { return ((w.GameData.skills || {})[k] || {}).name || k; });
      if (skills.length) text('技能：' + skills.join('、'), bx, y + 72, 9, COL.mut);
      // 简介通栏，按剩余高度截断（宁可少几行，也不越出面板）
      var ty = y + faceH + 8, k = 0, shown = 0;
      var sources = [card2.bio, card2.community].filter(Boolean);
      for (k = 0; k < sources.length; k++) {
        setFont(9);
        var ls = wrap(sources[k], rw - 10);
        for (var j = 0; j < ls.length; j++) {
          if (ty + 10 > bottom) break;
          text(ls[j], rx, ty, 9, k === 0 ? COL.paper : COL.mut);
          ty += 10;
          shown++;
        }
        ty += 2;
        if (ty + 10 > bottom) break;
      }
      if (!shown) text('这个角色的介绍还没写。', rx, ty, 9, COL.mut);
    }

    /** 头像按目标高度等比算宽（48:60 = 4:5）。 */
    function faceWOf(h) { return Math.round(h * FACE_W / FACE_H); }

    function drawMenuRoster(game, x, y, wd, ht) {
      var roster = (w.GameData.roster || []), i, colW = (wd - 8) / 2;
      var rowH = 40, top = y + 12, bottom = y + ht - 30;
      var perPage = Math.max(2, Math.floor((bottom - top) / rowH) * 2);
      var pages = Math.max(1, Math.ceil(roster.length / perPage));
      game.menuScroll = Math.min(game.menuScroll || 0, pages - 1);
      var first = (game.menuScroll || 0) * perPage;
      text('榜单上的 ' + roster.length + ' 个名字（社区二创形象）', x, y - 2, 9, COL.mut);
      if (pages > 1) text((game.menuScroll + 1) + ' / ' + pages + ' 页 · 上下键翻页', x + wd - 10, y - 2, 9, COL.mut, 'right');
      for (i = first; i < roster.length && i < first + perPage; i++) {
        var r = roster[i], idx = i - first;
        var cx = x + (idx % 2) * (colW + 8), cy2 = top + Math.floor(idx / 2) * rowH;
        box(cx, cy2, colW - 4, rowH - 4, 'rgba(244,245,247,0.05)', COL.line);
        text(r.name + ' · ' + (r.alias || ''), cx + 5, cy2 + 2, 10, COL.paper);
        text(r.band || '', cx + colW - 9, cy2 + 2, 9, COL.jin, 'right');
        setFont(9);
        var ls = wrap(r.line || '', colW - 14);
        for (var j = 0; j < ls.length && j < 2; j++) text(ls[j], cx + 5, cy2 + 15 + j * 9, 9, COL.mut);
      }
    }

    function drawMenuSettings(game, x, y, wd, ht) {
      var s = game.save || {};
      text('存档：' + (G.Storage && G.Storage.FILE ? G.Storage.FILE : 'game-save.json'), x, y, 10, COL.paper);
      text('版本：' + (s.v || 1) + ' · 章节：' + (s.chapter || 'ch0'), x, y + 15, 10, COL.paper);
      text('画布：384×224 逻辑像素，整数倍放大', x, y + 30, 9, COL.mut);
      text('操作：' + pick('屏幕方向键走动 · 确定交互 · 菜单', '方向键/WASD 走动 · 空格 交互 · M 菜单'), x, y + 44, 9, COL.mut);
      text('返回：安卓返回键先关界面，再退出游戏', x, y + 58, 9, COL.mut);
      text('自动战斗：' + (game.mode === 'battle' ? '可用' : '仅战斗中'), x, y + 72, 9, COL.mut);
    }

    function drawToast(game) {
      if (!game.toast || game.toastTick > 120) return;
      var t = game.toast;
      setFont(10);
      var wd = ctx.measureText(t).width + 20;
      box((cam.vw - wd) / 2, 20, wd, 18, 'rgba(19,22,29,0.92)', COL.line);
      text(t, cam.vw / 2, 23, 10, COL.paper, 'center');
    }

    function drawFade(game) {
      if (!game.fade) return;
      ctx.fillStyle = 'rgba(11,13,17,' + Math.min(1, game.fade) + ')';
      ctx.fillRect(0, 0, cam.vw, cam.vh);
    }

    /** 标题页：先画原版，再让幕间认领提示行（幕间没认领时保持原版文案与排版）。 */
    function drawTitle(game) {
      box(0, 0, cam.vw, cam.vh, COL.dark);
      text('残响协议', cam.vw / 2, 58, 28, COL.paper, 'center');
      text('第 一 章 · 消失的第零页', cam.vw / 2, 94, 11, COL.jin, 'center');
      box(cam.vw / 2 - 34, 114, 68, 1, COL.line);
      var baseLine = game.save && game.hasSave ? pick('按「确定」继续上次的记录', '空格 继续上次的记录') : pick('按「确定」进入观测站', '空格 进入观测站');
      var extra = (w.GameEngine.Interlude && w.GameEngine.Interlude.titleLine) ? w.GameEngine.Interlude.titleLine(game) : null;
      var claimed = typeof extra === 'string' && extra;
      // 幕间只给「去哪」的短句，前缀按键提示由这里按触屏/键盘补，两处文案才都能对上屏幕上的按键
      text(claimed ? pick('按「确定」', '空格') + extra : baseLine, cam.vw / 2, 138, 11, claimed ? COL.jin : COL.mut, 'center');
      text(pick('方向键 走动 · 确定 交互 · 菜单', '方向键 / WASD 移动 · 空格 交互 · M 菜单'), cam.vw / 2, cam.vh - 26, 9, COL.mut, 'center');
      if (G.Assets.missing().length) {
        text('缺图 ' + G.Assets.missing().length + ' 项（已用占位块）', 6, cam.vh - 13, 9, COL.zhu);
      }
    }

    function frame(game) {
      cam.begin();
      if (game.mode === 'title') { drawTitle(game); drawToast(game); return; }
      if (game.mode === 'battle') { drawBattle(game); drawFade(game); drawToast(game); return; }
      // 幕间玩法模式：整屏交给幕间，原版场景层不画（避免两种界面叠在一起）
      if (w.GameEngine.Interlude && w.GameEngine.Interlude.isMode(game.mode)) {
        w.GameEngine.Interlude.render(game, surface);
        drawToast(game);
        return;
      }
      // 世界层跟着镜头走，UI 层保持在屏幕坐标
      ctx.save();
      if (cam.x || cam.y) ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
      drawMap(game);
      drawActors(game);
      ctx.restore();
      drawHud(game, game.mode !== 'dialog' && game.mode !== 'menu');
      if (game.mode === 'dialog') drawDialog(game);
      if (game.mode === 'menu') drawMenu(game);
      drawFade(game);
      drawToast(game);
    }

    return { frame: frame, ctx: ctx, text: text, box: box, surface: surface, vw: cam.vw, vh: cam.vh };
  }

  G.Render = { create: create, COLORS: COL, TILE: TILE };
})(window);
