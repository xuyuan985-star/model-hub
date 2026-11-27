/* tools/art/gen-boss.mjs — 吞页兽 boss_devourer.png：32×32，三阶段 × 4 帧呼吸循环（单朝向·面向下）。
   阶段语义：1 碎纸包裹 / 2 反刍后露出口部空洞 / 3 边缘透光将散。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pix, Img, toRGBA } from './raster.mjs';
import { encodeIndexed, encodeRGBA } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'web/game/assets/pixel');
const SHOTS = path.join(ROOT, 'docs/shots');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const W = 32, H = 32;

/** 本体配色：紫褐纸浆 + 朱红裂口 + 纸白碎页，全程索引色、无半透明。 */
function palette() {
  return [
    [0, 0, 0],        // 0 透明
    [25, 31, 43],     // 1 ink 描边
    [58, 46, 69],     // 2 plum
    [40, 31, 48],     // 3 plum-dark
    [84, 68, 96],     // 4 plum-light
    [231, 227, 218],  // 5 paper
    [196, 190, 178],  // 6 paper-dim
    [197, 40, 47],    // 7 red
    [142, 29, 34],    // 8 red-dark
    [182, 131, 20],   // 9 gold
    [70, 194, 150]    // 10 glow（三阶段透光）
  ];
}

const C = { ink: 1, plum: 2, plumD: 3, plumL: 4, paper: 5, paperD: 6, red: 7, redD: 8, gold: 9, glow: 10 };

/** 真块指标要求「同色相邻 ≥70%，单块 ≥2px」，所以噪声只在 2×2 块上取值，色带宽度 ≥2px。 */
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) * 1274126177 >>> 0;
  return (h >>> 8) / 16777216;
}
const blockHash = (x, y, s) => hash(Math.floor(x / 2), Math.floor(y / 2), s);

function draw(phase, frame) {
  const p = new Pix(W, H, palette());
  p.alpha = p.palette.map(() => 255);
  p.alpha[0] = 0; // 索引 0 = 透明（写进 tRNS）
  const breath = [0, 1, 0, -1][frame];
  // 体量吃满 32×32：轮廓对/面积比越小，真块比例越高
  const cx = 16, cy = 16 + (frame === 1 ? 1 : 0);
  const rx = 14;
  const ry = 13 + breath * 0.6;

  /** 形状按 2×2 块求解：轮廓落在块边界上，读起来是台阶而不是散点。 */
  const B = 2;
  const fieldAt = (bx, by) => {
    const x = bx * B + 1, y = by * B + 1;
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    const ang = Math.atan2(ny, nx);
    const k = Math.round(ang * 5);
    const jag = (hash(k + 20, 3, phase * 7 + (frame & 1)) - 0.5) * 0.22;
    return Math.sqrt(nx * nx + ny * ny) + jag;
  };

  // 三色：外缘碎页环（一块厚）+ 纸浆体。全部按块落色，块内不再换色。
  for (let by = 0; by < H / B; by++) {
    for (let bx = 0; bx < W / B; bx++) {
      const d = fieldAt(bx, by);
      if (d > 1) continue;
      let ci;
      if (d > 0.82) ci = phase === 3 ? C.glow : C.paperD;
      else ci = C.plum;
      p.rect(bx * B, by * B, B, B, ci);
    }
  }

  // 口部：2px 粗裂口（块对齐），上下各一条唇色
  const my = 19 + (frame === 1 ? 2 : 0);
  const bx0 = 4, bx1 = 11;                      // 块坐标 8..24 像素
  p.rect(bx0 * B, my, (bx1 - bx0 + 1) * B, B, C.ink);
  p.rect((bx0 + 1) * B, my - 2, (bx1 - bx0 - 1) * B, B, C.redD);
  if (phase === 2) {
    p.rect((bx0 + 1) * B, my + 2, (bx1 - bx0 - 1) * B, B, C.ink);
    p.rect((bx0 + 1) * B, my - 4, (bx1 - bx0 - 1) * B, B, C.red);
    p.rect(2 * B, 13 * B, 2 * B, B, C.paperD);  // 反刍碎页
  }
  if (phase === 3) {
    p.rect((bx0 + 1) * B, my - 4, (bx1 - bx0 - 1) * B, B, C.glow);
  }

  // 眼：4×4 墨块 + 2×2 瞳，块对齐
  p.rect(4 * B, 5 * B, 2 * B, 2 * B, C.ink);
  p.rect(9 * B, 5 * B, 2 * B, 2 * B, C.ink);
  const pupil = phase === 3 ? C.glow : C.red;
  p.rect(4 * B + 1, 5 * B + 1, B, B, pupil);
  p.rect(9 * B + 1, 5 * B + 1, B, B, pupil);

  p.outline(C.ink);
  return p;
}

const frames = [];
for (let phase = 1; phase <= 3; phase++) for (let f = 0; f < 4; f++) frames.push({ phase, f, pix: draw(phase, f) });

const COLS = 4, ROWS = 3;
const AW = COLS * W, AH = ROWS * H;
const atlas = new Pix(AW, AH, palette());
atlas.alpha = atlas.palette.map(() => 255);
atlas.alpha[0] = 0;
frames.forEach(({ phase, f, pix }) => {
  const ox = f * W, oy = (phase - 1) * H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) atlas.px(ox + x, oy + y, pix.get(x, y));
});

const buf = encodeIndexed(AW, AH, atlas.d, atlas.palette, atlas.alpha);
fs.writeFileSync(path.join(OUT, 'boss_devourer.png'), buf);

// 预览：三阶段第 0 帧，3× 放大
const Z = 3;
const pv = new Img(W * Z * 3 + 16, H * Z + 8);
pv.fillRect(0, 0, pv.w, pv.h, [19, 22, 29], 1);
for (let phase = 1; phase <= 3; phase++) {
  const pix = draw(phase, 0);
  const ox = 4 + (phase - 1) * (W * Z + 4);
  for (let y = 0; y < H * Z; y++) for (let x = 0; x < W * Z; x++) {
    const ci = pix.get(Math.floor(x / Z), Math.floor(y / Z));
    if (!ci) continue;
    pv.blend(ox + x, 4 + y, pix.palette[ci], 1);
  }
}
fs.writeFileSync(path.join(SHOTS, 'boss-preview.png'), encodeRGBA(pv.w, pv.h, toRGBA(pv)));
console.log('boss_devourer.png', AW + 'x' + AH, buf.length + 'B', 'frames=' + frames.length);