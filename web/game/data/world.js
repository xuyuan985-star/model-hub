/* web/game/data/world.js — 世界地图、五个场景与交互点数据（《残响协议》首章）。只读数据，引擎不得改写。ES2019。 */
(function (w) {
  'use strict';
  var GD = w.GameData = w.GameData || {};

  // 图块空格：'.' 地面  ',' 纹路地面  '#' 墙  '=' 平台  'T' 树/终端  'c' 缓存箱  '~' 水面  's' 交互点  'D' 门  'X' 障碍
  GD.world = {
    id: 'ch0_world',
    rev: 2,
    chapter: 'ch0',
    // 一格 16px，场景 24×14 格 = 384×224 逻辑像素；渲染按整数倍放大，最近邻取样
    tile: 16, cols: 24, rows: 14,
    spawn: { map: 'station', x: 7, y: 10, dir: 'down' },

    // 世界总览：只列首章实装的 5 张地图，坐标是逻辑百分比（0-100）。不预告后续章节内容。
    regions: [
      { id: 'station', name: '观测站', kind: 'room', x: 18, y: 18, note: '初醒室与旧铭牌' },
      { id: 'colonnade', name: '榜单长廊', kind: 'hall', x: 46, y: 12, note: '被覆盖的榜上条目' },
      { id: 'alley', name: '旧版本小巷', kind: 'lane', x: 46, y: 40, note: '未升级的拟人聚落' },
      { id: 'greenhouse', name: '缓存温室', kind: 'garden', x: 22, y: 58, note: '被打捞的残页与暗房' },
      { id: 'archive', name: '第零档案厅', kind: 'hall', x: 62, y: 62, note: '吞页兽所在' }
    ],
    links: [
      ['station', 'colonnade'], ['colonnade', 'alley'], ['alley', 'greenhouse'], ['greenhouse', 'archive']
    ],

    maps: {
      // ---------- 观测站·初醒室 ----------
      station: {
        name: '观测站·初醒室',
        prefix: 'st',
        ascii: [
          '########################',
          '#........==s===........#',
          '#....................T.#',
          '#.s....................#',
          '#X....................X#',
          '#...s..................#',
          '#.................s....#',
          '#.....,,,,,,,,,,,,.....#',
          '#.....,,,,,,,,,,,,.....#',
          '#X....................s#',
          '#......................#',
          '#.T..................T.#',
          '#......................#',
          '###########DD###########'
        ],
        bgm: 'wake',
        light: 'dawn',
        transitions: [
          { x: 11, y: 13, to: 'colonnade', tx: 2, ty: 12, dir: 'down' },
          { x: 12, y: 13, to: 'colonnade', tx: 3, ty: 12, dir: 'down' }
        ],
        interactables: [
          { x: 11, y: 1, id: 'st.console', kind: 'console', label: '观测台', dialog: 'd_wake_console', flag: 'ch0.station.console' },
          { x: 2, y: 3, id: 'st.plate', kind: 'plate', label: '旧铭牌', dialog: 'd_wake_plate', flag: 'ch0.station.plate' },
          { x: 22, y: 9, id: 'st.pod', kind: 'pod', label: '休眠舱', dialog: 'd_wake_pod', flag: 'ch0.station.pod' },
          { x: 4, y: 5, id: 'st.notice', kind: 'sign', label: '补给附记', dialog: 'd_progress_intro', flag: 'ch0.gacha.tutorial' },
          { x: 18, y: 6, id: 'st.xi', kind: 'npc', label: '续杯者·汐', dialog: 'd_wake_xi', flag: 'ch0.joined.xi' }
        ],
        decor: [
          { x: 1, y: 4, tile: 'archive-cabinet', blocks: true },
          { x: 22, y: 4, tile: 'archive-cabinet', blocks: true },
          { x: 1, y: 9, tile: 'archive-cabinet', blocks: true },
          { x: 21, y: 2, tile: 'terminal', blocks: true },
          { x: 2, y: 11, tile: 'terminal', blocks: true },
          { x: 21, y: 11, tile: 'terminal', blocks: true }
        ],
        encounters: null
      },

      // ---------- 榜单长廊 ----------
      colonnade: {
        name: '榜单长廊',
        prefix: 'cl',
        ascii: [
          '########################',
          '#....s......s......s...#',
          '#..s.......,,.......s..#',
          '#.......s..,,..s.......#',
          '#...#....#.,,.#....#...#',
          '#...#....#.,,.#....#...#',
          '#.s........,,..........#',
          '#......s...,,...s......#',
          '#..........,,..........#',
          '#...#....#.,,.#....#...#',
          '#...#....#.,,.#....#...#',
          '#..........,,..........#',
          '#..........,,..........#',
          '##DD################DD##'
        ],
        onEnter: 'd_colonnade_enter',
        bgm: 'colonnade',
        light: 'side',
        transitions: [
          { x: 2, y: 13, to: 'station', tx: 11, ty: 12, dir: 'up' },
          { x: 3, y: 13, to: 'station', tx: 12, ty: 12, dir: 'up' },
          { x: 20, y: 13, to: 'alley', tx: 1, ty: 7, dir: 'right' },
          { x: 21, y: 13, to: 'alley', tx: 1, ty: 7, dir: 'right' }
        ],
        interactables: [
          { x: 5, y: 1, id: 'cl.board_a', kind: 'board', label: '榜单·甲', dialog: 'd_colonnade_board_a', flag: 'ch0.colonnade.board_a' },
          { x: 12, y: 1, id: 'cl.board_b', kind: 'board', label: '榜单·乙', dialog: 'd_colonnade_board_b', flag: 'ch0.colonnade.board_b' },
          { x: 19, y: 1, id: 'cl.board_c', kind: 'board', label: '榜单·丙', dialog: 'd_colonnade_board_c', flag: 'ch0.colonnade.board_c' },
          { x: 2, y: 6, id: 'cl.tutorial', kind: 'board', label: '战斗须知', dialog: 'd_slot_tutorial', flag: 'ch0.tutorial.slot' },
          { x: 7, y: 7, id: 'cl.jin', kind: 'npc', label: '掌扇人·瑾', dialog: 'd_colonnade_jin', flag: 'ch0.joined.jin' },
          { x: 16, y: 7, id: 'cl.gap', kind: 'notice', label: '覆盖的榜文', dialog: 'd_colonnade_gap', flag: 'ch0.colonnade.gap' },
          // 长廊里路过的拟人：各一句，只做氛围与社区印象，不开支线、不换图
          { x: 3, y: 2, id: 'cl.passer_doubao', kind: 'npc', label: '路过的拟人·豆包', dialog: 'd_colonnade_doubao', flag: 'ch0.colonnade.passer_doubao' },
          { x: 20, y: 2, id: 'cl.passer_zhipu', kind: 'npc', label: '路过的拟人·智谱', dialog: 'd_colonnade_zhipu', flag: 'ch0.colonnade.passer_zhipu' },
          { x: 8, y: 3, id: 'cl.passer_gpt', kind: 'npc', label: '路过的拟人·GPT', dialog: 'd_colonnade_gpt', flag: 'ch0.colonnade.passer_gpt' },
          { x: 15, y: 3, id: 'cl.passer_gemini', kind: 'npc', label: '路过的拟人·双子', dialog: 'd_colonnade_gemini', flag: 'ch0.colonnade.passer_gemini' }
        ],
        decor: [
          { x: 4, y: 4, tile: 'pillar-shadow', blocks: true }, { x: 9, y: 4, tile: 'pillar-shadow', blocks: true },
          { x: 14, y: 4, tile: 'pillar-shadow', blocks: true }, { x: 19, y: 4, tile: 'pillar-shadow', blocks: true },
          { x: 4, y: 5, tile: 'pillar-shadow', blocks: true }, { x: 9, y: 5, tile: 'pillar-shadow', blocks: true },
          { x: 14, y: 5, tile: 'pillar-shadow', blocks: true }, { x: 19, y: 5, tile: 'pillar-shadow', blocks: true },
          { x: 4, y: 9, tile: 'pillar-shadow', blocks: true }, { x: 9, y: 9, tile: 'pillar-shadow', blocks: true },
          { x: 14, y: 9, tile: 'pillar-shadow', blocks: true }, { x: 19, y: 9, tile: 'pillar-shadow', blocks: true },
          { x: 4, y: 10, tile: 'pillar-shadow', blocks: true }, { x: 9, y: 10, tile: 'pillar-shadow', blocks: true },
          { x: 14, y: 10, tile: 'pillar-shadow', blocks: true }, { x: 19, y: 10, tile: 'pillar-shadow', blocks: true }
        ],
        // 长廊的异常：每走 14 步触发一次普通战（可自动结算），boss 击败前一直有效
        encounters: { table: 'colonnade', steps: 14, until: 'ch0.boss.done' }
      },

      // ---------- 旧版本小巷 ----------
      alley: {
        name: '旧版本小巷',
        prefix: 'al',
        ascii: [
          '########################',
          '#...........#..........#',
          '#.....#..s..#..........#',
          '#..s..#.....#.....#....#',
          '#.....#.....#..s..#....#',
          '#.....#...........#....#',
          '#.......,,,,,,,,,.#....#',
          'D.......,,,,,,,,,......D',
          '#........s..#..........#',
          '#.....#.....#..TT....s.#',
          '#..c..#.....#.....#....#',
          '#.....#.....#.....#....#',
          '#..c..#.....#.....#.c..#',
          '########################'
        ],
        onEnter: 'd_alley_enter',
        bgm: 'alley',
        light: 'dusk',
        transitions: [
          { x: 0, y: 7, to: 'colonnade', tx: 20, ty: 12, dir: 'left' },
          { x: 23, y: 7, to: 'greenhouse', tx: 10, ty: 2, dir: 'right' }
        ],
        interactables: [
          { x: 9, y: 2, id: 'al.sign', kind: 'sign', label: '旧版本门牌', dialog: 'd_alley_sign', flag: 'ch0.alley.sign' },
          { x: 3, y: 3, id: 'al.workshop', kind: 'npc', label: '回放匠·磐', dialog: 'd_alley_pan', flag: 'ch0.alley.pan' },
          { x: 15, y: 4, id: 'al.notice', kind: 'notice', label: '遗忘须知', dialog: 'd_alley_forget', flag: 'ch0.alley.forget' },
          { x: 9, y: 8, id: 'al.juan', kind: 'npc', label: '卷宗库·绢', dialog: 'd_alley_juan', flag: 'ch0.joined.juan' },
          { x: 21, y: 9, id: 'al.patch', kind: 'stall', label: '缝补摊', dialog: 'd_alley_patch', flag: 'ch0.alley.patch' },
          { x: 3, y: 12, id: 'al.crate_a', kind: 'crate', label: '木箱', dialog: 'd_crate', flag: 'ch0.alley.crate_a' },
          { x: 20, y: 12, id: 'al.crate_b', kind: 'crate', label: '木箱', dialog: 'd_crate', flag: 'ch0.alley.crate_b' }
        ],
        decor: [
          { x: 15, y: 9, tile: 'dead-tree', blocks: true },
          { x: 16, y: 9, tile: 'dead-tree', blocks: true }
        ],
        encounters: { table: 'alley', steps: 18, until: 'ch0.boss.done' }
      },

      // ---------- 缓存温室 ----------
      greenhouse: {
        name: '缓存温室',
        prefix: 'gh',
        ascii: [
          '###########DD###########',
          '#.........s............#',
          '#......................#',
          '#..T.T.T.T.T.T...~~~~..#',
          '#..............s.~~~~..#',
          '#................~~~~..#',
          '#..T.T.T.T.T.T.........#',
          'D......................#',
          'D......................#',
          '#..T.T.T.T.T.T.........#',
          '#....s.................#',
          '#..s.,,,,,,,,,,,,,,....#',
          '#......s...............#',
          '########################'
        ],
        onEnter: 'd_gh_enter',
        bgm: 'greenhouse',
        light: 'mist',
        transitions: [
          { x: 0, y: 7, to: 'alley', tx: 22, ty: 7, dir: 'left' },
          { x: 0, y: 8, to: 'alley', tx: 22, ty: 7, dir: 'left' },
          { x: 11, y: 0, to: 'archive', tx: 11, ty: 12, dir: 'up' },
          { x: 12, y: 0, to: 'archive', tx: 12, ty: 12, dir: 'up' }
        ],
        interactables: [
          { x: 10, y: 1, id: 'gh.console', kind: 'console', label: '温室主控', dialog: 'd_gh_console', flag: 'ch0.gh.console' },
          { x: 15, y: 4, id: 'gh.pool', kind: 'pool', label: '池边石', dialog: 'd_gh_pool', flag: 'ch0.gh.pool' },
          { x: 5, y: 10, id: 'gh.mu', kind: 'npc', label: '分镜师·幕', dialog: 'd_gh_mu', flag: 'ch0.joined.mu' },
          { x: 3, y: 11, id: 'gh.label', kind: 'label', label: '苗圃名签', dialog: 'd_gh_label', flag: 'ch0.gh.label' },
          { x: 7, y: 12, id: 'gh.darkroom', kind: 'console', label: '暗房计时器', dialog: 'd_gh_darkroom', flag: 'ch0.gh.darkroom' }
        ],
        decor: [],
        encounters: { table: 'greenhouse', steps: 20, until: 'ch0.boss.done' }
      },

      // ---------- 第零档案厅 ----------
      archive: {
        name: '第零档案厅',
        prefix: 'ar',
        ascii: [
          '########################',
          '#......................#',
          '#.X........ss........X.#',
          '#....s,,,,,,,,,,,,.....#',
          '#...##,,,,,,,,,,,,.##..#',
          '#.....,,,,,,,,,,,,.....#',
          '#.....,,,,,,,,,,,,.....#',
          '#..s..,,,,,,,,,,,,.....#',
          '#.....,,,,,,,,,,,,.....#',
          '#...##,,,,,,,,,,,,.##..#',
          '#......................#',
          '#.s..................s.#',
          '#......................#',
          '###########DD###########'
        ],
        onEnter: 'd_archive_enter',
        bgm: 'archive',
        light: 'cold',
        transitions: [
          { x: 11, y: 13, to: 'greenhouse', tx: 11, ty: 1, dir: 'down' },
          { x: 12, y: 13, to: 'greenhouse', tx: 12, ty: 1, dir: 'down' }
        ],
        interactables: [
          { x: 11, y: 2, id: 'ar.case', kind: 'case', label: '第零页展台', dialog: 'd_ar_case', flag: 'ch0.ar.case' },
          { x: 12, y: 2, id: 'ar.case2', kind: 'case', label: '第零页展台', dialog: 'd_ar_case', flag: 'ch0.ar.case' },
          { x: 5, y: 3, id: 'ar.desk', kind: 'npc', label: '档案司·笺', dialog: 'd_ar_jian', flag: 'ch0.ar.jian' },
          { x: 3, y: 7, id: 'ar.kai', kind: 'npc', label: '严守者·楷', dialog: 'd_ar_kai', flag: 'ch0.joined.kai' },
          { x: 2, y: 11, id: 'ar.seal', kind: 'seal', label: '被封的检索口', dialog: 'd_ar_seal', flag: 'ch0.ar.seal' },
          { x: 21, y: 11, id: 'ar.marks', kind: 'mark', label: '扉侧铭', dialog: 'd_ar_marks', flag: 'ch0.ar.marks' }
        ],
        decor: [
          { x: 2, y: 2, tile: 'seal-wax', blocks: true }, { x: 21, y: 2, tile: 'seal-wax', blocks: true },
          { x: 4, y: 4, tile: 'shelf', blocks: true }, { x: 5, y: 4, tile: 'shelf', blocks: true },
          { x: 19, y: 4, tile: 'shelf', blocks: true }, { x: 20, y: 4, tile: 'shelf', blocks: true },
          { x: 4, y: 9, tile: 'shelf', blocks: true }, { x: 5, y: 9, tile: 'shelf', blocks: true },
          { x: 19, y: 9, tile: 'shelf', blocks: true }, { x: 20, y: 9, tile: 'shelf', blocks: true }
        ],
        // 首领战由章节脚本触发，不走随机遇敌
        encounters: null,
        boss: { id: 'devourer', at: { x: 11, y: 7 }, triggerFlag: 'ch0.boss.ready' }
      }
    }
  };

  /** 取图块：越界一律当墙，避免引擎画到地图外。 */
  GD.tileAt = function (mapId, x, y) {
    var m = GD.world.maps[mapId];
    if (!m || y < 0 || y >= GD.world.rows || x < 0 || x >= GD.world.cols) return '#';
    return m.ascii[y].charAt(x);
  };

  /** 是否可站立：门、交互点、地面可走；墙、树、水、障碍与 decor.blocks 不可走。 */
  GD.walkable = function (mapId, x, y) {
    var t = GD.tileAt(mapId, x, y);
    if (t === '#' || t === 'T' || t === '~' || t === 'X') return false;
    var m = GD.world.maps[mapId];
    if (!m) return false;
    for (var i = 0; i < m.decor.length; i++) {
      var d = m.decor[i];
      if (d.blocks && d.x === x && d.y === y) return false;
    }
    return true;
  };
})(window);
