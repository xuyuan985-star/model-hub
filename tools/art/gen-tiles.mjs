/* tools/art/gen-tiles.mjs — 场景图块集 tiles_world.png（24 格 16×16，单张图集，索引色）。
   图块本体在 gen-tiles-core.mjs；本文件只负责拼图集、落盘与预览（预览写 docs/shots/，不入库）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pix, Img, toRGBA } from './raster.mjs';
import { encodeIndexed, encodeRGBA } from './png.mjs';
import { masterPalette } from './palette.mjs';
import drawTile, { TILE_ORDER } from './gen-tiles-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'web/game/assets/pixel');
const SHOTS = path.join(ROOT, 'docs/shots');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const T = 16;
const PAL = masterPalette();
const order = TILE_ORDER;

/* ---------- 拼图集 ---------- */
const COLS = 6, ROWS = 4;
const AW = COLS * T, AH = ROWS * T;
const atlas = new Pix(AW, AH, PAL.map((c) => c.slice()));
atlas.alpha = PAL.map(() => 255);

const index = {};
order.forEach((name, i) => {
  const t = drawTile(name);
  const cx = (i % COLS) * T, cy = Math.floor(i / COLS) * T;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    atlas.px(cx + x, cy + y, t.d[y * T + x] || 0);
  }
  index[name] = i;
});

const pngBuf = encodeIndexed(AW, AH, atlas.d, atlas.palette, atlas.alpha.map(() => 255));
fs.writeFileSync(path.join(OUT, 'tiles_world.png'), pngBuf);

/* 预览：4× 最近邻 + 深色底 + 网格线，仅供队长评审，写入忽略目录。 */
const Z = 4, GP = 2;
const pv = new Img(AW * Z + GP * (COLS + 1), AH * Z + GP * (ROWS + 1));
pv.fillRect(0, 0, pv.w, pv.h, [19, 22, 29], 1);
for (let i = 0; i < order.length; i++) {
  const cx = GP + (i % COLS) * (T * Z + GP), cy = GP + Math.floor(i / COLS) * (T * Z + GP);
  const t = drawTile(order[i]);
  for (let y = 0; y < T * Z; y++) for (let x = 0; x < T * Z; x++) {
    const ci = t.d[Math.floor(y / Z) * T + Math.floor(x / Z)];
    if (!ci) continue;
    pv.blend(cx + x, cy + y, t.palette[ci], 1);
  }
}
fs.writeFileSync(path.join(SHOTS, 'tiles-preview.png'), encodeRGBA(pv.w, pv.h, toRGBA(pv)));
fs.writeFileSync(path.join(SHOTS, 'tiles-map.json'), JSON.stringify(index, null, 2));

console.log('tiles_world.png', AW + 'x' + AH, pngBuf.length + 'B', 'tiles=' + order.length);