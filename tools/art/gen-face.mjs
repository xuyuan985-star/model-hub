/* tools/art/gen-face.mjs — 从已有立绘生成对话头像（face_<id>.png，48×60 像素）。
   思路：立绘的 *_half 变体有真五官，裁头部区域 → BOX 降采样到 48×60 → 调色板量化 → 1px 墨色描边。
   输出为 PNG-8（colorType 3），落 web/game/assets/pixel/，由 art-check 登记进 manifest。零 npm 依赖。 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { encodeIndexed } from './png.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'web/game/assets/portrait');
const OUT = path.join(ROOT, 'web/game/assets/pixel');

// 头像框尺寸（逻辑像素），与 ART-SPEC 的 face 规格一致
const CW = 48, CH = 60;
// 立绘裁切框：头顶 bbox top≈127，头部宽约 392（ANCHOR.headH），中心 cx=512。
// 取 452×565 的小框，留一点肩部，保证降采样后脸占到画面 2/3。
const CROP = { x: 286, y: 100, w: 452, h: 565 };
const INK = [0x17, 0x1D, 0x29];   // 与像素精灵同一套墨色描边
// 量化上限留一格给描边墨色：art-check 要求每张像素图 ≤24 色（含透明位）
const MAX_COLORS = 22;
const ALPHA_CUT = 90;             // 立绘 tRNS 上限只有 109，必须按阈值二值化

/** 立绘里"有真五官"的变体优先；没有 half 的角色退回默认图（可能没脸，但至少不塌）。 */
const CARDS = [
  { id: 'observer', src: 'pt_observer_half' },
  { id: 'xi', src: 'pt_xi_half' },
  { id: 'jin', src: 'pt_jin_half' },
  { id: 'juan', src: 'pt_juan_half' },
  { id: 'mu', src: 'pt_mu_half' },
  { id: 'kai', src: 'pt_kai_half' }
];

// ---------- 最小 PNG 解码（只支持本工程用到的 8 位 索引/真彩/灰度 + tRNS）----------
function decodePNG(file) {
  const buf = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, idat = [], plte = null, trns = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8) throw new Error('只支持 8 位 PNG：' + file);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), off = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[off++];
    const line = Buffer.from(raw.subarray(off, off + stride)); off += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (ft === 1) v = (v + a) & 255;
      else if (ft === 2) v = (v + b) & 255;
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      line[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ct === 6) { out[o] = line[x * 4]; out[o + 1] = line[x * 4 + 1]; out[o + 2] = line[x * 4 + 2]; out[o + 3] = line[x * 4 + 3]; }
      else if (ct === 2) { out[o] = line[x * 3]; out[o + 1] = line[x * 3 + 1]; out[o + 2] = line[x * 3 + 2]; out[o + 3] = 255; }
      else if (ct === 3) { const i = line[x]; const al = trns && i < trns.length ? trns[i] : 255; out[o] = plte[i * 3]; out[o + 1] = plte[i * 3 + 1]; out[o + 2] = plte[i * 3 + 2]; out[o + 3] = al; }
      else { out[o] = out[o + 1] = out[o + 2] = line[x]; out[o + 3] = 255; }
    }
    prev = line;
  }
  return { w, h, data: out };
}

/** 区域平均降采样（BOX）：把源图一块矩形平均成一个目标像素，避免最近邻丢脸。 */
function boxDownsample(img, crop, cw, ch) {
  const out = new Float64Array(cw * ch * 4);
  const cnt = new Float64Array(cw * ch);
  for (let y = 0; y < crop.h; y++) {
    const sy = crop.y + y;
    if (sy < 0 || sy >= img.h) continue;
    const ty = Math.min(ch - 1, Math.floor(y * ch / crop.h));
    for (let x = 0; x < crop.w; x++) {
      const sx = crop.x + x;
      if (sx < 0 || sx >= img.w) continue;
      const tx = Math.min(cw - 1, Math.floor(x * cw / crop.w));
      const so = (sy * img.w + sx) * 4, to = (ty * cw + tx) * 4;
      const a = img.data[so + 3];
      // 只统计不透明像素，避免透明像素把颜色拉黑
      if (a < ALPHA_CUT) continue;
      out[to] += img.data[so]; out[to + 1] += img.data[so + 1]; out[to + 2] += img.data[so + 2];
      cnt[ty * cw + tx] += 1;
    }
  }
  const rgba = Buffer.alloc(cw * ch * 4);
  for (let i = 0; i < cw * ch; i++) {
    const n = cnt[i];
    if (!n) continue;
    rgba[i * 4] = Math.round(out[i * 4] / n);
    rgba[i * 4 + 1] = Math.round(out[i * 4 + 1] / n);
    rgba[i * 4 + 2] = Math.round(out[i * 4 + 2] / n);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

/** 中位切分量化到 <= maxColors（含透明 0 号），把颜色收敛成"像素画"用的有限色板。 */
function quantize(rgba, w, h, maxColors) {
  const hist = new Map();
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] === 0) continue;
    const k = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  let boxes = [{ list: [...hist.entries()].map(([k, n]) => ({ r: (k >> 16) & 255, g: (k >> 8) & 255, b: k & 255, n })) }];
  const boxRange = (bx) => {
    let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
    for (const e of bx.list) { if (e.r < r0) r0 = e.r; if (e.r > r1) r1 = e.r; if (e.g < g0) g0 = e.g; if (e.g > g1) g1 = e.g; if (e.b < b0) b0 = e.b; if (e.b > b1) b1 = e.b; }
    return [[r0, r1], [g0, g1], [b0, b1]];
  };
  const target = Math.max(2, maxColors) - 1;
  while (boxes.length < target) {
    let pick = -1, pickScore = -1, pickCh = 0;
    boxes.forEach((bx, i) => {
      if (bx.list.length < 2) return;
      const rg = boxRange(bx);
      let ch = 0, best = 0;
      rg.forEach((r, ci) => { const s = r[1] - r[0]; if (s > best) { best = s; ch = ci; } });
      if (best <= 0) return;
      const score = best * Math.log(2 + bx.list.length);
      if (score > pickScore) { pickScore = score; pick = i; pickCh = ch; }
    });
    if (pick < 0) break;
    const bx = boxes[pick];
    const field = ['r', 'g', 'b'][pickCh];
    bx.list.sort((p, q) => p[field] - q[field]);
    const total = bx.list.reduce((s, e) => s + e.n, 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < bx.list.length; i++) { acc += bx.list[i].n; if (acc >= total / 2) { cut = Math.min(bx.list.length - 1, Math.max(1, i + 1)); break; } }
    boxes.splice(pick, 1, { list: bx.list.slice(0, cut) }, { list: bx.list.slice(cut) });
  }
  const palette = [[0, 0, 0]];
  for (const bx of boxes) {
    let r = 0, g = 0, b = 0, s = 0;
    for (const e of bx.list) { r += e.r * e.n; g += e.g * e.n; b += e.b * e.n; s += e.n; }
    if (!s) continue;
    palette.push([Math.round(r / s), Math.round(g / s), Math.round(b / s)]);
  }
  const indices = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] === 0) { indices[i] = 0; continue; }
    let bd = Infinity, bi = 1;
    for (let p = 1; p < palette.length; p++) {
      const dr = palette[p][0] - rgba[i * 4], dg = palette[p][1] - rgba[i * 4 + 1], db = palette[p][2] - rgba[i * 4 + 2];
      const d = dr * dr * 0.9 + dg * dg * 1.1 + db * db * 0.8;
      if (d < bd) { bd = d; bi = p; }
    }
    indices[i] = bi;
  }
  return { indices, palette };
}

/** 1px 外描边：只给"邻接不透明像素"的透明格上墨色，让头像在任何底色上都立得住。 */
function outline(indices, palette, w, h) {
  const inkIdx = palette.length;
  if (palette.length < 256) palette.push(INK);
  const out = Uint8Array.from(indices);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (indices[i] !== 0) continue;
      let near = false;
      if (x > 0 && indices[i - 1] !== 0) near = true;
      else if (x < w - 1 && indices[i + 1] !== 0) near = true;
      else if (y > 0 && indices[i - w] !== 0) near = true;
      else if (y < h - 1 && indices[i + w] !== 0) near = true;
      if (near) out[i] = inkIdx;
    }
  }
  return out;
}

/** 裁掉四周多余透明行/列后再对齐：保证头顶贴近框顶、不浪费像素。 */
function fitTight(indices, palette, w, h) {
  let minY = h, maxY = -1, minX = w, maxX = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (indices[y * w + x] !== 0) { if (y < minY) minY = y; if (y > maxY) maxY = y; if (x < minX) minX = x; if (x > maxX) maxX = x; }
  }
  if (maxY < 0) return indices;
  // 垂直方向贴到 y=1（留 1px 给描边），水平居中
  const dy = 1 - minY;
  const dx = Math.round((w - (maxX - minX + 1)) / 2) - minX;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sy = y - dy, sx = x - dx;
      if (sy < 0 || sy >= h || sx < 0 || sx >= w) continue;
      out[y * w + x] = indices[sy * w + sx];
    }
  }
  return out;
}

function build(card) {
  const src = path.join(SRC, card.src + '.png');
  if (!fs.existsSync(src)) throw new Error('缺少立绘 ' + card.src + '.png');
  const img = decodePNG(src);
  const rgba = boxDownsample(img, CROP, CW, CH);
  const q = quantize(rgba, CW, CH, MAX_COLORS);
  let idx = q.indices;
  idx = fitTight(idx, q.palette, CW, CH);
  idx = outline(idx, q.palette, CW, CH);
  // 描边后再收一次透明：保证 tRNS 与调色板长度对齐
  const alpha = new Array(q.palette.length).fill(255);
  alpha[0] = 0;
  const buf = encodeIndexed(CW, CH, idx, q.palette, alpha);
  const out = path.join(OUT, 'face_' + card.id + '.png');
  fs.writeFileSync(out, buf);
  // 统计头顶/底部不透明 bbox，供 cast-check 断言
  let top = CH, bottom = -1;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (idx[y * CW + x] !== 0) { if (y < top) top = y; if (y > bottom) bottom = y; }
  return { id: card.id, file: path.basename(out), bytes: buf.length, colors: q.palette.length, top, bottom };
}

const rows = [];
for (const card of CARDS) {
  try { rows.push(build(card)); }
  catch (e) { console.log('FAIL ' + card.id + '：' + e.message); process.exitCode = 1; }
}
const total = rows.reduce((a, r) => a + r.bytes, 0);
for (const r of rows) console.log(`${r.id.padEnd(10)} ${String(r.bytes).padStart(5)} B  ${r.colors} 色  bbox y=${r.top}..${r.bottom}`);
console.log(`\n头像 ${rows.length} 张 / ${total} 字节 / ${CW}×${CH}`);
