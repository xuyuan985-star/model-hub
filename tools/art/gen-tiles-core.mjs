/* tools/art/gen-tiles-core.mjs — 24 格场景图块的绘制本体（纯函数，无文件 IO），图集与底图两处复用。
   真块约束：16×16 上按 2×2 块作画（8×8 网格），一块内不换色，同色相邻比例 ≥70%、单块 ≥2px。 */
import { Pix } from './raster.mjs';
import { P, masterPalette } from './palette.mjs';

const T = 16;
const B = 2;               // 块边长：所有落色都对齐到 2px 网格
const N = T / B;           // 8×8 块
const PAL = masterPalette();

/** 每格独立画布；索引直接取母版，保证整张图集只用一套色。 */
function tile() {
  const p = new Pix(T, T, PAL.map((c) => c.slice()));
  p.alpha = PAL.map(() => 255);
  return p;
}

/** 按块落色：bx/by 是 8×8 块坐标。 */
function blk(p, bx, by, ci) { p.rect(bx * B, by * B, B, B, ci); }
function bRow(p, bx0, bx1, by, ci) { for (let x = bx0; x <= bx1; x++) blk(p, x, by, ci); }
function bCol(p, bx, by0, by1, ci) { for (let y = by0; y <= by1; y++) blk(p, bx, y, ci); }
function bFill(p, bx0, by0, bx1, by1, ci) { for (let y = by0; y <= by1; y++) bRow(p, bx0, bx1, y, ci); }

/** 块级散点：块内不换色，散点也永远落在 2×2 上。 */
function bSpeckle(p, bx0, by0, bx1, by1, ci, density, seed) {
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      if ((((x * 73 + y * 151 + seed * 977) >>> 3) % 100) / 100 < density) blk(p, x, y, ci);
    }
  }
}

const tiles = {};
const order = [
  'ground', 'ground_pattern', 'wall', 'wall_top', 'obstacle', 'tree',
  'tree_dead', 'water', 'water_edge', 'platform', 'door', 'door_side',
  'terminal', 'crate', 'shelf', 'seal_wax', 'pillar_shadow', 'archive_cabinet',
  'soil', 'sprout', 'glass_wall', 'stage_rim', 'rug', 'rug_edge'
];

/* 地面：纸灰石地，稀疏 2×2 碎屑。 */
tiles.ground = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.paper3);
  bSpeckle(p, 0, 0, N - 1, N - 1, P.stone, 0.16, 11);
  return p;
};

/* 纹路地面：镶石回纹，用于厅内与苗床。 */
tiles.ground_pattern = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.paper3);
  bRow(p, 0, N - 1, 1, P.stone);
  bRow(p, 0, N - 1, 6, P.stone);
  bFill(p, 2, 3, 5, 4, P.paper2);
  return p;
};

/* 墙：砌块 + 灰缝（缝宽 1 块 = 2px）。 */
tiles.wall = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.ink2);
  bRow(p, 0, N - 1, 2, P.stone2);
  bRow(p, 0, N - 1, 5, P.stone2);
  bFill(p, 1, 0, 2, 1, P.stone2);
  bFill(p, 5, 0, 6, 1, P.stone2);
  bFill(p, 3, 3, 4, 4, P.stone2);
  bFill(p, 0, 6, 1, 7, P.stone2);
  bFill(p, 6, 6, 7, 7, P.stone2);
  return p;
};

/* 墙顶：档案馆檐口，金线收边。 */
tiles.wall_top = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.ink2);
  bRow(p, 0, N - 1, 0, P.stone);
  bRow(p, 0, N - 1, 1, P.gold);
  bRow(p, 0, N - 1, 2, P.gold2);
  bRow(p, 0, N - 1, 7, P.night);
  return p;
};

/* 障碍：翻倒的箱笼与碎纸。 */
tiles.obstacle = () => {
  const p = tiles.ground();
  bFill(p, 1, 3, 6, 6, P.wood2);
  bRow(p, 1, 6, 3, P.wood);
  bFill(p, 3, 4, 4, 5, P.paper2);
  bFill(p, 1, 6, 2, 6, P.paper);
  return p;
};

/* 树：温室的苔冠小树。 */
tiles.tree = () => {
  const p = tiles.ground();
  bCol(p, 3, 4, 7, P.wood);
  bCol(p, 4, 3, 7, P.wood2);
  bFill(p, 1, 1, 5, 3, P.moss);
  bFill(p, 2, 0, 4, 0, P.moss3);
  bFill(p, 5, 2, 6, 3, P.moss2);
  blk(p, 2, 1, P.moss3);
  return p;
};

/* 枯木：小巷的旧版本残枝，只有骨架（枝干一律 1 块宽）。 */
tiles.tree_dead = () => {
  const p = tiles.ground();
  bCol(p, 3, 3, 7, P.wood2);
  bRow(p, 0, 3, 3, P.wood2);
  bRow(p, 3, 6, 2, P.wood2);
  blk(p, 0, 2, P.wood);
  blk(p, 6, 1, P.wood);
  bRow(p, 3, 5, 7, P.wood);
  blk(p, 1, 0, P.paper3);
  return p;
};

/* 水：深靛水面 + 横向波纹（整行 2px 波带，不做抖动）。 */
tiles.water = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.indigo2);
  bRow(p, 0, N - 1, 1, P.indigo);
  bRow(p, 0, N - 1, 4, P.indigo);
  bRow(p, 0, N - 1, 6, P.indigo);
  bFill(p, 2, 2, 3, 2, P.indigo3);
  bFill(p, 5, 5, 6, 5, P.indigo3);
  return p;
};

/* 水岸：石缘 + 一线亮边，用于 ~ 与地面交界。 */
tiles.water_edge = () => {
  const p = tiles.water();
  bRow(p, 0, N - 1, 0, P.stone);
  bRow(p, 0, N - 1, 1, P.stone2);
  return p;
};

/* 平台：观测站的台沿（'='），金线压边。 */
tiles.platform = () => {
  const p = tiles.ground();
  bFill(p, 0, 0, N - 1, 3, P.stone);
  bRow(p, 0, N - 1, 0, P.paper2);
  bRow(p, 0, N - 1, 3, P.gold2);
  return p;
};

/* 门：拱形木门，朱漆封条（门后是另一张地图）。 */
tiles.door = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.ink2);
  bFill(p, 1, 0, 6, N - 1, P.wood2);
  bFill(p, 2, 1, 5, N - 1, P.ink);
  bCol(p, 0, 0, N - 1, P.wood);
  bCol(p, 7, 0, N - 1, P.wood);
  bRow(p, 1, 6, 0, P.wood);
  bRow(p, 2, 5, 3, P.red);
  bRow(p, 2, 5, 2, P.red2);
  blk(p, 3, 3, P.gold);
  return p;
};

/* 侧门柱：与 door 拼用的边柱。 */
tiles.door_side = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.ink2);
  bFill(p, 0, 0, 1, N - 1, P.wood2);
  bCol(p, 0, 0, N - 1, P.wood);
  bFill(p, 0, 1, 1, 2, P.gold2);
  bFill(p, 0, 5, 1, 6, P.gold2);
  return p;
};

/* 终端：巷内/温室里的查询柱，屏幕常亮（glow 是唯一自发光色）。 */
tiles.terminal = () => {
  const p = tiles.ground();
  bFill(p, 2, 1, 5, 6, P.ink2);
  bFill(p, 2, 2, 5, 4, P.night);
  bRow(p, 2, 5, 2, P.glow);
  bFill(p, 2, 6, 5, 6, P.stone2);
  blk(p, 5, 1, P.paper2);
  return p;
};

/* 木箱（'c'）：可交互的缓存箱，箱盖有编号纸。 */
tiles.crate = () => {
  const p = tiles.ground();
  bFill(p, 1, 2, 6, 7, P.wood);
  bRow(p, 1, 6, 2, P.wood2);
  bCol(p, 1, 2, 7, P.wood2);
  bRow(p, 1, 6, 4, P.wood2);
  bFill(p, 2, 5, 4, 5, P.paper2);
  blk(p, 3, 3, P.red);
  return p;
};

/* 书架：档案厅的密集卷宗。 */
tiles.shelf = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.ink2);
  bFill(p, 1, 1, 6, 6, P.wood2);
  bRow(p, 1, 6, 3, P.wood);
  bRow(p, 1, 6, 6, P.wood);
  bFill(p, 2, 1, 2, 2, P.paper2);
  bFill(p, 4, 1, 4, 2, P.red2);
  bFill(p, 6, 1, 6, 2, P.paper3);
  bFill(p, 2, 4, 3, 5, P.stone);
  bFill(p, 5, 4, 6, 5, P.red2);
  return p;
};

/* 封蜡：厅内两角的朱蜡封印，踩不上去。 */
tiles.seal_wax = () => {
  const p = tiles.ground();
  bFill(p, 2, 2, 5, 5, P.red);
  bFill(p, 3, 3, 4, 4, P.red2);
  blk(p, 4, 3, P.gold2);
  bFill(p, 1, 6, 2, 6, P.red2);
  return p;
};

/* 柱影：长廊柱基，与 # 拼出廊道透视。 */
tiles.pillar_shadow = () => {
  const p = tiles.ground();
  bFill(p, 1, 1, 6, 6, P.stone2);
  bFill(p, 2, 1, 5, 2, P.stone);
  bFill(p, 2, 5, 5, 5, P.ink);
  bCol(p, 1, 1, 6, P.ink);
  bCol(p, 6, 1, 6, P.ink2);
  bRow(p, 1, 6, 7, P.ink2);
  return p;
};

/* 档案柜：可挡路的柜体，抽屉带黄铜标签。 */
tiles.archive_cabinet = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.wood2);
  bCol(p, 0, 0, N - 1, P.wood);
  bCol(p, 7, 0, N - 1, P.ink);
  bFill(p, 1, 1, 6, 2, P.wood);
  bFill(p, 1, 4, 6, 5, P.wood);
  bFill(p, 3, 2, 4, 2, P.gold2);
  bFill(p, 3, 5, 4, 5, P.gold2);
  bRow(p, 0, N - 1, 0, P.paper3);
  bRow(p, 0, N - 1, 7, P.night);
  return p;
};

/* 土：温室苗床的湿土。 */
tiles.soil = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.wood);
  bSpeckle(p, 0, 0, N - 1, N - 1, P.wood2, 0.22, 57);
  bSpeckle(p, 0, 0, N - 1, N - 1, P.moss2, 0.12, 23);
  return p;
};

/* 苗：土上的一点新绿。 */
tiles.sprout = () => {
  const p = tiles.soil();
  bCol(p, 3, 3, 6, P.moss);
  bFill(p, 1, 3, 2, 3, P.moss3);
  bFill(p, 5, 2, 6, 2, P.moss3);
  blk(p, 3, 2, P.glow);
  return p;
};

/* 玻璃墙：温室围护，框 + 冷反光（斜线也按块走）。 */
tiles.glass_wall = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.indigo2);
  bFill(p, 1, 1, 6, 6, P.glass);
  bFill(p, 2, 2, 5, 5, P.indigo3);
  bRow(p, 0, N - 1, 0, P.stone2);
  bRow(p, 0, N - 1, 7, P.stone2);
  bCol(p, 0, 0, N - 1, P.stone2);
  bCol(p, 7, 0, N - 1, P.stone2);
  bCol(p, 3, 0, N - 1, P.stone2);
  bFill(p, 1, 3, 2, 4, P.glass);
  bFill(p, 5, 3, 6, 4, P.glass);
  return p;
};

/* 台沿：展台边的黄铜条。 */
tiles.stage_rim = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.ink2);
  bRow(p, 0, N - 1, 1, P.gold);
  bRow(p, 0, N - 1, 2, P.gold2);
  bRow(p, 0, N - 1, 3, P.ink);
  bRow(p, 0, N - 1, 6, P.ink2);
  bRow(p, 0, N - 1, 7, P.night);
  return p;
};

/* 地毯：朱红底 + 回纹边。 */
tiles.rug = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.red2);
  bRow(p, 1, 6, 1, P.gold2);
  bRow(p, 1, 6, 6, P.gold2);
  bCol(p, 1, 1, 6, P.gold2);
  bCol(p, 6, 1, 6, P.gold2);
  bFill(p, 3, 3, 4, 4, P.red);
  return p;
};

/* 地毯边：包边条，四条边都能接。 */
tiles.rug_edge = () => {
  const p = tile();
  bFill(p, 0, 0, N - 1, N - 1, P.red2);
  bRow(p, 0, N - 1, 1, P.gold2);
  bRow(p, 0, N - 1, 6, P.gold2);
  bFill(p, 2, 3, 5, 4, P.red);
  return p;
};

/** 图块名顺序（即 tiles_world.png 的索引顺序，改序必须同步 ART-SPEC §3）。 */
export const TILE_ORDER = order;

/** 按名取图块；未知名字回退地面，避免整张底图崩掉。 */
export default function drawTile(name) {
  const f = tiles[name];
  return f ? f() : tiles.ground();
}
