/* tools/art/gen-ui.mjs — UI 与特效：槽格三态、图标三行、三种招式特效、立绘对话框 9-patch 边框。
   全部索引色，尺寸取 16 的整数倍；输出 web/game/assets/pixel/。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pix, Img, toRGBA } from './raster.mjs';
import { encodeIndexed, encodeRGBA } from './png.mjs';
import { P, masterPalette } from './palette.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'web/game/assets/pixel');
const SHOTS = path.join(ROOT, 'docs/shots');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const PAL = masterPalette();
const canvas = (w, h) => {
  const p = new Pix(w, h, PAL.map((c) => c.slice()));
  p.alpha = PAL.map((c, i) => (i === 0 ? 0 : 255));
  return p;
};
const save = (name, p) => {
  const buf = encodeIndexed(p.w, p.h, p.d, p.palette, p.alpha);
  fs.writeFileSync(path.join(OUT, name), buf);
  return buf.length;
};

/** 槽格：48×48，三态横排（空 / 占用 / 遗忘）。 */
function slotFrame(state) {
  const S = 48;
  const p = canvas(S, S);
  const edge = state === 2 ? P.stone2 : P.ink;
  const fill = state === 0 ? P.night : (state === 2 ? P.ink2 : P.paper3);
  const accent = state === 2 ? P.stone : P.gold;
  // 底板
  p.rect(3, 3, S - 6, S - 6, fill);
  // 外框：双线 + 四角金饰
  p.rect(2, 2, S - 4, S - 4, edge);
  for (let i = 3; i < S - 3; i++) {
    p.px(i, 3, P.ink); p.px(i, S - 4, P.ink);
    p.px(3, i, P.ink); p.px(S - 4, i, P.ink);
  }
  p.rect(4, 4, S - 8, 1, accent);
  p.rect(4, S - 5, S - 8, 1, accent);
  p.rect(4, 4, 1, S - 8, accent);
  p.rect(S - 5, 4, 1, S - 8, accent);
  // 四角：八格对角饰
  for (const [cx, cy, sx, sy] of [[6, 6, 1, 1], [S - 7, 6, -1, 1], [6, S - 7, 1, -1], [S - 7, S - 7, -1, -1]]) {
    p.px(cx, cy, P.gold2);
    p.px(cx + sx, cy, P.gold);
    p.px(cx, cy + sy, P.gold);
    p.px(cx + sx * 2, cy, P.ink);
    p.px(cx, cy + sy * 2, P.ink);
  }
  if (state === 1) {
    // 占用：中心一枚纸白符记
    p.rect(20, 20, 8, 8, P.ink);
    p.rect(21, 21, 6, 6, P.paper);
    p.rect(23, 23, 2, 2, P.red);
  } else if (state === 2) {
    // 遗忘：中心划掉的对角线
    p.line(17, 17, 30, 30, P.stone2);
    p.line(30, 17, 17, 30, P.stone2);
    p.line(17, 18, 29, 30, P.ink2);
  } else {
    // 空：中心一个虚线小方
    for (let i = 0; i < 7; i += 2) { p.px(21 + i, 21, P.stone2); p.px(21 + i, 27, P.stone2); }
    for (let i = 0; i < 7; i += 2) { p.px(21, 21 + i, P.stone2); p.px(27, 21 + i, P.stone2); }
  }
  return p;
}

// 48×3 = 144 宽
const slot = canvas(144, 48);
[0, 1, 2].forEach((s, i) => {
  const f = slotFrame(s);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) slot.px(i * 48 + x, y, f.get(x, y));
});
const slotBytes = save('ui_slot_frame.png', slot);

/** 图标：三行（技能 / 情报 / 增益）× 12 枚 16×16。 */
const ICON_ROWS = [
  // 技能：观测 眼 / 回响 环形箭头 / 断列 断裂列 / 先制裁 断箭头 / 打捞 钩 / 补页 纸+针 / 降级 向下梯 / 复诵 双环 / 广播 喇叭 / 静默 划线话筒 / 封印 锁 / 记忆 星
  ['eye', 'loop', 'cut', 'arrow', 'hook', 'mend', 'step', 'double', 'horn', 'mute', 'lock', 'star'],
  // 情报：弱点 / 护页 / 反刍 / 稽核 / 缓存 / 夜行 / 湿气 / 折痕 / 旧版 / 名册 / 封蜡 / 空白
  ['mark', 'shield', 'vomit', 'stamp', 'cache', 'moon', 'drop', 'fold', 'old', 'list', 'wax', 'blank'],
  // 增益：命中 / 护持 / 加速 / 静气 / 锐利 / 坚固 / 蓄势 / 回春 / 明察 / 同心 / 余温 / 逆流
  ['hit', 'guard', 'haste', 'calm', 'sharp', 'solid', 'charge', 'heal', 'insight', 'bond', 'warm', 'flow']
];

function icon(kind, k) {
  const p = canvas(16, 16);
  const c = P.ink, a = P.gold, w = P.paper, r = P.red, g = P.glow, s = P.stone;
  switch (k) {
    case 'eye': p.ellipse(8, 8, 5, 3, c, false); p.rect(7, 7, 2, 2, r); p.px(8, 8, w); break;
    case 'loop': p.ellipse(8, 8, 5, 5, c, false); p.line(8, 2, 11, 4, c); p.px(12, 8, a); break;
    case 'cut': p.vline(8, 2, 13, c); p.hline(3, 6, 8, r); p.hline(10, 13, 8, r); break;
    case 'arrow': p.line(3, 12, 12, 3, c); p.line(12, 3, 8, 3, c); p.line(12, 3, 12, 7, c); break;
    case 'hook': p.vline(8, 2, 9, c); p.ellipse(6, 10, 3, 3, c, false); p.px(8, 2, a); break;
    case 'mend': p.rect(3, 3, 7, 9, w); p.rect(3, 3, 7, 1, c); p.line(11, 4, 13, 12, a); break;
    case 'step': p.rect(3, 3, 4, 3, c); p.rect(9, 7, 4, 3, c); p.rect(5, 11, 4, 3, s); break;
    case 'double': p.ellipse(6, 8, 4, 4, c, false); p.ellipse(10, 8, 4, 4, c, false); break;
    case 'horn': p.rect(3, 6, 4, 4, c); p.line(7, 6, 12, 3, c); p.line(7, 9, 12, 12, c); p.px(2, 8, a); break;
    case 'mute': p.rect(3, 6, 3, 4, c); p.line(8, 4, 12, 12, r); p.line(12, 4, 8, 12, r); break;
    case 'lock': p.rect(4, 7, 8, 7, c); p.ellipse(8, 6, 3, 3, c, false); p.rect(7, 9, 2, 2, a); break;
    case 'star': p.line(8, 2, 8, 13, a); p.line(3, 8, 13, 8, a); p.line(5, 5, 11, 11, w); p.line(11, 5, 5, 11, w); break;
    case 'mark': p.ellipse(8, 8, 5, 5, c, false); p.px(8, 8, r); p.px(9, 6, r); break;
    case 'shield': p.line(8, 2, 13, 5, c); p.line(8, 2, 3, 5, c); p.line(3, 5, 5, 13, c); p.line(13, 5, 11, 13, c); p.line(5, 13, 8, 14, c); p.line(11, 13, 8, 14, c); p.rect(6, 6, 4, 4, s); break;
    case 'vomit': p.ellipse(8, 6, 5, 3, c, false); p.line(6, 9, 4, 13, r); p.line(10, 9, 12, 13, r); break;
    case 'stamp': p.rect(4, 3, 8, 4, c); p.rect(3, 8, 10, 3, c); p.rect(5, 11, 6, 2, r); break;
    case 'cache': p.rect(3, 4, 10, 8, c); p.hline(4, 11, 6, s); p.hline(4, 11, 9, s); p.px(6, 6, g); break;
    case 'moon': p.ellipse(8, 8, 5, 5, c, false); p.ellipse(10, 7, 4, 4, P.night, true); p.px(4, 5, w); break;
    case 'drop': p.line(8, 3, 5, 9, c); p.line(8, 3, 11, 9, c); p.ellipse(8, 10, 3, 3, c, true); p.px(7, 10, w); break;
    case 'fold': p.rect(3, 4, 10, 9, w); p.line(3, 4, 8, 8, c); p.line(13, 4, 8, 8, c); break;
    case 'old': p.rect(3, 3, 10, 11, w); p.hline(3, 12, 3, c); p.line(4, 6, 11, 12, s); p.line(11, 6, 4, 12, s); break;
    case 'list': p.rect(3, 2, 10, 12, w); for (let y = 5; y < 12; y += 3) p.hline(5, 10, y, c); break;
    case 'wax': p.ellipse(8, 8, 5, 4, r, true); p.ellipse(8, 8, 2, 1, a, false); break;
    case 'blank': p.rect(3, 3, 10, 11, w); p.rect(3, 3, 10, 1, s); p.rect(3, 13, 10, 1, s); break;
    case 'hit': p.ellipse(8, 8, 4, 4, c, false); p.line(8, 1, 8, 4, r); p.line(8, 12, 8, 15, r); break;
    case 'guard': p.line(3, 4, 13, 4, c); p.line(3, 4, 8, 14, c); p.line(13, 4, 8, 14, c); p.hline(5, 11, 8, s); break;
    case 'haste': p.line(3, 11, 11, 3, c); p.line(11, 3, 6, 3, c); p.line(5, 13, 13, 5, a); break;
    case 'calm': p.hline(2, 13, 7, c); p.hline(3, 12, 9, s); p.hline(4, 11, 5, s); break;
    case 'sharp': p.line(3, 12, 12, 3, w); p.line(4, 12, 12, 4, c); p.px(12, 3, r); break;
    case 'solid': p.rect(3, 5, 10, 8, c); p.rect(5, 7, 6, 4, s); break;
    case 'charge': p.line(4, 12, 8, 4, a); p.line(8, 4, 12, 12, a); p.hline(6, 10, 8, c); break;
    case 'heal': p.line(8, 3, 8, 13, g); p.line(3, 8, 13, 8, g); p.px(8, 8, w); break;
    case 'insight': p.ellipse(8, 7, 4, 4, c, false); p.line(8, 11, 8, 14, s); p.px(8, 7, a); break;
    case 'bond': p.ellipse(5, 8, 3, 3, c, false); p.ellipse(11, 8, 3, 3, c, false); p.px(8, 8, a); break;
    case 'warm': p.ellipse(8, 9, 4, 4, r, true); p.line(8, 2, 6, 6, a); p.line(8, 2, 10, 6, a); break;
    case 'flow': p.line(2, 5, 13, 5, s); p.line(2, 8, 13, 8, c); p.line(2, 11, 13, 11, s); break;
    default: p.rect(4, 4, 8, 8, c);
  }
  p.outline(P.ink);
  return p;
}

/** 图标先按 16×16 画，再按 2×2 多数票降到 8×8 回放：格内不出现 1px 细线，整枚落在 2px 真块网格上。 */
function snap2x2(ic) {
  const out = new Pix(16, 16, ic.palette.map((c) => c.slice()));
  out.alpha = ic.alpha.slice();
  for (let by = 0; by < 8; by++) for (let bx = 0; bx < 8; bx++) {
    const tally = new Map();
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const ci = ic.get(bx * 2 + dx, by * 2 + dy);
      tally.set(ci, (tally.get(ci) || 0) + 1);
    }
    let best = 0, bestN = -1;
    tally.forEach((n, ci) => { if (n > bestN) { bestN = n; best = ci; } });
    out.rect(bx * 2, by * 2, 2, 2, best);
  }
  return out;
}

const icons = canvas(16 * 12, 16 * 3);
ICON_ROWS.forEach((row, r) => row.forEach((k, i) => {
  const ic = snap2x2(icon(r, k));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) icons.px(i * 16 + x, r * 16 + y, ic.get(x, y));
}));
const iconBytes = save('ui_slot_icons.png', icons);

/** 2px 块笔刷：特效里的曲线/圆环一律按块落色，单点笔刷会把真块比例拖到 50%。 */
function blk(p, x, y, ci) { p.rect(Math.round(x / 2) * 2, Math.round(y / 2) * 2, 2, 2, ci); }

/** 特效：64×64 × 4 帧，横向拼接。 */
function fxSlash(f) {
  const p = canvas(64, 64);
  const t = (f + 1) / 4;
  const cx = 14, cy = 14, r = 40;
  // 刀光是一条 2px 厚的块带；尾段 2 块换成朱红，读起来是"余温"而不是抖动
  for (let a = 0; a < 96 * t; a += 1.6) {
    const rad = ((a - 20) * Math.PI) / 180;
    const x = cx + Math.cos(rad) * (r - 6), y = cy + Math.sin(rad) * (r - 6);
    blk(p, x, y, P.paper);
    if (a > 96 * t - 20) blk(p, x, y + 2, P.red);
  }
  return p;
}
function fxPageBurst(f) {
  const p = canvas(64, 64);
  const cx = 32, cy = 32, d = [6, 14, 22, 30][f];
  // 碎页一律 4×4 / 6×6 块，块内不换色；不再点 1px 角标
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + f * 0.12;
    const x = Math.round((cx + Math.cos(a) * d) / 2) * 2, y = Math.round((cy + Math.sin(a) * d) / 2) * 2;
    const s = i % 3 === 0 ? 6 : 4;
    p.rect(x, y, s, s, i % 2 ? P.paper : P.paper2);
  }
  if (f === 0) {
    p.rect(cx - 8, cy - 8, 16, 16, P.paper3);
    p.rect(cx - 4, cy - 4, 8, 8, P.paper);
  }
  return p;
}
function fxSilence(f) {
  const p = canvas(64, 64);
  const r = [10, 18, 26, 34][f];
  // 静默波环：一格 2px 的圆环（每 22.5° 一块，环上不留缝）
  for (let ang = 0; ang < 360; ang += 22.5) {
    const rad = (ang * Math.PI) / 180;
    blk(p, 32 + Math.cos(rad) * r, 32 + Math.sin(rad) * r, P.glow);
  }
  // 中央的话筒被划掉（对话筒本体 + 2px 粗斜杠）
  p.rect(28, 22, 8, 12, P.stone2);
  p.rect(30, 24, 4, 8, P.ink);
  p.rect(24, 36, 16, 2, P.ink);
  for (let i = 0; i < 9; i++) p.rect(23 + i * 2, 23 + i * 2, 2, 2, P.red);
  return p;
}

const FX = [
  ['fx_slash.png', fxSlash],
  ['fx_page_burst.png', fxPageBurst],
  ['fx_silence.png', fxSilence]
];
const fxBytes = {};
for (const [name, fn] of FX) {
  const sheet = canvas(64 * 4, 64);
  for (let f = 0; f < 4; f++) {
    const one = fn(f);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) sheet.px(f * 64 + x, y, one.get(x, y));
  }
  fxBytes[name] = save(name, sheet);
}

/** 立绘对话框 9-patch：64×64，角 16px。 */
function portraitFrame() {
  const p = canvas(64, 64);
  p.rect(2, 2, 60, 60, P.paper);
  p.rect(2, 2, 60, 3, P.ink);
  p.rect(2, 59, 60, 3, P.ink);
  p.rect(2, 2, 3, 60, P.ink);
  p.rect(59, 2, 3, 60, P.ink);
  p.rect(6, 6, 52, 1, P.gold);
  p.rect(6, 57, 52, 1, P.gold);
  p.rect(6, 6, 1, 52, P.gold);
  p.rect(57, 6, 1, 52, P.gold);
  // 四角回纹
  for (const [x0, y0, sx, sy] of [[9, 9, 1, 1], [54, 9, -1, 1], [9, 54, 1, -1], [54, 54, -1, -1]]) {
    for (let i = 0; i < 6; i++) { p.px(x0 + sx * i, y0, P.gold2); p.px(x0, y0 + sy * i, P.gold2); }
    p.px(x0 + sx * 5, y0 + sy * 5, P.red);
  }
  // 中点朱印（对话推进提示位）
  p.rect(30, 58, 4, 2, P.red);
  return p;
}
const pfBytes = save('ui_portrait_frame.png', portraitFrame());

/* 预览（忽略目录） */
const Z = 3;
const pv = new Img(16 * Z + slot.w * Z + 12, Math.max(48, icons.h) * Z + 8);
pv.fillRect(0, 0, pv.w, pv.h, [19, 22, 29], 1);
const drawPix = (src, ox, oy, z) => {
  for (let y = 0; y < src.h * z; y++) for (let x = 0; x < src.w * z; x++) {
    const ci = src.get(Math.floor(x / z), Math.floor(y / z));
    if (!ci) continue;
    pv.blend(ox + x, oy + y, src.palette[ci], 1);
  }
};
drawPix(slot, 4, 4, Z);
fs.writeFileSync(path.join(SHOTS, 'ui-preview.png'), encodeRGBA(pv.w, pv.h, toRGBA(pv)));

console.log(JSON.stringify({
  'ui_slot_frame.png': slotBytes, 'ui_slot_icons.png': iconBytes,
  ...fxBytes, 'ui_portrait_frame.png': pfBytes
}, null, 2));